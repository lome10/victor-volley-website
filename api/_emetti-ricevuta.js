/**
 * Emette una ricevuta di pagamento con il NUMERO assegnato dal server (funzione serverless Vercel).
 * Prima il numero lo calcolava il browser (contatoriRicevute scrivibile da qualunque dirigente): ora lo assegna solo
 * questa funzione, con l'account di servizio, dentro una transazione. Le regole di Firestore (da pubblicare DOPO il
 * codice) negheranno al browser la scrittura di contatoriRicevute e la creazione di ricevute.
 *
 * (Su Vercel Hobby le funzioni sono max 12: questo file ha il _ davanti e lo serve api/invia-ricevuta.js; vercel.json riscrive
 * /api/emetti-ricevuta -> /api/invia-ricevuta?azione=emetti, quindi l'URL per il pannello non cambia.)
 * POST /api/emetti-ricevuta
 *   Authorization: Bearer <ID token Firebase del dirigente>
 *   { chiave?, data, importo, tipoIncasso, causale, modalita, riferimento, note, atletaId, rateIds, pagatore, atleta }
 *   → 200 { id, ricevuta }   la ricevuta com'è salvata (numero, anno, progressivo, stato, createdAt, asd, bollo, emessaDa)
 *
 * Controlli: stessa origine, ID token valido, chiamante dirigente con ruolo master/presidente/segreteria, dati validi.
 * Lo STABILISCE il server (mai il browser): anno, progressivo, numero, stato «valida», data di creazione, chi l'ha emessa,
 * i Dati ASD e la firma (da settings/asd e firme/presidente) e la dicitura del bollo.
 * Numerazione: ultimo+1 dal contatore dell'anno (parte dal valore che c'è, non si azzera); se quel numero esistesse già
 * (contatore indietro) si prende il primo libero invece di fallire. `chiave` (facoltativa) rende l'invio ripetibile senza
 * doppioni: lo stesso codice restituisce la ricevuta già emessa.
 */
const { getApp, stessaOrigine, safeJson } = require('./_firebase');
const { puoGestireAtleti } = require('./_ruolo');

const TIPI = ['Quota associativa', 'Quota corso / attività sportiva', 'Contributo liberale', 'Tesseramento / assicurazione', 'Materiale / abbigliamento', 'Altro'];
const MODALITA = ['Bonifico', 'POS / carta', 'Assegno non trasferibile', 'Contanti', 'Altro tracciabile'];
const ASD_DEFAULT = {
  denominazione: 'ASD Victor Volley', codiceFiscale: '', sede: 'Via Indipendenza 48, Racale (LE)', affiliazione: 'FIPAV',
  codiceAffiliazione: '', rasd: true, luogo: 'Racale', presidente: 'Cuna Matteo'
};
const BOLLO_ESENTE = 'Esente dall’imposta di bollo ai sensi dell’art. 27-bis, Tabella allegato B, D.P.R. 642/1972.';
const SOGLIA_BOLLO = 77.47;
const MAX_IMPORTO = 1000000;

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}
const pad4 = (n) => ('0000' + n).slice(-4);
const testo = (v, max) => (typeof v === 'string' ? v.trim() : '').slice(0, max);

function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2100;
}

function bollo(importo, rasd) {
  if (rasd) return BOLLO_ESENTE;
  return importo > SOGLIA_BOLLO
    ? 'Imposta di bollo di € 2,00 da assolvere (importo superiore a € 77,47).'
    : 'Imposta di bollo non dovuta (importo non superiore a € 77,47).';
}

/** Più emissioni insieme si contendono il contatore: Firestore ne annulla qualcuna («ABORTED», nulla è stato scritto). Si riprova
 *  con una breve pausa casuale; la `chiave` evita doppioni se un tentativo fosse arrivato a destinazione. */
async function conRiprove(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const contesa = e && (e.code === 10 || e.code === 'aborted' || /ABORTED|lock timeout|contention/i.test(String(e.message)));
      if (!contesa || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, 80 + Math.random() * 250 * (i + 1)));
    }
  }
}

