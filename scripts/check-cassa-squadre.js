#!/usr/bin/env node
/**
 * Collaudo del «rendimento per squadra» della Cassa:  node scripts/check-cassa-squadre.js
 * Carica js/admin/budget/cassa.js in un ambiente finto e prova le righe: squadre, «Società e generali»,
 * «Senza categoria» (spese senza categoria) e le altre entrate assegnate a una squadra o generali.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function t(nome, fn) { try { fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

const noop = () => {};
const els = {};
const el = () => ({ value: '', innerHTML: '', textContent: '', dataset: {}, style: {}, addEventListener: noop, focus: noop, setAttribute: noop, getAttribute: () => null, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, querySelector: () => null });
const document = { getElementById: (id) => els[id] || (els[id] = el()), addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], readyState: 'complete' };

function carica(extra) {
  const B = Object.assign({
    _currentSeasonId: 's1', _seasons: [{ id: 's1', nome: '2026/2027' }],
    _sponsorizzazioni: [], _tranche: [], _atletiRette: [{ id: 'a1', categoriaAtletiId: 'k1' }], _categorieAtleti: [{ id: 'k1', nome: 'Under 13' }],
    _rateAtleti: [{ atletaRettaId: 'a1', importo: 100, scadenza: '2026-10-01', pagata: true }],
    _categorieSpesa: [{ id: 'c1', nome: 'Under 13' }, { id: 'c2', nome: 'Federazione' }],
    _vociSpesa: [], _altreEntrate: [], _tessere: [],
    _categoriaSpesaById: (id) => ({ c1: { id: 'c1', nome: 'Under 13' }, c2: { id: 'c2', nome: 'Federazione' } }[id]),
    _sponsorChiusi: () => [], _calcTessere: () => ({ assegnate: 0, prezzo: 0, pagate: 0, incassato: 0, righe: [] }),
    _calcRiepilogo: () => ({ sponsorChiusi: 0, tessere: 0, supercoppa: 0, altre: 0, saldo: 0, entrateConfermate: 0 }),
    _eur: (n) => n, _eurSigned: (n) => n
  }, extra || {});
  const window = { Admin: { budgetShared: B, esc: (x) => x, fmtDate: (d) => d, fmtDateLong: (d) => d, avviso: noop }, AdminActions: {} };
  new Function('window', 'document', 'db', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'cassa.js'), 'utf8'))(window, document, {});
  return B;
}
const voce = (o) => Object.assign({ importoPreventivato: 0, importoSostenuto: 0 }, o);
const riga = (r, nome) => r.filter((x) => x.nome === nome)[0];

t('Le spese senza categoria hanno una riga loro, non finiscono in «Società e generali»', () => {
  const r = carica({ _vociSpesa: [voce({ categoriaSpesaId: 'c1', importoPreventivato: 300 }), voce({ categoriaSpesaId: 'c2', importoPreventivato: 50 }), voce({ importoPreventivato: 70 })] })._calcPerSquadra();
  assert.strictEqual(riga(r, 'Under 13').spese, 300);
  assert.strictEqual(riga(r, 'Società e generali').spese, 50, 'categoria che non è una squadra = generali');
  assert.strictEqual(riga(r, 'Senza categoria').spese, 70);
  assert.strictEqual(riga(r, 'Senza categoria').margine, -70);
});
t('Nessuna spesa senza categoria: la riga «Senza categoria» non compare', () => {
  const r = carica({ _vociSpesa: [voce({ categoriaSpesaId: 'c1', importoPreventivato: 300 })] })._calcPerSquadra();
  assert.strictEqual(riga(r, 'Senza categoria'), undefined);
});
t('Altre entrate: con la squadra vanno su quella riga, senza squadra (o «generali») restano generali', () => {
  const r = carica({ _altreEntrate: [
    { importo: 500, pagata: true, squadra: 'Under 13' },
    { importo: 200, pagata: false, squadra: 'under 13' },
    { importo: 300, pagata: true },
    { importo: 40, pagata: false, squadra: 'generali' },
    { importo: 60, pagata: true, squadra: 'Squadra che non esiste' }] })._calcPerSquadra();
  const u13 = riga(r, 'Under 13'), gen = riga(r, 'Società e generali');
  assert.deepStrictEqual([u13.entrate, u13.incassato], [100 + 500 + 200, 100 + 500], 'rette + altre entrate della squadra');
  assert.deepStrictEqual([gen.entrate, gen.incassato], [300 + 40 + 60, 300 + 60], 'le altre vanno ai generali; incassato solo le pagate');
});

console.log(process.exitCode ? 'Collaudo fallito.' : 'OK: ' + passed + ' verifiche sul rendimento per squadra della Cassa.');
