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

  /* Calcolo puro (nessun DOM), condiviso da _renderBilancio() e dall'export PDF.
     filtro (facoltativo): 'fonte:<Sponsor|Retta atleti|Tessere>' tiene solo quelle entrate (e nessuna uscita);
     'cat:<id categoria spesa>' tiene solo le uscite di quella categoria ('cat:' = senza categoria). */
  function _calcBilancioMensile(filtro) {
    var curIds = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId; }).map(function (s) { return s.id; });
    var entrateSponsor = B._tranche.filter(function (t) { return t.pagato && curIds.indexOf(t.sponsorizzazioneId) !== -1; })
      .map(function (t) {
        var s = B._sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
        var az = s ? B._aziendaById(s.aziendaId) : null;
        /* mese dell'incasso = data d'incasso; per le tranche pagate prima che il campo esistesse resta la scadenza */
        return { scadenza: t.dataIncasso || t.scadenza, importo: +t.importo || 0, tipo: 'Sponsor', nome: az ? az.ragioneSociale : '—', note: t.note || '' };
      });
    /* _atletiRette è già filtrato per la stagione corrente (vedi _loadSeasonScoped). */
    var atletiIds = B._atletiRette.map(function (a) { return a.id; });
    var entrateRette = B._rateAtleti.filter(function (r) { return r.pagata && atletiIds.indexOf(r.atletaRettaId) !== -1; })
      .map(function (r) {
        var a = B._atletaRettaById(r.atletaRettaId);
        /* mese dell'incasso = giorno in cui è stata segnata pagata; la scadenza solo se manca la data (rate vecchie) */
        return { scadenza: r.dataPagamento || r.scadenza, importo: +r.importo || 0, tipo: 'Retta atleti', nome: a ? (a.nome + ' ' + a.cognome) : '—', note: r.note || '' };
      });
    /* Tessere pagate: la data di pagamento sceglie il mese (la tabella la imposta sempre). */
    var entrateTessere = B._calcTessere().righe.map(function (r) {
      return { scadenza: r.dataPagamento, importo: r.importo, tipo: 'Tessere', nome: 'Tessera n. ' + r.numero + ' — ' + r.nome, note: '' };
    });
    var entrate = entrateSponsor.concat(entrateRette, entrateTessere);
    /* Le voci IVA sono "sostenute" ma non ancora un'uscita di cassa reale finché
       non vengono marcate come versate (v.pagata) nel Riepilogo IVA. */
    var uscite = B._vociSpesa.filter(function (v) { return +v.importoSostenuto > 0 && (!v.isIva || v.pagata); });
    if (filtro && filtro.indexOf('fonte:') === 0) {
      entrate = entrate.filter(function (t) { return t.tipo === filtro.slice(6); });
      uscite = [];
    } else if (filtro && filtro.indexOf('cat:') === 0) {
      entrate = [];
      uscite = uscite.filter(function (v) { return (v.categoriaSpesaId || '') === filtro.slice(4); });
    }

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

  /* ---- Per categoria: da dove arrivano le entrate, dove vanno le uscite ----
     Entrate per fonte: Sponsor e Rette come nel Riepilogo (incassato = confermato), Tessere pagate.
     "Da incassare" = quanto è già previsto ma non ancora pagato. Uscite con la stessa regola del Saldo mensile
     (sostenute; l'IVA solo se versata), raggruppate per categoria di spesa. */
  function _calcBilancioPerCategoria() {
    var curSp = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId && s.stato === 'chiuso'; });
    var sponsorInc = curSp.reduce(function (s, x) { return s + B._sponsorIncassato(x); }, 0);
    var sponsorDa = curSp.reduce(function (s, x) { return s + B._sponsorDaIncassare(x); }, 0);
    var rette = B._calcRetteAtleti();
    var tess = B._calcTessere();
    var entrate = [
      { fonte: 'Sponsor', filtro: 'fonte:Sponsor', incassato: sponsorInc, daIncassare: sponsorDa },
      { fonte: 'Retta atleti', filtro: 'fonte:Retta atleti', incassato: rette.totIncassato, daIncassare: Math.max(0, rette.totPrevisto - rette.totIncassato) },
      { fonte: 'Tessere', filtro: 'fonte:Tessere', incassato: tess.incassato, daIncassare: tess.daIncassare }
    ];
    var totEntrate = entrate.reduce(function (s, r) { return s + r.incassato; }, 0);
    var totDaIncassare = entrate.reduce(function (s, r) { return s + r.daIncassare; }, 0);

    var perCat = {};
    B._vociSpesa.filter(function (v) { return +v.importoSostenuto > 0 && (!v.isIva || v.pagata); }).forEach(function (v) {
      var key = v.categoriaSpesaId || '';
      perCat[key] = (perCat[key] || 0) + (+v.importoSostenuto || 0);
    });
    var uscite = Object.keys(perCat).map(function (key) {
      var c = key ? B._categoriaSpesaById(key) : null;
      return { nome: c ? c.nome : 'Senza categoria', filtro: 'cat:' + key, sostenuto: perCat[key] };
    }).sort(function (a, b) { return b.sostenuto - a.sostenuto; });
    var totUscite = uscite.reduce(function (s, r) { return s + r.sostenuto; }, 0);

    return { entrate: entrate, totEntrate: totEntrate, totDaIncassare: totDaIncassare, uscite: uscite, totUscite: totUscite, saldo: totEntrate - totUscite };
  }

  function _pct(parte, tot) { return tot > 0 ? Math.round(parte / tot * 100) + '%' : '—'; }

  function _renderPerCategoria(filtro) {
    var bodyE = document.getElementById('bilancioCatEntrateBody');
    var bodyU = document.getElementById('bilancioCatUsciteBody');
    if (!bodyE || !bodyU) return;
    var c = _calcBilancioPerCategoria();
    var riga = function (r, cells) {
      return '<tr class="bil-cat-row' + (r.filtro === filtro ? ' is-active' : '') + '" data-filtro="' + esc(r.filtro) + '" title="Mostra solo questa voce nel saldo mensile">' + cells + '</tr>';
    };
    bodyE.innerHTML = c.entrate.map(function (r) {
      return riga(r, '<td>' + esc(r.fonte) + '</td><td>' + _eur(r.incassato) + '</td><td>' + _eur(r.daIncassare) + '</td><td>' + _pct(r.incassato, c.totEntrate) + '</td>');
    }).join('') + '<tr style="font-weight:700"><td>Totale entrate</td><td>' + _eur(c.totEntrate) + '</td><td>' + _eur(c.totDaIncassare) + '</td><td>' + (c.totEntrate > 0 ? '100%' : '—') + '</td></tr>';
    bodyU.innerHTML = (c.uscite.length ? c.uscite.map(function (r) {
      return riga(r, '<td>' + esc(r.nome) + '</td><td>' + _eur(r.sostenuto) + '</td><td>' + _pct(r.sostenuto, c.totUscite) + '</td>');
    }).join('') : '<tr><td colspan="3" class="dg-empty">Nessuna uscita registrata per questa stagione.</td></tr>') +
      '<tr style="font-weight:700"><td>Totale uscite</td><td>' + _eur(c.totUscite) + '</td><td>' + (c.totUscite > 0 ? '100%' : '—') + '</td></tr>';
    var saldoEl = document.getElementById('bilancioCatSaldo');
    if (saldoEl) {
      saldoEl.innerHTML = 'Saldo (entrate incassate − uscite): <strong style="color:' + (c.saldo < 0 ? 'var(--dg-red)' : 'var(--dg-green)') + '">' + _eurSigned(c.saldo) + '</strong>';
    }
  }

  /* Filtro del Saldo mensile: tutto, una fonte di entrata o una categoria di spesa. */
  function _filtroCorrente() { var s = document.getElementById('bilancioFiltro'); return s ? s.value : ''; }

  function _popolaFiltro() {
    var sel = document.getElementById('bilancioFiltro');
    if (!sel) return;
    var corrente = sel.value;
    var cats = {};
    B._vociSpesa.forEach(function (v) { cats[v.categoriaSpesaId || ''] = true; });
    var opzioni = ['<option value="">Tutto</option>',
      '<optgroup label="Entrate per fonte">',
      '<option value="fonte:Sponsor">Sponsor</option><option value="fonte:Retta atleti">Rette atleti</option><option value="fonte:Tessere">Tessere</option>',
      '</optgroup><optgroup label="Uscite per categoria">'];
    Object.keys(cats).map(function (key) { var c = key ? B._categoriaSpesaById(key) : null; return { key: key, nome: c ? c.nome : 'Senza categoria' }; })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome); })
      .forEach(function (x) { opzioni.push('<option value="cat:' + esc(x.key) + '">' + esc(x.nome) + '</option>'); });
    opzioni.push('</optgroup>');
    sel.innerHTML = opzioni.join('');
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === corrente; }) ? corrente : '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var sel = document.getElementById('bilancioFiltro');
    if (sel) sel.addEventListener('change', _renderBilancio);
    /* clic su una riga del riquadro "Per categoria" = filtra il saldo mensile su quella voce (di nuovo = toglie il filtro) */
    var card = document.getElementById('bilancioPerCategoria');
    if (card) card.addEventListener('click', function (e) {
      var tr = e.target.closest && e.target.closest('tr[data-filtro]');
      if (!tr || !sel) return;
      sel.value = sel.value === tr.getAttribute('data-filtro') ? '' : tr.getAttribute('data-filtro');
      _renderBilancio();
    });
  });

  function _renderBilancio() {
    var mesiBody = document.getElementById('bilancioMesiBody');
    var entrateBody = document.getElementById('bilancioEntrateBody');
    if (!mesiBody || !entrateBody) return;

    _popolaFiltro();
    var filtro = _filtroCorrente();
    _renderPerCategoria(filtro);
    var b = _calcBilancioMensile(filtro);
    if (!b.righe.length) {
      mesiBody.innerHTML = '<tr><td colspan="5" class="dg-empty">' + (filtro ? 'Nessun movimento per questa voce nella stagione.' : 'Nessuna entrata incassata o spesa datata per questa stagione.') + '</td></tr>';
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
  B._calcBilancioPerCategoria = _calcBilancioPerCategoria;
  B._eur = _eur;
  B._eurSigned = _eurSigned;
  B._renderBilancio = _renderBilancio;

})();
