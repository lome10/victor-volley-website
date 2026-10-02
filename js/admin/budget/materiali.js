/* Victor Volley — Admin / Budget: materiali sponsor (pezzi, dimensioni, prezzi).
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
    var pezzi = season.pezziSponsor || [];
    var catalogo = season.catalogoDimensioni || [];

    var sponsorRows = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId && (s.stato === 'chiuso' || s.includiMateriali); })
      .map(function (s) {
        var az = B._aziendaById(s.aziendaId);
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
      var badge = r.kind === 'sponsor' && r.stato !== 'chiuso' ? ' <span class="dg-badge dg-badge--' + r.stato + '" style="margin-left:6px">' + esc(B._statoLabel(r.stato)) + '</span>' : '';
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
    var s = B._sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = B._aziendaById(s.aziendaId);
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
    var s = B._sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = B._aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    s.escludiMateriali = false;
    _renderPezziSponsor();
    db.collection('sponsorizzazioni').doc(id).update({ escludiMateriali: false })
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', [{ campo: 'escludiMateriali', prima: true, dopo: false }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _removeExtraVoce(id) {
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
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
    return B._sponsorizzazioni.filter(function (s) {
      return s.seasonId === B._currentSeasonId && s.stato !== 'chiuso' && !s.includiMateriali;
    }).map(function (s) { return { s: s, azienda: B._aziendaById(s.aziendaId) }; })
      .sort(function (a, b) { return (a.azienda ? a.azienda.ragioneSociale : '').localeCompare(b.azienda ? b.azienda.ragioneSociale : ''); });
  }

  function _openAggiungiSponsorPopover(btn) {
    var candidati = _sponsorPezziCandidati();
    var pop = document.getElementById('dgPezziPopover');
    var html = '<div class="dg-pezzi-popover-item dg-pezzi-popover-item--new" data-action="new">+ Voce personalizzata…</div>';
    html += candidati.length ? candidati.map(function (r) {
      var nome = r.azienda ? r.azienda.ragioneSociale : '—';
      return '<div class="dg-pezzi-popover-item" data-id="' + r.s.id + '"><span>' + esc(nome) + '</span><span class="dg-muted" style="font-size:11px">' + esc(B._statoLabel(r.s.stato)) + '</span></div>';
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
    var s = B._sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = B._aziendaById(s.aziendaId);
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
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
      var s = B._sponsorizzazioni.find(function (x) { return x.id === id; });
      return s ? (s.pezzi || {}) : {};
    }
    var season = B._seasons.find(function (x) { return x.id === B._currentSeasonId; }) || {};
    var v = (season.vociExtra || []).find(function (x) { return x.id === id; });
    return v ? (v.pezzi || {}) : {};
  }

  function _pezziRowApplyMutation(kind, id, newPezzi) {
    if (kind === 'sponsor') {
      var s = B._sponsorizzazioni.find(function (x) { return x.id === id; });
      if (!s) return;
      var before = s.pezzi || {};
      s.pezzi = newPezzi;
      _renderPezziSponsor();
      var az = B._aziendaById(s.aziendaId);
      var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
      db.collection('sponsorizzazioni').doc(id).update({ pezzi: newPezzi })
        .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', _diff({ pezzi: before }, { pezzi: newPezzi }, ['pezzi'])); })
        .catch(function (e) { alert('Errore: ' + e.message); });
      return;
    }
    var season = B._seasons.find(function (x) { return x.id === B._currentSeasonId; });
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
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
    var season = B._seasons.find(function (x) { return x.id === B._currentSeasonId; }) || {};
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
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
      var interessati = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId && s.pezzi && s.pezzi[pezzo]; });
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
    var cat = season.catalogoDimensioni || [];
    list.innerHTML = cat.length ? cat.map(function (d, i) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<span>' + esc(d.nome) + ' — €' + Number(d.prezzo || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + '</span>' +
        '<button class="dg-btn-icon-only dg-dimensione-del" title="Elimina" data-idx="' + i + '">' + B._delIconSm() + '</button>' +
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
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
     B._syncSpesaIva (stesso meccanismo generico usato per ogni voce). Il Sostenuto (la spesa
     realmente effettuata) resta interamente a mano nella tabella Spese — vedi il commento
     su _syncVoceAutomatica per il motivo. Il prezzo forfettario scontato eventualmente impostato
     per colonna (vedi _setPrezzoPezzo) confluisce già qui tramite _totalePezzoColonna. ---- */
  var _materialiSyncBusy = false;
  function _totaliMaterialiSponsor() {
    var totStampe = 0, totPezzi = 0;
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
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

    B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId && (s.stato === 'chiuso' || s.includiMateriali); })
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
    var v = season[fieldId] ? B._vociSpesa.find(function (x) { return x.id === season[fieldId]; }) : null;
    if (!preventivato && !v) return Promise.resolve();
    if (v && (+v.importoPreventivato || 0) === preventivato) return Promise.resolve();

    if (!preventivato && v && !(+v.importoSostenuto || 0)) {
      var figlia = v.ivaVoceSpesaId ? B._vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;
      return db.collection('vociSpesa').doc(v.id).delete()
        .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () {
          B._vociSpesa = B._vociSpesa.filter(function (x) { return x.id !== v.id && (!figlia || x.id !== figlia.id); });
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
        .then(function () { return B._syncSpesaIva(v); });
    }
    var data = {
      seasonId: B._currentSeasonId, categoria: categoria, categoriaSpesaId: '',
      importoPreventivato: preventivato, importoSostenuto: 0, ivaAliquota: 22, dataSpesa: '',
      note: note
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      B._vociSpesa.push(data);
      season[fieldId] = ref.id;
      var patch = {}; patch[fieldId] = ref.id;
      return db.collection('budgetSeasons').doc(season.id).update(patch);
    }).then(function () {
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + categoria, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      return B._syncSpesaIva(data);
    });
  }

  function _syncMaterialiSpesa() {
    if (_materialiSyncBusy) return;
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; });
    if (!season) return;
    var totali = _totaliMaterialiSponsor();

    _materialiSyncBusy = true;
    var release = function () { _materialiSyncBusy = false; B._renderSpese(); B._renderStatCards(); B._renderBilancio(); };

    /* Migrazione una tantum: le stagioni create prima dello split avevano un'unica voce
       combinata "Materiali sponsor" — la rimuove (con la sua IVA figlia) così il sync sotto
       ricrea le due voci separate. */
    var migrazione = Promise.resolve();
    if (season.materialiVoceSpesaId) {
      var vecchia = B._vociSpesa.find(function (x) { return x.id === season.materialiVoceSpesaId; });
      if (vecchia) {
        var figliaVecchia = vecchia.ivaVoceSpesaId ? B._vociSpesa.find(function (x) { return x.id === vecchia.ivaVoceSpesaId; }) : null;
        migrazione = db.collection('vociSpesa').doc(vecchia.id).delete()
          .then(function () { return _logWrite('voceSpesa', vecchia.id, 'Spesa — ' + vecchia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
          .then(function () { return figliaVecchia ? db.collection('vociSpesa').doc(figliaVecchia.id).delete()
            .then(function () { return _logWrite('voceSpesa', figliaVecchia.id, 'Spesa — ' + figliaVecchia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
          .then(function () {
            B._vociSpesa = B._vociSpesa.filter(function (x) { return x.id !== vecchia.id && (!figliaVecchia || x.id !== figliaVecchia.id); });
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
      card.addEventListener('click', function () { if (!B._kanbanTouch.moved) B._openDrawer(card.dataset.id); });
      B._bindKanbanCardTouch(card);
    });
    document.querySelectorAll('.dg-kanban-col-body').forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('dg-drop-hover'); });
      col.addEventListener('dragleave', function () { col.classList.remove('dg-drop-hover'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('dg-drop-hover');
        var id = e.dataTransfer.getData('text/plain');
        var stato = col.closest('.dg-kanban-col').dataset.stato;
        B._changeStato(id, stato);
      });
    });
  }

  /* ---- Esportato per gli altri file del Budget ---- */
  B._addDimensione = _addDimensione;
  B._attachKanbanEvents = _attachKanbanEvents;
  B._openAggiungiSponsorPopover = _openAggiungiSponsorPopover;
  B._renderDimensioniModalList = _renderDimensioniModalList;
  B._renderPezziSponsor = _renderPezziSponsor;

})();
