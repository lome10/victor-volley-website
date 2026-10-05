/**
 * Imposta la password di un ATLETA (funzione serverless Vercel, sostituisce la
 * vecchia Cloud Function che richiedeva il piano Blaze di Firebase).
 *
 * POST /api/set-athlete-password
 *   Authorization: Bearer <ID token Firebase del dirigente>
 *   { "uid": "<uid atleta>", "password": "<nuova password>" }
 *
 * Controlli, nell'ordine:
 *   1. richiesta dallo stesso sito (Origin = Host), solo POST;
 *   2. ID token valido e non revocato;
 *   3. chi chiama è un DIRIGENTE (esiste dirigenti/{uid});
 *   4. il bersaglio è un ATLETA (esiste atleti/{uid}) e NON è un dirigente:
 *      le registrazioni via client sono aperte, quindi "essere loggati" non basta.
 *
 * Variabile d'ambiente richiesta su Vercel: FIREBASE_SERVICE_ACCOUNT, con il JSON
 * dell'account di servizio Firebase incollato per intero. Non va mai nel repository.
 */
const admin = require('firebase-admin');

function getApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT non configurata');
  const key = JSON.parse(raw);
  if (key.private_key) key.private_key = key.private_key.replace(/\\n/g, '\n');
  return admin.initializeApp({ credential: admin.credential.cert(key) });
}

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Metodo non consentito.');
  }

  const origin = req.headers.origin;
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch (e) { /* origin non valido */ }
    if (originHost !== req.headers.host) return fail(res, 403, 'Origine non consentita.');
  }

  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return fail(res, 401, 'Non autenticato.');

  let app;
  try { app = getApp(); } catch (e) {
    console.error('[set-athlete-password] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }

  let caller;
  try { caller = await app.auth().verifyIdToken(m[1], true); } catch (e) {
    return fail(res, 401, 'Sessione non valida: accedi di nuovo.');
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const uid = body.uid;
  const password = body.password;

  if (!uid || typeof uid !== 'string') return fail(res, 400, 'UID mancante.');
  if (!password || typeof password !== 'string' || password.length < 10) {
    return fail(res, 400, 'La password deve avere almeno 10 caratteri.');
  }

  try {
    const db = app.firestore();
    const [callerDoc, targetDoc, targetIsDirigente] = await Promise.all([
      db.collection('dirigenti').doc(caller.uid).get(),
      db.collection('atleti').doc(uid).get(),
      db.collection('dirigenti').doc(uid).get()
    ]);
    if (!callerDoc.exists) return fail(res, 403, 'Accesso negato.');
    if (!targetDoc.exists || targetIsDirigente.exists) return fail(res, 404, 'Atleta non trovato.');

    await app.auth().updateUser(uid, { password });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[set-athlete-password]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }
};

function safeJson(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
