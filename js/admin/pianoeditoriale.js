/* Victor Volley — Admin: Piano editoriale (Instagram / Facebook / TikTok / Sito).
   Estratto da admin.js. Dipende da window.Admin; espone window.Admin.pianoEditoriale. */
(function () {
  'use strict';
  var A = window.Admin;
  var esc = A.esc, cap = A.cap, confirm = A.confirm;
  var showSubview = A.showSubview, setTopbarBtn = A.setTopbarBtn, _diff = A.diff;
  var _logWrite = A.logWrite;

  /* ================================================
     PIANO EDITORIALE (Instagram / Facebook / TikTok / Sito)
     Dati privati dell'Area Dirigenti — stesso pattern di attivita/
     promemoria: niente cache pubblica VV.js, caricamento lazy on-demand
     al primo accesso alla sezione, scrittura diretta su Firestore.
  ================================================ */
  var _peItems     = [];
  var _peLoaded    = false;
  var _peEditing   = null;
  var _peDirigenti = null;
  var _peMonthCursor = new Date();
  _peMonthCursor.setDate(1);
  var _pePlatformFilter = { instagram: true, facebook: true, tiktok: true, sito: true };
  var _peSponsorFilter = null;   /* id di uno sponsor: il calendario mostra solo i suoi contenuti */

  var PE_PLATFORMS = [
    { key: 'instagram', label: 'Instagram', chipClass: 'chip--pink'  },
    { key: 'facebook',  label: 'Facebook',  chipClass: 'chip--blue'  },
    { key: 'tiktok',    label: 'TikTok',    chipClass: 'chip--black' },
    { key: 'sito',      label: 'Sito Web',  chipClass: 'chip--green' }
  ];
  var PE_WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  function _peYmd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _loadPianoEditoriale(cb) {
    if (_peLoaded) { cb(); return; }
    db.collection('pianoEditoriale').get().then(function (snap) {
      _peItems = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      _peLoaded = true;
      cb();
    }).catch(function (e) {
      console.error('[pianoEditoriale] load', e);
      _peLoaded = true;
      cb();
    });
  }

  function _loadPeDirigenti(cb) {
    if (_peDirigenti) { cb(); return; }
    db.collection('dirigenti').get().then(function (snap) {
      _peDirigenti = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
      cb();
    }).catch(function (e) {
      console.error('[pianoEditoriale] dirigenti', e);
      _peDirigenti = [];
      cb();
    });
  }

  function renderPianoEditoriale() {
    _loadPianoEditoriale(function () {
      showSubview('pianoEditoriale', 'list');
      setTopbarBtn('Nuovo contenuto', function () { _openPeForm(null, null); });
      _renderPeFilterBox();
      _renderPeGrid();
      _renderPeSponsorPanel();
    });
  }

  /* ---- Sponsor collegati ai contenuti, con contatore ---- */
  var PE_TIER_RANK = { gold: 0, silver: 1, bronze: 2 };
  var PE_TIER_LABEL = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
  /* ordine: più contenuti collegati prima; a parità di contatore, livello e posizione del nastro. exceptId: contenuto da non contare */
  function _peSponsors(exceptId) {
    var conta = {};
    var elenco = (VV.getSponsors() || []).slice();
    elenco.forEach(function (s) { conta[s.id] = _peSponsorCount(s.id, exceptId == null ? null : exceptId); });
    return elenco.sort(function (a, b) {
      if (conta[a.id] !== conta[b.id]) return conta[b.id] - conta[a.id];
      var ta = PE_TIER_RANK[a.livello || 'silver'], tb = PE_TIER_RANK[b.livello || 'silver'];
      return ta !== tb ? ta - tb : (a.order || 0) - (b.order || 0);
    });
  }
  /* quanti contenuti hanno lo sponsor; exceptId esclude il contenuto che si sta modificando */
  function _peSponsorCount(sponsorId, exceptId) {
    return _peItems.filter(function (it) { return it.id !== exceptId && (it.sponsorIds || []).indexOf(sponsorId) !== -1; }).length;
  }

  /* sponsor collegati a un contenuto, nell'ordine dei loghi del sito */
  function _peSponsorsOf(it) {
    var ids = it.sponsorIds || [];
    return ids.length ? (VV.getSponsors() || []).filter(function (s) { return ids.indexOf(s.id) !== -1; }) : [];
  }
  function _peSponsorTitle(it) {
    var l = _peSponsorsOf(it);
    return l.length ? ' — Sponsor: ' + l.map(function (s) { return esc(s.nome); }).join(', ') : '';
  }
  /* logo piccolo a destra: fino a 2, poi «+N» */
  function _peSponsorLogos(it) {
    var l = _peSponsorsOf(it);
    if (!l.length) return '';
    return '<span class="pe-chip-logos">' + l.slice(0, 2).map(function (s) {
      return s.logo ? '<img src="' + esc(s.logo) + '" alt="' + esc(s.nome) + '">' : '<span class="pe-chip-ini">' + esc((s.nome || '?').charAt(0)) + '</span>';
    }).join('') + (l.length > 2 ? '<span class="pe-chip-more">+' + (l.length - 2) + '</span>' : '') + '</span>';
  }

  function _renderPeSponsorPanel() {
    var box = document.getElementById('peSponsorPanel');
    if (!box) return;
    var list = _peSponsors();
    if (!list.length) { box.innerHTML = ''; return; }
    var totale = _peItems.filter(function (it) { return (it.sponsorIds || []).length; }).length;
    box.innerHTML = '<div class="pe-sp-head"><strong>Visibilità per sponsor</strong><span>' + totale + (totale === 1 ? ' contenuto con sponsor' : ' contenuti con sponsor') +
      (_peSponsorFilter != null ? ' · <button type="button" class="pe-sp-reset" id="peSponsorReset">Mostra tutti i contenuti</button>' : ' · clicca uno sponsor per vedere solo i suoi contenuti') + '</span></div>' +
      '<div class="pe-sp-list">' + list.map(function (s) {
        var n = _peSponsorCount(s.id, null);
        var pub = _peItems.filter(function (it) { return it.stato === 'pubblicato' && (it.sponsorIds || []).indexOf(s.id) !== -1; }).length;
        return '<button type="button" class="pe-sp-row' + (_peSponsorFilter === s.id ? ' is-on' : '') + '" data-sp="' + s.id + '" aria-pressed="' + (_peSponsorFilter === s.id) + '">' +
          (s.logo ? '<img src="' + esc(s.logo) + '" alt="" class="pe-sp-logo">' : '<span class="pe-sp-logo pe-sp-logo--no">' + esc((s.nome || '?').charAt(0)) + '</span>') +
          '<span class="pe-sp-nome">' + esc(s.nome) + '<small>' + PE_TIER_LABEL[s.livello || 'silver'] + (n ? ' · ' + pub + ' pubblicati' : '') + '</small></span>' +
          '<span class="pe-sp-count' + (n ? '' : ' is-zero') + '" title="Contenuti collegati">' + n + '</span></button>';
      }).join('') + '</div>';
    box.querySelectorAll('.pe-sp-row').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = +b.getAttribute('data-sp');
        _peSponsorFilter = _peSponsorFilter === id ? null : id;
        _renderPeGrid(); _renderPeSponsorPanel();
      });
    });
    var reset = document.getElementById('peSponsorReset');
    if (reset) reset.addEventListener('click', function () { _peSponsorFilter = null; _renderPeGrid(); _renderPeSponsorPanel(); });
  }

  /* Nel modulo: una casella per sponsor, con il contatore che sale quando la si spunta. */
  function _renderPeSponsorBox(selected, itemId) {
    var box = document.getElementById('peSponsorBox');
    var list = _peSponsors(itemId);
    if (!list.length) { box.innerHTML = '<span style="font-size:13px;color:var(--a-muted)">Nessuno sponsor inserito: aggiungili dalla pagina «Sponsor».</span>'; return; }
    box.innerHTML = list.map(function (s) {
      var base = _peSponsorCount(s.id, itemId), on = selected.indexOf(s.id) !== -1;
      return '<label class="pe-sp-chip' + (on ? ' is-on' : '') + '"><input type="checkbox" class="peSponsorCheck" value="' + s.id + '" data-base="' + base + '"' + (on ? ' checked' : '') + '> ' +
        esc(s.nome) + ' <span class="pe-sp-count">' + (base + (on ? 1 : 0)) + '</span></label>';
    }).join('');
    box.querySelectorAll('.peSponsorCheck').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var chip = cb.parentNode;
        chip.classList.toggle('is-on', cb.checked);
        chip.querySelector('.pe-sp-count').textContent = (+cb.getAttribute('data-base')) + (cb.checked ? 1 : 0);
      });
    });
  }

  function _renderPeFilterBox() {
    var box = document.getElementById('pePlatformFilter');
    box.innerHTML = PE_PLATFORMS.map(function (p) {
      var checked = _pePlatformFilter[p.key] ? ' checked' : '';
      return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:5px 12px;border:1px solid #e2e8f0;border-radius:20px;cursor:pointer;user-select:none">' +
        '<input type="checkbox" class="peFilterCheck" value="' + p.key + '"' + checked + '> ' + p.label +
        '</label>';
    }).join('');
    box.querySelectorAll('.peFilterCheck').forEach(function (cb) {
      cb.addEventListener('change', function () {
        _pePlatformFilter[cb.value] = cb.checked;
        _renderPeGrid();
      });
    });
  }

  function _peIsMobile() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  function _peDayItems(ymd) {
    return _peItems.filter(function (it) {
      if (_peSponsorFilter != null && (it.sponsorIds || []).indexOf(_peSponsorFilter) === -1) return false;
      return it.data === ymd && (it.piattaforme || []).some(function (p) { return _pePlatformFilter[p]; });
    }).sort(function (a, b) { return (a.ora || '').localeCompare(b.ora || ''); });
  }

  function _peItemPlatform(it) {
    var platKey = (it.piattaforme || [])[0];
    return PE_PLATFORMS.find(function (p) { return p.key === platKey; }) || PE_PLATFORMS[0];
  }

  function _renderPeGrid() {
    document.getElementById('peMonthLabel').textContent =
      cap(_peMonthCursor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));

    if (_peIsMobile()) { _renderPeAgenda(); return; }

    var year  = _peMonthCursor.getFullYear();
    var month = _peMonthCursor.getMonth();
    var firstOfMonth  = new Date(year, month, 1);
    var startOffset   = (firstOfMonth.getDay() + 6) % 7; /* lun = 0 */
    var gridStart     = new Date(year, month, 1 - startOffset);
    var todayYmd      = _peYmd(new Date());

    var html = PE_WEEKDAYS.map(function (w) { return '<div class="pe-cal-weekday">' + w + '</div>'; }).join('');

    for (var i = 0; i < 42; i++) {
      var cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      var ymd      = _peYmd(cellDate);
      var inMonth  = cellDate.getMonth() === month;
      var dayItems = _peDayItems(ymd);

      var chipsHtml = dayItems.map(function (it) {
        var plat = _peItemPlatform(it);
        return '<div class="pe-chip chip ' + plat.chipClass + '" draggable="true" data-pe-id="' + esc(it.id) + '" onclick="AdminActions.editPianoEditoriale(\'' + it.id + '\')" title="' + esc(it.titolo) + _peSponsorTitle(it) + '"><span class="pe-chip-t">' + esc(it.titolo) + '</span>' + _peSponsorLogos(it) + '</div>';
      }).join('');

      html +=
        '<div data-ymd="' + ymd + '" class="pe-cal-cell' + (inMonth ? '' : ' pe-cal-cell--out') + (ymd === todayYmd ? ' pe-cal-cell--today' : '') + '">' +
          '<div class="pe-cal-cell-head"><span>' + cellDate.getDate() + '</span>' +
            '<button type="button" class="pe-cal-add" onclick="AdminActions.newPianoEditoriale(\'' + ymd + '\')" title="Nuovo contenuto">+</button>' +
          '</div>' +
          '<div class="pe-cal-cell-body">' + chipsHtml + '</div>' +
        '</div>';
    }

    var grid = document.getElementById('peCalGrid');
    grid.className = 'pe-cal-grid';
    grid.innerHTML = html;
  }

  function _renderPeAgenda() {
    var year  = _peMonthCursor.getFullYear();
    var month = _peMonthCursor.getMonth();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var todayYmd = _peYmd(new Date());
    var weekdaysFull = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

    var rows = [];
    for (var d = 1; d <= daysInMonth; d++) {
      var cellDate = new Date(year, month, d);
      var ymd = _peYmd(cellDate);
      var dayItems = _peDayItems(ymd);
      if (!dayItems.length) continue;

      var itemsHtml = dayItems.map(function (it) {
        var plat = _peItemPlatform(it);
        return '<div class="pe-agenda-item ' + plat.chipClass + '" onclick="AdminActions.editPianoEditoriale(\'' + it.id + '\')">' +
          '<div class="pe-agenda-item-top">' +
            '<span class="pe-agenda-item-title">' + esc(it.titolo) + '</span>' + _peSponsorLogos(it) +
            (it.ora ? '<span class="pe-agenda-item-time">' + esc(it.ora) + '</span>' : '') +
          '</div>' +
          '<div class="pe-agenda-item-plat">' + esc(plat.label) + '</div>' +
        '</div>';
      }).join('');

      rows.push(
        '<div class="pe-agenda-day' + (ymd === todayYmd ? ' pe-agenda-day--today' : '') + '">' +
          '<div class="pe-agenda-day-head">' +
            '<span>' + weekdaysFull[(cellDate.getDay() + 6) % 7] + ' ' + d + (ymd === todayYmd ? ' <span class="pe-agenda-today-tag">Oggi</span>' : '') + '</span>' +
            '<button type="button" class="pe-cal-add" onclick="AdminActions.newPianoEditoriale(\'' + ymd + '\')" title="Nuovo contenuto">+</button>' +
          '</div>' +
          itemsHtml +
        '</div>'
      );
    }

    var html = rows.length ? rows.join('') :
      '<div class="pe-agenda-empty">Nessun contenuto pianificato questo mese.</div>';

    var grid = document.getElementById('peCalGrid');
    grid.className = 'pe-agenda-list';
    grid.innerHTML = html;
  }

  /* Trascinare un contenuto su un altro giorno del calendario (solo computer: sul telefono si cambia la data dal contenuto) */
  (function () {
    var grid = document.getElementById('peCalGrid'), dragId = null;
    function cella(e) { return e.target.closest ? e.target.closest('.pe-cal-cell[data-ymd]') : null; }
    function pulisci() { grid.querySelectorAll('.pe-cal-cell.is-drop').forEach(function (c) { c.classList.remove('is-drop'); }); }
    grid.addEventListener('dragstart', function (e) {
      var chip = e.target.closest ? e.target.closest('.pe-chip[data-pe-id]') : null;
      if (!chip) return;
      dragId = chip.getAttribute('data-pe-id');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* alcuni browser vogliono comunque un dato */ }
      chip.classList.add('is-dragging');
    });
    grid.addEventListener('dragend', function () { dragId = null; pulisci(); grid.querySelectorAll('.is-dragging').forEach(function (c) { c.classList.remove('is-dragging'); }); });
    grid.addEventListener('dragover', function (e) {
      var c = cella(e); if (!c || !dragId) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      if (!c.classList.contains('is-drop')) { pulisci(); c.classList.add('is-drop'); }
    });
    grid.addEventListener('drop', function (e) {
      var c = cella(e); if (!c || !dragId) return;
      e.preventDefault(); pulisci();
      var id = dragId, ymd = c.getAttribute('data-ymd');
      dragId = null;
      var item = _peItems.find(function (x) { return x.id === id; });
      if (!item || item.data === ymd) return;
      var prima = item.data;
      db.collection('pianoEditoriale').doc(id).update({ data: ymd }).then(function () {
        item.data = ymd;
        _renderPeGrid(); _renderPeSponsorPanel();
        A.avviso('«' + item.titolo + '» spostato al ' + A.fmtDateLong(ymd) + '.', 'ok');
        return _logWrite('pianoEditoriale', id, 'Piano editoriale — ' + item.titolo, 'update', [{ campo: 'data', prima: prima, dopo: ymd }]);
      }).catch(function (err) {
        console.error('[pianoEditoriale] sposta', err);
        A.avviso('Non sono riuscito a spostare il contenuto: ' + err.message, 'errore');
      });
    });
  })();

  document.getElementById('peMonthPrev').addEventListener('click', function () {
    _peMonthCursor.setMonth(_peMonthCursor.getMonth() - 1);
    _renderPeGrid();
  });
  document.getElementById('peMonthNext').addEventListener('click', function () {
    _peMonthCursor.setMonth(_peMonthCursor.getMonth() + 1);
    _renderPeGrid();
  });
  document.getElementById('peMonthToday').addEventListener('click', function () {
    _peMonthCursor = new Date();
    _peMonthCursor.setDate(1);
    _renderPeGrid();
  });
  (function () {
    var _peResizeT = null;
    window.addEventListener('resize', function () {
      clearTimeout(_peResizeT);
      _peResizeT = setTimeout(function () {
        if (_peLoaded && !document.getElementById('sectionPianoEditoriale').classList.contains('is-hidden')) {
          _renderPeGrid();
        }
      }, 150);
    });
  })();

  function _renderPePiattaformeCheckboxes(selected) {
    var box = document.getElementById('pePiattaformeBox');
    box.innerHTML = PE_PLATFORMS.map(function (p) {
      var checked = selected.indexOf(p.key) !== -1 ? ' checked' : '';
      return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 14px;border:1px solid #e2e8f0;border-radius:20px;cursor:pointer;user-select:none">' +
        '<input type="checkbox" class="pePiattaformaCheck" value="' + p.key + '"' + checked + '> ' + p.label +
        '</label>';
    }).join('');
  }

  function _renderPeArticoloSelect(selectedId) {
    var articles = VV.getArticles().slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var sel = document.getElementById('peArticolo');
    sel.innerHTML = '<option value="">— Nessuno —</option>' +
      articles.map(function (a) { return '<option value="' + a.id + '">' + esc(a.title) + '</option>'; }).join('');
    sel.value = selectedId != null ? String(selectedId) : '';
  }

  function _renderPeResponsabileSelect(selected) {
    var sel = document.getElementById('peResponsabile');
    sel.innerHTML = '<option value="">— Nessuno —</option>' +
      _peDirigenti.map(function (d) {
        var nome = ((d.nome || '') + ' ' + (d.cognome || '')).trim() || d.email || d.uid;
        return '<option value="' + esc(nome) + '">' + esc(nome) + '</option>';
      }).join('');
    sel.value = selected || '';
  }

  function _openPeForm(item, presetDate) {
    _peEditing = item;
    showSubview('pianoEditoriale', 'form');
    document.getElementById('topbarActions').innerHTML = '';

    _renderPeArticoloSelect(item ? item.articoloId : null);
    _renderPePiattaformeCheckboxes(item ? (item.piattaforme || []) : []);
    _renderPeSponsorBox(item ? (item.sponsorIds || []) : [], item ? item.id : null);
    _loadPeDirigenti(function () { _renderPeResponsabileSelect(item ? item.responsabile : ''); });

    document.getElementById('peTitolo').value = item ? (item.titolo || '') : '';
    document.getElementById('peData').value   = item ? (item.data || '') : (presetDate || '');
    document.getElementById('peOra').value    = item ? (item.ora || '') : '';
    document.getElementById('peStato').value  = item ? (item.stato || 'daFare') : 'daFare';
    document.getElementById('peNote').value   = item ? (item.note || '') : '';
    document.getElementById('peDelete').classList.toggle('is-hidden', !item);
  }

  window.AdminActions.editPianoEditoriale = function (id) {
    var item = _peItems.find(function (x) { return x.id === id; });
    if (item) _openPeForm(item, null);
  };
  window.AdminActions.newPianoEditoriale = function (ymd) {
    _openPeForm(null, ymd);
  };

  document.getElementById('peArticolo').addEventListener('change', function () {
    if (!this.value) return;
    var titleEl = document.getElementById('peTitolo');
    if (titleEl.value.trim()) return;
    var article = VV.getArticle(+this.value);
    if (article) titleEl.value = article.title;
  });

  document.getElementById('peCancel').addEventListener('click', renderPianoEditoriale);

  document.getElementById('peSave').addEventListener('click', function () {
    var titolo = document.getElementById('peTitolo').value.trim();
    if (!titolo) { alert('Il titolo è obbligatorio.'); return; }
    var data = document.getElementById('peData').value;
    if (!data) { alert('La data è obbligatoria.'); return; }
    var piattaforme = Array.prototype.map.call(
      document.querySelectorAll('#pePiattaformeBox .pePiattaformaCheck:checked'),
      function (cb) { return cb.value; }
    );
    if (!piattaforme.length) { alert('Seleziona almeno una piattaforma.'); return; }
    var articoloRaw = document.getElementById('peArticolo').value;

    var item = {
      titolo:       titolo,
      data:         data,
      ora:          document.getElementById('peOra').value,
      piattaforme:  piattaforme,
      stato:        document.getElementById('peStato').value,
      articoloId:   articoloRaw ? +articoloRaw : null,
      sponsorIds:   Array.prototype.map.call(document.querySelectorAll('#peSponsorBox .peSponsorCheck:checked'), function (cb) { return +cb.value; }),
      responsabile: document.getElementById('peResponsabile').value,
      note:         document.getElementById('peNote').value.trim()
    };

    var before = _peEditing;
    var ref = before ? db.collection('pianoEditoriale').doc(before.id) : db.collection('pianoEditoriale').doc();
    ref.set(item).then(function () {
      var saved = Object.assign({ id: ref.id }, item);
      if (before) _peItems = _peItems.map(function (x) { return x.id === ref.id ? saved : x; });
      else        _peItems.push(saved);
      return _logWrite('pianoEditoriale', ref.id, 'Piano editoriale — ' + titolo,
        before ? 'update' : 'create', _diff(before, saved, Object.keys(item)));
    }).then(function () {
      renderPianoEditoriale();
    }).catch(function (e) {
      console.error('[pianoEditoriale] save', e);
      alert('Errore nel salvataggio. Riprova.');
    });
  });

  document.getElementById('peDelete').addEventListener('click', function () {
    if (!_peEditing) return;
    var id = _peEditing.id, titolo = _peEditing.titolo;
    confirm('Eliminare "' + titolo + '" dal piano editoriale?', function () {
      db.collection('pianoEditoriale').doc(id).delete().then(function () {
        _peItems = _peItems.filter(function (x) { return x.id !== id; });
        return _logWrite('pianoEditoriale', id, 'Piano editoriale — ' + titolo, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).then(function () {
        renderPianoEditoriale();
      }).catch(function (e) {
        console.error('[pianoEditoriale] delete', e);
        alert('Errore durante l\'eliminazione. Riprova.');
      });
    });
  });

  /* ---- Interfaccia verso admin.js ---- */
  A.pianoEditoriale = { render: renderPianoEditoriale };

})();
