/**
 * Presenze agli allenamenti, per l'ALLENATORE (funzione serverless Vercel).
 *
 * GET  /api/allenatore-presenze
 *   per ogni categoria del mister: i giorni di allenamento (i prossimi 7 e gli ultimi 60, dagli orari settimanali in
 *   `allenamenti`), gli atleti (solo id, cognome, nome) e le presenze già segnate.
 * POST /api/allenatore-presenze   { categoria, data, atletaId, stato }
 *   segna un atleta in una giornata: stato "p" presente, "a" assente, "" tolto.
 *   Authorization: Bearer <ID token Firebase dell'allenatore>
 *
 * Le presenze sono le risposte `presenze/{eventKey}_{atletaId}` (risposta "si"/"no"): le stesse che danno le giocatrici
 * dall'area atleti e i dirigenti dal pannello. Chi scrive per ultimo vince, quindi si possono sovrascrivere. Le scrive
 * questa funzione con i permessi del server: il mister non ha accesso diretto al database. Le giornate del vecchio
 * sistema (`presenzeAllenamento`) si leggono ancora, ma non si scrivono più.
 *
 * Controlli sulla scrittura: l'account è un allenatore attivo; la categoria è una delle sue; la data è un giorno in
 * cui quella categoria si allena davvero (dagli orari), non oltre 7 giorni avanti e non più vecchia di 60 giorni; l'atleta
 * appartiene a quella categoria; lo stato è uno dei tre ammessi.
 */
const { getApp, stessaOrigine, safeJson } = require('./_firebase');
const {
  categorieAllenatore, giorniAllenamento, oggiRoma, dataValida, STATI_PRESENZA,
  chiaveAllenamento, STATO_DA_RISPOSTA, RISPOSTA_DA_STATO
} = require('./_allenatore-logic');

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}

const gruppi = (lista, n) => {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'Metodo non consentito.');
  }
  if (!stessaOrigine(req)) return fail(res, 403, 'Origine non consentita.');

  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return fail(res, 401, 'Non autenticato.');

  let app;
  try { app = getApp(); } catch (e) {
    console.error('[allenatore-presenze] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }

  let caller;
  try { caller = await app.auth().verifyIdToken(m[1], true); } catch (e) {
    return fail(res, 401, 'Sessione non valida: accedi di nuovo.');
  }

  try {
    const db = app.firestore();
    const doc = await db.collection('allenatori').doc(caller.uid).get();
    const profilo = doc.exists ? doc.data() : null;
    const categorie = categorieAllenatore(profilo);
    if (!categorie) return fail(res, 403, 'Accesso negato.');

    const oggi = oggiRoma();
    const orariSnap = await Promise.all(gruppi(categorie, 10).map((g) => db.collection('allenamenti').where('categoria', 'in', g).get()));
    const orari = [];
    orariSnap.forEach((snap) => snap.docs.forEach((d) => orari.push({ ...d.data(), id: d.id })));

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
      const { categoria, data, atletaId } = body;
      const stato = body.stato === undefined || body.stato === null ? '' : body.stato;
      if (typeof categoria !== 'string' || !categorie.includes(categoria)) return fail(res, 403, 'Categoria non tua.');
      if (!dataValida(data)) return fail(res, 400, 'Data non valida.');
      if (!STATI_PRESENZA.includes(stato)) return fail(res, 400, 'Stato non valido.');
      if (typeof atletaId !== 'string' || !atletaId || atletaId.includes('/')) return fail(res, 400, 'Atleta non valido.');
      const allenamenti = giorniAllenamento(orari, categoria, oggi).filter((g) => g.data === data);
      if (!allenamenti.length) {
        return fail(res, 400, 'In quel giorno la squadra non si allena (o è troppo lontano).');
      }
      const atleta = await db.collection('atleti').doc(atletaId).get();
      if (!atleta.exists || atleta.data().categoria !== categoria) return fail(res, 403, 'Atleta non di questa categoria.');

      // Stessa risposta "ci sarò / non ci sarò" che danno giocatrici e dirigenti: l'ultima scritta vince.
      const adesso = new Date().toISOString();
      await Promise.all(allenamenti.map((g) => {
        const eventKey = chiaveAllenamento(g.orarioId, data);
        const ref = db.collection('presenze').doc(eventKey + '_' + atletaId);
        if (!stato) return ref.delete();
        return ref.set({
          eventKey, tipo: 'allenamento', eventoId: g.orarioId, data, categoria, atletaId,
          risposta: RISPOSTA_DA_STATO[stato], rispostaDa: caller.uid, rispostaIl: adesso
        });
      }));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true });
    }

    const risultato = [];
    for (const categoria of categorie) {
      const [atletiSnap, rispostaSnap, giornateSnap] = await Promise.all([
        db.collection('atleti').where('categoria', '==', categoria).get(),
        db.collection('presenze').where('categoria', '==', categoria).where('tipo', '==', 'allenamento').get(),
        db.collection('presenzeAllenamento').where('categoria', '==', categoria).get()
      ]);
      const atleti = atletiSnap.docs
        .map((d) => ({ id: d.id, cognome: String(d.data().cognome || '').trim(), nome: String(d.data().nome || '').trim() }))
        .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
      const presenze = {};
      // Prima le giornate segnate col vecchio sistema, poi le risposte (la più recente per giorno e atleta vince).
      giornateSnap.docs.forEach((d) => { const x = d.data(); if (x.data && x.segnate) presenze[x.data] = { ...x.segnate }; });
      const recente = {};
      rispostaSnap.docs.forEach((d) => {
        const x = d.data();
        const stato = STATO_DA_RISPOSTA[x.risposta];
        if (!x.data || !x.atletaId || !stato) return;
        const k = x.data + '|' + x.atletaId;
        if (recente[k] && recente[k] > String(x.rispostaIl || '')) return;
        recente[k] = String(x.rispostaIl || '');
        (presenze[x.data] = presenze[x.data] || {})[x.atletaId] = stato;
      });
      risultato.push({ categoria, giorni: giorniAllenamento(orari, categoria, oggi), atleti, presenze });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ oggi, categorie: risultato });
  } catch (e) {
    console.error('[allenatore-presenze]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }
};
