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
const asincrone = [];
function ta(nome, fn) { asincrone.push(fn().then(() => { passed++; }, (e) => { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; })); }
function t(nome, fn) { try { fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

/* ---------- ambiente finto ---------- */
const noop = () => {};
const el = () => ({ addEventListener: noop, innerHTML: '', value: '', style: {}, classList: { add: noop, remove: noop, toggle: noop } });
const document = { getElementById: el, addEventListener: noop, querySelector: el, querySelectorAll: () => [] };
function carica(B) {
  B._sponsorChiusi = B._sponsorChiusi || (() => B._sponsorizzazioni.filter((s) => s.seasonId === B._currentSeasonId && s.stato === 'chiuso'));   // come in state.js
  const window = { Admin: { budgetShared: B }, AdminActions: {} };
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'bilancio.js'), 'utf8');
  new Function('window', 'document', src)(window, document);
  return B;
}
function stato(extra) {
  const B = Object.assign({
    _currentSeasonId: 's1',
    _sponsorizzazioni: [{ id: 'sp1', seasonId: 's1', aziendaId: 'az1', stato: 'chiuso' }, { id: 'sp2', seasonId: 's0', aziendaId: 'az2', stato: 'chiuso' }, { id: 'sp9', seasonId: 's1', aziendaId: 'az9', stato: 'in_trattativa' }],
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
t('tranche pagata di uno sponsor non chiuso: non entra (stesso filtro di Panoramica e Per categoria)', () => {
  const B = stato({ _tranche: [{ sponsorizzazioneId: 'sp9', importo: 800, scadenza: '2026-09-30', pagato: true, dataIncasso: '2026-09-30' }] });
  assert.strictEqual(B._calcBilancioMensile().totEntrate, 0);
});
ta('IVA già versata il cui importo cresce: la spunta torna da versare (e resta se non cresce)', async () => {
  const scritture = [];
  const dbx = { collection: () => ({ doc: () => ({ update: (p) => { scritture.push(p); return Promise.resolve(); } }) }) };
  const madre = (sost) => ({ id: 'm', categoria: 'Palestra', ivaAliquota: 22, importoPreventivato: 1000, importoSostenuto: sost, ivaVoceSpesaId: 'f' });
  const figlia = () => ({ id: 'f', isIva: true, pagata: true, categoria: 'IVA Palestra', importoSostenuto: 220, importoPreventivato: 220 });
  let x = caricaSpese({ _currentSeasonId: 's1', _vociSpesa: [madre(1000), figlia()], _trimestreIvaDaData: () => null }, dbx);
  await x.B._syncSpesaIva(x.B._vociSpesa[0]);
  assert.strictEqual(scritture[0].pagata, undefined, 'stesso importo: la spunta resta'); assert.strictEqual(x.B._vociSpesa[1].pagata, true);
  x = caricaSpese({ _currentSeasonId: 's1', _vociSpesa: [madre(1500), figlia()], _trimestreIvaDaData: () => null }, dbx);
  await x.B._syncSpesaIva(x.B._vociSpesa[0]);
  assert.strictEqual(scritture[1].pagata, false, 'importo cresciuto: da versare'); assert.strictEqual(x.B._vociSpesa[1].pagata, false);
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
t('rata pagata senza data di pagamento: ripiego sulla scadenza di pagamento, poi sulla validità', () => {
  const B = stato({ _atletiRette: [{ id: 'a1' }], _rateAtleti: [
    { atletaRettaId: 'a1', importo: 100, scadenzaPagamento: '2026-11-15', scadenza: '2027-06-30', pagata: true },
    { atletaRettaId: 'a1', importo: 50, scadenza: '2027-03-31', pagata: true }] });
  const m = B._calcBilancioMensile().righe.map((x) => x.label).join('|');
  assert.ok(/Novembre 2026/.test(m) && /Marzo 2027/.test(m) && !/Giugno 2027/.test(m), m);
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
function caricaSpese(B, dbx) {
  B._sponsorChiusi = B._sponsorChiusi || (() => B._sponsorizzazioni.filter((s) => s.seasonId === B._currentSeasonId && s.stato === 'chiuso'));   // come in state.js
  const { doc, els } = ambienteDom();
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const window = { Admin: { budgetShared: B, esc, fmtDate: (d) => d, avviso: noop, logWrite: () => Promise.resolve(), diff: () => [] }, AdminActions: {} };
  ['bilancio.js', 'spese.js'].forEach((f) => new Function('window', 'document', 'db', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', f), 'utf8'))(window, doc, dbx || {}));
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
t('Spese: pannello laterale, «Già speso» e Preventivato bloccati dai pagamenti (VVW-27: dinamico se una rata ha un preventivato)', () => {
  const v = voce({ id: 'v9', categoria: 'Evento', importoPreventivato: 2217, importoSostenuto: 1457 });
  const sub = [{ id: 'p1', voceSpesaId: 'v9', tipo: 'spesa', descrizione: 'Catering', importoPreventivato: 900, importo: 900 }];
  const { DG, B, els } = statoSpese([v, voce({ id: 'v8', categoria: 'Semplice', importoPreventivato: 50 })], { _sottospese: sub });
  DG.speseDrawerApri('v9');
  const h = els.speseDrawerRoot.innerHTML;
  assert.ok(h.includes('role="dialog"') && h.includes('Evento') && h.includes('Pagamenti e dettaglio') && h.includes('Catering'));
  assert.ok(/id="speDPrev"[^>]*readonly/.test(h) && /id="speDSost"[^>]*readonly/.test(h), 'speso e preventivato bloccati (somma delle rate)');
  const vN = voce({ id: 'vN', categoria: 'Rate senza preventivo', importoPreventivato: 500, importoSostenuto: 100 });
  const stN = statoSpese([vN], { _sottospese: [{ id: 'pN', voceSpesaId: 'vN', tipo: 'spesa', descrizione: 'Acconto', importoPreventivato: 0, importo: 100 }] });
  stN.DG.speseDrawerApri('vN');
  assert.ok(!/id="speDPrev"[^>]*readonly/.test(stN.els.speseDrawerRoot.innerHTML), 'rate senza preventivato: il totale resta a mano');
  const vT = voce({ id: 'vT', categoria: 'Tesseramenti', importoPreventivato: 300, importoSostenuto: 0 });
  const stT = statoSpese([vT], { _sottospese: [{ id: 'pT', voceSpesaId: 'vT', tipo: 'spesa', descrizione: 'Squadra A', importoPreventivato: 300, importo: 0, tesseramentiSquadra: 'Squadra A' }] });
  stT.DG.speseDrawerApri('vT');
  assert.ok(/id="speDPrev"[^>]*readonly/.test(stT.els.speseDrawerRoot.innerHTML), 'Tesseramenti: preventivato calcolato dalle squadre');
  DG.speseDrawerApri('v8');
  const h2 = els.speseDrawerRoot.innerHTML;
  assert.ok(!/id="speDPrev"[^>]*readonly/.test(h2) && !/id="speDSost"[^>]*readonly/.test(h2), 'importi liberi senza pagamenti');
  DG.speseDrawerChiudi(); assert.strictEqual(els.speseDrawerRoot.innerHTML, ''); assert.strictEqual(B._speseDrawerId, null);
});

ta('Spese (VVW-26): Salva nel pannello non azzera il «Già speso» calcolato dalle rate, nemmeno con la bozza vecchia a 0', async () => {
  const v = voce({ id: 'vV', categoria: 'Vincolo', importoPreventivato: 80, importoSostenuto: 80 });
  const sub = [{ id: 'a', voceSpesaId: 'vV', tipo: 'spesa', descrizione: 'R1', importoPreventivato: 40, importo: 40 }, { id: 'b', voceSpesaId: 'vV', tipo: 'spesa', descrizione: 'R2', importoPreventivato: 40, importo: 40 }];
  const scritture = [];
  const dbx = { collection: () => ({ doc: () => ({ update: (p) => { scritture.push(p); return Promise.resolve(); } }) }) };
  const B = { _currentSeasonId: 's1', _seasons: [{ id: 's1', nome: '2026/2027' }], _vociSpesa: [v], _sottospese: sub, _categorieSpesa: [{ id: 'c1', nome: 'Federazione' }], _renderIvaRiepilogo: noop, _renderStatCards: noop, _renderCharts: noop, _renderBilancio: noop, _delIconSm: () => '', _speseFilterCategoriaId: '', _speseExpanded: {}, _trimestreIvaDaData: () => null };
  const { DG, els } = caricaSpese(B, dbx);
  DG.speseDrawerApri('vV');
  Object.assign(els.speDNome, { value: 'Vincolo allenatori' }); els.speDCat.value = 'c1'; els.speDPrev.value = '80'; els.speDSost.value = '';   // bozza vecchia: vuoto = 0
  els.speDIva.value = ''; els.speDIvaModo.value = 'netto'; els.speDData.value = ''; els.speDDoc.value = ''; els.speDNote.value = '';
  DG.speseDrawerSalva();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(scritture.length === 1 && scritture[0].categoria === 'Vincolo allenatori', 'il nome cambia');
  assert.ok(!('importoSostenuto' in scritture[0]), 'il Già speso non viene riscritto: ' + JSON.stringify(scritture[0]));
  assert.strictEqual(v.importoSostenuto, 80);
});

/* ---------- sponsor senza piano di pagamento: entrate senza data ---------- */
t('Bilancio: uno sponsor chiuso senza tranche va in «Entrate senza data» e i totali tornano', () => {
  const B = stato({
    _sponsorizzazioni: [{ id: 'sp1', seasonId: 's1', aziendaId: 'az1', stato: 'chiuso', importoConfermato: 500 }, { id: 'sp2', seasonId: 's1', aziendaId: 'az2', stato: 'chiuso', importoConfermato: 800 }, { id: 'sp3', seasonId: 's1', aziendaId: 'az3', stato: 'prospect', importoConfermato: 900 }],
    _tranche: [{ sponsorizzazioneId: 'sp2', importo: 800, scadenza: '2026-08-31', pagato: true, dataIncasso: '2026-09-02' }],
    _vociSpesa: [{ importoSostenuto: 100, dataSpesa: '2026-09-10', categoriaSpesaId: 'c1' }] });
  const r = B._calcBilancioMensile();
  const ultima = r.righe[r.righe.length - 1];
  assert.strictEqual(ultima.label, 'Entrate senza data'); assert.strictEqual(ultima.entrate, 500);
  assert.strictEqual(r.totEntrate, 1300, 'sponsor con tranche (800) + sponsor senza piano (500); il prospect non conta');
  assert.strictEqual(r.entrateList[r.entrateList.length - 1].scadenza, '', 'nell’elenco degli incassi la voce senza data sta in fondo');
  assert.strictEqual(B._calcBilancioMensile('fonte:Sponsor').totEntrate, 1300);
  assert.strictEqual(B._calcBilancioMensile('cat:c1').totEntrate, 0);
  assert.strictEqual(B._calcBilancioPerCategoria === undefined, false);
});

/* ---------- cassa.js: numeri unificati, previsione di cassa, squadre, «Da fare» ---------- */
function statoCassa(extra) {
  const { doc, els } = ambienteDom();
  ['panDaFare', 'panCassaLegenda', 'panCassaSvg', 'heroPrevisto', 'panSquadreBody', 'prevLegenda', 'prevSvg', 'prevNote', 'prevBody'].forEach((id) => doc.getElementById(id));
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = Object.assign({
    _currentSeasonId: 's1', _seasons: [{ id: 's1', nome: '2026/2027', dataFine: tra(300) }],
    _sponsorizzazioni: [
      { id: 'sp1', seasonId: 's1', aziendaId: 'az1', stato: 'chiuso', importoConfermato: 3000 },
      { id: 'sp2', seasonId: 's1', aziendaId: 'az2', stato: 'chiuso', importoConfermato: 500 },
      { id: 'sp3', seasonId: 's1', aziendaId: 'az3', stato: 'prospect', importoConfermato: 900 }],
    _tranche: [
      { sponsorizzazioneId: 'sp1', importo: 1000, scadenza: tra(-30), pagato: true },
      { sponsorizzazioneId: 'sp1', importo: 1000, scadenza: tra(-5), pagato: false },
      { sponsorizzazioneId: 'sp1', importo: 1000, scadenza: tra(40), pagato: false },
      { sponsorizzazioneId: 'sp3', importo: 700, scadenza: tra(-9), pagato: false }],
    _categorieAtleti: [{ id: 'k1', nome: 'Under 13 maschile' }, { id: 'k2', nome: 'Società' }],
    _atletiRette: [{ id: 'a1', nome: 'Luca', cognome: 'Rossi', categoriaAtletiId: 'k1' }],
    _rateAtleti: [
      { atletaRettaId: 'a1', importo: 120, scadenza: tra(-60), pagata: true },
      { atletaRettaId: 'a1', importo: 105, scadenza: tra(-2), pagata: false },
      { atletaRettaId: 'a1', importo: 105, scadenza: tra(70), pagata: false },
      { atletaRettaId: 'altro', importo: 999, scadenza: tra(-2), pagata: false }],
    _tessere: [{ numero: 1, nome: 'Mario', pagata: true }, { numero: 2, nome: 'Anna', pagata: false }, { numero: 3, nome: 'Paolo', pagata: false }, { numero: 4, nome: '', pagata: false }],
    _categorieSpesa: [{ id: 'c1', nome: 'Under 13 Maschile' }, { id: 'c2', nome: 'Società' }, { id: 'c3', nome: 'Federazione' }],
    _vociSpesa: [
      voce({ categoriaSpesaId: 'c1', importoPreventivato: 1000, importoSostenuto: 400, dataSpesa: tra(10) }),
      voce({ categoriaSpesaId: 'c2', importoPreventivato: 300 }),
      voce({ categoriaSpesaId: 'c3', isIva: true, importoPreventivato: 220, ivaScadenza: tra(45), pagata: false }),
      voce({ categoriaSpesaId: 'c3', importoPreventivato: 100, importoSostenuto: 100, dataSpesa: tra(-20) }),
      voce({ categoriaSpesaId: 'c3', isIva: true, importoPreventivato: 50, importoSostenuto: 50, ivaScadenza: tra(-20), pagata: true })],
    _calcTessere: () => ({ prezzo: 20, assegnate: 3, pagate: 1, incassato: 20, daIncassare: 40, righe: [] }),
    _calcRiepilogo: () => ({ entrateConfermate: 1640, saldo: 1240, uscite: 400, sponsorChiusi: 1500, tessere: 20, obiettivo: 0 }),
    _renderIvaRiepilogo: () => { B._ivaRenderizzata = true; },
    _renderStatCards: noop, _renderCharts: noop, _renderBilancio: noop, _delIconSm: () => '', _speseFilterCategoriaId: '', _speseExpanded: {},
    _trimestreIvaDaData: () => null, _aziendaById: (id) => ({ ragioneSociale: 'Azienda ' + id }), _switchBudgetTab: (x) => { B._tabAperta = x; },
    _atletaRettaById: () => null, _sponsorDaIncassare: () => 0, _calcRetteAtleti: () => ({ totIncassato: 0, totPrevisto: 0, righe: [] })
  }, extra || {});
  B._sponsorChiusi = B._sponsorChiusi || (() => B._sponsorizzazioni.filter((s) => s.seasonId === B._currentSeasonId && s.stato === 'chiuso'));   // come in state.js
  const window = { Admin: { budgetShared: B, esc, fmtDate: (d) => d, fmtDateLong: (d) => d, avviso: noop, logWrite: () => Promise.resolve(), diff: () => [] }, AdminActions: {}, VV: B.__VV };
  ['bilancio.js', 'spese.js', 'altre.js', 'stagioni.js', 'sponsor-elenco.js', 'cassa.js'].forEach((f) => new Function('window', 'document', 'db', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', f), 'utf8'))(window, doc, {}));
  return { B, els };
}

t('Cassa: numeri unificati (da incassare, ritardi, previsto a fine stagione)', () => {
  const { B } = statoCassa();
  const n = B._calcNumeri(oggi);
  assert.strictEqual(n.incassato, 1640);
  assert.strictEqual(n.daIncassare, 1000 + 1000 + 105 + 105 + 2 * 20, 'tranche e rate non pagate dello sponsor chiuso e degli atleti della stagione, più 2 tessere (il prospect e l’atleta di un’altra stagione non contano)');
  assert.strictEqual(n.ritardoN, 2); assert.strictEqual(n.ritardoEur, 1105); assert.strictEqual(n.ritardoRate, 1); assert.strictEqual(n.ritardoTranche, 1);
  assert.strictEqual(n.spesePrevisto, 1000 + 300 + 220 + 100 + 50);
  assert.strictEqual(n.fineStagione, 1640 + n.daIncassare - n.spesePrevisto);
  assert.deepStrictEqual(n.senzaPiano, { n: 1, eur: 500 });
  assert.strictEqual(n.inCassa, 1240);
});
t('Cassa: previsione mese per mese (scaduto = mese corrente, senza data fuori, IVA versata esclusa)', () => {
  const { B } = statoCassa();
  const p = B._calcPrevisioneCassa(oggi);
  assert.strictEqual(p.righe[0].k, oggi.slice(0, 7));
  assert.ok(p.righe[0].entrate >= 1105, 'tranche e rata scadute contano nel mese corrente');
  assert.strictEqual(p.righe.reduce((s, r) => s + r.entrate, 0), 1000 + 105 + 1000 + 105);
  assert.strictEqual(p.righe.reduce((s, r) => s + r.uscite, 0), 600 + 220, 'residuo della voce con data + IVA da versare; niente voce senza data, niente IVA già versata');
  assert.strictEqual(p.senzaDataUscite, 300); assert.strictEqual(p.senzaDataEntrate, 40);
  assert.strictEqual(p.inizio, 1240);
  assert.strictEqual(p.righe[p.righe.length - 1].saldo, 1240 + 2210 - 820);
  assert.ok(p.righe.length >= 9, 'arriva a fine stagione');
  p.righe.reduce((prev, r) => { assert.strictEqual(r.saldo, prev + r.entrate - r.uscite); return r.saldo; }, 1240);
});
t('Cassa: rendimento per squadra («Società» non è una squadra, il resto va in «Società e generali»)', () => {
  const { B } = statoCassa();
  const sq = B._calcPerSquadra();
  assert.deepStrictEqual(sq.map((x) => x.nome), ['Under 13 maschile', 'Società e generali']);
  assert.deepStrictEqual([sq[0].entrate, sq[0].incassato, sq[0].spese, sq[0].margine], [330, 120, 1000, -670]);
  assert.deepStrictEqual([sq[1].entrate, sq[1].incassato, sq[1].spese, sq[1].margine], [3500 + 60, 1500 + 20, 300 + 220 + 100 + 50, 3560 - 670]);
});
t('Cassa: una squadra del sito senza rette ha comunque la sua riga con le spese', () => {
  const { B } = statoCassa({ __VV: { getCategories: () => [{ name: 'Prima Divisione' }, { name: 'Società' }] }, _categorieSpesa: [{ id: 'c1', nome: 'Prima Divisione' }, { id: 'c2', nome: 'Federazione' }], _vociSpesa: [voce({ categoriaSpesaId: 'c1', importoPreventivato: 700 }), voce({ categoriaSpesaId: 'c2', importoPreventivato: 50 })] });
  const sq = B._calcPerSquadra();
  const pd = sq.filter((x) => x.nome === 'Prima Divisione')[0];
  assert.ok(pd && pd.spese === 700 && pd.entrate === 0 && pd.margine === -700, 'riga della Prima Divisione');
  assert.strictEqual(sq.filter((x) => x.nome === 'Società e generali')[0].spese, 50, 'le altre spese restano nei generali');
  assert.ok(!sq.some((x) => x.nome === 'Società'), '«Società» non è una squadra');
});
t('Cassa: «Da fare» in ordine di urgenza, con la scheda giusta per ciascuno', () => {
  const { B } = statoCassa();
  const l = B._calcDaFare(oggi);
  assert.deepStrictEqual(l.map((x) => x.tab), ['rette', 'spese', 'bilancio', 'sponsor', 'spese', 'tessere']);
  assert.strictEqual(l[0].liv, 'bad'); assert.ok(/2 incassi in ritardo/.test(l[0].testo));
  assert.strictEqual(l[1].spese, 'in-scadenza'); assert.strictEqual(l[2].sub, 'iva'); assert.strictEqual(l[4].spese, 'senza-data');
  assert.ok(/1 sponsor chiuso senza piano/.test(l[3].testo) && /2 tessere assegnate/.test(l[5].testo));
  B._vaiA(l[1]); assert.strictEqual(B._tabAperta, 'spese'); assert.strictEqual(B._speseStato, 'in-scadenza');
  B._vaiA(l[2]); assert.strictEqual(B._tabAperta, 'bilancio'); assert.strictEqual(B._bilSub, 'iva');
});
t('Cassa cattiva: una cassa che va sotto zero è il primo avviso', () => {
  const { B } = statoCassa({ _calcRiepilogo: () => ({ entrateConfermate: 100, saldo: -5000, uscite: 5100, sponsorChiusi: 100, tessere: 0, obiettivo: 0 }) });
  const l = B._calcDaFare(oggi);
  assert.strictEqual(l[0].liv, 'bad'); assert.ok(/La cassa va sotto zero/.test(l[0].testo)); assert.strictEqual(l[0].sub, 'prev');
});
t('Cassa: Panoramica e Bilancio si disegnano (schede, grafico, tabelle)', () => {
  const { B, els } = statoCassa();
  B._renderPanoramicaBlocchi();
  assert.ok(/data-todo="0"/.test(els.panDaFare.innerHTML) && /in ritardo/.test(els.panDaFare.innerHTML));
  assert.ok(els.panCassaSvg.innerHTML.includes('<polyline') && els.panCassaLegenda.innerHTML.includes('Saldo in cassa'));
  assert.ok(/Under 13 maschile/.test(els.panSquadreBody.innerHTML) && /Società e generali/.test(els.panSquadreBody.innerHTML));
  assert.ok(/a fine stagione/.test(els.heroPrevisto.innerHTML));
  B._bilSub = 'prev'; B._renderBilancioSezioni();
  assert.ok((els.prevBody.innerHTML.match(/<tr>/g) || []).length >= 9 && els.prevSvg.innerHTML.includes('<polyline'));
  assert.ok(/di spese senza data non sono incluse/.test(els.prevNote.innerHTML));
  B._bilSub = 'iva'; B._renderBilancioSezioni(); assert.strictEqual(B._ivaRenderizzata, true);
});

t('Altre entrate: totali, incassi attesi, mese d’incasso, Bilancio e ritardi', () => {
  const { B } = statoCassa({ _sponsorIncassato: () => 0, _altreEntrate: [
    { id: 'x1', descrizione: 'Contributo Comune', importo: 500, data: tra(-3), pagata: false },
    { id: 'x2', descrizione: 'Torneo estivo', importo: 300, data: tra(-40), pagata: true, dataIncasso: '2026-09-12' },
    { id: 'x3', descrizione: 'Donazione', importo: 50, pagata: false }] });
  const c = B._calcAltreEntrate();
  assert.deepStrictEqual([c.incassato, c.daIncassare, c.previsto, c.n], [300, 550, 850, 3]);
  const att = B._incassiAttesi().filter((e) => e.fonte === 'Altre entrate');
  assert.deepStrictEqual(att.map((e) => e.importo).sort(), [50, 500]);
  const n = B._calcNumeri(oggi);
  assert.strictEqual(n.ritardoAltre, 1, 'solo il contributo con data passata è in ritardo (la donazione non ha data)');
  assert.strictEqual(n.daIncassare, 1000 + 1000 + 105 + 105 + 2 * 20 + 550);
  const m = B._calcBilancioMensile();
  assert.ok(m.entrateList.some((e) => e.tipo === 'Altre entrate' && e.scadenza === '2026-09-12' && e.importo === 300), 'incassata: mese della data d’incasso');
  assert.ok(!m.entrateList.some((e) => e.nome === 'Contributo Comune'), 'non incassata: fuori dal consuntivo');
  assert.strictEqual(B._calcBilancioMensile('fonte:Altre entrate').totEntrate, 300);
  const cat = B._calcBilancioPerCategoria().entrate.filter((e) => e.fonte === 'Altre entrate')[0];
  assert.deepStrictEqual([cat.incassato, cat.daIncassare], [300, 550]);
  assert.ok(B._calcDaFare(oggi)[0].testo.indexOf('altra entrata') !== -1);
});

t('CSV per il commercialista: entrate e uscite reali, celle sicure, decimali all’italiana', () => {
  const { B } = statoCassa({ _sponsorIncassato: () => 0,
    _tranche: [{ sponsorizzazioneId: 'sp1', importo: 1000.5, scadenza: '2026-07-31', pagato: true, dataIncasso: '2026-10-05' }],
    _vociSpesa: [
      voce({ categoria: '=CMD', categoriaSpesaId: 'c3', importoPreventivato: 120, importoSostenuto: 100, dataSpesa: '2026-09-01', documentoUrl: 'https://drive.example/f' }),
      voce({ categoria: 'Mai pagata', categoriaSpesaId: 'c3', importoPreventivato: 50 }),
      voce({ categoria: 'IVA non versata', isIva: true, importoSostenuto: 22, pagata: false })] });
  const e = B._csvEntrate().replace(/^﻿/, '').split('\r\n'), u = B._csvUscite().replace(/^﻿/, '').split('\r\n');
  assert.strictEqual(e[0], 'Data incasso;Fonte;Nome;Importo;Note'); assert.ok(e.some((r) => /^2026-10-05;Sponsor;Azienda az1;1000,5;/.test(r)), e.join(' / '));
  assert.strictEqual(u.filter((r) => /Mai pagata|IVA non versata/.test(r)).length, 0, 'solo la spesa pagata: né quella mai pagata né l’IVA non versata');
  assert.ok(u.some((r) => r.indexOf("'=CMD") !== -1), 'la formula è neutralizzata'); assert.ok(/https:\/\/drive\.example\/f$/.test(u[1]));
});
t('Copia del budget: voci a zero speso, date +1 anno, IVA collegata rifatta, niente IVA sponsor', () => {
  const { B } = statoCassa();
  let n = 0; const nuovoId = () => 'n' + (++n);
  const voci = [
    { id: 'v1', categoria: 'Palestra', categoriaSpesaId: 'c1', importoPreventivato: 1000, importoSostenuto: 400, dataSpesa: '2026-11-15', pagata: true, ivaAliquota: 22, ivaVoceSpesaId: 'v2', documentoUrl: 'https://x.it', note: 'ok' },
    { id: 'v2', categoria: 'IVA palestra', isIva: true, importoPreventivato: 220, importoSostenuto: 100, dataSpesa: '2026-11-15', ivaScadenza: '2026-11-16', ivaScadenzaManuale: true, pagata: true },
    { id: 'v3', categoria: 'IVA sponsor', isIva: true, importoPreventivato: 50, importoSostenuto: 50, pagata: true }];
  const cat = [{ id: 'k1', nome: 'Under 13', rettaUnitaria: 105 }];
  const r = B._copiaBudgetDati(voci, cat, 's2', nuovoId);
  assert.strictEqual(r.voci.length, 2, 'l’IVA sponsor non si copia'); assert.strictEqual(r.categorie.length, 1);
  const p = r.voci.find((x) => x.data.categoria === 'Palestra').data, i = r.voci.find((x) => x.data.isIva).data, idIva = r.voci.find((x) => x.data.isIva).id;
  assert.deepStrictEqual([p.seasonId, p.importoPreventivato, p.importoSostenuto, p.dataSpesa, p.ivaVoceSpesaId], ['s2', 1000, 0, '2027-11-15', idIva]);
  assert.strictEqual(p.documentoUrl, undefined); assert.strictEqual(p.pagata, undefined);
  assert.deepStrictEqual([i.importoSostenuto, i.pagata, i.ivaScadenza, i.ivaTrimestre], [0, false, '2027-11-16', '']);
  assert.deepStrictEqual(r.categorie[0].data, { seasonId: 's2', nome: 'Under 13', rettaUnitaria: 105 });
});
t('Copia del budget: le voci automatiche (Tesseramenti, Materiali sponsor) e la loro IVA non si copiano', () => {
  const { B } = statoCassa();
  let n = 0; const nuovoId = () => 'n' + (++n);
  const voci = [
    { id: 'v1', categoria: 'Palestra', importoPreventivato: 1000, ivaAliquota: 22, ivaVoceSpesaId: 'v2' },
    { id: 'v2', categoria: 'IVA Palestra', isIva: true, importoPreventivato: 220 },
    { id: 't1', categoria: 'Tesseramenti atleti', tesseramenti: true, importoPreventivato: 500 },
    { id: 'm1', categoria: 'Materiali sponsor — Stampe', importoPreventivato: 300, ivaAliquota: 22, ivaVoceSpesaId: 'm2' },
    { id: 'm2', categoria: 'IVA Materiali sponsor — Stampe', isIva: true, importoPreventivato: 66 },
    { id: 'p1', categoria: 'Materiali sponsor — Pezzi', importoPreventivato: 100 }];
  const r = B._copiaBudgetDati(voci, [], 's2', nuovoId, ['m1', 'p1']);
  assert.deepStrictEqual(r.voci.map((x) => x.data.categoria).sort(), ['IVA Palestra', 'Palestra']);
  const orfane = [{ id: 'v1', categoria: 'Palestra', importoPreventivato: 1000 }, { id: 't1', categoria: 'Tesseramenti atleti', tesseramenti: true, importoPreventivato: 500 },
    { id: 'o1', categoria: 'IVA Tesseramenti atleti', isIva: true, importoPreventivato: 110 }, { id: 'o2', categoria: 'IVA Materiali sponsor — Pezzi', isIva: true, importoPreventivato: 22 },
    { id: 'p1', categoria: 'Materiali sponsor — Pezzi', importoPreventivato: 100 }];
  const r2 = B._copiaBudgetDati(orfane, [], 's2', nuovoId, ['p1']);
  assert.deepStrictEqual(r2.voci.map((x) => x.data.categoria), ['Palestra'], 'anche l’IVA senza collegamento alla voce madre si salta, riconosciuta dal nome')
});
t('Confronto tra stagioni: totali per fonte e per categoria di spesa', () => {
  const { B } = statoCassa();
  const dati = { sponsorizzazioni: [{ id: 'a', stato: 'chiuso' }, { id: 'b', stato: 'prospect' }], sponsorIncassato: (s) => (s.id === 'a' ? 500 : 999),
    atletiRette: [{ id: 'r1' }], rate: [{ atletaRettaId: 'r1', importo: 100, pagata: true }, { atletaRettaId: 'r1', importo: 100, pagata: false }, { atletaRettaId: 'altro', importo: 77, pagata: true }],
    tessere: [{ nome: 'Mario', pagata: true }, { nome: '', pagata: true }, { nome: 'Anna', pagata: false }], prezzoTessera: 20,
    supercoppa: [{ nome: 'Luca', pagata: true }, { nome: 'Sara', pagata: true }, { nome: '', pagata: true }, { nome: 'Gino', pagata: false }], prezzoSupercoppa: 35,
    altre: [{ importo: 300, pagata: true }, { importo: 50, pagata: false }],
    voci: [{ categoriaSpesaId: 'c1', importoSostenuto: 200 }, { categoriaSpesaId: 'c1', importoSostenuto: 50 }, { importoSostenuto: 10 }, { categoriaSpesaId: 'c2', importoSostenuto: 0 }],
    nomeCategoria: (id) => (id === 'c1' ? 'Federazione' : 'Società') };
  const x = B._totaliStagione(dati);
  assert.deepStrictEqual(x.entrate, { 'Sponsor': 500, 'Rette atleti': 100, 'Tessere': 20, 'Evento Supercoppa Bari': 70, 'Altre entrate': 300 });
  assert.deepStrictEqual([x.totEntrate, x.totSpese, x.saldo], [990, 260, 730]);
  assert.deepStrictEqual(x.spese, { 'Federazione': 250, 'Senza categoria': 10 });
});

t('Supercoppa: incassato e da incassare contano solo i posti con un nome (pagati / non pagati)', () => {
  const B = { _currentSeasonId: 's', _supercoppa: [{ numero: 1, nome: 'A', pagata: true }, { numero: 2, nome: 'B', pagata: false },
    { numero: 3, nome: '', pagata: true }, { numero: 4, nome: '  ', pagata: false }, { numero: 5, nome: 'C', pagata: false }] };
  const window = { Admin: { budgetShared: B, esc: (x) => x, confirm: noop, logWrite: noop, diff: noop }, AdminActions: {} };
  new Function('window', 'document', 'db', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'supercoppa.js'), 'utf8'))(window, document, {});
  const c = B._calcSupercoppa();
  assert.deepStrictEqual([c.assegnate, c.pagate, c.incassato, c.daIncassare, c.previsto], [3, 1, 35, 70, 105]);
  assert.deepStrictEqual(c.righe.map((r) => r.numero), [1]);
});

function caricaQuote(file, B, db) {
  const window = { Admin: { budgetShared: B, esc: (x) => x, confirm: noop, logWrite: () => Promise.resolve(), diff: () => [], oggiLocale: () => '2026-11-12' }, AdminActions: {} };
  new Function('window', 'document', 'db', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', file), 'utf8'))(window, document, db);
  return window.AdminActions;
}
t('Tessere e Supercoppa: importo salvato sul pagamento, ripiego 20 e 35 se manca', () => {
  const T = { _currentSeasonId: 's', _tessere: [{ numero: 1, nome: 'A', pagata: true }, { numero: 2, nome: 'B', pagata: true, importo: 25 }, { numero: 3, nome: 'C', pagata: false }] };
  caricaQuote('tessere.js', T, {});
  const ct = T._calcTessere();
  assert.deepStrictEqual([ct.incassato, ct.daIncassare, ct.righe.map((r) => r.importo)], [45, 20, [20, 25]]);
  const S = { _currentSeasonId: 's', _supercoppa: [{ numero: 1, nome: 'A', pagata: true }, { numero: 2, nome: 'B', pagata: true, importo: 40 }, { numero: 3, nome: 'C', pagata: false }] };
  caricaQuote('supercoppa.js', S, {});
  const cs = S._calcSupercoppa();
  assert.deepStrictEqual([cs.incassato, cs.daIncassare, cs.previsto, cs.righe.map((r) => r.importo)], [75, 35, 110, [35, 40]]);
});
ta('Tessere e Supercoppa: al pagamento si salva l importo, se era gia pagata resta quello di allora', () => {
  const scritti = [];
  const db = { collection: () => ({ doc: (id) => ({ set: (d) => { scritti.push(Object.assign({ id }, d)); return Promise.resolve(); } }) }) };
  const T = { _currentSeasonId: 's', _tessere: [{ id: 's_1', numero: 1, nome: 'A', pagata: false }, { id: 's_2', numero: 2, nome: 'B', pagata: true, importo: 25 }, { id: 's_3', numero: 3, nome: 'C', pagata: true }] };
  const DG = caricaQuote('tessere.js', T, db);
  document.getElementById = () => el();
  DG.tesseraTogglePagata(1, true);
  DG.tesseraSalvaAccessorio(2, 'cappellino');
  DG.tesseraSalvaAccessorio(3, 'sciarpa');
  const S = { _currentSeasonId: 's', _supercoppa: [{ id: 's_1', numero: 1, nome: 'A', pagata: false }, { id: 's_2', numero: 2, nome: 'B', pagata: true, importo: 40 }] };
  const DS = caricaQuote('supercoppa.js', S, db);
  DS.supercoppaTogglePagata(1, true);
  DS.supercoppaToggleTesserato(2, true);
  return Promise.resolve().then(() => new Promise((r) => setTimeout(r, 20))).then(() => {
    assert.deepStrictEqual(scritti.map((x) => x.importo), [20, 25, 20, 35, 40]);
  });
});
t('Confronto stagioni: usa l importo di ogni pagamento, ripiego sul prezzo base', () => {
  const { B } = statoCassa();
  const x = B._totaliStagione({ sponsorizzazioni: [], sponsorIncassato: () => 0, atletiRette: [], rate: [], altre: [], voci: [], nomeCategoria: () => '',
    tessere: [{ nome: 'A', pagata: true, importo: 25 }, { nome: 'B', pagata: true }], prezzoTessera: 20,
    supercoppa: [{ nome: 'C', pagata: true, importo: 40 }, { nome: 'D', pagata: true }], prezzoSupercoppa: 35 });
  assert.deepStrictEqual([x.entrate['Tessere'], x.entrate['Evento Supercoppa Bari']], [45, 75]);
});

t('Totali con i centesimi, righe all euro', () => {
  const B = carica(stato());
  assert.strictEqual(B._eur(1234.5), '€' + Math.round(1234.5).toLocaleString('it-IT'));
  assert.strictEqual(B._eurTot(100), B._eur(100));
  assert.strictEqual(B._eurTot(1234), B._eur(1234));
  assert.strictEqual(B._eurTot(10.5), '€10,50');
  assert.strictEqual(B._eurTot(0.1 + 0.2), '€0,30');
  assert.strictEqual(B._eurTot(99.999), '€100');
  assert.strictEqual(B._eurTotSigned(-260.25), '-€260,25');
  assert.strictEqual(B._eurTotSigned(-0.001), '€0');
  assert.strictEqual(B._eurTotSigned(50), '€50');
});
t('Pipeline sponsor in elenco: stato, incassato/da incassare, responsabile, logo sul sito', () => {
  const { B } = statoCassa({
    STATI: ['prospect', 'contattato', 'in_trattativa', 'chiuso', 'rifiutato'], _dirigentiList: [{ id: 'd1', nome: 'Anna', cognome: 'Bianchi' }],
    _nextPromemoria: (id) => (id === 'p1' ? { dataScadenza: '2026-11-03' } : null), _isStorico: (id) => id === 'az9',
    _statoLabel: (s) => s, _statoColor: () => '#000', _sponsorIncassato: (s) => (s.id === 'c1' ? 1000 : 0), _sponsorDaIncassare: (s) => (s.id === 'c1' ? 2000 : 0),
    _aziende: [{ id: 'az1', sponsorSitoId: 7 }],
    _sponsorizzazioni: [
      { id: 'c1', seasonId: 's1', aziendaId: 'az1', stato: 'chiuso', importoConfermato: 3000, importoStimato: 9, dirigenteResponsabileId: 'd1' },
      { id: 'p1', seasonId: 's1', aziendaId: 'az9', stato: 'prospect', importoStimato: 500 },
      { id: 'x1', seasonId: 's0', aziendaId: 'az1', stato: 'chiuso', importoConfermato: 99 }],
    _aziendaById: (id) => ({ id, ragioneSociale: 'Azienda ' + id, sponsorSitoId: id === 'az1' ? 7 : null }),
    __VV: { getSponsors: () => [{ id: 7, nome: 'Logo', livello: 'gold', logo: 'x.png' }] }
  });
  const r = B._righeElencoSponsor(false, 'd1');
  assert.deepStrictEqual(r.map((x) => x.id), ['p1', 'c1'], 'ordinati per fase della pipeline; l’altra stagione non conta');
  assert.deepStrictEqual([r[1].importo, r[1].incassato, r[1].daIncassare, r[1].responsabile, r[1].sito.livello], [3000, 1000, 2000, 'Anna Bianchi', 'gold']);
  assert.deepStrictEqual([r[0].importo, r[0].incassato, r[0].storico, r[0].promemoria, r[0].sito], [500, 0, true, '2026-11-03', null]);
  assert.deepStrictEqual(B._righeElencoSponsor(true, 'd1').map((x) => x.id), ['c1'], '«solo i miei»');
});

/* ---------- IVA degli sponsor: l'importo confermato è il totale IVA compresa ---------- */
function ivaSponsor() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'sponsor.js'), 'utf8').split(String.fromCharCode(13)).join('');
  const i = src.indexOf('function _sponsorIvaCalc'), j = src.indexOf('B._sponsorIvaCalc =');
  assert.ok(i > 0 && j > i, 'funzione _sponsorIvaCalc non trovata in sponsor.js');
  return new Function(src.slice(i, j) + '; return _sponsorIvaCalc;')();
}
t('IVA sponsor: 6.100 € con IVA 22% compresa → imponibile 5.000, IVA 1.100, da versare 11% = 550', () => {
  const c = ivaSponsor()(6100, { ivaInclusaPct: 22, ivaVersarePct: 11 });
  assert.deepStrictEqual([c.imponibile, c.ivaInclusa, c.daVersare, c.versarePct], [5000, 1100, 550, 11]);
});
ta('IVA sponsor: una voce NUOVA prende data e trimestre dall’ultimo incasso (o dall’ultima scadenza); una già esistente non si tocca', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'sponsor.js'), 'utf8').split(String.fromCharCode(13)).join('');
  const i = src.indexOf('function _trancheOf'), j = src.indexOf('B._sponsorIvaCalc ='), k = src.indexOf('function _syncSponsorIva'), l = src.indexOf('/* Migrazione una tantum');
  assert.ok(i > 0 && j > i && k > j && l > k, 'funzioni non trovate in sponsor.js');
  const costruisci = (B) => {
    const scritti = [];
    const db = { collection: () => ({ doc: () => ({ id: 'nuova', set: (d) => { scritti.push(d); return Promise.resolve(); }, update: () => Promise.resolve(), delete: () => Promise.resolve() }) }) };
    const f = new Function('B', 'db', '_logWrite', '_diff', src.slice(i, j) + src.slice(j, j + 'B._sponsorIvaCalc = _sponsorIvaCalc;'.length) + '\n' + src.slice(k, l) + '; return _syncSponsorIva;')(B, db, () => Promise.resolve(), () => []);
    return { f, scritti };
  };
  const B = { _todayISO: () => '2026-11-12', _tranche: [{ sponsorizzazioneId: 'x', pagato: true, importo: 1000, dataIncasso: '2026-10-05', scadenza: '2026-09-30' }, { sponsorizzazioneId: 'x', pagato: false, importo: 1000, scadenza: '2026-12-31' }], _vociSpesa: [], _aziendaById: () => ({ ragioneSociale: 'Rossi' }), _trimestreIvaDaData: (d) => (d <= '2026-12-31' && d > '2026-09-30' ? { trimestre: 'T4', scadenza: '2027-03-16' } : null) };
  const a = costruisci(B);
  await a.f({ id: 'x', seasonId: 's1', aziendaId: 'az', stato: 'chiuso', importoConfermato: 2000 });
  assert.strictEqual(a.scritti.length, 1); assert.strictEqual(a.scritti[0].dataSpesa, '2026-10-05', 'ultimo incasso: la rata futura non incassata non conta');
  assert.deepStrictEqual([a.scritti[0].ivaTrimestre, a.scritti[0].ivaScadenza], ['T4', '2027-03-16']);
  const m = costruisci(Object.assign({}, B, { _tranche: [{ sponsorizzazioneId: 'x', pagato: true, dataIncasso: '2026-10-05' }, { sponsorizzazioneId: 'x', pagato: false, scadenza: '2026-11-01' }, { sponsorizzazioneId: 'x', pagato: false, scadenza: '2027-06-30' }] }));
  await m.f({ id: 'x', seasonId: 's1', aziendaId: 'az', stato: 'chiuso', importoConfermato: 2000 });
  assert.strictEqual(m.scritti[0].dataSpesa, '2026-11-01', 'scadenza già maturata non incassata conta, quella futura no');
  const f = costruisci(Object.assign({}, B, { _tranche: [{ sponsorizzazioneId: 'x', pagato: false, scadenza: '2027-06-30' }, { sponsorizzazioneId: 'x', pagato: false, scadenza: '2027-05-30' }] }));
  await f.f({ id: 'x', seasonId: 's1', aziendaId: 'az', stato: 'chiuso', importoConfermato: 2000 });
  assert.strictEqual(f.scritti[0].dataSpesa, '2027-05-30', 'nessuna data utile: prima scadenza futura');
  const b = costruisci(Object.assign({}, B, { _vociSpesa: [{ id: 'g', dataSpesa: '', ivaTrimestre: '', ivaScadenza: '' }] }));
  await b.f({ id: 'x', seasonId: 's1', aziendaId: 'az', stato: 'chiuso', importoConfermato: 2000, ivaVoceSpesaId: 'g' });
  assert.strictEqual(b.scritti.length, 0, 'la voce esistente non viene ricreata');
});
ta('IVA sponsor senza piano di pagamento: l’IVA sostenuta segue l’incasso intero; con le tranche passa alle sole pagate (niente doppio conteggio)', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'sponsor.js'), 'utf8').split(String.fromCharCode(13)).join('');
  const i = src.indexOf('function _trancheOf'), j = src.indexOf('B._sponsorIvaCalc ='), k = src.indexOf('function _syncSponsorIva'), l = src.indexOf('/* Migrazione una tantum');
  const esegui = async (tranche, sp) => {
    const patch = [];
    const figlia = { id: 'g', isIva: true, importoSostenuto: 0, importoPreventivato: 0, dataSpesa: '2026-10-01', ivaTrimestre: 'T4', ivaScadenza: '2027-03-16' };
    const B = { _todayISO: () => '2026-11-12', _tranche: tranche, _vociSpesa: [figlia], _aziendaById: () => ({ ragioneSociale: 'Rossi' }), _trimestreIvaDaData: () => null };
    const db = { collection: () => ({ doc: () => ({ update: (p) => { patch.push(p); return Promise.resolve(); }, delete: () => Promise.resolve() }) }) };
    const f = new Function('B', 'db', '_logWrite', '_diff', src.slice(i, j) + src.slice(j, j + 'B._sponsorIvaCalc = _sponsorIvaCalc;'.length) + '\n' + src.slice(k, l) + '; return _syncSponsorIva;')(B, db, () => Promise.resolve(), () => []);
    await f(Object.assign({ id: 'x', seasonId: 's1', aziendaId: 'az', stato: 'chiuso', importoConfermato: 6100, ivaVoceSpesaId: 'g', ivaInclusaPct: 22, ivaVersarePct: 11 }, sp || {}));
    return patch[0];
  };
  const senza = await esegui([]);
  assert.strictEqual(senza.importoSostenuto, 550, 'nessuna tranche: sostenuto = IVA dell’incasso intero'); assert.strictEqual(senza.importoPreventivato, 550);
  const conTranche = await esegui([{ sponsorizzazioneId: 'x', pagato: false, importo: 6100, scadenza: '2027-01-31' }]);
  assert.strictEqual(conTranche.importoSostenuto, 0, 'aggiunta una tranche non pagata: sostenuto 0, non 550 + altro');
  const meta = await esegui([{ sponsorizzazioneId: 'x', pagato: true, importo: 3050, dataIncasso: '2026-10-05' }, { sponsorizzazioneId: 'x', pagato: false, importo: 3050, scadenza: '2027-01-31' }]);
  assert.strictEqual(meta.importoSostenuto, 275, 'solo la tranche pagata');
  const aperto = await esegui([], { stato: 'in_trattativa' });
  assert.ok(!aperto || !aperto.importoSostenuto, 'sponsor non chiuso: niente IVA sostenuta');
});
t('IVA sponsor: senza IVA compresa resta il comportamento storico (11% dell’importo)', () => {
  const f = ivaSponsor();
  assert.deepStrictEqual([f(1000, {}).ivaInclusa, f(1000, {}).daVersare], [0, 110]);
  assert.strictEqual(f(1000, { ivaVersarePct: '' }).versarePct, 11, 'campo vuoto = 11');
  assert.strictEqual(f(1000, { ivaVersarePct: 0 }).daVersare, 0, 'zero è un valore valido: nessuna IVA da versare');
});
t('IVA sponsor: una rata incassata ripartisce l’IVA in proporzione', () => {
  const f = ivaSponsor(), s = { ivaInclusaPct: 22, ivaVersarePct: 11 };
  assert.strictEqual(f(3050, s).daVersare, 275, 'metà dei 6.100 € → metà dei 550 €');
});

t('IVA sponsor: importo fisso in € al posto della %, ripartito sulle rate incassate', () => {
  const f = ivaSponsor();
  const s = { importoConfermato: 6100, ivaInclusaPct: 22, ivaVersarePct: 11, ivaVersareFisso: 800 };
  assert.strictEqual(f(6100, s).daVersare, 800, 'vale l’importo fisso, non l’11% (550)');
  assert.strictEqual(f(3050, s).daVersare, 400, 'metà incassata → metà dell’IVA fissa');
  assert.strictEqual(f(9000, s).daVersare, 800, 'mai oltre l’importo fisso');
  assert.strictEqual(f(6100, { importoConfermato: 6100, ivaInclusaPct: 22, ivaVersareFisso: 0 }).daVersare, 550, 'fisso a zero = si usa la %');
  assert.strictEqual(f(6100, s).versarePct, 16, '800 su 5.000 di imponibile');
});

t('Pipeline sponsor: pagato / totale con percentuale (mai oltre il 100%)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', 'sponsor.js'), 'utf8').split(String.fromCharCode(13)).join('');
  const i = src.indexOf('function _sponsorPagato'), j = src.indexOf('B._sponsorPagato =');
  assert.ok(i > 0 && j > i, 'funzione _sponsorPagato non trovata');
  const f = (inc) => new Function('_sponsorIncassato', src.slice(i, j) + '; return _sponsorPagato;')(() => inc);
  assert.deepStrictEqual(f(3050)({ importoConfermato: 6100 }), { pagato: 3050, totale: 6100, pct: 50 });
  assert.deepStrictEqual(f(7000)({ importoConfermato: 6100 }), { pagato: 6100, totale: 6100, pct: 100 }, 'tranche oltre il totale: si ferma al 100%');
  assert.deepStrictEqual(f(0)({ importoConfermato: 0 }), { pagato: 0, totale: 0, pct: 0 });
});

