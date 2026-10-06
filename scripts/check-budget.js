#!/usr/bin/env node
/**
 * Collaudo dei calcoli del Budget:  node scripts/check-budget.js
 * Carica js/admin/budget/bilancio.js e spese.js in un ambiente finto (nessun browser, nessun Firestore) e prova il
 * calcolo del Bilancio mensile (mese di ogni incasso, filtri, spese senza data, IVA non versata) e la scheda Spese
 * (indicatori, stato e urgenza delle voci, elenco raggruppato senza le voci IVA, filtri, pannello laterale).
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

/* ---------- scheda Spese: finto DOM che ricorda ogni elemento per id ---------- */
function ambienteDom() {
  const els = {};
  const nuovo = () => ({ value: '', innerHTML: '', textContent: '', scrollTop: 0, dataset: {}, style: {}, addEventListener: noop, focus: noop, setAttribute: noop, getAttribute: () => null, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, querySelector: () => null });
  const doc = { getElementById: (id) => els[id] || (els[id] = nuovo()), addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], readyState: 'complete' };
  doc.getElementById('speseDrawerRoot').querySelector = function (sel) { return /sp-dr-body/.test(sel) && /sp-dr-body/.test(this.innerHTML) ? { scrollTop: 0 } : null; };
  return { doc, els };
}
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');   // data locale, come nel codice
const oggi = iso(new Date());
const tra = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
function caricaSpese(B) {
  const { doc, els } = ambienteDom();
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const window = { Admin: { budgetShared: B, esc, fmtDate: (d) => d, avviso: noop, logWrite: () => Promise.resolve(), diff: () => [] }, AdminActions: {} };
  ['bilancio.js', 'spese.js'].forEach((f) => new Function('window', 'document', 'db', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', f), 'utf8'))(window, doc, {}));
  return { B, els, DG: window.AdminActions };
}
function statoSpese(voci, extra) {
  const B = Object.assign({
    _currentSeasonId: 's1', _seasons: [{ id: 's1', nome: '2026/2027' }], _vociSpesa: voci, _sottospese: [],
    _categorieSpesa: [{ id: 'c1', nome: 'Federazione' }, { id: 'c2', nome: 'Società' }],
    _renderIvaRiepilogo: noop, _renderStatCards: noop, _renderCharts: noop, _renderBilancio: noop, _delIconSm: () => '',
    _speseFilterCategoriaId: '', _speseExpanded: {}, _trimestreIvaDaData: () => null
  }, extra || {});
  return caricaSpese(B);
}
const voce = (o) => Object.assign({ id: 'v' + Math.random().toString(36).slice(2, 7), categoria: 'Voce', categoriaSpesaId: 'c1', importoPreventivato: 0, importoSostenuto: 0, dataSpesa: '', note: '' }, o);

t('Spese: stato e urgenza di una voce', () => {
  const { B } = statoSpese([]);
  assert.strictEqual(B._statoVoceSpesa(voce({ importoPreventivato: 100, importoSostenuto: 100 })), 'pagata');
  assert.strictEqual(B._statoVoceSpesa(voce({ importoPreventivato: 100, importoSostenuto: 150 })), 'pagata');
  assert.strictEqual(B._statoVoceSpesa(voce({ importoPreventivato: 100, importoSostenuto: 40 })), 'parziale');
  assert.strictEqual(B._statoVoceSpesa(voce({ importoPreventivato: 100 })), 'da-pagare');
  assert.strictEqual(B._statoVoceSpesa(voce({ importoSostenuto: 30 })), 'parziale', 'speso senza preventivo non è «pagata»');
  const u = (o) => B._urgenzaVoceSpesa(voce(Object.assign({ importoPreventivato: 100 }, o)), oggi);
  assert.strictEqual(u({ dataSpesa: tra(-1) }), 'scaduta'); assert.strictEqual(u({ dataSpesa: oggi }), 'in-scadenza');
  assert.strictEqual(u({ dataSpesa: tra(30) }), 'in-scadenza'); assert.strictEqual(u({ dataSpesa: tra(31) }), '');
  assert.strictEqual(u({ dataSpesa: '' }), '', 'senza data non è urgente'); assert.strictEqual(u({ dataSpesa: tra(-5), importoSostenuto: 100 }), '', 'pagata non è mai urgente');
});
t('Spese: indicatori (l’IVA sta nei totali, non nelle scadenze)', () => {
  const { B } = statoSpese([
    voce({ importoPreventivato: 1000, importoSostenuto: 400, dataSpesa: tra(10) }),            // parziale, in scadenza: residuo 600
    voce({ importoPreventivato: 500, dataSpesa: tra(-3) }),                                    // scaduta: residuo 500
    voce({ importoPreventivato: 200 }),                                                         // senza data
    voce({ importoSostenuto: 100, dataSpesa: tra(-40) }),                                       // speso senza preventivo
    voce({ importoPreventivato: 300, importoSostenuto: 300, dataSpesa: tra(-40) }),             // pagata
    voce({ isIva: true, importoPreventivato: 220, dataSpesa: tra(5) })]);                       // IVA: nei totali, fuori da scadenze e anomalie
  const k = B._calcSpeseKpi(oggi);
  assert.strictEqual(k.prev, 2220); assert.strictEqual(k.speso, 800); assert.strictEqual(k.daPagare, 600 + 500 + 200 + 220);
  assert.strictEqual(k.ivaPrev, 220); assert.strictEqual(k.entro30n, 2); assert.strictEqual(k.entro30eur, 1100);
  assert.strictEqual(k.senzaData, 1); assert.strictEqual(k.anomalie, 1);
});
t('Spese: l’elenco raggruppa per categoria, tiene fuori le voci IVA e mostra stato e badge', () => {
  const madre = voce({ id: 'm1', categoria: 'Abbigliamento', categoriaSpesaId: 'c2', importoPreventivato: 1000, ivaAliquota: 22, ivaVoceSpesaId: 'i1', dataSpesa: tra(60) });
  const iva = voce({ id: 'i1', categoria: 'IVA Abbigliamento', categoriaSpesaId: 'c2', isIva: true, importoPreventivato: 220, ivaAliquota: 22 });
  const { B, els } = statoSpese([madre, iva, voce({ categoria: 'Iscrizione', importoPreventivato: 200, dataSpesa: tra(-2) }), voce({ categoria: 'Affiliazione', importoPreventivato: 500, importoSostenuto: 500, dataSpesa: '2026-07-01' })]);
  B._renderSpese();
  const html = els.speseList.innerHTML;
  assert.strictEqual((html.match(/class="sp-group"/g) || []).length, 2, 'due categorie');
  assert.strictEqual((html.match(/class="sp-row"/g) || []).length, 3, 'tre voci: l’IVA generata non è nell’elenco');
  assert.ok(!html.includes('IVA Abbigliamento</div>'), 'nessuna riga per la voce IVA');
  assert.ok(html.includes('+ IVA 22% €220'), 'badge IVA sulla voce madre');
  assert.ok(/Scaduta/.test(html) && /Pagata/.test(html) && /Da pagare/.test(html));
  assert.strictEqual((html.match(/data-pay=/g) || []).length, 2, '«Segna pagata» solo sulle voci non pagate');
  assert.ok(els.speseFoot.innerHTML.includes('IVA collegata'), 'nota sull’IVA collegata nel piè di pagina');
  assert.ok(els.speseKpis.innerHTML.includes('Preventivato') && els.speseKpis.innerHTML.includes('Budget di spesa'));
});
t('Spese: filtri per stato, ricerca e categoria; i testi con HTML vengono escapati', () => {
  const { B, els } = statoSpese([voce({ categoria: '<b>X</b>', importoPreventivato: 100, dataSpesa: tra(-1) }), voce({ categoria: 'Palloni', categoriaSpesaId: 'c2', importoPreventivato: 50 }), voce({ categoria: 'Fatta', importoPreventivato: 80, importoSostenuto: 80, dataSpesa: tra(-9) })]);
  const righe = () => (els.speseList.innerHTML.match(/class="sp-row"/g) || []).length;
  B._speseStato = 'pagata'; B._renderSpese(); assert.strictEqual(righe(), 1);
  B._speseStato = 'in-scadenza'; B._renderSpese(); assert.strictEqual(righe(), 1);
  B._speseStato = 'senza-data'; B._renderSpese(); assert.strictEqual(righe(), 1);
  B._speseStato = 'da-pagare'; B._renderSpese(); assert.strictEqual(righe(), 2);
  B._speseStato = 'tutti'; B._speseQ = 'pallon'; B._renderSpese(); assert.strictEqual(righe(), 1);
  B._speseQ = ''; B._speseFilterCategoriaId = 'c2'; B._renderSpese(); assert.strictEqual(righe(), 1);
  B._speseFilterCategoriaId = ''; B._renderSpese();
  assert.ok(!els.speseList.innerHTML.includes('<b>X</b>') && els.speseList.innerHTML.includes('&lt;b&gt;X&lt;/b&gt;'));
  B._speseFilterCategoriaId = '__none__'; B._renderSpese(); assert.strictEqual(righe(), 0); assert.ok(/Nessuna voce con questi filtri/.test(els.speseList.innerHTML));
});
t('Spese: pannello laterale, campi bloccati quando speso e preventivato vengono dai pagamenti', () => {
  const v = voce({ id: 'v9', categoria: 'Evento', importoPreventivato: 2217, importoSostenuto: 1457 });
  const sub = [{ id: 'p1', voceSpesaId: 'v9', tipo: 'spesa', descrizione: 'Catering', importoPreventivato: 900, importo: 900 }];
  const { DG, B, els } = statoSpese([v, voce({ id: 'v8', categoria: 'Semplice', importoPreventivato: 50 })], { _sottospese: sub });
  DG.speseDrawerApri('v9');
  const h = els.speseDrawerRoot.innerHTML;
  assert.ok(h.includes('role="dialog"') && h.includes('Evento') && h.includes('Pagamenti e dettaglio') && h.includes('Catering'));
  assert.ok(/id="speDPrev"[^>]*readonly/.test(h) && /id="speDSost"[^>]*readonly/.test(h), 'importi bloccati');
  DG.speseDrawerApri('v8');
  const h2 = els.speseDrawerRoot.innerHTML;
  assert.ok(!/id="speDPrev"[^>]*readonly/.test(h2) && !/id="speDSost"[^>]*readonly/.test(h2), 'importi liberi senza pagamenti');
  DG.speseDrawerChiudi(); assert.strictEqual(els.speseDrawerRoot.innerHTML, ''); assert.strictEqual(B._speseDrawerId, null);
});

console.log(process.exitCode ? 'Collaudo fallito.' : 'OK: ' + passed + ' verifiche su Bilancio e scheda Spese.');
