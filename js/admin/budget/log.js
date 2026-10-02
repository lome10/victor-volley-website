/* Victor Volley — Admin / Budget: log (audit) in sola lettura.
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
        aziendaId: aziendaId, seasonId: B._currentSeasonId, stato: 'prospect',
        importoStimato: importo, probabilitaChiusura: prob, importoConfermato: 0,
        tipologia: tipologia, dataFirma: '', scadenza: '', modalitaPagamento: '',
        dirigenteResponsabileId: resp, contropartite: '', note: '', createdAt: new Date().toISOString()
      };
      var ref = db.collection('sponsorizzazioni').doc();
      return ref.set(data).then(function () {
        data.id = ref.id;
        B._sponsorizzazioni.push(data);
        return _logWrite('sponsorizzazione', ref.id, 'Sponsorizzazione — ' + aziendaNome, 'create', _diff({}, data, Object.keys(data)));
      });
    }

    var p;
    if (aziendaSel) {
      var az = B._aziendaById(aziendaSel);
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
        B._aziende.push(aziendaData);
        /* Niente log qui: l'azienda nasce come parte dell'aggiunta dello sponsor,
           che è già loggata subito sotto da createSponsorizzazione(). */
        return createSponsorizzazione(aref.id, nome);
      });
    }

    p.then(function () {
      _closeBudgetModal('newSponsorModal');
      B._renderKanban(); B._renderStatCards(); B._renderCharts();
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
    B._seasons.forEach(function (s) { if (s.isAttiva) batch.update(db.collection('budgetSeasons').doc(s.id), { isAttiva: false }); });

    batch.commit().then(function () {
      data.id = ref.id;
      B._seasons.forEach(function (s) { s.isAttiva = false; });
      B._seasons.unshift(data);
      B._currentSeasonId = ref.id;
      return _logWrite('obiettivo', ref.id, 'Stagione — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newSeasonModal');
      B._populateSeasonSelect();
      return B._loadSeasonScoped();
    }).then(function () {
      B._renderObiettivo(); B._renderPromemoriaWidget(); B._renderStatCards(); B._renderCharts(); B._renderCashflow(); B._renderKanban(); B._renderRette(); B._renderSpese(); B._renderBilancio();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewCategoria() {
    var nome = val('categoriaNomeInput').trim();
    if (!nome) { alert('Inserisci il nome della categoria.'); return; }
    var data = {
      seasonId: B._currentSeasonId, nome: nome,
      rettaUnitaria: +val('categoriaRettaInput') || 0
    };
    var ref = db.collection('categorieAtleti').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      B._categorieAtleti.push(data);
      return _logWrite('categoriaAtleti', ref.id, 'Categoria — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newCategoriaModal');
      B._renderRette();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewSpesa() {
    var categoria = val('spesaCategoriaInput').trim();
    if (!categoria) { alert('Inserisci il nome della voce di spesa.'); return; }
    var data = {
      seasonId: B._currentSeasonId, categoria: categoria,
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
      B._vociSpesa.push(data);
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + categoria, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      return B._syncSpesaIva(data);
    }).then(function () {
      _closeBudgetModal('newSpesaModal');
      B._renderSpese(); B._renderStatCards(); B._renderCharts(); B._renderBilancio();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- Esportato per gli altri file del Budget ---- */
  B._renderLog = _renderLog;
  B._saveNewCategoria = _saveNewCategoria;
  B._saveNewSeason = _saveNewSeason;
  B._saveNewSpesa = _saveNewSpesa;
  B._saveNewSponsor = _saveNewSponsor;

})();
