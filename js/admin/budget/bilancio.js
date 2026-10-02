/* Victor Volley — Admin / Budget: bilancio mensile.
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
  /* ---- BILANCIO — entrate (tranche sponsor pagate) vs uscite (spese sostenute), per mese ---- */
  var MESI_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  function _monthKey(dateStr) { return dateStr ? dateStr.slice(0, 7) : null; }
  function _monthLabel(key) {
    var p = key.split('-');
    return MESI_IT[(+p[1]) - 1] + ' ' + p[0];
  }
  function _eur(n) { return '€' + Math.round(n).toLocaleString('it-IT'); }
  /* _eur() non gestisce i negativi (darebbe "€-260"): per gli scostamenti, che possono
     esserlo, il segno va davanti al simbolo — stessa convenzione di B._budgetStatCard. */
  function _eurSigned(n) { return (n < 0 ? '-' : '') + '€' + Math.abs(Math.round(n)).toLocaleString('it-IT'); }

  /* Calcolo puro (nessun DOM), condiviso da _renderBilancio() e dall'export PDF. */
  function _calcBilancioMensile() {
    var curIds = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId; }).map(function (s) { return s.id; });
    var entrateSponsor = B._tranche.filter(function (t) { return t.pagato && curIds.indexOf(t.sponsorizzazioneId) !== -1; })
      .map(function (t) {
        var s = B._sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
        var az = s ? B._aziendaById(s.aziendaId) : null;
        return { scadenza: t.scadenza, importo: +t.importo || 0, tipo: 'Sponsor', nome: az ? az.ragioneSociale : '—', note: t.note || '' };
      });
    /* _atletiRette è già filtrato per la stagione corrente (vedi _loadSeasonScoped). */
    var atletiIds = B._atletiRette.map(function (a) { return a.id; });
    var entrateRette = B._rateAtleti.filter(function (r) { return r.pagata && atletiIds.indexOf(r.atletaRettaId) !== -1; })
      .map(function (r) {
        var a = B._atletaRettaById(r.atletaRettaId);
        return { scadenza: r.scadenza, importo: +r.importo || 0, tipo: 'Retta atleti', nome: a ? (a.nome + ' ' + a.cognome) : '—', note: r.note || '' };
      });
    var entrate = entrateSponsor.concat(entrateRette);
    /* Le voci IVA sono "sostenute" ma non ancora un'uscita di cassa reale finché
       non vengono marcate come versate (v.pagata) nel Riepilogo IVA. */
    var uscite = B._vociSpesa.filter(function (v) { return +v.importoSostenuto > 0 && (!v.isIva || v.pagata); });

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

  /* ---- Esportato per gli altri file del Budget ---- */
  B._calcBilancioMensile = _calcBilancioMensile;
  B._eur = _eur;
  B._eurSigned = _eurSigned;
  B._renderBilancio = _renderBilancio;

})();
