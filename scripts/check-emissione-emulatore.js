#!/usr/bin/env node
/**
 * Emissione ricevute con TRANSAZIONI VERE (emulatore Firestore):  node scripts/check-emissione-emulatore.js
 * Esegue api/emetti-ricevuta.js con il vero Admin SDK collegato all'emulatore (progetto finto «demo-vv»; non tocca il
 * database vero) e lancia 25 emissioni insieme: i numeri devono essere tutti diversi e consecutivi a partire dal contatore
 * che c'è (non da 1), il contatore deve chiudersi allineato. Poi controlla che le regole nuove (contatori e creazione
 * ricevute chiusi al browser) non blocchino il server, che passa dall'Admin SDK. Parte da solo con «firebase emulators:exec».
 */
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const r = spawnSync('firebase emulators:exec --only firestore --project demo-vv "node scripts/check-emissione-emulatore.js"', { stdio: 'inherit', shell: true, cwd: path.join(__dirname, '..') });
  if (r.error || r.status === null) { console.log('SALTATO: firebase CLI o Java non disponibili.'); process.exit(0); }
  process.exit(r.status);
}

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const adminApp = initializeApp({ projectId: 'demo-vv' });
const db = getFirestore(adminApp);
const app = {
  firestore: () => db,
  auth: () => ({ verifyIdToken: async () => ({ uid: 'mas', email: 'mas@example.com' }) })
};
require.cache[require.resolve(path.join('..', 'api', '_firebase.js'))] = {
  id: 'fb', filename: 'fb', loaded: true,
  exports: { getApp: () => app, stessaOrigine: () => true, safeJson: (s) => { try { return JSON.parse(s); } catch (e) { return {}; } } }
};
const emetti = require('../api/emetti-ricevuta');
const res = () => { const r = { code: 200, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = () => {}; return r; };
const chiama = async (body) => { const r = res(); await emetti({ method: 'POST', headers: { host: 'x', authorization: 'Bearer t' }, body }, r); return r; };
const valido = (extra) => Object.assign({
  data: '2026-11-12', importo: 150, tipoIncasso: 'Quota associativa', causale: 'Quota', modalita: 'Bonifico', riferimento: '', note: '',
  atletaId: 'a1', rateIds: [], pagatore: { nome: 'ROSSI', cf: '', indirizzo: '', ruolo: 'Genitore / tutore' }, atleta: { nome: 'Rossi Luca', cf: '', dataNascita: '' }
}, extra || {});

(async () => {
  await db.collection('dirigenti').doc('mas').set({ nome: 'Lorenzo', ruolo: 'master' });
  await db.collection('atleti').doc('a1').set({ nome: 'Luca' });
  await db.collection('contatoriRicevute').doc('2026').set({ ultimo: 41 });
  await db.collection('ricevute').doc('2026_0041').set({ stato: 'valida', numero: '2026/0041' });   // una esistente: si prosegue dopo

  const uno = await chiama(valido());
  assert.strictEqual(uno.code, 200, JSON.stringify(uno.body)); assert.strictEqual(uno.body.id, '2026_0042');

  const N = 25;
  const out = await Promise.all(Array.from({ length: N }, () => chiama(valido())));
  assert.ok(out.every((r) => r.code === 200), JSON.stringify(out.filter((r) => r.code !== 200).map((r) => r.body)));
  const nums = out.map((r) => r.body.ricevuta.progressivo).sort((a, b) => a - b);
  assert.deepStrictEqual(nums, Array.from({ length: N }, (_, i) => 43 + i), 'numeri diversi e consecutivi');
  assert.strictEqual((await db.collection('contatoriRicevute').doc('2026').get()).data().ultimo, 42 + N);
  const tutte = await db.collection('ricevute').get();
  assert.strictEqual(tutte.size, 2 + N, 'una ricevuta per richiesta, nessun doppione');

  /* contatore indietro di molto: salta i numeri già usati */
  await db.collection('contatoriRicevute').doc('2026').set({ ultimo: 40 });
  const salto = await chiama(valido());
  assert.strictEqual(salto.code, 200); assert.strictEqual(salto.body.ricevuta.progressivo, 43 + N, 'primo libero dopo gli esistenti');

  /* stessa chiave: nessun doppione, anche con richieste insieme */
  const k = 'chiave-emulatore-1';
  const doppie = await Promise.all([chiama(valido({ chiave: k })), chiama(valido({ chiave: k })), chiama(valido({ chiave: k }))]);
  assert.ok(doppie.every((r) => r.code === 200));
  assert.strictEqual(new Set(doppie.map((r) => r.body.id)).size, 1, 'tre invii con la stessa chiave = una sola ricevuta');

  console.log('OK: emissione con transazioni vere: ' + (N + 5) + ' ricevute, numeri unici e consecutivi, contatore allineato, chiave anti-doppione.');
  process.exit(0);
})().catch((e) => { console.error('FALLITO:', e); process.exit(1); });
