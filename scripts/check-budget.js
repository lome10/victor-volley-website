#!/usr/bin/env node
/**
 * Collaudo dei calcoli del Budget:  node scripts/check-budget.js
 * Carica js/admin/budget/bilancio.js in un ambiente finto (nessun browser, nessun Firestore) e prova il calcolo del
 * Bilancio mensile con dati inventati: in quale mese cade ogni incasso (data d'incasso o di pagamento, scadenza solo
 * come ripiego), filtri per fonte e per categoria, spese senza data, IVA non versata, saldo progressivo.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function t(nome, fn) { try { fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

/* ---------- ambiente finto ---------- */
const noop = () => {};
const el = () => ({ addEventListener: noop, innerHTML: '', value: '', style: {}, classList: { add: noop, remove: noop, toggle: noop } });
const document = { getElementById: el, addEventListener: noop, querySelector: el, querySelectorAll: () => [] };
function carica(B) {
  const window = { Admin: { budgetShared: B }, AdminActions: {} };
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'bilancio.js'), 'utf8');
  new Function('window', 'document', src)(window, document);
  return B;
}
function stato(extra) {
  const B = Object.assign({
    _currentSeasonId: 's1',
    _sponsorizzazioni: [{ id: 'sp1', seasonId: 's1', aziendaId: 'az1' }, { id: 'sp2', seasonId: 's0', aziendaId: 'az2' }],
    _tranche: [], _atletiRette: [], _rateAtleti: [], _vociSpesa: [], _categorieSpesa: [{ id: 'c1', nome: 'Federazione' }, { id: 'c2', nome: 'Società' }],
    _aziendaById: (id) => ({ ragioneSociale: 'Azienda ' + id }),
    _atletaRettaById: (id) => ({ nome: 'Luca', cognome: 'Rossi', id }),
    _categoriaSpesaById: (id) => ({ id, nome: id === 'c1' ? 'Federazione' : 'Società' }),
    _calcTessere: () => ({ righe: [] }),
    _sponsorDaIncassare: () => 0, _calcRetteAtleti: () => ({ incassato: 0, daIncassare: 0, righe: [] })
  }, extra || {});
  return carica(B);
}
const mesi = (r) => r.righe.reduce((o, x) => { o[x.key || x.label] = x; return o; }, {});

/* ---------- sponsor ---------- */
t('tranche pagata: conta nel mese della data d’incasso, non della scadenza', () => {
  const B = stato({ _tranche: [{ sponsorizzazioneId: 'sp1', importo: 1000, scadenza: '2026-07-31', pagato: true, dataIncasso: '2026-10-05' }] });
  const r = B._calcBilancioMensile();
  assert.strictEqual(r.righe.length, 1); assert.ok(/Ottobre 2026/.test(r.righe[0].label)); assert.strictEqual(r.totEntrate, 1000);
});
t('tranche pagata senza data d’incasso (dati vecchi): resta la scadenza', () => {
  const B = stato({ _tranche: [{ sponsorizzazioneId: 'sp1', importo: 500, scadenza: '2026-08-31', pagato: true }] });
  assert.ok(/Agosto 2026/.test(B._calcBilancioMensile().righe[0].label));
});
t('tranche non pagata o di un’altra stagione: non entra', () => {
  const B = stato({ _tranche: [{ sponsorizzazioneId: 'sp1', importo: 700, scadenza: '2026-09-30', pagato: false }, { sponsorizzazioneId: 'sp2', importo: 900, scadenza: '2026-09-30', pagato: true, dataIncasso: '2026-09-30' }] });
  assert.strictEqual(B._calcBilancioMensile().totEntrate, 0);
});

/* ---------- rette e tessere ---------- */
t('rata pagata: conta nel mese del pagamento (scadenza solo come ripiego)', () => {
  const B = stato({ _atletiRette: [{ id: 'a1' }], _rateAtleti: [
    { atletaRettaId: 'a1', importo: 120, scadenza: '2026-12-31', pagata: true, dataPagamento: '2026-10-05' },
    { atletaRettaId: 'a1', importo: 100, scadenza: '2027-03-31', pagata: true }] });
  const r = B._calcBilancioMensile(), m = r.righe.map((x) => x.label).join('|');
  assert.ok(/Ottobre 2026/.test(m) && /Marzo 2027/.test(m) && !/Dicembre 2026/.test(m), m); assert.strictEqual(r.totEntrate, 220);
});
t('tessere pagate: mese della data di pagamento', () => {
  const B = stato({ _calcTessere: () => ({ righe: [{ numero: 1, nome: 'Mario', dataPagamento: '2026-10-02', importo: 20 }, { numero: 3, nome: 'Anna', dataPagamento: '2026-10-09', importo: 20 }] }) });
  const r = B._calcBilancioMensile(); assert.strictEqual(r.righe.length, 1); assert.strictEqual(r.totEntrate, 40);
});

/* ---------- spese ---------- */
t('spese: contano per data, senza data vanno a parte, l’IVA non versata resta fuori', () => {
  const B = stato({ _vociSpesa: [
    { importoSostenuto: 500, dataSpesa: '2026-07-01', categoriaSpesaId: 'c1' },
    { importoSostenuto: 1457, dataSpesa: '', categoriaSpesaId: 'c2' },
    { importoSostenuto: 300, dataSpesa: '2026-09-01', isIva: true, pagata: false },
    { importoSostenuto: 200, dataSpesa: '2026-09-02', isIva: true, pagata: true },
    { importoSostenuto: 0, dataSpesa: '2026-09-03' }] });
  const r = B._calcBilancioMensile();
  const ultima = r.righe[r.righe.length - 1];
  assert.strictEqual(ultima.label, 'Spese senza data'); assert.strictEqual(ultima.uscite, 1457);
  assert.strictEqual(r.righe.slice(0, -1).reduce((s, x) => s + x.uscite, 0), 700, 'solo 500 + 200 con data: l’IVA non versata (300) e la voce a zero restano fuori');
  assert.strictEqual(r.totUscite, 700 + 1457);
});

/* ---------- filtri e saldo ---------- */
t('filtri per fonte e per categoria; saldo progressivo', () => {
  const B = stato({
    _tranche: [{ sponsorizzazioneId: 'sp1', importo: 1000, scadenza: '2026-07-31', pagato: true, dataIncasso: '2026-07-20' }],
    _calcTessere: () => ({ righe: [{ numero: 1, nome: 'Mario', dataPagamento: '2026-08-02', importo: 20 }] }),
    _vociSpesa: [{ importoSostenuto: 300, dataSpesa: '2026-08-10', categoriaSpesaId: 'c1' }, { importoSostenuto: 100, dataSpesa: '2026-09-10', categoriaSpesaId: 'c2' }] });
  const tutto = B._calcBilancioMensile();
  assert.strictEqual(tutto.totEntrate, 1020); assert.strictEqual(tutto.totUscite, 400);
  assert.deepStrictEqual(tutto.righe.map((x) => x.progressivo), [1000, 720, 620]);
  const sp = B._calcBilancioMensile('fonte:Sponsor'); assert.strictEqual(sp.totEntrate, 1000); assert.strictEqual(sp.totUscite, 0);
  const cat = B._calcBilancioMensile('cat:c1'); assert.strictEqual(cat.totEntrate, 0); assert.strictEqual(cat.totUscite, 300);
});

console.log(process.exitCode ? 'Collaudo fallito.' : 'OK: ' + passed + ' verifiche sui calcoli del Bilancio.');
