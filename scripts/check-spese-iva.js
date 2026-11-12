#!/usr/bin/env node
/**
 * Collaudo dell'IVA sulle voci di spesa:  node scripts/check-spese-iva.js
 * Carica js/admin/budget/spese.js in un ambiente finto (nessun browser, nessun Firestore) e prova la scelta
 * «L'importo inserito è: Netto / Lordo», le aliquote con i decimali e la voce IVA generata (_syncSpesaIva).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
const asincrone = [];
function t(nome, fn) { asincrone.push(Promise.resolve().then(fn).then(() => { passed++; }, (e) => { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; })); }

const noop = () => {};
const els = {};
const el = () => ({ value: '', innerHTML: '', textContent: '', scrollTop: 0, dataset: {}, style: {}, addEventListener: noop, focus: noop, setAttribute: noop, getAttribute: () => null, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, querySelector: () => null });
const document = { getElementById: (id) => els[id] || (els[id] = el()), addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], readyState: 'complete' };

function carica(voci) {
  const scritti = [], aggiornati = [];
  const db = { collection: () => ({ doc: (id) => ({ id: id || 'nuova', set: (d) => { scritti.push(d); return Promise.resolve(); }, update: (p) => { aggiornati.push({ id, p }); return Promise.resolve(); }, delete: () => Promise.resolve() }) }) };
  const B = {
    _currentSeasonId: 's1', _vociSpesa: voci, _sottospese: [], _categorieSpesa: [],
    _trimestreIvaDaData: (d) => (d ? { trimestre: 'T4', scadenza: '2027-03-16' } : null),
    _eur: (n) => '€' + n, _sponsorChiusi: () => []
  };
  const window = { Admin: { budgetShared: B, esc: (x) => String(x == null ? '' : x), fmtDate: (d) => d, avviso: noop, logWrite: () => Promise.resolve(), diff: () => [] }, AdminActions: {} };
  new Function('window', 'document', 'db', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'spese.js'), 'utf8'))(window, document, db);
  return { B, scritti, aggiornati };
}

t('Netto (come prima): l’IVA si aggiunge, importo × aliquota / 100', () => {
  const { B } = carica([]);
  assert.deepStrictEqual(B._dividiIva(1000, 22), { netto: 1000, iva: 220 });
  assert.deepStrictEqual(B._dividiIva(1000, 22, 'netto'), { netto: 1000, iva: 220 });
});
t('Lordo: l’importo è IVA compresa, netto + IVA = quanto inserito', () => {
  const { B } = carica([]);
  assert.deepStrictEqual(B._dividiIva(1220, 22, 'lordo'), { netto: 1000, iva: 220 });
  const d = B._dividiIva(100, 4, 'lordo');
  assert.deepStrictEqual([d.iva, d.netto], [3.85, 96.15]); assert.strictEqual(Math.round((d.iva + d.netto) * 100) / 100, 100);
});
t('Aliquota 0 (o vuota): nessuna IVA, né netto né lordo', () => {
  const { B } = carica([]);
  assert.deepStrictEqual(B._dividiIva(500, 0, 'lordo'), { netto: 500, iva: 0 });
  assert.deepStrictEqual(B._dividiIva(500, '', 'netto'), { netto: 500, iva: 0 });
});
t('Aliquote con i decimali (7,5%), sia netto sia lordo', () => {
  const { B } = carica([]);
  assert.deepStrictEqual(B._dividiIva(200, 7.5), { netto: 200, iva: 15 });
  assert.deepStrictEqual(B._dividiIva(215, 7.5, 'lordo'), { netto: 200, iva: 15 });
});
t('Voce esistente senza ivaModo: la voce IVA resta quella di sempre (netto)', async () => {
  const madre = { id: 'm', categoria: 'Palestra', importoPreventivato: 1000, importoSostenuto: 400, ivaAliquota: 22, dataSpesa: '2026-11-01' };
  const { B, scritti } = carica([madre]);
  await B._syncSpesaIva(madre);
  assert.strictEqual(scritti.length, 1); assert.strictEqual(scritti[0].importoPreventivato, 220); assert.strictEqual(scritti[0].importoSostenuto, 88);
});
t('Voce lordo: la madre conta il netto, la voce IVA l’IVA contenuta; il totale è quanto inserito', async () => {
  const madre = { id: 'm', categoria: 'Palestra', ivaModo: 'lordo', importoPreventivatoLordo: 1220, importoPreventivato: 1000, importoSostenutoLordo: 610, importoSostenuto: 500, ivaAliquota: 22, dataSpesa: '2026-11-01' };
  const { B, scritti } = carica([madre]);
  await B._syncSpesaIva(madre);
  assert.strictEqual(scritti[0].importoPreventivato, 220); assert.strictEqual(scritti[0].importoSostenuto, 110);
  assert.strictEqual(madre.importoPreventivato + scritti[0].importoPreventivato, 1220, 'totale preventivato = lordo inserito');
  assert.strictEqual(madre.importoSostenuto + scritti[0].importoSostenuto, 610, 'totale sostenuto = lordo inserito');
});
t('Voce lordo con aliquota decimale e voce IVA già esistente: si aggiorna, non si duplica', async () => {
  const madre = { id: 'm', categoria: 'Divise', ivaModo: 'lordo', importoPreventivatoLordo: 107.5, importoPreventivato: 100, importoSostenutoLordo: 0, importoSostenuto: 0, ivaAliquota: 7.5, dataSpesa: '2026-11-01', ivaVoceSpesaId: 'f' };
  const figlia = { id: 'f', isIva: true, categoria: 'IVA Divise', importoPreventivato: 0, importoSostenuto: 0, pagata: false, ivaScadenzaManuale: true };
  const { B, scritti, aggiornati } = carica([madre, figlia]);
  await B._syncSpesaIva(madre);
  assert.strictEqual(scritti.length, 0); assert.strictEqual(aggiornati[0].p.importoPreventivato, 7.5); assert.strictEqual(aggiornati[0].p.ivaAliquota, 7.5);
});
t('Passare da lordo ad aliquota 0 toglie la voce IVA', async () => {
  const madre = { id: 'm', categoria: 'Divise', ivaModo: 'netto', importoPreventivato: 100, importoSostenuto: 0, ivaAliquota: 0, ivaVoceSpesaId: 'f' };
  const figlia = { id: 'f', isIva: true, categoria: 'IVA Divise', importoPreventivato: 22, importoSostenuto: 0 };
  const { B } = carica([madre, figlia]);
  await B._syncSpesaIva(madre);
  assert.deepStrictEqual(B._vociSpesa.map((x) => x.id), ['m']);
});

Promise.all(asincrone).then(() => console.log(process.exitCode ? 'Collaudo fallito.' : 'OK: ' + passed + ' verifiche sull’IVA delle voci di spesa (netto, lordo, decimali).'));
