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
 * A password salvata parte una seconda email di conferma («puoi accedere da /atleta»): è un di più, se non parte
 * (servizio email non configurato o in errore) la password resta impostata e l'esito per il genitore non cambia.
 */
const { getApp, stessaOrigine, safeJson } = require('./_firebase');
const I = require('./_invito-logic');
const { configEmail, inviaEmail } = require('./_email');

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}
const NON_VALIDO = 'Questo link non è valido o è già stato usato. Chiedi alla società di inviartene uno nuovo.';

/** Email di conferma al genitore: mai bloccante, non fa fallire l'impostazione della password. */
async function inviaConferma(db, inv) {
  try {
    const cfg = configEmail();
    if (!cfg.apiKey || !cfg.from) return;
    // tutti i figli collegati a questo account (accessUids), non solo la scheda da cui è partito l'invito
    const schede = await db.collection('atleti').where('accessUids', 'array-contains', inv.uid).get();
    let atleti = schede.docs.map((d) => d.data());
    if (!atleti.some((a) => a && a.nome)) {
      const una = inv.atletaUid ? await db.collection('atleti').doc(inv.atletaUid).get() : null;
      atleti = una && una.exists ? [una.data()] : [];
    }
    const sonoGenitore = (a) => (Array.isArray(a.accessi) ? a.accessi : []).some((x) => x && x.uid === inv.uid && x.ruolo === 'genitore');
    const figli = atleti.filter(sonoGenitore);
    const acc = (Array.isArray((figli[0] || {}).accessi) ? figli[0].accessi : []).find((x) => x && x.uid === inv.uid) || {};
    const nome = acc.prenome || acc.nome || '';
    const atletiNomi = figli.map((a) => ((a.nome || '') + ' ' + (a.cognome || '')).trim()).filter(Boolean)
      .sort((x, y) => x.localeCompare(y, 'it'));
    await inviaEmail(cfg, { email: inv.email, nome }, I.componiConferma({ nome, email: inv.email, atletiNomi }, cfg.site));
  } catch (e) {
    console.error('[imposta-password] email di conferma non inviata:', e && e.message);
  }
}

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

    await inviaConferma(db, inv);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, email: inv.email });
  } catch (e) {
    console.error('[imposta-password]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }
};
