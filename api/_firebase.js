/** Admin SDK di Firebase con l'account di servizio in FIREBASE_SERVICE_ACCOUNT (variabile d'ambiente su Vercel). */
const admin = require('firebase-admin');

function getApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT non configurata');
  const key = JSON.parse(raw);
  if (key.private_key) key.private_key = key.private_key.replace(/\\n/g, '\n');
  return admin.initializeApp({ credential: admin.credential.cert(key) });
}

/** Stessa origine (Origin = Host) o nessun Origin: blocca le richieste da altri siti. */
function stessaOrigine(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

module.exports = { getApp, stessaOrigine, safeJson };