/** Valida e ripulisce i dati arrivati dal browser. Ritorna { dati } oppure { errore }. */
function pulisci(b) {
  if (!dataValida(b.data)) return { errore: 'Inserisci la data della ricevuta.' };
  const importo = Math.round((Number(b.importo) || 0) * 100) / 100;
  if (!(importo > 0) || importo > MAX_IMPORTO) return { errore: 'Inserisci un importo maggiore di zero.' };
  if (TIPI.indexOf(b.tipoIncasso) === -1) return { errore: 'Tipo di incasso non valido.' };
  if (MODALITA.indexOf(b.modalita) === -1) return { errore: 'Modalità di pagamento non valida.' };
  const causale = testo(b.causale, 500);
  if (!causale) return { errore: 'Inserisci la causale / periodo.' };
  const p = b.pagatore && typeof b.pagatore === 'object' ? b.pagatore : {};
  const nome = testo(p.nome, 150);
  if (!nome) return { errore: 'Inserisci il nome del pagatore.' };
  const cf = testo(p.cf, 40).toUpperCase().replace(/\s+/g, '');
  if (cf && !/^[A-Z0-9]{16}$/.test(cf)) return { errore: 'Il codice fiscale del pagatore deve avere 16 caratteri (o lascialo vuoto).' };
  let atletaId = null;
  if (b.atletaId != null && b.atletaId !== '') {
    if (typeof b.atletaId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(b.atletaId)) return { errore: 'Atleta non valido.' };
    atletaId = b.atletaId;
  }
  let atleta = null;
  if (atletaId && b.atleta && typeof b.atleta === 'object') {
    atleta = { nome: testo(b.atleta.nome, 150), cf: testo(b.atleta.cf, 40), dataNascita: testo(b.atleta.dataNascita, 10) };
  }
  const rateIds = Array.isArray(b.rateIds) ? b.rateIds.filter((x) => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x)).slice(0, 60) : [];
  return {
    dati: {
      data: b.data, importo, tipoIncasso: b.tipoIncasso, causale, modalita: b.modalita,
      riferimento: testo(b.riferimento, 200), note: testo(b.note, 2000),
      atletaId, rateIds,
      pagatore: { nome, cf, indirizzo: testo(p.indirizzo, 300), ruolo: testo(p.ruolo, 80) || 'Pagatore' },
      atleta
    }
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Metodo non consentito.');
  }
  if (!stessaOrigine(req)) return fail(res, 403, 'Origine non consentita.');

  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return fail(res, 401, 'Non autenticato.');

  let app;
  try { app = getApp(); } catch (e) {
    console.error('[emetti-ricevuta] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }

  let caller;
  try { caller = await app.auth().verifyIdToken(m[1], true); } catch (e) {
    return fail(res, 401, 'Sessione non valida: accedi di nuovo.');
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const chiave = typeof body.chiave === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.chiave) ? body.chiave : null;
  const pul = pulisci(body);
  if (pul.errore) return fail(res, 400, pul.errore);
  const dati = pul.dati;

  try {
    const db = app.firestore();
    const callerDoc = await db.collection('dirigenti').doc(caller.uid).get();
    if (!callerDoc.exists || !puoGestireAtleti(callerDoc)) return fail(res, 403, 'Accesso negato.');
    const dd = callerDoc.data() || {};
    const emessaDa = ((dd.nome || '') + ' ' + (dd.cognome || '')).trim() || dd.email || caller.email || '';

    if (dati.atletaId) {
      const at = await db.collection('atleti').doc(dati.atletaId).get();
      if (!at.exists) return fail(res, 404, 'Atleta non trovato.');
    }

    /* Dati ASD e firma: dal server, non dal browser (stessi valori predefiniti del pannello). */
    const [asdDoc, firmaDoc] = await Promise.all([db.collection('settings').doc('asd').get(), db.collection('firme').doc('presidente').get()]);
    const asd = Object.assign({}, ASD_DEFAULT, asdDoc.exists ? asdDoc.data() : {});
    const firmaImg = firmaDoc.exists ? String((firmaDoc.data() || {}).img || '') : '';
    const asdRic = {
      denominazione: String(asd.denominazione || ''), codiceFiscale: String(asd.codiceFiscale || ''), sede: String(asd.sede || ''),
      affiliazione: String(asd.affiliazione || ''), codiceAffiliazione: String(asd.codiceAffiliazione || ''), rasd: !!asd.rasd,
      luogo: String(asd.luogo || ''), presidente: String(asd.presidente || ''),
      firma: /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firmaImg) ? firmaImg : ''
    };

    const anno = +dati.data.slice(0, 4);
    const cref = db.collection('contatoriRicevute').doc(String(anno));
    const richiesta = chiave ? db.collection('ricevuteRichieste').doc(chiave) : null;

    const risultato = await conRiprove(() => db.runTransaction(async (tx) => {
      /* tutte le letture prima delle scritture */
      if (richiesta) {
        const gia = await tx.get(richiesta);
        if (gia.exists) {
          const g = await tx.get(db.collection('ricevute').doc(String(gia.data().id)));
          if (g.exists) return { id: g.id, ricevuta: g.data(), ripetuta: true };
        }
      }
      const c = await tx.get(cref);
      let n = (c.exists ? (+c.data().ultimo || 0) : 0) + 1;
      let rref = null;
      for (let i = 0; i < 50; i++) {
        rref = db.collection('ricevute').doc(anno + '_' + pad4(n));
        const ex = await tx.get(rref);
        if (!ex.exists) break;
        n++;
        rref = null;
      }
      if (!rref) throw new Error('numerazione non allineata');
      const doc = Object.assign({}, dati, {
        bollo: bollo(dati.importo, asdRic.rasd), asd: asdRic, emessaDa,
        anno, progressivo: n, numero: anno + '/' + pad4(n), stato: 'valida', createdAt: new Date().toISOString()
      });
      tx.set(cref, { ultimo: n });
      tx.set(rref, doc);
      if (richiesta) tx.set(richiesta, { id: rref.id, da: caller.uid, il: doc.createdAt });
      return { id: rref.id, ricevuta: doc, ripetuta: false };
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ id: risultato.id, ricevuta: risultato.ricevuta, ripetuta: risultato.ripetuta });
  } catch (e) {
    console.error('[emetti-ricevuta]', e && e.code, e && e.message);
    return fail(res, 500, 'Non sono riuscito a emettere la ricevuta: riprova tra poco. Se si ripete, contatta chi gestisce il sito.');
  }
};

