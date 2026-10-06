/**
 * Invia a un genitore l'email con il link per scegliere la password (funzione serverless Vercel).
 *
 * POST /api/invia-invito
 *   Authorization: Bearer <ID token Firebase del dirigente>
 *   { "atletaUid": "<id scheda atleta>", "uid": "<uid dell'account genitore>" }
 *
 * Controlli: stessa origine, ID token valido, chiamante dirigente, il bersaglio è un GENITORE collegato a quella
 * scheda (mai un dirigente) con email reale. Il codice del link è casuale (256 bit), monouso e senza scadenza;
 * su Firestore (inviti/{impronta}) resta solo l'impronta. Un nuovo invito revoca i precedenti non ancora usati.
 * Se l'email non parte, l'invito appena creato viene cancellato. Usa le variabili di api/_email.js.
 */
const { getApp, stessaOrigine, safeJson } = require('./_firebase');
const { configEmail, inviaEmail } = require('./_email');
const { emailValida } = require('./_promemoria-logic');
const I = require('./_invito-logic');

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}

module.exports = async function handler(req, res) {
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
    console.error('[invia-invito] configurazione:', e.message);
    return fail(res, 500, 'Funzione non configurata sul server.');
  }

  let caller;
  try { caller = await app.auth().verifyIdToken(m[1], true); } catch (e) {
    return fail(res, 401, 'Sessione non valida: accedi di nuovo.');
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const { atletaUid, uid } = body;
  if (!atletaUid || typeof atletaUid !== 'string' || !uid || typeof uid !== 'string') return fail(res, 400, 'Dati mancanti.');

  try {
    const db = app.firestore();
    const [callerDoc, atletaDoc, targetIsDirigente] = await Promise.all([
      db.collection('dirigenti').doc(caller.uid).get(),
      db.collection('atleti').doc(atletaUid).get(),
      db.collection('dirigenti').doc(uid).get()
    ]);
    if (!callerDoc.exists) return fail(res, 403, 'Accesso negato.');
    if (!atletaDoc.exists || targetIsDirigente.exists) return fail(res, 404, 'Atleta non trovato.');

    const atleta = atletaDoc.data();
    const acc = (Array.isArray(atleta.accessi) ? atleta.accessi : []).find((x) => x && x.uid === uid && x.ruolo === 'genitore');
    if (!acc) return fail(res, 404, 'Genitore non collegato a questo atleta.');
    if (!emailValida(acc.email)) return fail(res, 400, 'Questo genitore non ha un’email reale a cui scrivere.');
    const email = String(acc.email).trim().toLowerCase();

    const codice = I.nuovoCodice();
    const id = I.impronta(codice);
    const ref = db.collection('inviti').doc(id);
    await ref.set({ uid, email, atletaUid, stato: 'attivo', creatoIl: new Date().toISOString(), creatoDa: caller.uid });

    try {
      const atletaNome = ((atleta.nome || '') + ' ' + (atleta.cognome || '')).trim();
      await inviaEmail(cfg, { email, nome: acc.nome }, I.componiInvito({ nome: acc.nome, email, atletaNome }, I.linkInvito(cfg.site, codice), cfg.site));
    } catch (e) {
      await ref.delete().catch(() => {});
      console.error('[invia-invito] invio fallito:', e.message);
      return fail(res, 502, 'L’email non è partita (servizio di invio): riprova tra poco.');
    }

    // invio riuscito: i link precedenti non ancora usati smettono di funzionare
    const vecchi = await db.collection('inviti').where('uid', '==', uid).where('stato', '==', 'attivo').get();
    const batch = db.batch();
    vecchi.docs.filter((d) => d.id !== id).forEach((d) => batch.update(d.ref, { stato: 'revocato', revocatoIl: new Date().toISOString() }));
    await batch.commit();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, email });
  } catch (e) {
    console.error('[invia-invito]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }
};
