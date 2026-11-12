/**
 * Manda alla famiglia la ricevuta in PDF (funzione serverless Vercel). Lanciata dal registro ricevute subito dopo
 * l'emissione, e dal pulsante «Rimanda via email».
 *
 * POST /api/invia-ricevuta
 *   Authorization: Bearer <ID token Firebase del dirigente>
 *   { "ricevutaId": "2026_0001", "rimanda": false }
 *   { "esempio": true }   invio di PROVA: ricevuta d'esempio (numero ESEMPIO, dati finti, Dati ASD e firma veri) SOLO
 *       all'email del dirigente che chiama (letta dal suo token: non si accetta nessun altro indirizzo, anche se
 *       inviato). Non scrive sulle ricevute e non consuma numeri; lascia una voce nel Log (auditLog).
 *
 * Controlli: stessa origine, ID token valido, chiamante dirigente, ricevuta esistente e VALIDA (le annullate non si
 * mandano). Destinatari: genitori collegati all'atleta della ricevuta con email vera (altrimenti l'atleta stesso).
 * Senza atleta o senza indirizzi non parte nulla e lo dice (motivo). Idempotente: se la ricevuta risulta già inviata
 * e non si chiede «rimanda», non rispedisce. Su ricevute/{id} scrive il campo emailInviata (ultimo invio) e aggiunge
 * una riga al registro emailInvii (data, chi, destinatari mascherati; ultime 50): solo il server.
 */
const fs = require('fs');
const path = require('path');
const { getApp, stessaOrigine, safeJson } = require('./_firebase');
const { configEmail, inviaEmail } = require('./_email');
const { oggiRoma } = require('./_promemoria-logic');
const { creaPdf } = require('./_ricevuta-pdf');
const R = require('./_ricevuta-logic');
const { puoGestireAtleti } = require('./_ruolo');
const emettiRicevuta = require('./_emetti-ricevuta');

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}
const mask = (e) => e.replace(/^(.).*@(.).*(\..+)$/, '$1***@$2***$3');

