/**
 * Imposta la password con il link ricevuto per email (funzione serverless Vercel, pubblica: chi chiama non è
 * loggato, la prova è il codice dell'invito).
 *
 * POST /api/imposta-password
 *   { "token": "<codice del link>", "soloVerifica": true }       → { valido: true, email }
 *   { "token": "<codice del link>", "password": "<nuova>" }      → { success: true, email }
 *
 * Il codice è casuale di 256 bit, quindi non indovinabile; vale una sola volta (lo si «consuma» in una
 * transazione, così due richieste insieme non lo usano due volte) e vale 7 giorni dall'invio (creatoIl). L'account deve esistere e
 * non essere di un dirigente. Se l'aggiornamento della password fallisce, il codice torna utilizzabile.
 * A password salvata parte una seconda email di conferma («puoi accedere da /atleta»): è un di più, se non parte
 * (servizio email non configurato o in errore) la password resta impostata e l'esito per il genitore non cambia.
 *
 * Recupero password («Password dimenticata?», VVW-28):
 *   { "richiediReset": "<email>" }                               → { ok: true }  (sempre, esista o no l'account)
 * Se l'email è di un account di Firebase Auth (non dirigente, non @victorvolley) crea un invito di tipo 'reset'
 * (stessa tabella inviti/{impronta}, codice monouso nel frammento #t=, valido RESET_ORE ore) e manda la email in
 * italiano con la veste del sito; poi il link passa dalla stessa pagina /imposta-password e dallo stesso ramo
 * «token + password» di qui sopra. Una richiesta ogni 2 minuti per account, 10 ogni 15 minuti per IP; i link di
 * reset precedenti non ancora usati vengono revocati, gli inviti no. Se Brevo non risponde non resta nessun link.
 */
const { getApp, stessaOrigine, safeJson } = require('./_firebase');
const I = require('./_invito-logic');
const { configEmail, inviaEmail } = require('./_email');
const { emailValida } = require('./_promemoria-logic');

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}
/* Limite ai tentativi sbagliati, per indirizzo IP, in una finestra di 15 minuti. Sta nella memoria dell'istanza della
   funzione: su serverless non è garantito (altre istanze, riavvii), è un freno in più oltre ai 256 bit del codice. */
const FINESTRA_MS = 15 * 60 * 1000, MAX_FALLITI = 20;
const falliti = new Map();
function ipDi(req) { return String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'sconosciuto').split(',')[0].trim(); }
function troppiFalliti(ip) {
  const adesso = Date.now(), v = falliti.get(ip);
  if (!v || adesso - v.inizio > FINESTRA_MS) return false;
  return v.n >= MAX_FALLITI;
}
function registraFallito(ip) {
  const adesso = Date.now(), v = falliti.get(ip);
  if (!v || adesso - v.inizio > FINESTRA_MS) {
    if (falliti.size > 5000) falliti.clear();
    falliti.set(ip, { inizio: adesso, n: 1 });
  } else v.n++;
}
const NON_VALIDO = 'Questo link non è valido o è già stato usato. Chiedi alla società di inviartene uno nuovo.';

/* Richieste di reset per IP (stessa nota di sopra: memoria dell'istanza, freno in più oltre al limite per account). */
const MAX_RICHIESTE = 10, INTERVALLO_RESET_MS = 2 * 60 * 1000;
const richieste = new Map();
function troppeRichieste(ip) {
  const adesso = Date.now(), v = richieste.get(ip);
  if (!v || adesso - v.inizio > FINESTRA_MS) {
    if (richieste.size > 5000) richieste.clear();
    richieste.set(ip, { inizio: adesso, n: 1 });
    return false;
  }
  v.n++;
  return v.n > MAX_RICHIESTE;
}
const durataDi = (inv) => (inv && inv.tipo === 'reset' ? I.RESET_ORE : undefined);

/** «Password dimenticata?»: risponde sempre allo stesso modo, così non si scopre chi è registrato. */
async function richiediReset(req, res, body) {
  if (troppeRichieste(ipDi(req))) return fail(res, 429, 'Troppe richieste: riprova tra qualche minuto.');
  const email = String(body.richiediReset || '').trim().toLowerCase();
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Scrivi un indirizzo email valido.');
  const cfg = configEmail();
  if (!cfg.apiKey || !cfg.from) return fail(res, 503, 'Servizio email non configurato sul server.');
  let app;
  try { app = getApp(); } catch (e) {
    console.error('[imposta-password] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }
  try {
    if (emailValida(email)) {
      let uid = null;
      try { uid = (await app.auth().getUserByEmail(email)).uid; } catch (e) { if (!e || e.code !== 'auth/user-not-found') throw e; }
      const db = app.firestore();
      if (uid && !(await db.collection('dirigenti').doc(uid).get()).exists) {
        const mie = (await db.collection('inviti').where('uid', '==', uid).where('tipo', '==', 'reset').get()).docs;
        const recente = mie.some((d) => d.data().stato === 'attivo' && Date.now() - Date.parse(d.data().creatoIl) < INTERVALLO_RESET_MS);
        if (!recente) {
          const codice = I.nuovoCodice(), id = I.impronta(codice);
          const ref = db.collection('inviti').doc(id);
          await ref.set({ uid, email, tipo: 'reset', stato: 'attivo', creatoIl: new Date().toISOString() });
          try {
            await inviaEmail(cfg, { email }, I.componiReset({ email }, I.linkInvito(cfg.site, codice), cfg.site));
          } catch (e) {
            await ref.delete().catch(() => {});
            throw e;
          }
          const batch = db.batch();
          mie.filter((d) => d.data().stato === 'attivo').forEach((d) => batch.update(d.ref, { stato: 'revocato', revocatoIl: new Date().toISOString() }));
          await batch.commit();
        }
      }
    }
  } catch (e) {
    console.error('[imposta-password] reset non inviato:', e && e.code, e && e.message);
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
}

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
  if (typeof body.richiediReset === 'string') return richiediReset(req, res, body);

  const ip = ipDi(req);
  if (troppiFalliti(ip)) return fail(res, 429, 'Troppi tentativi: riprova tra qualche minuto.');
  if (!I.codiceValido(body.token)) { registraFallito(ip); return fail(res, 404, NON_VALIDO); }
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
      if (!snap.exists || snap.data().stato !== 'attivo' || I.scaduto(snap.data().creatoIl, undefined, durataDi(snap.data()))) { registraFallito(ip); return fail(res, 404, NON_VALIDO); }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ valido: true, email: snap.data().email });
    }

    // consuma il codice (monouso) prima di toccare l'account
    const inv = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().stato !== 'attivo' || I.scaduto(snap.data().creatoIl, undefined, durataDi(snap.data()))) return null;
      tx.update(ref, { stato: 'usato', usatoIl: new Date().toISOString() });
      return snap.data();
    });
    if (!inv) { registraFallito(ip); return fail(res, 404, NON_VALIDO); }

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
