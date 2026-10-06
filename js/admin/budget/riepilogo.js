/* Victor Volley — Admin / Budget: riepilogo: obiettivo, widget dashboard, grafici, cashflow.
   Estratto da js/admin/budget.js. Dipende da window.Admin e window.Admin.budgetShared. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var DG = window.AdminActions;
  var esc = A.esc, cap = A.cap, confirm = A.confirm, goTo = A.goTo, val = A.val,
      _mapDoc = A.mapDoc, _diff = A.diff, _logWrite = A.logWrite,
      _openBudgetModal = A.openModal, _closeBudgetModal = A.closeModal,
      _daysDiff = A.daysDiff, _fmtDate = A.fmtDate, _fmtDateLong = A.fmtDateLong,
      _renderAtletiRows = A.renderAtletiRows, _renderRateAdmin = A.renderRateAdmin,
      _stagioneCorrenteNome = A.stagioneCorrenteNome, EDIT_ICON_SM = A.EDIT_ICON_SM;
  /* ---- OBIETTIVO / RIEPILOGO ---- */
  function _calcRiepilogo() {
    var cur = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId; });
    var chiusi = cur.filter(function (s) { return s.stato === 'chiuso'; });
    var sponsorChiusi = chiusi.reduce(function (s, x) { return s + B._sponsorIncassato(x); }, 0);
    var sponsorDaIncassare = chiusi.reduce(function (s, x) { return s + B._sponsorDaIncassare(x); }, 0);
    var sponsorPotenziali = cur.filter(function (s) { return s.stato !== 'chiuso' && s.stato !== 'rifiutato'; })
      .reduce(function (s, x) { return s + (+x.importoStimato || 0) * (+x.probabilitaChiusura || 0); }, 0);
    var rette = B._calcRetteAtleti().totIncassato;
    var tessere = B._calcTessere().incassato;
    var uscite = B._vociSpesa.reduce(function (s, v) { return s + (+v.importoSostenuto || 0); }, 0);
    var entrateConfermate = sponsorChiusi + rette + tessere;
    var saldo = entrateConfermate - uscite;
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
    var obiettivo = +season.obiettivoSaldo || 0;
    var differenza = saldo - obiettivo;
    var pct = obiettivo > 0 ? Math.round(saldo / obiettivo * 100) : 0;
    return {
      sponsorChiusi: sponsorChiusi, sponsorDaIncassare: sponsorDaIncassare, sponsorPotenziali: sponsorPotenziali, rette: rette, tessere: tessere, uscite: uscite,
      entrateConfermate: entrateConfermate, saldo: saldo, obiettivo: obiettivo, differenza: differenza, pct: pct
    };
  }

  /* Scompone "entrate confermate" nelle singole fonti (sponsor chiusi + categorie rette + tessere), condiviso da UI e export PDF. */
  function _calcEntrateConfermateDettaglio() {
    var cur = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId && s.stato === 'chiuso'; });
    var righe = cur.map(function (s) {
      var az = B._aziendaById(s.aziendaId);
      return { tipo: 'Sponsor', nome: az ? az.ragioneSociale : '—', importo: B._sponsorIncassato(s) };
    }).concat(B._calcRetteAtleti().righe.map(function (r) {
      return { tipo: 'Retta atleti', nome: r.nome, importo: r.incassato };
    })).concat((function () {
      var t = B._calcTessere();
      return [{ tipo: 'Tessere', nome: t.pagate + (t.pagate === 1 ? ' tessera pagata' : ' tessere pagate') + ' (€' + t.prezzo + ' ciascuna)', importo: t.incassato }];
    })()).filter(function (r) { return r.importo > 0; });
    righe.sort(function (a, b) { return b.importo - a.importo; });
    var totale = righe.reduce(function (s, r) { return s + r.importo; }, 0);
    return { righe: righe, totale: totale };
  }

  function _renderEntrateConfermateDettaglio() {
    var body = document.getElementById('entrateConfermateDettaglioBody');
    if (!body) return;
    var d = _calcEntrateConfermateDettaglio();
    if (!d.righe.length) { body.innerHTML = '<tr><td colspan="3" class="dg-empty">Nessuna entrata confermata per questa stagione.</td></tr>'; return; }
    var rows = d.righe.map(function (r) {
      return '<tr>' +
        '<td>' + esc(r.tipo) + '</td>' +
        '<td>' + esc(r.nome) + '</td>' +
        '<td>' + B._eur(r.importo) + '</td>' +
        '</tr>';
    });
    rows.push('<tr style="font-weight:700"><td>Totale</td><td></td><td>' + B._eur(d.totale) + '</td></tr>');
    body.innerHTML = rows.join('');
  }

  function _renderObiettivo() {
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
    document.getElementById('obiettivoSeasonNome').textContent = 'Stagione ' + (season.nome || '—');
    document.getElementById('obiettivoInput').value = season.obiettivoSaldo || 0;
    var r = _calcRiepilogo();
    var pct = Math.max(0, Math.min(100, r.pct));
    document.getElementById('obiettivoBarFill').style.transform = 'scaleX(' + (pct / 100) + ')';
    document.getElementById('obiettivoPct').textContent = r.pct + '%';

    var saldoEl = document.getElementById('heroSaldo');
    saldoEl.textContent = (r.saldo < 0 ? '-' : '') + '€' + Math.abs(Math.round(r.saldo)).toLocaleString('it-IT');
    saldoEl.className = 'dg-hero-saldo ' + (r.saldo >= 0 ? 'dg-hero-saldo--pos' : 'dg-hero-saldo--neg');

    var diffEl = document.getElementById('heroDifferenza');
    if (r.obiettivo > 0) {
      diffEl.textContent = r.differenza >= 0
        ? '+€' + Math.round(r.differenza).toLocaleString('it-IT') + ' oltre l\'obiettivo di €' + Math.round(r.obiettivo).toLocaleString('it-IT')
        : 'Mancano €' + Math.round(Math.abs(r.differenza)).toLocaleString('it-IT') + ' per raggiungere l\'obiettivo di €' + Math.round(r.obiettivo).toLocaleString('it-IT');
      diffEl.className = 'dg-hero-differenza ' + (r.differenza >= 0 ? 'dg-hero-differenza--pos' : 'dg-hero-differenza--neg');
    } else {
      diffEl.textContent = 'Nessun obiettivo impostato per questa stagione';
      diffEl.className = 'dg-hero-differenza';
    }
  }

  function _saveObiettivo() {
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
    if (!season) return;
    var v = +document.getElementById('obiettivoInput').value || 0;
    var old = { obiettivoSaldo: season.obiettivoSaldo || 0 };
    season.obiettivoSaldo = v;
    db.collection('budgetSeasons').doc(season.id).update({ obiettivoSaldo: v })
      .then(function () { return _logWrite('obiettivo', season.id, 'Obiettivo — stagione ' + season.nome, 'update', _diff(old, { obiettivoSaldo: v }, ['obiettivoSaldo'])); })
      .then(function () { _renderObiettivo(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _renderPromemoriaList(widgetId, listId, limit) {
    var curIds = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId; }).map(function (s) { return s.id; });
    var upcoming = B._promemoria.filter(function (p) {
      return !p.completato && curIds.indexOf(p.sponsorizzazioneId) !== -1 && _daysDiff(p.dataScadenza) <= 7;
    }).sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    if (limit) upcoming = upcoming.slice(0, limit);

    var widget = document.getElementById(widgetId);
    if (!upcoming.length) { widget.classList.add('is-hidden'); return; }
    widget.classList.remove('is-hidden');
    document.getElementById(listId).innerHTML = upcoming.map(function (p) {
      var s = B._sponsorizzazioni.find(function (x) { return x.id === p.sponsorizzazioneId; });
      var az = s ? B._aziendaById(s.aziendaId) : null;
      var days = _daysDiff(p.dataScadenza);
      var badge = days < 0
        ? '<span class="dg-chip dg-chip--overdue">Scaduto</span>'
        : '<span class="dg-chip dg-chip--soon">' + _fmtDate(p.dataScadenza) + '</span>';
      return '<div class="dg-reminder-item" onclick="DG.openFromReminder(\'' + p.sponsorizzazioneId + '\')">' +
        '<div class="dg-reminder-info"><div class="dg-reminder-azienda">' + esc(az ? az.ragioneSociale : '—') + '</div>' +
        '<div class="dg-reminder-desc">' + esc(p.descrizione || '') + '</div></div>' + badge + '</div>';
    }).join('');
  }

  function _renderPromemoriaWidget() {
    _renderPromemoriaList('promemoriaWidget', 'promemoriaWidgetList');
  }

  /* ---- Widget "Budget stagione" sulla Dashboard principale ---- */
  function _renderDashBudgetWidget() {
    var r = _calcRiepilogo();
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
    var pct = Math.max(0, Math.min(100, r.pct));

    document.getElementById('dashBudgetSeasonName').textContent = season.nome ? '· ' + season.nome : '';
    var saldoEl = document.getElementById('dashBudgetSaldo');
    saldoEl.textContent = (r.saldo < 0 ? '-' : '') + '€' + Math.abs(Math.round(r.saldo)).toLocaleString('it-IT');
    saldoEl.className = 'dash-budget-saldo ' + (r.saldo >= 0 ? 'dash-budget-saldo--pos' : 'dash-budget-saldo--neg');
    document.getElementById('dashBudgetPct').textContent = r.pct + '%';
    document.getElementById('dashBudgetBarFill').style.width = pct + '%';
    document.getElementById('dashBudgetObiettivo').textContent = 'Obiettivo €' + Math.round(r.obiettivo).toLocaleString('it-IT');

    _renderPromemoriaList('dashPromemoriaWidget', 'dashPromemoriaList', 4);
  }

  function _renderDashCashflowWidget() {
    var c = _cashflowStats();
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
    var pct = c.promesso > 0 ? Math.round(c.incassato / c.promesso * 100) : 0;

    document.getElementById('dashCashflowSeasonName').textContent = season.nome ? '· ' + season.nome : '';
    document.getElementById('dashCashflowIncassato').textContent =
      '€' + Math.round(c.incassato).toLocaleString('it-IT') + ' / €' + Math.round(c.promesso).toLocaleString('it-IT');
    document.getElementById('dashCashflowPct').textContent = pct + '%';
    document.getElementById('dashCashflowBarFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
    document.getElementById('dashCashflowTranche').textContent =
      c.totale ? (c.totale + ' tranche pianificate — ' + c.pagate + ' pagate, ' + c.daPagare + ' da pagare') : 'Nessuna tranche pianificata';
  }

  DG.openFromReminder = function (sponsorId) {
    goTo('budget');
    B._switchBudgetTab('sponsor');
    B._openDrawer(sponsorId);
  };

  function _budgetStatCard(label, val2, cls) {
    var sign = val2 < 0 ? '-' : '';
    return '<div class="dg-stat-card' + (cls ? ' dg-stat-card' + cls : '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + sign + '€' + Math.abs(Math.round(val2)).toLocaleString('it-IT') + '</div></div>';
  }

  /* Saldo e Differenza da obiettivo sono ora nella hero card (_renderObiettivo);
     qui restano solo i numeri di supporto, senza ripetere quanto già in vista. */
  /* Indicatori della Panoramica: le definizioni stanno in cassa.js (stesse in Bilancio e Spese). */
  function _oggiLocale() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function _kpiPan(label, valore, sub, cls, pct, barCls) {
    return '<div class="sp-kpi' + (cls ? ' sp-kpi--' + cls : '') + '"><span class="sp-kpi-l">' + label + '</span><span class="sp-kpi-v">' + valore + '</span>' +
      (pct != null ? '<div class="sp-bar' + (barCls ? ' sp-bar--' + barCls : '') + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>' : '') + '<span class="sp-kpi-s">' + sub + '</span></div>';
  }
  function _renderStatCards() {
    var n = B._calcNumeri(_oggiLocale()), eur = B._eur;
    var tot = n.incassato + n.daIncassare, pcSpeso = n.spesePrevisto > 0 ? Math.round(n.speso / n.spesePrevisto * 100) : 0;
    document.getElementById('dgStatRow').innerHTML =
      _kpiPan('Incassato', eur(n.incassato), eur(n.daIncassare) + ' ancora da incassare', '', tot > 0 ? n.incassato / tot * 100 : 0, 'ok') +
      _kpiPan('Da incassare', eur(n.daIncassare), n.ritardoN ? 'di cui ' + eur(n.ritardoEur) + ' in ritardo (' + n.ritardoN + ')' : 'nessun incasso in ritardo', n.ritardoN ? 'neg' : '') +
      _kpiPan('Speso finora', eur(n.speso), pcSpeso + '% del previsto (' + eur(n.spesePrevisto) + ')', '', pcSpeso) +
      _kpiPan('Ancora da pagare', eur(n.daPagare), n.spese.entro30n ? 'di cui ' + eur(n.spese.entro30eur) + ' scaduti o in scadenza entro 30 giorni' : 'nessuna scadenza nei prossimi 30 giorni', n.spese.entro30n ? 'warn' : '');
    _renderEntrateConfermateDettaglio();
    if (B._renderPanoramicaBlocchi) B._renderPanoramicaBlocchi();
  }

  /* ---- CHARTS — SVG inline, nessuna libreria esterna ---- */
  function _svgBarChart(entrate, uscite, obiettivo) {
    var w = 480, h = 220, pad = 40;
    var max = Math.max(entrate, uscite, obiettivo, 1) * 1.15;
    var barW = 76, gap = 70, chartH = h - pad * 2;
    function y(v) { return pad + chartH - (v / max * chartH); }
    var bars = [{ label: 'Entrate', val: entrate, color: '#10B981' }, { label: 'Uscite', val: uscite, color: '#EF4444' }];
    var startX = pad + 30;

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="220" role="img" aria-label="Entrate vs uscite vs obiettivo">';
    svg += '<line x1="' + pad + '" y1="' + (pad + chartH) + '" x2="' + (w - pad) + '" y2="' + (pad + chartH) + '" stroke="#C3C2B7" stroke-width="1"/>';

    if (obiettivo > 0) {
      var oy = y(obiettivo);
      svg += '<line x1="' + pad + '" y1="' + oy + '" x2="' + (w - pad) + '" y2="' + oy + '" stroke="#1E3A5F" stroke-width="2" stroke-dasharray="5,4"/>';
      svg += '<text x="' + (w - pad) + '" y="' + (oy - 8) + '" text-anchor="end" font-size="11" fill="#1E3A5F" font-weight="700">Obiettivo €' + Math.round(obiettivo).toLocaleString('it-IT') + '</text>';
    }

    bars.forEach(function (b, i) {
      var bx = startX + i * (barW + gap);
      var by = y(b.val);
      var bh = (pad + chartH) - by;
      svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + Math.max(bh, 0) + '" rx="4" fill="' + b.color + '"/>';
      svg += '<text x="' + (bx + barW / 2) + '" y="' + (by - 8) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#1E293B">€' + Math.round(b.val).toLocaleString('it-IT') + '</text>';
      svg += '<text x="' + (bx + barW / 2) + '" y="' + (pad + chartH + 20) + '" text-anchor="middle" font-size="12" fill="#64748B">' + b.label + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  function _svgDonut(parts, ariaLabel) {
    var total = parts.reduce(function (s, p) { return s + p.value; }, 0) || 1;
    var size = 200, r = 80, cx = 100, cy = 100, strokeW = 28, GAP = 4;
    var circumference = 2 * Math.PI * r;
    var offset = 0, segs = '';
    parts.forEach(function (p) {
      var frac = p.value / total;
      var full = frac * circumference;
      var len = Math.max(full - GAP, 0);
      segs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + p.color + '" stroke-width="' + strokeW +
        '" stroke-dasharray="' + len + ' ' + (circumference - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      offset += full;
    });
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="100%" height="200" role="img" aria-label="' + esc(ariaLabel || 'Composizione') + '">' + segs +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - strokeW / 2 - 4) + '" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="12" fill="#64748B">Totale</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#1E293B">€' + Math.round(total).toLocaleString('it-IT') + '</text>' +
      '</svg>';
    var legend = '<div class="dg-chart-legend">' + parts.map(function (p) {
      var pct = total ? Math.round(p.value / total * 100) : 0;
      return '<div class="dg-chart-legend-item"><span class="dg-chart-legend-swatch" style="background:' + p.color + '"></span>' +
        esc(p.label) + ' — €' + Math.round(p.value).toLocaleString('it-IT') + ' (' + pct + '%)</div>';
    }).join('') + '</div>';
    return svg + legend;
  }

  var DONUT_PALETTE = ['#008CFD', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444', '#64748B'];

  function _renderCharts() {
    var r = _calcRiepilogo();
    document.getElementById('chartBar').innerHTML = _svgBarChart(r.entrateConfermate, r.uscite, r.obiettivo);

    /* Solo incassi reali (rette + sponsor chiusi): il potenziale pesato è una
       stima di forecast, mescolarlo qui confondeva "quanto ho" con "quanto spero". */
    document.getElementById('chartDonutEntrate').innerHTML = _svgDonut([
      { label: 'Rette atleti', value: r.rette, color: '#008CFD' },
      { label: 'Tessere', value: r.tessere, color: '#F59E0B' },
      { label: 'Sponsor chiusi', value: r.sponsorChiusi, color: '#10B981' }
    ], 'Composizione entrate confermate');

    var speseBox = document.getElementById('chartDonutUscite');
    var usciteParts = B._calcSpeseForecast().righe
      .filter(function (x) { return x.sostenuto > 0; })
      .sort(function (a, b) { return b.sostenuto - a.sostenuto; })
      .map(function (x, i) { return { label: x.nome, value: x.sostenuto, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }; });
    speseBox.innerHTML = usciteParts.length ? _svgDonut(usciteParts, 'Composizione uscite per categoria') : '<p class="dg-muted">Nessuna uscita registrata per questa stagione.</p>';
  }

  /* ---- CASHFLOW — quante tranche, quanto incassato vs promesso ---- */
  function _countStatCard(label, val2, cls) {
    return '<div class="dg-stat-card' + (cls ? ' dg-stat-card' + cls : '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + val2.toLocaleString('it-IT') + '</div></div>';
  }

  function _cashflowStats() {
    var curIds = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId; }).map(function (s) { return s.id; });
    var list = B._tranche.filter(function (t) { return curIds.indexOf(t.sponsorizzazioneId) !== -1; });
    var pagate = list.filter(function (t) { return t.pagato; });
    var daPagare = list.filter(function (t) { return !t.pagato; });
    var incassato = pagate.reduce(function (s, t) { return s + (+t.importo || 0); }, 0);
    var daIncassare = daPagare.reduce(function (s, t) { return s + (+t.importo || 0); }, 0);
    return {
      totale: list.length, pagate: pagate.length, daPagare: daPagare.length,
      incassato: incassato, daIncassare: daIncassare, promesso: incassato + daIncassare
    };
  }

  function _renderCashflow() {
    var c = _cashflowStats();
    document.getElementById('cashflowStats').innerHTML =
      _countStatCard('Tranche totali', c.totale, '') +
      _countStatCard('Tranche pagate', c.pagate, '--green') +
      _countStatCard('Tranche da pagare', c.daPagare, '--orange') +
      _budgetStatCard('Promesso (totale tranche)', c.promesso, '');

    var box = document.getElementById('cashflowDonut');
    if (!c.totale) {
      box.innerHTML = '<p class="dg-muted">Nessuna tranche pianificata per questa stagione — le tranche si aggiungono dalla scheda azienda, tab "Pagamenti".</p>';
      return;
    }
    box.innerHTML = _svgDonut([
      { label: 'Incassato', value: c.incassato, color: '#10B981' },
      { label: 'Da incassare', value: c.daIncassare, color: '#F59E0B' }
    ]);
  }

  /* ---- Esportato per gli altri file del Budget ---- */
  B._budgetStatCard = _budgetStatCard;
  B._calcEntrateConfermateDettaglio = _calcEntrateConfermateDettaglio;
  B._calcRiepilogo = _calcRiepilogo;
  B._renderCashflow = _renderCashflow;
  B._renderCharts = _renderCharts;
  B._renderDashBudgetWidget = _renderDashBudgetWidget;
  B._renderDashCashflowWidget = _renderDashCashflowWidget;
  B._renderObiettivo = _renderObiettivo;
  B._renderPromemoriaWidget = _renderPromemoriaWidget;
  B._renderStatCards = _renderStatCards;
  B._saveObiettivo = _saveObiettivo;

})();
