/* Victor Volley — Admin: Bacheca (kanban Da fare · In corso · Fatta).
   Estratto da admin.js. Dipende da window.Admin; espone window.Admin.bacheca. */
(function () {
  'use strict';
  var A = window.Admin;
  var esc = A.esc, confirm = A.confirm, setTopbarBtn = A.setTopbarBtn;
  var _mapDoc = A.mapDoc, _diff = A.diff, _logWrite = A.logWrite;
  var _openBudgetModal = A.openModal, _closeBudgetModal = A.closeModal;

  /* ================================================
     BACHECA — kanban (Da fare · In corso · Fatta)
     Dati privati dell'Area Dirigenti, stesso pattern di pianoEditoriale:
     caricamento lazy on-demand, scrittura diretta su Firestore.
  ================================================ */
  var _kbItems     = [];
  var _kbLoaded    = false;
  var _kbEditing   = null;
  var _kbDirigenti = null;
  var _kbDragId    = null;

  var KB_COLUMNS = [
    { key: 'daFare',  label: 'Da fare' },
    { key: 'inCorso', label: 'In corso' },
    { key: 'fatta',   label: 'Fatta' }
  ];

  var KB_PRIORITA_ORDER = { alta: 0, media: 1, bassa: 2 };
  var KB_PRIORITA_LABEL = { alta: 'Alta', media: 'Media', bassa: 'Bassa' };

  function _loadBacheca(cb) {
    if (_kbLoaded) { cb(); return; }
    db.collection('bacheca').get().then(function (snap) {
      _kbItems = snap.docs.map(_mapDoc);
      _kbLoaded = true;
      cb();
    }).catch(function (e) {
      console.error('[bacheca] load', e);
      _kbLoaded = true;
      cb();
    });
  }

  function _loadKbDirigenti(cb) {
    if (_kbDirigenti) { cb(); return; }
    db.collection('dirigenti').get().then(function (snap) {
      _kbDirigenti = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
      cb();
    }).catch(function (e) {
      console.error('[bacheca] dirigenti', e);
      _kbDirigenti = [];
      cb();
    });
  }

  function renderBacheca() {
    _loadBacheca(function () {
      setTopbarBtn('Nuova attività', function () { _openKbModal(null, 'daFare'); });
      _renderKbBoard();
    });
  }

  function _kbFmtDate(ymd) {
    if (!ymd) return '';
    var p = ymd.split('-');
    return p[2] + '/' + p[1];
  }

  function _renderKbBoard() {
    var todayYmd = new Date().toISOString().slice(0, 10);
    var html = KB_COLUMNS.map(function (col, colIdx) {
      var items = _kbItems.filter(function (it) { return (it.stato || 'daFare') === col.key; })
        .sort(function (a, b) {
          var pa = KB_PRIORITA_ORDER[a.priorita] != null ? KB_PRIORITA_ORDER[a.priorita] : 1;
          var pb = KB_PRIORITA_ORDER[b.priorita] != null ? KB_PRIORITA_ORDER[b.priorita] : 1;
          if (pa !== pb) return pa - pb;
          if (a.scadenza && b.scadenza) return a.scadenza < b.scadenza ? -1 : 1;
          if (a.scadenza) return -1;
          if (b.scadenza) return 1;
          return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
        });

      var cards = items.map(function (it) {
        var late = it.scadenza && it.scadenza < todayYmd && col.key !== 'fatta';
        var priorita = it.priorita || 'media';
        return '<div class="kb-card kb-card--' + priorita + '" draggable="true" data-id="' + esc(it.id) + '">' +
          '<div class="kb-card-title">' + esc(it.titolo) + '</div>' +
          (it.creatoDa ? '<div class="kb-card-creator">Creata da ' + esc(it.creatoDa) + '</div>' : '') +
          '<div class="kb-card-meta">' +
            '<span class="kb-card-priorita kb-card-priorita--' + priorita + '">' + KB_PRIORITA_LABEL[priorita] + '</span>' +
            (it.responsabile ? '<span class="kb-card-resp">Assegnata a ' + esc(it.responsabile) + '</span>' : '') +
            (it.scadenza ? '<span class="kb-card-due' + (late ? ' kb-card-due--late' : '') + '">' + _kbFmtDate(it.scadenza) + '</span>' : '') +
          '</div>' +
          '<div class="kb-card-actions">' +
            '<button type="button" class="kb-card-move" data-id="' + esc(it.id) + '" data-dir="-1"' + (colIdx === 0 ? ' disabled' : '') + ' title="Sposta indietro">&lsaquo;</button>' +
            '<button type="button" class="kb-card-move" data-id="' + esc(it.id) + '" data-dir="1"' + (colIdx === KB_COLUMNS.length - 1 ? ' disabled' : '') + ' title="Sposta avanti">&rsaquo;</button>' +
          '</div>' +
        '</div>';
      }).join('') || '<div class="kb-col-empty">Nessuna attività</div>';

      return '<div class="kb-col" data-stato="' + col.key + '">' +
        '<div class="kb-col-head">' +
          '<span class="kb-col-dot"></span>' +
          '<span class="kb-col-title">' + col.label + '</span>' +
          '<span class="kb-col-count">' + items.length + '</span>' +
          '<button type="button" class="kb-col-add" data-stato="' + col.key + '" title="Nuova attività">+</button>' +
        '</div>' +
        '<div class="kb-col-body" data-stato="' + col.key + '">' + cards + '</div>' +
      '</div>';
    }).join('');

    document.getElementById('kbBoard').innerHTML = html;
    _wireKbBoard();
  }

  function _wireKbBoard() {
    var board = document.getElementById('kbBoard');

    board.querySelectorAll('.kb-col-add').forEach(function (btn) {
      btn.addEventListener('click', function () { _openKbModal(null, btn.dataset.stato); });
    });

    board.querySelectorAll('.kb-card-move').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (btn.disabled) return;
        _kbMove(btn.dataset.id, +btn.dataset.dir);
      });
    });

    board.querySelectorAll('.kb-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var item = _kbItems.find(function (x) { return x.id === card.dataset.id; });
        if (item) _openKbModal(item, null);
      });
      card.addEventListener('dragstart', function (e) {
        _kbDragId = card.dataset.id;
        card.classList.add('kb-card--dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function () {
        card.classList.remove('kb-card--dragging');
        _kbDragId = null;
      });
    });

    board.querySelectorAll('.kb-col-body').forEach(function (body) {
      body.addEventListener('dragover', function (e) {
        if (!_kbDragId) return;
        e.preventDefault();
        body.classList.add('kb-col-body--over');
      });
      body.addEventListener('dragleave', function () {
        body.classList.remove('kb-col-body--over');
      });
      body.addEventListener('drop', function (e) {
        e.preventDefault();
        body.classList.remove('kb-col-body--over');
        if (!_kbDragId) return;
        _kbSetStato(_kbDragId, body.dataset.stato);
        _kbDragId = null;
      });
    });
  }

  function _kbMove(id, dir) {
    var item = _kbItems.find(function (x) { return x.id === id; });
    if (!item) return;
    var idx  = KB_COLUMNS.findIndex(function (c) { return c.key === (item.stato || 'daFare'); });
    var next = KB_COLUMNS[idx + dir];
    if (!next) return;
    _kbSetStato(id, next.key);
  }

  function _kbSetStato(id, stato) {
    var item = _kbItems.find(function (x) { return x.id === id; });
    if (!item || item.stato === stato) return;
    var beforeStato = item.stato;
    item.stato = stato;
    _renderKbBoard();
    db.collection('bacheca').doc(id).update({ stato: stato }).then(function () {
      return _logWrite('bacheca', id, 'Bacheca — ' + item.titolo, 'update', [{ campo: 'stato', prima: beforeStato || null, dopo: stato }]);
    }).catch(function (e) {
      console.error('[bacheca] move', e);
      alert('Errore nello spostamento. Riprova.');
      item.stato = beforeStato;
      _renderKbBoard();
    });
  }

  function _renderKbResponsabileSelect(selected) {
    var sel = document.getElementById('kbResponsabile');
    sel.innerHTML = '<option value="">— Nessuno —</option>' +
      _kbDirigenti.map(function (d) {
        var nome = ((d.nome || '') + ' ' + (d.cognome || '')).trim() || d.email || d.uid;
        return '<option value="' + esc(nome) + '">' + esc(nome) + '</option>';
      }).join('');
    sel.value = selected || '';
  }

  function _openKbModal(item, presetStato) {
    _kbEditing = item;
    document.getElementById('kbModalTitle').textContent = item ? 'Modifica attività' : 'Nuova attività';
    document.getElementById('kbTitolo').value       = item ? (item.titolo || '') : '';
    document.getElementById('kbDescrizione').value  = item ? (item.descrizione || '') : '';
    document.getElementById('kbStato').value        = item ? (item.stato || 'daFare') : (presetStato || 'daFare');
    document.getElementById('kbPriorita').value      = item ? (item.priorita || 'media') : 'media';
    document.getElementById('kbScadenza').value     = item ? (item.scadenza || '') : '';
    document.getElementById('kbDelete').classList.toggle('is-hidden', !item);
    var creatoInfo = document.getElementById('kbCreatoInfo');
    if (item && item.creatoDa) {
      creatoInfo.textContent = 'Creata da ' + item.creatoDa + (item.createdAt ? ' il ' + new Date(item.createdAt).toLocaleDateString('it-IT') : '');
      creatoInfo.classList.remove('is-hidden');
    } else {
      creatoInfo.classList.add('is-hidden');
    }
    _loadKbDirigenti(function () { _renderKbResponsabileSelect(item ? item.responsabile : ''); });
    _openBudgetModal('kbModal');
  }

  document.getElementById('kbModalClose').addEventListener('click', function () { _closeBudgetModal('kbModal'); });
  document.getElementById('kbCancel').addEventListener('click', function () { _closeBudgetModal('kbModal'); });

  document.getElementById('kbSave').addEventListener('click', function () {
    var titolo = document.getElementById('kbTitolo').value.trim();
    if (!titolo) { alert('Il titolo è obbligatorio.'); return; }

    var before = _kbEditing;
    var item = {
      titolo:       titolo,
      descrizione:  document.getElementById('kbDescrizione').value.trim(),
      stato:        document.getElementById('kbStato').value,
      priorita:     document.getElementById('kbPriorita').value,
      responsabile: document.getElementById('kbResponsabile').value,
      scadenza:     document.getElementById('kbScadenza').value,
      createdAt:    before ? (before.createdAt || new Date().toISOString()) : new Date().toISOString(),
      creatoDa:     before ? (before.creatoDa || A.dirigenteNome()) : A.dirigenteNome(),
      creatoDaUid:  before ? (before.creatoDaUid || A.uid()) : A.uid()
    };

    var ref = before ? db.collection('bacheca').doc(before.id) : db.collection('bacheca').doc();
    ref.set(item).then(function () {
      var saved = Object.assign({ id: ref.id }, item);
      if (before) _kbItems = _kbItems.map(function (x) { return x.id === ref.id ? saved : x; });
      else        _kbItems.push(saved);
      return _logWrite('bacheca', ref.id, 'Bacheca — ' + titolo,
        before ? 'update' : 'create', _diff(before, saved, Object.keys(item)));
    }).then(function () {
      _closeBudgetModal('kbModal');
      _renderKbBoard();
    }).catch(function (e) {
      console.error('[bacheca] save', e);
      alert('Errore nel salvataggio. Riprova.');
    });
  });

  document.getElementById('kbDelete').addEventListener('click', function () {
    if (!_kbEditing) return;
    var id = _kbEditing.id, titolo = _kbEditing.titolo;
    confirm('Eliminare "' + titolo + '" dalla bacheca?', function () {
      db.collection('bacheca').doc(id).delete().then(function () {
        _kbItems = _kbItems.filter(function (x) { return x.id !== id; });
        return _logWrite('bacheca', id, 'Bacheca — ' + titolo, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).then(function () {
        _closeBudgetModal('kbModal');
        _renderKbBoard();
      }).catch(function (e) {
        console.error('[bacheca] delete', e);
        alert('Errore durante l\'eliminazione. Riprova.');
      });
    });
  });
  /* ---- Interfaccia verso admin.js ---- */
  A.bacheca = { render: renderBacheca };

})();
