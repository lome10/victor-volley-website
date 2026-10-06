/**
 * Imposta la password con il link ricevuto per email (funzione serverless Vercel, pubblica: chi chiama non è
 * loggato, la prova è il codice dell'invito).
 *
 * POST /api/imposta-password
 *   { "token": "<codice del link>", "soloVerifica": true }       → { valido: true, email }
 *   { "token": "<codice del link>", "password": "<nuova>" }      → { success: true, email }
 *
 * Il codice è casuale di 256 bit, quindi non indovinabile; vale una sola volta (lo si «consuma» in una
 * transazione, così due richieste insieme non lo usano due volte) e non ha scadenza. L'account deve esistere e
 * non essere di un dirigente. Se l'aggiornamento della password fallisce, il codice torna utilizzabile.
 */
const { getApp, stessaOrigine, safeJson } = require('./_firebase');
const I = require('./_invito-logic');

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}
const NON_VALIDO = 'Questo link non è valido o è già stato usato. Chiedi alla società di inviartene uno nuovo.';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Metodo non consentito.');
  }
  if (!stessaOrigine(req)) return fail(res, 403, 'Origine non consentita.');

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  if (!I.codiceValido(body.token)) return fail(res, 404, NON_VALIDO);
  const soloVerifica = body.soloVerifica === true;
  const password = body.password;
  if (!soloVerifica && (typeof password !== 'string' || password.length < 10 || password.length > 200)) {
    return fail(res, 400, 'La password deve avere almeno 10 caratteri.');
  }

  let app;
  try { app = getApp(); } catch (e) {
    console.error('[imposta-password] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }

  try {
    const db = app.firestore();
    const ref = db.collection('inviti').doc(I.impronta(body.token));

    if (soloVerifica) {
      const snap = await ref.get();
      if (!snap.exists || snap.data().stato !== 'attivo') return fail(res, 404, NON_VALIDO);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ valido: true, email: snap.data().email });
    }

    // consuma il codice (monouso) prima di toccare l'account
    const inv = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().stato !== 'attivo') return null;
      tx.update(ref, { stato: 'usato', usatoIl: new Date().toISOString() });
      return snap.data();
    });
    if (!inv) return fail(res, 404, NON_VALIDO);

    const rilascia = () => ref.update({ stato: 'attivo', usatoIl: null }).catch(() => {});
    try {
      const dirigente = await db.collection('dirigenti').doc(inv.uid).get();
      if (dirigente.exists) { await rilascia(); return fail(res, 404, NON_VALIDO); }
      await app.auth().updateUser(inv.uid, { password });
    } catch (e) {
      await rilascia();
      if (e && e.code === 'auth/user-not-found') return fail(res, 404, NON_VALIDO);
      throw e;
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, email: inv.email });
  } catch (e) {
    console.error('[imposta-password]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }
};
