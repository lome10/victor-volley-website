/**
 * Calcolo dei promemoria da spedire in un dato giorno, condiviso dal job giornaliero (api/promemoria.js) e
 * dall'anteprima per i dirigenti (api/promemoria-anteprima.js): così quello che si vede in anteprima è
 * esattamente quello che partirà. Legge Firestore, non scrive nulla. Inizia con «_»: non è una funzione Vercel.
 */
const crypto = require('crypto');
const L = require('./_promemoria-logic');

const hash8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
/** Un documento per (promemoria, destinatario): promemoriaInviati/{chiave}__{impronta dell'email}. */
const docId = (chiave, email) => chiave + '__' + hash8(email);

async function calcolaDaInviare(db, oggi) {
  const [atletiSnap, rateSnap, optOutSnap] = await Promise.all([
    db.collection('atleti').get(),
    db.collection('rateAtleti').where('pagata', '==', false).get(),
    db.collection('notifiche').where('email', '==', false).get()
  ]);
  const atleti = atletiSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rate = rateSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const nonVogliono = new Set(optOutSnap.docs.map((d) => d.id));

  const calcolati = L.costruisciPromemoria({ atleti, rate, oggi });

  const coppie = [];
  calcolati.forEach((p) => p.destinatari.forEach((d) => coppie.push({ id: docId(p.chiave, d.email) })));
  const esistenti = new Set();
  for (let i = 0; i < coppie.length; i += 300) {
    const refs = coppie.slice(i, i + 300).map((c) => db.collection('promemoriaInviati').doc(c.id));
    if (refs.length) (await db.getAll(...refs)).forEach((s) => { if (s.exists) esistenti.add(s.id); });
  }
  const daInviare = calcolati.map((p) => ({
    ...p, destinatari: p.destinatari.filter((d) => !esistenti.has(docId(p.chiave, d.email)))
  })).filter((p) => p.destinatari.length);

  const gruppi = L.raggruppaPerDestinatario(daInviare, nonVogliono);
  return { calcolati, esistenti, daInviare, gruppi };
}

module.exports = { hash8, docId, calcolaDaInviare };
