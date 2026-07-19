/* Victor Volley — Admin Panel Logic */
(function () {
  'use strict';

  /* ================================================
     BOOTSTRAP — Firebase Auth + ruolo dirigente
  ================================================ */
  var _uid = null, _dirigenteNome = '';

  document.addEventListener('DOMContentLoaded', function () {
    /* Ripristina sessione se l'utente è già autenticato */
    auth.onAuthStateChanged(function (user) {
      if (user) _checkRole(user);
    });

    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('emailInput').value.trim();
      var pwd   = document.getElementById('passwordInput').value;
      var errEl = document.getElementById('loginError');
      errEl.textContent = '';
      auth.signInWithEmailAndPassword(email, pwd).catch(function () {
        errEl.textContent = 'Email o password non corretti.';
      });
    });

    document.getElementById('deniedLogoutBtn').addEventListener('click', function () {
      auth.signOut().then(function () { location.reload(); });
    });
  });

  /* L'accesso al pannello richiede l'esistenza di un documento in
     "dirigenti" — non basta più un login Firebase qualsiasi. */
  function _checkRole(user) {
    db.collection('dirigenti').doc(user.uid).get().then(function (doc) {
      if (!doc.exists) { _showDenied(); return; }
      var data = doc.data();
      _uid = user.uid;
      _dirigenteNome = ((data.nome || '') + ' ' + (data.cognome || '')).trim() || data.email || user.email;
      DB.setAuditHook(_logWrite);
      showApp();
    }).catch(function (err) {
      console.error('[admin] role check', err);
      _showDenied();
    });
  }

  function _showDenied() {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('deniedScreen').classList.remove('is-hidden');
  }

  function showApp() {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('deniedScreen').classList.add('is-hidden');
    document.getElementById('adminApp').classList.remove('is-hidden');
    DB.init(function () {
      PhotoDB.init(function () {
        initNav();
        _loadBudgetData(function () {
          goTo('dashboard');
        });
      });
    });
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () { location.reload(); });
  });

  /* ================================================
     NAVIGATION
  ================================================ */
  var SECTIONS = {
    dashboard: 'Dashboard', articoli: 'Articoli', calendario: 'Calendario', galleria: 'Galleria', squadre: 'Squadre',
    sponsor: 'Sponsor', atleti: 'Atleti', dirigenti: 'Dirigenti', girone: 'Girone Prima Divisione', stagioni: 'Stagioni', maglia: 'Maglia', datiJson: 'File JSON',
    log: 'Log', budget: 'Budget & Forecast'
  };

  function initNav() {
    document.querySelectorAll('.admin-nav-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        goTo(el.dataset.section);
        _closeSidebar();
      });
    });
    _initSidebarToggle();
  }

  /* ---- Sidebar off-canvas (mobile) ---- */
  function _openSidebar() {
    document.getElementById('adminSidebar').classList.add('is-open');
    document.getElementById('sidebarOverlay').classList.remove('is-hidden');
    document.getElementById('sidebarToggle').setAttribute('aria-expanded', 'true');
  }
  function _closeSidebar() {
    document.getElementById('adminSidebar').classList.remove('is-open');
    document.getElementById('sidebarOverlay').classList.add('is-hidden');
    document.getElementById('sidebarToggle').setAttribute('aria-expanded', 'false');
  }
  function _initSidebarToggle() {
    document.getElementById('sidebarToggle').addEventListener('click', function () {
      var sidebar = document.getElementById('adminSidebar');
      if (sidebar.classList.contains('is-open')) _closeSidebar(); else _openSidebar();
    });
    document.getElementById('sidebarOverlay').addEventListener('click', _closeSidebar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') _closeSidebar();
    });
  }

  function goTo(section) {
    document.querySelectorAll('.admin-nav-item').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.section === section);
    });
    document.querySelectorAll('.admin-section').forEach(function (el) {
      el.classList.add('is-hidden');
    });
    document.getElementById('section' + cap(section)).classList.remove('is-hidden');
    document.getElementById('topbarTitle').textContent = SECTIONS[section] || section;
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('seasonBar').classList.toggle('is-hidden', section !== 'budget');

    if (section === 'dashboard')  renderDashboard();
    if (section === 'articoli')   renderArticoli();
    if (section === 'calendario') renderCalendario();
    if (section === 'galleria')   renderGalleria();
    if (section === 'squadre')    renderSquadre();
    if (section === 'sponsor')    renderSponsor();
    if (section === 'atleti')     renderAtleti();
    if (section === 'dirigenti')  renderDirigenti();
    if (section === 'stagioni')   renderStagioni();
    if (section === 'maglia')     renderMaglia();
    if (section === 'datiJson')   renderDatiJson();
    if (section === 'log')        _renderLog();
    if (section === 'budget')     _renderActiveBudgetTab();
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ================================================
     DASHBOARD
  ================================================ */
  function renderDashboard() {
    var articles = VV.getArticles();
    var partite  = VV.getPartite();
    var albums   = VV.getAlbums();
    var today    = new Date().toISOString().slice(0, 10);

    var future = partite.filter(function (p) { return p.data >= today; });

    document.getElementById('dashStats').innerHTML =
      _statCard('📰', articles.length, 'Articoli', '--blue') +
      _statCard('📅', partite.length, 'Partite', '--green') +
      _statCard('🖼️', albums.length, 'Album galleria', '--yellow') +
      _statCard('⚽', future.length, 'Prossime partite', '--red');

    var artHtml = articles.slice(0, 5).map(function (a) {
      return '<div class="dash-item"><span class="dash-item-title">' + esc(a.title) + '</span>' +
        '<span class="dash-item-meta">' + VV.formatDateShort(a.date) + '</span></div>';
    }).join('') || '<div class="dash-item"><span class="dash-item-meta">Nessun articolo</span></div>';

    var matchHtml = future.slice(0, 5).map(function (m) {
      return '<div class="dash-item"><span class="dash-item-title">' + esc(m.squadra_casa) + ' vs ' + esc(m.squadra_ospite) + '</span>' +
        '<span class="dash-item-meta">' + VV.formatDateShort(m.data) + '</span></div>';
    }).join('') || '<div class="dash-item"><span class="dash-item-meta">Nessuna partita</span></div>';

    document.getElementById('dashArticles').innerHTML = artHtml;
    document.getElementById('dashMatches').innerHTML = matchHtml;

    _renderDashBudgetWidget();
  }

  function _statCard(icon, val, label, mod) {
    return '<div class="stat-card">' +
      '<div class="stat-icon stat-icon' + mod + '" style="font-size:22px">' + icon + '</div>' +
      '<div><div class="stat-value">' + val + '</div><div class="stat-label">' + label + '</div></div>' +
      '</div>';
  }

  /* ================================================
     ARTICOLI
  ================================================ */
  var _artEditing = null;

  function renderArticoli() {
    showSubview('articoli', 'list');
    setTopbarBtn('Nuovo articolo', function () { openArtForm(null); });
    refreshArtTable();
  }

  function refreshArtTable() {
    var articles    = VV.getArticles();
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
      return '<tr>' +
        '<td><div class="table-title">' + esc(a.title) + '</div><div class="table-sub">' + esc(a.category) + '</div></td>' +
        '<td><span class="chip chip--blue">' + esc(a.category) + '</span></td>' +
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

  function openArtForm(article) {
    _artEditing = article;
    showSubview('articoli', 'form');
    document.getElementById('topbarActions').innerHTML = '';

    var catSel = document.getElementById('artCategory');
    catSel.innerHTML = VV.CATEGORIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    if (article) {
      document.getElementById('artTitle').value      = article.title || '';
      catSel.value                                    = article.category || VV.CATEGORIES[0];
      document.getElementById('artDate').value        = article.date || '';
      document.getElementById('artImage').value       = article.image || '';
      document.getElementById('artExcerpt').value     = article.excerpt || '';
      document.getElementById('artContent').value     = article.content || '';
      document.getElementById('artPublished').checked = !!article.published;
      _setArtPreview(article.image || null, article.image ? 'Immagine salvata' : '');
    } else {
      document.getElementById('artTitle').value      = '';
      catSel.value                                    = VV.CATEGORIES[0];
      document.getElementById('artDate').value        = new Date().toISOString().slice(0, 10);
      document.getElementById('artImage').value       = '';
      document.getElementById('artExcerpt').value     = '';
      document.getElementById('artContent').value     = '';
      document.getElementById('artPublished').checked = true;
      _setArtPreview(null);
    }
  }

  document.getElementById('artSave').addEventListener('click', function () {
    var title = document.getElementById('artTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var article = Object.assign({}, _artEditing || {}, {
      title:     title,
      category:  document.getElementById('artCategory').value,
      date:      document.getElementById('artDate').value,
      image:     document.getElementById('artImage').value.trim(),
      excerpt:   document.getElementById('artExcerpt').value.trim(),
      content:   document.getElementById('artContent').value.trim(),
      published: document.getElementById('artPublished').checked
    });
    DB.saveArticle(article, renderArticoli);
  });

  document.getElementById('artCancel').addEventListener('click', renderArticoli);

  /* ================================================
     CALENDARIO — fonte unica: siteData/partite (via DB/VV)
  ================================================ */
  var _matchEditing = null;

  function _isVV(nome) { return (nome || '').toLowerCase().indexOf('victor') !== -1; }

  function renderCalendario() {
    showSubview('calendario', 'list');
    setTopbarBtn('Aggiungi partita', function () { openMatchForm(null); });
    refreshMatchTable();
  }

  var EDIT_ICON_SM  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var DEL_ICON_SM   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';

  function refreshMatchTable() {
    var sorted = VV.getPartite().sort(function (a, b) { return a.data > b.data ? 1 : -1; });
    var rows = sorted.map(function (p) {
      var isHome  = _isVV(p.squadra_casa);
      var result  = (p.stato === 'conclusa' && p.set_casa != null)
        ? '<strong>' + p.set_casa + '&ndash;' + p.set_ospite + '</strong>'
        : '<span style="color:var(--a-muted)">—</span>';
      return '<tr>' +
        '<td>' + esc(p.data || '—') + '</td>' +
        '<td>' + esc(p.ora || '—') + '</td>' +
        '<td><span class="chip chip--blue">' + esc(p.categoria || '') + '</span></td>' +
        '<td>' +
          (p.logo_casa ? '<img src="' + esc(p.logo_casa) + '" style="height:20px;display:inline;vertical-align:middle;margin-right:4px">' : '') +
          '<strong>' + esc(p.squadra_casa || '') + '</strong> vs ' +
          (p.logo_ospite ? '<img src="' + esc(p.logo_ospite) + '" style="height:20px;display:inline;vertical-align:middle;margin-right:4px">' : '') +
          esc(p.squadra_ospite || '') +
          ' <span class="chip ' + (isHome ? 'chip--green' : 'chip--gray') + '" style="margin-left:4px">' + (isHome ? 'Casa' : 'Trasferta') + '</span>' +
        '</td>' +
        '<td style="font-size:12px;color:var(--a-muted)">' + esc(p.palazzetto || '—') + '</td>' +
        '<td>' + result + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.editMatch(\'' + esc(p.id) + '\')" title="Modifica">' + EDIT_ICON_SM + '</button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteMatch(\'' + esc(p.id) + '\')" title="Elimina">' + DEL_ICON_SM + '</button>' +
        '</div></td>' +
      '</tr>';
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
      var isHome = _isVV(p.squadra_casa);
      document.getElementById('matchDate').value     = p.data || '';
      document.getElementById('matchTime').value     = p.ora  || '18:30';
      catSel.value                                   = p.categoria || 'Prima Divisione';
      document.getElementById('matchIsHome').checked = isHome;
      document.getElementById('matchHomeTeam').value = isHome ? (p.squadra_casa || 'Victor Volley') : (p.squadra_ospite || 'Victor Volley');
      document.getElementById('matchHomeLogo').value = isHome ? (p.logo_casa || '') : (p.logo_ospite || '');
      document.getElementById('matchAwayTeam').value = isHome ? (p.squadra_ospite || '') : (p.squadra_casa || '');
      document.getElementById('matchAwayLogo').value = isHome ? (p.logo_ospite || '') : (p.logo_casa || '');
      _syncLogoPreview('matchHomeLogo', 'homeLogoPreview');
      _syncLogoPreview('matchAwayLogo', 'awayLogoPreview');
      document.getElementById('matchVenue').value    = p.palazzetto || '';
      document.getElementById('matchStato').value    = p.stato || 'programmata';
      document.getElementById('matchSetCasa').value    = (p.set_casa   != null) ? p.set_casa   : '';
      document.getElementById('matchSetOspite').value  = (p.set_ospite != null) ? p.set_ospite : '';
    } else {
      document.getElementById('matchDate').value     = '';
      document.getElementById('matchTime').value     = '18:30';
      catSel.value                                   = 'Prima Divisione';
      document.getElementById('matchIsHome').checked = true;
      document.getElementById('matchHomeTeam').value = 'Victor Volley';
      document.getElementById('matchHomeLogo').value = '';
      document.getElementById('matchAwayTeam').value = '';
      document.getElementById('matchAwayLogo').value = '';
      _syncLogoPreview('matchHomeLogo', 'homeLogoPreview');
      _syncLogoPreview('matchAwayLogo', 'awayLogoPreview');
      document.getElementById('matchVenue').value      = 'Palazzetto ARKÉ — Melissano';
      document.getElementById('matchStato').value      = 'programmata';
      document.getElementById('matchSetCasa').value    = '';
      document.getElementById('matchSetOspite').value  = '';
    }
    AdminActions.toggleResultFields();
  }

  document.getElementById('matchSave').addEventListener('click', function () {
    var data = document.getElementById('matchDate').value;
    if (!data) { alert('La data è obbligatoria.'); return; }
    var isHome    = document.getElementById('matchIsHome').checked;
    var squadraVV = document.getElementById('matchHomeTeam').value.trim() || 'Victor Volley';
    var avversario = document.getElementById('matchAwayTeam').value.trim();
    if (!avversario) { alert('La squadra avversaria è obbligatoria.'); return; }
    var logoVV    = document.getElementById('matchHomeLogo').value.trim();
    var logoAvv   = document.getElementById('matchAwayLogo').value.trim();
    var stato     = document.getElementById('matchStato').value;
    var setC      = document.getElementById('matchSetCasa').value;
    var setO      = document.getElementById('matchSetOspite').value;

    var partita = {
      id:            (_matchEditing && _matchEditing.id) || ('m' + Date.now()),
      stagione:      (_matchEditing && _matchEditing.stagione) || (VV.getCurrentSeason() || {}).id || '2025/2026',
      categoria:     document.getElementById('matchCategory').value,
      squadra_casa:  isHome ? squadraVV  : avversario,
      squadra_ospite: isHome ? avversario : squadraVV,
      logo_casa:     isHome ? logoVV     : logoAvv,
      logo_ospite:   isHome ? logoAvv    : logoVV,
      data:          data,
      ora:           document.getElementById('matchTime').value,
      palazzetto:    document.getElementById('matchVenue').value.trim(),
      stato:         stato,
      set_casa:      (stato === 'conclusa' && setC !== '') ? +setC : null,
      set_ospite:    (stato === 'conclusa' && setO !== '') ? +setO : null
    };

    /* Mantieni campi live (codice_tabellone ecc.) se esistenti */
    if (_matchEditing) {
      ['codice_tabellone', 'tabellone_squadra_casa'].forEach(function (k) {
        if (_matchEditing[k] != null) partita[k] = _matchEditing[k];
      });
    }

    var partite = VV.getPartite();
    var idx = partite.findIndex(function (p) { return p.id === partita.id; });
    if (idx >= 0) { partite[idx] = partita; } else { partite.push(partita); }
    DB.savePartite(partite, renderCalendario);
  });

  document.getElementById('matchCancel').addEventListener('click', renderCalendario);

  /* ================================================
     GALLERIA
  ================================================ */
  var _currentAlbumId = null;

  function renderGalleria() {
    showSubview('galleria', 'list');
    setTopbarBtn('Nuovo album', function () {
      showSubview('galleria', 'form');
      document.getElementById('topbarActions').innerHTML = '';
    });

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
          ? '<img src="' + covers[album.id] + '" alt="">'
          : '<div class="album-thumb-placeholder">🖼️</div>';
        return '<div class="album-card" data-id="' + album.id + '">' +
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
    var actions = document.getElementById('topbarActions');
    actions.innerHTML = '';
    actions.appendChild(backBtn);

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
          '<img src="' + p.dataUrl + '" alt="' + esc(p.name) + '" loading="lazy">' +
          '<div class="photo-item-overlay">' +
            '<button class="photo-delete" onclick="AdminActions.deletePhoto(' + p.id + ')">Elimina</button>' +
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
    bar.style.width = '0%';

    PhotoDB.addPhotos(_currentAlbumId, files,
      function (done, total) {
        var pct = Math.round(done / total * 100);
        bar.style.width = pct + '%';
        text.textContent = done + ' / ' + total + ' foto caricate';
      },
      function (count) {
        var album = VV.getAlbum(_currentAlbumId);
        if (album) { album.photoCount = (album.photoCount || 0) + count; DB.saveAlbum(album); }
        setTimeout(function () { progress.classList.add('is-hidden'); }, 800);
        loadPhotos(_currentAlbumId);
        this.value = '';
      }.bind(this)
    );
  });

  document.getElementById('albumSave').addEventListener('click', function () {
    var title = document.getElementById('albumTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var album = {
      title:      title,
      date:       document.getElementById('albumDate').value,
      category:   document.getElementById('albumCategory').value,
      photoCount: 0
    };
    var saved = DB.saveAlbum(album);
    openAlbum(saved.id);
  });

  document.getElementById('albumCancel').addEventListener('click', renderGalleria);

  /* ================================================
     IMMAGINE COPERTINA ARTICOLO — resize Full HD
  ================================================ */

  function resizeToFullHD(file, cb) {
    var MAX_W = 1920, MAX_H = 1080;
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
        var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        cb(dataUrl, outW, outH);
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

  document.getElementById('artImageFile').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    document.getElementById('artImagePreviewInfo').textContent = 'Ridimensionamento in corso…';
    document.getElementById('artImagePreview').style.display = '';
    resizeToFullHD(file, function (dataUrl, w, h) {
      document.getElementById('artImage').value = dataUrl;
      var kb = Math.round(dataUrl.length * 0.75 / 1024);
      var info = w + ' × ' + h + ' px · ~' + kb + ' KB';
      if (kb > 750) info += '  ⚠ file grande';
      _setArtPreview(dataUrl, info);
    });
    this.value = '';
  });

  document.getElementById('artImageClear').addEventListener('click', function () {
    document.getElementById('artImage').value = '';
    _setArtPreview(null);
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
        cb(_trimAndScale(canvas, size).toDataURL('image/png'));
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
        convertLogoToPng(this.files[0], 256, function (dataUrl) {
          document.getElementById(cfg.url).value = dataUrl;
          _syncLogoPreview(cfg.url, cfg.preview);
          fileEl.value = '';
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
        cb(canvas.toDataURL('image/jpeg', 0.85));
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
      resizePlayerPhoto(this.files[0], function (dataUrl) {
        document.getElementById('playerPhoto').value = dataUrl;
        var focus = document.getElementById('playerPhotoFocus').value || '50% 25%';
        _showFocusPicker('player', dataUrl, focus);
        fileEl.value = '';
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
      resizePlayerPhoto(this.files[0], function (dataUrl) {
        document.getElementById('staffPhoto').value = dataUrl;
        var focus = document.getElementById('staffPhotoFocus').value || '50% 25%';
        _showFocusPicker('staff', dataUrl, focus);
        fileEl.value = '';
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
    setTopbarBtn('Nuova stagione', function () {
      document.getElementById('stagioneName').value = '';
      document.getElementById('stagioneCurrent').checked = false;
      document.getElementById('stagionForm').classList.remove('is-hidden');
      document.getElementById('stagioneName').focus();
    });
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
  }

  document.getElementById('magliaSave').addEventListener('click', function () {
    var revealRaw = document.getElementById('magliaRevealDate').value;
    var title = document.getElementById('magliaTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var obj = {
      enabled:    document.getElementById('magliaEnabled').checked,
      title:      title,
      subtitle:   document.getElementById('magliaSubtitle').value.trim(),
      revealDate: revealRaw ? revealRaw + ':00' : ''
    };
    DB.saveMaglia(obj, function () { renderMaglia(); });
  });

  /* ================================================
     CONFIRM MODAL
  ================================================ */
  var _confirmCb = null;

  function confirm(text, cb) {
    document.getElementById('confirmText').textContent = text;
    _confirmCb = cb;
    document.getElementById('confirmModal').classList.remove('is-hidden');
  }

  document.getElementById('confirmOk').addEventListener('click', function () {
    document.getElementById('confirmModal').classList.add('is-hidden');
    _confirmCb && _confirmCb();
  });

  document.getElementById('confirmCancel').addEventListener('click', function () {
    document.getElementById('confirmModal').classList.add('is-hidden');
  });

  /* ================================================
     PUBLIC ACTIONS (chiamate dai button inline)
  ================================================ */
  /* ================================================
     SPONSOR
  ================================================ */
  var _spEditing = null;
  var SP_REPS_DEFAULT = { gold: 1, silver: 3, bronze: 1 };

  function renderSponsor() {
    refreshSpList();

    document.getElementById('spAddBtn').onclick = function () {
      _spEditing = null;
      document.getElementById('spFormTitle').textContent = 'Nuovo sponsor';
      document.getElementById('spLogoUrl').value  = '';
      document.getElementById('spNome').value      = '';
      document.getElementById('spUrl').value       = '';
      document.getElementById('spOrder').value     = String(VV.getSponsors().length + 1);
      document.getElementById('spLivello').value   = 'silver';
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
      _prepareSpLogoSource(file, function (dataUrl, w, h) {
        _initSpLogoEditor();
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

  /* Carica il file, rimuove lo sfondo quasi-bianco ma NON ritaglia/centra:
     l'inquadratura finale la sceglie l'admin nell'editor. */
  function _prepareSpLogoSource(file, cb) {
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
        _removeWhiteBg(ctx, outW, outH);
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

      document.getElementById('spLogoUrl').value = canvas.toDataURL('image/png');
      _syncSpPreview();
      document.getElementById('spLogoEditor').style.display = 'none';
    });
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
          (s.url ? '<div class="sp-item-url">' + esc(s.url) + '</div>' : '') +
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

  window.AdminActions = {
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
    editMatch: function (id) {
      var p = VV.getPartite().find(function (x) { return x.id === id; });
      if (p) openMatchForm(p);
    },
    deleteMatch: function (id) {
      confirm('Eliminare questa partita?', function () {
        var partite = VV.getPartite().filter(function (x) { return x.id !== id; });
        DB.savePartite(partite, refreshMatchTable);
      });
    },
    deleteAlbum: function (id) {
      confirm('Eliminare l\'album e tutte le sue foto?', function () {
        PhotoDB.deleteAlbumPhotos(id, function () {
          DB.deleteAlbum(id, refreshAlbumsGrid);
        });
      });
    },
    deletePhoto: function (id) {
      confirm('Eliminare questa foto?', function () {
        PhotoDB.deletePhoto(id, function () {
          var album = VV.getAlbum(_currentAlbumId);
          if (album && album.photoCount > 0) { album.photoCount--; DB.saveAlbum(album); }
          loadPhotos(_currentAlbumId);
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
  };

  /* ================================================
     UTILS
  ================================================ */
  function showSubview(section, view) {
    var list    = document.getElementById(section + 'List');
    var form    = document.getElementById(section + 'Form');
    var photos  = document.getElementById(section + 'Photos');
    if (list)   list.classList.toggle('is-hidden', view !== 'list');
    if (form)   form.classList.toggle('is-hidden', view !== 'form');
    if (photos) photos.classList.toggle('is-hidden', view !== 'photos');
  }

  function setTopbarBtn(label, cb) {
    var btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ' + label;
    btn.addEventListener('click', cb);
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('topbarActions').appendChild(btn);
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }


  /* ================================================
     ATLETI
  ================================================ */
  var _atletiCache   = [];
  var _editingAtleta = null;

  function renderAtleti() {
    _showAtletiView('list');
    setTopbarBtn('Nuovo atleta', function () { _openAtletaForm(); });
    _loadAtleti();
  }

  function _showAtletiView(view) {
    document.getElementById('atletiList').classList.toggle('is-hidden', view !== 'list');
    document.getElementById('atletiForm').classList.toggle('is-hidden', view !== 'form');
    document.getElementById('atletiDetail').classList.toggle('is-hidden', view !== 'detail');
  }

  function _loadAtleti() {
    document.getElementById('atletiBody').innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--a-muted);padding:20px">Caricamento…</td></tr>';

    db.collection('atleti').get().then(function (snap) {
      _atletiCache = [];
      snap.forEach(function (doc) {
        _atletiCache.push(Object.assign({ uid: doc.id }, doc.data()));
      });
      /* ordina per scadenza cert. medico più imminente */
      _atletiCache.sort(function (a, b) {
        var da = a.certMedicoScadenza || '9999-12-31';
        var db_ = b.certMedicoScadenza || '9999-12-31';
        return da < db_ ? -1 : da > db_ ? 1 : 0;
      });
      _renderAtletiRows();
    }).catch(function (err) {
      console.error('[Atleti]', err);
      document.getElementById('atletiBody').innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  function _renderAtletiRows() {
    if (!_atletiCache.length) {
      document.getElementById('atletiBody').innerHTML =
        '<tr><td colspan="6"><div class="empty-state"><p>Nessun atleta registrato.</p></div></td></tr>';
      return;
    }
    document.getElementById('atletiBody').innerHTML = _atletiCache.map(function (a) {
      var rate    = a.rate || [];
      var totale  = rate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      var saldato = rate.filter(function (r) { return r.pagata; })
                        .reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      return '<tr>' +
        '<td><div class="table-title">' + esc(a.cognome) + ' ' + esc(a.nome) + '</div>' +
          '<div class="table-sub">' + esc(a.email) + '</div></td>' +
        '<td>' + (a.categoria
          ? '<span class="chip chip--blue">' + esc(a.categoria) + '</span>'
          : '<span class="chip chip--gray">—</span>') + '</td>' +
        '<td>' + _certChip(a.certMedicoScadenza) + '</td>' +
        '<td style="font-weight:600">€' + totale.toFixed(2) + '</td>' +
        '<td>' + (saldato > 0
          ? '<span style="color:var(--a-green);font-weight:600">€' + saldato.toFixed(2) + '</span>'
          : '—') + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.editAtleta(\'' + a.uid + '\')" title="Gestisci">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteAtleta(\'' + a.uid + '\')" title="Elimina">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
          '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function _certChip(scadenza) {
    if (!scadenza) return '<span class="chip chip--gray">Non inserita</span>';
    var days  = _daysDiff(scadenza);
    var label = _fmtDate(scadenza);
    if (days < 0)   return '<span class="chip chip--red">Scaduto · ' + label + '</span>';
    if (days <= 30) return '<span class="chip" style="background:rgba(245,158,11,.12);color:#B45309">In scadenza · ' + label + '</span>';
    return '<span class="chip chip--green">' + label + '</span>';
  }

  function _daysDiff(dateStr) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }

  function _fmtDate(str) {
    if (!str) return '—';
    var p = str.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /* ---- Nuovo atleta form ---- */

  function _openAtletaForm() {
    _showAtletiView('form');
    document.getElementById('topbarActions').innerHTML = '';
    var sel = document.getElementById('atletaCategoria');
    sel.innerHTML = '<option value="">Nessuna</option>' +
      VV.getCategories().map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
      }).join('');
    ['atletaNome', 'atletaCognome', 'atletaEmail', 'atletaPassword'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('atletaCertScadenza').value = '';
  }

  document.getElementById('atletaFormCancel').addEventListener('click', renderAtleti);

  document.getElementById('atletaFormSave').addEventListener('click', function () {
    var nome    = document.getElementById('atletaNome').value.trim();
    var cognome = document.getElementById('atletaCognome').value.trim();
    var email   = document.getElementById('atletaEmail').value.trim();
    var pwd     = document.getElementById('atletaPassword').value;
    var categ   = document.getElementById('atletaCategoria').value;
    var certSc  = document.getElementById('atletaCertScadenza').value;

    if (!nome || !cognome || !email || !pwd) {
      alert('Nome, cognome, email e password sono obbligatori.'); return;
    }
    if (pwd.length < 6) { alert('La password deve avere almeno 6 caratteri.'); return; }

    var btn = document.getElementById('atletaFormSave');
    btn.textContent = 'Creazione…'; btn.disabled = true;

    /* secondary app per non disconnettere l'admin */
    var existing  = firebase.apps.find(function (a) { return a.name === 'atleta-creator'; });
    var secondary = existing || firebase.initializeApp(firebase.app().options, 'atleta-creator');
    var secAuth   = secondary.auth();

    secAuth.createUserWithEmailAndPassword(email, pwd)
      .then(function (cred) {
        var uid = cred.user.uid;
        return secAuth.signOut().then(function () {
          var data = {
            uid: uid, nome: nome, cognome: cognome, email: email,
            categoria: categ, certMedicoScadenza: certSc,
            certMedicoUrl: '', moduloIscrizioneUrl: '',
            rate: [], note: '', createdAt: new Date().toISOString()
          };
          return db.collection('atleti').doc(uid).set(data).then(function () {
            return _logWrite('atleta', uid, 'Atleta — ' + cognome + ' ' + nome, 'create', _diff({}, data, Object.keys(data)));
          });
        });
      })
      .then(renderAtleti)
      .catch(function (err) {
        var msg = err.code === 'auth/email-already-in-use'
          ? 'Email già registrata.' : err.message;
        alert('Errore: ' + msg);
        btn.textContent = 'Crea atleta'; btn.disabled = false;
      });
  });

  /* ---- Detail view ---- */

  function _openAtletaDetail(uid) {
    _editingAtleta = _atletiCache.find(function (a) { return a.uid === uid; }) || null;
    if (!_editingAtleta) return;

    _showAtletiView('detail');
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('atletaDetailNome').textContent =
      (_editingAtleta.cognome || '') + ' ' + (_editingAtleta.nome || '');

    var catSel = document.getElementById('detCategoria');
    catSel.innerHTML = '<option value="">Nessuna</option>' +
      VV.getCategories().map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
      }).join('');

    document.getElementById('detNome').value      = _editingAtleta.nome     || '';
    document.getElementById('detCognome').value   = _editingAtleta.cognome  || '';
    document.getElementById('detEmail').value     = _editingAtleta.email    || '';
    document.getElementById('detCategoria').value = _editingAtleta.categoria || '';
    document.getElementById('detNote').value      = _editingAtleta.note     || '';

    document.getElementById('detCertScadenza').value = _editingAtleta.certMedicoScadenza || '';
    var certUrl = _editingAtleta.certMedicoUrl || '';
    document.getElementById('certPdfUrl').value = certUrl;
    document.getElementById('certPdfLinkWrap').classList.toggle('is-hidden', !certUrl);
    if (certUrl) document.getElementById('certPdfLink').href = _driveViewUrl(certUrl);

    var modUrl = _editingAtleta.moduloIscrizioneUrl || '';
    document.getElementById('moduloPdfUrl').value = modUrl;
    document.getElementById('moduloPdfLinkWrap').classList.toggle('is-hidden', !modUrl);
    if (modUrl) document.getElementById('moduloPdfLink').href = _driveViewUrl(modUrl);

    document.getElementById('sicurezzaEmail').textContent = _editingAtleta.email || '';
    document.getElementById('sicurezzaMsg').classList.add('is-hidden');
    document.getElementById('sicurezzaMsg').textContent = '';
    document.getElementById('newPassword').value     = '';
    document.getElementById('confirmPassword').value = '';

    _switchAtletaTab('anagrafica');
    _renderRateAdmin();
  }

  function _switchAtletaTab(tab) {
    document.querySelectorAll('.atleta-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.tab === tab);
    });
    ['tabAnagrafica', 'tabCertmedico', 'tabRate', 'tabModulo', 'tabSicurezza'].forEach(function (id) {
      document.getElementById(id).classList.add('is-hidden');
    });
    document.getElementById('tab' + cap(tab)).classList.remove('is-hidden');
  }

  document.querySelectorAll('.atleta-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { _switchAtletaTab(btn.dataset.tab); });
  });

  document.getElementById('atletaBackBtn').addEventListener('click', renderAtleti);

  /* ---- Salva anagrafica ---- */
  document.getElementById('detAnagraficaSave').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var before = Object.assign({}, _editingAtleta);
    var upd = {
      nome:      document.getElementById('detNome').value.trim(),
      cognome:   document.getElementById('detCognome').value.trim(),
      categoria: document.getElementById('detCategoria').value,
      note:      document.getElementById('detNote').value.trim()
    };
    Object.assign(_editingAtleta, upd);
    document.getElementById('atletaDetailNome').textContent =
      _editingAtleta.cognome + ' ' + _editingAtleta.nome;
    db.collection('atleti').doc(_editingAtleta.uid).update(upd)
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff(before, upd, Object.keys(upd))); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

  /* ---- Salva cert. medico ---- */
  document.getElementById('detCertSave').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var before   = Object.assign({}, _editingAtleta);
    var scadenza = document.getElementById('detCertScadenza').value;
    var url      = document.getElementById('certPdfUrl').value.trim();
    _editingAtleta.certMedicoScadenza = scadenza;
    _editingAtleta.certMedicoUrl      = url;
    document.getElementById('certPdfLinkWrap').classList.toggle('is-hidden', !url);
    if (url) document.getElementById('certPdfLink').href = _driveViewUrl(url);
    db.collection('atleti').doc(_editingAtleta.uid)
      .update({ certMedicoScadenza: scadenza, certMedicoUrl: url })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff(before, { certMedicoScadenza: scadenza, certMedicoUrl: url }, ['certMedicoScadenza', 'certMedicoUrl'])); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

  /* ---- Salva modulo iscrizione ---- */
  document.getElementById('detModuloSave').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var before = Object.assign({}, _editingAtleta);
    var url = document.getElementById('moduloPdfUrl').value.trim();
    _editingAtleta.moduloIscrizioneUrl = url;
    document.getElementById('moduloPdfLinkWrap').classList.toggle('is-hidden', !url);
    if (url) document.getElementById('moduloPdfLink').href = _driveViewUrl(url);
    db.collection('atleti').doc(_editingAtleta.uid)
      .update({ moduloIscrizioneUrl: url })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff(before, { moduloIscrizioneUrl: url }, ['moduloIscrizioneUrl'])); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

  /* ---- Cambia password atleta (via Cloud Function) ---- */
  document.getElementById('btnCambiaPassword').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var btn     = this;
    var msg     = document.getElementById('sicurezzaMsg');
    var pwd     = document.getElementById('newPassword').value;
    var confirm = document.getElementById('confirmPassword').value;

    msg.classList.add('is-hidden');

    if (pwd.length < 6) {
      msg.textContent = 'La password deve avere almeno 6 caratteri.';
      msg.style.color = 'var(--a-red)';
      msg.classList.remove('is-hidden');
      return;
    }
    if (pwd !== confirm) {
      msg.textContent = 'Le due password non coincidono.';
      msg.style.color = 'var(--a-red)';
      msg.classList.remove('is-hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Salvataggio…';

    var setPassword = firebase.functions().httpsCallable('setAthletePassword');
    setPassword({ uid: _editingAtleta.uid, password: pwd })
      .then(function () {
        msg.textContent = 'Password aggiornata con successo.';
        msg.style.color = 'var(--a-green)';
        msg.classList.remove('is-hidden');
        document.getElementById('newPassword').value    = '';
        document.getElementById('confirmPassword').value = '';
        btn.disabled = false;
        btn.textContent = 'Salva password';
      })
      .catch(function (e) {
        msg.textContent = 'Errore: ' + (e.message || 'riprova più tardi.');
        msg.style.color = 'var(--a-red)';
        msg.classList.remove('is-hidden');
        btn.disabled = false;
        btn.textContent = 'Salva password';
      });
  });

  /* ---- Rate / Quote ---- */
  function _renderRateAdmin() {
    var rate = (_editingAtleta && _editingAtleta.rate) || [];
    var el   = document.getElementById('rateAdminList');

    if (!rate.length) {
      el.innerHTML = '<p style="color:var(--a-muted);font-size:13px">Nessuna quota inserita.</p>';
      return;
    }

    el.innerHTML = rate.map(function (r, i) {
      return '<div class="atleta-rate-item">' +
        '<div class="atleta-rate-info">' +
          '<div class="atleta-rate-desc">' + esc(r.descrizione || 'Quota') + '</div>' +
          '<div class="atleta-rate-meta">Scadenza: ' + _fmtDate(r.scadenza) +
            ' &nbsp;·&nbsp; €' + (+r.importo || 0).toFixed(2) + '</div>' +
        '</div>' +
        '<div class="atleta-rate-actions">' +
          '<button class="btn-ghost" style="font-size:12px;padding:5px 10px;color:' +
            (r.pagata ? 'var(--a-green)' : 'var(--a-text)') +
            '" onclick="AdminActions.toggleRata(' + i + ')">' +
            (r.pagata ? '✓ Pagata' : 'Segna pagata') +
          '</button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteRata(' + i + ')" title="Rimuovi">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  document.getElementById('rataAdd').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var desc    = document.getElementById('rataDesc').value.trim();
    var importo = parseFloat(document.getElementById('rataImporto').value) || 0;
    var scad    = document.getElementById('rataScadenza').value;
    if (!desc) { alert('Inserisci una descrizione.'); return; }

    if (!_editingAtleta.rate) _editingAtleta.rate = [];
    var before = _editingAtleta.rate.map(function (r) { return Object.assign({}, r); });
    _editingAtleta.rate.push({
      id: Date.now().toString(), descrizione: desc,
      importo: importo, scadenza: scad, pagata: false, dataPagamento: null
    });

    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff({ rate: before }, { rate: _editingAtleta.rate }, ['rate'])); })
      .then(function () {
        document.getElementById('rataDesc').value    = '';
        document.getElementById('rataImporto').value = '';
        document.getElementById('rataScadenza').value = '';
        _renderRateAdmin();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

  /* ---- Google Drive URL helper ---- */
  function _driveViewUrl(url) {
    /* converte link di condivisione Drive in link di visualizzazione diretto */
    if (!url) return '#';
    var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/view';
    return url;
  }

  /* ---- AdminActions: atleti ---- */
  window.AdminActions.editAtleta = function (uid) { _openAtletaDetail(uid); };

  window.AdminActions.deleteAtleta = function (uid) {
    var target = _atletiCache.find(function (a) { return a.uid === uid; });
    confirm(
      'Eliminare l\'atleta dal gestionale? Le credenziali Firebase resteranno attive.',
      function () {
        db.collection('atleti').doc(uid).delete()
          .then(function () {
            return _logWrite('atleta', uid, 'Atleta — ' + (target ? target.cognome + ' ' + target.nome : uid), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
          })
          .then(function () {
            _atletiCache = _atletiCache.filter(function (a) { return a.uid !== uid; });
            _renderAtletiRows();
          })
          .catch(function (e) { alert('Errore: ' + e.message); });
      }
    );
  };

  window.AdminActions.toggleRata = function (idx) {
    if (!_editingAtleta || !_editingAtleta.rate) return;
    var before = _editingAtleta.rate.map(function (r) { return Object.assign({}, r); });
    var r = _editingAtleta.rate[idx];
    r.pagata = !r.pagata;
    r.dataPagamento = r.pagata ? new Date().toISOString().slice(0, 10) : null;
    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff({ rate: before }, { rate: _editingAtleta.rate }, ['rate'])); })
      .then(_renderRateAdmin)
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  window.AdminActions.deleteRata = function (idx) {
    if (!_editingAtleta || !_editingAtleta.rate) return;
    var before = _editingAtleta.rate.map(function (r) { return Object.assign({}, r); });
    _editingAtleta.rate.splice(idx, 1);
    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff({ rate: before }, { rate: _editingAtleta.rate }, ['rate'])); })
      .then(_renderRateAdmin)
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* ================================================
     DIRIGENTI (accesso Area Dirigenti)
  ================================================ */
  var _dirigentiCache = [];

  function renderDirigenti() {
    _showDirigentiView('list');
    setTopbarBtn('Nuovo dirigente', function () { _openDirigenteForm(); });
    _loadDirigenti();
  }

  function _showDirigentiView(view) {
    document.getElementById('dirigentiList').classList.toggle('is-hidden', view !== 'list');
    document.getElementById('dirigentiForm').classList.toggle('is-hidden', view !== 'form');
  }

  function _loadDirigenti() {
    document.getElementById('dirigentiBody').innerHTML =
      '<tr><td colspan="3" style="text-align:center;color:var(--a-muted);padding:20px">Caricamento…</td></tr>';

    db.collection('dirigenti').get().then(function (snap) {
      _dirigentiCache = [];
      snap.forEach(function (doc) {
        _dirigentiCache.push(Object.assign({ uid: doc.id }, doc.data()));
      });
      _dirigentiCache.sort(function (a, b) {
        return (a.nome || '') < (b.nome || '') ? -1 : 1;
      });
      _renderDirigentiRows();
    }).catch(function (err) {
      console.error('[Dirigenti]', err);
      document.getElementById('dirigentiBody').innerHTML =
        '<tr><td colspan="3" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  function _renderDirigentiRows() {
    if (!_dirigentiCache.length) {
      document.getElementById('dirigentiBody').innerHTML =
        '<tr><td colspan="3"><div class="empty-state"><p>Nessun dirigente con accesso.</p></div></td></tr>';
      return;
    }
    var EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var DEL_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
    document.getElementById('dirigentiBody').innerHTML = _dirigentiCache.map(function (d) {
      return '<tr>' +
        '<td>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</td>' +
        '<td>' + esc(d.email || '') + '</td>' +
        '<td style="text-align:right">' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteDirigente(\'' + d.uid + '\')" title="Revoca accesso">' + DEL_ICON + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function _openDirigenteForm() {
    _showDirigentiView('form');
    document.getElementById('topbarActions').innerHTML = '';
    ['dirigenteNome', 'dirigenteCognome', 'dirigenteEmail', 'dirigentePassword'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
  }

  document.getElementById('dirigenteFormCancel').addEventListener('click', renderDirigenti);

  document.getElementById('dirigenteFormSave').addEventListener('click', function () {
    var nome    = document.getElementById('dirigenteNome').value.trim();
    var cognome = document.getElementById('dirigenteCognome').value.trim();
    var email   = document.getElementById('dirigenteEmail').value.trim();
    var pwd     = document.getElementById('dirigentePassword').value;

    if (!nome || !cognome || !email || !pwd) {
      alert('Nome, cognome, email e password sono obbligatori.'); return;
    }
    if (pwd.length < 6) { alert('La password deve avere almeno 6 caratteri.'); return; }

    var btn = document.getElementById('dirigenteFormSave');
    btn.textContent = 'Creazione…'; btn.disabled = true;

    /* secondary app per non disconnettere l'admin */
    var existing  = firebase.apps.find(function (a) { return a.name === 'dirigente-creator'; });
    var secondary = existing || firebase.initializeApp(firebase.app().options, 'dirigente-creator');
    var secAuth   = secondary.auth();

    secAuth.createUserWithEmailAndPassword(email, pwd)
      .then(function (cred) {
        var uid = cred.user.uid;
        return secAuth.signOut().then(function () {
          var data = {
            uid: uid, nome: nome, cognome: cognome, email: email,
            createdAt: new Date().toISOString()
          };
          return db.collection('dirigenti').doc(uid).set(data).then(function () {
            return _logWrite('dirigente', uid, 'Dirigente — ' + cognome + ' ' + nome, 'create', _diff({}, data, Object.keys(data)));
          });
        });
      })
      .then(renderDirigenti)
      .catch(function (err) {
        var msg = err.code === 'auth/email-already-in-use'
          ? 'Email già registrata.' : err.message;
        alert('Errore: ' + msg);
        btn.textContent = 'Crea dirigente'; btn.disabled = false;
      });
  });

  window.AdminActions.deleteDirigente = function (uid) {
    var target = _dirigentiCache.find(function (d) { return d.uid === uid; });
    confirm(
      'Revocare l\'accesso all\'Area Dirigenti? Le credenziali Firebase resteranno attive.',
      function () {
        db.collection('dirigenti').doc(uid).delete()
          .then(function () {
            return _logWrite('dirigente', uid, 'Dirigente — ' + (target ? target.cognome + ' ' + target.nome : uid), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
          })
          .then(function () {
            _dirigentiCache = _dirigentiCache.filter(function (d) { return d.uid !== uid; });
            _renderDirigentiRows();
          })
          .catch(function (e) { alert('Errore: ' + e.message); });
      }
    );
  };

  /* ================================================
     FILE JSON
  ================================================ */
  var JSON_FILES = {
    girone:  { label: 'data/girone.json',  staticPath: 'data/girone.json'  },
    partite: { label: 'data/partite.json', staticPath: 'data/partite.json' }
  };

  function renderDatiJson() {
    Object.keys(JSON_FILES).forEach(function (key) {
      var statusEl  = document.getElementById(key + 'JsonStatus');
      var updatedEl = document.getElementById(key + 'JsonUpdated');
      var editorEl  = document.getElementById(key + 'JsonEditor');
      if (!editorEl) return;

      statusEl.textContent = 'Caricamento…';
      statusEl.style.color = '';

      db.collection('siteData').doc(key).get()
        .then(function (doc) {
          if (doc.exists && doc.data() && doc.data().json) {
            editorEl.value = JSON.stringify(JSON.parse(doc.data().json), null, 2);
            var ts = doc.data().updatedAt;
            if (ts) updatedEl.textContent = 'Salvato ' + _fmtDate(ts.toDate().toISOString().slice(0, 10));
            statusEl.textContent = '';
          } else {
            return fetch(JSON_FILES[key].staticPath)
              .then(function (r) { return r.json(); })
              .then(function (data) {
                editorEl.value = JSON.stringify(data, null, 2);
                updatedEl.textContent = 'File locale (non ancora su Firestore)';
                statusEl.textContent = '';
              });
          }
        })
        .catch(function () {
          fetch(JSON_FILES[key].staticPath)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              editorEl.value = JSON.stringify(data, null, 2);
              updatedEl.textContent = 'File locale';
              statusEl.textContent = '';
            });
        });
    });
  }

  window.AdminActions.formatJson = function (key) {
    var editorEl = document.getElementById(key + 'JsonEditor');
    var statusEl = document.getElementById(key + 'JsonStatus');
    try {
      editorEl.value = JSON.stringify(JSON.parse(editorEl.value), null, 2);
      statusEl.textContent = '';
    } catch (e) {
      statusEl.textContent = 'JSON non valido: ' + e.message;
      statusEl.style.color = 'var(--a-red)';
    }
  };

  window.AdminActions.saveJson = function (key) {
    var editorEl  = document.getElementById(key + 'JsonEditor');
    var statusEl  = document.getElementById(key + 'JsonStatus');
    var updatedEl = document.getElementById(key + 'JsonUpdated');

    var parsed;
    try {
      parsed = JSON.parse(editorEl.value);
    } catch (e) {
      statusEl.textContent = 'JSON non valido: ' + e.message;
      statusEl.style.color = 'var(--a-red)';
      return;
    }

    editorEl.value = JSON.stringify(parsed, null, 2);
    statusEl.textContent = 'Salvataggio…';
    statusEl.style.color = '';

    db.collection('siteData').doc(key).set({
      json:      JSON.stringify(parsed),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      statusEl.textContent = '✓ Salvato con successo';
      statusEl.style.color = 'var(--a-green)';
      updatedEl.textContent = 'Salvato ora';
      setTimeout(function () { statusEl.textContent = ''; }, 3000);
    }).catch(function (e) {
      statusEl.textContent = 'Errore: ' + e.message;
      statusEl.style.color = 'var(--a-red)';
    });
  };

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
    _syncSpPreview();
    document.getElementById('spLogoEditor').style.display = 'none';
    document.getElementById('spForm').classList.remove('is-hidden');
    document.getElementById('spNome').focus();
  };

  window.AdminActions.deleteSponsor = function (id) {
    confirm('Eliminare questo sponsor?', function () {
      var list = VV.getSponsors().filter(function (s) { return s.id !== id; });
      DB.saveSponsors(list);
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

  /* ================================================================
     BUDGET & FORECAST — CRM sponsor, rette, spese, log (Area Dirigenti)

     Fuso nel pannello unico: stesso login, stesso ruolo "dirigente"
     verificato in _checkRole(), stesso log (auditLog) usato anche da
     db.js per il resto del CMS. DG è un alias di AdminActions, ma va
     esposto anche su window: tutto admin.js vive in un'unica IIFE,
     quindi un "var DG" locale non basta — gli onclick="DG.xxx()"
     iniettati via innerHTML girano nello scope globale della pagina,
     non nella closure dello script, e senza window.DG risolvono a
     "DG is not defined" ad ogni click.
  ================================================================ */
  var DG = window.AdminActions;
  window.DG = DG;

  var _seasons = [];
  var _currentSeasonId = null;
  var _aziende = [];
  var _sponsorizzazioni = [];
  var _attivita = [];
  var _promemoria = [];
  var _tranche = [];
  var _categorieAtleti = [];
  var _vociSpesa = [];
  var _auditLog = [];
  var _dirigentiList = [];
  var _curSponsorId = null, _curAziendaId = null;
  var _openModalId = null;
  var _activeBudgetTab = 'riepilogo';
  var STATI = ['prospect', 'contattato', 'in_trattativa', 'chiuso', 'rifiutato'];

  /* ---- Sotto-tab interne alla sezione "Budget & Forecast" ---- */
  function _switchBudgetTab(tab) {
    _activeBudgetTab = tab;
    document.querySelectorAll('.budget-subtab').forEach(function (btn) { btn.classList.toggle('is-active', btn.dataset.btab === tab); });
    document.querySelectorAll('#sectionBudget > .dg-section').forEach(function (pane) { pane.classList.add('is-hidden'); });
    document.getElementById('budgetPane' + cap(tab)).classList.remove('is-hidden');
    _renderActiveBudgetTab();
  }

  function _renderActiveBudgetTab() {
    if (_activeBudgetTab === 'riepilogo') { _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards(); _renderCharts(); }
    if (_activeBudgetTab === 'sponsor')   _renderKanban();
    if (_activeBudgetTab === 'rette')     _renderRette();
    if (_activeBudgetTab === 'spese')     _renderSpese();
  }

  function _mapDoc(d) { return Object.assign({ id: d.id }, d.data()); }

  /* ---- AUDIT LOG — usato anche da db.js (DB.setAuditHook) ---- */
  function _diff(oldObj, newObj, fields) {
    var out = [];
    (fields || Object.keys(newObj)).forEach(function (f) {
      var a = oldObj ? oldObj[f] : undefined;
      var b = newObj[f];
      var an = a === undefined ? null : a;
      var bn = b === undefined ? null : b;
      if (JSON.stringify(an) !== JSON.stringify(bn)) out.push({ campo: f, prima: an, dopo: bn });
    });
    return out;
  }

  function _logWrite(entita, entitaId, entitaLabel, azione, changes) {
    if (!changes || !changes.length) return Promise.resolve();
    var ref = db.collection('auditLog').doc();
    var entry = {
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      dirigenteId: _uid,
      dirigenteNome: _dirigenteNome,
      entita: entita,
      entitaId: entitaId,
      entitaLabel: entitaLabel,
      azione: azione,
      campi: changes.map(function (ch) { return ch.campo; })
    };
    return ref.set(entry).then(function () {
      _auditLog.unshift(Object.assign({ id: ref.id }, entry, { timestamp: new Date() }));
      if (document.getElementById('sectionLog') && !document.getElementById('sectionLog').classList.contains('is-hidden')) _renderLog();
    }).catch(function (e) {
      /* il log non deve mai bloccare l'operazione principale, già salvata */
      console.error('[audit log]', e);
    });
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
      })
    ]).then(function (res) {
      _dirigentiList    = res[0].docs.map(_mapDoc);
      _seasons          = res[1].docs.map(_mapDoc).sort(function (a, b) { return (a.nome || '') < (b.nome || '') ? 1 : -1; });
      _aziende          = res[2].docs.map(_mapDoc);
      _sponsorizzazioni = res[3].docs.map(_mapDoc);
      _attivita         = res[4].docs.map(_mapDoc);
      _promemoria       = res[5].docs.map(_mapDoc);
      _tranche          = res[6].docs.map(_mapDoc);

      var chain = _seasons.length ? Promise.resolve() : _createDefaultSeason();

      return chain.then(function () {
        var active = _seasons.find(function (s) { return s.isAttiva; }) || _seasons[0];
        _currentSeasonId = active.id;
        _populateSeasonSelect();
        _populateResponsabileSelects();
        _populateLogDirigenteFilter();
        return _loadSeasonScoped();
      });
    }).then(function () {
      return _loadAuditLog();
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
      _seasons = [data];
    });
  }

  function _loadSeasonScoped() {
    return Promise.all([
      db.collection('categorieAtleti').where('seasonId', '==', _currentSeasonId).get(),
      db.collection('vociSpesa').where('seasonId', '==', _currentSeasonId).get()
    ]).then(function (res) {
      _categorieAtleti = res[0].docs.map(_mapDoc);
      _vociSpesa       = res[1].docs.map(_mapDoc);
    });
  }

  function _loadAuditLog() {
    return db.collection('auditLog').orderBy('timestamp', 'desc').limit(300).get().then(function (snap) {
      _auditLog = snap.docs.map(_mapDoc);
    }).catch(function (err) {
      console.error('[budget] log', err);
    });
  }

  /* ---- TRANCHE DI PAGAMENTO — incasso reale vs contrattuale ---- */
  function _trancheOf(sponsorId) {
    return _tranche.filter(function (t) { return t.sponsorizzazioneId === sponsorId; });
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

  /* ---- OBIETTIVO / RIEPILOGO ---- */
  function _calcRiepilogo() {
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; });
    var chiusi = cur.filter(function (s) { return s.stato === 'chiuso'; });
    var sponsorChiusi = chiusi.reduce(function (s, x) { return s + _sponsorIncassato(x); }, 0);
    var sponsorDaIncassare = chiusi.reduce(function (s, x) { return s + _sponsorDaIncassare(x); }, 0);
    var sponsorPotenziali = cur.filter(function (s) { return s.stato !== 'chiuso' && s.stato !== 'rifiutato'; })
      .reduce(function (s, x) { return s + (+x.importoStimato || 0) * (+x.probabilitaChiusura || 0); }, 0);
    var rette = _categorieAtleti.reduce(function (s, c) { return s + (+c.incassato || 0); }, 0);
    var uscite = _vociSpesa.reduce(function (s, v) { return s + (+v.importoSostenuto || 0); }, 0);
    var entrateConfermate = sponsorChiusi + rette;
    var saldo = entrateConfermate - uscite;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var obiettivo = +season.obiettivoSaldo || 0;
    var differenza = saldo - obiettivo;
    var pct = obiettivo > 0 ? Math.round(saldo / obiettivo * 100) : 0;
    return {
      sponsorChiusi: sponsorChiusi, sponsorDaIncassare: sponsorDaIncassare, sponsorPotenziali: sponsorPotenziali, rette: rette, uscite: uscite,
      entrateConfermate: entrateConfermate, saldo: saldo, obiettivo: obiettivo, differenza: differenza, pct: pct
    };
  }

  function _renderObiettivo() {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    document.getElementById('obiettivoSeasonNome').textContent = 'Stagione ' + (season.nome || '—');
    document.getElementById('obiettivoInput').value = season.obiettivoSaldo || 0;
    var r = _calcRiepilogo();
    var pct = Math.max(0, Math.min(100, r.pct));
    document.getElementById('obiettivoBarFill').style.width = pct + '%';
    document.getElementById('obiettivoPct').textContent = r.pct + '%';
  }

  function _saveObiettivo() {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var v = +document.getElementById('obiettivoInput').value || 0;
    var old = { obiettivoSaldo: season.obiettivoSaldo || 0 };
    season.obiettivoSaldo = v;
    db.collection('budgetSeasons').doc(season.id).update({ obiettivoSaldo: v })
      .then(function () { return _logWrite('obiettivo', season.id, 'Obiettivo — stagione ' + season.nome, 'update', _diff(old, { obiettivoSaldo: v }, ['obiettivoSaldo'])); })
      .then(function () { _renderObiettivo(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _renderPromemoriaList(widgetId, listId, limit) {
    var curIds = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; }).map(function (s) { return s.id; });
    var upcoming = _promemoria.filter(function (p) {
      return !p.completato && curIds.indexOf(p.sponsorizzazioneId) !== -1 && _daysDiff(p.dataScadenza) <= 7;
    }).sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    if (limit) upcoming = upcoming.slice(0, limit);

    var widget = document.getElementById(widgetId);
    if (!upcoming.length) { widget.classList.add('is-hidden'); return; }
    widget.classList.remove('is-hidden');
    document.getElementById(listId).innerHTML = upcoming.map(function (p) {
      var s = _sponsorizzazioni.find(function (x) { return x.id === p.sponsorizzazioneId; });
      var az = s ? _aziendaById(s.aziendaId) : null;
      var days = _daysDiff(p.dataScadenza);
      var badge = days < 0
        ? '<span class="dg-chip dg-chip--overdue">Scaduto</span>'
        : '<span class="dg-chip dg-chip--soon">' + _fmtDate(p.dataScadenza) + '</span>';
      return '<div class="dg-reminder-item" onclick="DG.openFromReminder(\'' + p.sponsorizzazioneId + '\')">' +
        '<div class="dg-reminder-info"><div class="dg-reminder-azienda">' + esc(az ? az.ragioneSociale : '—') + '</div>' +
        '<div class="dg-reminder-desc">' + esc(p.descrizione || '') + '</div></div>' + badge + '</div>';
    }).join('');
  }

  function _renderPromemoriaWidget() {
    _renderPromemoriaList('promemoriaWidget', 'promemoriaWidgetList');
  }

  /* ---- Widget "Budget stagione" sulla Dashboard principale ---- */
  function _renderDashBudgetWidget() {
    var r = _calcRiepilogo();
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var pct = Math.max(0, Math.min(100, r.pct));

    document.getElementById('dashBudgetSeasonName').textContent = season.nome ? '· ' + season.nome : '';
    var saldoEl = document.getElementById('dashBudgetSaldo');
    saldoEl.textContent = (r.saldo < 0 ? '-' : '') + '€' + Math.abs(Math.round(r.saldo)).toLocaleString('it-IT');
    saldoEl.className = 'dash-budget-saldo ' + (r.saldo >= 0 ? 'dash-budget-saldo--pos' : 'dash-budget-saldo--neg');
    document.getElementById('dashBudgetPct').textContent = r.pct + '%';
    document.getElementById('dashBudgetBarFill').style.width = pct + '%';
    document.getElementById('dashBudgetObiettivo').textContent = 'Obiettivo €' + Math.round(r.obiettivo).toLocaleString('it-IT');

    _renderPromemoriaList('dashPromemoriaWidget', 'dashPromemoriaList', 4);
  }

  DG.openFromReminder = function (sponsorId) {
    goTo('budget');
    _switchBudgetTab('sponsor');
    _openDrawer(sponsorId);
  };

  function _budgetStatCard(label, val2, cls) {
    var sign = val2 < 0 ? '-' : '';
    return '<div class="dg-stat-card ' + (cls || '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + sign + '€' + Math.abs(Math.round(val2)).toLocaleString('it-IT') + '</div></div>';
  }

  function _renderStatCards() {
    var r = _calcRiepilogo();
    document.getElementById('dgStatRow').innerHTML =
      _budgetStatCard('Entrate confermate', r.entrateConfermate, '') +
      _budgetStatCard('Da incassare (sponsor)', r.sponsorDaIncassare, '--orange') +
      _budgetStatCard('Uscite', r.uscite, '--red') +
      _budgetStatCard('Saldo', r.saldo, r.saldo >= 0 ? '--green' : '--red') +
      _budgetStatCard('Differenza da obiettivo', r.differenza, r.differenza >= 0 ? '--green' : '--orange');
  }

  /* ---- CHARTS — SVG inline, nessuna libreria esterna ---- */
  function _svgBarChart(entrate, uscite, obiettivo) {
    var w = 480, h = 220, pad = 40;
    var max = Math.max(entrate, uscite, obiettivo, 1) * 1.15;
    var barW = 76, gap = 70, chartH = h - pad * 2;
    function y(v) { return pad + chartH - (v / max * chartH); }
    var bars = [{ label: 'Entrate', val: entrate, color: '#10B981' }, { label: 'Uscite', val: uscite, color: '#EF4444' }];
    var startX = pad + 30;

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="220" role="img" aria-label="Entrate vs uscite vs obiettivo">';
    svg += '<line x1="' + pad + '" y1="' + (pad + chartH) + '" x2="' + (w - pad) + '" y2="' + (pad + chartH) + '" stroke="#C3C2B7" stroke-width="1"/>';

    if (obiettivo > 0) {
      var oy = y(obiettivo);
      svg += '<line x1="' + pad + '" y1="' + oy + '" x2="' + (w - pad) + '" y2="' + oy + '" stroke="#1E3A5F" stroke-width="2" stroke-dasharray="5,4"/>';
      svg += '<text x="' + (w - pad) + '" y="' + (oy - 8) + '" text-anchor="end" font-size="11" fill="#1E3A5F" font-weight="700">Obiettivo €' + Math.round(obiettivo).toLocaleString('it-IT') + '</text>';
    }

    bars.forEach(function (b, i) {
      var bx = startX + i * (barW + gap);
      var by = y(b.val);
      var bh = (pad + chartH) - by;
      svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + Math.max(bh, 0) + '" rx="4" fill="' + b.color + '"/>';
      svg += '<text x="' + (bx + barW / 2) + '" y="' + (by - 8) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#1E293B">€' + Math.round(b.val).toLocaleString('it-IT') + '</text>';
      svg += '<text x="' + (bx + barW / 2) + '" y="' + (pad + chartH + 20) + '" text-anchor="middle" font-size="12" fill="#64748B">' + b.label + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  function _svgDonut(parts) {
    var total = parts.reduce(function (s, p) { return s + p.value; }, 0) || 1;
    var size = 200, r = 80, cx = 100, cy = 100, strokeW = 28, GAP = 4;
    var circumference = 2 * Math.PI * r;
    var offset = 0, segs = '';
    parts.forEach(function (p) {
      var frac = p.value / total;
      var full = frac * circumference;
      var len = Math.max(full - GAP, 0);
      segs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + p.color + '" stroke-width="' + strokeW +
        '" stroke-dasharray="' + len + ' ' + (circumference - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      offset += full;
    });
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="100%" height="200" role="img" aria-label="Composizione entrate">' + segs +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - strokeW / 2 - 4) + '" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="12" fill="#64748B">Totale</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#1E293B">€' + Math.round(total).toLocaleString('it-IT') + '</text>' +
      '</svg>';
    var legend = '<div class="dg-chart-legend">' + parts.map(function (p) {
      var pct = total ? Math.round(p.value / total * 100) : 0;
      return '<div class="dg-chart-legend-item"><span class="dg-chart-legend-swatch" style="background:' + p.color + '"></span>' +
        esc(p.label) + ' — €' + Math.round(p.value).toLocaleString('it-IT') + ' (' + pct + '%)</div>';
    }).join('') + '</div>';
    return svg + legend;
  }

  function _renderCharts() {
    var r = _calcRiepilogo();
    document.getElementById('chartBar').innerHTML = _svgBarChart(r.entrateConfermate, r.uscite, r.obiettivo);
    document.getElementById('chartDonut').innerHTML = _svgDonut([
      { label: 'Rette atleti', value: r.rette, color: '#008CFD' },
      { label: 'Sponsor chiusi', value: r.sponsorChiusi, color: '#10B981' },
      { label: 'Sponsor potenziali (pesato)', value: r.sponsorPotenziali, color: '#F59E0B' }
    ]);
  }

  /* ---- KANBAN SPONSOR ---- */
  function _renderKanban() {
    var onlyMine = document.getElementById('filterMieiSponsor').checked;
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; });

    STATI.forEach(function (stato) {
      var items = cur.filter(function (s) { return s.stato === stato && (!onlyMine || s.dirigenteResponsabileId === _uid); });
      document.getElementById('count' + cap(stato)).textContent = items.length;
      var col = document.getElementById('col' + cap(stato));
      if (!items.length) { col.innerHTML = ''; return; }
      col.innerHTML = items.map(function (s) {
        var azienda = _aziendaById(s.aziendaId);
        var importo = s.stato === 'chiuso' ? (s.importoConfermato || 0) : (s.importoStimato || 0);
        var resp = _dirigentiList.find(function (d) { return d.id === s.dirigenteResponsabileId; });
        var prom = _nextPromemoria(s.id);
        var chip = '';
        if (prom) {
          var days = _daysDiff(prom.dataScadenza);
          if (days < 0) chip = '<span class="dg-chip dg-chip--overdue">Scaduto</span>';
          else if (days <= 7) chip = '<span class="dg-chip dg-chip--soon">' + _fmtDate(prom.dataScadenza) + '</span>';
        }
        return '<div class="dg-kanban-card" draggable="true" data-id="' + s.id + '">' +
          '<div class="dg-kanban-card-top">' +
          '<span class="dg-kanban-card-nome">' + esc(azienda ? azienda.ragioneSociale : '—') +
          (azienda && _isStorico(azienda.id) ? ' <span class="dg-badge dg-badge--storico" title="Sponsor storico">storico</span>' : '') +
          '</span></div>' +
          '<div class="dg-kanban-card-importo">€' + Number(importo || 0).toLocaleString('it-IT') + '</div>' +
          '<div class="dg-kanban-card-bottom">' +
          '<span class="dg-avatar" title="' + esc(resp ? (resp.nome + ' ' + resp.cognome) : 'Non assegnato') + '">' + (resp ? _initials(resp.nome, resp.cognome) : '?') + '</span>' +
          chip +
          '</div></div>';
      }).join('');
    });

    _attachKanbanEvents();
  }

  function _attachKanbanEvents() {
    document.querySelectorAll('.dg-kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); });
      card.addEventListener('click', function () { _openDrawer(card.dataset.id); });
    });
    document.querySelectorAll('.dg-kanban-col-body').forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('dg-drop-hover'); });
      col.addEventListener('dragleave', function () { col.classList.remove('dg-drop-hover'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('dg-drop-hover');
        var id = e.dataTransfer.getData('text/plain');
        var stato = col.closest('.dg-kanban-col').dataset.stato;
        _changeStato(id, stato);
      });
    });
  }

  function _changeStato(id, novoStato) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s || s.stato === novoStato) return;
    var old = Object.assign({}, s);
    var patch = { stato: novoStato };
    if (novoStato === 'chiuso' && !s.importoConfermato) patch.importoConfermato = s.importoStimato || 0;
    Object.assign(s, patch);
    _renderKanban(); _renderStatCards(); _renderCharts();
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    db.collection('sponsorizzazioni').doc(id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- DRAWER — Scheda Azienda (accordion: tutto chiuso, una sezione alla volta) ---- */
  var DRAWER_SECTIONS = [
    { key: 'anagrafica', label: 'Anagrafica',       fn: function () { return _tabAnagrafica(); } },
    { key: 'deal',       label: 'Sponsorizzazione', fn: function () { return _tabDeal(); } },
    { key: 'pagamenti',  label: 'Pagamenti',        fn: function () { return _tabPagamenti(); } },
    { key: 'timeline',   label: 'Timeline',         fn: function () { return _tabTimeline(); } },
    { key: 'promemoria', label: 'Promemoria',       fn: function () { return _tabPromemoria(); } },
    { key: 'storico',    label: 'Storico',          fn: function () { return _tabStorico(); } }
  ];
  var _openAccordionSection = null;

  function _openDrawer(sponsorId) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === sponsorId; });
    if (!s) return;
    _curSponsorId = sponsorId;
    _curAziendaId = s.aziendaId;
    var az = _aziendaById(_curAziendaId);
    document.getElementById('drawerAziendaNome').textContent = az ? az.ragioneSociale : '—';
    document.getElementById('drawerStoricoBadge').classList.toggle('is-hidden', !_isStorico(_curAziendaId));
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
    var a = _aziendaById(_curAziendaId) || {};
    return '<div class="dg-form-group"><label class="dg-form-label">Ragione sociale</label><input class="dg-form-input" id="dgAzNome" value="' + esc(a.ragioneSociale) + '"></div>' +
      '<div class="dg-form-grid">' +
      _field('dgAzSettore', 'Settore', a.settore) +
      _field('dgAzReferente', 'Referente', a.referente) +
      _field('dgAzTelefono', 'Telefono', a.telefono) +
      _field('dgAzEmail', 'Email', a.email) +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Sito web</label><input class="dg-form-input" id="dgAzSito" value="' + esc(a.sitoWeb) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Note</label><textarea class="dg-form-input dg-form-textarea" id="dgAzNote" rows="3">' + esc(a.note || '') + '</textarea></div>' +
      '<div class="dg-form-actions" style="justify-content:space-between">' +
        '<button class="dg-btn-ghost dg-btn-ghost--danger dg-btn-sm" onclick="DG.deleteAzienda()">Elimina azienda</button>' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveAzienda()">Salva anagrafica</button>' +
      '</div>';
  }

  DG.saveAzienda = function () {
    var a = _aziendaById(_curAziendaId);
    if (!a) return;
    var old = Object.assign({}, a);
    var patch = {
      ragioneSociale: val('dgAzNome'), settore: val('dgAzSettore'), referente: val('dgAzReferente'),
      telefono: val('dgAzTelefono'), email: val('dgAzEmail'), sitoWeb: val('dgAzSito'), note: val('dgAzNote')
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
    var a = _aziendaById(_curAziendaId);
    if (!a) return;
    var hasSponsorizzazioni = _sponsorizzazioni.some(function (x) { return x.aziendaId === a.id; });
    if (hasSponsorizzazioni) {
      alert('Questa azienda ha ancora sponsorizzazioni collegate (anche di stagioni passate). Elimina prima quelle dal tab "Sponsorizzazione", poi l\'azienda.');
      return;
    }
    confirm('Eliminare definitivamente l\'azienda "' + a.ragioneSociale + '"? L\'operazione non è reversibile.', function () {
      db.collection('aziende').doc(a.id).delete()
        .then(function () { return _logWrite('azienda', a.id, 'Azienda — ' + a.ragioneSociale, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _aziende = _aziende.filter(function (x) { return x.id !== a.id; });
          _closeDrawer();
          _renderKanban();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabDeal() {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return '';
    var respOptions = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === s.dirigenteResponsabileId ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
    var statoOptions = STATI.map(function (st) {
      return '<option value="' + st + '"' + (st === s.stato ? ' selected' : '') + '>' + _statoLabel(st) + '</option>';
    }).join('');
    var tipoOptions = ['denaro', 'servizi', 'materiale'].map(function (t) {
      return '<option value="' + t + '"' + (t === s.tipologia ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
    return '<div class="dg-form-group"><label class="dg-form-label">Stato</label><select id="dgDealStato" class="dg-form-input">' + statoOptions + '</select></div>' +
      '<div class="dg-form-grid">' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo stimato (€)</label><input type="number" id="dgDealStimato" class="dg-form-input" value="' + (s.importoStimato || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Probabilità chiusura</label><input type="number" id="dgDealProb" class="dg-form-input" min="0" max="1" step="0.05" value="' + (s.probabilitaChiusura || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo confermato (€)</label><input type="number" id="dgDealConfermato" class="dg-form-input" value="' + (s.importoConfermato || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Tipologia</label><select id="dgDealTipologia" class="dg-form-input">' + tipoOptions + '</select></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Data firma</label><input type="date" id="dgDealFirma" class="dg-form-input" value="' + (s.dataFirma || '') + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgDealScadenza" class="dg-form-input" value="' + (s.scadenza || '') + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Modalità pagamento</label><input type="text" id="dgDealPagamento" class="dg-form-input" value="' + esc(s.modalitaPagamento) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Responsabile</label><select id="dgDealResponsabile" class="dg-form-input">' + respOptions + '</select></div>' +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Contropartite</label><textarea id="dgDealContropartite" class="dg-form-input dg-form-textarea" rows="2">' + esc(s.contropartite || '') + '</textarea></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Note</label><textarea id="dgDealNote" class="dg-form-input dg-form-textarea" rows="2">' + esc(s.note || '') + '</textarea></div>' +
      '<div class="dg-form-actions" style="justify-content:space-between">' +
        '<button class="dg-btn-ghost dg-btn-ghost--danger dg-btn-sm" onclick="DG.deleteDeal()">Elimina sponsorizzazione</button>' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveDeal()">Salva</button>' +
      '</div>';
  }

  DG.saveDeal = function () {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return;
    var old = Object.assign({}, s);
    var patch = {
      stato: val('dgDealStato'),
      importoStimato: +val('dgDealStimato') || 0,
      probabilitaChiusura: +val('dgDealProb') || 0,
      importoConfermato: +val('dgDealConfermato') || 0,
      tipologia: val('dgDealTipologia'),
      dataFirma: val('dgDealFirma'),
      scadenza: val('dgDealScadenza'),
      modalitaPagamento: val('dgDealPagamento'),
      dirigenteResponsabileId: val('dgDealResponsabile'),
      contropartite: val('dgDealContropartite'),
      note: val('dgDealNote')
    };
    Object.assign(s, patch);
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    db.collection('sponsorizzazioni').doc(s.id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { _renderKanban(); _renderStatCards(); _renderCharts(); _refreshAccordionSection('deal'); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteDeal = function () {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    confirm('Eliminare definitivamente "' + label + '"? L\'operazione non è reversibile.', function () {
      db.collection('sponsorizzazioni').doc(s.id).delete()
        .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _sponsorizzazioni = _sponsorizzazioni.filter(function (x) { return x.id !== s.id; });
          _closeDrawer();
          _renderKanban(); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- TRANCHE DI PAGAMENTO — tracciamento incassi reali di uno sponsor chiuso ---- */
  function _tabPagamenti() {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return '';
    var items = _trancheOf(_curSponsorId).sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; });

    var totale = +s.importoConfermato || 0;
    var pianificato = items.reduce(function (sum, t) { return sum + (+t.importo || 0); }, 0);
    var incassato = items.reduce(function (sum, t) { return sum + (t.pagato ? (+t.importo || 0) : 0); }, 0);
    var residuo = totale - pianificato;

    var intro = s.stato !== 'chiuso'
      ? '<p class="dg-muted" style="margin-bottom:14px">Lo sponsor non è ancora "Chiuso": le tranche restano comunque salvate, ma contano nel Saldo/Entrate confermate solo quando lo stato passa a Chiuso.</p>'
      : '';

    var summary = '<div class="dg-card" style="margin-bottom:14px;padding:14px 16px">' +
      '<div class="dg-toolbar" style="gap:16px">' +
      '<div><div class="dg-stat-label">Importo confermato</div><div class="dg-card-title">€' + totale.toLocaleString('it-IT') + '</div></div>' +
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
      return '<div class="dg-reminder-item" style="cursor:default">' +
        '<label class="dg-check"><input type="checkbox" ' + (t.pagato ? 'checked' : '') + ' onchange="DG.toggleTranchePagata(\'' + t.id + '\', this.checked)">' +
        '<span><div class="dg-reminder-azienda">€' + Number(t.importo || 0).toLocaleString('it-IT') + (t.pagato ? ' — pagata' : ' — da pagare') + '</div>' +
        '<div class="dg-reminder-desc">Scadenza: ' + _fmtDate(t.scadenza) + (t.note ? ' · ' + esc(t.note) : '') + '</div></span></label>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteTranche(\'' + t.id + '\')">' + _delIconSm() + '</button></div>';
    }).join('') : '<p class="dg-muted">Nessuna tranche pianificata: l\'importo confermato conta per intero nel saldo.</p>';

    return intro + summary +
      '<div style="display:flex;flex-direction:column;gap:8px">' + list + '</div>' +
      '<div class="dg-form-grid" style="margin-top:18px">' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo (€)</label><input type="number" id="dgTrancheImporto" class="dg-form-input" min="0" step="50"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgTrancheScadenza" class="dg-form-input" value="' + _todayISO() + '"></div>' +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Note</label><input type="text" id="dgTrancheNote" class="dg-form-input" placeholder="es. Acconto alla firma"></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addTranche()">Aggiungi tranche</button></div>';
  }

  DG.addTranche = function () {
    var importo = +val('dgTrancheImporto') || 0;
    var scadenza = val('dgTrancheScadenza');
    if (!importo || !scadenza) { alert('Importo e scadenza sono obbligatori.'); return; }
    var data = {
      sponsorizzazioneId: _curSponsorId, importo: importo, scadenza: scadenza,
      note: val('dgTrancheNote').trim(), pagato: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('tranchePagamento').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _tranche.push(data);
      return _logWrite('tranchePagamento', ref.id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.toggleTranchePagata = function (id, checked) {
    var t = _tranche.find(function (x) { return x.id === id; });
    if (!t) return;
    var old = { pagato: !!t.pagato };
    t.pagato = checked;
    var az = _aziendaById(_curAziendaId);
    db.collection('tranchePagamento').doc(id).update({ pagato: checked })
      .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'update', _diff(old, { pagato: checked }, ['pagato'])); })
      .then(function () { _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteTranche = function (id) {
    confirm('Eliminare questa tranche?', function () {
      var az = _aziendaById(_curAziendaId);
      db.collection('tranchePagamento').doc(id).delete()
        .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _tranche = _tranche.filter(function (x) { return x.id !== id; });
          _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabTimeline() {
    var items = _attivita.filter(function (a) { return a.sponsorizzazioneId === _curSponsorId; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var list = items.length ? '<div class="dg-timeline">' + items.map(function (a) {
      return '<div class="dg-timeline-item"><span class="dg-timeline-dot"></span>' +
        '<div class="dg-timeline-content"><div>' + _tipoLabel(a.tipo) + ' — ' + esc(a.descrizione || '') + '</div>' +
        '<div class="dg-timeline-meta">' + _fmtDate(a.data) + ' · ' + esc(a.dirigenteNome || '') + '</div></div></div>';
    }).join('') + '</div>' : '<p class="dg-muted">Nessuna attività registrata.</p>';

    var tipoOptions = ['chiamata', 'email', 'incontro', 'nota'].map(function (t) { return '<option value="' + t + '">' + _tipoLabel(t) + '</option>'; }).join('');

    return list +
      '<div class="dg-form-group" style="margin-top:18px"><label class="dg-form-label">Tipo</label><select id="dgAttTipo" class="dg-form-input">' + tipoOptions + '</select></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Data</label><input type="date" id="dgAttData" class="dg-form-input" value="' + _todayISO() + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Descrizione</label><textarea id="dgAttDesc" class="dg-form-input dg-form-textarea" rows="2" placeholder="Cosa è stato detto/fatto..."></textarea></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addAttivita()">Aggiungi</button></div>';
  }

  DG.addAttivita = function () {
    var desc = val('dgAttDesc').trim();
    if (!desc) { alert('Inserisci una descrizione.'); return; }
    var data = {
      sponsorizzazioneId: _curSponsorId, tipo: val('dgAttTipo'), data: val('dgAttData'),
      dirigenteId: _uid, dirigenteNome: _dirigenteNome, descrizione: desc, createdAt: new Date().toISOString()
    };
    var ref = db.collection('attivita').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _attivita.unshift(data);
      return _logWrite('attivita', ref.id, 'Attività — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('timeline'); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabPromemoria() {
    var items = _promemoria.filter(function (p) { return p.sponsorizzazioneId === _curSponsorId; })
      .sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    var list = items.length ? items.map(function (p) {
      var resp = _dirigentiList.find(function (d) { return d.id === p.dirigenteAssegnatoId; });
      return '<div class="dg-reminder-item" style="cursor:default">' +
        '<label class="dg-check" style="align-items:flex-start"><input type="checkbox" ' + (p.completato ? 'checked' : '') + ' onchange="DG.toggleReminder(\'' + p.id + '\', this.checked)">' +
        '<span><div class="dg-reminder-desc" style="color:var(--dg-text);font-weight:600">' + esc(p.descrizione || '') + '</div>' +
        '<div class="dg-reminder-desc">Scadenza: ' + _fmtDate(p.dataScadenza) + ' · ' + esc(resp ? (resp.nome + ' ' + resp.cognome) : '—') + '</div></span></label>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteReminder(\'' + p.id + '\')">' + _delIconSm() + '</button></div>';
    }).join('') : '<p class="dg-muted">Nessun promemoria.</p>';

    var respOptions = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === _uid ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
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
      sponsorizzazioneId: _curSponsorId, dataScadenza: scad, descrizione: desc,
      dirigenteAssegnatoId: val('dgPromAssegnato'), completato: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('promemoria').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _promemoria.unshift(data);
      return _logWrite('promemoria', ref.id, 'Promemoria — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('promemoria'); _renderPromemoriaWidget(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.toggleReminder = function (id, checked) {
    var p = _promemoria.find(function (x) { return x.id === id; });
    if (!p) return;
    var old = { completato: !!p.completato };
    p.completato = checked;
    db.collection('promemoria').doc(id).update({ completato: checked })
      .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'update', _diff(old, { completato: checked }, ['completato'])); })
      .then(function () { _renderPromemoriaWidget(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteReminder = function (id) {
    confirm('Eliminare questo promemoria?', function () {
      db.collection('promemoria').doc(id).delete()
        .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _promemoria = _promemoria.filter(function (x) { return x.id !== id; });
          _refreshAccordionSection('promemoria'); _renderPromemoriaWidget();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _tabStorico() {
    var items = _sponsorizzazioni.filter(function (s) { return s.aziendaId === _curAziendaId; })
      .sort(function (a, b) { return a.seasonId === b.seasonId ? 0 : (a.seasonId < b.seasonId ? 1 : -1); });
    if (!items.length) return '<p class="dg-muted">Nessuno storico disponibile.</p>';
    return '<div class="dg-timeline">' + items.map(function (s) {
      var season = _seasons.find(function (x) { return x.id === s.seasonId; });
      var importo = s.stato === 'chiuso' ? s.importoConfermato : s.importoStimato;
      return '<div class="dg-timeline-item"><span class="dg-timeline-dot" style="background:' + _statoColor(s.stato) + '"></span>' +
        '<div class="dg-timeline-content"><div><strong>' + esc(season ? season.nome : '—') + '</strong> — ' + _statoLabel(s.stato) + ' — €' + Number(importo || 0).toLocaleString('it-IT') + '</div></div></div>';
    }).join('') + '</div>';
  }

  /* ---- RETTE ATLETI ---- */
  function _renderRette() {
    var body = document.getElementById('retteBody');
    if (!_categorieAtleti.length) { body.innerHTML = '<tr><td colspan="7" class="dg-empty">Nessuna categoria per questa stagione.</td></tr>'; return; }
    body.innerHTML = _categorieAtleti.map(function (c) {
      var previsto = (+c.nAtletiPrevisti || 0) * (+c.rettaUnitaria || 0);
      var incassato = +c.incassato || 0;
      var diff = incassato - previsto;
      return '<tr>' +
        '<td>' + esc(c.nome) + '</td>' +
        '<td>' + (c.nAtletiPrevisti || 0) + '</td>' +
        '<td>€' + Number(c.rettaUnitaria || 0).toLocaleString('it-IT') + '</td>' +
        '<td>€' + previsto.toLocaleString('it-IT') + '</td>' +
        '<td><input type="number" class="dg-table-input" value="' + incassato + '" data-id="' + c.id + '" onchange="DG.saveIncassato(this)"></td>' +
        '<td class="' + (diff >= 0 ? 'dg-diff-pos' : 'dg-diff-neg') + '">' + (diff >= 0 ? '+' : '') + Math.round(diff).toLocaleString('it-IT') + ' €</td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteCategoria(\'' + c.id + '\')">' + _delIconSm() + '</button></td>' +
        '</tr>';
    }).join('');
  }

  DG.saveIncassato = function (el) {
    var id = el.dataset.id;
    var c = _categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    var old = { incassato: c.incassato || 0 };
    var v = +el.value || 0;
    c.incassato = v;
    db.collection('categorieAtleti').doc(id).update({ incassato: v })
      .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'update', _diff(old, { incassato: v }, ['incassato'])); })
      .then(function () { _renderRette(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteCategoria = function (id) {
    var c = _categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    confirm('Eliminare la categoria "' + c.nome + '"?', function () {
      db.collection('categorieAtleti').doc(id).delete()
        .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _categorieAtleti = _categorieAtleti.filter(function (x) { return x.id !== id; });
          _renderRette(); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- SPESE ---- */
  function _renderSpese() {
    var body = document.getElementById('speseBody');
    if (!_vociSpesa.length) { body.innerHTML = '<tr><td colspan="5" class="dg-empty">Nessuna voce di spesa per questa stagione.</td></tr>'; return; }
    body.innerHTML = _vociSpesa.map(function (v) {
      return '<tr>' +
        '<td>' + esc(v.categoria) + '</td>' +
        '<td><input type="number" class="dg-table-input" value="' + (v.importoPreventivato || 0) + '" data-id="' + v.id + '" data-field="importoPreventivato" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><input type="number" class="dg-table-input" value="' + (v.importoSostenuto || 0) + '" data-id="' + v.id + '" data-field="importoSostenuto" onchange="DG.saveSpesaField(this)"></td>' +
        '<td>' + esc(v.note || '') + '</td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteSpesa(\'' + v.id + '\')">' + _delIconSm() + '</button></td>' +
        '</tr>';
    }).join('');
  }

  DG.saveSpesaField = function (el) {
    var id = el.dataset.id, field = el.dataset.field;
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var old = {}; old[field] = v[field] || 0;
    var nv = +el.value || 0;
    v[field] = nv;
    var patch = {}; patch[field] = nv;
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, [field])); })
      .then(function () { _renderSpese(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteSpesa = function (id) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    confirm('Eliminare la voce "' + v.categoria + '"?', function () {
      db.collection('vociSpesa').doc(id).delete()
        .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== id; });
          _renderSpese(); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

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

  function _fmtDettagli(l) {
    if (!l.campi || !l.campi.length) return '—';
    return l.campi.map(_fmtCampoLabel).join(', ');
  }

  function _renderLog() {
    var entita    = document.getElementById('logFilterEntita').value;
    var dirigente = document.getElementById('logFilterDirigente').value;
    var dal       = document.getElementById('logFilterDal').value;
    var al        = document.getElementById('logFilterAl').value;

    var rows = _auditLog.filter(function (l) {
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

  /* ---- MODALI ---- */
  function _openBudgetModal(id) {
    _openModalId = id;
    document.getElementById('modalOverlay').classList.remove('is-hidden');
    document.getElementById(id).classList.remove('is-hidden');
  }
  function _closeBudgetModal(id) {
    _openModalId = null;
    document.getElementById('modalOverlay').classList.add('is-hidden');
    document.getElementById(id).classList.add('is-hidden');
  }

  function _saveNewSponsor() {
    var aziendaSel = val('newSponsorAziendaSelect');
    var importo = +val('newSponsorImporto') || 0;
    var prob = +val('newSponsorProbabilita') || 0.5;
    var resp = val('newSponsorResponsabile');
    var tipologia = val('newSponsorTipologia');

    function createSponsorizzazione(aziendaId, aziendaNome) {
      var data = {
        aziendaId: aziendaId, seasonId: _currentSeasonId, stato: 'prospect',
        importoStimato: importo, probabilitaChiusura: prob, importoConfermato: 0,
        tipologia: tipologia, dataFirma: '', scadenza: '', modalitaPagamento: '',
        dirigenteResponsabileId: resp, contropartite: '', note: '', createdAt: new Date().toISOString()
      };
      var ref = db.collection('sponsorizzazioni').doc();
      return ref.set(data).then(function () {
        data.id = ref.id;
        _sponsorizzazioni.push(data);
        return _logWrite('sponsorizzazione', ref.id, 'Sponsorizzazione — ' + aziendaNome, 'create', _diff({}, data, Object.keys(data)));
      });
    }

    var p;
    if (aziendaSel) {
      var az = _aziendaById(aziendaSel);
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
        _aziende.push(aziendaData);
        /* Niente log qui: l'azienda nasce come parte dell'aggiunta dello sponsor,
           che è già loggata subito sotto da createSponsorizzazione(). */
        return createSponsorizzazione(aref.id, nome);
      });
    }

    p.then(function () {
      _closeBudgetModal('newSponsorModal');
      _renderKanban(); _renderStatCards(); _renderCharts();
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
    _seasons.forEach(function (s) { if (s.isAttiva) batch.update(db.collection('budgetSeasons').doc(s.id), { isAttiva: false }); });

    batch.commit().then(function () {
      data.id = ref.id;
      _seasons.forEach(function (s) { s.isAttiva = false; });
      _seasons.unshift(data);
      _currentSeasonId = ref.id;
      return _logWrite('obiettivo', ref.id, 'Stagione — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newSeasonModal');
      _populateSeasonSelect();
      return _loadSeasonScoped();
    }).then(function () {
      _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards(); _renderCharts(); _renderKanban(); _renderRette(); _renderSpese();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewCategoria() {
    var nome = val('categoriaNomeInput').trim();
    if (!nome) { alert('Inserisci il nome della categoria.'); return; }
    var data = {
      seasonId: _currentSeasonId, nome: nome,
      nAtletiPrevisti: +val('categoriaNInput') || 0,
      rettaUnitaria: +val('categoriaRettaInput') || 0,
      incassato: 0
    };
    var ref = db.collection('categorieAtleti').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _categorieAtleti.push(data);
      return _logWrite('categoriaAtleti', ref.id, 'Categoria — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newCategoriaModal');
      _renderRette();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewSpesa() {
    var categoria = val('spesaCategoriaInput').trim();
    if (!categoria) { alert('Inserisci il nome della voce di spesa.'); return; }
    var data = {
      seasonId: _currentSeasonId, categoria: categoria,
      importoPreventivato: +val('spesaPreventivatoInput') || 0,
      importoSostenuto: +val('spesaSostenutoInput') || 0,
      note: val('spesaNoteInput').trim()
    };
    var ref = db.collection('vociSpesa').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + categoria, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newSpesaModal');
      _renderSpese(); _renderStatCards(); _renderCharts();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- SELECT POPULATORS ---- */
  function _populateSeasonSelect() {
    var sel = document.getElementById('seasonSelect');
    sel.innerHTML = _seasons.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === _currentSeasonId ? ' selected' : '') + '>' + esc(s.nome) + (s.isAttiva ? ' (attiva)' : '') + '</option>';
    }).join('');
  }
  function _populateResponsabileSelects() {
    var sel = document.getElementById('newSponsorResponsabile');
    sel.innerHTML = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === _uid ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
  }
  function _populateLogDirigenteFilter() {
    var sel = document.getElementById('logFilterDirigente');
    sel.innerHTML = '<option value="">Tutti i dirigenti</option>' + _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '">' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
  }

  /* ---- UTILS ---- */
  function val(id) { return document.getElementById(id).value; }
  function _aziendaById(id) { return _aziende.find(function (a) { return a.id === id; }); }
  function _isStorico(aziendaId) { return _sponsorizzazioni.some(function (s) { return s.aziendaId === aziendaId && s.seasonId !== _currentSeasonId; }); }
  /* _daysDiff e _fmtDate: già definite più sopra (sezione Atleti), riusate qui */
  function _todayISO() { return new Date().toISOString().slice(0, 10); }
  function _initials(nome, cognome) { return ((nome || '?').charAt(0) + (cognome || '').charAt(0)).toUpperCase(); }
  function _nextPromemoria(sponsorId) {
    var items = _promemoria.filter(function (p) { return p.sponsorizzazioneId === sponsorId && !p.completato; })
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

    document.getElementById('filterMieiSponsor').addEventListener('change', _renderKanban);

    document.getElementById('seasonSelect').addEventListener('change', function () {
      _currentSeasonId = this.value;
      _loadSeasonScoped().then(function () {
        _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards();
        _renderCharts(); _renderKanban(); _renderRette(); _renderSpese();
      });
    });

    document.getElementById('obiettivoSave').addEventListener('click', _saveObiettivo);

    ['logFilterEntita', 'logFilterDirigente', 'logFilterDal', 'logFilterAl'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', _renderLog);
    });

    document.getElementById('drawerCloseBtn').addEventListener('click', _closeDrawer);
    document.getElementById('drawerOverlay').addEventListener('click', _closeDrawer);

    document.getElementById('modalOverlay').addEventListener('click', function () { if (_openModalId) _closeBudgetModal(_openModalId); });

    document.getElementById('newSponsorBtn').addEventListener('click', function () {
      document.getElementById('newSponsorAziendaSelect').innerHTML = '<option value="">— Crea nuova azienda —</option>' +
        _aziende.map(function (a) { return '<option value="' + a.id + '">' + esc(a.ragioneSociale) + '</option>'; }).join('');
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
    document.getElementById('newSponsorSave').addEventListener('click', _saveNewSponsor);

    document.getElementById('newSeasonBtn').addEventListener('click', function () {
      ['seasonNomeInput', 'seasonInizioInput', 'seasonFineInput'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('seasonObiettivoInput').value = 0;
      _openBudgetModal('newSeasonModal');
    });
    document.getElementById('newSeasonClose').addEventListener('click', function () { _closeBudgetModal('newSeasonModal'); });
    document.getElementById('newSeasonCancel').addEventListener('click', function () { _closeBudgetModal('newSeasonModal'); });
    document.getElementById('newSeasonSave').addEventListener('click', _saveNewSeason);

    document.getElementById('newCategoriaBtn').addEventListener('click', function () {
      document.getElementById('categoriaNomeInput').value = '';
      document.getElementById('categoriaNInput').value = 0;
      document.getElementById('categoriaRettaInput').value = 0;
      _openBudgetModal('newCategoriaModal');
    });
    document.getElementById('newCategoriaClose').addEventListener('click', function () { _closeBudgetModal('newCategoriaModal'); });
    document.getElementById('newCategoriaCancel').addEventListener('click', function () { _closeBudgetModal('newCategoriaModal'); });
    document.getElementById('newCategoriaSave').addEventListener('click', _saveNewCategoria);

    document.getElementById('newSpesaBtn').addEventListener('click', function () {
      document.getElementById('spesaCategoriaInput').value = '';
      document.getElementById('spesaPreventivatoInput').value = 0;
      document.getElementById('spesaSostenutoInput').value = 0;
      document.getElementById('spesaNoteInput').value = '';
      _openBudgetModal('newSpesaModal');
    });
    document.getElementById('newSpesaClose').addEventListener('click', function () { _closeBudgetModal('newSpesaModal'); });
    document.getElementById('newSpesaCancel').addEventListener('click', function () { _closeBudgetModal('newSpesaModal'); });
    document.getElementById('newSpesaSave').addEventListener('click', _saveNewSpesa);
  });

})();
