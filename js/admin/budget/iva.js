/* Victor Volley — Admin / Budget: riepilogo IVA.
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
  /* ---- RIEPILOGO IVA — somma di tutte le voci IVA (sponsor + spese), per questa stagione ---- */

  /* Scadenze classiche di versamento IVA trimestrale: I trim. 16/5, II trim. 20/8, III trim. 16/11,
     IV trim. 16/3 dell'anno successivo (saldo con la dichiarazione annuale). */
  B.TRIMESTRI_IVA_LABEL = { T1: 'I trimestre (gen-mar)', T2: 'II trimestre (apr-giu)', T3: 'III trimestre (lug-set)', T4: 'IV trimestre (ott-dic)' };

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
    var tutte = B._vociSpesa.filter(function (v) { return v.isIva; })
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
    var v = B._vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    v.ivaEscluso = true;
    _renderIvaRiepilogo();
    db.collection('vociSpesa').doc(id).update({ ivaEscluso: true })
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', [{ campo: 'ivaEscluso', prima: false, dopo: true }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.ripristinaIva = function (id) {
    var v = B._vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    v.ivaEscluso = false;
    _renderIvaRiepilogo();
    db.collection('vociSpesa').doc(id).update({ ivaEscluso: false })
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', [{ campo: 'ivaEscluso', prima: true, dopo: false }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.setIvaScadenza = function (sel) {
    var id = sel.dataset.id, refYear = +sel.dataset.refyear;
    var v = B._vociSpesa.find(function (x) { return x.id === id; });
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
    var autoLabel = 'Automatica' + (!v.ivaScadenzaManuale && v.ivaTrimestre ? ' (' + B.TRIMESTRI_IVA_LABEL[v.ivaTrimestre] + ')' : '');
    var opts = '<option value=""' + (!v.ivaScadenzaManuale ? ' selected' : '') + '>' + esc(autoLabel) + '</option>' +
      _ivaTrimestriOptions(refYear).map(function (o) {
        return '<option value="' + o.key + '"' + (v.ivaScadenzaManuale && v.ivaTrimestre === o.key ? ' selected' : '') + '>' +
          esc(B.TRIMESTRI_IVA_LABEL[o.key] + ' — scade ' + _fmtDateLong(o.scadenza)) + '</option>';
      }).join('');
    return '<select class="dg-table-input" data-id="' + v.id + '" data-refyear="' + refYear + '" onchange="DG.setIvaScadenza(this)">' + opts + '</select>';
  }

  /* Una tantum per sessione: le voci IVA create prima dell'introduzione di aliquota/preventivato
     sulla voce figlia non li avevano ancora salvati — le individua e le fa ripassare dal sync
     che già esiste (B._syncSpesaIva / B._syncSponsorIva), senza toccare quelle già a posto. */
  var _ivaAliquotaBackfillDone = false;
  function _backfillIvaAliquote() {
    if (_ivaAliquotaBackfillDone) return;
    _ivaAliquotaBackfillDone = true;
    var jobs = [];
    B._sponsorizzazioni.forEach(function (s) {
      if (!s.ivaVoceSpesaId) return;
      var figlia = B._vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; });
      if (figlia && !figlia.ivaAliquota) jobs.push(B._syncSponsorIva(s));
    });
    B._vociSpesa.forEach(function (v) {
      if (v.isIva || !v.ivaVoceSpesaId) return;
      var figlia = B._vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; });
      if (figlia && !figlia.ivaAliquota) jobs.push(B._syncSpesaIva(v));
    });
    if (!jobs.length) return;
    Promise.all(jobs).then(function () { B._renderSpese(); B._renderStatCards(); B._renderBilancio(); })
      .catch(function (e) { console.error('[iva] backfill aliquota', e); });
  }

  function _renderIvaRiepilogo() {
    var statsEl = document.getElementById('ivaRiepilogoStats');
    var bodyEl = document.getElementById('ivaRiepilogoBody');
    var esclusiEl = document.getElementById('ivaRiepilogoEsclusi');
    if (!statsEl || !bodyEl) return;
    _backfillIvaAliquote();
    var d = _calcIvaTotale();
    statsEl.innerHTML = B._budgetStatCard('IVA preventivata', d.totalePreventivato, '') + B._budgetStatCard('IVA sostenuta', d.totale, '');
    bodyEl.innerHTML = d.righe.length ? d.righe.map(function (v) {
      return '<tr><td>' + esc(v.categoria) + '</td>' +
        '<td>' + (v.ivaAliquota ? (+v.ivaAliquota).toLocaleString('it-IT') + '%' : '—') + '</td>' +
        '<td>' + B._eur(+v.importoPreventivato || 0) + '</td>' +
        '<td>' + B._eur(+v.importoSostenuto || 0) + '</td>' +
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
    var v = B._vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var old = { pagata: !!v.pagata };
    var patch = { pagata: checked };
    v.pagata = checked;
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, ['pagata'])); })
      .then(function () { _renderIvaRiepilogo(); B._renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* ---- Esportato per gli altri file del Budget ---- */
  B._calcIvaTotale = _calcIvaTotale;
  B._renderIvaRiepilogo = _renderIvaRiepilogo;
  B._trimestreIvaDaData = _trimestreIvaDaData;

})();
