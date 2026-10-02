/* Victor Volley — Admin: Budget & Forecast (CRM sponsor, rette, spese, bilancio, log).
   Estratto da admin.js. Dipende da window.Admin (definito in admin.js, che va caricato prima)
   e a sua volta espone window.Admin.budget per le parti rimaste in admin.js. */
(function () {
  'use strict';
  var A = window.Admin;
  var esc = A.esc, cap = A.cap, confirm = A.confirm, goTo = A.goTo, val = A.val,
      _mapDoc = A.mapDoc, _diff = A.diff, _logWrite = A.logWrite,
      _openBudgetModal = A.openModal, _closeBudgetModal = A.closeModal,
      _daysDiff = A.daysDiff, _fmtDate = A.fmtDate, _fmtDateLong = A.fmtDateLong,
      _renderAtletiRows = A.renderAtletiRows, _renderRateAdmin = A.renderRateAdmin,
      _stagioneCorrenteNome = A.stagioneCorrenteNome, EDIT_ICON_SM = A.EDIT_ICON_SM;
  /* ================================================================
     BUDGET & FORECAST — CRM sponsor, rette, spese, log (Area Dirigenti)

     Fuso nel pannello unico: stesso login, stesso ruolo "dirigente"
     verificato in _checkRole(), stesso log (auditLog) usato anche da
     db.js per il resto del CMS. DG è un alias di AdminActions, ma va
     esposto anche su window: tutto admin.js vive in un'unica IIFE,
     quindi un "var DG" locale non basta — gli onclick="DG.xxx()"
     iniettati via innerHTML girano nello scope globale della pagina,
     non nella closure dello script, e senza window.DG risolvono a
     "DG is not defined" ad ogni click.
  ================================================================ */
  var DG = window.AdminActions;
  window.DG = DG;

  var _seasons = [];
  var _currentSeasonId = null;
  var _aziende = [];
  var _sponsorizzazioni = [];
  var _attivita = [];
  var _promemoria = [];
  var _tranche = [];
  var _trancheEditingId = null;
  var _categorieAtleti = [];
  var _atletiRette = [];
  var _rateAtleti = [];
  var _curAtletaRettaId = null;
  var _vociSpesa = [];
  var _sottospese = [];
  var _speseExpanded = {};
  var _categorieSpesa = [];
  var _dirigentiList = [];
  var _curSponsorId = null, _curAziendaId = null;
  var _activeBudgetTab = 'riepilogo';
  var STATI = ['prospect', 'contattato', 'in_trattativa', 'chiuso', 'rifiutato'];

  /* ---- Sotto-tab interne alla sezione "Budget & Forecast" ---- */
  function _switchBudgetTab(tab) {
    _activeBudgetTab = tab;
    document.querySelectorAll('.budget-subtab').forEach(function (btn) { btn.classList.toggle('is-active', btn.dataset.btab === tab); });
    document.querySelectorAll('#sectionBudget > .dg-section').forEach(function (pane) { pane.classList.add('is-hidden'); });
    document.getElementById('budgetPane' + cap(tab)).classList.remove('is-hidden');
    _renderActiveBudgetTab();
  }

  function _renderActiveBudgetTab() {
    if (_activeBudgetTab === 'riepilogo') { _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards(); _renderCharts(); _renderCashflow(); }
    if (_activeBudgetTab === 'sponsor')   _renderKanban();
    if (_activeBudgetTab === 'rette')     _renderRette();
    if (_activeBudgetTab === 'spese')     _renderSpese();
    if (_activeBudgetTab === 'bilancio')  { _renderBilancio(); _renderSpeseForecast(); }
  }


  /* ---- CARICAMENTO DATI ---- */
  function _loadBudgetData(cb) {
    Promise.all([
      db.collection('dirigenti').get(),
      db.collection('budgetSeasons').get(),
      db.collection('aziende').get(),
      db.collection('sponsorizzazioni').get(),
      db.collection('attivita').get(),
      db.collection('promemoria').get(),
      /* Non deve mai far fallire l'intero Promise.all: finché le regole non
         sono deployate (o per qualsiasi altro errore su questa collezione da
         sola), il resto del budget/CRM deve continuare a caricarsi normalmente. */
      db.collection('tranchePagamento').get().catch(function (e) {
        console.error('[budget] tranchePagamento', e);
        return { docs: [] };
      }),
      /* Collezione globale (non per stagione): stesso trattamento difensivo. */
      db.collection('categorieSpesa').get().catch(function (e) {
        console.error('[budget] categorieSpesa', e);
        return { docs: [] };
      }),
      /* Rate atleti: come tranchePagamento, collegate via atletaRettaId (non seasonId diretto). */
      db.collection('rateAtleti').get().catch(function (e) {
        console.error('[budget] rateAtleti', e);
        return { docs: [] };
      })
    ]).then(function (res) {
      _dirigentiList    = res[0].docs.map(_mapDoc);
      _seasons          = res[1].docs.map(_mapDoc).sort(function (a, b) { return (a.nome || '') < (b.nome || '') ? 1 : -1; });
      _aziende          = res[2].docs.map(_mapDoc);
      _sponsorizzazioni = res[3].docs.map(_mapDoc);
      _attivita         = res[4].docs.map(_mapDoc);
      _promemoria       = res[5].docs.map(_mapDoc);
      _tranche          = res[6].docs.map(_mapDoc);
      _categorieSpesa   = res[7].docs.map(_mapDoc).sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
      _rateAtleti       = res[8].docs.map(_mapDoc);

      var chain = _seasons.length ? Promise.resolve() : _createDefaultSeason();

      return chain.then(function () {
        var active = _seasons.find(function (s) { return s.isAttiva; }) || _seasons[0];
        _currentSeasonId = active.id;
        _populateSeasonSelect();
        _populateResponsabileSelects();
        _populateLogDirigenteFilter();
        return _loadSeasonScoped();
      });
    }).then(function () {
      return _loadAuditLog();
    }).then(function () { if (cb) cb(); })
      .catch(function (err) {
        console.error('[budget] loadAll', err);
        if (cb) cb();
      });
  }

  function _createDefaultSeason() {
    var y = new Date().getFullYear();
    var data = { nome: y + '/' + (y + 1), dataInizio: '', dataFine: '', obiettivoSaldo: 0, isAttiva: true, createdAt: new Date().toISOString() };
    var ref = db.collection('budgetSeasons').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _seasons = [data];
    });
  }

  function _loadSeasonScoped() {
    return Promise.all([
      db.collection('categorieAtleti').where('seasonId', '==', _currentSeasonId).get(),
      db.collection('vociSpesa').where('seasonId', '==', _currentSeasonId).get(),
      db.collection('atletiRette').where('seasonId', '==', _currentSeasonId).get(),
      /* Sottospese: come tranchePagamento/rateAtleti, trattamento difensivo finché
         le regole non sono deployate. */
      db.collection('sottospese').where('seasonId', '==', _currentSeasonId).get().catch(function (e) {
        console.error('[budget] sottospese', e);
        return { docs: [] };
      })
    ]).then(function (res) {
      _categorieAtleti = res[0].docs.map(_mapDoc);
      _vociSpesa       = res[1].docs.map(_mapDoc);
      _atletiRette     = res[2].docs.map(_mapDoc);
      _sottospese      = res[3].docs.map(_mapDoc);
    });
  }

  /* ---- SOTTOSPESE — dettaglio reale dentro una singola voce di spesa ----
     Due tipi, stesso oggetto: "spesa" (default, storico) e "credito" — per gli
     eventi che generano anche un incasso (es. biglietti, quote di partecipazione),
     da non confondere con gli incassi già tracciati altrove (sponsor, rette): qui
     è solo un dettaglio informativo dentro la voce, non tocca Sostenuto/Preventivato
     né i totali di Bilancio, per evitare di contare lo stesso incasso due volte. */
  function _sottospeseOf(voceId) {
    return _sottospese.filter(function (x) { return x.voceSpesaId === voceId; });
  }
  function _isSottospesaCredito(s) { return s.tipo === 'credito'; }
  function _sottospeseSpesaOf(voceId) {
    return _sottospeseOf(voceId).filter(function (x) { return !_isSottospesaCredito(x); });
  }
  function _sottospeseCreditoOf(voceId) {
    return _sottospeseOf(voceId).filter(_isSottospesaCredito);
  }
  /* Ogni sottospesa ha due importi: `importoPreventivato` (quanto era previsto)
     e `importo` (quanto è stato pagato/incassato davvero — nome storico del campo,
     invariato così le sottospese già inserite restano "pagate"). */
  function _sommaSottospese(voceId) {
    return _sottospeseSpesaOf(voceId).reduce(function (s, x) { return s + (+x.importo || 0); }, 0);
  }
  function _sommaSottospesePreventivate(voceId) {
    return _sottospeseSpesaOf(voceId).reduce(function (s, x) { return s + (+x.importoPreventivato || 0); }, 0);
  }
  function _sommaSottospeseIncassato(voceId) {
    return _sottospeseCreditoOf(voceId).reduce(function (s, x) { return s + (+x.importo || 0); }, 0);
  }
  function _sommaSottospeseIncassoPrevisto(voceId) {
    return _sottospeseCreditoOf(voceId).reduce(function (s, x) { return s + (+x.importoPreventivato || 0); }, 0);
  }
  /* Il Preventivato della voce segue le sottospese di spesa solo se almeno una ne ha uno
     (i crediti non c'entrano: tracciare un incasso previsto non deve azzerare il budget). */
  function _voceHaPreventivatoDaSottospese(voceId) {
    return _sottospeseSpesaOf(voceId).some(function (x) { return (+x.importoPreventivato || 0) > 0; });
  }
  /* Stato di una sottospesa, ricavato dai due importi — vocabolario diverso per i crediti. */
  function _statoSottospesa(s) {
    var prev = +s.importoPreventivato || 0, pagato = +s.importo || 0;
    var credito = _isSottospesaCredito(s);
    if (pagato <= 0) return credito ? { key: 'da_incassare', label: 'Da incassare', badge: 'in_trattativa' } : { key: 'da_pagare', label: 'Da pagare', badge: 'in_trattativa' };
    if (prev > 0 && pagato < prev) return { key: 'parziale', label: 'Parziale', badge: 'contattato' };
    return credito ? { key: 'incassato', label: 'Incassato', badge: 'chiuso' } : { key: 'pagata', label: 'Pagata', badge: 'chiuso' };
  }
  /* Finché una voce ha almeno una sottospesa DI SPESA, il suo "Sostenuto" è la somma dei
     pagati e non è più modificabile a mano (i crediti non contano: vedi nota sopra). Lo
     stesso vale per il "Preventivato", ma solo se almeno una sottospesa di spesa ha un
     importo preventivato (altrimenti resta manuale, come per le voci create prima di
     questa distinzione). Se le sottospese di spesa vengono azzerate, i campi tornano
     modificabili mantenendo l'ultimo valore noto. */
  function _syncVoceDaSottospese(voceId) {
    var v = _vociSpesa.find(function (x) { return x.id === voceId; });
    if (!v) return Promise.resolve();
    if (!_sottospeseSpesaOf(voceId).length) return Promise.resolve();
    var patch = {}, old = {}, fields = [];
    var sostenuto = _sommaSottospese(voceId);
    if (+v.importoSostenuto !== sostenuto) {
      old.importoSostenuto = v.importoSostenuto || 0; patch.importoSostenuto = sostenuto; fields.push('importoSostenuto');
    }
    if (_voceHaPreventivatoDaSottospese(voceId)) {
      var preventivato = _sommaSottospesePreventivate(voceId);
      if (+v.importoPreventivato !== preventivato) {
        old.importoPreventivato = v.importoPreventivato || 0; patch.importoPreventivato = preventivato; fields.push('importoPreventivato');
      }
    }
    if (!fields.length) return Promise.resolve();
    Object.assign(v, patch);
    return db.collection('vociSpesa').doc(voceId).update(patch)
      .then(function () { return _logWrite('voceSpesa', voceId, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, fields)); })
      .then(function () { return _syncSpesaIva(v); });
  }

  function _loadAuditLog() {
    return db.collection('auditLog').orderBy('timestamp', 'desc').limit(300).get().then(function (snap) {
      A.setAuditLog(snap.docs.map(_mapDoc));
    }).catch(function (err) {
      console.error('[budget] log', err);
    });
  }

  /* ---- TRANCHE DI PAGAMENTO — incasso reale vs contrattuale ---- */
  function _trancheOf(sponsorId) {
    return _tranche.filter(function (t) { return t.sponsorizzazioneId === sponsorId; });
  }
  /* Se non sono state definite tranche, l'importo confermato conta per intero
     (comportamento storico, per non "azzerare" gli sponsor già chiusi in passato). */
  function _sponsorIncassato(s) {
    var t = _trancheOf(s.id);
    if (!t.length) return +s.importoConfermato || 0;
    return t.reduce(function (sum, x) { return sum + (x.pagato ? (+x.importo || 0) : 0); }, 0);
  }
  function _sponsorDaIncassare(s) {
    var t = _trancheOf(s.id);
    if (!t.length) return 0;
    return t.reduce(function (sum, x) { return sum + (x.pagato ? 0 : (+x.importo || 0)); }, 0);
  }

  /* ---- RETTE ATLETI — per categoria, calcolate dagli atleti/rate assegnati ----
     N. atleti e Incassato non sono più campi salvati a mano su categorieAtleti:
     si derivano da _atletiRette (chi) + _rateAtleti (le singole rate, pagate o no). */
  function _atletaRettaById(id) { return _atletiRette.find(function (a) { return a.id === id; }); }
  function _rateByAtleta(atletaId) { return _rateAtleti.filter(function (r) { return r.atletaRettaId === atletaId; }); }

  function _calcRetteAtleti() {
    var perCategoria = {};
    _atletiRette.forEach(function (a) {
      var key = a.categoriaAtletiId || '__none__';
      var rate = _rateByAtleta(a.id);
      var incassato = rate.filter(function (r) { return r.pagata; }).reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      perCategoria[key] = perCategoria[key] || { nAtleti: 0, incassato: 0 };
      perCategoria[key].nAtleti++;
      perCategoria[key].incassato += incassato;
    });
    var totIncassato = 0, totPrevisto = 0;
    var righe = _categorieAtleti.map(function (c) {
      var p = perCategoria[c.id] || { nAtleti: 0, incassato: 0 };
      delete perCategoria[c.id];
      var previsto = p.nAtleti * (+c.rettaUnitaria || 0);
      totIncassato += p.incassato; totPrevisto += previsto;
      return {
        id: c.id, nome: c.nome, rettaUnitaria: +c.rettaUnitaria || 0,
        nAtleti: p.nAtleti, previsto: previsto, incassato: p.incassato, diff: p.incassato - previsto
      };
    });
    /* Atleti senza categoria assegnata: mai persi dal totale, raggruppati a parte
       (stesso trattamento di "Senza categoria" già usato per le voci di spesa). */
    if (perCategoria.__none__) {
      var pn = perCategoria.__none__;
      totIncassato += pn.incassato;
      righe.push({ id: null, nome: 'Senza categoria', rettaUnitaria: 0, nAtleti: pn.nAtleti, previsto: 0, incassato: pn.incassato, diff: pn.incassato });
    }
    righe.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    return { righe: righe, totIncassato: totIncassato, totPrevisto: totPrevisto };
  }

  /* ---- OBIETTIVO / RIEPILOGO ---- */
  function _calcRiepilogo() {
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; });
    var chiusi = cur.filter(function (s) { return s.stato === 'chiuso'; });
    var sponsorChiusi = chiusi.reduce(function (s, x) { return s + _sponsorIncassato(x); }, 0);
    var sponsorDaIncassare = chiusi.reduce(function (s, x) { return s + _sponsorDaIncassare(x); }, 0);
    var sponsorPotenziali = cur.filter(function (s) { return s.stato !== 'chiuso' && s.stato !== 'rifiutato'; })
      .reduce(function (s, x) { return s + (+x.importoStimato || 0) * (+x.probabilitaChiusura || 0); }, 0);
    var rette = _calcRetteAtleti().totIncassato;
    var uscite = _vociSpesa.reduce(function (s, v) { return s + (+v.importoSostenuto || 0); }, 0);
    var entrateConfermate = sponsorChiusi + rette;
    var saldo = entrateConfermate - uscite;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var obiettivo = +season.obiettivoSaldo || 0;
    var differenza = saldo - obiettivo;
    var pct = obiettivo > 0 ? Math.round(saldo / obiettivo * 100) : 0;
    return {
      sponsorChiusi: sponsorChiusi, sponsorDaIncassare: sponsorDaIncassare, sponsorPotenziali: sponsorPotenziali, rette: rette, uscite: uscite,
      entrateConfermate: entrateConfermate, saldo: saldo, obiettivo: obiettivo, differenza: differenza, pct: pct
    };
  }

  /* Scompone "entrate confermate" nelle singole fonti (sponsor chiusi + categorie rette), condiviso da UI e export PDF. */
  function _calcEntrateConfermateDettaglio() {
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && s.stato === 'chiuso'; });
    var righe = cur.map(function (s) {
      var az = _aziendaById(s.aziendaId);
      return { tipo: 'Sponsor', nome: az ? az.ragioneSociale : '—', importo: _sponsorIncassato(s) };
    }).concat(_calcRetteAtleti().righe.map(function (r) {
      return { tipo: 'Retta atleti', nome: r.nome, importo: r.incassato };
    })).filter(function (r) { return r.importo > 0; });
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
        '<td>' + _eur(r.importo) + '</td>' +
        '</tr>';
    });
    rows.push('<tr style="font-weight:700"><td>Totale</td><td></td><td>' + _eur(d.totale) + '</td></tr>');
    body.innerHTML = rows.join('');
  }

  function _renderObiettivo() {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
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
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
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
    var curIds = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; }).map(function (s) { return s.id; });
    var upcoming = _promemoria.filter(function (p) {
      return !p.completato && curIds.indexOf(p.sponsorizzazioneId) !== -1 && _daysDiff(p.dataScadenza) <= 7;
    }).sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    if (limit) upcoming = upcoming.slice(0, limit);

    var widget = document.getElementById(widgetId);
    if (!upcoming.length) { widget.classList.add('is-hidden'); return; }
    widget.classList.remove('is-hidden');
    document.getElementById(listId).innerHTML = upcoming.map(function (p) {
      var s = _sponsorizzazioni.find(function (x) { return x.id === p.sponsorizzazioneId; });
      var az = s ? _aziendaById(s.aziendaId) : null;
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
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
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
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
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
    _switchBudgetTab('sponsor');
    _openDrawer(sponsorId);
  };

  function _budgetStatCard(label, val2, cls) {
    var sign = val2 < 0 ? '-' : '';
    return '<div class="dg-stat-card' + (cls ? ' dg-stat-card' + cls : '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + sign + '€' + Math.abs(Math.round(val2)).toLocaleString('it-IT') + '</div></div>';
  }

  /* Saldo e Differenza da obiettivo sono ora nella hero card (_renderObiettivo);
     qui restano solo i numeri di supporto, senza ripetere quanto già in vista. */
  function _renderStatCards() {
    var r = _calcRiepilogo();
    document.getElementById('dgStatRow').innerHTML =
      _budgetStatCard('Entrate confermate', r.entrateConfermate, '') +
      _budgetStatCard('Da incassare (sponsor)', r.sponsorDaIncassare, '--orange') +
      _budgetStatCard('Uscite', r.uscite, '--red');
    _renderEntrateConfermateDettaglio();
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
      { label: 'Sponsor chiusi', value: r.sponsorChiusi, color: '#10B981' }
    ], 'Composizione entrate confermate');

    var speseBox = document.getElementById('chartDonutUscite');
    var usciteParts = _calcSpeseForecast().righe
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
    var curIds = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; }).map(function (s) { return s.id; });
    var list = _tranche.filter(function (t) { return curIds.indexOf(t.sponsorizzazioneId) !== -1; });
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

  /* ---- KANBAN SPONSOR ---- */
  function _renderKanban() {
    var onlyMine = document.getElementById('filterMieiSponsor').checked;
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; });

    STATI.forEach(function (stato) {
      var items = cur.filter(function (s) { return s.stato === stato && (!onlyMine || s.dirigenteResponsabileId === A.uid()); });
      document.getElementById('count' + cap(stato)).textContent = items.length;
      var col = document.getElementById('col' + cap(stato));
      if (!items.length) { col.innerHTML = ''; return; }
      col.innerHTML = items.map(function (s) {
        var azienda = _aziendaById(s.aziendaId);
        var importo = s.stato === 'chiuso' ? (s.importoConfermato || 0) : (s.importoStimato || 0);
        var resp = _dirigentiList.find(function (d) { return d.id === s.dirigenteResponsabileId; });
        var prom = _nextPromemoria(s.id);
        var chip = '';
        if (prom) {
          var days = _daysDiff(prom.dataScadenza);
          if (days < 0) chip = '<span class="dg-chip dg-chip--overdue">Scaduto</span>';
          else if (days <= 7) chip = '<span class="dg-chip dg-chip--soon">' + _fmtDate(prom.dataScadenza) + '</span>';
        }
        return '<div class="dg-kanban-card" draggable="true" data-id="' + s.id + '">' +
          '<div class="dg-kanban-card-top">' +
          '<span class="dg-kanban-card-nome">' + esc(azienda ? azienda.ragioneSociale : '—') +
          (azienda && _isStorico(azienda.id) ? ' <span class="dg-badge dg-badge--storico" title="Sponsor storico">storico</span>' : '') +
          '</span>' +
          (s.note ? '<svg class="dg-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" title="' + esc(s.note) + '"><path d="M4 4h16v13l-4 4H4z"/><path d="M8 9h8M8 13h5"/></svg>' : '') +
          '</div>' +
          '<div class="dg-kanban-card-importo">€' + Number(importo || 0).toLocaleString('it-IT') + '</div>' +
          '<div class="dg-kanban-card-bottom">' +
          '<span class="dg-avatar" title="' + esc(resp ? (resp.nome + ' ' + resp.cognome) : 'Non assegnato') + '">' + (resp ? _initials(resp.nome, resp.cognome) : '?') + '</span>' +
          chip +
          '</div></div>';
      }).join('');
    });

    _attachKanbanEvents();
    _renderPezziSponsor();
  }

  /* ---- Materiali sponsor — tabella pezzi da realizzare per sponsor chiuso ----
     Ogni cella assegna una dimensione (dal listino catalogoDimensioni della stagione),
     il cui prezzo viene "fotografato" sulla cella (sponsorizzazione.pezzi[pezzo] = {dimensione, prezzo})
     così un ritocco successivo del listino non altera le stampe già assegnate.
     Il totale imponibile confluisce in automatico in una voce di spesa "Materiali sponsor"
     con IVA 22% figlia, tramite _syncMaterialiSpesa() — stesso meccanismo IVA già usato per gli sponsor. */
  /* ---- Prezzo del pezzo con due fasce (es. 30 pz a €11 + 20 pz a €13): se è impostata una
     quantità sulla prima fascia il totale è quello fisso delle due fasce (p1*q1 + p2*q2),
     altrimenti (voci "vecchie", un solo prezzo senza quantità) resta il prezzo unitario
     moltiplicato per i pezzi effettivamente assegnati nelle celle. Il campo "scontato", se
     impostato, è un prezzo di favore per capo concordato col fornitore, salvato ESATTAMENTE
     come inserito dall'utente (scontatoIvaInclusa dice se quel numero è IVA inclusa o esclusa):
     sostituisce ovunque il calcolo a pezzo/fasce. Il totale imponibile si ottiene moltiplicando
     per la quantità (scontatoQta se impostata, altrimenti i pezzi assegnati nelle celle) e
     scorporando l'IVA una sola volta alla fine (vedi _totalePezzoColonna), per non accumulare
     l'arrotondamento del prezzo unitario su tante unità. ---- */
  function _pezzoPrezzoTiers(entry) {
    if (entry && typeof entry === 'object') {
      return {
        p1: +entry.p1 || 0, q1: +entry.q1 || 0, p2: +entry.p2 || 0, q2: +entry.q2 || 0,
        scontato: +entry.scontato || 0, scontatoQta: +entry.scontatoQta || 0, scontatoIvaInclusa: !!entry.scontatoIvaInclusa
      };
    }
    return { p1: +entry || 0, q1: 0, p2: 0, q2: 0, scontato: 0, scontatoQta: 0, scontatoIvaInclusa: false };
  }

  function _totalePezzoColonna(entry, demand) {
    var t = _pezzoPrezzoTiers(entry);
    if (t.scontato > 0) {
      var qta = t.scontatoQta > 0 ? t.scontatoQta : (demand || 0);
      var totaleGrezzo = t.scontato * qta;
      var totaleImponibile = t.scontatoIvaInclusa ? (totaleGrezzo / 1.22) : totaleGrezzo;
      return Math.round(totaleImponibile * 100) / 100;
    }
    if (t.q1 > 0) return Math.round((t.p1 * t.q1 + t.p2 * t.q2) * 100) / 100;
    return Math.round(t.p1 * (demand || 0) * 100) / 100;
  }

  function _renderPezziSponsor() {
    var wrap = document.getElementById('pezziSponsorWrap');
    var riepilogoEl = document.getElementById('pezziSponsorRiepilogo');
    var esclusiEl = document.getElementById('pezziSponsorEsclusi');
    if (!wrap) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var pezzi = season.pezziSponsor || [];
    var catalogo = season.catalogoDimensioni || [];

    var sponsorRows = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && (s.stato === 'chiuso' || s.includiMateriali); })
      .map(function (s) {
        var az = _aziendaById(s.aziendaId);
        return { kind: 'sponsor', id: s.id, nome: az ? az.ragioneSociale : '—', pezzi: s.pezzi || {}, stato: s.stato, escluso: !!s.escludiMateriali };
      });
    var extraRows = (season.vociExtra || []).map(function (v) {
      return { kind: 'extra', id: v.id, nome: v.nome, pezzi: v.pezzi || {}, stato: null, escluso: !!v.escluso };
    });
    var tutte = sponsorRows.concat(extraRows);
    var byNome = function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); };
    var rows = tutte.filter(function (r) { return !r.escluso; }).sort(byNome);
    var esclusi = tutte.filter(function (r) { return r.escluso; }).sort(byNome);

    _renderPezziEsclusi(esclusi, esclusiEl);

    if (!rows.length) {
      wrap.innerHTML = '<div class="dg-empty">' + (esclusi.length ? 'Tutte le voci sono state escluse da questa tabella.' : 'Nessuna voce in questa tabella — aggiungine una con "+ Aggiungi".') + '</div>';
      if (riepilogoEl) riepilogoEl.innerHTML = '';
      return;
    }

    var prezziPezzi = season.pezziPrezzi || {};
    var countPerPezzo = {};
    rows.forEach(function (r) {
      if (!r.pezzi) return;
      Object.keys(r.pezzi).forEach(function (k) {
        var cell = r.pezzi[k];
        if (!cell || !cell.dimensione) return;
        var q = cell.quantita ? (+cell.quantita || 1) : 1;
        countPerPezzo[k] = Math.max(countPerPezzo[k] || 0, q);
      });
    });
    var fmtPzz = function (n) { return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2 }); };
    var head = '<tr><th>Sponsor</th>' +
      pezzi.map(function (p) {
        var tiers = _pezzoPrezzoTiers(prezziPezzi[p]);
        var demand = countPerPezzo[p] || 0;
        var totaleCol = _totalePezzoColonna(prezziPezzi[p], demand);
        var pezziTotali = tiers.q1 > 0 ? (tiers.q1 + tiers.q2) : demand;

        var badgeHtml, badgeTitle, badgeClass, scontoGrossHtml = '';
        if (tiers.scontato > 0) {
          var qtaScontato = tiers.scontatoQta > 0 ? tiers.scontatoQta : demand;
          if (tiers.scontatoIvaInclusa) {
            var totaleGrezzoScontato = Math.round(tiers.scontato * qtaScontato * 100) / 100;
            badgeHtml = '€' + fmtPzz(totaleGrezzoScontato) + '<span class="dg-pezzi-th-price-qty"> · ' + qtaScontato + ' pz</span>';
            badgeTitle = qtaScontato + ' pz × €' + fmtPzz(tiers.scontato) + '/capo IVA inclusa = €' + fmtPzz(totaleGrezzoScontato) + ' totale IVA inclusa (imponibile €' + fmtPzz(totaleCol) + ') — prezzo scontato dal fornitore, clicca per modificare';
            scontoGrossHtml = '<div class="dg-pezzi-th-gross">Imponibile €' + fmtPzz(totaleCol) + '</div>';
          } else {
            badgeHtml = '€' + fmtPzz(totaleCol) + '<span class="dg-pezzi-th-price-qty"> · ' + qtaScontato + ' pz</span>';
            badgeTitle = qtaScontato + ' pz × €' + fmtPzz(tiers.scontato) + '/capo (IVA 22% esclusa) — prezzo scontato dal fornitore, clicca per modificare';
          }
          badgeClass = ' has-price has-sconto';
        } else if (totaleCol > 0) {
          badgeHtml = '€' + fmtPzz(totaleCol) + '<span class="dg-pezzi-th-price-qty"> · ' + pezziTotali + ' pz</span>';
          badgeTitle = tiers.q1 > 0
            ? (tiers.p2
              ? (tiers.q1 + ' pz × €' + fmtPzz(tiers.p1) + ' + ' + tiers.q2 + ' pz × €' + fmtPzz(tiers.p2) + ' (IVA 22% esclusa)')
              : (tiers.q1 + ' pz × €' + fmtPzz(tiers.p1) + ' (IVA 22% esclusa)'))
            : ('€' + fmtPzz(tiers.p1) + ' a pezzo, IVA 22% esclusa — clicca per modificare');
          badgeClass = ' has-price';
        } else if (tiers.p1) {
          badgeHtml = '€' + fmtPzz(tiers.p1) + '/pz';
          badgeTitle = 'Prezzo impostato, nessun pezzo ancora assegnato — clicca per modificare';
          badgeClass = ' has-price';
        } else {
          badgeHtml = '+ prezzo';
          badgeTitle = 'Imposta il prezzo del pezzo (IVA 22% esclusa), anche su due fasce di quantità';
          badgeClass = '';
        }
        return '<th class="dg-pezzi-th-col">' +
          '<div class="dg-pezzi-th-name">' + esc(p) +
          '<button type="button" class="dg-pezzi-th-remove" data-pezzo="' + esc(p) + '" title="Rimuovi colonna">✕</button></div>' +
          '<button type="button" class="dg-pezzi-th-price' + badgeClass + '" data-pezzo="' + esc(p) + '" title="' + esc(badgeTitle) + '">' +
          badgeHtml + '</button>' + scontoGrossHtml + '</th>';
      }).join('') +
      '<th><button type="button" class="dg-pezzi-addcol">+ Pezzo</button></th></tr>';

    var body = rows.map(function (r) {
      var badge = r.kind === 'sponsor' && r.stato !== 'chiuso' ? ' <span class="dg-badge dg-badge--' + r.stato + '" style="margin-left:6px">' + esc(_statoLabel(r.stato)) + '</span>' : '';
      var extraTag = r.kind === 'extra' ? ' <span class="dg-pezzi-extra-tag" title="Voce libera aggiunta manualmente, non collegata a uno sponsor">voce libera</span>' : '';
      var cells = pezzi.map(function (p) {
        var cell = r.pezzi && r.pezzi[p];
        var q = cell && cell.quantita ? (+cell.quantita || 1) : 1;
        var filled = cell && cell.dimensione;
        var chip;
        if (filled) {
          var unitario = +cell.prezzo || 0;
          var tooltip = esc(cell.dimensione) + ' — ' + q + ' pz × €' + unitario.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' cad.';
          chip = '<span class="dg-pezzi-chip" title="' + tooltip + '">€' + (unitario * q).toLocaleString('it-IT', { minimumFractionDigits: 2 }) +
            (q > 1 ? '<sup class="dg-pezzi-qty">×' + q + '</sup>' : '') + '</span>';
        } else {
          chip = '<span class="dg-pezzi-chip dg-pezzi-chip--empty">+</span>';
        }
        return '<td class="dg-pezzi-cell' + (!catalogo.length ? ' is-disabled' : '') + (filled ? ' dg-pezzi-cell--filled' : '') + '" data-kind="' + r.kind + '" data-id="' + r.id + '" data-pezzo="' + esc(p) + '">' + chip + '</td>';
      }).join('');
      return '<tr data-kind="' + r.kind + '"><td>' + esc(r.nome) + badge + extraTag + '</td>' + cells +
        '<td><button type="button" class="dg-pezzi-row-remove" data-kind="' + r.kind + '" data-id="' + r.id + '" title="Rimuovi dalla tabella">✕</button></td></tr>';
    }).join('');

    wrap.innerHTML = '<table class="dg-table dg-pezzi-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    _attachPezziSponsorEvents(wrap);
    _renderPezziRiepilogo(rows, riepilogoEl);
    _syncMaterialiSpesa();
  }

  function _renderPezziEsclusi(esclusi, el) {
    if (!el) return;
    if (!esclusi.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="dg-pezzi-esclusi">' +
      '<span class="dg-pezzi-esclusi-label">Esclusi da questa tabella:</span>' +
      esclusi.map(function (r) {
        return '<span class="dg-pezzi-esclusi-chip">' + esc(r.nome) +
          '<button type="button" class="dg-pezzi-esclusi-restore" data-kind="' + r.kind + '" data-id="' + r.id + '" title="Rimetti in tabella">↺</button></span>';
      }).join('') + '</div>';
    el.querySelectorAll('.dg-pezzi-esclusi-restore').forEach(function (btn) {
      btn.addEventListener('click', function () { _restoreRowPezzi(btn.dataset.kind, btn.dataset.id); });
    });
  }

  function _removeRowFromPezzi(kind, id) {
    if (kind === 'sponsor') return _removeSponsorFromPezzi(id);
    return _removeExtraVoce(id);
  }

  function _restoreRowPezzi(kind, id) {
    if (kind === 'sponsor') return _restoreSponsorPezzi(id);
    return _restoreExtraVoce(id);
  }

  function _removeSponsorFromPezzi(id) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var nome = az ? az.ragioneSociale : id;
    var haCosti = s.pezzi && Object.keys(s.pezzi).some(function (k) { return s.pezzi[k] && s.pezzi[k].dimensione; });
    confirm('Rimuovere "' + nome + '" dalla tabella materiali sponsor?' + (haCosti ? ' Le dimensioni già assegnate restano salvate e continuano a essere conteggiate nella voce di spesa; puoi rimetterlo in tabella in qualsiasi momento.' : ''), function () {
      s.escludiMateriali = true;
      _renderPezziSponsor();
      var label = 'Sponsorizzazione — ' + nome;
      db.collection('sponsorizzazioni').doc(id).update({ escludiMateriali: true })
        .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', [{ campo: 'escludiMateriali', prima: false, dopo: true }]); })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  }

  function _restoreSponsorPezzi(id) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    s.escludiMateriali = false;
    _renderPezziSponsor();
    db.collection('sponsorizzazioni').doc(id).update({ escludiMateriali: false })
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', [{ campo: 'escludiMateriali', prima: true, dopo: false }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _removeExtraVoce(id) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var arr = (season.vociExtra || []).slice();
    var idx = arr.findIndex(function (v) { return v.id === id; });
    if (idx === -1) return;
    var nome = arr[idx].nome;
    var haCosti = arr[idx].pezzi && Object.keys(arr[idx].pezzi).some(function (k) { return arr[idx].pezzi[k] && arr[idx].pezzi[k].dimensione; });
    confirm('Rimuovere "' + nome + '" dalla tabella materiali sponsor?' + (haCosti ? ' Le dimensioni già assegnate restano salvate e continuano a essere conteggiate nella voce di spesa; puoi rimetterla in tabella in qualsiasi momento.' : ''), function () {
      arr[idx] = Object.assign({}, arr[idx], { escluso: true });
      season.vociExtra = arr;
      _renderPezziSponsor();
      db.collection('budgetSeasons').doc(season.id).update({ vociExtra: arr })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  }

  function _restoreExtraVoce(id) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var arr = (season.vociExtra || []).slice();
    var idx = arr.findIndex(function (v) { return v.id === id; });
    if (idx === -1) return;
    arr[idx] = Object.assign({}, arr[idx], { escluso: false });
    season.vociExtra = arr;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ vociExtra: arr })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- "+ Aggiungi" — inserisce manualmente in tabella uno sponsor non ancora chiuso
     (prospect/contattato/in trattativa/rifiutato) oppure una voce libera non legata a
     nessuno sponsor (es. "Magazzino", "Materiale extra"), per pianificare i materiali. ---- */
  function _sponsorPezziCandidati() {
    return _sponsorizzazioni.filter(function (s) {
      return s.seasonId === _currentSeasonId && s.stato !== 'chiuso' && !s.includiMateriali;
    }).map(function (s) { return { s: s, azienda: _aziendaById(s.aziendaId) }; })
      .sort(function (a, b) { return (a.azienda ? a.azienda.ragioneSociale : '').localeCompare(b.azienda ? b.azienda.ragioneSociale : ''); });
  }

  function _openAggiungiSponsorPopover(btn) {
    var candidati = _sponsorPezziCandidati();
    var pop = document.getElementById('dgPezziPopover');
    var html = '<div class="dg-pezzi-popover-item dg-pezzi-popover-item--new" data-action="new">+ Voce personalizzata…</div>';
    html += candidati.length ? candidati.map(function (r) {
      var nome = r.azienda ? r.azienda.ragioneSociale : '—';
      return '<div class="dg-pezzi-popover-item" data-id="' + r.s.id + '"><span>' + esc(nome) + '</span><span class="dg-muted" style="font-size:11px">' + esc(_statoLabel(r.s.stato)) + '</span></div>';
    }).join('') : '<div class="dg-pezzi-popover-empty">Nessun altro sponsor disponibile per questa stagione.</div>';
    pop.innerHTML = html;

    var rect = btn.getBoundingClientRect();
    pop.classList.remove('is-hidden');
    var popW = pop.offsetWidth || 170;
    var spazioSotto = window.innerHeight - rect.bottom;
    pop.style.left = Math.max(4, Math.min(rect.right - popW, window.innerWidth - popW - 4)) + 'px';
    pop.style.top = (spazioSotto > pop.offsetHeight + 8 ? rect.bottom + 4 : rect.top - pop.offsetHeight - 4) + 'px';

    pop.querySelector('[data-action="new"]').addEventListener('click', function () {
      _closePezzoPopover();
      _addVoceExtra();
    });
    pop.querySelectorAll('.dg-pezzi-popover-item[data-id]').forEach(function (it) {
      it.addEventListener('click', function () {
        _addSponsorToPezzi(it.dataset.id);
        _closePezzoPopover();
      });
    });
    setTimeout(function () { document.addEventListener('click', _pezzoPopoverOutsideClick, true); }, 0);
  }

  function _addSponsorToPezzi(id) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    s.includiMateriali = true;
    s.escludiMateriali = false;
    _renderPezziSponsor();
    db.collection('sponsorizzazioni').doc(id).update({ includiMateriali: true, escludiMateriali: false })
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', [{ campo: 'includiMateriali', prima: false, dopo: true }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _addVoceExtra() {
    var nome = prompt('Nome della voce (es. Magazzino, Materiale extra, Striscione ingresso):');
    if (!nome) return;
    nome = nome.trim();
    if (!nome) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var arr = (season.vociExtra || []).slice();
    var id = 'extra_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    var entry = { id: id, nome: nome, pezzi: {}, escluso: false };
    arr.push(entry);
    season.vociExtra = arr;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ vociExtra: arr })
      .then(function () { return _logWrite('voceMateriali', id, 'Voce materiali — ' + nome, 'create', _diff({}, entry, Object.keys(entry))); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _renderPezziRiepilogo(rows, el) {
    if (!el) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var prezziPezzi = season.pezziPrezzi || {};

    var perDimensione = {};
    var perPezzo = {};
    var imponibileStampe = 0;
    rows.forEach(function (r) {
      if (!r.pezzi) return;
      Object.keys(r.pezzi).forEach(function (k) {
        var cell = r.pezzi[k];
        if (!cell || !cell.dimensione) return;
        var q = cell.quantita ? (+cell.quantita || 1) : 1;
        var subtot = (+cell.prezzo || 0) * q;
        imponibileStampe += subtot;
        var d = perDimensione[cell.dimensione] || (perDimensione[cell.dimensione] = { count: 0, subtotale: 0 });
        d.count += q; d.subtotale += subtot;
        perPezzo[k] = Math.max(perPezzo[k] || 0, q);
      });
    });

    var imponibileMerce = 0;
    var fmt = function (n) { return '€' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2 }); };
    var righePezzi = Object.keys(perPezzo).sort().map(function (nome) {
      var count = perPezzo[nome];
      var t = _pezzoPrezzoTiers(prezziPezzi[nome]);
      var subtot = _totalePezzoColonna(prezziPezzi[nome], count);
      imponibileMerce += subtot;
      var right, ivaLine;
      if (subtot && t.scontato > 0 && t.scontatoIvaInclusa) {
        var lordoScontato = Math.round(t.scontato * count * 100) / 100;
        right = fmt(lordoScontato);
        ivaLine = '<div class="dg-pezzi-riepilogo-subline">prezzo scontato · imponibile ' + fmt(subtot) + '</div>';
      } else {
        right = subtot ? fmt(subtot) : '<span class="dg-muted" style="font-weight:400">prezzo non impostato</span>';
        ivaLine = subtot ? '<div class="dg-pezzi-riepilogo-subline">' + (t.scontato > 0 ? 'prezzo scontato · ' : '') + fmt(Math.round((subtot / count) * 1.22 * 100) / 100) + '/pz IVA compr.</div>' : '';
      }
      return '<div class="dg-pezzi-riepilogo-row"><span>' + esc(nome) + ' × ' + count + '</span><span>' + right + '</span></div>' + ivaLine;
    }).join('');

    var imponibile = imponibileStampe + imponibileMerce;
    if (!imponibile) { el.innerHTML = ''; return; }

    var ivaStampe = Math.round(imponibileStampe * 22) / 100;
    var totaleStampe = Math.round((imponibileStampe + ivaStampe) * 100) / 100;
    var ivaMerce = Math.round(imponibileMerce * 22) / 100;
    var totaleMerce = Math.round((imponibileMerce + ivaMerce) * 100) / 100;
    var iva = Math.round(imponibile * 22) / 100;
    var totale = Math.round((imponibile + iva) * 100) / 100;

    var righeStampe = Object.keys(perDimensione).sort().map(function (nome) {
      var d = perDimensione[nome];
      return '<div class="dg-pezzi-riepilogo-row"><span>' + esc(nome) + ' × ' + d.count + '</span><span>' + fmt(d.subtotale) + '</span></div>';
    }).join('');

    el.innerHTML = '<div class="dg-pezzi-riepilogo-group">' +
      '<div class="dg-pezzi-riepilogo">' +
      '<div class="dg-pezzi-riepilogo-title">Stampe</div>' + (righeStampe || '<div class="dg-muted" style="font-size:12px">Nessuna stampa assegnata.</div>') +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-subtotal" style="margin-top:8px"><span>Imponibile</span><span>' + fmt(imponibileStampe) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row"><span>IVA 22%</span><span>' + fmt(ivaStampe) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-total"><span>Totale stampe</span><span>' + fmt(totaleStampe) + '</span></div>' +
      '</div>' +
      '<div class="dg-pezzi-riepilogo">' +
      '<div class="dg-pezzi-riepilogo-title">Pezzi da produrre</div>' + (righePezzi || '<div class="dg-muted" style="font-size:12px">Nessun pezzo assegnato.</div>') +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-subtotal" style="margin-top:8px"><span>Imponibile</span><span>' + fmt(imponibileMerce) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row"><span>IVA 22%</span><span>' + fmt(ivaMerce) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-total"><span>Totale pezzi</span><span>' + fmt(totaleMerce) + '</span></div>' +
      '</div>' +
      '</div>' +
      '<div class="dg-pezzi-riepilogo dg-pezzi-riepilogo--grand">' +
      '<div class="dg-pezzi-riepilogo-title">Totale complessivo</div>' +
      '<div class="dg-pezzi-riepilogo-value">' + fmt(totale) + '</div>' +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-grand-detail"><span>Imponibile</span><span>' + fmt(imponibile) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-grand-detail"><span>IVA 22%</span><span>' + fmt(iva) + '</span></div>' +
      '</div>';
  }

  function _attachPezziSponsorEvents(wrap) {
    wrap.querySelectorAll('.dg-pezzi-cell').forEach(function (td) {
      td.addEventListener('click', function () { _openPezzoPopover(td); });
    });
    wrap.querySelectorAll('.dg-pezzi-th-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); _removePezzoSponsor(btn.dataset.pezzo); });
    });
    wrap.querySelectorAll('.dg-pezzi-th-price').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); _setPrezzoPezzo(btn.dataset.pezzo); });
    });
    wrap.querySelectorAll('.dg-pezzi-row-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); _removeRowFromPezzi(btn.dataset.kind, btn.dataset.id); });
    });
    var addBtn = wrap.querySelector('.dg-pezzi-addcol');
    if (addBtn) addBtn.addEventListener('click', _addPezzoSponsor);
  }

  /* ---- Lettura/scrittura pezzi di una riga a prescindere dal tipo (sponsor o voce libera) ---- */
  function _pezziRowGetPezzi(kind, id) {
    if (kind === 'sponsor') {
      var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
      return s ? (s.pezzi || {}) : {};
    }
    var season = _seasons.find(function (x) { return x.id === _currentSeasonId; }) || {};
    var v = (season.vociExtra || []).find(function (x) { return x.id === id; });
    return v ? (v.pezzi || {}) : {};
  }

  function _pezziRowApplyMutation(kind, id, newPezzi) {
    if (kind === 'sponsor') {
      var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
      if (!s) return;
      var before = s.pezzi || {};
      s.pezzi = newPezzi;
      _renderPezziSponsor();
      var az = _aziendaById(s.aziendaId);
      var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
      db.collection('sponsorizzazioni').doc(id).update({ pezzi: newPezzi })
        .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', _diff({ pezzi: before }, { pezzi: newPezzi }, ['pezzi'])); })
        .catch(function (e) { alert('Errore: ' + e.message); });
      return;
    }
    var season = _seasons.find(function (x) { return x.id === _currentSeasonId; });
    if (!season) return;
    var arr = (season.vociExtra || []).slice();
    var idx = arr.findIndex(function (v) { return v.id === id; });
    if (idx === -1) return;
    var before2 = arr[idx].pezzi || {};
    var nome = arr[idx].nome;
    arr[idx] = Object.assign({}, arr[idx], { pezzi: newPezzi });
    season.vociExtra = arr;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ vociExtra: arr })
      .then(function () { return _logWrite('voceMateriali', id, 'Voce materiali — ' + nome, 'update', _diff({ pezzi: before2 }, { pezzi: newPezzi }, ['pezzi'])); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- Popover leggero per assegnare dimensione/quantità a una cella (al posto di controlli fissi in ogni cella) ---- */
  function _closePezzoPopover() {
    var pop = document.getElementById('dgPezziPopover');
    if (pop) { pop.classList.add('is-hidden'); pop.innerHTML = ''; }
    document.removeEventListener('click', _pezzoPopoverOutsideClick, true);
  }

  function _pezzoPopoverOutsideClick(e) {
    var pop = document.getElementById('dgPezziPopover');
    if (pop && !pop.contains(e.target)) _closePezzoPopover();
  }

  function _openPezzoPopover(td) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var catalogo = season.catalogoDimensioni || [];
    if (!catalogo.length) { alert('Crea prima il listino dimensioni (pulsante "Listino dimensioni" in alto a destra).'); return; }

    var kind = td.dataset.kind, id = td.dataset.id, pezzo = td.dataset.pezzo;
    var pezziCorrenti = _pezziRowGetPezzi(kind, id);
    var curCell = pezziCorrenti[pezzo];
    var cur = curCell && curCell.dimensione ? curCell.dimensione : '';

    var pop = document.getElementById('dgPezziPopover');
    var qtyHtml = '';
    if (cur) {
      var q = curCell.quantita ? (+curCell.quantita || 1) : 1;
      qtyHtml = '<div class="dg-pezzi-popover-qty">' +
        '<label>Quantità (pezzi da realizzare)</label>' +
        '<div class="dg-pezzi-popover-qty-row">' +
        '<input type="number" min="1" step="1" value="' + q + '" class="dg-pezzi-qty-input">' +
        '<button type="button" class="dg-pezzi-qty-apply">Applica</button>' +
        '</div></div>';
    }
    var items = catalogo.map(function (d) {
      return '<div class="dg-pezzi-popover-item' + (d.nome === cur ? ' is-active' : '') + '" data-nome="' + esc(d.nome) + '"><span>' + esc(d.nome) + '</span><span>€' + Number(d.prezzo || 0).toLocaleString('it-IT') + '</span></div>';
    }).join('');
    if (cur) items += '<div class="dg-pezzi-popover-item dg-pezzi-popover-item--clear" data-nome="">Rimuovi assegnazione</div>';
    pop.innerHTML = qtyHtml + items;

    var rect = td.getBoundingClientRect();
    pop.classList.remove('is-hidden');
    var popW = pop.offsetWidth || 170;
    var spazioSotto = window.innerHeight - rect.bottom;
    pop.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - popW - 4)) + 'px';
    pop.style.top = (spazioSotto > pop.offsetHeight + 8 ? rect.bottom + 4 : rect.top - pop.offsetHeight - 4) + 'px';

    if (cur) {
      var qtyInput = pop.querySelector('.dg-pezzi-qty-input');
      var applyBtn = pop.querySelector('.dg-pezzi-qty-apply');
      var applyQty = function () { _setPezzoQuantita(kind, id, pezzo, qtyInput.value); _closePezzoPopover(); };
      applyBtn.addEventListener('click', applyQty);
      qtyInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyQty(); });
    }

    pop.querySelectorAll('.dg-pezzi-popover-item[data-nome]').forEach(function (it) {
      it.addEventListener('click', function () {
        _setPezzoDimensione(kind, id, pezzo, it.dataset.nome);
        _closePezzoPopover();
      });
    });

    setTimeout(function () { document.addEventListener('click', _pezzoPopoverOutsideClick, true); }, 0);
  }

  function _setPezzoDimensione(kind, id, pezzo, nome) {
    var season = _seasons.find(function (x) { return x.id === _currentSeasonId; }) || {};
    var before = _pezziRowGetPezzi(kind, id);
    var after = Object.assign({}, before);
    if (!nome) {
      delete after[pezzo];
    } else {
      var dim = (season.catalogoDimensioni || []).find(function (d) { return d.nome === nome; });
      var quantitaPrec = before[pezzo] && before[pezzo].quantita ? before[pezzo].quantita : 1;
      after[pezzo] = { dimensione: nome, prezzo: dim ? (+dim.prezzo || 0) : 0, quantita: quantitaPrec };
    }
    _pezziRowApplyMutation(kind, id, after);
  }

  function _setPezzoQuantita(kind, id, pezzo, quantita) {
    var before = _pezziRowGetPezzi(kind, id);
    if (!before[pezzo]) return;
    var q = Math.max(1, Math.round(+quantita) || 1);
    var after = Object.assign({}, before);
    after[pezzo] = Object.assign({}, after[pezzo], { quantita: q });
    _pezziRowApplyMutation(kind, id, after);
  }

  function _addPezzoSponsor() {
    var nome = prompt('Nome del pezzo da realizzare (es. Cartellone, Maglia, Banner sito):');
    if (!nome) return;
    nome = nome.trim();
    if (!nome) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var pezzi = (season.pezziSponsor || []).slice();
    if (pezzi.some(function (p) { return p.toLowerCase() === nome.toLowerCase(); })) { alert('Esiste già un pezzo con questo nome.'); return; }
    pezzi.push(nome);
    season.pezziSponsor = pezzi;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ pezziSponsor: pezzi })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- Prezzo del pezzo (merce/gadget prima della stampa), impostato sull'intestazione della
     colonna — si somma al prezzo di stampa scelto per singola cella, non lo sostituisce.
     Supporta due fasce di prezzo/quantità (es. 30 pezzi a €11 + 20 pezzi a €13): se si indica
     una quantità sulla prima fascia il totale colonna diventa fisso (p1*q1 + p2*q2), altrimenti
     resta un prezzo unitario moltiplicato per i pezzi assegnati nelle celle (comportamento
     precedente, per compatibilità con i prezzi già impostati senza fasce).
     In alternativa alle fasce, si può impostare un prezzo scontato per capo (un prezzo di favore
     concordato col fornitore su un singolo pezzo di questa colonna): si dichiara se è IVA inclusa
     o esclusa e la quantità a cui si applica; il valore è salvato esattamente come inserito
     (scontatoIvaInclusa dice come interpretarlo) e mostrato in intestazione/riepilogo con quello
     stesso taglio (IVA inclusa se inserito tale), scorporando l'IVA solo per l'imponibile interno
     (vedi _totalePezzoColonna). Se presente sostituisce ovunque il calcolo a pezzo/fasce; le fasce
     restano comunque salvate per poterle ripristinare rimuovendo lo sconto. ---- */
  function _setPrezzoPezzo(pezzo) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var attuale = _pezzoPrezzoTiers((season.pezziPrezzi || {})[pezzo]);

    var scontoIn = prompt('Prezzo scontato per capo/pezzo dal fornitore nella colonna "' + pezzo + '" — usalo se il fornitore ti fa un prezzo di favore sul singolo pezzo. Lascia vuoto per impostare invece un prezzo a pezzo standard (eventualmente su due fasce di quantità):', attuale.scontato || '');
    if (scontoIn === null) return;
    var scontatoInput = 0;
    if (String(scontoIn).trim() !== '') {
      scontatoInput = +String(scontoIn).replace(',', '.');
      if (isNaN(scontatoInput) || scontatoInput < 0) { alert('Inserisci un numero valido.'); return; }
    }

    var p1 = attuale.p1, q1 = attuale.q1, p2 = attuale.p2, q2 = attuale.q2;
    var scontato = 0, scontatoQta = 0, scontatoIvaInclusa = false;
    if (scontatoInput) {
      var ivaIn = prompt('Il prezzo per capo che hai inserito (€' + scontatoInput.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ') è IVA inclusa o esclusa? Scrivi "inclusa" o "esclusa":', attuale.scontatoIvaInclusa ? 'inclusa' : 'esclusa');
      if (ivaIn === null) return;
      scontatoIvaInclusa = String(ivaIn).trim().toLowerCase().indexOf('incl') === 0;
      scontato = scontatoInput;

      var qtaIn = prompt('Quantità di pezzi a questo prezzo scontato (lascia vuoto per usare tutti i pezzi assegnati a questa colonna nella tabella):', attuale.scontatoQta || '');
      if (qtaIn === null) return;
      scontatoQta = Math.max(0, Math.round(+String(qtaIn).replace(',', '.')) || 0);
    } else {
      var p1in = prompt('Prezzo del pezzo "' + pezzo + '" (IVA 22% esclusa — costo del gadget/supporto, non della stampa):', attuale.p1 || '');
      if (p1in === null) return;
      p1 = +String(p1in).replace(',', '.');
      if (isNaN(p1) || p1 < 0) { alert('Inserisci un numero valido.'); return; }

      var q1in = prompt('Quantità a questo prezzo (lascia vuoto o 0 se è un prezzo unico, senza fasce):', attuale.q1 || '');
      if (q1in === null) return;
      q1 = +String(q1in).replace(',', '.') || 0;
      if (isNaN(q1) || q1 < 0) { alert('Inserisci una quantità valida.'); return; }

      p2 = 0; q2 = 0;
      if (q1 > 0) {
        var p2in = prompt('Prezzo per i pezzi successivi, oltre i primi ' + q1 + ' (lascia vuoto se non serve una seconda fascia):', attuale.p2 || '');
        if (p2in === null) return;
        if (String(p2in).trim() !== '') {
          p2 = +String(p2in).replace(',', '.');
          if (isNaN(p2) || p2 < 0) { alert('Inserisci un numero valido per il secondo prezzo.'); return; }
          var q2in = prompt('Quantità a questo secondo prezzo:', attuale.q2 || '');
          if (q2in === null) return;
          q2 = +String(q2in).replace(',', '.') || 0;
          if (isNaN(q2) || q2 < 0) { alert('Inserisci una quantità valida.'); return; }
        }
      }
    }

    var prezziPezzi = Object.assign({}, season.pezziPrezzi || {});
    if (!p1 && !q1 && !p2 && !q2 && !scontato) delete prezziPezzi[pezzo];
    else prezziPezzi[pezzo] = { p1: p1, q1: q1, p2: p2, q2: q2, scontato: scontato, scontatoQta: scontatoQta, scontatoIvaInclusa: scontatoIvaInclusa };
    season.pezziPrezzi = prezziPezzi;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ pezziPrezzi: prezziPezzi })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _removePezzoSponsor(pezzo) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    confirm('Rimuovere la colonna "' + pezzo + '"? Le eventuali dimensioni assegnate per questo pezzo andranno perse.', function () {
      var pezzi = (season.pezziSponsor || []).filter(function (p) { return p !== pezzo; });
      var vociExtra = (season.vociExtra || []).map(function (v) {
        if (!v.pezzi || !v.pezzi[pezzo]) return v;
        var np = Object.assign({}, v.pezzi);
        delete np[pezzo];
        return Object.assign({}, v, { pezzi: np });
      });
      var prezziPezzi = Object.assign({}, season.pezziPrezzi || {});
      delete prezziPezzi[pezzo];
      season.pezziSponsor = pezzi;
      season.vociExtra = vociExtra;
      season.pezziPrezzi = prezziPezzi;
      var interessati = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && s.pezzi && s.pezzi[pezzo]; });
      var batch = db.batch();
      batch.update(db.collection('budgetSeasons').doc(season.id), { pezziSponsor: pezzi, vociExtra: vociExtra, pezziPrezzi: prezziPezzi });
      interessati.forEach(function (s) {
        var after = Object.assign({}, s.pezzi);
        delete after[pezzo];
        s.pezzi = after;
        batch.update(db.collection('sponsorizzazioni').doc(s.id), { pezzi: after });
      });
      _renderPezziSponsor();
      batch.commit().catch(function (e) { alert('Errore: ' + e.message); });
    });
  }

  /* ---- Listino dimensioni stampe (catalogoDimensioni della stagione) ---- */
  function _renderDimensioniModalList() {
    var list = document.getElementById('dimensioniModalList');
    if (!list) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var cat = season.catalogoDimensioni || [];
    list.innerHTML = cat.length ? cat.map(function (d, i) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<span>' + esc(d.nome) + ' — €' + Number(d.prezzo || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + '</span>' +
        '<button class="dg-btn-icon-only dg-dimensione-del" title="Elimina" data-idx="' + i + '">' + _delIconSm() + '</button>' +
        '</div>';
    }).join('') : '<p class="dg-muted">Nessuna dimensione ancora.</p>';
    list.querySelectorAll('.dg-dimensione-del').forEach(function (btn) {
      btn.addEventListener('click', function () { _deleteDimensione(+btn.dataset.idx); });
    });
  }

  function _addDimensione() {
    var nomeInput = document.getElementById('dimensioneNewNomeInput');
    var prezzoInput = document.getElementById('dimensioneNewPrezzoInput');
    var nome = nomeInput.value.trim();
    var prezzo = +prezzoInput.value || 0;
    if (!nome) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var cat = (season.catalogoDimensioni || []).slice();
    if (cat.some(function (d) { return d.nome.toLowerCase() === nome.toLowerCase(); })) { alert('Esiste già una dimensione con questo nome.'); return; }
    cat.push({ nome: nome, prezzo: prezzo });
    season.catalogoDimensioni = cat;
    nomeInput.value = ''; prezzoInput.value = '';
    _renderDimensioniModalList();
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ catalogoDimensioni: cat })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _deleteDimensione(idx) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var cat = (season.catalogoDimensioni || []).slice();
    var d = cat[idx];
    if (!d) return;
    confirm('Rimuovere la dimensione "' + d.nome + '" dal listino? Le stampe già assegnate con questa dimensione mantengono comunque il prezzo già impostato.', function () {
      cat.splice(idx, 1);
      season.catalogoDimensioni = cat;
      _renderDimensioniModalList();
      _renderPezziSponsor();
      db.collection('budgetSeasons').doc(season.id).update({ catalogoDimensioni: cat })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  }

  /* ---- Voci di spesa "Materiali sponsor" — il totale delle stampe e quello dei pezzi
     assegnati (stato chiuso, stagione corrente) confluiscono in DUE voci separate come
     PREVENTIVATO (proiezione dalla tabella), ciascuna con la propria IVA 22% figlia via
     _syncSpesaIva (stesso meccanismo generico usato per ogni voce). Il Sostenuto (la spesa
     realmente effettuata) resta interamente a mano nella tabella Spese — vedi il commento
     su _syncVoceAutomatica per il motivo. Il prezzo forfettario scontato eventualmente impostato
     per colonna (vedi _setPrezzoPezzo) confluisce già qui tramite _totalePezzoColonna. ---- */
  var _materialiSyncBusy = false;
  function _totaliMaterialiSponsor() {
    var totStampe = 0, totPezzi = 0;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var prezziPezzi = season.pezziPrezzi || {};
    var perPezzo = {};

    var accumula = function (pezziObj) {
      if (!pezziObj) return;
      Object.keys(pezziObj).forEach(function (k) {
        var cell = pezziObj[k];
        if (!cell || !cell.dimensione) return;
        var q = cell.quantita ? (+cell.quantita || 1) : 1;
        totStampe += (+cell.prezzo || 0) * q;
        perPezzo[k] = Math.max(perPezzo[k] || 0, q);
      });
    };

    _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && (s.stato === 'chiuso' || s.includiMateriali); })
      .forEach(function (s) { accumula(s.pezzi); });
    (season.vociExtra || []).forEach(function (v) { accumula(v.pezzi); });

    Object.keys(perPezzo).forEach(function (nome) { totPezzi += _totalePezzoColonna(prezziPezzi[nome], perPezzo[nome]); });

    return { stampe: Math.round(totStampe * 100) / 100, pezzi: Math.round(totPezzi * 100) / 100 };
  }

  /* Crea/aggiorna/rimuove una singola voce di spesa auto-gestita (identificata dal campo
     season[fieldId]) e la sua IVA 22% figlia, allineandola al totale corrente.
     Il totale calcolato dalla tabella confluisce SEMPRE e SOLO in "Preventivato": "Sostenuto"
     (la spesa realmente effettuata) resta interamente a mano dell'utente e il sync non lo
     tocca mai più dopo la creazione — altrimenti ogni ricalcolo della tabella cancellerebbe
     un valore inserito manualmente (es. portato a 0 perché non ancora pagato). Per lo stesso
     motivo la voce viene rimossa in automatico solo se anche il sostenuto è a zero: se l'utente
     ha già registrato una spesa reale, la voce resta anche a preventivato azzerato. */
  function _syncVoceAutomatica(season, fieldId, preventivato, categoria, note) {
    var v = season[fieldId] ? _vociSpesa.find(function (x) { return x.id === season[fieldId]; }) : null;
    if (!preventivato && !v) return Promise.resolve();
    if (v && (+v.importoPreventivato || 0) === preventivato) return Promise.resolve();

    if (!preventivato && v && !(+v.importoSostenuto || 0)) {
      var figlia = v.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;
      return db.collection('vociSpesa').doc(v.id).delete()
        .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== v.id && (!figlia || x.id !== figlia.id); });
          season[fieldId] = '';
          var patch = {}; patch[fieldId] = '';
          return db.collection('budgetSeasons').doc(season.id).update(patch);
        });
    }
    if (v) {
      var old = { importoPreventivato: v.importoPreventivato || 0 };
      v.importoPreventivato = preventivato;
      return db.collection('vociSpesa').doc(v.id).update({ importoPreventivato: preventivato })
        .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'update', _diff(old, { importoPreventivato: preventivato }, ['importoPreventivato'])); })
        .then(function () { return _syncSpesaIva(v); });
    }
    var data = {
      seasonId: _currentSeasonId, categoria: categoria, categoriaSpesaId: '',
      importoPreventivato: preventivato, importoSostenuto: 0, ivaAliquota: 22, dataSpesa: '',
      note: note
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      season[fieldId] = ref.id;
      var patch = {}; patch[fieldId] = ref.id;
      return db.collection('budgetSeasons').doc(season.id).update(patch);
    }).then(function () {
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + categoria, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      return _syncSpesaIva(data);
    });
  }

  function _syncMaterialiSpesa() {
    if (_materialiSyncBusy) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var totali = _totaliMaterialiSponsor();

    _materialiSyncBusy = true;
    var release = function () { _materialiSyncBusy = false; _renderSpese(); _renderStatCards(); _renderBilancio(); };

    /* Migrazione una tantum: le stagioni create prima dello split avevano un'unica voce
       combinata "Materiali sponsor" — la rimuove (con la sua IVA figlia) così il sync sotto
       ricrea le due voci separate. */
    var migrazione = Promise.resolve();
    if (season.materialiVoceSpesaId) {
      var vecchia = _vociSpesa.find(function (x) { return x.id === season.materialiVoceSpesaId; });
      if (vecchia) {
        var figliaVecchia = vecchia.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === vecchia.ivaVoceSpesaId; }) : null;
        migrazione = db.collection('vociSpesa').doc(vecchia.id).delete()
          .then(function () { return _logWrite('voceSpesa', vecchia.id, 'Spesa — ' + vecchia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
          .then(function () { return figliaVecchia ? db.collection('vociSpesa').doc(figliaVecchia.id).delete()
            .then(function () { return _logWrite('voceSpesa', figliaVecchia.id, 'Spesa — ' + figliaVecchia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
          .then(function () {
            _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== vecchia.id && (!figliaVecchia || x.id !== figliaVecchia.id); });
            season.materialiVoceSpesaId = '';
            return db.collection('budgetSeasons').doc(season.id).update({ materialiVoceSpesaId: '' });
          });
      } else {
        season.materialiVoceSpesaId = '';
        migrazione = db.collection('budgetSeasons').doc(season.id).update({ materialiVoceSpesaId: '' });
      }
    }

    var p = migrazione
      .then(function () {
        return _syncVoceAutomatica(season, 'materialiStampeVoceSpesaId', totali.stampe, 'Materiali sponsor — Stampe',
          'Preventivato automatico dalle stampe assegnate agli sponsor chiusi (tabella "Materiali sponsor") — il Sostenuto va aggiornato a mano qui sotto quando la spesa è effettiva');
      })
      .then(function () {
        return _syncVoceAutomatica(season, 'materialiPezziVoceSpesaId', totali.pezzi, 'Materiali sponsor — Pezzi',
          'Preventivato automatico dai pezzi/gadget assegnati agli sponsor chiusi (tabella "Materiali sponsor") — il Sostenuto va aggiornato a mano qui sotto quando la spesa è effettiva');
      });

    p.then(release, function (e) { release(); alert('Errore aggiornamento spesa materiali: ' + e.message); });
  }

  function _attachKanbanEvents() {
    document.querySelectorAll('.dg-kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); });
      card.addEventListener('click', function () { if (!_kanbanTouch.moved) _openDrawer(card.dataset.id); });
      _bindKanbanCardTouch(card);
    });
    document.querySelectorAll('.dg-kanban-col-body').forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('dg-drop-hover'); });
      col.addEventListener('dragleave', function () { col.classList.remove('dg-drop-hover'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('dg-drop-hover');
        var id = e.dataTransfer.getData('text/plain');
        var stato = col.closest('.dg-kanban-col').dataset.stato;
        _changeStato(id, stato);
      });
    });
  }

  /* ---- Drag & drop touch per Kanban sponsor (mobile) ---- */
  var _kanbanTouch = {
    timer: null, active: false, moved: false, card: null, id: null,
    clone: null, offX: 0, offY: 0, startX: 0, startY: 0, lastX: 0, lastY: 0,
    curCol: null, boardEl: null, rafId: null
  };
  var KANBAN_SCROLL_EDGE = 70;
  var KANBAN_SCROLL_SPEED = 14;

  function _kanbanTouchCleanup() {
    if (_kanbanTouch.timer) { clearTimeout(_kanbanTouch.timer); }
    if (_kanbanTouch.rafId) { cancelAnimationFrame(_kanbanTouch.rafId); }
    if (_kanbanTouch.clone) { _kanbanTouch.clone.remove(); }
    if (_kanbanTouch.card) { _kanbanTouch.card.classList.remove('is-dragging'); }
    if (_kanbanTouch.curCol) { _kanbanTouch.curCol.classList.remove('dg-drop-hover'); }
    _kanbanTouch.timer = null;
    _kanbanTouch.rafId = null;
    _kanbanTouch.active = false;
    _kanbanTouch.card = null;
    _kanbanTouch.id = null;
    _kanbanTouch.clone = null;
    _kanbanTouch.curCol = null;
    _kanbanTouch.boardEl = null;
  }

  function _kanbanUpdateDropTarget() {
    var el = document.elementFromPoint(_kanbanTouch.lastX, _kanbanTouch.lastY);
    var col = el ? el.closest('.dg-kanban-col-body') : null;
    if (col !== _kanbanTouch.curCol) {
      if (_kanbanTouch.curCol) _kanbanTouch.curCol.classList.remove('dg-drop-hover');
      if (col) col.classList.add('dg-drop-hover');
      _kanbanTouch.curCol = col;
    }
  }

  function _kanbanAutoScrollTick() {
    if (!_kanbanTouch.active) { _kanbanTouch.rafId = null; return; }
    if (_kanbanTouch.clone) {
      _kanbanTouch.clone.style.left = (_kanbanTouch.lastX - _kanbanTouch.offX) + 'px';
      _kanbanTouch.clone.style.top = (_kanbanTouch.lastY - _kanbanTouch.offY) + 'px';
    }
    var board = _kanbanTouch.boardEl;
    if (board) {
      var rect = board.getBoundingClientRect();
      var x = _kanbanTouch.lastX;
      if (x < rect.left + KANBAN_SCROLL_EDGE) {
        var distL = (rect.left + KANBAN_SCROLL_EDGE - x) / KANBAN_SCROLL_EDGE;
        board.scrollLeft -= KANBAN_SCROLL_SPEED * Math.min(1, distL);
      } else if (x > rect.right - KANBAN_SCROLL_EDGE) {
        var distR = (x - (rect.right - KANBAN_SCROLL_EDGE)) / KANBAN_SCROLL_EDGE;
        board.scrollLeft += KANBAN_SCROLL_SPEED * Math.min(1, distR);
      }
    }
    _kanbanUpdateDropTarget();
    _kanbanTouch.rafId = requestAnimationFrame(_kanbanAutoScrollTick);
  }

  function _bindKanbanCardTouch(card) {
    card.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      _kanbanTouch.startX = t.clientX;
      _kanbanTouch.startY = t.clientY;
      _kanbanTouch.lastX = t.clientX;
      _kanbanTouch.lastY = t.clientY;
      _kanbanTouch.card = card;
      _kanbanTouch.id = card.dataset.id;
      _kanbanTouch.active = false;
      _kanbanTouch.moved = false;
      _kanbanTouch.timer = setTimeout(function () {
        _kanbanTouch.active = true;
        card.classList.add('is-dragging');
        _kanbanTouch.boardEl = card.closest('.dg-kanban');
        var rect = card.getBoundingClientRect();
        var clone = card.cloneNode(true);
        clone.classList.remove('is-dragging');
        clone.classList.add('dg-kanban-card--ghost');
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.margin = '0';
        clone.style.zIndex = '9999';
        clone.style.pointerEvents = 'none';
        document.body.appendChild(clone);
        _kanbanTouch.clone = clone;
        _kanbanTouch.offX = t.clientX - rect.left;
        _kanbanTouch.offY = t.clientY - rect.top;
        if (navigator.vibrate) navigator.vibrate(10);
        _kanbanTouch.rafId = requestAnimationFrame(_kanbanAutoScrollTick);
      }, 300);
    }, { passive: true });

    card.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!_kanbanTouch.active) {
        var dx = Math.abs(t.clientX - _kanbanTouch.startX);
        var dy = Math.abs(t.clientY - _kanbanTouch.startY);
        if (dx > 10 || dy > 10) { clearTimeout(_kanbanTouch.timer); _kanbanTouch.timer = null; }
        return;
      }
      e.preventDefault();
      _kanbanTouch.moved = true;
      _kanbanTouch.lastX = t.clientX;
      _kanbanTouch.lastY = t.clientY;
    }, { passive: false });

    card.addEventListener('touchend', function () {
      clearTimeout(_kanbanTouch.timer);
      _kanbanTouch.timer = null;
      var wasActive = _kanbanTouch.active;
      var id = _kanbanTouch.id;
      var col = _kanbanTouch.curCol;
      _kanbanTouchCleanup();
      if (wasActive && col) {
        var stato = col.closest('.dg-kanban-col').dataset.stato;
        _changeStato(id, stato);
      }
    });

    card.addEventListener('touchcancel', function () { _kanbanTouchCleanup(); });
  }

  function _changeStato(id, novoStato) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s || s.stato === novoStato) return;
    var old = Object.assign({}, s);
    var patch = { stato: novoStato };
    if (novoStato === 'chiuso' && !s.importoConfermato) patch.importoConfermato = s.importoStimato || 0;
    Object.assign(s, patch);
    _renderKanban(); _renderStatCards(); _renderCharts();
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    db.collection('sponsorizzazioni').doc(id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { return _syncSponsorIva(s); })
      .then(function () { _renderSpese(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- DRAWER — Scheda Azienda (accordion: tutto chiuso, una sezione alla volta) ---- */
  var DRAWER_SECTIONS = [
    { key: 'anagrafica', label: 'Anagrafica',       fn: function () { return _tabAnagrafica(); } },
    { key: 'deal',       label: 'Sponsorizzazione', fn: function () { return _tabDeal(); } },
    { key: 'note',       label: 'Note',             fn: function () { return _tabNote(); } },
    { key: 'pagamenti',  label: 'Pagamenti',        fn: function () { return _tabPagamenti(); } },
    { key: 'timeline',   label: 'Timeline',         fn: function () { return _tabTimeline(); } },
    { key: 'promemoria', label: 'Promemoria',       fn: function () { return _tabPromemoria(); } },
    { key: 'storico',    label: 'Storico',          fn: function () { return _tabStorico(); } }
  ];
  var _openAccordionSection = null;

  function _openDrawer(sponsorId) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === sponsorId; });
    if (!s) return;
    _curSponsorId = sponsorId;
    _curAziendaId = s.aziendaId;
    _trancheEditingId = null;
    var az = _aziendaById(_curAziendaId);
    document.getElementById('drawerAziendaNome').textContent = az ? az.ragioneSociale : '—';
    document.getElementById('drawerStoricoBadge').classList.toggle('is-hidden', !_isStorico(_curAziendaId));
    document.getElementById('drawerOverlay').classList.remove('is-hidden');
    document.getElementById('aziendaDrawer').classList.remove('is-hidden');
    requestAnimationFrame(function () { document.getElementById('aziendaDrawer').classList.add('is-open'); });
    _renderDrawerAccordion();
  }

  function _closeDrawer() {
    document.getElementById('aziendaDrawer').classList.remove('is-open');
    setTimeout(function () {
      document.getElementById('aziendaDrawer').classList.add('is-hidden');
      document.getElementById('drawerOverlay').classList.add('is-hidden');
    }, 250);
  }

  function _renderDrawerAccordion() {
    _openAccordionSection = null;
    document.getElementById('drawerBody').innerHTML = DRAWER_SECTIONS.map(function (sec) {
      return '<div class="dg-accordion-item">' +
        '<button type="button" class="dg-accordion-head" data-dsec="' + sec.key + '" aria-expanded="false">' +
          '<span>' + sec.label + '</span>' +
          '<svg class="dg-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6,9 12,15 18,9"/></svg>' +
        '</button>' +
        '<div class="dg-accordion-body is-hidden" id="dgAccBody-' + sec.key + '">' + sec.fn() + '</div>' +
      '</div>';
    }).join('');
    document.querySelectorAll('.dg-accordion-head').forEach(function (btn) {
      btn.addEventListener('click', function () { _toggleAccordionSection(btn.dataset.dsec); });
    });
  }

  function _toggleAccordionSection(key) {
    _openAccordionSection = (_openAccordionSection === key) ? null : key;
    document.querySelectorAll('.dg-accordion-head').forEach(function (btn) {
      var active = btn.dataset.dsec === _openAccordionSection;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-expanded', active ? 'true' : 'false');
    });
    document.querySelectorAll('.dg-accordion-body').forEach(function (body) {
      body.classList.toggle('is-hidden', body.id !== 'dgAccBody-' + _openAccordionSection);
    });
  }

  /* Rigenera il contenuto di una sezione dopo un salvataggio, senza toccare
     quale sezione è aperta (l'utente stava già scrivendo lì dentro). */
  function _refreshAccordionSection(key) {
    var sec = DRAWER_SECTIONS.find(function (s) { return s.key === key; });
    var body = document.getElementById('dgAccBody-' + key);
    if (!sec || !body) return;
    body.innerHTML = sec.fn();
  }

  function _field(id, label, value) {
    return '<div class="dg-form-group"><label class="dg-form-label">' + label + '</label>' +
      '<input class="dg-form-input" id="' + id + '" value="' + esc(value) + '"></div>';
  }

  function _tabAnagrafica() {
    var a = _aziendaById(_curAziendaId) || {};
    return '<div class="dg-form-group"><label class="dg-form-label">Ragione sociale</label><input class="dg-form-input" id="dgAzNome" value="' + esc(a.ragioneSociale) + '"></div>' +
      '<div class="dg-form-grid">' +
      _field('dgAzSettore', 'Settore', a.settore) +
      _field('dgAzReferente', 'Referente', a.referente) +
      _field('dgAzTelefono', 'Telefono', a.telefono) +
      _field('dgAzEmail', 'Email', a.email) +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Sito web</label><input class="dg-form-input" id="dgAzSito" value="' + esc(a.sitoWeb) + '"></div>' +
      '<div class="dg-form-actions" style="justify-content:space-between">' +
        '<button class="dg-btn-ghost dg-btn-ghost--danger dg-btn-sm" onclick="DG.deleteAzienda()">Elimina azienda</button>' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveAzienda()">Salva anagrafica</button>' +
      '</div>';
  }

  DG.saveAzienda = function () {
    var a = _aziendaById(_curAziendaId);
    if (!a) return;
    var old = Object.assign({}, a);
    var patch = {
      ragioneSociale: val('dgAzNome'), settore: val('dgAzSettore'), referente: val('dgAzReferente'),
      telefono: val('dgAzTelefono'), email: val('dgAzEmail'), sitoWeb: val('dgAzSito')
    };
    Object.assign(a, patch);
    db.collection('aziende').doc(a.id).update(patch)
      .then(function () { return _logWrite('azienda', a.id, 'Azienda — ' + patch.ragioneSociale, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () {
        document.getElementById('drawerAziendaNome').textContent = patch.ragioneSociale;
        _renderKanban();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteAzienda = function () {
    var a = _aziendaById(_curAziendaId);
    if (!a) return;
    var hasSponsorizzazioni = _sponsorizzazioni.some(function (x) { return x.aziendaId === a.id; });
    if (hasSponsorizzazioni) {
      alert('Questa azienda ha ancora sponsorizzazioni collegate (anche di stagioni passate). Elimina prima quelle dal tab "Sponsorizzazione", poi l\'azienda.');
      return;
    }
    confirm('Eliminare definitivamente l\'azienda "' + a.ragioneSociale + '"? L\'operazione non è reversibile.', function () {
      db.collection('aziende').doc(a.id).delete()
        .then(function () { return _logWrite('azienda', a.id, 'Azienda — ' + a.ragioneSociale, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _aziende = _aziende.filter(function (x) { return x.id !== a.id; });
          _closeDrawer();
          _renderKanban();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabDeal() {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return '';
    var respOptions = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === s.dirigenteResponsabileId ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
    var statoOptions = STATI.map(function (st) {
      return '<option value="' + st + '"' + (st === s.stato ? ' selected' : '') + '>' + _statoLabel(st) + '</option>';
    }).join('');
    var tipoOptions = ['denaro', 'servizi', 'materiale'].map(function (t) {
      return '<option value="' + t + '"' + (t === s.tipologia ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
    return '<div class="dg-form-group"><label class="dg-form-label">Stato</label><select id="dgDealStato" class="dg-form-input">' + statoOptions + '</select></div>' +
      '<div class="dg-form-grid">' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo stimato (€)</label><input type="number" id="dgDealStimato" class="dg-form-input" value="' + (s.importoStimato || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Probabilità chiusura</label><input type="number" id="dgDealProb" class="dg-form-input" min="0" max="1" step="0.05" value="' + (s.probabilitaChiusura || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo confermato (€)</label><input type="number" id="dgDealConfermato" class="dg-form-input" value="' + (s.importoConfermato || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Tipologia</label><select id="dgDealTipologia" class="dg-form-input">' + tipoOptions + '</select></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Data firma</label><input type="date" id="dgDealFirma" class="dg-form-input" value="' + (s.dataFirma || '') + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgDealScadenza" class="dg-form-input" value="' + (s.scadenza || '') + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Modalità pagamento</label><input type="text" id="dgDealPagamento" class="dg-form-input" value="' + esc(s.modalitaPagamento) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Responsabile</label><select id="dgDealResponsabile" class="dg-form-input">' + respOptions + '</select></div>' +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Contropartite</label><textarea id="dgDealContropartite" class="dg-form-input dg-form-textarea" rows="2">' + esc(s.contropartite || '') + '</textarea></div>' +
      '<div class="dg-form-actions" style="justify-content:space-between">' +
        '<button class="dg-btn-ghost dg-btn-ghost--danger dg-btn-sm" onclick="DG.deleteDeal()">Elimina sponsorizzazione</button>' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveDeal()">Salva</button>' +
      '</div>';
  }

  DG.saveDeal = function () {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return;
    var old = Object.assign({}, s);
    var patch = {
      stato: val('dgDealStato'),
      importoStimato: +val('dgDealStimato') || 0,
      probabilitaChiusura: +val('dgDealProb') || 0,
      importoConfermato: +val('dgDealConfermato') || 0,
      tipologia: val('dgDealTipologia'),
      dataFirma: val('dgDealFirma'),
      scadenza: val('dgDealScadenza'),
      modalitaPagamento: val('dgDealPagamento'),
      dirigenteResponsabileId: val('dgDealResponsabile'),
      contropartite: val('dgDealContropartite')
    };
    Object.assign(s, patch);
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    db.collection('sponsorizzazioni').doc(s.id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { return _syncSponsorIva(s); })
      .then(function () { _renderKanban(); _renderStatCards(); _renderCharts(); _refreshAccordionSection('deal'); _renderSpese(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabNote() {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return '';
    return '<div class="dg-form-group"><textarea id="dgNoteText" class="dg-form-input dg-form-textarea" rows="5" placeholder="Nota su questa sponsorizzazione...">' + esc(s.note || '') + '</textarea></div>' +
      '<div class="dg-form-actions" style="justify-content:flex-end">' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveNote()">Salva nota</button>' +
      '</div>';
  }

  DG.saveNote = function () {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return;
    var old = Object.assign({}, s);
    var patch = { note: val('dgNoteText') };
    Object.assign(s, patch);
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    db.collection('sponsorizzazioni').doc(s.id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { _renderKanban(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteDeal = function () {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    confirm('Eliminare definitivamente "' + label + '"? L\'operazione non è reversibile.', function () {
      var figlia = s.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; }) : null;
      db.collection('sponsorizzazioni').doc(s.id).delete()
        .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () {
          _sponsorizzazioni = _sponsorizzazioni.filter(function (x) { return x.id !== s.id; });
          if (figlia) _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== figlia.id; });
          _closeDrawer();
          _renderKanban(); _renderStatCards(); _renderCharts(); _renderSpese(); _renderBilancio();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- TRANCHE DI PAGAMENTO — tracciamento incassi reali di uno sponsor chiuso ---- */
  function _tabPagamenti() {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return '';
    var items = _trancheOf(_curSponsorId).sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; });

    var totale = +s.importoConfermato || 0;
    var pianificato = items.reduce(function (sum, t) { return sum + (+t.importo || 0); }, 0);
    var incassato = items.reduce(function (sum, t) { return sum + (t.pagato ? (+t.importo || 0) : 0); }, 0);
    var residuo = totale - pianificato;

    var intro = s.stato !== 'chiuso'
      ? '<p class="dg-muted" style="margin-bottom:14px">Lo sponsor non è ancora "Chiuso": le tranche restano comunque salvate, ma contano nel Saldo/Entrate confermate solo quando lo stato passa a Chiuso.</p>'
      : '';

    var summary = '<div class="dg-card" style="margin-bottom:14px;padding:14px 16px">' +
      '<div class="dg-toolbar" style="gap:16px">' +
      '<div><div class="dg-stat-label">Importo confermato</div><div class="dg-card-title">€' + totale.toLocaleString('it-IT') + '</div></div>' +
      '<div><div class="dg-stat-label">Incassato</div><div class="dg-card-title" style="color:var(--dg-green)">€' + incassato.toLocaleString('it-IT') + '</div></div>' +
      '<div><div class="dg-stat-label">Da incassare</div><div class="dg-card-title" style="color:var(--dg-orange)">€' + (pianificato - incassato).toLocaleString('it-IT') + '</div></div>' +
      '</div>' +
      (items.length && residuo !== 0
        ? '<p class="dg-muted" style="margin-top:8px">' + (residuo > 0
            ? 'Mancano €' + residuo.toLocaleString('it-IT') + ' di tranche per coprire l\'intero importo confermato.'
            : 'Le tranche superano l\'importo confermato di €' + Math.abs(residuo).toLocaleString('it-IT') + '.') + '</p>'
        : '') +
      '</div>';

    var list = items.length ? items.map(function (t) {
      if (t.id === _trancheEditingId) {
        return '<div class="dg-reminder-item" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px">' +
          '<div class="dg-form-grid">' +
          '<div class="dg-form-group"><label class="dg-form-label">Importo (€)</label><input type="number" id="dgTrancheEditImporto" class="dg-form-input" min="0" step="50" value="' + Number(t.importo || 0) + '"></div>' +
          '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgTrancheEditScadenza" class="dg-form-input" value="' + esc(t.scadenza || '') + '"></div>' +
          '</div>' +
          '<div class="dg-form-group"><label class="dg-form-label">Note</label><input type="text" id="dgTrancheEditNote" class="dg-form-input" value="' + esc(t.note || '') + '"></div>' +
          '<div class="dg-form-actions" style="margin-top:0">' +
          '<button class="dg-btn-ghost dg-btn-sm" onclick="DG.editTrancheCancel()">Annulla</button>' +
          '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveTranche(\'' + t.id + '\')">Salva</button>' +
          '</div></div>';
      }
      return '<div class="dg-reminder-item" style="cursor:default">' +
        '<label class="dg-check"><input type="checkbox" ' + (t.pagato ? 'checked' : '') + ' onchange="DG.toggleTranchePagata(\'' + t.id + '\', this.checked)">' +
        '<span><div class="dg-reminder-azienda">€' + Number(t.importo || 0).toLocaleString('it-IT') + (t.pagato ? ' — pagata' : ' — da pagare') + '</div>' +
        '<div class="dg-reminder-desc">Scadenza: ' + _fmtDate(t.scadenza) + (t.note ? ' · ' + esc(t.note) : '') + '</div></span></label>' +
        '<div style="display:flex;gap:4px;flex-shrink:0">' +
        '<button class="dg-btn-icon-only" title="Modifica" onclick="DG.editTrancheStart(\'' + t.id + '\')">' + EDIT_ICON_SM + '</button>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteTranche(\'' + t.id + '\')">' + _delIconSm() + '</button>' +
        '</div></div>';
    }).join('') : '<p class="dg-muted">Nessuna tranche pianificata: l\'importo confermato conta per intero nel saldo.</p>';

    return intro + summary +
      '<div style="display:flex;flex-direction:column;gap:8px">' + list + '</div>' +
      '<div class="dg-form-grid" style="margin-top:18px">' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo (€)</label><input type="number" id="dgTrancheImporto" class="dg-form-input" min="0" step="50"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgTrancheScadenza" class="dg-form-input" value="' + _todayISO() + '"></div>' +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Note</label><input type="text" id="dgTrancheNote" class="dg-form-input" placeholder="es. Acconto alla firma"></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addTranche()">Aggiungi tranche</button></div>';
  }

  DG.addTranche = function () {
    var importo = +val('dgTrancheImporto') || 0;
    var scadenza = val('dgTrancheScadenza');
    if (!importo || !scadenza) { alert('Importo e scadenza sono obbligatori.'); return; }
    var data = {
      sponsorizzazioneId: _curSponsorId, importo: importo, scadenza: scadenza,
      note: val('dgTrancheNote').trim(), pagato: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('tranchePagamento').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _tranche.push(data);
      return _logWrite('tranchePagamento', ref.id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.editTrancheStart = function (id) {
    _trancheEditingId = id;
    _refreshAccordionSection('pagamenti');
  };

  DG.editTrancheCancel = function () {
    _trancheEditingId = null;
    _refreshAccordionSection('pagamenti');
  };

  DG.saveTranche = function (id) {
    var t = _tranche.find(function (x) { return x.id === id; });
    if (!t) return;
    var importo = +val('dgTrancheEditImporto') || 0;
    var scadenza = val('dgTrancheEditScadenza');
    if (!importo || !scadenza) { alert('Importo e scadenza sono obbligatori.'); return; }
    var patch = { importo: importo, scadenza: scadenza, note: val('dgTrancheEditNote').trim() };
    var old = { importo: t.importo, scadenza: t.scadenza, note: t.note };
    var az = _aziendaById(_curAziendaId);
    var s = _sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
    Object.assign(t, patch);
    db.collection('tranchePagamento').doc(id).update(patch)
      .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { return (t.pagato && s) ? _syncSponsorIva(s) : null; })
      .then(function () {
        _trancheEditingId = null;
        _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderBilancio(); _renderSpese();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* Voce di spesa "IVA <azienda>" collegata a uno sponsor (s.ivaVoceSpesaId): il preventivato
     scatta all'11% dell'importoConfermato appena lo stato passa a "chiuso" (anche prima di
     incassare), il sostenuto è l'11% delle sole tranche già segnate pagate. Si aggiorna ad ogni
     cambio di stato/importo/tranche invece di generare righe nuove, e si rimuove da sola se
     preventivato e sostenuto tornano entrambi a zero (es. lo stato torna indietro da "chiuso"). */
  function _syncSponsorIva(s) {
    var preventivato = s.stato === 'chiuso' ? Math.round((+s.importoConfermato || 0) * 0.11 * 100) / 100 : 0;
    var pagate = _trancheOf(s.id).filter(function (t) { return t.pagato; });
    var incassato = pagate.reduce(function (sum, t) { return sum + (+t.importo || 0); }, 0);
    var sostenuto = Math.round(incassato * 0.11 * 100) / 100;
    var figlia = s.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; }) : null;
    var az = _aziendaById(s.aziendaId);
    var nome = ('IVA ' + (az ? az.ragioneSociale : '')).trim();

    if (preventivato <= 0 && sostenuto <= 0) {
      if (!figlia) return Promise.resolve();
      return db.collection('vociSpesa').doc(figlia.id).delete()
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return db.collection('sponsorizzazioni').doc(s.id).update({ ivaVoceSpesaId: '' }); })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== figlia.id; });
          s.ivaVoceSpesaId = '';
        });
    }

    if (figlia) {
      var old = { categoria: figlia.categoria, importoPreventivato: figlia.importoPreventivato, importoSostenuto: figlia.importoSostenuto, ivaAliquota: figlia.ivaAliquota };
      var patch = { categoria: nome, importoPreventivato: preventivato, importoSostenuto: sostenuto, ivaAliquota: 11 };
      return db.collection('vociSpesa').doc(figlia.id).update(patch)
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + nome, 'update', _diff(old, patch, Object.keys(patch))); })
        .then(function () { Object.assign(figlia, patch); });
    }

    var data = {
      seasonId: s.seasonId, categoria: nome, categoriaSpesaId: '',
      importoPreventivato: preventivato, importoSostenuto: sostenuto, ivaAliquota: 11, dataSpesa: '',
      note: 'IVA 11% generata automaticamente sullo sponsor "' + nome.replace(/^IVA /, '') + '" (preventivo alla chiusura, saldo sulle tranche incassate)',
      isIva: true, pagata: false, ivaEscluso: false, ivaTrimestre: '', ivaScadenza: '', ivaScadenzaManuale: false
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      s.ivaVoceSpesaId = ref.id;
      return db.collection('sponsorizzazioni').doc(s.id).update({ ivaVoceSpesaId: ref.id });
    }).then(function () {
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    });
  }

  /* Migrazione una tantum (da lanciare col bottone "Ricalcola IVA sponsor" in Riepilogo IVA):
     applica _syncSponsorIva agli sponsor già "chiusi" prima che esistesse questo calcolo. Ripulisce
     anche le vecchie voci "IVA <azienda>" generate dal meccanismo precedente (una per tranche pagata,
     solo sostenuto, mai preventivato — riconoscibili dal campo ivaVoceSpesaId rimasto sulla tranche),
     così non restano duplicate rispetto all'unica voce consolidata per sponsor. Agisce solo sulla
     stagione correntemente selezionata (i dati di spesa sono caricati per stagione). */
  DG.migraIvaSponsor = function () {
    var candidati = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && s.stato === 'chiuso'; });
    if (!candidati.length) { alert('Nessuno sponsor "chiuso" in questa stagione: niente da ricalcolare.'); return; }
    confirm('Ricalcolare l\'IVA per ' + candidati.length + ' sponsor "chiusi" di questa stagione? Le eventuali vecchie voci IVA generate per singola tranche pagata verranno unificate in una sola voce per sponsor (preventivato all\'11% dell\'importo confermato, sostenuto sulle tranche già incassate).', function () {
      var orfane = [];
      candidati.forEach(function (s) {
        _trancheOf(s.id).forEach(function (t) {
          if (t.ivaVoceSpesaId && orfane.indexOf(t.ivaVoceSpesaId) === -1) orfane.push(t.ivaVoceSpesaId);
        });
      });
      var chain = Promise.resolve();
      orfane.forEach(function (voceId) {
        chain = chain.then(function () {
          var v = _vociSpesa.find(function (x) { return x.id === voceId; });
          if (!v) return null;
          return db.collection('vociSpesa').doc(v.id).delete()
            .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
            .then(function () { _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== v.id; }); });
        });
      });
      candidati.forEach(function (s) {
        _trancheOf(s.id).forEach(function (t) {
          if (t.ivaVoceSpesaId) {
            chain = chain.then(function () { return db.collection('tranchePagamento').doc(t.id).update({ ivaVoceSpesaId: '' }); })
              .then(function () { t.ivaVoceSpesaId = ''; });
          }
        });
        chain = chain.then(function () { return _syncSponsorIva(s); });
      });
      chain.then(function () {
        _renderSpese(); _renderBilancio(); _renderKanban();
        alert('IVA ricalcolata per ' + candidati.length + ' sponsor.');
      }).catch(function (e) { alert('Errore durante il ricalcolo: ' + e.message); });
    });
  };

  DG.toggleTranchePagata = function (id, checked) {
    var t = _tranche.find(function (x) { return x.id === id; });
    if (!t) return;
    var old = { pagato: !!t.pagato };
    t.pagato = checked;
    var az = _aziendaById(_curAziendaId);
    var s = _sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
    db.collection('tranchePagamento').doc(id).update({ pagato: checked })
      .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'update', _diff(old, { pagato: checked }, ['pagato'])); })
      .then(function () { return s ? _syncSponsorIva(s) : null; })
      .then(function () { _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderBilancio(); _renderSpese(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteTranche = function (id) {
    confirm('Eliminare questa tranche?', function () {
      var t = _tranche.find(function (x) { return x.id === id; });
      var s = t ? _sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; }) : null;
      var az = _aziendaById(_curAziendaId);
      db.collection('tranchePagamento').doc(id).delete()
        .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _tranche = _tranche.filter(function (x) { return x.id !== id; });
          return (t && t.pagato && s) ? _syncSponsorIva(s) : null;
        })
        .then(function () {
          _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderBilancio(); _renderSpese();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabTimeline() {
    var items = _attivita.filter(function (a) { return a.sponsorizzazioneId === _curSponsorId; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var list = items.length ? '<div class="dg-timeline">' + items.map(function (a) {
      return '<div class="dg-timeline-item"><span class="dg-timeline-dot"></span>' +
        '<div class="dg-timeline-content"><div>' + _tipoLabel(a.tipo) + ' — ' + esc(a.descrizione || '') + '</div>' +
        '<div class="dg-timeline-meta">' + _fmtDate(a.data) + ' · ' + esc(a.dirigenteNome || '') + '</div></div></div>';
    }).join('') + '</div>' : '<p class="dg-muted">Nessuna attività registrata.</p>';

    var tipoOptions = ['chiamata', 'email', 'incontro', 'nota'].map(function (t) { return '<option value="' + t + '">' + _tipoLabel(t) + '</option>'; }).join('');

    return list +
      '<div class="dg-form-group" style="margin-top:18px"><label class="dg-form-label">Tipo</label><select id="dgAttTipo" class="dg-form-input">' + tipoOptions + '</select></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Data</label><input type="date" id="dgAttData" class="dg-form-input" value="' + _todayISO() + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Descrizione</label><textarea id="dgAttDesc" class="dg-form-input dg-form-textarea" rows="2" placeholder="Cosa è stato detto/fatto..."></textarea></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addAttivita()">Aggiungi</button></div>';
  }

  DG.addAttivita = function () {
    var desc = val('dgAttDesc').trim();
    if (!desc) { alert('Inserisci una descrizione.'); return; }
    var data = {
      sponsorizzazioneId: _curSponsorId, tipo: val('dgAttTipo'), data: val('dgAttData'),
      dirigenteId: A.uid(), dirigenteNome: A.dirigenteNome(), descrizione: desc, createdAt: new Date().toISOString()
    };
    var ref = db.collection('attivita').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _attivita.unshift(data);
      return _logWrite('attivita', ref.id, 'Attività — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('timeline'); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabPromemoria() {
    var items = _promemoria.filter(function (p) { return p.sponsorizzazioneId === _curSponsorId; })
      .sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    var list = items.length ? items.map(function (p) {
      var resp = _dirigentiList.find(function (d) { return d.id === p.dirigenteAssegnatoId; });
      return '<div class="dg-reminder-item" style="cursor:default">' +
        '<label class="dg-check" style="align-items:flex-start"><input type="checkbox" ' + (p.completato ? 'checked' : '') + ' onchange="DG.toggleReminder(\'' + p.id + '\', this.checked)">' +
        '<span><div class="dg-reminder-desc" style="color:var(--dg-text);font-weight:600">' + esc(p.descrizione || '') + '</div>' +
        '<div class="dg-reminder-desc">Scadenza: ' + _fmtDate(p.dataScadenza) + ' · ' + esc(resp ? (resp.nome + ' ' + resp.cognome) : '—') + '</div></span></label>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteReminder(\'' + p.id + '\')">' + _delIconSm() + '</button></div>';
    }).join('') : '<p class="dg-muted">Nessun promemoria.</p>';

    var respOptions = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === A.uid() ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');

    return '<div style="display:flex;flex-direction:column;gap:8px">' + list + '</div>' +
      '<div class="dg-form-group" style="margin-top:18px"><label class="dg-form-label">Descrizione</label><input type="text" id="dgPromDesc" class="dg-form-input" placeholder="es. Richiamare dopo invio preventivo"></div>' +
      '<div class="dg-form-grid">' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgPromData" class="dg-form-input"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Assegnato a</label><select id="dgPromAssegnato" class="dg-form-input">' + respOptions + '</select></div>' +
      '</div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addPromemoria()">Aggiungi</button></div>';
  }

  DG.addPromemoria = function () {
    var desc = val('dgPromDesc').trim();
    var scad = val('dgPromData');
    if (!desc || !scad) { alert('Descrizione e scadenza sono obbligatorie.'); return; }
    var data = {
      sponsorizzazioneId: _curSponsorId, dataScadenza: scad, descrizione: desc,
      dirigenteAssegnatoId: val('dgPromAssegnato'), completato: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('promemoria').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _promemoria.unshift(data);
      return _logWrite('promemoria', ref.id, 'Promemoria — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('promemoria'); _renderPromemoriaWidget(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.toggleReminder = function (id, checked) {
    var p = _promemoria.find(function (x) { return x.id === id; });
    if (!p) return;
    var old = { completato: !!p.completato };
    p.completato = checked;
    db.collection('promemoria').doc(id).update({ completato: checked })
      .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'update', _diff(old, { completato: checked }, ['completato'])); })
      .then(function () { _renderPromemoriaWidget(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteReminder = function (id) {
    confirm('Eliminare questo promemoria?', function () {
      db.collection('promemoria').doc(id).delete()
        .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _promemoria = _promemoria.filter(function (x) { return x.id !== id; });
          _refreshAccordionSection('promemoria'); _renderPromemoriaWidget();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabStorico() {
    var items = _sponsorizzazioni.filter(function (s) { return s.aziendaId === _curAziendaId; })
      .sort(function (a, b) { return a.seasonId === b.seasonId ? 0 : (a.seasonId < b.seasonId ? 1 : -1); });
    if (!items.length) return '<p class="dg-muted">Nessuno storico disponibile.</p>';
    return '<div class="dg-timeline">' + items.map(function (s) {
      var season = _seasons.find(function (x) { return x.id === s.seasonId; });
      var importo = s.stato === 'chiuso' ? s.importoConfermato : s.importoStimato;
      return '<div class="dg-timeline-item"><span class="dg-timeline-dot" style="background:' + _statoColor(s.stato) + '"></span>' +
        '<div class="dg-timeline-content"><div><strong>' + esc(season ? season.nome : '—') + '</strong> — ' + _statoLabel(s.stato) + ' — €' + Number(importo || 0).toLocaleString('it-IT') + '</div></div></div>';
    }).join('') + '</div>';
  }

  /* ---- RETTE ATLETI ---- */
  function _renderRette() {
    var body = document.getElementById('retteBody');
    var r = _calcRetteAtleti();
    body.innerHTML = r.righe.length ? r.righe.map(function (c) {
      var rettaCell = c.id
        ? '<input type="number" class="dg-table-input" value="' + c.rettaUnitaria + '" data-id="' + c.id + '" onchange="DG.saveRettaUnitaria(this)">'
        : '—';
      var azioniCell = c.id
        ? '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteCategoria(\'' + c.id + '\')">' + _delIconSm() + '</button>'
        : '';
      return '<tr>' +
        '<td>' + esc(c.nome) + '</td>' +
        '<td>' + c.nAtleti + '</td>' +
        '<td>' + rettaCell + '</td>' +
        '<td>€' + Math.round(c.previsto).toLocaleString('it-IT') + '</td>' +
        '<td>€' + Math.round(c.incassato).toLocaleString('it-IT') + '</td>' +
        '<td class="' + (c.diff >= 0 ? 'dg-diff-pos' : 'dg-diff-neg') + '">' + (c.diff >= 0 ? '+' : '') + Math.round(c.diff).toLocaleString('it-IT') + ' €</td>' +
        '<td>' + azioniCell + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7" class="dg-empty">Nessuna categoria per questa stagione.</td></tr>';

    _renderAtletiRette();
  }

  DG.saveRettaUnitaria = function (el) {
    var id = el.dataset.id;
    var c = _categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    var old = { rettaUnitaria: c.rettaUnitaria || 0 };
    var v = +el.value || 0;
    c.rettaUnitaria = v;
    db.collection('categorieAtleti').doc(id).update({ rettaUnitaria: v })
      .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'update', _diff(old, { rettaUnitaria: v }, ['rettaUnitaria'])); })
      .then(function () { _renderRette(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteCategoria = function (id) {
    var c = _categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    if (_atletiRette.some(function (a) { return a.categoriaAtletiId === id; })) {
      alert('Questa categoria ha ancora atleti assegnati. Sposta o elimina prima gli atleti dalla tabella qui sotto.');
      return;
    }
    confirm('Eliminare la categoria "' + c.nome + '"?', function () {
      db.collection('categorieAtleti').doc(id).delete()
        .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _categorieAtleti = _categorieAtleti.filter(function (x) { return x.id !== id; });
          _renderRette(); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _categoriaAtletiOptionsHtml(selectedId) {
    return '<option value="">— Nessuna —</option>' + _categorieAtleti.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
    }).join('');
  }

  function _renderAtletiRette() {
    var body = document.getElementById('atletiRetteBody');
    if (!body) return;
    if (!_atletiRette.length) { body.innerHTML = '<tr><td colspan="6" class="dg-empty">Nessun atleta iscritto a questa stagione. Aggiungili dalla sezione Atleti.</td></tr>'; return; }
    var list = _atletiRette.slice().sort(function (a, b) { return (a.cognome || '').localeCompare(b.cognome || ''); });
    body.innerHTML = list.map(function (a) {
      var cat = _categorieAtleti.find(function (c) { return c.id === a.categoriaAtletiId; });
      var rate = _rateByAtleta(a.id);
      var pagate = rate.filter(function (r) { return r.pagata; });
      var incassato = pagate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      var totale = rate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      var collegato = !!a.atletaId;
      var celle = collegato
        ? '<td>' + esc(a.nome) + '</td><td>' + esc(a.cognome) + '</td><td>' + esc(cat ? cat.nome : '—') + '</td>'
        : '<td><input type="text" class="dg-table-input" value="' + esc(a.nome) + '" data-id="' + a.id + '" data-field="nome" onchange="DG.saveAtletaRettaField(this)"></td>' +
          '<td><input type="text" class="dg-table-input" value="' + esc(a.cognome) + '" data-id="' + a.id + '" data-field="cognome" onchange="DG.saveAtletaRettaField(this)"></td>' +
          '<td><select class="dg-table-input" data-id="' + a.id + '" data-field="categoriaAtletiId" onchange="DG.saveAtletaRettaField(this)">' + _categoriaAtletiOptionsHtml(a.categoriaAtletiId) + '</select></td>';
      var azioni = '<button class="dg-btn-ghost dg-btn-sm" onclick="DG.manageRateAtleta(\'' + a.id + '\')">Gestisci rate</button> ' +
        (collegato
          ? '<button class="dg-btn-ghost dg-btn-sm" title="Modifica anagrafica, categoria e accessi" onclick="DG.apriSchedaAtleta(\'' + esc(a.atletaId) + '\')">Scheda</button>'
          : '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteAtletaRetta(\'' + a.id + '\')">' + _delIconSm() + '</button>');
      return '<tr>' + celle +
        '<td>' + pagate.length + '/' + rate.length + ' pagate' + (rate.length ? ' — €' + Math.round(totale).toLocaleString('it-IT') : '') + '</td>' +
        '<td>€' + Math.round(incassato).toLocaleString('it-IT') + '</td>' +
        '<td>' + azioni + '</td>' +
        '</tr>';
    }).join('');
  }

  DG.saveAtletaRettaField = function (el) {
    var id = el.dataset.id, field = el.dataset.field;
    var a = _atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    if (field !== 'categoriaAtletiId' && !el.value.trim()) { alert('Il campo non può essere vuoto.'); el.value = a[field]; return; }
    var nv = field === 'categoriaAtletiId' ? el.value : el.value.trim();
    var old = {}; old[field] = a[field] || '';
    a[field] = nv;
    var patch = {}; patch[field] = nv;
    db.collection('atletiRette').doc(id).update(patch)
      .then(function () { return _logWrite('atletaRetta', id, 'Atleta — ' + a.cognome + ' ' + a.nome, 'update', _diff(old, patch, [field])); })
      .then(function () { _renderRette(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteAtletaRetta = function (id) {
    var a = _atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    confirm('Eliminare l\'atleta "' + a.nome + ' ' + a.cognome + '"? Verranno eliminate anche le sue rate.', function () {
      var rate = _rateByAtleta(id);
      var batch = db.batch();
      rate.forEach(function (r) { batch.delete(db.collection('rateAtleti').doc(r.id)); });
      batch.delete(db.collection('atletiRette').doc(id));
      batch.commit()
        .then(function () { return _logWrite('atletaRetta', id, 'Atleta — ' + a.cognome + ' ' + a.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _atletiRette = _atletiRette.filter(function (x) { return x.id !== id; });
          _rateAtleti = _rateAtleti.filter(function (x) { return x.atletaRettaId !== id; });
          _renderRette(); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _saveNewAtletaRetta() {
    var nome = val('atletaRettaNomeInput').trim();
    var cognome = val('atletaRettaCognomeInput').trim();
    if (!nome || !cognome) { alert('Inserisci nome e cognome dell\'atleta.'); return; }
    var data = {
      seasonId: _currentSeasonId, nome: nome, cognome: cognome,
      categoriaAtletiId: val('atletaRettaCategoriaSelect')
    };
    var ref = db.collection('atletiRette').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _atletiRette.push(data);
      return _logWrite('atletaRetta', ref.id, 'Atleta — ' + cognome + ' ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newAtletaRettaModal');
      _renderRette(); _renderStatCards(); _renderCharts();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- Rate atleti (modal) — stesso pattern delle tranche sponsor ---- */
  DG.manageRateAtleta = function (id) {
    var a = _atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    _curAtletaRettaId = id;
    document.getElementById('rateAtletaNome').textContent = a.nome + ' ' + a.cognome;
    document.getElementById('rataAtletaImporto').value = '';
    document.getElementById('rataAtletaScadenza').value = '';
    document.getElementById('rataAtletaNote').value = '';
    _renderRateAtletaModal();
    _openBudgetModal('rateAtletaModal');
  };

  function _renderRateAtletaModal() {
    var el = document.getElementById('rateAtletaList');
    var rate = _curAtletaRettaId ? _rateByAtleta(_curAtletaRettaId) : [];
    rate = rate.slice().sort(function (a, b) { return (a.scadenza || '') < (b.scadenza || '') ? -1 : 1; });
    el.innerHTML = rate.length ? rate.map(function (r) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<div>' +
          '<div style="font-weight:700;font-size:13px">€' + Number(r.importo || 0).toLocaleString('it-IT') + (r.note ? ' — ' + esc(r.note) : '') + '</div>' +
          '<div style="font-size:12px;color:var(--dg-muted)">Scadenza: ' + (r.scadenza ? _fmtDate(r.scadenza) : '—') + '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
          '<label class="dg-check" style="font-size:12px"><input type="checkbox"' + (r.pagata ? ' checked' : '') + ' onchange="DG.toggleRataAtleta(\'' + r.id + '\', this.checked)"> Pagata</label>' +
          '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteRataAtleta(\'' + r.id + '\')">' + _delIconSm() + '</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<p class="dg-muted">Nessuna rata inserita.</p>';
  }

  function _addRataAtleta() {
    if (!_curAtletaRettaId) return;
    var importo = +val('rataAtletaImporto') || 0;
    var scadenza = val('rataAtletaScadenza');
    if (!importo) { alert('Inserisci un importo.'); return; }
    var a = _atletiRette.find(function (x) { return x.id === _curAtletaRettaId; });
    var data = {
      atletaRettaId: _curAtletaRettaId, atletaId: (a && a.atletaId) || '', seasonId: _currentSeasonId, stagione: _stagioneCorrenteNome(),
      importo: importo, scadenza: scadenza,
      note: val('rataAtletaNote').trim(), pagata: false, dataPagamento: null, createdAt: new Date().toISOString()
    };
    var ref = db.collection('rateAtleti').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _rateAtleti.push(data);
      return _logWrite('rataAtleti', ref.id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      document.getElementById('rataAtletaImporto').value = '';
      document.getElementById('rataAtletaScadenza').value = '';
      document.getElementById('rataAtletaNote').value = '';
      _renderRateAtletaModal();
      _renderRette(); _renderStatCards(); _renderCharts();
      _renderRateAdmin(); _renderAtletiRows();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  DG.toggleRataAtleta = function (id, checked) {
    var r = _rateAtleti.find(function (x) { return x.id === id; });
    if (!r) return;
    var old = { pagata: !!r.pagata };
    var patch = { pagata: checked, dataPagamento: checked ? new Date().toISOString().slice(0, 10) : null };
    r.pagata = checked;
    r.dataPagamento = patch.dataPagamento;
    var a = _atletiRette.find(function (x) { return x.id === r.atletaRettaId; });
    db.collection('rateAtleti').doc(id).update(patch)
      .then(function () { return _logWrite('rataAtleti', id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'update', _diff(old, patch, ['pagata'])); })
      .then(function () { _renderRateAtletaModal(); _renderRette(); _renderStatCards(); _renderCharts(); _renderBilancio(); _renderRateAdmin(); _renderAtletiRows(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteRataAtleta = function (id) {
    var r = _rateAtleti.find(function (x) { return x.id === id; });
    if (!r) return;
    var a = _atletiRette.find(function (x) { return x.id === r.atletaRettaId; });
    confirm(r.pagata ? 'Questa rata risulta pagata: eliminandola l\'incassato del bilancio diminuisce. Eliminarla?' : 'Eliminare questa rata?', function () {
      db.collection('rateAtleti').doc(id).delete()
        .then(function () { return _logWrite('rataAtleti', id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _rateAtleti = _rateAtleti.filter(function (x) { return x.id !== id; });
          _renderRateAtletaModal(); _renderRette(); _renderStatCards(); _renderCharts();
          _renderRateAdmin(); _renderAtletiRows();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- SPESE ---- */
  function _categoriaSpesaById(id) { return _categorieSpesa.find(function (c) { return c.id === id; }); }

  function _categorieSpesaOptionsHtml(selectedId) {
    return '<option value="">— Nessuna —</option>' + _categorieSpesa.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
    }).join('');
  }

  /* ---- FORECASTING SPESE — preventivato vs sostenuto, per categoria ----
     Un'unica funzione di calcolo/rendering condivisa tra Spese, Bilancio e
     Dashboard: quando la sezione Budget verrà riorganizzata, questo blocco
     resta il punto unico da spostare/estendere. */
  function _calcSpeseForecast() {
    var totPreventivato = 0, totSostenuto = 0;
    var perCategoria = {};
    _vociSpesa.forEach(function (v) {
      var prev = +v.importoPreventivato || 0, sost = +v.importoSostenuto || 0;
      totPreventivato += prev; totSostenuto += sost;
      var key = v.categoriaSpesaId || '__none__';
      perCategoria[key] = perCategoria[key] || { preventivato: 0, sostenuto: 0 };
      perCategoria[key].preventivato += prev;
      perCategoria[key].sostenuto += sost;
    });
    var righe = Object.keys(perCategoria).map(function (key) {
      var c = key === '__none__' ? null : _categoriaSpesaById(key);
      var p = perCategoria[key];
      return { nome: c ? c.nome : 'Senza categoria', preventivato: p.preventivato, sostenuto: p.sostenuto, scostamento: p.sostenuto - p.preventivato };
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    var bufferPreventivato = totPreventivato * 0.1;
    return {
      totPreventivato: totPreventivato, totSostenuto: totSostenuto, scostamento: totSostenuto - totPreventivato,
      bufferPreventivato: bufferPreventivato, totPreventivatoConBuffer: totPreventivato + bufferPreventivato,
      righe: righe
    };
  }

  /* Scostamento: positivo = speso più del previsto (rosso), negativo/zero = entro il preventivo (verde) — segno opposto a un normale "saldo".
     Il preventivo + margine 10% è un margine di sicurezza consigliato, non una spesa reale: non entra nel bilancio, è solo un riferimento visivo. */
  function _speseForecastStatsHtml(r) {
    return _budgetStatCard('Preventivato', r.totPreventivato, '') +
      _budgetStatCard('Sostenuto', r.totSostenuto, '') +
      _budgetStatCard('Scostamento dal preventivo', r.scostamento, r.scostamento > 0 ? '--red' : '--green') +
      _budgetStatCard('Preventivato + margine 10%', r.totPreventivatoConBuffer, '--orange');
  }

  function _speseForecastTableHtml(r) {
    if (!r.righe.length) return '<p class="dg-muted">Nessuna voce di spesa per questa stagione.</p>';
    var rows = r.righe.map(function (x) {
      return '<tr>' +
        '<td>' + esc(x.nome) + '</td>' +
        '<td>' + _eur(x.preventivato) + '</td>' +
        '<td>' + _eur(x.sostenuto) + '</td>' +
        '<td style="color:' + (x.scostamento > 0 ? 'var(--dg-red)' : 'var(--dg-green)') + '">' + (x.scostamento > 0 ? '+' : '') + _eurSigned(x.scostamento) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="dg-table-wrap"><table class="dg-table"><thead><tr><th>Categoria</th><th>Preventivato</th><th>Sostenuto</th><th>Scostamento</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* Riempie ogni istanza presente nel DOM (Spese e Bilancio condividono lo stesso widget). */
  function _renderSpeseForecast() {
    var r = _calcSpeseForecast();
    var statsHtml = _speseForecastStatsHtml(r);
    var tableHtml = _speseForecastTableHtml(r);
    ['speseForecastStats', 'bilancioForecastStats'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = statsHtml;
    });
    ['speseForecastTable', 'bilancioForecastTable'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = tableHtml;
    });
  }

  function _renderDashSpeseWidget() {
    var r = _calcSpeseForecast();
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var pct = r.totPreventivato > 0 ? Math.round(r.totSostenuto / r.totPreventivato * 100) : 0;

    document.getElementById('dashSpeseSeasonName').textContent = season.nome ? '· ' + season.nome : '';
    document.getElementById('dashSpeseSostenuto').textContent =
      '€' + Math.round(r.totSostenuto).toLocaleString('it-IT') + ' / €' + Math.round(r.totPreventivato).toLocaleString('it-IT');
    document.getElementById('dashSpesePct').textContent = pct + '%';
    document.getElementById('dashSpeseBarFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
    var scostEl = document.getElementById('dashSpeseScostamento');
    scostEl.textContent = (r.scostamento > 0 ? '+' : '') + '€' + Math.round(r.scostamento).toLocaleString('it-IT') + ' rispetto al preventivo';
    scostEl.className = 'dash-budget-obiettivo ' + (r.scostamento > 0 ? 'dash-budget-saldo--neg' : 'dash-budget-saldo--pos');
  }

  var _speseFilterCategoriaId = '';

  function _populateSpeseFilterCategoria() {
    var sel = document.getElementById('speseFilterCategoria');
    if (!sel) return;
    sel.innerHTML = '<option value="">Tutte le categorie</option>' +
      '<option value="__none__">Senza categoria</option>' +
      _categorieSpesa.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('');
    sel.value = _speseFilterCategoriaId;
  }

  function _renderSpese() {
    _populateSpeseFilterCategoria();
    _renderSpeseForecast();
    _renderIvaRiepilogo();
    var body = document.getElementById('speseBody');
    var items = _vociSpesa.filter(function (v) {
      if (!_speseFilterCategoriaId) return true;
      if (_speseFilterCategoriaId === '__none__') return !v.categoriaSpesaId;
      return v.categoriaSpesaId === _speseFilterCategoriaId;
    });
    /* Ogni voce IVA generata da un'altra voce di spesa viene spostata subito
       dopo la sua genitrice, così il collegamento è visibile a colpo d'occhio
       (vedi anche il connettore "↳" nella cella categoria qui sotto). */
    var byId = {};
    items.forEach(function (v) { byId[v.id] = v; });
    var isLinkedChild = {};
    items.forEach(function (p) { if (p.ivaVoceSpesaId && byId[p.ivaVoceSpesaId]) isLinkedChild[p.ivaVoceSpesaId] = true; });
    var ordered = [];
    items.forEach(function (v) {
      if (isLinkedChild[v.id]) return;
      ordered.push(v);
      if (v.ivaVoceSpesaId && byId[v.ivaVoceSpesaId]) ordered.push(byId[v.ivaVoceSpesaId]);
    });
    items = ordered;
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="8" class="dg-empty">' +
        (_vociSpesa.length ? 'Nessuna voce di spesa per questa categoria.' : 'Nessuna voce di spesa per questa stagione.') +
        '</td></tr>';
      return;
    }
    body.innerHTML = items.map(function (v) {
      var linked = v.isIva && isLinkedChild[v.id];
      var sub = v.isIva ? [] : _sottospeseOf(v.id);          /* tutte, spese + crediti: solo per l'indicatore "(N)" */
      var subSpesa = v.isIva ? [] : _sottospeseSpesaOf(v.id); /* solo spese: governano Sostenuto/Preventivato */
      var expanded = !v.isIva && !!_speseExpanded[v.id];
      var toggleBtn = v.isIva ? '' :
        '<button type="button" class="dg-btn-icon-only" title="Sottospese' + (sub.length ? ' (' + sub.length + ')' : '') + '" onclick="DG.toggleSpesaDettaglio(\'' + v.id + '\')" style="margin-right:2px;flex-shrink:0;transform:rotate(' + (expanded ? 90 : 0) + 'deg)">' + _chevronIconSm() + '</button>';
      var sostenutoCell = subSpesa.length
        ? '<input type="number" class="dg-table-input" value="' + Math.round(v.importoSostenuto || 0) + '" disabled title="Calcolato automaticamente dalla somma dei pagati di ' + subSpesa.length + ' sottospes' + (subSpesa.length === 1 ? 'a' : 'e') + '">'
        : '<input type="number" class="dg-table-input" value="' + (v.importoSostenuto || 0) + '" data-id="' + v.id + '" data-field="importoSostenuto" onchange="DG.saveSpesaField(this)">';
      var preventivatoCell = (subSpesa.length && _voceHaPreventivatoDaSottospese(v.id))
        ? '<input type="number" class="dg-table-input" value="' + Math.round(v.importoPreventivato || 0) + '" disabled title="Calcolato automaticamente dalla somma dei preventivati delle sottospese">'
        : '<input type="number" class="dg-table-input" value="' + (v.importoPreventivato || 0) + '" data-id="' + v.id + '" data-field="importoPreventivato" onchange="DG.saveSpesaField(this)">';
      var row = '<tr' + (v.isIva ? ' style="background:#F8FAFC"' : '') + '>' +
        '<td style="display:flex;align-items:center">' + toggleBtn + (linked ? '<span class="dg-iva-link" title="Generata automaticamente dalla voce sopra">↳</span>' : '') +
        '<input type="text" class="dg-table-input" style="width:180px" value="' + esc(v.categoria) + '" data-id="' + v.id + '" data-field="categoria" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><select class="dg-table-input" data-id="' + v.id + '" data-field="categoriaSpesaId" onchange="DG.saveSpesaField(this)">' + _categorieSpesaOptionsHtml(v.categoriaSpesaId) + '</select></td>' +
        '<td>' + preventivatoCell + '</td>' +
        '<td>' + sostenutoCell + '</td>' +
        '<td>' + (v.isIva ? '<span class="dg-muted" title="Aliquota applicata sulla voce madre — le voci IVA non generano a loro volta IVA">' +
            (v.ivaAliquota ? (+v.ivaAliquota).toLocaleString('it-IT') + '%' : '—') + '</span>' :
          '<input type="number" class="dg-table-input" style="width:70px" min="0" step="1" value="' + (v.ivaAliquota || '') + '" placeholder="0" data-id="' + v.id + '" data-field="ivaAliquota" onchange="DG.saveSpesaField(this)">') + '</td>' +
        '<td><input type="date" class="dg-table-input" value="' + esc(v.dataSpesa || '') + '" data-id="' + v.id + '" data-field="dataSpesa" onchange="DG.saveSpesaField(this)">' +
        (v.dataSpesa ? '<div style="font-size:11px;color:var(--dg-muted);margin-top:3px">' + esc(_fmtDateLong(v.dataSpesa)) + '</div>' : '') + '</td>' +
        '<td><input type="text" class="dg-table-input" style="width:160px" value="' + esc(v.note || '') + '" data-id="' + v.id + '" data-field="note" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteSpesa(\'' + v.id + '\')">' + _delIconSm() + '</button></td>' +
        '</tr>';
      return row + (expanded ? _renderSottospeseRow(v) : '');
    }).join('') + _renderSpeseTotaleRow(items);
  }

  /* Riga finale della tabella Spese: l'esito complessivo delle voci mostrate in quel
     momento (rispetta il filtro per categoria, comprende le voci IVA come il resto
     del pannello) — Preventivato, Sostenuto e lo scostamento fra i due, in un colpo
     d'occhio senza dover sommare le righe a mano. */
  function _renderSpeseTotaleRow(items) {
    var totPrev = 0, totSost = 0;
    items.forEach(function (v) { totPrev += (+v.importoPreventivato || 0); totSost += (+v.importoSostenuto || 0); });
    var totScost = totSost - totPrev;
    return '<tr class="dg-total-row">' +
      '<td colspan="2">Totale' + (_speseFilterCategoriaId ? ' <span class="dg-muted" style="font-weight:400">(categoria filtrata)</span>' : '') + '</td>' +
      '<td>' + _eur(totPrev) + '</td>' +
      '<td>' + _eur(totSost) + '</td>' +
      '<td colspan="3" style="color:' + (totScost > 0 ? 'var(--dg-red)' : 'var(--dg-green)') + '">Scostamento ' + (totScost > 0 ? '+' : '') + _eurSigned(totScost) + '</td>' +
      '<td></td>' +
    '</tr>';
  }

  function _chevronIconSm() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9,6 15,12 9,18"/></svg>'; }

  /* Una delle due tabelle (spese o crediti) dentro il dettaglio di una voce: stessa
     struttura, vocabolario diverso — "Preventivato/Pagato" per le spese, "Incasso
     previsto/Incassato" per i crediti. Il tipo è deciso da QUALE tabella si aggiunge
     la riga (nessun campo "tipo" da cambiare dopo: per correggere un errore si elimina
     e si reinserisce nella tabella giusta). */
  function _sottospesaTableHtml(v, rows, tipo) {
    var isCredito = tipo === 'credito';
    var labelPrev = isCredito ? 'Incasso previsto' : 'Preventivato';
    var labelEff  = isCredito ? 'Incassato' : 'Pagato';
    var righe = rows.length ? rows.map(function (s) {
      var st = _statoSottospesa(s);
      return '<tr>' +
        '<td><input type="text" class="dg-table-input" value="' + esc(s.descrizione) + '" data-sid="' + s.id + '" data-field="descrizione" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><input type="number" class="dg-table-input" value="' + (s.importoPreventivato || 0) + '" data-sid="' + s.id + '" data-field="importoPreventivato" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><input type="number" class="dg-table-input" value="' + (s.importo || 0) + '" data-sid="' + s.id + '" data-field="importo" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><span class="dg-badge dg-badge--' + st.badge + '">' + st.label + '</span></td>' +
        '<td><input type="date" class="dg-table-input" value="' + esc(s.data || '') + '" data-sid="' + s.id + '" data-field="data" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><input type="text" class="dg-table-input" value="' + esc(s.nota || '') + '" data-sid="' + s.id + '" data-field="nota" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteSottospesa(\'' + s.id + '\')">' + _delIconSm() + '</button></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7" class="dg-empty">' + (isCredito ? 'Nessun credito inserito.' : 'Nessuna spesa inserita.') + '</td></tr>';

    return '<div style="font-size:12px;font-weight:700;color:var(--dg-muted);margin:14px 0 6px">' + (isCredito ? 'Crediti / incassi' : 'Spese') + '</div>' +
      '<table class="dg-table" style="margin-bottom:8px"><thead><tr><th>Descrizione</th><th>' + labelPrev + '</th><th>' + labelEff + '</th><th>Stato</th><th>Data</th><th>Nota</th><th></th></tr></thead><tbody>' + righe + '</tbody></table>' +
      '<div class="dg-toolbar">' +
        '<input type="text" class="dg-table-input" id="newSottospesaDesc-' + tipo + '-' + v.id + '" placeholder="Descrizione" style="width:180px">' +
        '<input type="number" class="dg-table-input" id="newSottospesaPrev-' + tipo + '-' + v.id + '" placeholder="' + labelPrev + '" style="width:130px">' +
        '<input type="number" class="dg-table-input" id="newSottospesaImporto-' + tipo + '-' + v.id + '" placeholder="' + labelEff + '" style="width:110px">' +
        '<input type="date" class="dg-table-input" id="newSottospesaData-' + tipo + '-' + v.id + '" style="width:140px">' +
        '<input type="text" class="dg-table-input" id="newSottospesaNota-' + tipo + '-' + v.id + '" placeholder="Nota" style="width:160px">' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.addSottospesa(\'' + v.id + '\',\'' + tipo + '\')">Aggiungi ' + (isCredito ? 'credito' : 'spesa') + '</button>' +
      '</div>';
  }

  /* Riga espandibile inserita subito sotto una voce di spesa: due tabelle (spese e
     crediti) con le voci reali che la compongono + form di aggiunta rapida per ciascuna.
     I crediti sono solo un dettaglio informativo qui dentro: non toccano Sostenuto/
     Preventivato della voce né i totali di Bilancio (l'incasso, se già tracciato altrove
     — es. sponsor, rette — non va così contato due volte). */
  function _renderSottospeseRow(v) {
    var elenco = _sottospeseOf(v.id).slice().sort(function (a, b) { return (a.data || '') < (b.data || '') ? 1 : -1; });
    var spese = elenco.filter(function (s) { return !_isSottospesaCredito(s); });
    var crediti = elenco.filter(_isSottospesaCredito);

    var somma = _sommaSottospese(v.id), sommaPrev = _sommaSottospesePreventivate(v.id);
    var daPagare = spese.reduce(function (t, s) { return t + Math.max(0, (+s.importoPreventivato || 0) - (+s.importo || 0)); }, 0);
    var incassato = _sommaSottospeseIncassato(v.id), incassoPrevisto = _sommaSottospeseIncassoPrevisto(v.id);
    var daIncassare = crediti.reduce(function (t, s) { return t + Math.max(0, (+s.importoPreventivato || 0) - (+s.importo || 0)); }, 0);

    var infoLine = 'Dettaglio — "' + esc(v.categoria) + '": pagato €' + somma.toLocaleString('it-IT') + ' su €' + sommaPrev.toLocaleString('it-IT') + ' preventivati nelle spese' +
      ' · ancora da pagare €' + daPagare.toLocaleString('it-IT') +
      ' · preventivato voce €' + Number(v.importoPreventivato || 0).toLocaleString('it-IT');
    if (crediti.length) {
      infoLine += ' · incassato €' + incassato.toLocaleString('it-IT') + ' su €' + incassoPrevisto.toLocaleString('it-IT') + ' previsti' +
        ' · ancora da incassare €' + daIncassare.toLocaleString('it-IT') +
        ' <span title="I crediti sono solo un dettaglio qui dentro: non modificano Sostenuto/Preventivato della voce né i totali di Bilancio.">ⓘ</span>';
    }

    return '<tr class="dg-spesa-detail-row"><td colspan="8" style="background:#F8FAFC;padding:12px 16px;border-top:1px dashed var(--dg-border)">' +
      '<div style="font-size:12px;font-weight:700;color:var(--dg-muted)">' + infoLine + '</div>' +
      _sottospesaTableHtml(v, spese, 'spesa') +
      _sottospesaTableHtml(v, crediti, 'credito') +
      '<div class="dg-toolbar" style="margin-top:4px">' +
        '<button class="dg-btn-ghost dg-btn-sm" onclick="DG.exportSottospesePdf(\'' + v.id + '\')">Esporta PDF</button>' +
      '</div>' +
    '</td></tr>';
  }

  DG.toggleSpesaDettaglio = function (id) {
    _speseExpanded[id] = !_speseExpanded[id];
    _renderSpese();
  };

  DG.addSottospesa = function (voceId, tipo) {
    tipo = tipo === 'credito' ? 'credito' : 'spesa';
    var v = _vociSpesa.find(function (x) { return x.id === voceId; });
    if (!v) return;
    var suffix = tipo + '-' + voceId;
    var descrizione = (val('newSottospesaDesc-' + suffix) || '').trim();
    var importo = +val('newSottospesaImporto-' + suffix) || 0;
    var importoPreventivato = +val('newSottospesaPrev-' + suffix) || 0;
    if (!descrizione) { alert('Inserisci una descrizione.'); return; }
    if (!importo && !importoPreventivato) { alert('Inserisci almeno un importo (' + (tipo === 'credito' ? 'incasso previsto o incassato' : 'preventivato o pagato') + ').'); return; }
    var data = {
      seasonId: _currentSeasonId, voceSpesaId: voceId, tipo: tipo,
      descrizione: descrizione, importo: importo, importoPreventivato: importoPreventivato,
      data: val('newSottospesaData-' + suffix) || '', nota: (val('newSottospesaNota-' + suffix) || '').trim(),
      createdAt: new Date().toISOString()
    };
    var ref = db.collection('sottospese').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _sottospese.push(data);
      return _logWrite('sottospesa', ref.id, (tipo === 'credito' ? 'Credito' : 'Sottospesa') + ' — ' + v.categoria + ' / ' + descrizione, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _speseExpanded[voceId] = true;
      return _syncVoceDaSottospese(voceId);
    }).then(function () {
      _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.saveSottospesaField = function (el) {
    var id = el.dataset.sid, field = el.dataset.field;
    var s = _sottospese.find(function (x) { return x.id === id; });
    if (!s) return;
    if (field === 'descrizione' && !el.value.trim()) { alert('La descrizione non può essere vuota.'); el.value = s.descrizione; return; }
    var isText = field === 'data' || field === 'descrizione' || field === 'nota';
    var old = {}; old[field] = isText ? (s[field] || '') : (s[field] || 0);
    var nv = isText ? (field === 'descrizione' || field === 'nota' ? el.value.trim() : el.value) : (+el.value || 0);
    s[field] = nv;
    var patch = {}; patch[field] = nv;
    var v = _vociSpesa.find(function (x) { return x.id === s.voceSpesaId; });
    db.collection('sottospese').doc(id).update(patch)
      .then(function () { return _logWrite('sottospesa', id, (_isSottospesaCredito(s) ? 'Credito' : 'Sottospesa') + ' — ' + (v ? v.categoria : '') + ' / ' + s.descrizione, 'update', _diff(old, patch, [field])); })
      .then(function () { return (field === 'importo' || field === 'importoPreventivato') ? _syncVoceDaSottospese(s.voceSpesaId) : null; })
      .then(function () { _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteSottospesa = function (id) {
    var s = _sottospese.find(function (x) { return x.id === id; });
    if (!s) return;
    var v = _vociSpesa.find(function (x) { return x.id === s.voceSpesaId; });
    confirm('Eliminare la sottospesa "' + s.descrizione + '"?', function () {
      db.collection('sottospese').doc(id).delete()
        .then(function () { return _logWrite('sottospesa', id, 'Sottospesa — ' + (v ? v.categoria : '') + ' / ' + s.descrizione, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _sottospese = _sottospese.filter(function (x) { return x.id !== id; });
          return _syncVoceDaSottospese(s.voceSpesaId);
        })
        .then(function () { _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio(); })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  DG.saveSpesaField = function (el) {
    var id = el.dataset.id, field = el.dataset.field;
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    if (field === 'categoria' && !el.value.trim()) { alert('La voce di spesa non può essere vuota.'); el.value = v.categoria; return; }
    var isText = field === 'dataSpesa' || field === 'categoriaSpesaId' || field === 'categoria' || field === 'note';
    var old = {}; old[field] = isText ? (v[field] || '') : (v[field] || 0);
    var nv = isText ? (field === 'categoria' || field === 'note' ? el.value.trim() : el.value) : (+el.value || 0);
    v[field] = nv;
    var patch = {}; patch[field] = nv;
    var fields = [field];
    /* Se è la voce IVA stessa (non la sua "genitrice") e la scadenza non è mai stata forzata a mano,
       cambiare la data ricalcola in automatico il trimestre di versamento. */
    if (v.isIva && field === 'dataSpesa' && !v.ivaScadenzaManuale) {
      var auto = _trimestreIvaDaData(nv);
      old.ivaTrimestre = v.ivaTrimestre || ''; old.ivaScadenza = v.ivaScadenza || '';
      v.ivaTrimestre = patch.ivaTrimestre = auto ? auto.trimestre : '';
      v.ivaScadenza = patch.ivaScadenza = auto ? auto.scadenza : '';
      fields.push('ivaTrimestre', 'ivaScadenza');
    }
    var needsIvaSync = field === 'importoSostenuto' || field === 'importoPreventivato' || field === 'ivaAliquota' || field === 'categoria' || field === 'dataSpesa';
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, fields)); })
      .then(function () { return needsIvaSync ? _syncSpesaIva(v) : null; })
      .then(function () { _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteSpesa = function (id) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var figlieSottospesa = _sottospeseOf(id);
    confirm('Eliminare la voce "' + v.categoria + '"?' +
      (v.ivaVoceSpesaId ? ' Verrà eliminata anche la relativa voce IVA.' : '') +
      (figlieSottospesa.length ? ' Verranno eliminate anche le ' + figlieSottospesa.length + ' sottospese collegate.' : ''), function () {
      var figlia = v.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;
      var genitrice = _vociSpesa.find(function (x) { return x.ivaVoceSpesaId === id; });
      db.collection('vociSpesa').doc(id).delete()
        .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () { return genitrice ? db.collection('vociSpesa').doc(genitrice.id).update({ ivaVoceSpesaId: '' }) : null; })
        .then(function () {
          return Promise.all(figlieSottospesa.map(function (s) {
            return db.collection('sottospese').doc(s.id).delete()
              .then(function () { return _logWrite('sottospesa', s.id, 'Sottospesa — ' + v.categoria + ' / ' + s.descrizione, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); });
          }));
        })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== id && (!figlia || x.id !== figlia.id); });
          _sottospese = _sottospese.filter(function (x) { return x.voceSpesaId !== id; });
          delete _speseExpanded[id];
          if (genitrice) genitrice.ivaVoceSpesaId = '';
          _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* Genera/aggiorna/rimuove la voce di spesa "IVA <nome>" figlia di una voce con IVA % impostata.
     Stesso meccanismo usato per l'IVA sulle tranche sponsor: ivaVoceSpesaId sulla voce genitrice
     punta alla voce IVA generata, per aggiornarla invece di duplicarla ad ogni modifica. */
  function _syncSpesaIva(v) {
    if (v.isIva) return Promise.resolve();
    var aliquota = +v.ivaAliquota || 0;
    var figlia = v.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;

    if (aliquota <= 0) {
      if (!figlia) return Promise.resolve();
      return db.collection('vociSpesa').doc(figlia.id).delete()
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return db.collection('vociSpesa').doc(v.id).update({ ivaVoceSpesaId: '' }); })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== figlia.id; });
          v.ivaVoceSpesaId = '';
        });
    }

    /* Preventivato e sostenuto si proiettano entrambi sull'aliquota, così la voce IVA
       permette anche una previsione (non solo il consuntivo) — e porta con sé l'aliquota
       applicata, per distinguere a colpo d'occhio le voci all'11% (sponsor) da quelle
       al 22% (es. abbigliamento/materiali) nel Riepilogo IVA. */
    var importoIva = Math.round((+v.importoSostenuto || 0) * aliquota) / 100;
    var importoIvaPreventivato = Math.round((+v.importoPreventivato || 0) * aliquota) / 100;
    var nome = 'IVA ' + v.categoria;
    var auto = _trimestreIvaDaData(v.dataSpesa);

    if (figlia) {
      var old = { categoria: figlia.categoria, importoSostenuto: figlia.importoSostenuto, importoPreventivato: figlia.importoPreventivato, ivaAliquota: figlia.ivaAliquota, dataSpesa: figlia.dataSpesa };
      var patch = { categoria: nome, importoSostenuto: importoIva, importoPreventivato: importoIvaPreventivato, ivaAliquota: aliquota, dataSpesa: v.dataSpesa || '' };
      /* La scadenza di versamento si ricalcola solo se non è mai stata forzata a mano sulla voce IVA. */
      if (!figlia.ivaScadenzaManuale) {
        old.ivaTrimestre = figlia.ivaTrimestre || ''; old.ivaScadenza = figlia.ivaScadenza || '';
        patch.ivaTrimestre = auto ? auto.trimestre : ''; patch.ivaScadenza = auto ? auto.scadenza : '';
      }
      return db.collection('vociSpesa').doc(figlia.id).update(patch)
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + nome, 'update', _diff(old, patch, Object.keys(patch))); })
        .then(function () {
          figlia.categoria = nome; figlia.importoSostenuto = importoIva; figlia.importoPreventivato = importoIvaPreventivato; figlia.ivaAliquota = aliquota; figlia.dataSpesa = v.dataSpesa || '';
          if (patch.ivaTrimestre !== undefined) { figlia.ivaTrimestre = patch.ivaTrimestre; figlia.ivaScadenza = patch.ivaScadenza; }
        });
    }

    var data = {
      seasonId: _currentSeasonId, categoria: nome, categoriaSpesaId: v.categoriaSpesaId || '',
      importoPreventivato: importoIvaPreventivato, importoSostenuto: importoIva, ivaAliquota: aliquota, dataSpesa: v.dataSpesa || '',
      note: 'IVA ' + aliquota + '% generata automaticamente sulla voce "' + v.categoria + '"', isIva: true, pagata: false, ivaEscluso: false,
      ivaTrimestre: auto ? auto.trimestre : '', ivaScadenza: auto ? auto.scadenza : '', ivaScadenzaManuale: false
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      v.ivaVoceSpesaId = ref.id;
      return db.collection('vociSpesa').doc(v.id).update({ ivaVoceSpesaId: ref.id });
    }).then(function () {
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    });
  }

  /* ---- RIEPILOGO IVA — somma di tutte le voci IVA (sponsor + spese), per questa stagione ---- */

  /* Scadenze classiche di versamento IVA trimestrale: I trim. 16/5, II trim. 20/8, III trim. 16/11,
     IV trim. 16/3 dell'anno successivo (saldo con la dichiarazione annuale). */
  var TRIMESTRI_IVA_LABEL = { T1: 'I trimestre (gen-mar)', T2: 'II trimestre (apr-giu)', T3: 'III trimestre (lug-set)', T4: 'IV trimestre (ott-dic)' };

  function _trimestreIvaDaData(dataStr) {
    if (!dataStr) return null;
    var y = +dataStr.slice(0, 4), m = +dataStr.slice(5, 7);
    if (m <= 3) return { trimestre: 'T1', scadenza: y + '-05-16' };
    if (m <= 6) return { trimestre: 'T2', scadenza: y + '-08-20' };
    if (m <= 9) return { trimestre: 'T3', scadenza: y + '-11-16' };
    return { trimestre: 'T4', scadenza: (y + 1) + '-03-16' };
  }

  function _ivaTrimestriOptions(refYear) {
    return [
      { key: 'T1', scadenza: refYear + '-05-16' },
      { key: 'T2', scadenza: refYear + '-08-20' },
      { key: 'T3', scadenza: refYear + '-11-16' },
      { key: 'T4', scadenza: (refYear + 1) + '-03-16' }
    ];
  }

  function _calcIvaTotale() {
    var tutte = _vociSpesa.filter(function (v) { return v.isIva; })
      .slice().sort(function (a, b) { return (+b.importoSostenuto || 0) - (+a.importoSostenuto || 0); });
    var righe = tutte.filter(function (v) { return !v.ivaEscluso; });
    var esclusi = tutte.filter(function (v) { return v.ivaEscluso; });
    var totale = righe.reduce(function (s, v) { return s + (+v.importoSostenuto || 0); }, 0);
    var totalePreventivato = righe.reduce(function (s, v) { return s + (+v.importoPreventivato || 0); }, 0);
    return { righe: righe, esclusi: esclusi, totale: totale, totalePreventivato: totalePreventivato };
  }

  /* Esclude/ripristina una voce IVA dalla sola sezione "Riepilogo IVA": la voce resta salvata
     e continua ad aggiornarsi in automatico (importi, aliquota), semplicemente non compare più
     in questa lista né nei suoi totali — stesso principio del "escludi dalla tabella" già usato
     per i materiali sponsor. Non tocca Spese/Bilancio, che restano invariati. */
  DG.escludiIva = function (id) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    v.ivaEscluso = true;
    _renderIvaRiepilogo();
    db.collection('vociSpesa').doc(id).update({ ivaEscluso: true })
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', [{ campo: 'ivaEscluso', prima: false, dopo: true }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.ripristinaIva = function (id) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    v.ivaEscluso = false;
    _renderIvaRiepilogo();
    db.collection('vociSpesa').doc(id).update({ ivaEscluso: false })
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', [{ campo: 'ivaEscluso', prima: true, dopo: false }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.setIvaScadenza = function (sel) {
    var id = sel.dataset.id, refYear = +sel.dataset.refyear;
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var patch;
    if (!sel.value) {
      var auto = _trimestreIvaDaData(v.dataSpesa);
      patch = { ivaScadenzaManuale: false, ivaTrimestre: auto ? auto.trimestre : '', ivaScadenza: auto ? auto.scadenza : '' };
    } else {
      var opt = _ivaTrimestriOptions(refYear).find(function (o) { return o.key === sel.value; });
      patch = { ivaScadenzaManuale: true, ivaTrimestre: opt.key, ivaScadenza: opt.scadenza };
    }
    var old = { ivaScadenzaManuale: !!v.ivaScadenzaManuale, ivaTrimestre: v.ivaTrimestre || '', ivaScadenza: v.ivaScadenza || '' };
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () {
        v.ivaScadenzaManuale = patch.ivaScadenzaManuale; v.ivaTrimestre = patch.ivaTrimestre; v.ivaScadenza = patch.ivaScadenza;
        _renderIvaRiepilogo();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _ivaScadenzaSelectHtml(v) {
    var refYear = v.dataSpesa ? +v.dataSpesa.slice(0, 4) : new Date().getFullYear();
    var autoLabel = 'Automatica' + (!v.ivaScadenzaManuale && v.ivaTrimestre ? ' (' + TRIMESTRI_IVA_LABEL[v.ivaTrimestre] + ')' : '');
    var opts = '<option value=""' + (!v.ivaScadenzaManuale ? ' selected' : '') + '>' + esc(autoLabel) + '</option>' +
      _ivaTrimestriOptions(refYear).map(function (o) {
        return '<option value="' + o.key + '"' + (v.ivaScadenzaManuale && v.ivaTrimestre === o.key ? ' selected' : '') + '>' +
          esc(TRIMESTRI_IVA_LABEL[o.key] + ' — scade ' + _fmtDateLong(o.scadenza)) + '</option>';
      }).join('');
    return '<select class="dg-table-input" data-id="' + v.id + '" data-refyear="' + refYear + '" onchange="DG.setIvaScadenza(this)">' + opts + '</select>';
  }

  /* Una tantum per sessione: le voci IVA create prima dell'introduzione di aliquota/preventivato
     sulla voce figlia non li avevano ancora salvati — le individua e le fa ripassare dal sync
     che già esiste (_syncSpesaIva / _syncSponsorIva), senza toccare quelle già a posto. */
  var _ivaAliquotaBackfillDone = false;
  function _backfillIvaAliquote() {
    if (_ivaAliquotaBackfillDone) return;
    _ivaAliquotaBackfillDone = true;
    var jobs = [];
    _sponsorizzazioni.forEach(function (s) {
      if (!s.ivaVoceSpesaId) return;
      var figlia = _vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; });
      if (figlia && !figlia.ivaAliquota) jobs.push(_syncSponsorIva(s));
    });
    _vociSpesa.forEach(function (v) {
      if (v.isIva || !v.ivaVoceSpesaId) return;
      var figlia = _vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; });
      if (figlia && !figlia.ivaAliquota) jobs.push(_syncSpesaIva(v));
    });
    if (!jobs.length) return;
    Promise.all(jobs).then(function () { _renderSpese(); _renderStatCards(); _renderBilancio(); })
      .catch(function (e) { console.error('[iva] backfill aliquota', e); });
  }

  function _renderIvaRiepilogo() {
    var statsEl = document.getElementById('ivaRiepilogoStats');
    var bodyEl = document.getElementById('ivaRiepilogoBody');
    var esclusiEl = document.getElementById('ivaRiepilogoEsclusi');
    if (!statsEl || !bodyEl) return;
    _backfillIvaAliquote();
    var d = _calcIvaTotale();
    statsEl.innerHTML = _budgetStatCard('IVA preventivata', d.totalePreventivato, '') + _budgetStatCard('IVA sostenuta', d.totale, '');
    bodyEl.innerHTML = d.righe.length ? d.righe.map(function (v) {
      return '<tr><td>' + esc(v.categoria) + '</td>' +
        '<td>' + (v.ivaAliquota ? (+v.ivaAliquota).toLocaleString('it-IT') + '%' : '—') + '</td>' +
        '<td>' + _eur(+v.importoPreventivato || 0) + '</td>' +
        '<td>' + _eur(+v.importoSostenuto || 0) + '</td>' +
        '<td>' + (v.dataSpesa ? esc(_fmtDateLong(v.dataSpesa)) : '—') + '</td>' +
        '<td>' + _ivaScadenzaSelectHtml(v) +
        (v.ivaScadenza ? '<div style="font-size:11px;color:var(--dg-muted);margin-top:3px">Scade il ' + esc(_fmtDateLong(v.ivaScadenza)) + '</div>' : '') + '</td>' +
        '<td style="text-align:center"><input type="checkbox" data-id="' + v.id + '"' + (v.pagata ? ' checked' : '') +
          ' title="Segna come versata all\'Erario — solo allora conta come uscita nel Bilancio" onchange="DG.toggleIvaPagata(this.dataset.id, this.checked)"></td>' +
        '<td><button type="button" class="dg-pezzi-row-remove" onclick="DG.escludiIva(\'' + v.id + '\')" title="Escludi dalla sezione IVA — resta salvata e continua ad aggiornarsi, la ripristini in qualsiasi momento">✕</button></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="8" class="dg-empty">Nessuna voce IVA per questa stagione.</td></tr>';
    if (esclusiEl) {
      esclusiEl.innerHTML = d.esclusi.length ? '<div class="dg-pezzi-esclusi">' +
        '<span class="dg-pezzi-esclusi-label">Escluse dal riepilogo IVA:</span>' +
        d.esclusi.map(function (v) {
          return '<span class="dg-pezzi-esclusi-chip">' + esc(v.categoria) +
            '<button type="button" class="dg-pezzi-esclusi-restore" onclick="DG.ripristinaIva(\'' + v.id + '\')" title="Rimetti nel riepilogo IVA">↺</button></span>';
        }).join('') + '</div>' : '';
    }
  }

  /* La voce IVA è "Sostenuto" (accrual, sempre conteggiata in Spese/Forecasting)
     ma diventa uscita reale nel Bilancio/flussi di cassa solo quando la si
     marca come effettivamente versata all'Erario. */
  DG.toggleIvaPagata = function (id, checked) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var old = { pagata: !!v.pagata };
    var patch = { pagata: checked };
    v.pagata = checked;
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, ['pagata'])); })
      .then(function () { _renderIvaRiepilogo(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* ---- EXPORT PDF (bilancio + spese per categoria + singole voci), via finestra di stampa del browser ---- */
  function _pdfCss() {
    return 'body{font-family:Arial,Helvetica,sans-serif;color:#1E293B;margin:0;padding:32px}' +
      'header{border-bottom:3px solid #1E3A5F;padding-bottom:12px;margin-bottom:26px}' +
      'header h1{margin:0 0 4px;font-size:19px;color:#1E3A5F}' +
      'header p{margin:0;font-size:12px;color:#64748B}' +
      /* Le sezioni possono contenere tabelle lunghe più di una pagina: "avoid" su tutta
         la section spingerebbe l'intero blocco alla pagina dopo appena non entra più,
         lasciando un vuoto in fondo a quella precedente. Si evita solo di spezzare una
         riga a metà (tr) o di lasciare un titolo orfano in fondo pagina (h2); l'intestazione
         della tabella si ripete da sola a ogni nuova pagina (thead). */
      'section{margin-bottom:26px}' +
      'h2{font-size:14px;color:#1E3A5F;border-bottom:1px solid #E2E8F0;padding-bottom:6px;margin:0 0 10px;page-break-after:avoid}' +
      'table{width:100%;border-collapse:collapse;font-size:11px}' +
      'thead{display:table-header-group}' +
      'tr{page-break-inside:avoid}' +
      'th,td{padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:left}' +
      'th{background:#F8FAFC;font-weight:700;color:#1E3A5F}' +
      '.pdf-stat-row{display:flex;gap:10px;flex-wrap:wrap}' +
      '.pdf-stat-card{flex:1;min-width:110px;background:#F8FAFC;border-radius:8px;padding:10px 12px}' +
      '.pdf-stat-label{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.03em}' +
      '.pdf-stat-value{font-size:15px;font-weight:700;margin-top:2px}' +
      'footer{margin-top:8px;font-size:10px;color:#94A3B8;text-align:center}' +
      '@media print{body{padding:12px}}';
  }

  function _pdfStatRow(items) {
    return '<div class="pdf-stat-row">' + items.map(function (it) {
      return '<div class="pdf-stat-card"><div class="pdf-stat-label">' + esc(it[0]) + '</div><div class="pdf-stat-value">' + _eur(it[1]) + '</div></div>';
    }).join('') + '</div>';
  }

  function _pdfTableHtml(headers, rows, emptyMsg) {
    if (!rows.length) return '<p style="color:#94A3B8;font-size:12px">' + esc(emptyMsg) + '</p>';
    var thead = '<tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>';
    var tbody = rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('');
    return '<table><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
  }

  /* ---- PDF "gestionale" — solo per il dettaglio di una voce di spesa (letterhead con
     logo, card KPI, barra di avanzamento, tabelle con stato colorato). Foglio di stile
     a sé, separato da _pdfCss/_pdfStatRow/_pdfTableHtml che restano quelli usati da
     exportSpesePdf, per non cambiargli l'aspetto. */
  function _pdfCssRicco() {
    return '@page{size:A4;margin:16mm 14mm}' +
      '*{box-sizing:border-box}' +
      'body{font-family:"Manrope",Arial,Helvetica,sans-serif;color:#1E293B;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12.5px}' +
      '.doc{max-width:800px;margin:0 auto}' +
      'h1,h2{font-family:"Barlow","Poppins",Arial,sans-serif;margin:0}' +
      '.letterhead{display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#0F172A 0%,#1E3A5F 100%);color:#fff;padding:18px 22px;border-radius:10px;margin-bottom:22px}' +
      '.letterhead-brand{display:flex;align-items:center;gap:12px}' +
      '.letterhead-logo{width:42px;height:42px;object-fit:contain;border-radius:8px;background:#fff;padding:3px}' +
      '.letterhead-club{font-family:"Barlow",sans-serif;font-weight:700;font-size:17px;letter-spacing:.01em}' +
      '.letterhead-sub{font-size:10.5px;color:rgba(255,255,255,.68);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}' +
      '.letterhead-meta{text-align:right;font-size:10.5px;color:rgba(255,255,255,.85)}' +
      '.letterhead-doctype{font-family:"Barlow",sans-serif;font-weight:700;font-size:11.5px;color:#fff;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}' +
      '.letterhead-metarow strong{color:#fff;font-weight:700;margin-left:4px}' +
      '.titleblock{margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #E2E8F0}' +
      '.titleblock h1{font-size:22px;color:#0F172A;font-weight:700}' +
      '.titleblock-tags{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}' +
      '.tag{font-size:10.5px;background:#F1F5F9;color:#475569;border-radius:999px;padding:3px 11px;font-weight:600}' +
      '.titleblock-note{margin:8px 0 0;font-size:11.5px;color:#64748B;font-style:italic}' +
      '.kpis{display:flex;gap:10px;margin-bottom:16px}' +
      '.kpi{flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-top:3px solid #94A3B8;border-radius:8px;padding:10px 12px}' +
      '.kpi-label{font-size:9.5px;color:#64748B;text-transform:uppercase;letter-spacing:.05em;font-weight:700}' +
      '.kpi-value{font-size:17px;font-weight:700;color:#0F172A;margin-top:3px;font-family:"Barlow",sans-serif}' +
      '.kpi--accent{border-top-color:#008CFD}' +
      '.kpi--pos{border-top-color:#EF4444}.kpi--pos .kpi-value{color:#DC2626}' +
      '.kpi--neg{border-top-color:#10B981}.kpi--neg .kpi-value{color:#059669}' +
      '.progress{margin:4px 0 22px}' +
      '.progress-row{display:flex;justify-content:space-between;font-size:10.5px;color:#475569;font-weight:600;margin-bottom:5px}' +
      '.progress-track{height:8px;background:#E2E8F0;border-radius:999px;overflow:hidden}' +
      '.progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#008CFD,#053063)}' +
      '.progress-fill--over{background:linear-gradient(90deg,#F59E0B,#EF4444)}' +
      /* Niente "avoid" sull'intero .block: con una tabella lunga più di una pagina lo
         spingerebbe tutto alla pagina dopo, lasciando un vuoto in fondo a quella prima.
         Si evita solo di spezzare una riga a metà o lasciare il titolo orfano in fondo
         pagina; l'intestazione della tabella si ripete da sola a ogni pagina nuova. */
      '.block{margin-bottom:20px}' +
      '.block-hd{display:flex;align-items:center;gap:8px;margin-bottom:9px;page-break-after:avoid}' +
      '.block-dot{width:9px;height:9px;border-radius:50%;display:inline-block}' +
      '.block-dot--spesa{background:#053063}' +
      '.block-dot--credito{background:#10B981}' +
      '.block-hd h2{font-size:13.5px;color:#0F172A;font-weight:700;text-transform:uppercase;letter-spacing:.03em}' +
      '.block-count{font-size:10.5px;color:#94A3B8;font-weight:600}' +
      '.doc table{width:100%;border-collapse:collapse;font-size:11px}' +
      '.doc thead{display:table-header-group}' +
      '.doc tr{page-break-inside:avoid}' +
      '.doc th{background:#0F172A;color:#fff;font-family:"Barlow",sans-serif;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:7px 9px}' +
      '.doc th.num,.doc td.num{text-align:right}' +
      '.doc td{padding:6.5px 9px;border-bottom:1px solid #E2E8F0}' +
      '.doc tbody tr:nth-child(even){background:#F8FAFC}' +
      '.doc tr.total-row td{border-top:2px solid #0F172A;border-bottom:none;font-weight:700;color:#0F172A;background:#F1F5F9;padding-top:8px;padding-bottom:8px}' +
      '.empty-row td{text-align:center;color:#94A3B8;font-style:italic;padding:14px}' +
      '.badge{display:inline-block;font-size:9.5px;font-weight:700;padding:2.5px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.02em}' +
      '.badge--ok{background:#ECFDF5;color:#059669}' +
      '.badge--mid{background:#EFF6FF;color:#2563EB}' +
      '.badge--warn{background:#FFFBEB;color:#B45309}' +
      '.recap{margin-top:4px;margin-bottom:20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 18px;page-break-inside:avoid}' +
      '.recap-title{font-family:"Barlow",sans-serif;font-weight:700;font-size:12.5px;color:#0F172A;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}' +
      '.recap-row{display:flex;justify-content:space-between;font-size:12.5px;padding:5px 0}' +
      '.recap-row strong{font-family:"Barlow",sans-serif}' +
      '.recap-row--net{border-top:1px solid #CBD5E1;margin-top:4px;padding-top:9px;font-size:14px}' +
      '.recap-row--net strong{color:#0F172A;font-size:16px}' +
      '.recap-caption{margin:8px 0 0;font-size:9.5px;color:#94A3B8}' +
      '.doc footer{margin-top:18px;padding-top:10px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:9.5px;color:#94A3B8}';
  }

  /* badge dello stato: stessi 3 colori del pannello (in_trattativa=ambra, contattato=blu, chiuso=verde). */
  function _pdfBadgeKind(badgeKey) {
    if (badgeKey === 'chiuso') return 'ok';
    if (badgeKey === 'contattato') return 'mid';
    return 'warn';
  }
  function _pdfBadgeHtml(label, kind) {
    var cls = kind === 'ok' ? 'badge--ok' : kind === 'mid' ? 'badge--mid' : 'badge--warn';
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }
  function _pdfKpiCard(label, value, variant) {
    return '<div class="kpi' + (variant ? ' kpi--' + variant : '') + '"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + _eurSigned(value) + '</div></div>';
  }
  /* headers = etichette di Preventivato/Pagato (diverse per spese e crediti); rows = righe
     già pronte da _pdfSottospesaRow(); totalRow = { prev, eff } o null per non stampare il totale. */
  function _pdfSectionHtml(dotClass, title, count, headers, rows, emptyMsg, totalRow) {
    var thead = '<tr><th>Descrizione</th><th class="num">' + esc(headers[0]) + '</th><th class="num">' + esc(headers[1]) + '</th><th>Stato</th><th>Data</th><th>Nota</th></tr>';
    var body;
    if (!rows.length) {
      body = '<tr class="empty-row"><td colspan="6">' + esc(emptyMsg) + '</td></tr>';
    } else {
      body = rows.map(function (r) {
        return '<tr><td>' + r.desc + '</td><td class="num">' + r.prev + '</td><td class="num">' + r.eff + '</td><td>' + r.stato + '</td><td>' + r.data + '</td><td>' + r.nota + '</td></tr>';
      }).join('');
      if (totalRow) body += '<tr class="total-row"><td>Totale</td><td class="num">' + totalRow.prev + '</td><td class="num">' + totalRow.eff + '</td><td></td><td></td><td></td></tr>';
    }
    return '<section class="block">' +
      '<div class="block-hd"><span class="block-dot ' + dotClass + '"></span><h2>' + esc(title) + '</h2><span class="block-count">' + count + '</span></div>' +
      '<table><thead>' + thead + '</thead><tbody>' + body + '</tbody></table>' +
    '</section>';
  }

  /* Export PDF del dettaglio di una singola voce di spesa (es. "Evento 1500€"): letterhead
     con logo, KPI (preventivato/sostenuto/scostamento/da pagare), barra di avanzamento,
     tabella Spese e — se presenti — tabella Crediti/incassi con un riepilogo a parte
     (il netto qui è solo per la stampa: non tocca Sostenuto/Preventivato né Bilancio). */
  DG.exportSottospesePdf = function (voceId) {
    var v = _vociSpesa.find(function (x) { return x.id === voceId; });
    if (!v) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var cat = v.categoriaSpesaId ? _categoriaSpesaById(v.categoriaSpesaId) : null;
    var elenco = _sottospeseOf(voceId).slice().sort(function (a, b) { return (a.data || '') < (b.data || '') ? -1 : 1; });
    var spese = elenco.filter(function (s) { return !_isSottospesaCredito(s); });
    var crediti = elenco.filter(_isSottospesaCredito);
    var somma = _sommaSottospese(voceId);
    var sommaPrev = _sommaSottospesePreventivate(voceId);
    var daPagare = spese.reduce(function (t, s) { return t + Math.max(0, (+s.importoPreventivato || 0) - (+s.importo || 0)); }, 0);
    var incassato = _sommaSottospeseIncassato(voceId);
    var incassoPrevisto = _sommaSottospeseIncassoPrevisto(voceId);
    var oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

    var preventivato = v.importoPreventivato || 0, sostenuto = v.importoSostenuto || 0;
    var scostamento = sostenuto - preventivato;
    var pct = preventivato > 0 ? Math.round(sostenuto / preventivato * 100) : (sostenuto > 0 ? 100 : 0);
    var over = sostenuto > preventivato && preventivato > 0;

    function pdfRow(s) {
      var st = _statoSottospesa(s);
      return {
        desc: esc(s.descrizione),
        prev: _eur(s.importoPreventivato || 0),
        eff: _eur(s.importo || 0),
        stato: _pdfBadgeHtml(st.label, _pdfBadgeKind(st.badge)),
        data: s.data ? esc(_fmtDateLong(s.data)) : '—',
        nota: esc(s.nota || '')
      };
    }

    var logoUrl = location.origin + '/assets/logo.png';
    var fontsUrl = location.origin + '/css/fonts.css';

    var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>' + esc(v.categoria) + ' — Report Budget — Victor Volley</title>' +
      '<link rel="stylesheet" href="' + fontsUrl + '">' +
      '<style>' + _pdfCssRicco() + '</style></head><body><div class="doc">';

    html += '<header class="letterhead">' +
      '<div class="letterhead-brand"><img class="letterhead-logo" src="' + logoUrl + '" alt=""><div><div class="letterhead-club">Victor Volley</div><div class="letterhead-sub">Area Dirigenti &middot; Report Budget</div></div></div>' +
      '<div class="letterhead-meta"><div class="letterhead-doctype">Dettaglio voce di spesa</div>' +
      '<div class="letterhead-metarow"><span>Stagione</span><strong>' + esc(season.nome || '—') + '</strong></div>' +
      '<div class="letterhead-metarow"><span>Generato il</span><strong>' + oggi + '</strong></div></div>' +
    '</header>';

    html += '<div class="titleblock"><h1>' + esc(v.categoria) + '</h1>' +
      '<div class="titleblock-tags">' +
        '<span class="tag">Categoria: ' + esc(cat ? cat.nome : '—') + '</span>' +
        (v.dataSpesa ? '<span class="tag">Data: ' + esc(_fmtDateLong(v.dataSpesa)) + '</span>' : '') +
      '</div>' +
      (v.note ? '<p class="titleblock-note">' + esc(v.note) + '</p>' : '') +
    '</div>';

    html += '<div class="kpis">' +
      _pdfKpiCard('Preventivato', preventivato) +
      _pdfKpiCard('Sostenuto', sostenuto, 'accent') +
      _pdfKpiCard('Scostamento', scostamento, scostamento > 0 ? 'pos' : 'neg') +
      _pdfKpiCard('Ancora da pagare', daPagare) +
    '</div>';

    html += '<div class="progress"><div class="progress-row"><span>Avanzamento spesa rispetto al preventivo</span><span>' + pct + '%</span></div>' +
      '<div class="progress-track"><div class="progress-fill' + (over ? ' progress-fill--over' : '') + '" style="width:' + Math.min(100, pct) + '%"></div></div></div>';

    html += _pdfSectionHtml('block-dot--spesa', 'Spese', spese.length + (spese.length === 1 ? ' voce' : ' voci'),
      ['Preventivato', 'Pagato'], spese.map(pdfRow), 'Nessuna spesa inserita per questa voce.',
      spese.length ? { prev: _eur(sommaPrev), eff: _eur(somma) } : null);

    /* I crediti compaiono in stampa solo se ce n'è almeno uno: sono un dettaglio
       informativo, non fanno parte del costo della voce sopra. */
    if (crediti.length) {
      html += _pdfSectionHtml('block-dot--credito', 'Crediti / incassi', crediti.length + (crediti.length === 1 ? ' voce' : ' voci'),
        ['Incasso previsto', 'Incassato'], crediti.map(pdfRow), '', { prev: _eur(incassoPrevisto), eff: _eur(incassato) });

      var netto = somma - incassato;
      html += '<div class="recap"><div class="recap-title">Bilancio dell\'evento</div>' +
        '<div class="recap-row"><span>Speso</span><strong>' + _eur(somma) + '</strong></div>' +
        '<div class="recap-row"><span>Incassato</span><strong>' + _eur(incassato) + '</strong></div>' +
        '<div class="recap-row recap-row--net"><span>Netto</span><strong>' + _eur(netto) + '</strong></div>' +
        '<p class="recap-caption">Solo un riepilogo di questo documento: non modifica Sostenuto/Preventivato della voce né i totali di Bilancio nel gestionale.</p></div>';
    }

    html += '<footer><span>Victor Volley &middot; Area Dirigenti</span><span>Documento generato automaticamente</span></footer>';
    html += '</div></body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito e riprova.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
  };

  DG.exportSpesePdf = function () {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var r = _calcRiepilogo();
    var forecast = _calcSpeseForecast();
    var bilancio = _calcBilancioMensile();
    var oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

    var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Report Spese — ' + esc(season.nome || '') + '</title>' +
      '<style>' + _pdfCss() + '</style></head><body>';

    html += '<header><h1>Victor Volley — Report Spese &amp; Bilancio</h1>' +
      '<p>Stagione: <strong>' + esc(season.nome || '—') + '</strong> &middot; Generato il ' + oggi + '</p></header>';

    html += '<section><h2>Riepilogo generale</h2>' +
      _pdfStatRow([
        ['Entrate confermate', r.entrateConfermate],
        ['Uscite', r.uscite],
        ['Saldo', r.saldo],
        ['Obiettivo', r.obiettivo],
        ['Differenza da obiettivo', r.differenza]
      ]) + '</section>';

    var entrateDett = _calcEntrateConfermateDettaglio();
    html += '<section><h2>Da chi arrivano le entrate confermate</h2>' +
      _pdfTableHtml(['Fonte', 'Nome', 'Importo'],
        entrateDett.righe.map(function (x) { return [esc(x.tipo), esc(x.nome), _eur(x.importo)]; })
          .concat(entrateDett.righe.length ? [['<strong>Totale</strong>', '', '<strong>' + _eur(entrateDett.totale) + '</strong>']] : []),
        'Nessuna entrata confermata per questa stagione.') + '</section>';

    html += '<section><h2>Bilancio mensile (entrate vs uscite realmente mosse)</h2>' +
      _pdfTableHtml(['Mese', 'Entrate', 'Uscite', 'Saldo mese', 'Saldo progressivo'],
        bilancio.righe.map(function (x) { return [esc(x.label), _eur(x.entrate), _eur(x.uscite), _eur(x.saldo), _eur(x.progressivo)]; })
          .concat(bilancio.righe.length ? [[
            '<strong>Totale</strong>', '<strong>' + _eur(bilancio.totEntrate) + '</strong>', '<strong>' + _eur(bilancio.totUscite) + '</strong>',
            '<strong>' + _eur(bilancio.totEntrate - bilancio.totUscite) + '</strong>', '—'
          ]] : []),
        'Nessuna tranche incassata o spesa datata per questa stagione.') + '</section>';

    var ivaTot = _calcIvaTotale();
    html += '<section><h2>Riepilogo IVA</h2>' +
      _pdfStatRow([['Totale IVA', ivaTot.totale]]) +
      _pdfTableHtml(['Voce', 'Importo', 'Data', 'Scadenza versamento'],
        ivaTot.righe.map(function (v) {
          var scad = v.ivaTrimestre ? (TRIMESTRI_IVA_LABEL[v.ivaTrimestre] + ' — ' + _fmtDateLong(v.ivaScadenza)) : '—';
          return [esc(v.categoria), _eur(+v.importoSostenuto || 0), v.dataSpesa ? esc(_fmtDateLong(v.dataSpesa)) : '—', esc(scad)];
        }),
        'Nessuna voce IVA per questa stagione.') + '</section>';

    html += '<section><h2>Spese per categoria — preventivato vs sostenuto</h2>' +
      _pdfTableHtml(['Categoria', 'Preventivato', 'Sostenuto', 'Scostamento'],
        forecast.righe.map(function (x) {
          return [esc(x.nome), _eur(x.preventivato), _eur(x.sostenuto),
            '<span style="color:' + (x.scostamento > 0 ? '#DC2626' : '#16A34A') + '">' + (x.scostamento > 0 ? '+' : '') + _eurSigned(x.scostamento) + '</span>'];
        }), 'Nessuna voce di spesa per questa stagione.') + '</section>';

    /* Riga finale di totale: stessa somma (tutte le voci, comprese quelle IVA) mostrata
       in fondo alla tabella live "Spese" del pannello — vedi _renderSpese(). Lo
       scostamento totale è già nella sezione "Spese per categoria" appena sopra. */
    var totVociPrev = 0, totVociSost = 0;
    _vociSpesa.forEach(function (v) { totVociPrev += (+v.importoPreventivato || 0); totVociSost += (+v.importoSostenuto || 0); });
    html += '<section><h2>Singole voci di spesa</h2>' +
      _pdfTableHtml(['Voce', 'Categoria', 'Preventivato', 'Sostenuto', 'Data', 'Note'],
        _vociSpesa.map(function (v) {
          var cat = v.categoriaSpesaId ? _categoriaSpesaById(v.categoriaSpesaId) : null;
          return [esc(v.categoria), esc(cat ? cat.nome : '—'), _eur(v.importoPreventivato || 0), _eur(v.importoSostenuto || 0),
            v.dataSpesa ? esc(_fmtDateLong(v.dataSpesa)) : '—', esc(v.note || '')];
        }).concat(_vociSpesa.length ? [[
          '<strong>Totale</strong>', '', '<strong>' + _eur(totVociPrev) + '</strong>', '<strong>' + _eur(totVociSost) + '</strong>', '', ''
        ]] : []),
        'Nessuna voce di spesa per questa stagione.') + '</section>';

    html += '<footer>Victor Volley — Area Dirigenti · Documento generato automaticamente</footer>';
    html += '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito e riprova.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
  };

  /* ---- CATEGORIE DI SPESA (gestione, valide per tutte le stagioni) ---- */
  function _renderCategorieSpesaModalList() {
    var list = document.getElementById('categorieSpesaModalList');
    list.innerHTML = _categorieSpesa.length ? _categorieSpesa.map(function (c) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<span>' + esc(c.nome) + '</span>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteCategoriaSpesa(\'' + c.id + '\')">' + _delIconSm() + '</button>' +
        '</div>';
    }).join('') : '<p class="dg-muted">Nessuna categoria ancora.</p>';
  }

  DG.addCategoriaSpesa = function () {
    var input = document.getElementById('categoriaSpesaNewInput');
    var nome = input.value.trim();
    if (!nome) return;
    if (_categorieSpesa.some(function (c) { return c.nome.toLowerCase() === nome.toLowerCase(); })) { alert('Categoria già esistente.'); return; }
    var data = { nome: nome, createdAt: new Date().toISOString() };
    var ref = db.collection('categorieSpesa').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _categorieSpesa.push(data);
      _categorieSpesa.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
      return _logWrite('categoriaSpesa', ref.id, 'Categoria di spesa — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      input.value = '';
      _renderCategorieSpesaModalList();
      _renderSpese();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteCategoriaSpesa = function (id) {
    var c = _categoriaSpesaById(id);
    if (!c) return;
    confirm('Eliminare la categoria "' + c.nome + '"? Le voci di spesa che la usano perderanno l\'assegnazione.', function () {
      db.collection('categorieSpesa').doc(id).delete()
        .then(function () { return _logWrite('categoriaSpesa', id, 'Categoria di spesa — ' + c.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _categorieSpesa = _categorieSpesa.filter(function (x) { return x.id !== id; });
          _renderCategorieSpesaModalList();
          _renderSpese();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- BILANCIO — entrate (tranche sponsor pagate) vs uscite (spese sostenute), per mese ---- */
  var MESI_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  function _monthKey(dateStr) { return dateStr ? dateStr.slice(0, 7) : null; }
  function _monthLabel(key) {
    var p = key.split('-');
    return MESI_IT[(+p[1]) - 1] + ' ' + p[0];
  }
  function _eur(n) { return '€' + Math.round(n).toLocaleString('it-IT'); }
  /* _eur() non gestisce i negativi (darebbe "€-260"): per gli scostamenti, che possono
     esserlo, il segno va davanti al simbolo — stessa convenzione di _budgetStatCard. */
  function _eurSigned(n) { return (n < 0 ? '-' : '') + '€' + Math.abs(Math.round(n)).toLocaleString('it-IT'); }

  /* Calcolo puro (nessun DOM), condiviso da _renderBilancio() e dall'export PDF. */
  function _calcBilancioMensile() {
    var curIds = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; }).map(function (s) { return s.id; });
    var entrateSponsor = _tranche.filter(function (t) { return t.pagato && curIds.indexOf(t.sponsorizzazioneId) !== -1; })
      .map(function (t) {
        var s = _sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
        var az = s ? _aziendaById(s.aziendaId) : null;
        return { scadenza: t.scadenza, importo: +t.importo || 0, tipo: 'Sponsor', nome: az ? az.ragioneSociale : '—', note: t.note || '' };
      });
    /* _atletiRette è già filtrato per la stagione corrente (vedi _loadSeasonScoped). */
    var atletiIds = _atletiRette.map(function (a) { return a.id; });
    var entrateRette = _rateAtleti.filter(function (r) { return r.pagata && atletiIds.indexOf(r.atletaRettaId) !== -1; })
      .map(function (r) {
        var a = _atletaRettaById(r.atletaRettaId);
        return { scadenza: r.scadenza, importo: +r.importo || 0, tipo: 'Retta atleti', nome: a ? (a.nome + ' ' + a.cognome) : '—', note: r.note || '' };
      });
    var entrate = entrateSponsor.concat(entrateRette);
    /* Le voci IVA sono "sostenute" ma non ancora un'uscita di cassa reale finché
       non vengono marcate come versate (v.pagata) nel Riepilogo IVA. */
    var uscite = _vociSpesa.filter(function (v) { return +v.importoSostenuto > 0 && (!v.isIva || v.pagata); });

    var months = {};
    var senzaData = 0;
    entrate.forEach(function (t) {
      var k = _monthKey(t.scadenza);
      if (!k) return;
      months[k] = months[k] || { entrate: 0, uscite: 0 };
      months[k].entrate += (+t.importo || 0);
    });
    uscite.forEach(function (v) {
      var k = _monthKey(v.dataSpesa);
      var importo = +v.importoSostenuto || 0;
      if (!k) { senzaData += importo; return; }
      months[k] = months[k] || { entrate: 0, uscite: 0 };
      months[k].uscite += importo;
    });

    var keys = Object.keys(months).sort();
    var progressivo = 0, totEntrate = 0, totUscite = 0;
    var righe = keys.map(function (k) {
      var m = months[k];
      var saldo = m.entrate - m.uscite;
      progressivo += saldo;
      totEntrate += m.entrate; totUscite += m.uscite;
      return { label: _monthLabel(k), entrate: m.entrate, uscite: m.uscite, saldo: saldo, progressivo: progressivo };
    });
    if (senzaData) {
      progressivo -= senzaData;
      totUscite += senzaData;
      righe.push({ label: 'Spese senza data', entrate: 0, uscite: senzaData, saldo: -senzaData, progressivo: progressivo });
    }

    var entrateSorted = entrate.slice().sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; });
    return { righe: righe, totEntrate: totEntrate, totUscite: totUscite, entrateList: entrateSorted };
  }

  function _renderBilancio() {
    var mesiBody = document.getElementById('bilancioMesiBody');
    var entrateBody = document.getElementById('bilancioEntrateBody');
    if (!mesiBody || !entrateBody) return;

    var b = _calcBilancioMensile();
    if (!b.righe.length) {
      mesiBody.innerHTML = '<tr><td colspan="5" class="dg-empty">Nessuna entrata incassata o spesa datata per questa stagione.</td></tr>';
    } else {
      var rows = b.righe.map(function (r) {
        return '<tr>' +
          '<td>' + esc(r.label) + '</td>' +
          '<td>' + _eur(r.entrate) + '</td>' +
          '<td>' + _eur(r.uscite) + '</td>' +
          '<td style="color:' + (r.saldo < 0 ? 'var(--dg-red)' : 'var(--dg-green)') + '">' + _eur(r.saldo) + '</td>' +
          '<td>' + _eur(r.progressivo) + '</td>' +
          '</tr>';
      });
      rows.push('<tr style="font-weight:700">' +
        '<td>Totale</td>' +
        '<td>' + _eur(b.totEntrate) + '</td>' +
        '<td>' + _eur(b.totUscite) + '</td>' +
        '<td>' + _eur(b.totEntrate - b.totUscite) + '</td>' +
        '<td>—</td>' +
        '</tr>');
      mesiBody.innerHTML = rows.join('');
    }

    entrateBody.innerHTML = b.entrateList.length ? b.entrateList.map(function (t) {
      return '<tr>' +
        '<td>' + _fmtDateLong(t.scadenza) + '</td>' +
        '<td>' + esc(t.tipo) + '</td>' +
        '<td>' + esc(t.nome) + '</td>' +
        '<td>' + _eur(t.importo) + '</td>' +
        '<td>' + esc(t.note || '') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="5" class="dg-empty">Nessuna entrata incassata per questa stagione.</td></tr>';
  }

  /* ---- LOG (sola lettura, copre tutta l'Area Dirigenti + il CMS) ---- */
  function _logDate(l) {
    if (!l.timestamp) return null;
    if (l.timestamp.toDate) return l.timestamp.toDate();
    if (l.timestamp instanceof Date) return l.timestamp;
    return new Date(l.timestamp);
  }

  function _fmtDateTime(l) {
    var d = _logDate(l);
    if (!d) return '—';
    return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  function _azioneLabel(a) { return { create: 'Creato', update: 'Modificato', delete: 'Eliminato' }[a] || a; }

  function _fmtCampoLabel(f) {
    if (!f || f.charAt(0) === '(') return f;
    var s = f.replace(/([A-Z])/g, ' $1');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function _fmtLogVal(v) {
    if (v === null || v === undefined || v === '') return '—';
    var s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
  }

  /* Voci scritte prima di questa modifica: l.campi era un array di soli nomi
     campo (stringhe), senza prima/dopo — restano leggibili, solo più scarne. */
  function _fmtCampoDettaglio(ch) {
    if (typeof ch === 'string') return _fmtCampoLabel(ch);
    var label = _fmtCampoLabel(ch.campo);
    if (ch.aperto) return label;
    return label + ': ' + _fmtLogVal(ch.prima) + ' → ' + _fmtLogVal(ch.dopo);
  }

  function _fmtDettagli(l) {
    if (!l.campi || !l.campi.length) return '—';
    return l.campi.map(_fmtCampoDettaglio).join(', ');
  }

  function _renderLog() {
    var entita    = document.getElementById('logFilterEntita').value;
    var dirigente = document.getElementById('logFilterDirigente').value;
    var dal       = document.getElementById('logFilterDal').value;
    var al        = document.getElementById('logFilterAl').value;

    var rows = A.getAuditLog().filter(function (l) {
      if (entita && l.entita !== entita) return false;
      if (dirigente && l.dirigenteId !== dirigente) return false;
      var ts = _logDate(l);
      if (dal && ts && ts < new Date(dal)) return false;
      if (al && ts) { var alDate = new Date(al); alDate.setHours(23, 59, 59, 999); if (ts > alDate) return false; }
      return true;
    });

    var body = document.getElementById('logBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="dg-empty">Nessuna voce di log.</td></tr>'; return; }
    body.innerHTML = rows.map(function (l) {
      return '<tr>' +
        '<td>' + _fmtDateTime(l) + '</td>' +
        '<td>' + esc(l.dirigenteNome || '—') + '</td>' +
        '<td>' + esc(l.entitaLabel || l.entita) + '</td>' +
        '<td>' + esc(_azioneLabel(l.azione)) + '</td>' +
        '<td>' + esc(_fmtDettagli(l)) + '</td>' +
        '</tr>';
    }).join('');
  }

  function _saveNewSponsor() {
    var aziendaSel = val('newSponsorAziendaSelect');
    var importo = +val('newSponsorImporto') || 0;
    var prob = +val('newSponsorProbabilita') || 0.5;
    var resp = val('newSponsorResponsabile');
    var tipologia = val('newSponsorTipologia');

    function createSponsorizzazione(aziendaId, aziendaNome) {
      var data = {
        aziendaId: aziendaId, seasonId: _currentSeasonId, stato: 'prospect',
        importoStimato: importo, probabilitaChiusura: prob, importoConfermato: 0,
        tipologia: tipologia, dataFirma: '', scadenza: '', modalitaPagamento: '',
        dirigenteResponsabileId: resp, contropartite: '', note: '', createdAt: new Date().toISOString()
      };
      var ref = db.collection('sponsorizzazioni').doc();
      return ref.set(data).then(function () {
        data.id = ref.id;
        _sponsorizzazioni.push(data);
        return _logWrite('sponsorizzazione', ref.id, 'Sponsorizzazione — ' + aziendaNome, 'create', _diff({}, data, Object.keys(data)));
      });
    }

    var p;
    if (aziendaSel) {
      var az = _aziendaById(aziendaSel);
      p = createSponsorizzazione(aziendaSel, az ? az.ragioneSociale : '');
    } else {
      var nome = val('newAziendaNome').trim();
      if (!nome) { alert('Inserisci la ragione sociale.'); return; }
      var aziendaData = {
        ragioneSociale: nome, settore: val('newAziendaSettore'), referente: val('newAziendaReferente'),
        telefono: val('newAziendaTelefono'), email: val('newAziendaEmail'), sitoWeb: '', note: '', createdAt: new Date().toISOString()
      };
      var aref = db.collection('aziende').doc();
      p = aref.set(aziendaData).then(function () {
        aziendaData.id = aref.id;
        _aziende.push(aziendaData);
        /* Niente log qui: l'azienda nasce come parte dell'aggiunta dello sponsor,
           che è già loggata subito sotto da createSponsorizzazione(). */
        return createSponsorizzazione(aref.id, nome);
      });
    }

    p.then(function () {
      _closeBudgetModal('newSponsorModal');
      _renderKanban(); _renderStatCards(); _renderCharts();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewSeason() {
    var nome = val('seasonNomeInput').trim();
    if (!nome) { alert('Inserisci il nome della stagione.'); return; }
    var data = {
      nome: nome, dataInizio: val('seasonInizioInput'), dataFine: val('seasonFineInput'),
      obiettivoSaldo: +val('seasonObiettivoInput') || 0, isAttiva: true, createdAt: new Date().toISOString()
    };
    var batch = db.batch();
    var ref = db.collection('budgetSeasons').doc();
    batch.set(ref, data);
    _seasons.forEach(function (s) { if (s.isAttiva) batch.update(db.collection('budgetSeasons').doc(s.id), { isAttiva: false }); });

    batch.commit().then(function () {
      data.id = ref.id;
      _seasons.forEach(function (s) { s.isAttiva = false; });
      _seasons.unshift(data);
      _currentSeasonId = ref.id;
      return _logWrite('obiettivo', ref.id, 'Stagione — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newSeasonModal');
      _populateSeasonSelect();
      return _loadSeasonScoped();
    }).then(function () {
      _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderKanban(); _renderRette(); _renderSpese(); _renderBilancio();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewCategoria() {
    var nome = val('categoriaNomeInput').trim();
    if (!nome) { alert('Inserisci il nome della categoria.'); return; }
    var data = {
      seasonId: _currentSeasonId, nome: nome,
      rettaUnitaria: +val('categoriaRettaInput') || 0
    };
    var ref = db.collection('categorieAtleti').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _categorieAtleti.push(data);
      return _logWrite('categoriaAtleti', ref.id, 'Categoria — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newCategoriaModal');
      _renderRette();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewSpesa() {
    var categoria = val('spesaCategoriaInput').trim();
    if (!categoria) { alert('Inserisci il nome della voce di spesa.'); return; }
    var data = {
      seasonId: _currentSeasonId, categoria: categoria,
      categoriaSpesaId: val('spesaCategoriaSpesaSelect'),
      importoPreventivato: +val('spesaPreventivatoInput') || 0,
      importoSostenuto: +val('spesaSostenutoInput') || 0,
      ivaAliquota: +val('spesaIvaInput') || 0,
      dataSpesa: val('spesaDataInput'),
      note: val('spesaNoteInput').trim()
    };
    var ref = db.collection('vociSpesa').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + categoria, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      return _syncSpesaIva(data);
    }).then(function () {
      _closeBudgetModal('newSpesaModal');
      _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- SELECT POPULATORS ---- */
  function _populateSeasonSelect() {
    var sel = document.getElementById('seasonSelect');
    sel.innerHTML = _seasons.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === _currentSeasonId ? ' selected' : '') + '>' + esc(s.nome) + (s.isAttiva ? ' (attiva)' : '') + '</option>';
    }).join('');
  }
  function _populateResponsabileSelects() {
    var sel = document.getElementById('newSponsorResponsabile');
    sel.innerHTML = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === A.uid() ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
  }
  function _populateLogDirigenteFilter() {
    var sel = document.getElementById('logFilterDirigente');
    sel.innerHTML = '<option value="">Tutti i dirigenti</option>' + _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '">' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
  }

  /* ---- UTILS ---- */
  function _aziendaById(id) { return _aziende.find(function (a) { return a.id === id; }); }
  function _isStorico(aziendaId) { return _sponsorizzazioni.some(function (s) { return s.aziendaId === aziendaId && s.seasonId !== _currentSeasonId; }); }
  /* _daysDiff e _fmtDate: già definite più sopra (sezione Atleti), riusate qui */
  function _todayISO() { return new Date().toISOString().slice(0, 10); }
  function _initials(nome, cognome) { return ((nome || '?').charAt(0) + (cognome || '').charAt(0)).toUpperCase(); }
  function _nextPromemoria(sponsorId) {
    var items = _promemoria.filter(function (p) { return p.sponsorizzazioneId === sponsorId && !p.completato; })
      .sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    return items[0] || null;
  }
  function _statoLabel(s) { return { prospect: 'Prospect', contattato: 'Contattato', in_trattativa: 'In Trattativa', chiuso: 'Chiuso', rifiutato: 'Rifiutato' }[s] || s; }
  function _statoColor(s) { return { prospect: '#64748B', contattato: '#008CFD', in_trattativa: '#F59E0B', chiuso: '#10B981', rifiutato: '#EF4444' }[s] || '#64748B'; }
  function _tipoLabel(t) { return { chiamata: 'Chiamata', email: 'Email', incontro: 'Incontro', nota: 'Nota' }[t] || t; }
  function _delIconSm() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>'; }

  /* ---- WIRING UI (una tantum, DOM già presente a fine body) ---- */
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.budget-subtab').forEach(function (btn) {
      btn.addEventListener('click', function () { _switchBudgetTab(btn.dataset.btab); });
    });

    var dashBudgetCard = document.getElementById('dashBudgetCard');
    var _goToBudgetRiepilogo = function () { goTo('budget'); _switchBudgetTab('riepilogo'); };
    dashBudgetCard.addEventListener('click', _goToBudgetRiepilogo);
    dashBudgetCard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _goToBudgetRiepilogo(); }
    });

    var dashCashflowCard = document.getElementById('dashCashflowCard');
    dashCashflowCard.addEventListener('click', _goToBudgetRiepilogo);
    dashCashflowCard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _goToBudgetRiepilogo(); }
    });

    var dashSpeseCard = document.getElementById('dashSpeseCard');
    var _goToBudgetSpese = function () { goTo('budget'); _switchBudgetTab('spese'); };
    dashSpeseCard.addEventListener('click', _goToBudgetSpese);
    dashSpeseCard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _goToBudgetSpese(); }
    });

    document.getElementById('filterMieiSponsor').addEventListener('change', _renderKanban);

    document.getElementById('seasonSelect').addEventListener('change', function () {
      _currentSeasonId = this.value;
      _loadSeasonScoped().then(function () {
        _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards();
        _renderCharts(); _renderCashflow(); _renderKanban(); _renderRette(); _renderSpese(); _renderBilancio();
      });
    });

    document.getElementById('obiettivoSave').addEventListener('click', _saveObiettivo);

    ['logFilterEntita', 'logFilterDirigente', 'logFilterDal', 'logFilterAl'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', _renderLog);
    });

    document.getElementById('drawerCloseBtn').addEventListener('click', _closeDrawer);
    document.getElementById('drawerOverlay').addEventListener('click', _closeDrawer);

    document.getElementById('modalOverlay').addEventListener('click', function () { if (A.openModalId()) _closeBudgetModal(A.openModalId()); });

    document.getElementById('newSponsorBtn').addEventListener('click', function () {
      document.getElementById('newSponsorAziendaSelect').innerHTML = '<option value="">— Crea nuova azienda —</option>' +
        _aziende.map(function (a) { return '<option value="' + a.id + '">' + esc(a.ragioneSociale) + '</option>'; }).join('');
      document.getElementById('newAziendaFields').classList.remove('is-hidden');
      ['newAziendaNome', 'newAziendaSettore', 'newAziendaReferente', 'newAziendaTelefono', 'newAziendaEmail'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('newSponsorImporto').value = '';
      _openBudgetModal('newSponsorModal');
    });
    document.getElementById('newSponsorClose').addEventListener('click', function () { _closeBudgetModal('newSponsorModal'); });
    document.getElementById('newSponsorCancel').addEventListener('click', function () { _closeBudgetModal('newSponsorModal'); });
    document.getElementById('newSponsorAziendaSelect').addEventListener('change', function () {
      document.getElementById('newAziendaFields').classList.toggle('is-hidden', !!this.value);
    });
    document.getElementById('newSponsorSave').addEventListener('click', _saveNewSponsor);

    document.getElementById('newSeasonBtn').addEventListener('click', function () {
      ['seasonNomeInput', 'seasonInizioInput', 'seasonFineInput'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('seasonObiettivoInput').value = 0;
      _openBudgetModal('newSeasonModal');
    });
    document.getElementById('newSeasonClose').addEventListener('click', function () { _closeBudgetModal('newSeasonModal'); });
    document.getElementById('newSeasonCancel').addEventListener('click', function () { _closeBudgetModal('newSeasonModal'); });
    document.getElementById('newSeasonSave').addEventListener('click', _saveNewSeason);

    document.getElementById('newCategoriaBtn').addEventListener('click', function () {
      document.getElementById('categoriaNomeInput').value = '';
      document.getElementById('categoriaRettaInput').value = 0;
      _openBudgetModal('newCategoriaModal');
    });
    document.getElementById('newCategoriaClose').addEventListener('click', function () { _closeBudgetModal('newCategoriaModal'); });
    document.getElementById('newCategoriaCancel').addEventListener('click', function () { _closeBudgetModal('newCategoriaModal'); });
    document.getElementById('newCategoriaSave').addEventListener('click', _saveNewCategoria);

    document.getElementById('newAtletaRettaBtn').addEventListener('click', function () { window.AdminActions.nuovoAtletaDaBudget(); });
    document.getElementById('newAtletaRettaClose').addEventListener('click', function () { _closeBudgetModal('newAtletaRettaModal'); });
    document.getElementById('newAtletaRettaCancel').addEventListener('click', function () { _closeBudgetModal('newAtletaRettaModal'); });
    document.getElementById('newAtletaRettaSave').addEventListener('click', _saveNewAtletaRetta);

    document.getElementById('rateAtletaClose').addEventListener('click', function () { _closeBudgetModal('rateAtletaModal'); });
    document.getElementById('rateAtletaDone').addEventListener('click', function () { _closeBudgetModal('rateAtletaModal'); });
    document.getElementById('rataAtletaAddBtn').addEventListener('click', _addRataAtleta);

    document.getElementById('newSpesaBtn').addEventListener('click', function () {
      document.getElementById('spesaCategoriaInput').value = '';
      document.getElementById('spesaCategoriaSpesaSelect').innerHTML = _categorieSpesaOptionsHtml('');
      document.getElementById('spesaPreventivatoInput').value = 0;
      document.getElementById('spesaSostenutoInput').value = 0;
      document.getElementById('spesaIvaInput').value = '';
      document.getElementById('spesaDataInput').value = '';
      document.getElementById('spesaNoteInput').value = '';
      _openBudgetModal('newSpesaModal');
    });
    document.getElementById('newSpesaClose').addEventListener('click', function () { _closeBudgetModal('newSpesaModal'); });
    document.getElementById('newSpesaCancel').addEventListener('click', function () { _closeBudgetModal('newSpesaModal'); });
    document.getElementById('newSpesaSave').addEventListener('click', _saveNewSpesa);

    document.getElementById('manageCategorieSpesaBtn').addEventListener('click', function () {
      _renderCategorieSpesaModalList();
      document.getElementById('categoriaSpesaNewInput').value = '';
      _openBudgetModal('manageCategorieSpesaModal');
    });
    document.getElementById('categoriaSpesaAddBtn').addEventListener('click', DG.addCategoriaSpesa);
    document.getElementById('manageCategorieSpesaClose').addEventListener('click', function () { _closeBudgetModal('manageCategorieSpesaModal'); });
    document.getElementById('manageCategorieSpesaDone').addEventListener('click', function () { _closeBudgetModal('manageCategorieSpesaModal'); });

    document.getElementById('aggiungiSponsorPezziBtn').addEventListener('click', function () {
      _openAggiungiSponsorPopover(document.getElementById('aggiungiSponsorPezziBtn'));
    });

    document.getElementById('dimensioniModalBtn').addEventListener('click', function () {
      _renderDimensioniModalList();
      document.getElementById('dimensioneNewNomeInput').value = '';
      document.getElementById('dimensioneNewPrezzoInput').value = '';
      _openBudgetModal('dimensioniModal');
    });
    document.getElementById('dimensioneAddBtn').addEventListener('click', _addDimensione);
    document.getElementById('dimensioniModalClose').addEventListener('click', function () { _closeBudgetModal('dimensioniModal'); });
    document.getElementById('dimensioniModalDone').addEventListener('click', function () { _closeBudgetModal('dimensioniModal'); });

    document.getElementById('speseFilterCategoria').addEventListener('change', function () {
      _speseFilterCategoriaId = this.value;
      _renderSpese();
    });
  });

  /* ---- Interfaccia verso admin.js ---- */
  A.budget = {
    loadData: _loadBudgetData,
    renderActiveTab: _renderActiveBudgetTab,
    renderLog: _renderLog,
    renderDashBudgetWidget: _renderDashBudgetWidget,
    renderDashCashflowWidget: _renderDashCashflowWidget,
    renderDashSpeseWidget: _renderDashSpeseWidget,
    /* dopo una modifica a rette/rate fatta dalla scheda atleta */
    refreshRette: function () { _renderRette(); _renderStatCards(); _renderCharts(); _renderBilancio(); },
    /* stato condiviso con la scheda atleta (iscrizione e rate) */
    state: {
      get seasons() { return _seasons; },
      get currentSeasonId() { return _currentSeasonId; },
      get categorieAtleti() { return _categorieAtleti; },
      get atletiRette() { return _atletiRette; },
      set atletiRette(v) { _atletiRette = v; },
      get rateAtleti() { return _rateAtleti; },
      set rateAtleti(v) { _rateAtleti = v; }
    }
  };

})();
