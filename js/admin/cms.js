/* Victor Volley — Admin: CMS del sito (articoli, calendario, galleria, squadre, stagioni, maglia, sponsor).
   Estratto da admin.js. Dipende da window.Admin; espone window.Admin.cms e aggiunge i metodi a window.AdminActions. */
(function () {
  'use strict';
  var A = window.Admin;
  var esc = A.esc, confirm = A.confirm, val = A.val;
  var showSubview = A.showSubview, setTopbarBtn = A.setTopbarBtn, _fmtDate = A.fmtDate;
  var _openBudgetModal = A.openModal, _closeBudgetModal = A.closeModal, EDIT_ICON_SM = A.EDIT_ICON_SM;
  var DEL_ICON_SM = A.DEL_ICON_SM;

  /* ================================================
     ARTICOLI
  ================================================ */
  var _artEditing = null;

  function renderArticoli() {
    showSubview('articoli', 'list');
    setTopbarBtn('Nuovo articolo', function () { openArtForm(null); });
    var catsBtn = document.createElement('button');
    catsBtn.className = 'btn-ghost';
    catsBtn.textContent = 'Categorie articoli';
    catsBtn.addEventListener('click', _openArtCategoriesModal);
    document.getElementById('topbarActions').insertBefore(catsBtn, document.getElementById('topbarActions').firstChild);
    refreshArtTable();
  }

  function refreshArtTable() {
    var articles    = VV.getArticles().slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });
    var featCount   = articles.filter(function (a) { return a.featured; }).length;

    var hint = document.getElementById('artSliderHint');
    if (!hint) {
      hint = document.createElement('p');
      hint.id = 'artSliderHint';
      hint.style.cssText = 'font-size:12px;color:var(--a-muted);margin-bottom:12px';
      var list = document.getElementById('articoliList');
      list.insertBefore(hint, list.firstChild);
    }
    hint.textContent = 'Slider homepage: assegna la posizione 1, 2 o 3 agli articoli da mostrare. I conflitti vengono risolti automaticamente.';

    var rows = articles.map(function (a) {
      var starTitle = a.featured ? 'Rimuovi dallo slider' : (featCount >= 3 ? 'Limite raggiunto (max 3)' : 'Aggiungi allo slider');
      var cats = VV.getArticleCategories(a);
      var catsChips = cats.map(function (c) { return '<span class="chip chip--blue">' + esc(c) + '</span>'; }).join(' ');
      return '<tr>' +
        '<td><div class="table-title">' + esc(a.title) + '</div><div class="table-sub">' + esc(cats.join(', ')) + '</div></td>' +
        '<td>' + catsChips + '</td>' +
        '<td>' + VV.formatDateShort(a.date) + '</td>' +
        '<td>' + (a.published ? '<span class="chip chip--green">Pubblicato</span>' : '<span class="chip chip--gray">Bozza</span>') + '</td>' +
        '<td style="text-align:center">' +
          '<select onchange="AdminActions.setHeroOrder(' + a.id + ', +this.value)" title="Posizione nello slider homepage" style="font-size:12px;padding:3px 6px;border-radius:4px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;color:#0f172a">' +
            '<option value="0"' + (!a.heroOrder ? ' selected' : '') + '>&mdash;</option>' +
            [1,2,3].map(function(n){ return '<option value="' + n + '"' + (a.heroOrder === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
          '</select>' +
        '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.editArt(' + a.id + ')" title="Modifica"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteArt(' + a.id + ')" title="Elimina"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    document.getElementById('articoliBody').innerHTML = rows ||
      '<tr><td colspan="6"><div class="empty-state"><p>Nessun articolo ancora. Crea il primo!</p></div></td></tr>';
  }

  function _renderArtCategoriesCheckboxes(selected) {
    var box = document.getElementById('artCategoriesBox');
    var cats = VV.getCategorieArticoli();
    /* Categorie assegnate all'articolo ma non più nell'elenco gestito: le mostriamo comunque per non perderle al salvataggio */
    selected.forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
    box.innerHTML = cats.map(function (c, i) {
      var checked = selected.indexOf(c) >= 0;
      return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 12px;border:1px solid #e2e8f0;border-radius:20px;cursor:pointer;user-select:none">' +
        '<input type="checkbox" class="artCategoryCheck" value="' + esc(c) + '"' + (checked ? ' checked' : '') + '>' +
        esc(c) +
      '</label>';
    }).join('') || '<p style="font-size:13px;color:#94a3b8">Nessuna categoria disponibile. Creane una da "Categorie articoli".</p>';

    box.querySelectorAll('.artCategoryCheck').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var checked = box.querySelectorAll('.artCategoryCheck:checked');
        if (checked.length > 2) { cb.checked = false; alert('Puoi selezionare al massimo 2 categorie per articolo.'); }
      });
    });
  }

  function _renderArtSponsorSelects(selected) {
    var sponsors = VV.getSponsors().filter(function (s) { return !!s.logo; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var options = '<option value="">— Nessuno —</option>' +
      sponsors.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nome) + '</option>'; }).join('');
    ['artSponsor1', 'artSponsor2', 'artSponsor3'].forEach(function (selId, i) {
      var sel = document.getElementById(selId);
      sel.innerHTML = options;
      sel.value = selected[i] != null ? String(selected[i]) : '';
    });
  }

  function openArtForm(article) {
    _artEditing = article;
    showSubview('articoli', 'form');
    document.getElementById('topbarActions').innerHTML = '';
    _initArtFocusInputs();
    _initArtRTE();

    _renderArtCategoriesCheckboxes(article ? VV.getArticleCategories(article) : []);
    _renderArtSponsorSelects(article && Array.isArray(article.sponsor_ids) ? article.sponsor_ids : []);

    if (article) {
      document.getElementById('artTitle').value      = article.title || '';
      document.getElementById('artDate').value        = article.date || '';
      document.getElementById('artImage').value       = article.image || '';
      document.getElementById('artPhotoFocus').value  = article.imageFocus || '';
      _setArtCoverRatio(article.coverRatio || '4:5');
      document.getElementById('artExcerpt').value     = article.excerpt || '';
      _setArtContent(article.content || '');
      document.getElementById('artPublished').checked = !!article.published;
      _setArtPreview(article.image || null, article.image ? 'Immagine salvata' : '');
      if (article.image) _showArtFocusPicker(article.image, article.imageFocus || '');
      else                _hideArtFocusPicker();
    } else {
      document.getElementById('artTitle').value      = '';
      document.getElementById('artDate').value        = new Date().toISOString().slice(0, 10);
      document.getElementById('artImage').value       = '';
      document.getElementById('artPhotoFocus').value  = '';
      _setArtCoverRatio('4:5');
      document.getElementById('artExcerpt').value     = '';
      _setArtContent('');
      document.getElementById('artPublished').checked = true;
      _setArtPreview(null);
      _hideArtFocusPicker();
    }
  }

  document.getElementById('artSave').addEventListener('click', function () {
    var title = document.getElementById('artTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var categories = Array.prototype.map.call(
      document.querySelectorAll('#artCategoriesBox .artCategoryCheck:checked'),
      function (cb) { return cb.value; }
    );
    if (!categories.length) { alert('Seleziona almeno una categoria.'); return; }
    var sponsorIds = ['artSponsor1', 'artSponsor2', 'artSponsor3']
      .map(function (selId) { return document.getElementById(selId).value; })
      .filter(function (v) { return v !== ''; })
      .map(function (v) { return +v; })
      .filter(function (id, i, arr) { return arr.indexOf(id) === i; }); /* niente duplicati */
    var article = Object.assign({}, _artEditing || {}, {
      title:       title,
      categories:  categories,
      category:    categories[0],
      sponsor_ids: sponsorIds,
      date:       document.getElementById('artDate').value,
      image:      document.getElementById('artImage').value.trim(),
      imageFocus: document.getElementById('artPhotoFocus').value.trim() || null,
      coverRatio: (document.querySelector('input[name="artCoverRatio"]:checked') || {}).value || '4:5',
      excerpt:    document.getElementById('artExcerpt').value.trim(),
      content:    document.getElementById('artContent').value.trim(),
      published:  document.getElementById('artPublished').checked
    });
    DB.saveArticle(article, renderArticoli);
  });

  /* ---- Categorie articoli (gestione) ---- */
  function _renderArtCategoriesModalList() {
    var cats = VV.getCategorieArticoli();
    var list = document.getElementById('artCategoriesModalList');
    list.innerHTML = cats.length ? cats.map(function (c, i) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<span>' + esc(c) + '</span>' +
        '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteCategoriaArticolo(' + i + ')" title="Elimina">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
        '</button>' +
      '</div>';
    }).join('') : '<p style="font-size:13px;color:#94a3b8">Nessuna categoria ancora.</p>';
  }

  function _openArtCategoriesModal() {
    _renderArtCategoriesModalList();
    document.getElementById('artCategoriesNewInput').value = '';
    _openBudgetModal('artCategoriesModal');
  }

  document.getElementById('artCategoriesAddBtn').addEventListener('click', function () {
    var input = document.getElementById('artCategoriesNewInput');
    var name  = input.value.trim();
    if (!name) return;
    var cats = VV.getCategorieArticoli();
    if (cats.indexOf(name) >= 0) { alert('Categoria già esistente.'); return; }
    cats = cats.concat([name]);
    DB.saveCategorieArticoli(cats, function () {
      input.value = '';
      _renderArtCategoriesModalList();
    });
  });
  document.getElementById('artCategoriesModalClose').addEventListener('click', function () { _closeBudgetModal('artCategoriesModal'); });
  document.getElementById('artCategoriesModalDone').addEventListener('click', function () { _closeBudgetModal('artCategoriesModal'); });

  document.getElementById('artCancel').addEventListener('click', renderArticoli);

  /* ================================================
     CALENDARIO — collection Firestore "partite" (via DB/VV)
  ================================================ */
  var _matchEditing = null;

  function renderCalendario() {
    showSubview('calendario', 'list');
    setTopbarBtn('Aggiungi partita', function () { openMatchForm(null); });
    refreshMatchTable();
    refreshGironeSquadre();
  }

  function _matchRow(p) {
    var hasScore  = p.stato === 'conclusa' && p.set_casa != null && p.set_ospite != null;
    var casaWins  = hasScore && +p.set_casa > +p.set_ospite;
    var result    = hasScore
      ? '<strong>' + p.set_casa + '&ndash;' + p.set_ospite + '</strong>'
      : '<span style="color:var(--a-muted)">—</span>';
    var nomeCasa   = esc(p.squadra_casa || '');
    var nomeOspite = esc(p.squadra_ospite || '');
    return '<tr>' +
      '<td style="white-space:nowrap">' + _fmtDate(p.data) + '</td>' +
      '<td>' + esc(p.ora || '—') + '</td>' +
      '<td><span class="chip chip--blue">' + esc(p.categoria || '') + '</span></td>' +
      '<td>' +
        (p.logo_casa ? '<img src="' + esc(p.logo_casa) + '" style="height:20px;display:inline;vertical-align:middle;margin-right:4px">' : '') +
        (hasScore && casaWins ? '<strong>' + nomeCasa + '</strong>' : nomeCasa) + ' vs ' +
        (p.logo_ospite ? '<img src="' + esc(p.logo_ospite) + '" style="height:20px;display:inline;vertical-align:middle;margin-right:4px">' : '') +
        (hasScore && !casaWins ? '<strong>' + nomeOspite + '</strong>' : nomeOspite) +
      '</td>' +
      '<td style="font-size:12px;color:var(--a-muted)">' + esc(p.palazzetto || '—') + '</td>' +
      '<td>' + result + '</td>' +
      '<td><div class="table-actions">' +
        '<button class="btn-icon" onclick="AdminActions.editMatch(\'' + esc(p.id) + '\')" title="Modifica">' + EDIT_ICON_SM + '</button>' +
        '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteMatch(\'' + esc(p.id) + '\')" title="Elimina">' + DEL_ICON_SM + '</button>' +
      '</div></td>' +
    '</tr>';
  }

  function refreshMatchTable() {
    var sorted        = VV.getPartite().sort(function (a, b) { return a.data > b.data ? 1 : -1; });
    var currentSeason  = VV.getCurrentSeason();
    var currentId      = currentSeason && currentSeason.id;
    var seasonName     = {};
    VV.getSeasons().forEach(function (s) { seasonName[s.id] = s.name || s.id; });

    var groups = {};
    var order  = [];
    sorted.forEach(function (p) {
      var sid = p.stagione || currentId || '2025/2026';
      if (!groups[sid]) { groups[sid] = []; order.push(sid); }
      groups[sid].push(p);
    });

    /* La stagione corrente viene mostrata per prima, le altre a seguire in ordine decrescente. */
    order.sort(function (a, b) {
      if (a === currentId) return -1;
      if (b === currentId) return 1;
      return a < b ? 1 : (a > b ? -1 : 0);
    });

    var rows = order.map(function (sid) {
      var isCurrent = sid === currentId;
      var label     = seasonName[sid] || sid;
      var header    = '<tr class="admin-table-group-row"><td colspan="7">' +
        '<span class="admin-table-group-label">' + esc(label) + '</span>' +
        (isCurrent ? '<span class="chip chip--green" style="font-size:11px;margin-left:8px">Corrente</span>' : '') +
      '</td></tr>';
      return header + groups[sid].map(_matchRow).join('');
    }).join('');

    document.getElementById('calendarioBody').innerHTML = rows ||
      '<tr><td colspan="7"><div class="empty-state"><p>Nessuna partita. Aggiungine una!</p></div></td></tr>';
  }

  function openMatchForm(p) {
    _initLogoInputs();
    _matchEditing = p || null;
    showSubview('calendario', 'form');
    document.getElementById('topbarActions').innerHTML = '';

    var catSel = document.getElementById('matchCategory');
    catSel.innerHTML = VV.CATEGORIES.filter(function (c) { return c !== 'Società'; }).map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    if (p) {
      document.getElementById('matchDate').value     = p.data || '';
      document.getElementById('matchTime').value     = p.ora  || '18:30';
      catSel.value                                   = p.categoria || 'Prima Divisione';
      document.getElementById('matchHomeTeam').value = p.squadra_casa   || '';
      /* il logo scritto sulla partita, non quello preso dall'elenco del girone */
      document.getElementById('matchHomeLogo').value = (p.logo_casa_orig !== undefined ? p.logo_casa_orig : p.logo_casa) || '';
      document.getElementById('matchAwayTeam').value = p.squadra_ospite || '';
      document.getElementById('matchAwayLogo').value = (p.logo_ospite_orig !== undefined ? p.logo_ospite_orig : p.logo_ospite) || '';
      _syncLogoPreview('matchHomeLogo', 'homeLogoPreview');
      _syncLogoPreview('matchAwayLogo', 'awayLogoPreview');
      document.getElementById('matchVenue').value    = p.palazzetto || '';
      document.getElementById('matchStato').value    = p.stato || 'programmata';
      document.getElementById('matchSetCasa').value    = (p.set_casa   != null) ? p.set_casa   : '';
      document.getElementById('matchSetOspite').value  = (p.set_ospite != null) ? p.set_ospite : '';
      document.getElementById('matchSppCode').value    = p.spp_code || '';
    } else {
      document.getElementById('matchDate').value     = '';
      document.getElementById('matchTime').value     = '18:30';
      catSel.value                                   = 'Prima Divisione';
      document.getElementById('matchHomeTeam').value = '';
      document.getElementById('matchHomeLogo').value = '';
      document.getElementById('matchAwayTeam').value = '';
      document.getElementById('matchAwayLogo').value = '';
      _syncLogoPreview('matchHomeLogo', 'homeLogoPreview');
      _syncLogoPreview('matchAwayLogo', 'awayLogoPreview');
      document.getElementById('matchVenue').value      = 'Palazzetto ARKÉ — Melissano';
      document.getElementById('matchStato').value      = 'programmata';
      document.getElementById('matchSetCasa').value    = '';
      document.getElementById('matchSetOspite').value  = '';
      document.getElementById('matchSppCode').value    = '';
    }
    AdminActions.toggleResultFields();
  }

  document.getElementById('matchSave').addEventListener('click', function () {
    var data = document.getElementById('matchDate').value;
    if (!data) { alert('La data è obbligatoria.'); return; }
    var squadraCasa   = document.getElementById('matchHomeTeam').value.trim();
    var squadraOspite = document.getElementById('matchAwayTeam').value.trim();
    if (!squadraCasa)   { alert('La squadra di casa è obbligatoria.'); return; }
    if (!squadraOspite) { alert('La squadra ospite è obbligatoria.'); return; }
    var logoCasa   = document.getElementById('matchHomeLogo').value.trim();
    var logoOspite = document.getElementById('matchAwayLogo').value.trim();
    var stato     = document.getElementById('matchStato').value;
    var setC      = document.getElementById('matchSetCasa').value;
    var setO      = document.getElementById('matchSetOspite').value;
    var sppCode   = document.getElementById('matchSppCode').value.trim();

    var partita = {
      id:            (_matchEditing && _matchEditing.id) || ('m' + Date.now()),
      stagione:      (_matchEditing && _matchEditing.stagione) || (VV.getCurrentSeason() || {}).id || '2025/2026',
      categoria:     document.getElementById('matchCategory').value,
      squadra_casa:   squadraCasa,
      squadra_ospite: squadraOspite,
      logo_casa:      logoCasa,
      logo_ospite:    logoOspite,
      data:          data,
      ora:           document.getElementById('matchTime').value,
      palazzetto:    document.getElementById('matchVenue').value.trim(),
      stato:         stato,
      set_casa:      (stato === 'conclusa' && setC !== '') ? +setC : null,
      set_ospite:    (stato === 'conclusa' && setO !== '') ? +setO : null,
      spp_code:      sppCode || null
    };

    /* Mantieni campi live (codice_tabellone ecc.) se esistenti */
    if (_matchEditing) {
      ['codice_tabellone', 'tabellone_squadra_casa'].forEach(function (k) {
        if (_matchEditing[k] != null) partita[k] = _matchEditing[k];
      });
    }

    DB.savePartita(partita, renderCalendario);
  });

  document.getElementById('matchCancel').addEventListener('click', renderCalendario);

  /* ================================================
     GIRONI E SQUADRE — anagrafica unica + un girone per categoria
     Vive in siteData/girone (formato v2, vedi VV.normalizeGirone):
       squadre: anagrafica unica {id, nome, logo, home}, loghi caricati una volta sola
       gironi:  uno per categoria {categoria, girone, squadre:[id…], partite}
     I loghi dell'anagrafica compaiono anche nelle card delle partite
     (VV.applyGironeLogos). Qui si modificano squadre, loghi, lettera e
     appartenenza ai gironi; la stagione e le partite del documento restano.
  ================================================ */
  var _gironeDoc  = null;   /* documento letto, normalizzato */
  var _gironeRows = [];     /* anagrafica di lavoro: {id, nome, logo, home, in:{categoria:true}} */
  var _gironiWork = [];     /* gironi di lavoro: {categoria, girone, partite} (le squadre stanno in _gironeRows[].in) */
  var _gironeSel  = 0;      /* girone (scheda) selezionato */
  var _gironeBusy = 0;      /* upload di loghi in corso */

  function _gironeStatus(msg, color) {
    var el = document.getElementById('gironeSqStatus');
    el.textContent = msg || '';
    el.style.color = color || '';
  }

  function _loadGironeDoc() {
    return db.collection('siteData').doc('girone').get().then(function (doc) {
      if (doc.exists && doc.data() && doc.data().json) return JSON.parse(doc.data().json);
      return fetch('/data/girone.json').then(function (r) { return r.json(); });
    }).then(function (raw) { return VV.normalizeGirone(raw); });
  }

  function _fillTeamDatalist() {
    document.getElementById('gironeTeamNames').innerHTML = _gironeRows.map(function (r) {
      return '<option value="' + esc(r.nome) + '"></option>';
    }).join('');
  }

  /* "assets/logo.png" è relativo alla radice del sito: l'admin vive anche su /admin/budget ecc., quindi lo rendo assoluto */
  function _absLogo(u) { return /^(https?:|data:)/.test(u) || u.charAt(0) === '/' ? u : '/' + u; }

  function _gironeLogoBox(r) {
    return r.logo
      ? '<img src="' + esc(_absLogo(r.logo)) + '" alt="">'
      : esc((r.nome || '?').charAt(0).toUpperCase());
  }

  function _renderGironeTabs() {
    var usate = _gironiWork.map(function (g) { return g.categoria; });
    var libere = VV.CATEGORIES.filter(function (c) { return c !== 'Società' && usate.indexOf(c) === -1; });
    document.getElementById('gironeSqTabs').innerHTML =
      _gironiWork.map(function (g, i) {
        return '<button type="button" class="girone-sq-tab' + (i === _gironeSel ? ' is-active' : '') + '" data-tab="' + i + '">' +
          esc(g.categoria) + (g.girone ? ' · ' + esc(g.girone) : '') + '</button>';
      }).join('') +
      (libere.length
        ? '<select class="form-input girone-sq-newcat" id="gironeSqNewCat"><option value="">＋ Aggiungi girone…</option>' +
          libere.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') + '</select>'
        : '');

    var g = _gironiWork[_gironeSel];
    var meta = document.getElementById('gironeSqMeta');
    meta.style.display = g ? '' : 'none';
    if (g) document.getElementById('gironeSqLetter').value = g.girone || '';
  }

  function _renderGironeRows() {
    var g = _gironiWork[_gironeSel];
    document.getElementById('gironeSqList').innerHTML = _gironeRows.map(function (r, i) {
      return '<div class="girone-sq-row" data-i="' + i + '">' +
        '<div class="girone-sq-logo" data-role="logo">' + _gironeLogoBox(r) + '</div>' +
        '<input type="text" class="form-input girone-sq-name" data-role="nome" value="' + esc(r.nome) + '" placeholder="Nome squadra">' +
        (g ? '<label class="girone-sq-in"><input type="checkbox" data-role="in"' + (r.in[g.categoria] ? ' checked' : '') + '> Nel girone</label>' : '') +
        (r.home ? '<span class="girone-sq-tag">La nostra squadra</span>' : '') +
        '<label class="btn-ghost" style="cursor:pointer;padding:6px 10px;white-space:nowrap" title="Carica logo: sfondo bianco rimosso, PNG 256 px">Carica logo' +
          '<input type="file" accept="image/*" data-role="file" style="display:none"></label>' +
        (r.logo ? '<button type="button" class="btn-ghost" data-act="rm-logo" style="padding:6px 10px">Togli logo</button>' : '') +
        (r.home ? '' : '<button type="button" class="btn-icon btn-icon--danger" data-act="del" title="Elimina squadra">' + DEL_ICON_SM + '</button>') +
      '</div>';
    }).join('') || '<div class="empty-state"><p>Nessuna squadra nell’elenco.</p></div>';
    _fillTeamDatalist();
    _renderGironeCount();
  }

  function _renderGironeCount() {
    var g = _gironiWork[_gironeSel];
    document.getElementById('gironeSqCount').textContent = g
      ? _gironeRows.filter(function (r) { return r.in[g.categoria]; }).length + ' squadre nel girone ' + g.categoria
      : 'Nessun girone: aggiungine uno dalle schede qui sopra.';
  }

  function _renderGirone() { _renderGironeTabs(); _renderGironeRows(); }

  var _gironiBefore = '—';

  function refreshGironeSquadre() {
    _gironeStatus('Caricamento…');
    _loadGironeDoc().then(function (n) {
      _gironeDoc  = n;
      _gironiBefore = n.gironi.length + ' (' + n.gironi.map(function (g) { return g.categoria + ' ' + g.squadre.length; }).join(', ') + ')';
      _gironiWork = n.gironi.map(function (g) { return { categoria: g.categoria, girone: g.girone, partite: g.partite }; });
      _gironeRows = n.squadre.map(function (s) {
        var inMap = {};
        n.gironi.forEach(function (g) { if (g.squadre.indexOf(s.id) !== -1) inMap[g.categoria] = true; });
        return { id: s.id, nome: s.nome || '', logo: s.logo || '', home: !!s.home, in: inMap };
      });
      _gironeSel = Math.min(_gironeSel, Math.max(0, _gironiWork.length - 1));
      _renderGirone();
      _gironeStatus('');
    }).catch(function (e) {
      console.error('[admin] squadre girone', e);
      _gironeStatus('Impossibile caricare l’elenco: ' + e.message, 'var(--a-red)');
    });
  }

  function _gironeUniqueId(nome) {
    var base = VV.slugify(nome) || 'squadra', id = base, n = 2;
    var used = _gironeRows.map(function (r) { return r.id; });
    while (used.indexOf(id) !== -1) id = base + '-' + (n++);
    return id;
  }

  function _gironeSaveBtnState() {
    document.getElementById('gironeSqSave').disabled = _gironeBusy > 0;
  }

  function saveGironeSquadre() {
    if (!_gironeDoc) return;
    var seen = {};
    for (var i = 0; i < _gironeRows.length; i++) {
      var r = _gironeRows[i];
      r.nome = (r.nome || '').trim();
      if (!r.nome) { _gironeStatus('Ogni squadra deve avere un nome.', 'var(--a-red)'); return; }
      var k = VV.teamKey(r.nome);
      if (seen[k]) { _gironeStatus('«' + r.nome + '» compare due volte.', 'var(--a-red)'); return; }
      seen[k] = true;
    }
    _gironeRows.forEach(function (r) { if (!r.id) r.id = _gironeUniqueId(r.nome); });

    var squadre = _gironeRows.map(function (r) {
      var o = { id: r.id, nome: r.nome };
      if (r.logo) o.logo = r.logo;
      if (r.home) o.home = true;
      return o;
    });
    var gironi = _gironiWork.map(function (g) {
      return {
        categoria: g.categoria,
        girone:    (g.girone || '').trim(),
        squadre:   _gironeRows.filter(function (r) { return r.in[g.categoria]; }).map(function (r) { return r.id; }),
        partite:   g.partite || []
      };
    });
    var doc = { stagione: _gironeDoc.stagione, squadre: squadre, gironi: gironi };
    var prima = _gironeDoc.squadre, gironiPrima = _gironiBefore;
    var gironiDopo = gironi.length + ' (' + gironi.map(function (g) { return g.categoria + ' ' + g.squadre.length; }).join(', ') + ')';

    _gironeStatus('Salvataggio…');
    db.collection('siteData').doc('girone').set({
      json:      JSON.stringify(doc),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      _gironeDoc = VV.normalizeGirone(doc);
      _gironiBefore = gironiDopo;
      VV.setSquadreGirone(squadre);
      VV.applyGironeLogos(VV.getPartite());
      refreshMatchTable();
      _renderGirone();
      _gironeStatus('✓ Salvato', 'var(--a-green)');
      setTimeout(function () { _gironeStatus(''); }, 3000);
      var conLogo = function (l) { return l.filter(function (s) { return s.logo; }).length; };
      A.logWrite('squadreGirone', 'girone', 'Gironi e squadre', 'update', [
        { campo: 'squadre', prima: prima.length + ' (' + conLogo(prima) + ' con logo)', dopo: squadre.length + ' (' + conLogo(squadre) + ' con logo)' },
        { campo: 'gironi', prima: gironiPrima, dopo: gironiDopo }
      ]);
    }).catch(function (e) {
      _gironeStatus('Errore: ' + e.message, 'var(--a-red)');
    });
  }

  (function initGironeSquadre() {
    var list = document.getElementById('gironeSqList');

    document.getElementById('gironeSqTabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tab]');
      if (!b) return;
      _gironeSel = +b.getAttribute('data-tab');
      _renderGirone();
    });
    document.getElementById('gironeSqTabs').addEventListener('change', function (ev) {
      if (ev.target.id !== 'gironeSqNewCat' || !ev.target.value) return;
      var cat = ev.target.value;
      _gironiWork.push({ categoria: cat, girone: '', partite: [] });
      _gironeRows.forEach(function (r) { if (r.home) r.in[cat] = true; });  /* la nostra squadra c'è sempre */
      _gironeSel = _gironiWork.length - 1;
      _renderGirone();
    });
    document.getElementById('gironeSqLetter').addEventListener('input', function () {
      var g = _gironiWork[_gironeSel];
      if (!g) return;
      g.girone = this.value;
      var t = document.querySelector('#gironeSqTabs [data-tab="' + _gironeSel + '"]');
      if (t) t.textContent = g.categoria + (g.girone.trim() ? ' · ' + g.girone.trim() : '');
    });
    document.getElementById('gironeSqDelGirone').addEventListener('click', function () {
      var g = _gironiWork[_gironeSel];
      if (!g) return;
      var nPartite = (g.partite || []).length;
      confirm('Eliminare il girone «' + g.categoria + '»?' + (nPartite ? ' Contiene ' + nPartite + ' partite con risultati.' : '') + ' Le squadre restano nell’elenco.', function () {
        _gironiWork.splice(_gironeSel, 1);
        _gironeRows.forEach(function (r) { delete r.in[g.categoria]; });
        _gironeSel = 0;
        _renderGirone();
      });
    });

    list.addEventListener('input', function (ev) {
      var row = ev.target.closest('.girone-sq-row');
      if (!row || ev.target.getAttribute('data-role') !== 'nome') return;
      var r = _gironeRows[+row.getAttribute('data-i')];
      r.nome = ev.target.value;
      if (!r.logo) row.querySelector('[data-role="logo"]').textContent = (r.nome || '?').charAt(0).toUpperCase();
    });

    list.addEventListener('change', function (ev) {
      var role = ev.target.getAttribute('data-role');
      var row = ev.target.closest('.girone-sq-row');
      if (!row) return;
      var r = _gironeRows[+row.getAttribute('data-i')];
      if (role === 'in') {
        var g = _gironiWork[_gironeSel];
        if (g) { if (ev.target.checked) r.in[g.categoria] = true; else delete r.in[g.categoria]; }
        _renderGironeCount();
        return;
      }
      if (role !== 'file' || !ev.target.files.length) return;
      var fileEl = ev.target, box = row.querySelector('[data-role="logo"]'), prev = r.logo;
      convertLogoToPng(fileEl.files[0], 256, function (dataUrl, blob) {
        fileEl.value = '';
        box.innerHTML = '<img src="' + dataUrl + '" alt="">';
        _gironeBusy++; _gironeSaveBtnState();
        _gironeStatus('Caricamento logo…');
        _uploadImage(blob, 'squadre-girone', 'png', function (err, url) {
          _gironeBusy--; _gironeSaveBtnState();
          if (err) {
            console.error('[admin] upload logo girone', err);
            box.innerHTML = _gironeLogoBox({ nome: r.nome, logo: prev });
            _gironeStatus('Errore caricamento logo, riprova.', 'var(--a-red)');
            return;
          }
          r.logo = url;
          _renderGironeRows();
          _gironeStatus('Logo caricato: ricordati di salvare.');
        });
      });
    });

    list.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var i = +btn.closest('.girone-sq-row').getAttribute('data-i');
      if (btn.getAttribute('data-act') === 'rm-logo') {
        _gironeRows[i].logo = '';
        _renderGironeRows();
      } else if (btn.getAttribute('data-act') === 'del') {
        var nome = _gironeRows[i].nome || 'questa squadra';
        confirm('Eliminare «' + nome + '» dall’elenco? Sparisce da tutti i gironi; le partite già inserite restano, ma senza il logo di questo elenco.', function () {
          _gironeRows.splice(i, 1);
          _renderGironeRows();
        });
      }
    });

    document.getElementById('gironeSqAdd').addEventListener('click', function () {
      var g = _gironiWork[_gironeSel], inMap = {};
      if (g) inMap[g.categoria] = true;  /* la nuova squadra entra nel girone aperto */
      _gironeRows.push({ id: '', nome: '', logo: '', home: false, in: inMap });
      _renderGironeRows();
      var inputs = list.querySelectorAll('[data-role="nome"]');
      inputs[inputs.length - 1].focus();
    });
    document.getElementById('gironeSqSave').addEventListener('click', saveGironeSquadre);
  })();

  /* ================================================
     GALLERIA
  ================================================ */
  var _currentAlbumId = null;
  var _albumEditingId = null;   /* id dell'album in modifica; null = nuovo album */
  var _albumSlugTouched = false; /* true se lo slug è stato scritto/modificato a mano */

  /* Eliminare una foto/album qui toglie solo il collegamento (Firestore): il file
     resta su Cloudinary, perché cancellarlo davvero richiede la API Secret, che non
     può stare nel codice del browser. Un aiuto manuale: copia gli id negli appunti
     e apre la Media Library, dove si cancellano in due click cercandoli per nome. */
  function _notifyCloudinaryOrphans(ids) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;
    var list = ids.join(', ');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(list).catch(function () {});
    }
    var shown = ids.slice(0, 15).join('\n') + (ids.length > 15 ? '\n… e altre ' + (ids.length - 15) : '');
    alert(
      (ids.length === 1 ? 'Il file è rimasto su Cloudinary.' : 'I ' + ids.length + ' file sono rimasti su Cloudinary.') +
      ' Per cancellarli: apri la Media Library (si sta aprendo in una nuova scheda), incolla ' +
      (ids.length === 1 ? 'l\'id' : 'gli id (già copiati negli appunti)') + ' nella ricerca ed elimina.\n\n' + shown
    );
    window.open('https://console.cloudinary.com/console/media_library', '_blank', 'noopener');
  }

  function updateAlbumSlugHint() {
    var slug = document.getElementById('albumSlug').value.trim();
    document.getElementById('albumSlugHint').textContent =
      'Pagina pubblica: /galleria/' + (slug || '…') + (_albumEditingId !== null ? ' — cambiarlo dopo la pubblicazione rompe i link già condivisi.' : '');
  }
  document.getElementById('albumTitle').addEventListener('input', function () {
    if (_albumSlugTouched) return;
    document.getElementById('albumSlug').value = this.value.trim() ? VV.slugify(this.value) : '';
    updateAlbumSlugHint();
  });
  document.getElementById('albumSlug').addEventListener('input', function () {
    _albumSlugTouched = true;
    /* Solo minuscole, numeri e trattini: gli spazi diventano trattini mentre scrivi. */
    var pos = this.selectionStart;
    var clean = this.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (clean !== this.value) { this.value = clean; try { this.setSelectionRange(pos, pos); } catch (e) {} }
    updateAlbumSlugHint();
  });

  /* Apre il modulo album: vuoto per un nuovo album, precompilato per modificarne uno esistente. */
  function openAlbumForm(album) {
    _albumEditingId = album ? album.id : null;
    var catSel = document.getElementById('albumCategory');
    /* Se la categoria dell'album non è più nell'elenco, la mantengo comunque selezionabile. */
    if (album && album.category && !Array.prototype.some.call(catSel.options, function (o) { return o.value === album.category; })) {
      catSel.insertAdjacentHTML('beforeend', '<option value="' + esc(album.category) + '">' + esc(album.category) + '</option>');
    }
    document.getElementById('albumTitle').value = album ? album.title || '' : '';
    /* Slug: nuovo album → si genera dal titolo finché non lo tocchi; album esistente → resta quello (anche se ricavato). */
    _albumSlugTouched = !!album;
    document.getElementById('albumSlug').value = album ? VV.getAlbumSlug(album) : '';
    updateAlbumSlugHint();
    document.getElementById('albumDate').value  = album ? album.date  || '' : '';
    if (album && album.category) catSel.value = album.category; else catSel.selectedIndex = 0;
    document.getElementById('albumSave').textContent = album ? 'Salva modifiche' : 'Crea album';
    showSubview('galleria', 'form');
    document.getElementById('topbarActions').innerHTML = '';
  }

  function renderGalleria() {
    showSubview('galleria', 'list');
    setTopbarBtn('Nuovo album', function () { openAlbumForm(null); });

    /* Aggiorna la select categorie con i dati Firestore attuali */
    var catSel = document.getElementById('albumCategory');
    catSel.innerHTML = VV.CATEGORIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    refreshAlbumsGrid();
  }

  function refreshAlbumsGrid() {
    var albums = VV.getAlbums();
    var grid   = document.getElementById('albumsGrid');

    if (!albums.length) {
      grid.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg><p>Nessun album ancora. Crea il primo!</p></div>';
      return;
    }

    var albumIds = albums.map(function (a) { return a.id; });
    PhotoDB.getCovers(albumIds, function (covers) {
      grid.innerHTML = albums.map(function (album) {
        var thumb = covers[album.id]
          ? '<img src="' + esc(covers[album.id]) + '" alt="">'
          : '<div class="album-thumb-placeholder">🖼️</div>';
        return '<div class="album-card" data-id="' + esc(album.id) + '">' +
          '<div class="album-thumb">' + thumb + '</div>' +
          '<div class="album-info">' +
            '<div class="album-title">' + esc(album.title) + '</div>' +
            '<div class="album-meta">' + VV.formatDateShort(album.date) + ' · ' + esc(album.category) + '</div>' +
            '<div class="album-footer">' +
              '<span class="chip chip--blue">' + (album.photoCount || 0) + ' foto</span>' +
              '<button class="btn-icon btn-icon--danger" onclick="event.stopPropagation();AdminActions.deleteAlbum(' + album.id + ')" title="Elimina album">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      grid.querySelectorAll('.album-card').forEach(function (card) {
        card.addEventListener('click', function () {
          openAlbum(+card.dataset.id);
        });
      });
    });
  }

  function openAlbum(albumId) {
    _currentAlbumId = albumId;
    var album = VV.getAlbum(albumId);
    showSubview('galleria', 'photos');

    document.getElementById('photosAlbumTitle').textContent = album ? album.title : '';

    var backBtn = document.createElement('button');
    backBtn.className = 'btn-ghost';
    backBtn.textContent = '← Tutti gli album';
    backBtn.addEventListener('click', renderGalleria);
    var editBtn = document.createElement('button');
    editBtn.className = 'btn-ghost';
    editBtn.textContent = 'Modifica album';
    editBtn.addEventListener('click', function () { openAlbumForm(VV.getAlbum(albumId)); });
    var actions = document.getElementById('topbarActions');
    actions.innerHTML = '';
    actions.appendChild(backBtn);
    actions.appendChild(editBtn);

    loadPhotos(albumId);
  }

  function loadPhotos(albumId) {
    PhotoDB.getPhotos(albumId, function (photos) {
      var grid = document.getElementById('photosGrid');
      if (!photos.length) {
        grid.innerHTML = '<div class="empty-state"><p>Nessuna foto ancora. Carica le prime!</p></div>';
        return;
      }
      grid.innerHTML = photos.map(function (p) {
        return '<div class="photo-item">' +
          '<img src="' + esc(p.thumb) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' +
          '<div class="photo-item-overlay">' +
            '<button class="photo-delete" data-pid="' + esc(p.id) + '" onclick="AdminActions.deletePhoto(this.dataset.pid)">Elimina</button>' +
          '</div>' +
        '</div>';
      }).join('');
    });
  }

  document.getElementById('photoUpload').addEventListener('change', function () {
    var files = this.files;
    if (!files || !files.length || _currentAlbumId === null) return;

    var progress  = document.getElementById('uploadProgress');
    var bar       = document.getElementById('uploadBarFill');
    var text      = document.getElementById('uploadProgressText');
    progress.classList.remove('is-hidden');
    bar.style.transform = 'scaleX(0)';

    if (!PhotoDB.isConfigured()) {
      progress.classList.add('is-hidden');
      alert('Cloudinary non è ancora configurato: imposta CLOUDINARY_CLOUD in js/config.js.');
      this.value = '';
      return;
    }

    var input = this;
    PhotoDB.addPhotos(_currentAlbumId, files,
      function (done, total) {
        var pct = Math.round(done / total * 100);
        bar.style.transform = 'scaleX(' + (pct / 100) + ')';
        text.textContent = done + ' / ' + total + ' foto caricate';
      },
      function (count, failed) {
        setTimeout(function () { progress.classList.add('is-hidden'); }, 800);
        loadPhotos(_currentAlbumId);
        input.value = '';
        if (failed && failed.length) {
          alert(failed.length + ' foto non caricate (' + count + ' ok):\n' + failed.slice(0, 15).join('\n') +
            (failed.length > 15 ? '\n…' : '') + '\n\nRiprova a caricare solo queste.');
        }
      }
    );
  });

  document.getElementById('albumSave').addEventListener('click', function () {
    var title = document.getElementById('albumTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var slug = document.getElementById('albumSlug').value.trim().replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') || VV.slugify(title);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { alert('Lo slug può contenere solo lettere minuscole, numeri e trattini.'); return; }
    var clash = VV.getAlbums().some(function (o) { return o.id !== _albumEditingId && VV.getAlbumSlug(o) === slug; });
    if (clash) { alert('Esiste già un album con questo indirizzo: "' + slug + '". Scegline un altro.'); return; }
    var fields = {
      title:    title,
      slug:     slug,
      date:     document.getElementById('albumDate').value,
      category: document.getElementById('albumCategory').value
    };
    /* In modifica si aggiornano solo questi campi: id, foto e conteggio restano quelli dell'album. */
    var existing = _albumEditingId !== null ? VV.getAlbum(_albumEditingId) : null;
    var album = existing ? Object.assign({}, existing, fields) : Object.assign({ photoCount: 0 }, fields);
    var saved = DB.saveAlbum(album);
    _albumEditingId = null;
    openAlbum(saved.id);
  });

  document.getElementById('albumCancel').addEventListener('click', function () {
    var editing = _albumEditingId;
    _albumEditingId = null;
    if (editing !== null && VV.getAlbum(editing)) openAlbum(editing); else renderGalleria();
  });

  /* ================================================
     UPLOAD IMMAGINI SU CLOUDINARY — copertine articoli, foto
     giocatori/staff, loghi sponsor e squadre. Stesso account/preset
     unsigned già usato dalla galleria (js/photodb.js): il campo salvato
     su Firestore resta un URL, mai più una stringa base64 inline.
  ================================================ */
  var IMG_UPLOAD_RETRIES = 2;

  function _uploadImage(blob, folder, ext, cb) {
    var fileName = folder + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9) + '.' + ext;
    function attempt(n) {
      var fd = new FormData();
      fd.append('file', blob, fileName);
      fd.append('upload_preset', window.CLOUDINARY_PRESET);
      fetch('https://api.cloudinary.com/v1_1/' + window.CLOUDINARY_CLOUD + '/image/upload', { method: 'POST', body: fd })
        .then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + res.status));
            return j;
          });
        })
        .then(function (j) { cb(null, j.secure_url); })
        .catch(function (err) {
          if (n >= IMG_UPLOAD_RETRIES) { cb(err); return; }
          setTimeout(function () { attempt(n + 1); }, 800 * (n + 1));
        });
    }
    attempt(0);
  }

  /* Migra un singolo campo immagine se contiene ancora una data URL base64:
     lo carica su Cloudinary e risolve con il nuovo URL. Se il campo è già un
     URL vero (o vuoto) lo restituisce invariato — rende la migrazione
     idempotente, sicura da rilanciare più volte. */
  /* Data URL → Blob decodificando il testo, senza fetch(): la CSP dell'admin (connect-src) non ammette data:. */
  function _dataUrlToBlob(dataUrl) {
    var m = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(dataUrl);
    if (!m) throw new Error('Immagine non valida');
    var isB64 = /;base64/i.test(m[2]);
    var raw = isB64 ? atob(m[3].replace(/\s/g, '')) : decodeURIComponent(m[3]);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
  }

  function _migrateFieldIfBase64(value, folder) {
    if (!value || value.indexOf('data:') !== 0) return Promise.resolve(value);
    return new Promise(function (resolve) { resolve(_dataUrlToBlob(value)); }).then(function (blob) {
      var ext = blob.type === 'image/png' ? 'png' : (blob.type === 'image/svg+xml' ? 'svg' : 'jpg');
      return new Promise(function (resolve, reject) {
        _uploadImage(blob, folder, ext, function (err, url) {
          if (err) reject(err); else resolve(url);
        });
      });
    });
  }

  /* ================================================
     IMMAGINE COPERTINA ARTICOLO — resize
     Mostrata come card (home) o dentro una colonna da
     ~500-600px (dettaglio articolo): mai a piena pagina,
     quindi non serve conservarla a risoluzione Full HD.
  ================================================ */

  function resizeToFullHD(file, cb) {
    var MAX_W = 1200, MAX_H = 675;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_W / w, MAX_H / h);
        var outW = Math.round(w * scale), outH = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        canvas.getContext('2d').drawImage(img, 0, 0, outW, outH);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        canvas.toBlob(function (blob) { cb(dataUrl, outW, outH, blob); }, 'image/jpeg', 0.78);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function _setArtPreview(src, info) {
    var wrap   = document.getElementById('artImagePreview');
    var imgEl  = document.getElementById('artImagePreviewImg');
    var infoEl = document.getElementById('artImagePreviewInfo');
    if (src) {
      imgEl.src = src;
      wrap.style.display = '';
    } else {
      wrap.style.display = 'none';
      imgEl.src = '';
    }
    if (infoEl) infoEl.textContent = info || '';
  }

  function _setArtCoverRatio(ratio) {
    document.querySelectorAll('input[name="artCoverRatio"]').forEach(function (r) {
      r.checked = (r.value === ratio);
    });
  }

  /* ---- Editor HTML per il contenuto articolo ---- */
  function _setArtContent(html) {
    document.getElementById('artContent').value = html || '';
    document.getElementById('artContentEditor').innerHTML = html || '';
    document.getElementById('artContentEditor').style.display = '';
    document.getElementById('artContent').style.display = 'none';
  }

  var _artRTEReady = false;
  function _initArtRTE() {
    if (_artRTEReady) return;
    _artRTEReady = true;
    var editor   = document.getElementById('artContentEditor');
    var textarea = document.getElementById('artContent');
    editor.setAttribute('data-placeholder', "Scrivi il testo dell'articolo…");

    document.querySelectorAll('#artContentToolbar .rte-btn[data-cmd]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editor.focus();
        document.execCommand(btn.getAttribute('data-cmd'), false, null);
        textarea.value = editor.innerHTML;
      });
    });
    document.querySelectorAll('#artContentToolbar .rte-btn[data-block]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editor.focus();
        document.execCommand('formatBlock', false, btn.getAttribute('data-block'));
        textarea.value = editor.innerHTML;
      });
    });
    document.getElementById('artContentLinkBtn').addEventListener('click', function () {
      var url = prompt('URL del link:', 'https://');
      if (!url) return;
      editor.focus();
      document.execCommand('createLink', false, url);
      textarea.value = editor.innerHTML;
    });
    editor.addEventListener('input', function () { textarea.value = editor.innerHTML; });

    document.getElementById('artContentSourceToggle').addEventListener('click', function () {
      var isSource = textarea.style.display !== 'none';
      if (isSource) {
        editor.innerHTML = textarea.value;
        editor.style.display   = '';
        textarea.style.display = 'none';
      } else {
        textarea.value = editor.innerHTML;
        textarea.style.display = '';
        editor.style.display   = 'none';
      }
    });
  }

  /* ---- Focal point picker per l'immagine di copertina articolo ---- */
  function _artApplyFocus(focus) {
    var pos = focus || '';
    var previewImg = document.getElementById('artImagePreviewImg');
    var focusImg   = document.getElementById('artFocusImg');
    if (previewImg) previewImg.style.objectPosition = pos;
    if (focusImg)   focusImg.style.objectPosition    = pos;
  }

  function _showArtFocusPicker(src, focus) {
    document.getElementById('artFocusPicker').style.display = '';
    document.getElementById('artFocusImg').src = src;
    var parts = (focus || '').match(/(\d+(?:\.\d+)?)%\s*(\d+(?:\.\d+)?)%/);
    var x = parts ? +parts[1] : 50;
    var y = parts ? +parts[2] : 50;
    _artApplyFocus(focus || '');
    _updateFocusDot('art', x, y);
  }

  function _hideArtFocusPicker() {
    document.getElementById('artFocusPicker').style.display = 'none';
  }

  var _artFocusInputsReady = false;
  function _initArtFocusInputs() {
    if (_artFocusInputsReady) return;
    _artFocusInputsReady = true;
    document.getElementById('artFocusWrap').addEventListener('click', function (e) {
      var rect = this.getBoundingClientRect();
      var x = Math.max(0, Math.min(100, Math.round((e.clientX - rect.left) / rect.width  * 100)));
      var y = Math.max(0, Math.min(100, Math.round((e.clientY - rect.top)  / rect.height * 100)));
      var focus = x + '% ' + y + '%';
      document.getElementById('artPhotoFocus').value = focus;
      _artApplyFocus(focus);
      _updateFocusDot('art', x, y);
    });
    document.getElementById('artImage').addEventListener('input', function () {
      var val = this.value.trim();
      if (val) _showArtFocusPicker(val, document.getElementById('artPhotoFocus').value);
      else      _hideArtFocusPicker();
    });
  }

  document.getElementById('artImageFile').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    document.getElementById('artImagePreviewInfo').textContent = 'Ridimensionamento in corso…';
    document.getElementById('artImagePreview').style.display = '';
    resizeToFullHD(file, function (dataUrl, w, h, blob) {
      document.getElementById('artImage').value = '';
      document.getElementById('artPhotoFocus').value = '';
      _setArtPreview(dataUrl, w + ' × ' + h + ' px · caricamento…');
      _showArtFocusPicker(dataUrl, '');
      var saveBtn = document.getElementById('artSave');
      saveBtn.disabled = true;
      _uploadImage(blob, 'articles', 'jpg', function (err, url) {
        saveBtn.disabled = false;
        if (err) {
          console.error('[admin] upload copertina articolo', err);
          _setArtPreview(dataUrl, w + ' × ' + h + ' px · ⚠ errore caricamento, riprova');
          return;
        }
        document.getElementById('artImage').value = url;
        var kb = Math.round(blob.size / 1024);
        var info = w + ' × ' + h + ' px · ~' + kb + ' KB';
        if (kb > 750) info += '  ⚠ file grande';
        _setArtPreview(dataUrl, info);
      });
    });
    this.value = '';
  });

  document.getElementById('artImageClear').addEventListener('click', function () {
    document.getElementById('artImage').value = '';
    document.getElementById('artPhotoFocus').value = '';
    _setArtPreview(null);
    _hideArtFocusPicker();
  });

  /* ================================================
     LOGO UPLOAD INTEGRATO NEL FORM PARTITA
  ================================================ */

  /* Flood fill dai bordi: rimuove solo il bianco esterno al logo */
  function _removeWhiteBg(ctx, w, h) {
    var data    = ctx.getImageData(0, 0, w, h);
    var px      = data.data;
    var visited = new Uint8Array(w * h);
    var queue   = [];
    var THR     = 225; /* luminosità minima */
    var MAXDIFF = 20;  /* differenza massima tra canali: cattura anche bianchi "sporchi"/leggermente colorati */

    for (var x = 0; x < w; x++) { queue.push(x, 0); queue.push(x, h - 1); }
    for (var y = 1; y < h - 1; y++) { queue.push(0, y); queue.push(w - 1, y); }

    var i = 0;
    while (i < queue.length) {
      var qx = queue[i++], qy = queue[i++];
      if (qx < 0 || qx >= w || qy < 0 || qy >= h) continue;
      var idx = qy * w + qx;
      if (visited[idx]) continue;
      visited[idx] = 1;
      var pi = idx * 4;
      var r = px[pi], g = px[pi + 1], b = px[pi + 2];
      var minC = Math.min(r, g, b), maxC = Math.max(r, g, b);
      var isWhitish = minC >= THR && (maxC - minC) <= MAXDIFF;
      var isTransparent = px[pi + 3] < 10;
      if (isWhitish || isTransparent) {
        px[pi + 3] = 0;
        queue.push(qx - 1, qy); queue.push(qx + 1, qy);
        queue.push(qx, qy - 1); queue.push(qx, qy + 1);
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  /* Trova il bounding box del contenuto non-trasparente e riscala a size×size */
  function _trimAndScale(srcCanvas, size) {
    var ctx  = srcCanvas.getContext('2d');
    var data = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    var px   = data.data;
    var w    = srcCanvas.width, h = srcCanvas.height;
    var minX = w, minY = h, maxX = 0, maxY = 0;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX > maxX || minY > maxY) return srcCanvas;

    var cropW   = maxX - minX + 1;
    var cropH   = maxY - minY + 1;
    var padding = Math.round(size * 0.05);
    var avail   = size - padding * 2;
    var scale   = Math.min(avail / cropW, avail / cropH);
    var drawW   = Math.round(cropW * scale);
    var drawH   = Math.round(cropH * scale);
    var offX    = Math.round((size - drawW) / 2);
    var offY    = Math.round((size - drawH) / 2);

    /* Step-wise upscale: raddoppia al massimo 2x per step per preservare i dettagli */
    var tmp = document.createElement('canvas');
    tmp.width = cropW; tmp.height = cropH;
    tmp.getContext('2d').drawImage(srcCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    while (tmp.width < drawW * 0.75 || tmp.height < drawH * 0.75) {
      var nextW = Math.min(tmp.width * 2, drawW);
      var nextH = Math.min(tmp.height * 2, drawH);
      var step  = document.createElement('canvas');
      step.width = nextW; step.height = nextH;
      var sCtx  = step.getContext('2d');
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';
      sCtx.drawImage(tmp, 0, 0, nextW, nextH);
      tmp = step;
    }

    var out    = document.createElement('canvas');
    out.width  = out.height = size;
    var outCtx = out.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(tmp, 0, 0, tmp.width, tmp.height, offX, offY, drawW, drawH);
    return out;
  }

  function convertLogoToPng(file, size, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth  || 0;
        var h = img.naturalHeight || 0;

        if ((w === 0 || h === 0) && file.type === 'image/svg+xml') {
          try {
            var str = dataUrl.indexOf('base64,') > -1
              ? atob(dataUrl.split('base64,')[1])
              : decodeURIComponent(dataUrl.split(',')[1]);
            var vb = str.match(/viewBox\s*=\s*["']?\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
            if (vb) { w = Math.round(+vb[1]); h = Math.round(+vb[2]); }
          } catch (_) {}
        }
        if (w === 0) w = 128;
        if (h === 0) h = 128;

        var canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0);
        _removeWhiteBg(ctx, w, h);
        var finalCanvas = _trimAndScale(canvas, size);
        var outDataUrl = finalCanvas.toDataURL('image/png');
        finalCanvas.toBlob(function (blob) { cb(outDataUrl, blob); }, 'image/png');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function _syncLogoPreview(inputId, previewId) {
    var val     = document.getElementById(inputId).value;
    var preview = document.getElementById(previewId);
    if (val) { preview.src = val; preview.style.display = ''; }
    else       preview.style.display = 'none';
  }

  var _logoInputsReady = false;
  function _initLogoInputs() {
    if (_logoInputsReady) return;
    _logoInputsReady = true;

    [
      { file: 'homeLogoFile', url: 'matchHomeLogo', preview: 'homeLogoPreview' },
      { file: 'awayLogoFile', url: 'matchAwayLogo', preview: 'awayLogoPreview' }
    ].forEach(function (cfg) {
      document.getElementById(cfg.file).addEventListener('change', function () {
        if (!this.files.length) return;
        var fileEl = this;
        convertLogoToPng(this.files[0], 256, function (dataUrl, blob) {
          document.getElementById(cfg.url).value = '';
          var preview = document.getElementById(cfg.preview);
          preview.src = dataUrl;
          preview.style.display = '';
          fileEl.value = '';
          var saveBtn = document.getElementById('matchSave');
          saveBtn.disabled = true;
          _uploadImage(blob, 'matches', 'png', function (err, url) {
            saveBtn.disabled = false;
            if (err) { console.error('[admin] upload logo squadra', err); alert('Errore caricamento logo, riprova.'); return; }
            document.getElementById(cfg.url).value = url;
          });
        });
      });

      document.getElementById(cfg.url).addEventListener('input', function () {
        _syncLogoPreview(cfg.url, cfg.preview);
      });
    });
  }

  /* ================================================
     SQUADRE
  ================================================ */
  var _catEditing          = null;
  var _playerEditing       = null;
  var _staffEditing        = null;
  var _currentCatId        = null;
  var _currentAdminSeason  = null;

  var _SQUAD_PANELS = ['squadreList', 'squadreCatForm', 'squadrePlayerForm', 'squadreStaffForm'];

  function _showSquadrePanel(id) {
    _SQUAD_PANELS.forEach(function (p) {
      document.getElementById(p).classList.toggle('is-hidden', p !== id);
    });
  }

  function renderSquadre() {
    _showSquadrePanel('squadreList');
    setTopbarBtn('Nuova categoria', function () { openCategoryForm(null); });

    /* Popola select stagioni */
    var seasons = VV.getSeasons();
    if (!_currentAdminSeason) {
      _currentAdminSeason = (VV.getCurrentSeason() || seasons[0] || { id: '2025/2026' }).id;
    }
    var sel = document.getElementById('squadreStagioneSelect');
    sel.innerHTML = seasons.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === _currentAdminSeason ? ' selected' : '') + '>' +
        s.name + (s.current ? ' (corrente)' : '') + '</option>';
    }).join('');
    sel.onchange = function () {
      _currentAdminSeason = this.value;
      refreshSquadreAccordion();
    };

    refreshSquadreAccordion();
  }

  function refreshSquadreAccordion() {
    var categories = VV.getCategories();
    var accordion  = document.getElementById('squadreAccordion');

    if (!categories.length) {
      accordion.innerHTML = '<div class="empty-state"><p>Nessuna categoria. Creane una!</p></div>';
      return;
    }

    var EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var DEL_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';

    var DRAG_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>';

    function rosterOrderKey(p, isPlayer) {
      if (p.order != null) return p.order;
      return isPlayer && p.number != null ? p.number : 999;
    }

    accordion.innerHTML = categories.map(function (cat) {
      var players = VV.getPlayers(cat.id)
        .filter(function (p) { return !p.stagione || p.stagione === _currentAdminSeason; })
        .sort(function (a, b) { return rosterOrderKey(a, true) - rosterOrderKey(b, true); });
      var staff = VV.getStaff(cat.id)
        .filter(function (s) { return !s.stagione || s.stagione === _currentAdminSeason; })
        .sort(function (a, b) { return rosterOrderKey(a, false) - rosterOrderKey(b, false); });

      function personRow(p, isPlayer) {
        var avatar = p.photo
          ? '<img src="' + esc(p.photo) + '" class="roster-avatar">'
          : '<div class="roster-avatar roster-avatar--placeholder">&#128100;</div>';
        var numBadge = isPlayer
          ? '<span class="roster-number">' + (p.number ? '#' + p.number : '—') + '</span>'
          : '';
        var editCb = isPlayer
          ? 'AdminActions.editPlayer(' + p.id + ',' + cat.id + ')'
          : 'AdminActions.editStaff(' + p.id + ',' + cat.id + ')';
        var delCb = isPlayer
          ? 'AdminActions.deletePlayer(' + p.id + ')'
          : 'AdminActions.deleteStaff(' + p.id + ')';
        return '<div class="roster-person" draggable="true" data-id="' + p.id + '">' +
          '<span class="roster-drag" title="Trascina per riordinare">' + DRAG_ICON + '</span>' +
          avatar + numBadge +
          '<div class="roster-info"><div class="roster-name">' + esc(p.name) + '</div><div class="roster-role">' + esc(p.role) + '</div></div>' +
          '<div class="table-actions">' +
            '<button class="btn-icon" onclick="' + editCb + '" title="Modifica">' + EDIT_ICON + '</button>' +
            '<button class="btn-icon btn-icon--danger" onclick="' + delCb + '" title="Elimina">' + DEL_ICON + '</button>' +
          '</div>' +
        '</div>';
      }

      var staffRows   = staff.length   ? staff.map(function (s) { return personRow(s, false); }).join('') : '<div class="roster-empty">Nessun membro dello staff.</div>';
      var playerRows  = players.length ? players.map(function (p) { return personRow(p, true);  }).join('') : '<div class="roster-empty">Nessuna giocatrice / giocatore.</div>';
      var inactiveBadge = cat.active ? '' : ' <span class="chip chip--gray" style="font-size:10px">Inattiva</span>';

      return '<div class="squad-category-block">' +
        '<div class="squad-cat-header">' +
          '<div class="squad-cat-icon" style="background:' + esc(cat.color) + '">' + esc(cat.abbr) + '</div>' +
          '<div class="squad-cat-info">' +
            '<div class="squad-cat-name">' + esc(cat.name) + inactiveBadge + '</div>' +
            (cat.description ? '<div class="squad-cat-desc">' + esc(cat.description) + (cat.schedule ? ' · ' + esc(cat.schedule) : '') + '</div>' : '') +
          '</div>' +
          '<div class="table-actions" style="margin-left:auto;flex-shrink:0">' +
            '<button class="btn-icon" onclick="AdminActions.editCategory(' + cat.id + ')" title="Modifica">' + EDIT_ICON + '</button>' +
            '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteCategory(' + cat.id + ')" title="Elimina">' + DEL_ICON + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="squad-subsection">' +
          '<div class="squad-subsection-hd"><span>Staff tecnico</span><button class="btn-sm" onclick="AdminActions.addStaff(' + cat.id + ')">+ Aggiungi</button></div>' +
          '<div class="roster-list" id="rosterStaff-' + cat.id + '" data-type="staff">' + staffRows + '</div>' +
        '</div>' +
        '<div class="squad-subsection">' +
          '<div class="squad-subsection-hd"><span>Roster</span><button class="btn-sm" onclick="AdminActions.addPlayer(' + cat.id + ')">+ Aggiungi</button></div>' +
          '<div class="roster-list" id="rosterPlayers-' + cat.id + '" data-type="player">' + playerRows + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    accordion.querySelectorAll('.roster-list').forEach(function (list) {
      _initRosterDnD(list, list.getAttribute('data-type'));
    });
  }

  /* ---- Drag & drop riordino roster (staff/giocatori) ---- */
  var _rosterDragEl = null;

  function _initRosterDnD(container, listType) {
    container.querySelectorAll('.roster-person').forEach(function (row) {
      row.addEventListener('dragstart', function () {
        _rosterDragEl = row;
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('is-dragging');
        _rosterDragEl = null;
      });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (!_rosterDragEl || _rosterDragEl === row || _rosterDragEl.parentElement !== container) return;
        var rect  = row.getBoundingClientRect();
        var after = (e.clientY - rect.top) > rect.height / 2;
        container.insertBefore(_rosterDragEl, after ? row.nextSibling : row);
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        _persistRosterOrder(container, listType);
      });
    });
  }

  function _persistRosterOrder(container, listType) {
    var isPlayer = listType === 'player';
    var all = isPlayer ? VV.getPlayers() : VV.getStaff();
    Array.prototype.forEach.call(container.querySelectorAll('.roster-person'), function (row, idx) {
      var id   = +row.getAttribute('data-id');
      var item = all.find(function (x) { return x.id === id; });
      if (item && item.order !== idx + 1) {
        item.order = idx + 1;
        if (isPlayer) DB.savePlayer(item); else DB.saveStaffMember(item);
      }
    });
  }

  /* ---- Category form ---- */
  function openCategoryForm(cat) {
    _catEditing = cat;
    _showSquadrePanel('squadreCatForm');
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('catName').value             = cat ? (cat.name        || '') : '';
    document.getElementById('catAbbr').value             = cat ? (cat.abbr        || '') : '';
    document.getElementById('catColor').value            = cat ? (cat.color       || '#008CFD') : '#008CFD';
    document.getElementById('catDescription').value      = cat ? (cat.description || '') : '';
    document.getElementById('catSchedule').value         = cat ? (cat.schedule    || '') : '';
    document.getElementById('catShowInSquadre').checked  = cat ? (cat.showInSquadre !== false) : true;
    document.getElementById('catActive').checked         = cat ? (cat.active !== false) : true;
  }

  document.getElementById('catSave').addEventListener('click', function () {
    var name = document.getElementById('catName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var abbr = document.getElementById('catAbbr').value.trim().toUpperCase() || name.slice(0, 3).toUpperCase();
    var cat = Object.assign({}, _catEditing || {}, {
      name:          name,
      abbr:          abbr,
      color:         document.getElementById('catColor').value,
      description:   document.getElementById('catDescription').value.trim(),
      schedule:      document.getElementById('catSchedule').value.trim(),
      showInSquadre: document.getElementById('catShowInSquadre').checked,
      active:        document.getElementById('catActive').checked
    });
    DB.saveCategory(cat, renderSquadre);
  });

  document.getElementById('catCancel').addEventListener('click', renderSquadre);

  /* ---- Player form ---- */
  function openPlayerForm(player, categoryId) {
    _playerEditing = player;
    _currentCatId  = categoryId;
    _initPersonPhotoInputs();
    _showSquadrePanel('squadrePlayerForm');
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('playerName').value    = player ? (player.name   || '') : '';
    document.getElementById('playerNumber').value  = player ? (player.number || '') : '';
    document.getElementById('playerRole').value    = player ? (player.role   || 'Laterale') : 'Laterale';
    document.getElementById('playerGender').value  = player ? (player.gender || 'M') : 'M';
    document.getElementById('playerYear').value    = player ? (player.year   || '') : '';
    document.getElementById('playerPhoto').value   = player ? (player.photo  || '') : '';
    document.getElementById('playerPhotoFocus').value = player ? (player.photoFocus || '50% 25%') : '50% 25%';
    if (player && player.photo) {
      _showFocusPicker('player', player.photo, player.photoFocus || '50% 25%');
    } else {
      _hideFocusPicker('player');
    }
  }

  document.getElementById('playerSave').addEventListener('click', function () {
    var name = document.getElementById('playerName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var numVal  = document.getElementById('playerNumber').value;
    var yearVal = document.getElementById('playerYear').value;
    var player = Object.assign({}, _playerEditing || {}, {
      categoryId:  _currentCatId,
      name:        name,
      number:      numVal  ? +numVal  : null,
      role:        document.getElementById('playerRole').value,
      gender:      document.getElementById('playerGender').value || 'M',
      year:        yearVal ? +yearVal : null,
      photo:       document.getElementById('playerPhoto').value.trim(),
      photoFocus:  document.getElementById('playerPhotoFocus').value || '50% 25%'
    });
    if (!player.stagione) player.stagione = _currentAdminSeason || (VV.getCurrentSeason() || {}).id || '2025/2026';
    DB.savePlayer(player, renderSquadre);
  });

  document.getElementById('playerCancel').addEventListener('click', renderSquadre);

  /* ---- Staff form ---- */
  function openStaffForm(person, categoryId) {
    _staffEditing = person;
    _currentCatId = categoryId;
    _initPersonPhotoInputs();
    _showSquadrePanel('squadreStaffForm');
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('staffName').value  = person ? (person.name  || '') : '';
    document.getElementById('staffRole').value  = person ? (person.role  || 'Allenatore') : 'Allenatore';
    document.getElementById('staffPhoto').value = person ? (person.photo || '') : '';
    document.getElementById('staffPhotoFocus').value = person ? (person.photoFocus || '50% 25%') : '50% 25%';
    if (person && person.photo) {
      _showFocusPicker('staff', person.photo, person.photoFocus || '50% 25%');
    } else {
      _hideFocusPicker('staff');
    }
  }

  document.getElementById('staffSave').addEventListener('click', function () {
    var name = document.getElementById('staffName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var person = Object.assign({}, _staffEditing || {}, {
      categoryId: _currentCatId,
      name:       name,
      role:       document.getElementById('staffRole').value,
      photo:      document.getElementById('staffPhoto').value.trim(),
      photoFocus: document.getElementById('staffPhotoFocus').value || '50% 25%'
    });
    if (!person.stagione) person.stagione = _currentAdminSeason || (VV.getCurrentSeason() || {}).id || '2025/2026';
    DB.saveStaffMember(person, renderSquadre);
  });

  document.getElementById('staffCancel').addEventListener('click', renderSquadre);

  function resizePlayerPhoto(file, cb) {
    var MAX = 800;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX / w, MAX / h);
        var outW = Math.round(w * scale), outH = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        canvas.toBlob(function (blob) { cb(dataUrl, blob); }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function _showFocusPicker(prefix, src, focus) {
    var picker = document.getElementById(prefix + 'FocusPicker');
    picker.style.display = '';
    document.getElementById(prefix + 'FocusImg').src  = src;
    document.getElementById(prefix + 'FocusCard').src = src;
    var parts = (focus || '50% 25%').match(/(\d+(?:\.\d+)?)%\s*(\d+(?:\.\d+)?)%/);
    var x = parts ? +parts[1] : 50;
    var y = parts ? +parts[2] : 25;
    var pos = x + '% ' + y + '%';
    document.getElementById(prefix + 'FocusImg').style.objectPosition  = pos;
    document.getElementById(prefix + 'FocusCard').style.objectPosition = pos;
    _updateFocusDot(prefix, x, y);
  }

  function _hideFocusPicker(prefix) {
    document.getElementById(prefix + 'FocusPicker').style.display = 'none';
  }

  function _updateFocusDot(prefix, x, y) {
    var dot = document.getElementById(prefix + 'FocusDot');
    dot.style.left = x + '%';
    dot.style.top  = y + '%';
  }

  function _initFocusWrap(prefix) {
    document.getElementById(prefix + 'FocusWrap').addEventListener('click', function (e) {
      var rect = this.getBoundingClientRect();
      var x = Math.round((e.clientX - rect.left) / rect.width  * 100);
      var y = Math.round((e.clientY - rect.top)  / rect.height * 100);
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
      var focus = x + '% ' + y + '%';
      document.getElementById(prefix + 'PhotoFocus').value = focus;
      document.getElementById(prefix + 'FocusImg').style.objectPosition  = focus;
      document.getElementById(prefix + 'FocusCard').style.objectPosition = focus;
      _updateFocusDot(prefix, x, y);
    });
  }

  var _personPhotoInputsReady = false;
  function _initPersonPhotoInputs() {
    if (_personPhotoInputsReady) return;
    _personPhotoInputsReady = true;

    /* Player: resize JPEG + focal point picker */
    document.getElementById('playerPhotoFile').addEventListener('change', function () {
      if (!this.files.length) return;
      var fileEl = this;
      resizePlayerPhoto(this.files[0], function (dataUrl, blob) {
        var focus = document.getElementById('playerPhotoFocus').value || '50% 25%';
        document.getElementById('playerPhoto').value = '';
        _showFocusPicker('player', dataUrl, focus);
        fileEl.value = '';
        var saveBtn = document.getElementById('playerSave');
        saveBtn.disabled = true;
        _uploadImage(blob, 'players', 'jpg', function (err, url) {
          saveBtn.disabled = false;
          if (err) { console.error('[admin] upload foto giocatore', err); alert('Errore caricamento foto, riprova.'); return; }
          document.getElementById('playerPhoto').value = url;
        });
      });
    });
    document.getElementById('playerPhoto').addEventListener('input', function () {
      var val = this.value.trim();
      if (val) _showFocusPicker('player', val, document.getElementById('playerPhotoFocus').value || '50% 25%');
      else     _hideFocusPicker('player');
    });
    _initFocusWrap('player');

    /* Staff: resize JPEG + focal point picker */
    document.getElementById('staffPhotoFile').addEventListener('change', function () {
      if (!this.files.length) return;
      var fileEl = this;
      resizePlayerPhoto(this.files[0], function (dataUrl, blob) {
        var focus = document.getElementById('staffPhotoFocus').value || '50% 25%';
        document.getElementById('staffPhoto').value = '';
        _showFocusPicker('staff', dataUrl, focus);
        fileEl.value = '';
        var saveBtn = document.getElementById('staffSave');
        saveBtn.disabled = true;
        _uploadImage(blob, 'staff', 'jpg', function (err, url) {
          saveBtn.disabled = false;
          if (err) { console.error('[admin] upload foto staff', err); alert('Errore caricamento foto, riprova.'); return; }
          document.getElementById('staffPhoto').value = url;
        });
      });
    });
    document.getElementById('staffPhoto').addEventListener('input', function () {
      var val = this.value.trim();
      if (val) _showFocusPicker('staff', val, document.getElementById('staffPhotoFocus').value || '50% 25%');
      else     _hideFocusPicker('staff');
    });
    _initFocusWrap('staff');
  }

  /* ================================================
     STAGIONI
  ================================================ */
  function renderStagioni() {
    document.getElementById('stagioneAddBtn').onclick = function () {
      document.getElementById('stagioneName').value = '';
      document.getElementById('stagioneCurrent').checked = false;
      document.getElementById('stagionForm').classList.remove('is-hidden');
      document.getElementById('stagioneName').focus();
    };
    refreshStagionList();
  }

  function refreshStagionList() {
    var seasons = VV.getSeasons();
    var list    = document.getElementById('stagionList');

    list.innerHTML = seasons.map(function (s) {
      var isCurrent = !!s.current;
      return '<div class="sp-item" style="align-items:center">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="sp-item-nome" style="font-size:15px">' + esc(s.name || s.id) + '</div>' +
          (isCurrent
            ? '<span class="chip chip--green" style="font-size:11px;margin-top:4px">Corrente</span>'
            : '') +
        '</div>' +
        (!isCurrent
          ? '<button class="btn-ghost" style="font-size:12px;padding:5px 12px" onclick="AdminActions.setCurrentSeason(\'' + esc(s.id) + '\')">Imposta come corrente</button>'
          : '') +
        (!isCurrent
          ? '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteSeason(\'' + esc(s.id) + '\')" title="Elimina stagione" style="margin-left:8px">' + DEL_ICON_SM + '</button>'
          : '') +
      '</div>';
    }).join('') || '<p style="color:var(--a-muted);padding:24px 0">Nessuna stagione. Crea la prima!</p>';
  }

  document.getElementById('stagioneSave').addEventListener('click', function () {
    var name = document.getElementById('stagioneName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var setCurrent = document.getElementById('stagioneCurrent').checked;
    if (setCurrent) VV.setCurrentSeason(null); /* deseleziona tutte */
    var season = { id: name, name: name, current: setCurrent };
    DB.saveSeason(season, function () {
      document.getElementById('stagionForm').classList.add('is-hidden');
      refreshStagionList();
    });
  });

  document.getElementById('stagioneCancel').addEventListener('click', function () {
    document.getElementById('stagionForm').classList.add('is-hidden');
  });

  /* ================================================
     MAGLIA (teaser homepage)
  ================================================ */
  function renderMaglia() {
    var m = VV.getMaglia();
    document.getElementById('magliaEnabled').checked = m.enabled !== false;
    document.getElementById('magliaTitle').value = m.title || '';
    document.getElementById('magliaSubtitle').value = m.subtitle || '';
    document.getElementById('magliaRevealDate').value = (m.revealDate || '').slice(0, 16);
    document.getElementById('magliaVideoUrl').value = m.videoUrl || '';
  }

  document.getElementById('magliaSave').addEventListener('click', function () {
    var revealRaw = document.getElementById('magliaRevealDate').value;
    var title = document.getElementById('magliaTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var videoUrl = document.getElementById('magliaVideoUrl').value.trim();
    if (videoUrl && !/(youtu\.be\/|youtube(-nocookie)?\.com\/)/.test(videoUrl)) {
      alert('Il link deve essere un video YouTube (youtube.com o youtu.be).'); return;
    }
    var obj = {
      enabled:    document.getElementById('magliaEnabled').checked,
      title:      title,
      subtitle:   document.getElementById('magliaSubtitle').value.trim(),
      revealDate: revealRaw ? revealRaw + ':00' : '',
      videoUrl:   videoUrl
    };
    DB.saveMaglia(obj, function () { renderMaglia(); });
  });

  /* ================================================
     SPONSOR
  ================================================ */
  var _spEditing = null;
  var SP_REPS_DEFAULT = { gold: 1, silver: 3, bronze: 1 };

  function renderSponsor() {
    refreshSpList();

    var levelsSub = VV.getLivelliSponsorSub();
    document.getElementById('spSubGold').value   = levelsSub.gold;
    document.getElementById('spSubSilver').value = levelsSub.silver;
    document.getElementById('spSubBronze').value = levelsSub.bronze;

    document.getElementById('spLevelsTextSave').onclick = function () {
      var obj = {
        gold:   document.getElementById('spSubGold').value.trim(),
        silver: document.getElementById('spSubSilver').value.trim(),
        bronze: document.getElementById('spSubBronze').value.trim()
      };
      var statusEl = document.getElementById('spLevelsTextStatus');
      DB.saveLivelliSponsorSub(obj, function () {
        statusEl.textContent = '✓ Salvato';
        statusEl.style.color = 'var(--a-green)';
        setTimeout(function () { statusEl.textContent = ''; }, 2500);
      });
    };

    document.getElementById('spAddBtn').onclick = function () {
      _spEditing = null;
      document.getElementById('spFormTitle').textContent = 'Nuovo sponsor';
      document.getElementById('spLogoUrl').value  = '';
      document.getElementById('spNome').value      = '';
      document.getElementById('spUrl').value       = '';
      document.getElementById('spOrder').value     = String(VV.getSponsors().length + 1);
      document.getElementById('spLivello').value   = 'silver';
      _popolaSpAzienda(null);
      document.getElementById('spRipetizioni').value = String(SP_REPS_DEFAULT.silver);
      document.getElementById('spLogoPreview').style.display = 'none';
      document.getElementById('spLogoEditor').style.display = 'none';
      document.getElementById('spForm').classList.remove('is-hidden');
      document.getElementById('spNome').focus();
    };

    document.getElementById('spFormCancel').onclick = function () {
      document.getElementById('spForm').classList.add('is-hidden');
      document.getElementById('spLogoEditor').style.display = 'none';
    };

    document.getElementById('spLivello').onchange = function () {
      document.getElementById('spRipetizioni').value = String(SP_REPS_DEFAULT[this.value] || 1);
    };

    document.getElementById('spLogoUrl').addEventListener('input', _syncSpPreview);

    document.getElementById('spLogoFile').onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var removeBg = document.getElementById('spLogoRemoveBg').checked;
      _prepareSpLogoSource(file, removeBg, function (dataUrl, w, h) {
        _initSpLogoEditor();
        document.getElementById('spLogoEditorHint').textContent = removeBg
          ? 'Lo sfondo quasi bianco è già stato rimosso in automatico. Trascina per posizionare e usa lo slider per zoomare, così ritagli esattamente la parte che ti serve:'
          : 'Trascina per posizionare e usa lo slider per zoomare, così ritagli esattamente la parte che ti serve:';
        _openSpLogoEditor(dataUrl, w, h);
      });
      e.target.value = '';
    };

    document.getElementById('spFormSave').onclick = function () {
      var nome = document.getElementById('spNome').value.trim();
      var logo = document.getElementById('spLogoUrl').value.trim();
      if (!nome) { alert('Il nome è obbligatorio.'); return; }
      if (!logo) { alert('Il logo è obbligatorio: carica un\'immagine per questo sponsor.'); return; }
      var item = {
        id:          _spEditing ? _spEditing.id : Date.now(),
        nome:        nome,
        logo:        logo,
        url:         document.getElementById('spUrl').value.trim(),
        order:       parseInt(document.getElementById('spOrder').value, 10) || 1,
        livello:     document.getElementById('spLivello').value || 'silver',
        ripetizioni: Math.max(1, parseInt(document.getElementById('spRipetizioni').value, 10) || 1)
      };
      var list = VV.getSponsors().filter(function (s) { return s.id !== item.id; });
      list.push(item);
      list.sort(function (a, b) { return a.order - b.order; });
      DB.saveSponsors(list);
      document.getElementById('spForm').classList.add('is-hidden');
      _salvaCollegamentoSponsor(item.id, document.getElementById('spAzienda').value).then(refreshSpList);
      refreshSpList();
    };
  }

  function _syncSpPreview() {
    var val  = document.getElementById('spLogoUrl').value.trim();
    var prev = document.getElementById('spLogoPreview');
    if (val) { prev.src = val; prev.style.display = ''; }
    else      { prev.style.display = 'none'; }
  }

  /* ---- Editor logo sponsor: rimozione sfondo automatica + ritaglio/zoom manuale ---- */
  var SP_LOGO_OUT_SIZE   = 320; /* lato del PNG quadrato finale */
  var SP_LOGO_MAX_SRC    = 800; /* lato massimo dell'immagine sorgente caricata nell'editor */
  var _spLogoEditorReady = false;
  var _spLogoEditor = {
    naturalW: 0, naturalH: 0, baseScale: 1, zoom: 1, offX: 0, offY: 0,
    dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0
  };

  /* Carica il file e, se richiesto, rimuove lo sfondo quasi-bianco (NON ritaglia/centra:
     l'inquadratura finale la sceglie l'admin nell'editor). */
  function _prepareSpLogoSource(file, removeBg, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth  || 0;
        var h = img.naturalHeight || 0;

        if ((w === 0 || h === 0) && file.type === 'image/svg+xml') {
          try {
            var str = dataUrl.indexOf('base64,') > -1
              ? atob(dataUrl.split('base64,')[1])
              : decodeURIComponent(dataUrl.split(',')[1]);
            var vb = str.match(/viewBox\s*=\s*["']?\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
            if (vb) { w = Math.round(+vb[1]); h = Math.round(+vb[2]); }
          } catch (_) {}
        }
        if (w === 0) w = 128;
        if (h === 0) h = 128;

        var scale = Math.min(1, SP_LOGO_MAX_SRC / w, SP_LOGO_MAX_SRC / h);
        var outW  = Math.max(1, Math.round(w * scale));
        var outH  = Math.max(1, Math.round(h * scale));

        var canvas = document.createElement('canvas');
        canvas.width  = outW;
        canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        if (removeBg) _removeWhiteBg(ctx, outW, outH);
        cb(canvas.toDataURL('image/png'), outW, outH);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function _spLogoEditorApplyTransform() {
    var img   = document.getElementById('spLogoEditorImg');
    var scale = _spLogoEditor.baseScale * _spLogoEditor.zoom;
    var w = _spLogoEditor.naturalW * scale;
    var h = _spLogoEditor.naturalH * scale;
    img.style.width       = w + 'px';
    img.style.height      = h + 'px';
    img.style.marginLeft  = (-w / 2 + _spLogoEditor.offX) + 'px';
    img.style.marginTop   = (-h / 2 + _spLogoEditor.offY) + 'px';
  }

  function _openSpLogoEditor(dataUrl, naturalW, naturalH) {
    document.getElementById('spLogoEditor').style.display = '';
    var viewport = document.getElementById('spLogoEditorViewport');
    var size = viewport.clientWidth || 180;
    _spLogoEditor.naturalW  = naturalW;
    _spLogoEditor.naturalH  = naturalH;
    _spLogoEditor.baseScale = Math.min(size / naturalW, size / naturalH); /* contain: si vede tutta l'immagine */
    _spLogoEditor.zoom = 1;
    _spLogoEditor.offX = 0;
    _spLogoEditor.offY = 0;
    document.getElementById('spLogoEditorZoom').value = 100;
    document.getElementById('spLogoEditorImg').src = dataUrl;
    _spLogoEditorApplyTransform();
  }

  function _initSpLogoEditor() {
    if (_spLogoEditorReady) return;
    _spLogoEditorReady = true;

    var viewport = document.getElementById('spLogoEditorViewport');

    function dragStart(x, y) {
      _spLogoEditor.dragging  = true;
      _spLogoEditor.startX    = x;
      _spLogoEditor.startY    = y;
      _spLogoEditor.startOffX = _spLogoEditor.offX;
      _spLogoEditor.startOffY = _spLogoEditor.offY;
      viewport.style.cursor = 'grabbing';
    }
    function dragMove(x, y) {
      if (!_spLogoEditor.dragging) return;
      _spLogoEditor.offX = _spLogoEditor.startOffX + (x - _spLogoEditor.startX);
      _spLogoEditor.offY = _spLogoEditor.startOffY + (y - _spLogoEditor.startY);
      _spLogoEditorApplyTransform();
    }
    function dragEnd() {
      _spLogoEditor.dragging = false;
      viewport.style.cursor = 'grab';
    }

    viewport.addEventListener('mousedown', function (e) { dragStart(e.clientX, e.clientY); });
    window.addEventListener('mousemove', function (e) { dragMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', dragEnd);

    viewport.addEventListener('touchstart', function (e) { var t = e.touches[0]; dragStart(t.clientX, t.clientY); }, { passive: true });
    viewport.addEventListener('touchmove',  function (e) { var t = e.touches[0]; dragMove(t.clientX, t.clientY); },  { passive: true });
    viewport.addEventListener('touchend', dragEnd);

    document.getElementById('spLogoEditorZoom').addEventListener('input', function () {
      _spLogoEditor.zoom = +this.value / 100;
      _spLogoEditorApplyTransform();
    });

    document.getElementById('spLogoEditorCancel').addEventListener('click', function () {
      document.getElementById('spLogoEditor').style.display = 'none';
    });

    document.getElementById('spLogoEditorApply').addEventListener('click', function () {
      var OUT  = SP_LOGO_OUT_SIZE;
      var size = viewport.clientWidth || 180;
      var k     = OUT / size;
      var scale = _spLogoEditor.baseScale * _spLogoEditor.zoom * k;
      var w = _spLogoEditor.naturalW * scale;
      var h = _spLogoEditor.naturalH * scale;
      var dx = OUT / 2 - w / 2 + _spLogoEditor.offX * k;
      var dy = OUT / 2 - h / 2 + _spLogoEditor.offY * k;

      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = OUT;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(document.getElementById('spLogoEditorImg'), dx, dy, w, h);

      var prev = document.getElementById('spLogoPreview');
      prev.src = canvas.toDataURL('image/png');
      prev.style.display = '';
      document.getElementById('spLogoUrl').value = '';
      document.getElementById('spLogoEditor').style.display = 'none';

      var saveBtn = document.getElementById('spFormSave');
      saveBtn.disabled = true;
      canvas.toBlob(function (blob) {
        _uploadImage(blob, 'sponsors', 'png', function (err, url) {
          saveBtn.disabled = false;
          if (err) { console.error('[admin] upload logo sponsor', err); alert('Errore caricamento logo, riprova.'); return; }
          document.getElementById('spLogoUrl').value = url;
        });
      }, 'image/png');
    });
  }

  /* ---- Collegamento logo del sito → azienda della pipeline (campo sponsorSitoId sull'azienda, dato riservato) ---- */
  function _budgetB() { return window.Admin && window.Admin.budgetShared; }
  function _normNome(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function _popolaSpAzienda(s) {
    var sel = document.getElementById('spAzienda'), B = _budgetB();
    if (!sel) return;
    var az = ((B && B._aziende) || []).slice().sort(function (a, b) { return String(a.ragioneSociale || '').localeCompare(String(b.ragioneSociale || '')); });
    var attuale = s ? az.filter(function (a) { return a.sponsorSitoId === s.id; })[0] : null;
    if (!attuale && s) {   /* nome uguale e azienda non ancora collegata a un altro logo: la proponiamo */
      attuale = az.filter(function (a) { return _normNome(a.ragioneSociale) === _normNome(s.nome) && a.sponsorSitoId == null; })[0] || null;
    }
    sel.innerHTML = '<option value="">— nessuna —</option>' + az.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.ragioneSociale || '—') + '</option>'; }).join('');
    sel.value = attuale ? attuale.id : '';
  }
  function _salvaCollegamentoSponsor(siteId, aziendaId) {
    var B = _budgetB();
    if (!B || !B._aziende) return Promise.resolve();
    var ops = [];
    B._aziende.forEach(function (a) { if (a.sponsorSitoId === siteId && a.id !== aziendaId) ops.push({ a: a, v: null }); });
    var tgt = aziendaId ? B._aziende.filter(function (a) { return a.id === aziendaId; })[0] : null;
    if (tgt && tgt.sponsorSitoId !== siteId) ops.push({ a: tgt, v: siteId });
    return Promise.all(ops.map(function (o) {
      return db.collection('aziende').doc(o.a.id).update({ sponsorSitoId: o.v }).then(function () {
        o.a.sponsorSitoId = o.v;
        return window.Admin.logWrite('azienda', o.a.id, 'Azienda — ' + (o.a.ragioneSociale || ''), 'update', [{ campo: 'logo sul sito', prima: o.v == null ? 'collegato' : 'non collegato', dopo: o.v == null ? 'non collegato' : 'collegato' }]);
      });
    })).catch(function (e) { window.Admin.avviso('Collegamento alla pipeline non salvato: ' + e.message, 'errore'); });
  }
  function _pipelineDiSponsor(s) {
    var B = _budgetB();
    if (!B || !B._aziende) return '';
    var az = B._aziende.filter(function (a) { return a.sponsorSitoId === s.id; })[0];
    if (!az) return '<div class="sp-item-url" style="color:var(--a-muted)">Non collegato alla pipeline</div>';
    var sp = B._sponsorizzazioni.filter(function (x) { return x.aziendaId === az.id && x.seasonId === B._currentSeasonId; })[0];
    var t = sp ? B._statoLabel(sp.stato) + (sp.stato === 'chiuso' ? ' · ' + B._eur(+sp.importoConfermato || 0) : '') : 'nessuna sponsorizzazione in questa stagione';
    return '<div class="sp-item-url">Pipeline: ' + esc(az.ragioneSociale || '—') + ' · ' + esc(t) + '</div>';
  }

  var SP_TIER_RANK = { gold: 0, silver: 1, bronze: 2 };

  function refreshSpList() {
    var list     = document.getElementById('spList');
    var sponsors = VV.getSponsors().sort(function (a, b) {
      var ta = SP_TIER_RANK[a.livello || 'silver'];
      var tb = SP_TIER_RANK[b.livello || 'silver'];
      if (ta !== tb) return ta - tb;
      return (a.order||0) - (b.order||0);
    });
    if (!sponsors.length) {
      list.innerHTML = '<p style="color:var(--a-muted);padding:24px 0">Nessuno sponsor aggiunto.</p>';
      return;
    }
    var EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var DEL_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
    var TIER_LABEL = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
    list.innerHTML = sponsors.map(function (s) {
      var logoHtml = s.logo
        ? '<img src="' + esc(s.logo) + '" class="sp-item-logo" alt="">'
        : '<div class="sp-item-no-logo">' + esc((s.nome||'?').charAt(0)) + '</div>';
      var livello = s.livello || 'silver';
      return '<div class="sp-item">' +
        '<div class="sp-item-pos">' + (s.order||'—') + '</div>' +
        '<div class="sp-item-thumb">' + logoHtml + '</div>' +
        '<div class="sp-item-info">' +
          '<div class="sp-item-nome">' + esc(s.nome) + '</div>' +
          (s.url ? '<div class="sp-item-url">' + esc(s.url) + '</div>' : '') + _pipelineDiSponsor(s) +
        '</div>' +
        '<span class="sp-item-tier sp-item-tier--' + livello + '">' + TIER_LABEL[livello] + '</span>' +
        (livello !== 'gold' ? '<span class="sp-item-reps" title="Ripetizioni nel ticker">&times;' + (s.ripetizioni || 1) + '</span>' : '') +
        '<input type="number" class="form-input sp-item-order" value="' + (s.order||1) + '" min="1" ' +
          'onchange="AdminActions.setSponsorOrder(' + s.id + ',+this.value)" title="Posizione">' +
        '<button class="btn-icon" onclick="AdminActions.editSponsor(' + s.id + ')" title="Modifica">' + EDIT_ICON + '</button>' +
        '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteSponsor(' + s.id + ')" title="Elimina">' + DEL_ICON + '</button>' +
      '</div>';
    }).join('');
  }

  Object.assign(window.AdminActions, {
    toggleResultFields: function () {
      var stato = document.getElementById('matchStato').value;
      document.getElementById('matchResultGroup').style.display = stato === 'conclusa' ? '' : 'none';
    },
    editArt: function (id) { openArtForm(VV.getArticle(id)); },
    setHeroOrder: function (id, order) {
      order = +order;
      var articles = VV.getArticles();
      var toSave   = [];
      articles.forEach(function (a) {
        var changed = false;
        if (a.id === +id) {
          var newOrder = order > 0 ? order : null;
          if ((a.heroOrder || null) !== newOrder) { a.heroOrder = newOrder; changed = true; }
        } else if (order > 0 && a.heroOrder === order) {
          a.heroOrder = null; changed = true;
        }
        if (changed) toSave.push(a);
      });
      toSave.forEach(function (a) { DB.saveArticle(a); });
      refreshArtTable();
    },
    deleteArt: function (id) {
      confirm('Eliminare questo articolo? L\'azione è irreversibile.', function () {
        DB.deleteArticle(id, refreshArtTable);
      });
    },
    deleteCategoriaArticolo: function (index) {
      var cats = VV.getCategorieArticoli();
      var name = cats[index];
      if (name === undefined) return;
      confirm('Eliminare la categoria "' + name + '"? Gli articoli che la usano non verranno modificati.', function () {
        cats = cats.slice();
        cats.splice(index, 1);
        DB.saveCategorieArticoli(cats, function () {
          _renderArtCategoriesModalList();
          if (!document.getElementById('sectionArticoli').classList.contains('is-hidden')) refreshArtTable();
        });
      });
    },
    editMatch: function (id) {
      var p = VV.getPartite().find(function (x) { return x.id === id; });
      if (p) openMatchForm(p);
    },
    deleteMatch: function (id) {
      confirm('Eliminare questa partita?', function () {
        DB.deletePartita(id, refreshMatchTable);
      });
    },
    deleteAlbum: function (id) {
      var album = VV.getAlbum(id);
      var ids = album && album.photos ? album.photos.map(function (p) { return p.id; }) : [];
      confirm('Eliminare l\'album e tutte le sue foto?', function () {
        PhotoDB.deleteAlbumPhotos(id, function () {
          DB.deleteAlbum(id, function () {
            refreshAlbumsGrid();
            _notifyCloudinaryOrphans(ids);
          });
        });
      });
    },
    deletePhoto: function (photoId) {
      var album = VV.getAlbum(_currentAlbumId);
      var photo = album && album.photos ? album.photos.find(function (p) { return p.id === photoId; }) : null;
      confirm('Eliminare questa foto?', function () {
        PhotoDB.deletePhoto(_currentAlbumId, photoId, function () {
          loadPhotos(_currentAlbumId);
          _notifyCloudinaryOrphans(photo ? [photo.id] : []);
        });
      });
    },

    /* ---- Squadre ---- */
    editCategory:   function (id) { openCategoryForm(VV.getCategory(id)); },
    deleteCategory: function (id) {
      confirm('Eliminare la categoria con tutto lo staff e il roster?', function () {
        DB.deleteCategory(id, refreshSquadreAccordion);
      });
    },
    addStaff:  function (catId)     { openStaffForm(null, catId); },
    editStaff: function (id, catId) {
      var s = VV.getStaff().find(function (x) { return x.id === +id; });
      openStaffForm(s || null, catId);
    },
    deleteStaff: function (id) {
      confirm('Eliminare questo membro dello staff?', function () {
        DB.deleteStaffMember(id, refreshSquadreAccordion);
      });
    },
    /* ---- Stagioni ---- */
    setCurrentSeason: function (id) {
      DB.setCurrentSeason(id, refreshStagionList);
    },
    deleteSeason: function (id) {
      confirm('Eliminare la stagione "' + id + '"? I dati associati non vengono eliminati.', function () {
        DB.deleteSeason(id, refreshStagionList);
      });
    },

    addPlayer:  function (catId)     { openPlayerForm(null, catId); },
    editPlayer: function (id, catId) {
      var p = VV.getPlayers().find(function (x) { return x.id === +id; });
      openPlayerForm(p || null, catId);
    },
    deletePlayer: function (id) {
      confirm('Eliminare questo giocatore/questa giocatrice?', function () {
        DB.deletePlayer(id, refreshSquadreAccordion);
      });
    }
  });

  /* ---- AdminActions: sponsor ---- */
  window.AdminActions.editSponsor = function (id) {
    var s = VV.getSponsors().find(function (x) { return x.id === id; });
    if (!s) return;
    _spEditing = s;
    document.getElementById('spFormTitle').textContent = 'Modifica sponsor';
    document.getElementById('spLogoUrl').value  = s.logo  || '';
    document.getElementById('spNome').value      = s.nome  || '';
    document.getElementById('spUrl').value       = s.url   || '';
    document.getElementById('spOrder').value     = String(s.order || 1);
    document.getElementById('spLivello').value   = s.livello || 'silver';
    document.getElementById('spRipetizioni').value = String(s.ripetizioni || 1);
    _popolaSpAzienda(s);
    _syncSpPreview();
    document.getElementById('spLogoEditor').style.display = 'none';
    document.getElementById('spForm').classList.remove('is-hidden');
    document.getElementById('spNome').focus();
  };

  window.AdminActions.deleteSponsor = function (id) {
    confirm('Eliminare questo sponsor?', function () {
      var list = VV.getSponsors().filter(function (s) { return s.id !== id; });
      DB.saveSponsors(list);
      _salvaCollegamentoSponsor(id, '');
      refreshSpList();
    });
  };

  window.AdminActions.setSponsorOrder = function (id, order) {
    var list = VV.getSponsors().map(function (s) {
      return s.id === id ? Object.assign({}, s, { order: order }) : s;
    });
    list.sort(function (a, b) { return (a.order||0) - (b.order||0); });
    DB.saveSponsors(list);
    refreshSpList();
  };

  /* ---- Interfaccia verso admin.js ---- */
  A.cms = {
    renderArticoli: renderArticoli,
    renderCalendario: renderCalendario,
    renderGalleria: renderGalleria,
    renderSquadre: renderSquadre,
    renderStagioni: renderStagioni,
    renderMaglia: renderMaglia,
    renderSponsor: renderSponsor,
    migrateFieldIfBase64: _migrateFieldIfBase64
  };

})();