module.exports = async function handler(req, res) {
  /* /api/emetti-ricevuta è riscritto qui da vercel.json (limite di 12 funzioni): stesso controllo di token e ruolo, nel suo file. */
  if (/[?&]azione=emetti(&|$)/.test(req.url || '')) return emettiRicevuta(req, res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Metodo non consentito.');
  }
  if (!stessaOrigine(req)) return fail(res, 403, 'Origine non consentita.');

  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return fail(res, 401, 'Non autenticato.');

  const cfg = configEmail();
  if (!cfg.apiKey || !cfg.from) return fail(res, 503, 'Servizio email non configurato sul server.');

  let app;
  try { app = getApp(); } catch (e) {
    console.error('[invia-ricevuta] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }

  let caller;
  try { caller = await app.auth().verifyIdToken(m[1], true); } catch (e) {
    return fail(res, 401, 'Sessione non valida: accedi di nuovo.');
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const esempio = body.esempio === true;
  const id = body.ricevutaId;
  if (!esempio && (!id || typeof id !== 'string' || !/^[A-Za-z0-9_-]{3,40}$/.test(id))) return fail(res, 400, 'Ricevuta mancante.');

  try {
    const db = app.firestore();
    const callerDoc = await db.collection('dirigenti').doc(caller.uid).get();
    if (!callerDoc.exists || !puoGestireAtleti(callerDoc)) return fail(res, 403, 'Accesso negato.');
    const logo = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo.png'));
    const [gg, mm, aa] = oggiRoma().split('-').reverse();

    if (esempio) {
      /* Destinatario = l'email del chiamante (token verificato): niente indirizzi scelti dal client. */
      const a = String(caller.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) || a.length > 120) return fail(res, 400, 'Il tuo account non ha un indirizzo email valido: non posso mandare la prova.');
      const [asdDoc, firmaDoc] = await Promise.all([db.collection('settings').doc('asd').get(), db.collection('firme').doc('presidente').get()]);
      const asd = asdDoc.exists ? asdDoc.data() : {};
      const ex = {
        numero: 'ESEMPIO', data: oggiRoma(), importo: 150, stato: 'valida', tipoIncasso: 'Quota associativa',
        causale: 'ESEMPIO — non è una ricevuta valida', modalita: 'Bonifico', riferimento: '', bollo: asd.rasd ? 'Esente' : '',
        pagatore: { nome: 'ROSSI MARIO (esempio)', cf: '', indirizzo: '', ruolo: 'Genitore / tutore' },
        atleta: { nome: 'Rossi Luca (esempio)', cf: '', dataNascita: '' },
        asd: { denominazione: asd.denominazione, codiceFiscale: asd.codiceFiscale, sede: asd.sede || '', affiliazione: asd.affiliazione || '',
          codiceAffiliazione: asd.codiceAffiliazione || '', rasd: !!asd.rasd, luogo: asd.luogo || '', presidente: asd.presidente || '',
          firma: firmaDoc.exists ? (firmaDoc.data().img || '') : '' }
      };
      const pdfEs = await creaPdf(ex, { logo, oggi: gg + '/' + mm + '/' + aa });
      const msg = R.componiEmailRicevuta(ex, { nome: '' }, cfg.site);
      msg.subject = '[ESEMPIO] ' + msg.subject;
      msg.attachment = [{ name: 'Ricevuta-ESEMPIO.pdf', content: Buffer.from(pdfEs).toString('base64') }];
      try { await inviaEmail(cfg, { email: a }, msg); } catch (e) {
        console.error('[invia-ricevuta] esempio fallito:', e.message);
        return fail(res, 502, 'L’email non è partita (servizio di invio): riprova tra poco.');
      }
      /* Una traccia nel Log: chi ha mandato la prova e a quale indirizzo (mascherato). Se non si scrive, l'email è già partita. */
      try {
        const dd = callerDoc.data() || {};
        await db.collection('auditLog').add({
          timestamp: new Date(), dirigenteId: caller.uid, dirigenteNome: ((dd.nome || '') + ' ' + (dd.cognome || '')).trim() || a,
          entita: 'ricevuta', entitaId: 'ESEMPIO', entitaLabel: 'Ricevuta di esempio (invio di prova)', azione: 'update',
          campi: [{ campo: 'email di prova', prima: null, dopo: 'inviata a ' + mask(a) }]
        });
      } catch (e) { console.error('[invia-ricevuta] log della prova non scritto:', e.message); }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ inviata: true, a: [a], esempio: true });
    }

    const ricDoc = await db.collection('ricevute').doc(id).get();
    if (!ricDoc.exists) return fail(res, 404, 'Ricevuta non trovata.');
    const r = ricDoc.data();
    if (r.stato !== 'valida') return fail(res, 409, 'La ricevuta è annullata: non si invia.');

    res.setHeader('Cache-Control', 'no-store');
    if (r.emailInviata && body.rimanda !== true) return res.status(200).json({ inviata: false, motivo: 'gia-inviata' });
    if (!r.atletaId) return res.status(200).json({ inviata: false, motivo: 'nessun-atleta' });
    const atletaDoc = await db.collection('atleti').doc(r.atletaId).get();
    const dest = atletaDoc.exists ? R.destinatariRicevuta(atletaDoc.data()) : [];
    if (!dest.length) return res.status(200).json({ inviata: false, motivo: 'nessun-destinatario' });

    const pdf = await creaPdf(r, { logo, oggi: gg + '/' + mm + '/' + aa });
    const allegato = [{ name: 'Ricevuta-' + String(r.numero || id).replace('/', '-') + '.pdf', content: Buffer.from(pdf).toString('base64') }];

    const esiti = await Promise.all(dest.map(async (d) => {
      try { await inviaEmail(cfg, d, Object.assign(R.componiEmailRicevuta(r, d, cfg.site), { attachment: allegato })); return { d, ok: true }; }
      catch (e) { console.error('[invia-ricevuta] invio fallito:', e.message); return { d, ok: false }; }
    }));
    const riusciti = esiti.filter((x) => x.ok);
    if (!riusciti.length) return fail(res, 502, 'L’email non è partita (servizio di invio): riprova tra poco.');

    const voce = { il: new Date().toISOString(), a: riusciti.map((x) => mask(x.d.email)), da: caller.uid };
    await ricDoc.ref.update({
      emailInviata: voce,
      emailInvii: (Array.isArray(r.emailInvii) ? r.emailInvii : []).concat([Object.assign({ rimando: body.rimanda === true, falliti: esiti.length - riusciti.length }, voce)]).slice(-50)
    });
    return res.status(200).json({ inviata: true, a: riusciti.map((x) => x.d.email), falliti: esiti.length - riusciti.length });
  } catch (e) {
    console.error('[invia-ricevuta]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }
};
