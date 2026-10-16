#!/usr/bin/env node
/**
 * Collaudo del costo di tesseramento:  node scripts/check-tesseramenti.js
 * Carica js/admin/tesseramenti-calc.js in un ambiente finto e controlla fasce, estremi, OPE e riepilogo per squadra.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function t(nome, fn) { try { fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

const window = { Admin: {} };
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'tesseramenti-calc.js'), 'utf8'))(window);
const C = window.Admin.tesseramentiCalc;
const imp = (a) => { const c = C.costo(a); return c ? c.importo : null; };
const nato = (anno, categoria) => ({ dataNascita: anno + '-06-15', categoria: categoria || 'Under 13 Femminile' });

t('fascia 2014-2021: 5 €, estremi compresi', () => { [2014, 2017, 2021].forEach((y) => assert.strictEqual(imp(nato(y)), 5, String(y))); });
t('fascia 2011-2013: 7 €', () => { [2011, 2012, 2013].forEach((y) => assert.strictEqual(imp(nato(y)), 7, String(y))); });
t('fascia 2003-2010: 10 €', () => { [2003, 2007, 2010].forEach((y) => assert.strictEqual(imp(nato(y)), 10, String(y))); });
t('2002 e precedenti: 18 €', () => { [2002, 1995, 1980].forEach((y) => assert.strictEqual(imp(nato(y)), 18, String(y))); });
t('1° e 31 dicembre/gennaio non spostano la fascia', () => {
  assert.strictEqual(imp({ dataNascita: '2013-12-31' }), 7);
  assert.strictEqual(imp({ dataNascita: '2014-01-01' }), 5);
  assert.strictEqual(imp({ dataNascita: '2010-12-31' }), 10);
  assert.strictEqual(imp({ dataNascita: '2011-01-01' }), 7);
});
t('senza data di nascita: nessun costo (non OPE)', () => { assert.strictEqual(C.costo({ categoria: 'Prima Divisione' }), null); assert.strictEqual(C.costo({ dataNascita: '' }), null); });
t('nata dopo il 2021: nessuna fascia, nessun costo', () => { assert.strictEqual(imp(nato(2022)), null); });
t('OPE (S3 minivolley): 5 € anche senza data o con data di altra fascia', () => {
  assert.strictEqual(imp({ categoria: 'S3 - Minivolley' }), 5);
  assert.strictEqual(imp({ categoria: 'Minivolley', dataNascita: '1990-01-01' }), 5);
  assert.strictEqual(imp({ categoria: 'S3', dataNascita: '2012-01-01' }), 5);
});
t('«Under 13» o «Società» non sono OPE', () => {
  ['Under 13 Femminile', 'Under 13 maschile', 'Prima Divisione', 'Società', 'S30 Open'].forEach((c) => assert.strictEqual(C.isOpe(c), false, c));
});

t('categoria Open: esclusa, anche con data di nascita, e non conta tra i senza data', () => {
  assert.strictEqual(C.costo({ categoria: 'Open', dataNascita: '1990-01-01' }), null);
  assert.strictEqual(C.costo({ categoria: 'Open Femminile', dataNascita: '2005-01-01' }), null);
  const r = C.riepilogo([{ categoria: 'Open', dataNascita: '1990-01-01' }, { categoria: 'Open' }, nato(2012, 'Prima Divisione')]);
  assert.strictEqual(r.escluse, 2); assert.strictEqual(r.senzaData, 0); assert.strictEqual(r.totale, 7);
  assert.deepStrictEqual(r.squadre.map((x) => x.nome), ['Prima Divisione']);
});

t('riepilogo per squadra, totali e conteggi', () => {
  const r = C.riepilogo([
    nato(2012, 'Under 13 Femminile'), nato(2012, 'Under 13 Femminile'), nato(2015, 'Under 13 Femminile'),
    nato(2000, 'Prima Divisione'), nato(2005, 'Prima Divisione'),
    { categoria: 'S3 - Minivolley' },
    { categoria: 'Under 13 maschile' },          /* senza data */
    nato(2023, 'Under 13 maschile')              /* fuori fasce */
  ]);
  assert.strictEqual(r.totale, 7 + 7 + 5 + 18 + 10 + 5);
  assert.strictEqual(r.tesserati, 6);
  assert.strictEqual(r.senzaData, 1);
  assert.strictEqual(r.fuoriFasce, 1);
  const u13f = r.squadre.find((s) => s.nome === 'Under 13 Femminile');
  assert.strictEqual(u13f.n, 3); assert.strictEqual(u13f.totale, 19);
  assert.strictEqual(C.dettaglio(u13f), '1 × 5 € (nati/e dal 2014 al 2021) · 2 × 7 € (nati/e dal 2011 al 2013)');
  assert.deepStrictEqual(r.squadre.map((s) => s.nome), ['Prima Divisione', 'S3 - Minivolley', 'Under 13 Femminile']);
});
t('elenco vuoto o senza categoria', () => {
  assert.strictEqual(C.riepilogo([]).totale, 0);
  assert.strictEqual(C.riepilogo([{ dataNascita: '2000-01-01' }]).squadre[0].nome, 'Senza categoria');
});

console.log('Collaudo tesseramenti: ' + passed + ' controlli superati.');
