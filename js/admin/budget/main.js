/* Victor Volley — Admin / Budget: tab interne, caricamento dati, utility, wiring UI e interfaccia verso admin.js.
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
  /* ---- Sotto-tab interne alla sezione "Budget & Forecast" ---- */
  function _switchBudgetTab(tab) {
    B._activeBudgetTab = tab;
    document.querySelectorAll('.budget-subtab').forEach(function (btn) { btn.classList.toggle('is-active', btn.dataset.btab === tab); });
    document.querySelectorAll('#sectionBudget > .dg-section').forEach(function (pane) { pane.classList.add('is-hidden'); });
    document.getElementById('budgetPane' + cap(tab)).classList.remove('is-hidden');
    _renderActiveBudgetTab();
  }

  function _renderActiveBudgetTab() {
    if (B._activeBudgetTab === 'riepilogo') { B._renderObiettivo(); B._renderPromemoriaWidget(); B._renderStatCards(); B._renderCharts(); B._renderCashflow(); }
    if (B._activeBudgetTab === 'sponsor')   B._renderKanban();
    if (B._activeBudgetTab === 'rette')     B._renderRette();
    if (B._activeBudgetTab === 'spese')     B._renderSpese();
    if (B._activeBudgetTab === 'tessere')   B._renderTessere();
    if (B._activeBudgetTab === 'bilancio')  { B._renderBilancio(); B._renderSpeseForecast(); }
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
      B._dirigentiList    = res[0].docs.map(_mapDoc);
      B._seasons          = res[1].docs.map(_mapDoc).sort(function (a, b) { return (a.nome || '') < (b.nome || '') ? 1 : -1; });
      B._aziende          = res[2].docs.map(_mapDoc);
      B._sponsorizzazioni = res[3].docs.map(_mapDoc);
      B._attivita         = res[4].docs.map(_mapDoc);
      B._promemoria       = res[5].docs.map(_mapDoc);
      B._tranche          = res[6].docs.map(_mapDoc);
      B._categorieSpesa   = res[7].docs.map(_mapDoc).sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
      B._rateAtleti       = res[8].docs.map(_mapDoc);

      var chain = B._seasons.length ? Promise.resolve() : _createDefaultSeason();

      return chain.then(function () {
        var active = B._seasons.find(function (s) { return s.isAttiva; }) || B._seasons[0];
        B._currentSeasonId = active.id;
        _populateSeasonSelect();
        _populateResponsabileSelects();
        _populateLogDirigenteFilter();
        return _loadSeasonScoped();
      });
    }).then(function () {
      return B._loadAuditLog();
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
      B._seasons = [data];
    });
  }

  function _loadSeasonScoped() {
    return Promise.all([
      db.collection('categorieAtleti').where('seasonId', '==', B._currentSeasonId).get(),
      db.collection('vociSpesa').where('seasonId', '==', B._currentSeasonId).get(),
      db.collection('atletiRette').where('seasonId', '==', B._currentSeasonId).get(),
      /* Sottospese: come tranchePagamento/rateAtleti, trattamento difensivo finché
         le regole non sono deployate. */
      db.collection('sottospese').where('seasonId', '==', B._currentSeasonId).get().catch(function (e) {
        console.error('[budget] sottospese', e);
        return { docs: [] };
      }),
      /* Tessere: stesso trattamento difensivo (regola da pubblicare per la nuova raccolta). */
      db.collection('tessere').where('seasonId', '==', B._currentSeasonId).get().catch(function (e) {
        console.error('[budget] tessere', e);
        return { docs: [] };
      })
    ]).then(function (res) {
      B._categorieAtleti = res[0].docs.map(_mapDoc);
      B._vociSpesa       = res[1].docs.map(_mapDoc);
      B._atletiRette     = res[2].docs.map(_mapDoc);
      B._sottospese      = res[3].docs.map(_mapDoc);
      B._tessere         = res[4].docs.map(_mapDoc);
    });
  }

  /* ---- SELECT POPULATORS ---- */
  function _populateSeasonSelect() {
    var sel = document.getElementById('seasonSelect');
    sel.innerHTML = B._seasons.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === B._currentSeasonId ? ' selected' : '') + '>' + esc(s.nome) + (s.isAttiva ? ' (attiva)' : '') + '</option>';
    }).join('');
  }
  function _populateResponsabileSelects() {
    var sel = document.getElementById('newSponsorResponsabile');
    sel.innerHTML = B._dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === A.uid() ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
  }
  function _populateLogDirigenteFilter() {
    var sel = document.getElementById('logFilterDirigente');
    sel.innerHTML = '<option value="">Tutti i dirigenti</option>' + B._dirigentiList.map(function (d) {
      return '<option value="' + d.id + '">' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
  }

  /* ---- UTILS ---- */
  function _aziendaById(id) { return B._aziende.find(function (a) { return a.id === id; }); }
  function _isStorico(aziendaId) { return B._sponsorizzazioni.some(function (s) { return s.aziendaId === aziendaId && s.seasonId !== B._currentSeasonId; }); }
  /* _daysDiff e _fmtDate: già definite più sopra (sezione Atleti), riusate qui */
  function _todayISO() { return new Date().toISOString().slice(0, 10); }
  function _initials(nome, cognome) { return ((nome || '?').charAt(0) + (cognome || '').charAt(0)).toUpperCase(); }
  function _nextPromemoria(sponsorId) {
    var items = B._promemoria.filter(function (p) { return p.sponsorizzazioneId === sponsorId && !p.completato; })
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

    document.getElementById('filterMieiSponsor').addEventListener('change', B._renderKanban);

    document.getElementById('seasonSelect').addEventListener('change', function () {
      B._currentSeasonId = this.value;
      _loadSeasonScoped().then(function () {
        B._renderObiettivo(); B._renderPromemoriaWidget(); B._renderStatCards();
        B._renderCharts(); B._renderCashflow(); B._renderKanban(); B._renderRette(); B._renderSpese(); B._renderBilancio(); B._renderTessere();
      });
    });

    document.getElementById('obiettivoSave').addEventListener('click', B._saveObiettivo);

    ['logFilterEntita', 'logFilterDirigente', 'logFilterDal', 'logFilterAl'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', B._renderLog);
    });

    document.getElementById('drawerCloseBtn').addEventListener('click', B._closeDrawer);
    document.getElementById('drawerOverlay').addEventListener('click', B._closeDrawer);

    document.getElementById('modalOverlay').addEventListener('click', function () { if (A.openModalId()) _closeBudgetModal(A.openModalId()); });

    document.getElementById('newSponsorBtn').addEventListener('click', function () {
      document.getElementById('newSponsorAziendaSelect').innerHTML = '<option value="">— Crea nuova azienda —</option>' +
        B._aziende.map(function (a) { return '<option value="' + a.id + '">' + esc(a.ragioneSociale) + '</option>'; }).join('');
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
    document.getElementById('newSponsorSave').addEventListener('click', B._saveNewSponsor);

    document.getElementById('newSeasonBtn').addEventListener('click', function () {
      ['seasonNomeInput', 'seasonInizioInput', 'seasonFineInput'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('seasonObiettivoInput').value = 0;
      _openBudgetModal('newSeasonModal');
    });
    document.getElementById('newSeasonClose').addEventListener('click', function () { _closeBudgetModal('newSeasonModal'); });
    document.getElementById('newSeasonCancel').addEventListener('click', function () { _closeBudgetModal('newSeasonModal'); });
    document.getElementById('newSeasonSave').addEventListener('click', B._saveNewSeason);

    document.getElementById('newCategoriaBtn').addEventListener('click', function () {
      document.getElementById('categoriaNomeInput').value = '';
      document.getElementById('categoriaRettaInput').value = 0;
      _openBudgetModal('newCategoriaModal');
    });
    document.getElementById('newCategoriaClose').addEventListener('click', function () { _closeBudgetModal('newCategoriaModal'); });
    document.getElementById('newCategoriaCancel').addEventListener('click', function () { _closeBudgetModal('newCategoriaModal'); });
    document.getElementById('newCategoriaSave').addEventListener('click', B._saveNewCategoria);

    document.getElementById('newAtletaRettaBtn').addEventListener('click', function () { window.AdminActions.nuovoAtletaDaBudget(); });
    document.getElementById('newAtletaRettaClose').addEventListener('click', function () { _closeBudgetModal('newAtletaRettaModal'); });
    document.getElementById('newAtletaRettaCancel').addEventListener('click', function () { _closeBudgetModal('newAtletaRettaModal'); });
    document.getElementById('newAtletaRettaSave').addEventListener('click', B._saveNewAtletaRetta);

    document.getElementById('rateAtletaClose').addEventListener('click', function () { _closeBudgetModal('rateAtletaModal'); });
    document.getElementById('rateAtletaDone').addEventListener('click', function () { _closeBudgetModal('rateAtletaModal'); });
    document.getElementById('rataAtletaAddBtn').addEventListener('click', B._addRataAtleta);

    document.getElementById('newSpesaBtn').addEventListener('click', function () {
      document.getElementById('spesaCategoriaInput').value = '';
      document.getElementById('spesaCategoriaSpesaSelect').innerHTML = B._categorieSpesaOptionsHtml('');
      document.getElementById('spesaPreventivatoInput').value = 0;
      document.getElementById('spesaSostenutoInput').value = 0;
      document.getElementById('spesaIvaInput').value = '';
      document.getElementById('spesaDataInput').value = '';
      document.getElementById('spesaNoteInput').value = '';
      _openBudgetModal('newSpesaModal');
    });
    document.getElementById('newSpesaClose').addEventListener('click', function () { _closeBudgetModal('newSpesaModal'); });
    document.getElementById('newSpesaCancel').addEventListener('click', function () { _closeBudgetModal('newSpesaModal'); });
    document.getElementById('newSpesaSave').addEventListener('click', B._saveNewSpesa);

    document.getElementById('manageCategorieSpesaBtn').addEventListener('click', function () {
      B._renderCategorieSpesaModalList();
      document.getElementById('categoriaSpesaNewInput').value = '';
      _openBudgetModal('manageCategorieSpesaModal');
    });
    document.getElementById('categoriaSpesaAddBtn').addEventListener('click', DG.addCategoriaSpesa);
    document.getElementById('manageCategorieSpesaClose').addEventListener('click', function () { _closeBudgetModal('manageCategorieSpesaModal'); });
    document.getElementById('manageCategorieSpesaDone').addEventListener('click', function () { _closeBudgetModal('manageCategorieSpesaModal'); });

    document.getElementById('aggiungiSponsorPezziBtn').addEventListener('click', function () {
      B._openAggiungiSponsorPopover(document.getElementById('aggiungiSponsorPezziBtn'));
    });

    document.getElementById('dimensioniModalBtn').addEventListener('click', function () {
      B._renderDimensioniModalList();
      document.getElementById('dimensioneNewNomeInput').value = '';
      document.getElementById('dimensioneNewPrezzoInput').value = '';
      _openBudgetModal('dimensioniModal');
    });
    document.getElementById('dimensioneAddBtn').addEventListener('click', B._addDimensione);
    document.getElementById('dimensioniModalClose').addEventListener('click', function () { _closeBudgetModal('dimensioniModal'); });
    document.getElementById('dimensioniModalDone').addEventListener('click', function () { _closeBudgetModal('dimensioniModal'); });

    document.getElementById('speseFilterCategoria').addEventListener('change', function () {
      B._speseFilterCategoriaId = this.value;
      B._renderSpese();
    });
  });

  /* ---- Interfaccia verso admin.js ---- */
  A.budget = {
    loadData: _loadBudgetData,
    renderActiveTab: _renderActiveBudgetTab,
    renderLog: B._renderLog,
    renderDashBudgetWidget: B._renderDashBudgetWidget,
    renderDashCashflowWidget: B._renderDashCashflowWidget,
    renderDashSpeseWidget: B._renderDashSpeseWidget,
    /* dopo una modifica a rette/rate fatta dalla scheda atleta */
    refreshRette: function () { B._renderRette(); B._renderStatCards(); B._renderCharts(); B._renderBilancio(); },
    /* stato condiviso con la scheda atleta (iscrizione e rate) */
    state: {
      get seasons() { return B._seasons; },
      get currentSeasonId() { return B._currentSeasonId; },
      get categorieAtleti() { return B._categorieAtleti; },
      get atletiRette() { return B._atletiRette; },
      set atletiRette(v) { B._atletiRette = v; },
      get rateAtleti() { return B._rateAtleti; },
      set rateAtleti(v) { B._rateAtleti = v; }
    }
  };

  /* ---- Esportato per gli altri file del Budget ---- */
  B._aziendaById = _aziendaById;
  B._delIconSm = _delIconSm;
  B._initials = _initials;
  B._isStorico = _isStorico;
  B._loadSeasonScoped = _loadSeasonScoped;
  B._nextPromemoria = _nextPromemoria;
  B._populateSeasonSelect = _populateSeasonSelect;
  B._statoColor = _statoColor;
  B._statoLabel = _statoLabel;
  B._switchBudgetTab = _switchBudgetTab;
  B._tipoLabel = _tipoLabel;
  B._todayISO = _todayISO;

})();
