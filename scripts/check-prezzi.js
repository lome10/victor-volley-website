#!/usr/bin/env node
/**
 * Collaudo del calcolo «Prezzi» (Atleti → Prezzi):  node scripts/check-prezzi.js
 * Carica js/admin/prezzi-calc.js in un ambiente finto e riproduce i numeri del preventivo abbigliamento 2026/27
 * (PDF del 14/10/2026): capi, stampa a 8 € (zaino 4 €), maglie gara, aggiunte già con IVA e contributo di 50 € per atleta Under 13.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function t(nome, fn) { try { fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

const window = { Admin: {} };
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'prezzi-calc.js'), 'utf8'))(window);
const C = window.Admin.prezziCalc;

const righe = (esclusi) => [
  ['Giacca tuta', 'Alice', 18, 19.80, 8], ['Giacca tuta', 'Amedeo', esclusi ? 3 : 10, 19.80, 8], ['Giacca tuta', 'Kurt', 40, 13.95, 8],
  ['Pantalone tuta', 'Vanessa 3.0', 18, 15.98, 0], ['Pantalone tuta', 'Myron', esclusi ? 3 : 9, 15.98, 0], ['Pantalone tuta', 'Nevis 3.0', 40, 10.13, 0],
  ['Felpa', 'Madison', esclusi ? 21 : 28, 11.25, 8], ['Giubbotto', 'Babylon', esclusi ? 21 : 28, 31.28, 8],
  ['Zaino', 'Tobago', 40, 12.83, 4], ['Borsone', 'Basic Media', 7, 17.33, 0], ['Polo', 'Evo', esclusi ? 3 : 10, 0, 0]
].map((r) => ({ voce: r[0], modello: r[1], qta: r[2], prezzo: r[3], stampa: r[4] }));
const extra = (contributo) => [
  { id: 'mgU13', desc: 'Maglia gara Under 13', qta: 40, importo: 13, ivaInclusa: false },
  { id: 'mgMV', desc: 'Maglia gara Minivolley', qta: 30, importo: 13, ivaInclusa: false },
  { id: 'ag1', desc: 'Aggiunte generiche', qta: 1, importo: 1208.80, ivaInclusa: true },
  { id: 'ag2', desc: 'Aggiunte generiche', qta: 1, importo: 260, ivaInclusa: true },
  { id: 'mgPD', desc: 'Maglie gara Prima Divisione', qta: 1, importo: 412, ivaInclusa: true }
].concat(contributo ? [{ id: 'c50', desc: 'Contributo', qta: 32, importo: 50, ivaInclusa: true, segno: -1 }] : []);

t('righe: totali per riga', () => {
  const r = C.calcola(righe(false), []);
  assert.strictEqual(r.righe[0].totCapo, 356.40);
  assert.strictEqual(r.righe[0].totStampa, 144);
  assert.strictEqual(r.righe[7].totRiga, 1099.84);
});
t('pagina 1: tutti i dirigenti', () => {
  const r = C.calcola(righe(false), extra(false));
  assert.strictEqual(r.totCapi, 3774.41);
  assert.strictEqual(r.totStampa, 1152);
  assert.strictEqual(r.totRighe, 4926.41);
  assert.strictEqual(r.base, 5836.41);
  assert.strictEqual(r.ivaBase, 1284.01);
  assert.strictEqual(r.imponibile, 7378.04);
  assert.strictEqual(r.iva, 1623.18);
  assert.strictEqual(r.totale, 9001.22);
});
t('pagina 2: senza 8 dirigenti', () => {
  const r = C.calcola(righe(true), extra(false));
  assert.strictEqual(r.totCapi, 3242.22);
  assert.strictEqual(r.totStampa, 984);
  assert.strictEqual(r.imponibile, 6677.85);
  assert.strictEqual(r.iva, 1469.14);
  assert.strictEqual(r.totale, 8146.99);
});
t('pagina 3: meno 50 € × 32 atleti Under 13', () => {
  const r = C.calcola(righe(true), extra(true));
  assert.strictEqual(r.totale, 6546.99);
});
t('voci con IVA scorporate una per una', () => {
  const r = C.calcola([], [{ qta: 1, importo: 1468.80, ivaInclusa: true }]);
  assert.strictEqual(r.imponibile, 1203.93);
  assert.strictEqual(r.iva, 264.87);
  assert.strictEqual(r.totale, 1468.80);
});
t('quantità e prezzi non validi non producono NaN', () => {
  const r = C.calcola([{ voce: 'x', qta: 'abc', prezzo: '', stampa: undefined }], [{ qta: null, importo: 'x' }]);
  assert.strictEqual(r.totale, 0);
});
t('formato euro italiano', () => {
  assert.strictEqual(C.eur(9001.22), '9.001,22 €');
  assert.strictEqual(C.eur(-1600), '− 1.600,00 €');
  assert.strictEqual(C.eur(0), '0,00 €');
});

if (process.exitCode) console.error('\nCollaudo prezzi: ci sono errori.');
else console.log('Collaudo prezzi: ' + passed + ' controlli superati.');
