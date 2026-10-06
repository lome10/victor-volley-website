/* Victor Volley — Admin / Budget: numeri condivisi, previsione di cassa, «Da fare» e rendimento per squadra.
   Dipende da window.Admin e window.Admin.budgetShared (riepilogo.js, bilancio.js, spese.js, tessere.js, iva.js).

   Definizioni (le stesse in Panoramica, Bilancio e Spese):
     Incassato      entrate confermate del Riepilogo: tranche sponsor pagate (o l'importo confermato intero per gli sponsor
                    senza piano di pagamento, regola storica), rate atleti pagate, tessere pagate.
     Da incassare   quello che è ancora atteso: tranche sponsor non pagate, rate atleti non pagate, tessere assegnate non pagate.
     In cassa       Incassato meno Speso (è il saldo del Riepilogo).
     Previsto a fine stagione   Incassato + Da incassare − spese previste (il maggiore tra preventivato e sostenuto, IVA compresa). */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var DG = window.AdminActions;
  var esc = A.esc;

  var MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var MESI_LUNGHI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  /* date nel fuso del browser (toISOString darebbe quella UTC) */
  function _oggiIso() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function _giorniA(a, b) { return Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5); }
  function _mese(iso) { return iso ? iso.slice(0, 7) : ''; }
  function _meseLabel(k) { var p = k.split('-'); return MESI_LUNGHI[+p[1] - 1] + ' ' + p[0]; }
  function _meseBreve(k) { return MESI[+k.split('-')[1] - 1]; }
  function _aggiungiMesi(k, n) { var p = k.split('-'), m = (+p[1] - 1) + n, y = +p[0] + Math.floor(m / 12); return y + '-' + ('0' + ((m % 12) + 1)).slice(-2); }
  function _somma(arr, f) { return arr.reduce(function (t, x) { return t + f(x); }, 0); }
  function _season() { return B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {}; }

  /* ---- incassi ancora attesi: una voce per ogni tranche, rata o tessera non pagata ---- */
  function _incassiAttesi() {
    var ev = [];
    var chiusi = {};
    B._sponsorizzazioni.forEach(function (s) { if (s.seasonId === B._currentSeasonId && s.stato === 'chiuso') chiusi[s.id] = s; });
    B._tranche.forEach(function (t) {
      var s = chiusi[t.sponsorizzazioneId];
      if (!s || t.pagato) return;
      var az = B._aziendaById(s.aziendaId);
      ev.push({ fonte: 'Sponsor', nome: az ? az.ragioneSociale : '—', importo: +t.importo || 0, scadenza: t.scadenza || '' });
    });
    var atleti = {};
    B._atletiRette.forEach(function (a) { atleti[a.id] = a; });
    B._rateAtleti.forEach(function (r) {
      var a = atleti[r.atletaRettaId];
      if (!a || r.pagata) return;
      ev.push({ fonte: 'Rette', nome: ((a.nome || '') + ' ' + (a.cognome || '')).trim(), importo: +r.importo || 0, scadenza: r.scadenza || '' });
    });
    var tess = B._calcTessere();
    B._tessere.forEach(function (t) {
      if (!String(t.nome || '').trim() || t.pagata) return;
      ev.push({ fonte: 'Tessere', nome: 'Tessera n. ' + t.numero, importo: tess.prezzo, scadenza: '' });
    });
    (B._altreEntrate || []).forEach(function (v) {
      if (v.pagata) return;
      ev.push({ fonte: 'Altre entrate', nome: v.descrizione || '—', importo: +v.importo || 0, scadenza: v.data || '' });
    });
    return ev;
  }

  /* sponsor chiusi senza nessuna tranche: contano come incassati per intero ma non hanno una data */
  function _sponsorSenzaPiano() {
    var n = 0, eur = 0;
    B._sponsorizzazioni.forEach(function (s) {
      if (s.seasonId !== B._currentSeasonId || s.stato !== 'chiuso') return;
      var ha = B._tranche.some(function (t) { return t.sponsorizzazioneId === s.id; });
      if (!ha && (+s.importoConfermato || 0) > 0) { n++; eur += +s.importoConfermato; }
    });
    return { n: n, eur: eur };
  }

  /* scadenza di versamento di una voce IVA non ancora versata ('' se non si può ricavare) */
  function _scadenzaIva(v) {
    if (v.ivaScadenza) return v.ivaScadenza;
    var auto = v.dataSpesa && B._trimestreIvaDaData ? B._trimestreIvaDaData(v.dataSpesa) : null;
    return auto ? auto.scadenza : '';
  }
  function _ivaDaVersare() { return B._vociSpesa.filter(function (v) { return v.isIva && !v.pagata && ((+v.importoPreventivato || 0) - (+v.importoSostenuto || 0)) > 0; }); }

  /* ---- numeri unificati ---- */
  function _calcNumeri(oggi) {
    var r = B._calcRiepilogo(), att = _incassiAttesi(), sp = B._calcSpeseKpi(oggi);
    var ritardo = att.filter(function (e) { return e.scadenza && e.scadenza < oggi; });
    var daIncassare = _somma(att, function (e) { return e.importo; });
    var previstoSpese = _somma(B._vociSpesa, function (v) { return Math.max(+v.importoPreventivato || 0, +v.importoSostenuto || 0); });
    return {
      incassato: r.entrateConfermate, daIncassare: daIncassare,
      ritardoN: ritardo.length, ritardoEur: _somma(ritardo, function (e) { return e.importo; }),
      ritardoRate: ritardo.filter(function (e) { return e.fonte === 'Rette'; }).length, ritardoTranche: ritardo.filter(function (e) { return e.fonte === 'Sponsor'; }).length,
      ritardoAltre: ritardo.filter(function (e) { return e.fonte === 'Altre entrate'; }).length,
      speso: r.uscite, spesePrevisto: previstoSpese, daPagare: sp.daPagare,
      inCassa: r.saldo, obiettivo: r.obiettivo, fineStagione: r.entrateConfermate + daIncassare - previstoSpese,
      senzaPiano: _sponsorSenzaPiano(), spese: sp, potenzialeSponsor: Math.round(r.sponsorPotenziali || 0)
    };
  }

  /* ---- previsione di cassa: mese per mese da oggi a fine stagione ---- */
  function _calcPrevisioneCassa(oggi) {
    var att = _incassiAttesi(), start = _mese(oggi), ent = {}, usc = {}, senzaEnt = 0, senzaUsc = 0, ultimo = start;
    var segna = function (mappa, scad, importo) { var k = scad < oggi ? start : _mese(scad); mappa[k] = (mappa[k] || 0) + importo; if (k > ultimo) ultimo = k; };
    att.forEach(function (e) { if (e.scadenza) segna(ent, e.scadenza, e.importo); else senzaEnt += e.importo; });
    B._vociSpesa.forEach(function (v) {
      if (v.isIva) return;
      var res = Math.max(0, (+v.importoPreventivato || 0) - (+v.importoSostenuto || 0));
      if (!res) return;
      if (v.dataSpesa) segna(usc, v.dataSpesa, res); else senzaUsc += res;
    });
    _ivaDaVersare().forEach(function (v) {
      var res = (+v.importoPreventivato || 0) - (+v.importoSostenuto || 0), scad = _scadenzaIva(v);
      if (scad) segna(usc, scad, res); else senzaUsc += res;
    });
    var fine = _season().dataFine ? _mese(_season().dataFine) : '';
    if (fine && fine > ultimo) ultimo = fine;
    if (_giorniA(ultimo + '-01', start + '-01') > 24 * 30) ultimo = _aggiungiMesi(start, 24);
    var saldo = B._calcRiepilogo().saldo, righe = [], k = start;
    while (k <= ultimo) {
      var e = ent[k] || 0, u = usc[k] || 0;
      saldo += e - u;
      righe.push({ k: k, entrate: e, uscite: u, mese: e - u, saldo: saldo });
      k = _aggiungiMesi(k, 1);
    }
    return { righe: righe, inizio: B._calcRiepilogo().saldo, senzaDataEntrate: senzaEnt, senzaDataUscite: senzaUsc };
  }

  /* ---- rendimento per squadra: rette contro spese delle categorie con lo stesso nome ----
     «Società» non è una squadra (è il segnaposto delle spese generali): le sue spese vanno in «Società e generali». */
  var NON_SQUADRE = ['società'];
  function _norm(s) { return String(s || '').trim().toLowerCase(); }
  function _calcPerSquadra() {
    /* squadre = categorie delle rette + squadre del sito (VV.getCategories), così anche una squadra senza rette
       (per esempio la Prima Divisione) ha la sua riga con le spese */
    var righe = [], visti = {}, nomi = B._categorieAtleti.map(function (c) { return { id: c.id, nome: c.nome }; });
    try { var vv = window.VV; if (vv && vv.getCategories) vv.getCategories().forEach(function (c) { nomi.push({ id: null, nome: c.name }); }); } catch (e) { /* il sito non è caricato: restano le categorie delle rette */ }
    nomi.forEach(function (c) {
      var n = _norm(c.nome);
      if (!n || visti[n] || NON_SQUADRE.indexOf(n) !== -1) { if (c.id && visti[n]) visti[n].ids.push(c.id); return; }
      var riga = { nome: c.nome, entrate: 0, incassato: 0, spese: 0, ids: c.id ? [c.id] : [] };
      visti[n] = riga; righe.push(riga);
    });
    righe.forEach(function (riga) {
      var ids = {}; B._atletiRette.forEach(function (a) { if (riga.ids.indexOf(a.categoriaAtletiId) !== -1) ids[a.id] = true; });
      var rate = B._rateAtleti.filter(function (r) { return ids[r.atletaRettaId]; });
      riga.entrate = _somma(rate, function (r) { return +r.importo || 0; });
      riga.incassato = _somma(rate, function (r) { return r.pagata ? (+r.importo || 0) : 0; });
    });
    var generali = { nome: 'Società e generali', entrate: 0, incassato: 0, spese: 0 };
    B._vociSpesa.forEach(function (v) {
      var c = v.categoriaSpesaId ? B._categoriaSpesaById(v.categoriaSpesaId) : null, n = c ? _norm(c.nome) : '';
      var importo = Math.max(+v.importoPreventivato || 0, +v.importoSostenuto || 0);
      var riga = righe.filter(function (x) { return _norm(x.nome) === n && n; })[0];
      (riga || generali).spese += importo;
    });
    var r = B._calcRiepilogo(), att = _incassiAttesi();
    var sponsorPrev = _somma(B._sponsorizzazioni, function (s) { return s.seasonId === B._currentSeasonId && s.stato === 'chiuso' ? (+s.importoConfermato || 0) : 0; });
    var tess = B._calcTessere();
    var altre = B._calcAltreEntrate ? B._calcAltreEntrate() : { previsto: 0 };
    generali.entrate = sponsorPrev + tess.assegnate * tess.prezzo + altre.previsto;
    generali.incassato = r.sponsorChiusi + r.tessere + (r.altre || 0);
    righe.push(generali);
    righe = righe.filter(function (x) { return x.entrate || x.spese || x.nome === generali.nome; });
    righe.forEach(function (x) { x.margine = x.entrate - x.spese; delete x.ids; });
    return righe;
  }

  /* ---- cose da fare, in ordine di urgenza ---- */
  function _calcDaFare(oggi) {
    var n = _calcNumeri(oggi), prev = _calcPrevisioneCassa(oggi), out = [];
    var neg = prev.righe.filter(function (x) { return x.saldo < 0; })[0];
    if (neg) out.push({ liv: 'bad', testo: 'La cassa va sotto zero a ' + _meseLabel(neg.k) + ' (' + B._eurSigned(neg.saldo) + ')', tab: 'bilancio', sub: 'prev', cta: 'Vedi la previsione' });
    if (n.ritardoN) {
      var parti = [];
      if (n.ritardoRate) parti.push(n.ritardoRate + (n.ritardoRate === 1 ? ' rata atleta' : ' rate atleti'));
      if (n.ritardoTranche) parti.push(n.ritardoTranche + (n.ritardoTranche === 1 ? ' tranche sponsor' : ' tranche sponsor'));
      if (n.ritardoAltre) parti.push(n.ritardoAltre + (n.ritardoAltre === 1 ? ' altra entrata' : ' altre entrate'));
      out.push({ liv: 'bad', testo: n.ritardoN + (n.ritardoN === 1 ? ' incasso in ritardo' : ' incassi in ritardo') + ' (' + B._eur(n.ritardoEur) + '): ' + parti.join(' e '), tab: (n.ritardoAltre > n.ritardoRate && n.ritardoAltre > n.ritardoTranche) ? 'altre' : n.ritardoRate >= n.ritardoTranche ? 'rette' : 'sponsor', cta: 'Apri' });
    }
    if (n.spese.entro30n) out.push({ liv: 'warn', testo: n.spese.entro30n + (n.spese.entro30n === 1 ? ' spesa scaduta o in scadenza' : ' spese scadute o in scadenza') + ' entro 30 giorni (' + B._eur(n.spese.entro30eur) + ')', tab: 'spese', spese: 'in-scadenza', cta: 'Apri spese' });
    var iva = _ivaDaVersare().map(function (v) { return { scad: _scadenzaIva(v), imp: (+v.importoPreventivato || 0) - (+v.importoSostenuto || 0) }; })
      .filter(function (x) { return x.scad && _giorniA(x.scad, oggi) <= 45; });
    if (iva.length) {
      var prossima = iva.map(function (x) { return x.scad; }).sort()[0];
      out.push({ liv: 'warn', testo: 'IVA da versare entro il ' + A.fmtDateLong(prossima) + ': ' + B._eur(_somma(iva.filter(function (x) { return x.scad === prossima; }), function (x) { return x.imp; })), tab: 'bilancio', sub: 'iva', cta: 'Apri IVA' });
    }
    if (n.senzaPiano.n) out.push({ liv: 'info', testo: n.senzaPiano.n + (n.senzaPiano.n === 1 ? ' sponsor chiuso senza piano di pagamento' : ' sponsor chiusi senza piano di pagamento') + ': ' + B._eur(n.senzaPiano.eur) + ' contati come incassati ma senza data', tab: 'sponsor', cta: 'Apri sponsor' });
    if (n.spese.senzaData) out.push({ liv: 'info', testo: n.spese.senzaData + (n.spese.senzaData === 1 ? ' spesa senza data' : ' spese senza data') + ': non entrano nella previsione di cassa', tab: 'spese', spese: 'senza-data', cta: 'Aggiungi le date' });
    var t = B._calcTessere();
    if (t.assegnate - t.pagate > 0) out.push({ liv: 'info', testo: (t.assegnate - t.pagate) + ' tessere assegnate non ancora pagate (' + B._eur((t.assegnate - t.pagate) * t.prezzo) + ')', tab: 'tessere', cta: 'Apri tessere' });
    return out;
  }

  /* porta alla scheda giusta, con il filtro già impostato */
  B._vaiA = function (voce) {
    if (voce.spese) { B._speseStato = voce.spese; B._speseQ = ''; B._speseFilterCategoriaId = ''; }
    if (voce.tab === 'bilancio') B._bilSub = voce.sub || 'cons';
    B._switchBudgetTab(voce.tab);
  };

  /* ---- grafico (SVG a barre per entrate/uscite e linea per il saldo) ---- */
  function _disegna(svg, righe, alto) {
    if (!svg) return;
    var W = 760, H = alto, L = 46, R = 12, T = 14, Bt = 30, iw = W - L - R, ih = H - T - Bt, max = 0, min = 0;
    righe.forEach(function (r) { max = Math.max(max, r.entrate, r.uscite, r.saldo); min = Math.min(min, r.saldo); });
    var passo = max > 20000 ? 10000 : max > 8000 ? 5000 : 2000, top = Math.max(passo, Math.ceil(max / passo) * passo), bot = min < 0 ? Math.floor(min / passo) * passo : 0;
    var y = function (v) { return T + (top - v) / (top - bot) * ih; }, bw = iw / Math.max(1, righe.length), s = '';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    for (var g = bot; g <= top; g += passo) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="#E2E8F0"/><text x="' + (L - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" fill="#64748B" font-size="11">' + (g / 1000) + 'k</text>';
    righe.forEach(function (r, i) {
      var x0 = L + i * bw, w = Math.min(bw * 0.28, 26);
      if (r.saldo < 0) s += '<rect x="' + x0 + '" y="' + T + '" width="' + bw + '" height="' + ih + '" fill="#FDE8E8"/>';
      s += '<rect x="' + (x0 + bw / 2 - w - 1.5) + '" y="' + y(r.entrate) + '" width="' + w + '" height="' + Math.max(0, y(0) - y(r.entrate)) + '" rx="3" fill="#008CFD"/>';
      s += '<rect x="' + (x0 + bw / 2 + 1.5) + '" y="' + y(r.uscite) + '" width="' + w + '" height="' + Math.max(0, y(0) - y(r.uscite)) + '" rx="3" fill="#E9A23B"/>';
      s += '<text x="' + (x0 + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle" fill="#64748B" font-size="11">' + _meseBreve(r.k) + '</text>';
    });
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#64748B"/>';
    s += '<polyline fill="none" stroke="#1E293B" stroke-width="2" points="' + righe.map(function (r, i) { return (L + i * bw + bw / 2) + ',' + y(r.saldo); }).join(' ') + '"/>';
    righe.forEach(function (r, i) { s += '<circle cx="' + (L + i * bw + bw / 2) + '" cy="' + y(r.saldo) + '" r="4" fill="' + (r.saldo < 0 ? '#EF4444' : '#1E293B') + '" stroke="#fff" stroke-width="2"/>'; });
    svg.innerHTML = s;
  }
  var LEGENDA = '<div class="cs-legend"><span><i style="background:#008CFD"></i>Entrate previste</span><span><i style="background:#E9A23B"></i>Uscite previste</span><span><i style="background:#1E293B"></i>Saldo in cassa</span></div>';

  /* ---- Panoramica: «Da fare», cassa prevista, rendimento per squadra ---- */
  function _renderPanoramicaBlocchi() {
    var elDaFare = document.getElementById('panDaFare');
    if (!elDaFare) return;
    var oggi = _oggiIso(), n = _calcNumeri(oggi), lista = _calcDaFare(oggi);
    B._daFareCorrente = lista;
    elDaFare.innerHTML = lista.length
      ? '<ul class="cs-todo">' + lista.map(function (x, i) { return '<li><button type="button" class="cs-todo-b cs-todo-b--' + x.liv + '" data-todo="' + i + '"><span class="cs-dot"></span><span>' + esc(x.testo) + '</span><span class="cs-go">' + esc(x.cta) + ' ›</span></button></li>'; }).join('') + '</ul>'
      : '<p class="dg-muted">Niente da segnalare: nessun ritardo, nessuna scadenza vicina.</p>';
    var prev = _calcPrevisioneCassa(oggi);
    document.getElementById('panCassaLegenda').innerHTML = LEGENDA;
    _disegna(document.getElementById('panCassaSvg'), prev.righe, 220);
    var hp = document.getElementById('heroPrevisto');
    if (hp) hp.innerHTML = 'Se tutto va come previsto, a fine stagione: <strong>' + B._eurSigned(n.fineStagione) + '</strong>' +
      (n.potenzialeSponsor > 0 ? ' <span title="Importo stimato per la probabilità di chiusura, degli sponsor ancora in trattativa">(senza contare gli sponsor non ancora chiusi: potenziale ' + B._eur(n.potenzialeSponsor) + ')</span>' : '');
    var sq = _calcPerSquadra();
    document.getElementById('panSquadreBody').innerHTML = sq.map(function (x) {
      return '<tr><td>' + esc(x.nome) + '</td><td class="cs-r">' + B._eur(x.entrate) + '</td><td class="cs-r">' + B._eur(x.spese) + '</td><td class="cs-r ' + (x.margine < 0 ? 'cs-neg' : 'cs-pos') + '">' + B._eurSigned(x.margine) + '</td></tr>';
    }).join('');
  }

  /* ---- Bilancio: sezioni Consuntivo / Previsione di cassa / IVA ---- */
  B._bilSub = 'cons';
  function _renderBilancioSezioni() {
    if (!document.getElementById('bilSecCons')) return;
    ['cons', 'prev', 'iva', 'conf'].forEach(function (k) {
      var sec = document.getElementById('bilSec' + k.charAt(0).toUpperCase() + k.slice(1)), tab = document.getElementById('bilTab' + k.charAt(0).toUpperCase() + k.slice(1));
      if (sec) sec.classList.toggle('is-hidden', B._bilSub !== k);
      if (tab) tab.setAttribute('aria-selected', String(B._bilSub === k));
    });
    if (B._bilSub === 'prev') _renderPrevisione();
    if (B._bilSub === 'iva') B._renderIvaRiepilogo();
    if (B._bilSub === 'conf' && B._renderConfronto) B._renderConfronto();
  }

  function _renderPrevisione() {
    var oggi = _oggiIso(), p = _calcPrevisioneCassa(oggi);
    document.getElementById('prevLegenda').innerHTML = LEGENDA;
    _disegna(document.getElementById('prevSvg'), p.righe, 270);
    var neg = p.righe.filter(function (x) { return x.saldo < 0; });
    var note = [];
    note.push(neg.length ? '<strong class="cs-neg">Attenzione:</strong> la cassa va sotto zero a ' + neg.map(function (x) { return _meseLabel(x.k); }).join(', ') + '.' : 'La cassa resta positiva fino a fine stagione.');
    if (p.senzaDataUscite) note.push(B._eur(p.senzaDataUscite) + ' di spese senza data non sono incluse: aggiungi una scadenza per vederle qui.');
    if (p.senzaDataEntrate) note.push(B._eur(p.senzaDataEntrate) + ' di entrate attese senza data (tessere assegnate non pagate) non sono incluse.');
    note.push('Punto di partenza: ' + B._eurSigned(p.inizio) + ' in cassa oggi. Le scadenze già passate contano nel mese corrente.');
    document.getElementById('prevNote').innerHTML = note.join(' ');
    document.getElementById('prevBody').innerHTML = p.righe.map(function (x) {
      return '<tr><td>' + _meseLabel(x.k) + '</td><td>' + B._eur(x.entrate) + '</td><td>' + B._eur(x.uscite) + '</td><td class="' + (x.mese < 0 ? 'cs-neg' : 'cs-pos') + '">' + (x.mese < 0 ? '' : '+') + B._eurSigned(x.mese) + '</td><td><strong class="' + (x.saldo < 0 ? 'cs-neg' : '') + '">' + B._eurSigned(x.saldo) + '</strong></td><td>' + (x.saldo < 0 ? '<span class="sp-pill sp-pill--scaduta">Cassa negativa</span>' : '') + '</td></tr>';
    }).join('');
  }

  function _collega() {
    var pan = document.getElementById('budgetPaneRiepilogo');
    if (pan && !pan.dataset.csCollegato) {
      pan.dataset.csCollegato = '1';
      pan.addEventListener('click', function (e) {
        var b = e.target.closest('[data-todo]');
        if (b && B._daFareCorrente) B._vaiA(B._daFareCorrente[+b.getAttribute('data-todo')]);
      });
    }
    var bil = document.getElementById('budgetPaneBilancio');
    if (bil && !bil.dataset.csCollegato) {
      bil.dataset.csCollegato = '1';
      bil.addEventListener('click', function (e) {
        var b = e.target.closest('[data-bsub]');
        if (b) { B._bilSub = b.getAttribute('data-bsub'); _renderBilancioSezioni(); }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _collega); else _collega();

  /* ---- Esportato ---- */
  B._calcNumeri = _calcNumeri;
  B._calcPrevisioneCassa = _calcPrevisioneCassa;
  B._calcPerSquadra = _calcPerSquadra;
  B._calcDaFare = _calcDaFare;
  B._incassiAttesi = _incassiAttesi;
  B._sponsorSenzaPiano = _sponsorSenzaPiano;
  B._renderPanoramicaBlocchi = _renderPanoramicaBlocchi;
  B._renderBilancioSezioni = _renderBilancioSezioni;
  void DG;
})();
