/* Victor Volley — Admin / Budget: kanban sponsor, scheda azienda e tranche di pagamento.
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
  /* ---- TRANCHE DI PAGAMENTO — incasso reale vs contrattuale ---- */
  function _trancheOf(sponsorId) {
    return B._tranche.filter(function (t) { return t.sponsorizzazioneId === sponsorId; });
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

  /* IVA di uno sponsor. L'importo confermato è il TOTALE incassato, IVA compresa (es. 6.100 €).
     ivaInclusaPct = aliquota già dentro quel totale (22 → su 6.100 € ce ne sono 1.100 di IVA); vuoto = nessuna.
     ivaVersarePct = quanta IVA si versa, in % sull'imponibile (5.000 €): vuoto = 11, come è sempre stato. */
  /* ivaVersareFisso = importo REALE in € dell'IVA da versare su tutto lo sponsor: se è compilato vale al posto della %.
     Su un importo parziale (rate già incassate) si ripartisce in proporzione all'importo confermato. */
  function _sponsorIvaCalc(importo, s) {
    var a = Math.max(0, +s.ivaInclusaPct || 0);
    var fisso = Math.max(0, +s.ivaVersareFisso || 0);
    var v = (s.ivaVersarePct === '' || s.ivaVersarePct == null || isNaN(+s.ivaVersarePct)) ? 11 : Math.max(0, +s.ivaVersarePct);
    var tot = +importo || 0, imponibile = a ? tot / (1 + a / 100) : tot;
    var r = function (n) { return Math.round(n * 100) / 100; };
    var daVersare = imponibile * v / 100;
    if (fisso > 0) {
      var base = +s.importoConfermato || tot;
      daVersare = base > 0 ? fisso * Math.min(1, tot / base) : 0;
      var impTotale = a ? base / (1 + a / 100) : base;
      v = impTotale > 0 ? r(fisso / impTotale * 100) : 0;
    }
    return { aliquotaInclusa: a, versarePct: v, fisso: fisso, imponibile: r(imponibile), ivaInclusa: r(tot - imponibile), daVersare: r(daVersare) };
  }
  B._sponsorIvaCalc = _sponsorIvaCalc;
  function _ivaInclusaTesto(importo, s) {
    var c = _sponsorIvaCalc(importo, s);
    return c.ivaInclusa > 0 ? ' (di cui €' + c.ivaInclusa.toLocaleString('it-IT') + ' di IVA)' : '';
  }

  /* ---- KANBAN SPONSOR ---- */
  function _renderKanban() {
    var onlyMine = document.getElementById('filterMieiSponsor').checked;
    var cur = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId; });

    B.STATI.forEach(function (stato) {
      var items = cur.filter(function (s) { return s.stato === stato && (!onlyMine || s.dirigenteResponsabileId === A.uid()); });
      document.getElementById('count' + cap(stato)).textContent = items.length;
      var col = document.getElementById('col' + cap(stato));
      if (!items.length) { col.innerHTML = ''; return; }
      col.innerHTML = items.map(function (s) {
        var azienda = B._aziendaById(s.aziendaId);
        var importo = s.stato === 'chiuso' ? (s.importoConfermato || 0) : (s.importoStimato || 0);
        var resp = B._dirigentiList.find(function (d) { return d.id === s.dirigenteResponsabileId; });
        var prom = B._nextPromemoria(s.id);
        var chip = '';
        if (prom) {
          var days = _daysDiff(prom.dataScadenza);
          if (days < 0) chip = '<span class="dg-chip dg-chip--overdue">Scaduto</span>';
          else if (days <= 7) chip = '<span class="dg-chip dg-chip--soon">' + _fmtDate(prom.dataScadenza) + '</span>';
        }
        return '<div class="dg-kanban-card" draggable="true" data-id="' + s.id + '">' +
          '<div class="dg-kanban-card-top">' +
          '<span class="dg-kanban-card-nome">' + esc(azienda ? azienda.ragioneSociale : '—') +
          (azienda && B._isStorico(azienda.id) ? ' <span class="dg-badge dg-badge--storico" title="Sponsor storico">storico</span>' : '') +
          '</span>' +
          (s.note ? '<svg class="dg-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" title="' + esc(s.note) + '"><path d="M4 4h16v13l-4 4H4z"/><path d="M8 9h8M8 13h5"/></svg>' : '') +
          '</div>' +
          '<div class="dg-kanban-card-importo">€' + Number(importo || 0).toLocaleString('it-IT') + (s.stato === 'chiuso' ? '<small class="dg-muted" style="font-weight:400;font-size:11px">' + esc(_ivaInclusaTesto(importo, s)) + '</small>' : '') + '</div>' +
          '<div class="dg-kanban-card-bottom">' +
          '<span class="dg-avatar" title="' + esc(resp ? (resp.nome + ' ' + resp.cognome) : 'Non assegnato') + '">' + (resp ? B._initials(resp.nome, resp.cognome) : '?') + '</span>' +
          chip +
          '</div></div>';
      }).join('');
    });

    B._attachKanbanEvents();
    B._renderPezziSponsor();
    if (B._renderElencoSponsor) B._renderElencoSponsor();
  }

  /* ---- Drag & drop touch per Kanban sponsor (mobile) ---- */
  B._kanbanTouch = {
    timer: null, active: false, moved: false, card: null, id: null,
    clone: null, offX: 0, offY: 0, startX: 0, startY: 0, lastX: 0, lastY: 0,
    curCol: null, boardEl: null, rafId: null
  };
  var KANBAN_SCROLL_EDGE = 70;
  var KANBAN_SCROLL_SPEED = 14;

  function _kanbanTouchCleanup() {
    if (B._kanbanTouch.timer) { clearTimeout(B._kanbanTouch.timer); }
    if (B._kanbanTouch.rafId) { cancelAnimationFrame(B._kanbanTouch.rafId); }
    if (B._kanbanTouch.clone) { B._kanbanTouch.clone.remove(); }
    if (B._kanbanTouch.card) { B._kanbanTouch.card.classList.remove('is-dragging'); }
    if (B._kanbanTouch.curCol) { B._kanbanTouch.curCol.classList.remove('dg-drop-hover'); }
    B._kanbanTouch.timer = null;
    B._kanbanTouch.rafId = null;
    B._kanbanTouch.active = false;
    B._kanbanTouch.card = null;
    B._kanbanTouch.id = null;
    B._kanbanTouch.clone = null;
    B._kanbanTouch.curCol = null;
    B._kanbanTouch.boardEl = null;
  }

  function _kanbanUpdateDropTarget() {
    var el = document.elementFromPoint(B._kanbanTouch.lastX, B._kanbanTouch.lastY);
    var col = el ? el.closest('.dg-kanban-col-body') : null;
    if (col !== B._kanbanTouch.curCol) {
      if (B._kanbanTouch.curCol) B._kanbanTouch.curCol.classList.remove('dg-drop-hover');
      if (col) col.classList.add('dg-drop-hover');
      B._kanbanTouch.curCol = col;
    }
  }

  function _kanbanAutoScrollTick() {
    if (!B._kanbanTouch.active) { B._kanbanTouch.rafId = null; return; }
    if (B._kanbanTouch.clone) {
      B._kanbanTouch.clone.style.left = (B._kanbanTouch.lastX - B._kanbanTouch.offX) + 'px';
      B._kanbanTouch.clone.style.top = (B._kanbanTouch.lastY - B._kanbanTouch.offY) + 'px';
    }
    var board = B._kanbanTouch.boardEl;
    if (board) {
      var rect = board.getBoundingClientRect();
      var x = B._kanbanTouch.lastX;
      if (x < rect.left + KANBAN_SCROLL_EDGE) {
        var distL = (rect.left + KANBAN_SCROLL_EDGE - x) / KANBAN_SCROLL_EDGE;
        board.scrollLeft -= KANBAN_SCROLL_SPEED * Math.min(1, distL);
      } else if (x > rect.right - KANBAN_SCROLL_EDGE) {
        var distR = (x - (rect.right - KANBAN_SCROLL_EDGE)) / KANBAN_SCROLL_EDGE;
        board.scrollLeft += KANBAN_SCROLL_SPEED * Math.min(1, distR);
      }
    }
    _kanbanUpdateDropTarget();
    B._kanbanTouch.rafId = requestAnimationFrame(_kanbanAutoScrollTick);
  }

  function _bindKanbanCardTouch(card) {
    card.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      B._kanbanTouch.startX = t.clientX;
      B._kanbanTouch.startY = t.clientY;
      B._kanbanTouch.lastX = t.clientX;
      B._kanbanTouch.lastY = t.clientY;
      B._kanbanTouch.card = card;
      B._kanbanTouch.id = card.dataset.id;
      B._kanbanTouch.active = false;
      B._kanbanTouch.moved = false;
      B._kanbanTouch.timer = setTimeout(function () {
        B._kanbanTouch.active = true;
        card.classList.add('is-dragging');
        B._kanbanTouch.boardEl = card.closest('.dg-kanban');
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
        B._kanbanTouch.clone = clone;
        B._kanbanTouch.offX = t.clientX - rect.left;
        B._kanbanTouch.offY = t.clientY - rect.top;
        if (navigator.vibrate) navigator.vibrate(10);
        B._kanbanTouch.rafId = requestAnimationFrame(_kanbanAutoScrollTick);
      }, 300);
    }, { passive: true });

    card.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!B._kanbanTouch.active) {
        var dx = Math.abs(t.clientX - B._kanbanTouch.startX);
        var dy = Math.abs(t.clientY - B._kanbanTouch.startY);
        if (dx > 10 || dy > 10) { clearTimeout(B._kanbanTouch.timer); B._kanbanTouch.timer = null; }
        return;
      }
      e.preventDefault();
      B._kanbanTouch.moved = true;
      B._kanbanTouch.lastX = t.clientX;
      B._kanbanTouch.lastY = t.clientY;
    }, { passive: false });

    card.addEventListener('touchend', function () {
      clearTimeout(B._kanbanTouch.timer);
      B._kanbanTouch.timer = null;
      var wasActive = B._kanbanTouch.active;
      var id = B._kanbanTouch.id;
      var col = B._kanbanTouch.curCol;
      _kanbanTouchCleanup();
      if (wasActive && col) {
        var stato = col.closest('.dg-kanban-col').dataset.stato;
        _changeStato(id, stato);
      }
    });

    card.addEventListener('touchcancel', function () { _kanbanTouchCleanup(); });
  }

  function _changeStato(id, novoStato) {
    var s = B._sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s || s.stato === novoStato) return;
    var old = Object.assign({}, s);
    var patch = { stato: novoStato };
    if (novoStato === 'chiuso' && !s.importoConfermato) patch.importoConfermato = s.importoStimato || 0;
    Object.assign(s, patch);
    _renderKanban(); B._renderStatCards(); B._renderCharts();
    var az = B._aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    db.collection('sponsorizzazioni').doc(id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { return _syncSponsorIva(s); })
      .then(function () { B._renderSpese(); B._renderBilancio(); })
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
    var s = B._sponsorizzazioni.find(function (x) { return x.id === sponsorId; });
    if (!s) return;
    B._curSponsorId = sponsorId;
    B._curAziendaId = s.aziendaId;
    B._trancheEditingId = null;
    var az = B._aziendaById(B._curAziendaId);
    document.getElementById('drawerAziendaNome').textContent = az ? az.ragioneSociale : '—';
    document.getElementById('drawerStoricoBadge').classList.toggle('is-hidden', !B._isStorico(B._curAziendaId));
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
    var a = B._aziendaById(B._curAziendaId) || {};
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
    var a = B._aziendaById(B._curAziendaId);
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
    var a = B._aziendaById(B._curAziendaId);
    if (!a) return;
    var hasSponsorizzazioni = B._sponsorizzazioni.some(function (x) { return x.aziendaId === a.id; });
    if (hasSponsorizzazioni) {
      alert('Questa azienda ha ancora sponsorizzazioni collegate (anche di stagioni passate). Elimina prima quelle dal tab "Sponsorizzazione", poi l\'azienda.');
      return;
    }
    confirm('Eliminare definitivamente l\'azienda "' + a.ragioneSociale + '"? L\'operazione non è reversibile.', function () {
      db.collection('aziende').doc(a.id).delete()
        .then(function () { return _logWrite('azienda', a.id, 'Azienda — ' + a.ragioneSociale, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          B._aziende = B._aziende.filter(function (x) { return x.id !== a.id; });
          _closeDrawer();
          _renderKanban();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabDeal() {
    var s = B._sponsorizzazioni.find(function (x) { return x.id === B._curSponsorId; });
    if (!s) return '';
    var respOptions = B._dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === s.dirigenteResponsabileId ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
    var statoOptions = B.STATI.map(function (st) {
      return '<option value="' + st + '"' + (st === s.stato ? ' selected' : '') + '>' + B._statoLabel(st) + '</option>';
    }).join('');
    var tipoOptions = ['denaro', 'servizi', 'materiale'].map(function (t) {
      return '<option value="' + t + '"' + (t === s.tipologia ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
    return '<div class="dg-form-group"><label class="dg-form-label">Stato</label><select id="dgDealStato" class="dg-form-input">' + statoOptions + '</select></div>' +
      '<div class="dg-form-grid">' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo stimato (€)</label><input type="number" id="dgDealStimato" class="dg-form-input" value="' + (s.importoStimato || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Probabilità chiusura</label><input type="number" id="dgDealProb" class="dg-form-input" min="0" max="1" step="0.05" value="' + (s.probabilitaChiusura || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo confermato (€, IVA compresa)</label><input type="number" id="dgDealConfermato" class="dg-form-input" value="' + (s.importoConfermato || 0) + '" oninput="DG.dealIvaHint()"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">IVA compresa nell\'importo (%)</label><input type="number" id="dgDealIvaIncl" class="dg-form-input" min="0" max="100" step="0.5" placeholder="es. 22 (vuoto = nessuna)" value="' + (+s.ivaInclusaPct || '') + '" oninput="DG.dealIvaHint()"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">IVA da versare (% sull\'imponibile)</label><input type="number" id="dgDealIvaVers" class="dg-form-input" min="0" max="100" step="0.5" placeholder="11" value="' + (s.ivaVersarePct === '' || s.ivaVersarePct == null ? '' : s.ivaVersarePct) + '" oninput="DG.dealIvaHint()"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">IVA da versare: importo fisso (€)</label><input type="number" id="dgDealIvaFisso" class="dg-form-input" min="0" step="0.01" placeholder="vuoto = usa la %" value="' + (+s.ivaVersareFisso || '') + '" oninput="DG.dealIvaHint()"></div>' +
      '<div class="dg-form-group" style="grid-column:1/-1"><span class="dg-muted" id="dgDealIvaHint" style="font-size:12.5px">' + esc(_ivaHintTesto(+s.importoConfermato || 0, s)) + '</span></div>' +
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

  /* Riga di spiegazione sotto i campi IVA: imponibile, IVA contenuta e quanta se ne versa. */
  function _ivaHintTesto(tot, s) {
    if (!(tot > 0)) return '';
    var c = _sponsorIvaCalc(tot, s);
    return (c.ivaInclusa > 0 ? 'Imponibile €' + c.imponibile.toLocaleString('it-IT') + ' + IVA €' + c.ivaInclusa.toLocaleString('it-IT') + ' = €' + tot.toLocaleString('it-IT') + '. ' : '') +
      'IVA da versare: €' + c.daVersare.toLocaleString('it-IT') + (c.fisso > 0 ? ' (importo fisso, pari al ' : ' (') + c.versarePct.toLocaleString('it-IT') + '% dell\'imponibile), nelle Spese come voce «IVA <azienda>».';
  }
  DG.dealIvaHint = function () {
    var el = document.getElementById('dgDealIvaHint');
    if (el) el.textContent = _ivaHintTesto(+val('dgDealConfermato') || 0, { ivaInclusaPct: val('dgDealIvaIncl'), ivaVersarePct: val('dgDealIvaVers'), ivaVersareFisso: val('dgDealIvaFisso') });
  };

  DG.saveDeal = function () {
    var s = B._sponsorizzazioni.find(function (x) { return x.id === B._curSponsorId; });
    if (!s) return;
    var old = Object.assign({}, s);
    var patch = {
      stato: val('dgDealStato'),
      importoStimato: +val('dgDealStimato') || 0,
      probabilitaChiusura: +val('dgDealProb') || 0,
      importoConfermato: +val('dgDealConfermato') || 0,
      ivaInclusaPct: +val('dgDealIvaIncl') || 0,
      ivaVersarePct: val('dgDealIvaVers') === '' ? '' : (+val('dgDealIvaVers') || 0),
      ivaVersareFisso: +val('dgDealIvaFisso') || 0,
      tipologia: val('dgDealTipologia'),
      dataFirma: val('dgDealFirma'),
      scadenza: val('dgDealScadenza'),
      modalitaPagamento: val('dgDealPagamento'),
      dirigenteResponsabileId: val('dgDealResponsabile'),
      contropartite: val('dgDealContropartite')
    };
    Object.assign(s, patch);
    var az = B._aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    db.collection('sponsorizzazioni').doc(s.id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { return _syncSponsorIva(s); })
      .then(function () { _renderKanban(); B._renderStatCards(); B._renderCharts(); _refreshAccordionSection('deal'); B._renderSpese(); B._renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabNote() {
    var s = B._sponsorizzazioni.find(function (x) { return x.id === B._curSponsorId; });
    if (!s) return '';
    return '<div class="dg-form-group"><textarea id="dgNoteText" class="dg-form-input dg-form-textarea" rows="5" placeholder="Nota su questa sponsorizzazione...">' + esc(s.note || '') + '</textarea></div>' +
      '<div class="dg-form-actions" style="justify-content:flex-end">' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveNote()">Salva nota</button>' +
      '</div>';
  }

  DG.saveNote = function () {
    var s = B._sponsorizzazioni.find(function (x) { return x.id === B._curSponsorId; });
    if (!s) return;
    var old = Object.assign({}, s);
    var patch = { note: val('dgNoteText') };
    Object.assign(s, patch);
    var az = B._aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    db.collection('sponsorizzazioni').doc(s.id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { _renderKanban(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteDeal = function () {
    var s = B._sponsorizzazioni.find(function (x) { return x.id === B._curSponsorId; });
    if (!s) return;
    var az = B._aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    confirm('Eliminare definitivamente "' + label + '"? L\'operazione non è reversibile.', function () {
      var figlia = s.ivaVoceSpesaId ? B._vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; }) : null;
      db.collection('sponsorizzazioni').doc(s.id).delete()
        .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () {
          B._sponsorizzazioni = B._sponsorizzazioni.filter(function (x) { return x.id !== s.id; });
          if (figlia) B._vociSpesa = B._vociSpesa.filter(function (x) { return x.id !== figlia.id; });
          _closeDrawer();
          _renderKanban(); B._renderStatCards(); B._renderCharts(); B._renderSpese(); B._renderBilancio();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- TRANCHE DI PAGAMENTO — tracciamento incassi reali di uno sponsor chiuso ---- */
  function _tabPagamenti() {
    var s = B._sponsorizzazioni.find(function (x) { return x.id === B._curSponsorId; });
    if (!s) return '';
    var items = _trancheOf(B._curSponsorId).sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; });

    var totale = +s.importoConfermato || 0;
    var pianificato = items.reduce(function (sum, t) { return sum + (+t.importo || 0); }, 0);
    var incassato = items.reduce(function (sum, t) { return sum + (t.pagato ? (+t.importo || 0) : 0); }, 0);
    var residuo = totale - pianificato;

    var intro = s.stato !== 'chiuso'
      ? '<p class="dg-muted" style="margin-bottom:14px">Lo sponsor non è ancora "Chiuso": le tranche restano comunque salvate, ma contano nel Saldo/Entrate confermate solo quando lo stato passa a Chiuso.</p>'
      : '';

    var summary = '<div class="dg-card" style="margin-bottom:14px;padding:14px 16px">' +
      '<div class="dg-toolbar" style="gap:16px">' +
      '<div><div class="dg-stat-label">Importo confermato</div><div class="dg-card-title">€' + totale.toLocaleString('it-IT') + '</div>' + (_sponsorIvaCalc(totale, s).ivaInclusa > 0 ? '<div class="dg-muted" style="font-size:12px">' + esc(_ivaInclusaTesto(totale, s).trim()) + '</div>' : '') + '</div>' +
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
      if (t.id === B._trancheEditingId) {
        return '<div class="dg-reminder-item" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px">' +
          '<div class="dg-form-grid">' +
          '<div class="dg-form-group"><label class="dg-form-label">Importo (€)</label><input type="number" id="dgTrancheEditImporto" class="dg-form-input" min="0" step="50" value="' + Number(t.importo || 0) + '"></div>' +
          '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgTrancheEditScadenza" class="dg-form-input" value="' + esc(t.scadenza || '') + '"></div>' +
          (t.pagato ? '<div class="dg-form-group"><label class="dg-form-label">Data incasso</label><input type="date" id="dgTrancheEditDataIncasso" class="dg-form-input" value="' + esc(t.dataIncasso || '') + '"></div>' : '') +
          '</div>' +
          '<div class="dg-form-group"><label class="dg-form-label">Note</label><input type="text" id="dgTrancheEditNote" class="dg-form-input" value="' + esc(t.note || '') + '"></div>' +
          '<div class="dg-form-actions" style="margin-top:0">' +
          '<button class="dg-btn-ghost dg-btn-sm" onclick="DG.editTrancheCancel()">Annulla</button>' +
          '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveTranche(\'' + t.id + '\')">Salva</button>' +
          '</div></div>';
      }
      return '<div class="dg-reminder-item" style="cursor:default">' +
        '<label class="dg-check"><input type="checkbox" ' + (t.pagato ? 'checked' : '') + ' onchange="DG.toggleTranchePagata(\'' + t.id + '\', this.checked)">' +
        '<span><div class="dg-reminder-azienda">€' + Number(t.importo || 0).toLocaleString('it-IT') + (t.pagato ? ' — pagata' + (t.dataIncasso ? ' il ' + _fmtDate(t.dataIncasso) : '') : ' — da pagare') + '</div>' +
        '<div class="dg-reminder-desc">Scadenza: ' + _fmtDate(t.scadenza) + (t.pagato && !t.dataIncasso ? ' · data incasso non indicata (nel Bilancio conta alla scadenza: modificala con la matita)' : '') + (t.note ? ' · ' + esc(t.note) : '') + '</div></span></label>' +
        '<div style="display:flex;gap:4px;flex-shrink:0">' +
        '<button class="dg-btn-icon-only" title="Modifica" onclick="DG.editTrancheStart(\'' + t.id + '\')">' + EDIT_ICON_SM + '</button>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteTranche(\'' + t.id + '\')">' + B._delIconSm() + '</button>' +
        '</div></div>';
    }).join('') : '<p class="dg-muted">Nessuna tranche pianificata: l\'importo confermato conta per intero nel saldo.</p>';

    return intro + summary +
      '<div style="display:flex;flex-direction:column;gap:8px">' + list + '</div>' +
      '<div class="dg-form-grid" style="margin-top:18px">' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo (€)</label><input type="number" id="dgTrancheImporto" class="dg-form-input" min="0" step="50"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgTrancheScadenza" class="dg-form-input" value="' + B._todayISO() + '"></div>' +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Note</label><input type="text" id="dgTrancheNote" class="dg-form-input" placeholder="es. Acconto alla firma"></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addTranche()">Aggiungi tranche</button></div>';
  }

  DG.addTranche = function () {
    var importo = +val('dgTrancheImporto') || 0;
    var scadenza = val('dgTrancheScadenza');
    if (!importo || !scadenza) { alert('Importo e scadenza sono obbligatori.'); return; }
    var data = {
      sponsorizzazioneId: B._curSponsorId, importo: importo, scadenza: scadenza,
      note: val('dgTrancheNote').trim(), pagato: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('tranchePagamento').doc();
    var az = B._aziendaById(B._curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      B._tranche.push(data);
      return _logWrite('tranchePagamento', ref.id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('pagamenti'); B._renderStatCards(); B._renderCharts(); B._renderCashflow(); B._renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.editTrancheStart = function (id) {
    B._trancheEditingId = id;
    _refreshAccordionSection('pagamenti');
  };

  DG.editTrancheCancel = function () {
    B._trancheEditingId = null;
    _refreshAccordionSection('pagamenti');
  };

  DG.saveTranche = function (id) {
    var t = B._tranche.find(function (x) { return x.id === id; });
    if (!t) return;
    var importo = +val('dgTrancheEditImporto') || 0;
    var scadenza = val('dgTrancheEditScadenza');
    if (!importo || !scadenza) { alert('Importo e scadenza sono obbligatori.'); return; }
    var patch = { importo: importo, scadenza: scadenza, note: val('dgTrancheEditNote').trim() };
    var old = { importo: t.importo, scadenza: t.scadenza, note: t.note };
    if (t.pagato) {   /* data in cui i soldi sono arrivati davvero: decide il mese nel Bilancio; se si svuota il campo vale oggi */
      patch.dataIncasso = val('dgTrancheEditDataIncasso') || B._todayISO();
      old.dataIncasso = t.dataIncasso || '';
    }
    var az = B._aziendaById(B._curAziendaId);
    var s = B._sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
    Object.assign(t, patch);
    db.collection('tranchePagamento').doc(id).update(patch)
      .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { return (t.pagato && s) ? _syncSponsorIva(s) : null; })
      .then(function () {
        B._trancheEditingId = null;
        _refreshAccordionSection('pagamenti'); B._renderStatCards(); B._renderCharts(); B._renderCashflow(); B._renderBilancio(); B._renderSpese();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* Voce di spesa "IVA <azienda>" collegata a uno sponsor (s.ivaVoceSpesaId): il preventivato
     scatta all'11% dell'importoConfermato appena lo stato passa a "chiuso" (anche prima di
     incassare), il sostenuto è l'11% delle sole tranche già segnate pagate. Si aggiorna ad ogni
     cambio di stato/importo/tranche invece di generare righe nuove, e si rimuove da sola se
     preventivato e sostenuto tornano entrambi a zero (es. lo stato torna indietro da "chiuso"). */
  function _syncSponsorIva(s) {
    var preventivato = s.stato === 'chiuso' ? _sponsorIvaCalc(s.importoConfermato, s).daVersare : 0;
    var pagate = _trancheOf(s.id).filter(function (t) { return t.pagato; });
    var incassato = pagate.reduce(function (sum, t) { return sum + (+t.importo || 0); }, 0);
    var sostenuto = _sponsorIvaCalc(incassato, s).daVersare;
    var aliquotaVersata = _sponsorIvaCalc(0, s).versarePct;
    var figlia = s.ivaVoceSpesaId ? B._vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; }) : null;
    var az = B._aziendaById(s.aziendaId);
    var nome = ('IVA ' + (az ? az.ragioneSociale : '')).trim();

    if (preventivato <= 0 && sostenuto <= 0) {
      if (!figlia) return Promise.resolve();
      return db.collection('vociSpesa').doc(figlia.id).delete()
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return db.collection('sponsorizzazioni').doc(s.id).update({ ivaVoceSpesaId: '' }); })
        .then(function () {
          B._vociSpesa = B._vociSpesa.filter(function (x) { return x.id !== figlia.id; });
          s.ivaVoceSpesaId = '';
        });
    }

    if (figlia) {
      var old = { categoria: figlia.categoria, importoPreventivato: figlia.importoPreventivato, importoSostenuto: figlia.importoSostenuto, ivaAliquota: figlia.ivaAliquota };
      var patch = { categoria: nome, importoPreventivato: preventivato, importoSostenuto: sostenuto, ivaAliquota: aliquotaVersata };
      return db.collection('vociSpesa').doc(figlia.id).update(patch)
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + nome, 'update', _diff(old, patch, Object.keys(patch))); })
        .then(function () { Object.assign(figlia, patch); });
    }

    var data = {
      seasonId: s.seasonId, categoria: nome, categoriaSpesaId: '',
      importoPreventivato: preventivato, importoSostenuto: sostenuto, ivaAliquota: aliquotaVersata, dataSpesa: '',
      note: 'IVA ' + aliquotaVersata + '% generata automaticamente sullo sponsor "' + nome.replace(/^IVA /, '') + '" (preventivo alla chiusura, saldo sulle tranche incassate)',
      isIva: true, pagata: false, ivaEscluso: false, ivaTrimestre: '', ivaScadenza: '', ivaScadenzaManuale: false
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      B._vociSpesa.push(data);
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
    var candidati = B._sponsorizzazioni.filter(function (s) { return s.seasonId === B._currentSeasonId && s.stato === 'chiuso'; });
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
          var v = B._vociSpesa.find(function (x) { return x.id === voceId; });
          if (!v) return null;
          return db.collection('vociSpesa').doc(v.id).delete()
            .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
            .then(function () { B._vociSpesa = B._vociSpesa.filter(function (x) { return x.id !== v.id; }); });
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
        B._renderSpese(); B._renderBilancio(); _renderKanban();
        alert('IVA ricalcolata per ' + candidati.length + ' sponsor.');
      }).catch(function (e) { alert('Errore durante il ricalcolo: ' + e.message); });
    });
  };

  DG.toggleTranchePagata = function (id, checked) {
    var t = B._tranche.find(function (x) { return x.id === id; });
    if (!t) return;
    /* segnata pagata: la data d'incasso è oggi (modificabile); tolta la spunta, la data si cancella */
    var old = { pagato: !!t.pagato, dataIncasso: t.dataIncasso || '' };
    var patch = { pagato: checked, dataIncasso: checked ? (t.dataIncasso || B._todayISO()) : '' };
    Object.assign(t, patch);
    var az = B._aziendaById(B._curAziendaId);
    var s = B._sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
    db.collection('tranchePagamento').doc(id).update(patch)
      .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'update', _diff(old, patch, ['pagato', 'dataIncasso'])); })
      .then(function () { return s ? _syncSponsorIva(s) : null; })
      .then(function () { _refreshAccordionSection('pagamenti'); B._renderStatCards(); B._renderCharts(); B._renderCashflow(); B._renderBilancio(); B._renderSpese(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteTranche = function (id) {
    confirm('Eliminare questa tranche?', function () {
      var t = B._tranche.find(function (x) { return x.id === id; });
      var s = t ? B._sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; }) : null;
      var az = B._aziendaById(B._curAziendaId);
      db.collection('tranchePagamento').doc(id).delete()
        .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          B._tranche = B._tranche.filter(function (x) { return x.id !== id; });
          return (t && t.pagato && s) ? _syncSponsorIva(s) : null;
        })
        .then(function () {
          _refreshAccordionSection('pagamenti'); B._renderStatCards(); B._renderCharts(); B._renderCashflow(); B._renderBilancio(); B._renderSpese();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabTimeline() {
    var items = B._attivita.filter(function (a) { return a.sponsorizzazioneId === B._curSponsorId; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var list = items.length ? '<div class="dg-timeline">' + items.map(function (a) {
      return '<div class="dg-timeline-item"><span class="dg-timeline-dot"></span>' +
        '<div class="dg-timeline-content"><div>' + B._tipoLabel(a.tipo) + ' — ' + esc(a.descrizione || '') + '</div>' +
        '<div class="dg-timeline-meta">' + _fmtDate(a.data) + ' · ' + esc(a.dirigenteNome || '') + '</div></div></div>';
    }).join('') + '</div>' : '<p class="dg-muted">Nessuna attività registrata.</p>';

    var tipoOptions = ['chiamata', 'email', 'incontro', 'nota'].map(function (t) { return '<option value="' + t + '">' + B._tipoLabel(t) + '</option>'; }).join('');

    return list +
      '<div class="dg-form-group" style="margin-top:18px"><label class="dg-form-label">Tipo</label><select id="dgAttTipo" class="dg-form-input">' + tipoOptions + '</select></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Data</label><input type="date" id="dgAttData" class="dg-form-input" value="' + B._todayISO() + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Descrizione</label><textarea id="dgAttDesc" class="dg-form-input dg-form-textarea" rows="2" placeholder="Cosa è stato detto/fatto..."></textarea></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addAttivita()">Aggiungi</button></div>';
  }

  DG.addAttivita = function () {
    var desc = val('dgAttDesc').trim();
    if (!desc) { alert('Inserisci una descrizione.'); return; }
    var data = {
      sponsorizzazioneId: B._curSponsorId, tipo: val('dgAttTipo'), data: val('dgAttData'),
      dirigenteId: A.uid(), dirigenteNome: A.dirigenteNome(), descrizione: desc, createdAt: new Date().toISOString()
    };
    var ref = db.collection('attivita').doc();
    var az = B._aziendaById(B._curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      B._attivita.unshift(data);
      return _logWrite('attivita', ref.id, 'Attività — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('timeline'); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabPromemoria() {
    var items = B._promemoria.filter(function (p) { return p.sponsorizzazioneId === B._curSponsorId; })
      .sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    var list = items.length ? items.map(function (p) {
      var resp = B._dirigentiList.find(function (d) { return d.id === p.dirigenteAssegnatoId; });
      return '<div class="dg-reminder-item" style="cursor:default">' +
        '<label class="dg-check" style="align-items:flex-start"><input type="checkbox" ' + (p.completato ? 'checked' : '') + ' onchange="DG.toggleReminder(\'' + p.id + '\', this.checked)">' +
        '<span><div class="dg-reminder-desc" style="color:var(--dg-text);font-weight:600">' + esc(p.descrizione || '') + '</div>' +
        '<div class="dg-reminder-desc">Scadenza: ' + _fmtDate(p.dataScadenza) + ' · ' + esc(resp ? (resp.nome + ' ' + resp.cognome) : '—') + '</div></span></label>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteReminder(\'' + p.id + '\')">' + B._delIconSm() + '</button></div>';
    }).join('') : '<p class="dg-muted">Nessun promemoria.</p>';

    var respOptions = B._dirigentiList.map(function (d) {
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
      sponsorizzazioneId: B._curSponsorId, dataScadenza: scad, descrizione: desc,
      dirigenteAssegnatoId: val('dgPromAssegnato'), completato: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('promemoria').doc();
    var az = B._aziendaById(B._curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      B._promemoria.unshift(data);
      return _logWrite('promemoria', ref.id, 'Promemoria — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('promemoria'); B._renderPromemoriaWidget(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.toggleReminder = function (id, checked) {
    var p = B._promemoria.find(function (x) { return x.id === id; });
    if (!p) return;
    var old = { completato: !!p.completato };
    p.completato = checked;
    db.collection('promemoria').doc(id).update({ completato: checked })
      .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'update', _diff(old, { completato: checked }, ['completato'])); })
      .then(function () { B._renderPromemoriaWidget(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteReminder = function (id) {
    confirm('Eliminare questo promemoria?', function () {
      db.collection('promemoria').doc(id).delete()
        .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          B._promemoria = B._promemoria.filter(function (x) { return x.id !== id; });
          _refreshAccordionSection('promemoria'); B._renderPromemoriaWidget();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabStorico() {
    var items = B._sponsorizzazioni.filter(function (s) { return s.aziendaId === B._curAziendaId; })
      .sort(function (a, b) { return a.seasonId === b.seasonId ? 0 : (a.seasonId < b.seasonId ? 1 : -1); });
    if (!items.length) return '<p class="dg-muted">Nessuno storico disponibile.</p>';
    return '<div class="dg-timeline">' + items.map(function (s) {
      var season = B._seasons.find(function (x) { return x.id === s.seasonId; });
      var importo = s.stato === 'chiuso' ? s.importoConfermato : s.importoStimato;
      return '<div class="dg-timeline-item"><span class="dg-timeline-dot" style="background:' + B._statoColor(s.stato) + '"></span>' +
        '<div class="dg-timeline-content"><div><strong>' + esc(season ? season.nome : '—') + '</strong> — ' + B._statoLabel(s.stato) + ' — €' + Number(importo || 0).toLocaleString('it-IT') + '</div></div></div>';
    }).join('') + '</div>';
  }

  /* ---- Esportato per gli altri file del Budget ---- */
  B._bindKanbanCardTouch = _bindKanbanCardTouch;
  B._changeStato = _changeStato;
  B._closeDrawer = _closeDrawer;
  B._openDrawer = _openDrawer;
  B._renderKanban = _renderKanban;
  B._sponsorDaIncassare = _sponsorDaIncassare;
  B._sponsorIncassato = _sponsorIncassato;
  B._syncSponsorIva = _syncSponsorIva;

})();
