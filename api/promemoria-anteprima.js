/**
 * Anteprima dei promemoria che partiranno DOMANI mattina (funzione serverless Vercel, per i dirigenti): serve a
 * correggere in tempo i pagamenti non ancora registrati o a sospendere i promemoria di una rata.
 *
 * GET /api/promemoria-anteprima
 *   Authorization: Bearer <ID token Firebase del dirigente>
 *
 * Usa lo stesso calcolo del job giornaliero (api/_promemoria-calcolo.js) per il giorno dopo: niente indirizzi email
 * nella risposta, solo il numero di destinatari. Non scrive nulla e non invia nulla.
 */
const { getApp, stessaOrigine } = require('./_firebase');
const L = require('./_promemoria-logic');
const { calcolaDaInviare } = require('./_promemoria-calcolo');

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(res, 405, 'Metodo non consentito.');
  }
  if (!stessaOrigine(req)) return fail(res, 403, 'Origine non consentita.');
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return fail(res, 401, 'Non autenticato.');

  let app;
  try { app = getApp(); } catch (e) {
    console.error('[promemoria-anteprima] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }
  let caller;
  try { caller = await app.auth().verifyIdToken(m[1], true); } catch (e) {
    return fail(res, 401, 'Sessione non valida: accedi di nuovo.');
  }

  try {
    const db = app.firestore();
    const dirigente = await db.collection('dirigenti').doc(caller.uid).get();
    if (!dirigente.exists) return fail(res, 403, 'Accesso negato.');

    const giorno = L.aggiungiGiorni(L.oggiRoma(), 1);
    const { gruppi } = await calcolaDaInviare(db, giorno);

    /* un elemento per promemoria (non per destinatario), con quante caselle lo ricevono */
    const perChiave = new Map();
    gruppi.forEach((g) => g.voci.forEach((v) => {
      if (!perChiave.has(v.chiave)) {
        perChiave.set(v.chiave, {
          chiave: v.chiave, tipo: v.tipo, livello: v.livello, atletaId: v.atletaId, atletaNome: v.atletaNome,
          rataId: v.rataId || null, testo: v.testo, destinatari: 0
        });
      }
      perChiave.get(v.chiave).destinatari++;
    }));
    const promemoria = [...perChiave.values()].sort((a, b) => a.atletaNome.localeCompare(b.atletaNome, 'it') || a.chiave.localeCompare(b.chiave));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ giorno, email: gruppi.length, promemoria });
  } catch (e) {
    console.error('[promemoria-anteprima]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }
};
