/**
 * Firma per caricare un'immagine su Cloudinary (funzione serverless Vercel). Lanciata dal pannello admin
 * (js/photodb.js) subito prima di ogni caricamento.
 *
 * POST /api/cloudinary-firma
 *   Authorization: Bearer <ID token Firebase del dirigente>
 *   risposta: { apiKey, timestamp, signature, uploadPreset }
 *
 * Controlli: stessa origine, ID token valido, chiamante dirigente. Il server decide da solo cosa firma
 * (timestamp attuale + preset): il chiamante non può chiedere altro. La chiave segreta sta solo in
 * CLOUDINARY_API_SECRET (variabile su Vercel), mai nel codice e mai nelle risposte.
 * Senza CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET risponde 503 con codice "chiavi-mancanti": il pannello
 * allora carica come prima, col preset senza firma.
 */
const { getApp, stessaOrigine } = require('./_firebase');
const C = require('./_cloudinary-logic');

function fail(res, status, message, codice) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(codice ? { error: message, codice } : { error: message });
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
    console.error('[cloudinary-firma] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }

  let caller;
  try { caller = await app.auth().verifyIdToken(m[1], true); } catch (e) {
    return fail(res, 401, 'Sessione non valida: accedi di nuovo.');
  }

  try {
    const callerDoc = await app.firestore().collection('dirigenti').doc(caller.uid).get();
    if (!callerDoc.exists) return fail(res, 403, 'Accesso negato.');
  } catch (e) {
    console.error('[cloudinary-firma]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !secret) return fail(res, 503, 'Chiavi Cloudinary mancanti sul server.', 'chiavi-mancanti');

  const p = C.parametriCaricamento(process.env);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ apiKey, timestamp: p.timestamp, signature: C.firma(p, secret), uploadPreset: p.upload_preset });
};