/* ---------- IVA per cassa: lo stesso dato dà lo stesso saldo in Panoramica, Bilancio, Cassa ---------- */
t('IVA per cassa: sottratta dai saldi solo se «versata»; Panoramica = Bilancio = punto di partenza della previsione', () => {
  const { doc } = ambienteDom();
  const mk = (versata) => {
    const B = {
      _currentSeasonId: 's1', _seasons: [{ id: 's1', nome: '2026/2027', dataFine: tra(300) }],
      _sponsorizzazioni: [{ id: 'sp1', seasonId: 's1', aziendaId: 'az1', stato: 'chiuso', importoConfermato: 2000 }],
      _tranche: [{ sponsorizzazioneId: 'sp1', importo: 2000, scadenza: tra(-30), pagato: true, dataIncasso: tra(-30) }],
      _categorieAtleti: [], _atletiRette: [], _rateAtleti: [], _altreEntrate: [], _tessere: [], _categorieSpesa: [{ id: 'c1', nome: 'Federazione' }],
      _vociSpesa: [
        voce({ categoriaSpesaId: 'c1', importoPreventivato: 500, importoSostenuto: 500, dataSpesa: tra(-20) }),
        voce({ categoriaSpesaId: 'c1', isIva: true, importoPreventivato: 220, importoSostenuto: 220, dataSpesa: tra(-20), ivaScadenza: tra(40), pagata: versata })],
      _calcTessere: () => ({ prezzo: 0, assegnate: 0, pagate: 0, incassato: 0, daIncassare: 0, righe: [] }),
      _calcRetteAtleti: () => ({ totIncassato: 0, totPrevisto: 0, righe: [] }),
      _sponsorIncassato: () => 2000, _sponsorDaIncassare: () => 0, _aziendaById: (id) => ({ ragioneSociale: id }), _categoriaSpesaById: () => ({ nome: 'Federazione' }),
      _trimestreIvaDaData: () => null, _renderIvaRiepilogo: noop, _renderStatCards: noop, _renderCharts: noop, _renderBilancio: noop, _delIconSm: () => '', _speseFilterCategoriaId: '', _speseExpanded: {}, _sottospese: []
    };
    B._sponsorChiusi = () => B._sponsorizzazioni.filter((s) => s.seasonId === B._currentSeasonId && s.stato === 'chiuso');
    const esc = (x) => String(x == null ? '' : x);
    const window = { Admin: { budgetShared: B, esc, fmtDate: (d) => d, fmtDateLong: (d) => d, avviso: noop, logWrite: () => Promise.resolve(), diff: () => [] }, AdminActions: {} };
    ['bilancio.js', 'spese.js', 'riepilogo.js', 'cassa.js'].forEach((f) => new Function('window', 'document', 'db', fs.readFileSync(path.join(__dirname, '..', 'js', 'admin', 'budget', f), 'utf8'))(window, doc, {}));
    return B;
  };
  [false, true].forEach((versata) => {
    const B = mk(versata), r = B._calcRiepilogo(), bil = B._calcBilancioMensile(), p = B._calcPrevisioneCassa(oggi), k = B._calcSpeseKpi(oggi);
    const atteso = 2000 - 500 - (versata ? 220 : 0);
    assert.strictEqual(r.saldo, atteso, 'Panoramica (versata=' + versata + ')');
    assert.strictEqual(bil.totEntrate - bil.totUscite, atteso, 'Bilancio mensile = Riepilogo generale del PDF');
    assert.strictEqual(p.inizio, atteso, 'la previsione parte dal saldo per cassa');
    assert.strictEqual(k.speso, 500 + (versata ? 220 : 0), 'Spese: l’IVA non versata non è «speso»');
    assert.strictEqual(p.righe[p.righe.length - 1].saldo, 2000 - 500 - 220, 'a fine previsione l’IVA è sottratta una volta sola, versata o no');
  });
});

Promise.all(asincrone).then(() => console.log(process.exitCode ? 'Collaudo fallito.' : 'OK: ' + passed + ' verifiche su Bilancio, Spese e cassa.'));
