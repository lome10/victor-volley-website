/**
 * Elenco atleti per l'ALLENATORE (funzione serverless Vercel). Sola lettura.
 *
 * GET /api/allenatore-atleti
 *   Authorization: Bearer <ID token Firebase dell'allenatore>
 *
 * Perché esiste: i dati di contatto stanno in `atletiDati` (solo dirigenti) insieme a codice fiscale, indirizzo e note
 * mediche, e le regole di Firestore non sanno nascondere un campo di un documento. Qui il server legge con
 * l'account di servizio e restituisce soltanto cognome, nome, data di nascita e telefono dei genitori degli atleti
 * delle categorie assegnate all'allenatore (allenatori/{uid}.categorie).
 *
 * Controlli, nell'ordine: solo GET dallo stesso sito, ID token valido e non revocato, esiste allenatori/{uid} con
 * accesso attivo e almeno una categoria. Un dirigente non passa di qui: ha già tutto nel pannello.
 */
const { getApp, stessaOrigine } = require('./_firebase');
const { categorieAllenatore, schedaAtleta, ordina } = require('./_allenatore-logic');

function fail(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}

/** Firestore accetta fino a 30 valori in un `in`: si interroga a gruppi di 10. */
function gruppi(lista, n) {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
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
    console.error('[allenatore-atleti] configurazione:', e.message);
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

    const risultati = await Promise.all(gruppi(categorie, 10).map((g) => db.collection('atleti').where('categoria', 'in', g).get()));
    const atleti = [];
    risultati.forEach((snap) => snap.docs.forEach((d) => atleti.push({ id: d.id, ...d.data() })));

    const riservati = {};
    if (atleti.length) {
      const docs = await db.getAll(...atleti.map((a) => db.collection('atletiDati').doc(a.id)));
      docs.forEach((d) => { if (d.exists) riservati[d.id] = d.data(); });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      allenatore: { nome: String(profilo.nome || ''), cognome: String(profilo.cognome || '') },
      categorie,
      atleti: ordina(atleti.map((a) => schedaAtleta(a, riservati[a.id])))
    });
  } catch (e) {
    console.error('[allenatore-atleti]', e && e.code, e && e.message);
    return fail(res, 500, 'Errore del server, riprova più tardi.');
  }
};
