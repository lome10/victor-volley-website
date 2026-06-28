/* Victor Volley — Admin Panel Logic */
(function () {
  'use strict';

  /* ================================================
     BOOTSTRAP — Firebase Auth
  ================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    /* Ripristina sessione se l'utente è già autenticato */
    auth.onAuthStateChanged(function (user) {
      if (user) showApp();
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
  });

  function showApp() {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('adminApp').classList.remove('is-hidden');
    DB.init(function () {
      PhotoDB.init(function () {
        initNav();
        goTo('dashboard');
      });
    });
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () { location.reload(); });
  });

  /* ================================================
     NAVIGATION
  ================================================ */
  var SECTIONS = { dashboard: 'Dashboard', articoli: 'Articoli', calendario: 'Calendario', galleria: 'Galleria', squadre: 'Squadre', numeri: 'Numeri homepage' };

  function initNav() {
    document.querySelectorAll('.admin-nav-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        goTo(el.dataset.section);
      });
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

    if (section === 'dashboard')  renderDashboard();
    if (section === 'articoli')   renderArticoli();
    if (section === 'calendario') renderCalendario();
    if (section === 'galleria')   renderGalleria();
    if (section === 'squadre')    renderSquadre();
    if (section === 'numeri')     renderNumeri();
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ================================================
     DASHBOARD
  ================================================ */
  function renderDashboard() {
    var articles = VV.getArticles();
    var matches  = VV.getMatches();
    var albums   = VV.getAlbums();
    var today    = new Date().toISOString().slice(0, 10);

    var future = matches.filter(function (m) { return m.date >= today; });

    document.getElementById('dashStats').innerHTML =
      _statCard('📰', articles.length, 'Articoli', '--blue') +
      _statCard('📅', matches.length, 'Partite', '--green') +
      _statCard('🖼️', albums.length, 'Album galleria', '--yellow') +
      _statCard('⚽', future.length, 'Prossime partite', '--red');

    var artHtml = articles.slice(0, 5).map(function (a) {
      return '<div class="dash-item"><span class="dash-item-title">' + esc(a.title) + '</span>' +
        '<span class="dash-item-meta">' + VV.formatDateShort(a.date) + '</span></div>';
    }).join('') || '<div class="dash-item"><span class="dash-item-meta">Nessun articolo</span></div>';

    var matchHtml = future.slice(0, 5).map(function (m) {
      return '<div class="dash-item"><span class="dash-item-title">' + esc(m.homeTeam) + ' vs ' + esc(m.awayTeam) + '</span>' +
        '<span class="dash-item-meta">' + VV.formatDateShort(m.date) + '</span></div>';
    }).join('') || '<div class="dash-item"><span class="dash-item-meta">Nessuna partita</span></div>';

    document.getElementById('dashArticles').innerHTML = artHtml;
    document.getElementById('dashMatches').innerHTML = matchHtml;
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
    } else {
      document.getElementById('artTitle').value      = '';
      catSel.value                                    = VV.CATEGORIES[0];
      document.getElementById('artDate').value        = new Date().toISOString().slice(0, 10);
      document.getElementById('artImage').value       = '';
      document.getElementById('artExcerpt').value     = '';
      document.getElementById('artContent').value     = '';
      document.getElementById('artPublished').checked = true;
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
     CALENDARIO
  ================================================ */
  var _matchEditing = null;

  function renderCalendario() {
    showSubview('calendario', 'list');
    setTopbarBtn('Aggiungi partita', function () { openMatchForm(null); });
    refreshMatchTable();
  }

  function refreshMatchTable() {
    var rows = VV.getMatches().map(function (m) {
      return '<tr>' +
        '<td>' + VV.formatDateShort(m.date) + '</td>' +
        '<td>' + (m.time || '—') + '</td>' +
        '<td><span class="chip chip--blue">' + esc(m.category) + '</span></td>' +
        '<td>' +
          (m.homeLogo ? '<img src="' + esc(m.homeLogo) + '" style="height:20px;display:inline;vertical-align:middle;margin-right:4px">' : '') +
          '<strong>' + esc(m.homeTeam) + '</strong> vs ' +
          (m.awayLogo ? '<img src="' + esc(m.awayLogo) + '" style="height:20px;display:inline;vertical-align:middle;margin-right:4px">' : '') +
          esc(m.awayTeam) +
          ' <span class="chip ' + (m.isHome ? 'chip--green' : 'chip--gray') + '" style="margin-left:4px">' + (m.isHome ? 'Casa' : 'Trasferta') + '</span>' +
        '</td>' +
        '<td style="font-size:12px;color:var(--a-muted)">' + esc(m.venue || '—') + '</td>' +
        '<td>' + (m.result ? '<strong>' + esc(m.result) + '</strong>' : '<span style="color:var(--a-muted)">—</span>') + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.editMatch(' + m.id + ')" title="Modifica"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteMatch(' + m.id + ')" title="Elimina"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    document.getElementById('calendarioBody').innerHTML = rows ||
      '<tr><td colspan="7"><div class="empty-state"><p>Nessuna partita. Aggiungine una!</p></div></td></tr>';
  }

  function openMatchForm(match) {
    _initLogoInputs();
    _matchEditing = match;
    showSubview('calendario', 'form');
    document.getElementById('topbarActions').innerHTML = '';

    var catSel = document.getElementById('matchCategory');
    catSel.innerHTML = VV.CATEGORIES.filter(function(c){ return c !== 'Società'; }).map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    if (match) {
      document.getElementById('matchDate').value     = match.date || '';
      document.getElementById('matchTime').value     = match.time || '18:30';
      catSel.value                                   = match.category || 'Prima Divisione';
      document.getElementById('matchIsHome').checked = !!match.isHome;
      document.getElementById('matchHomeTeam').value = match.homeTeam || 'Victor Volley';
      document.getElementById('matchHomeLogo').value = match.homeLogo || '';
      document.getElementById('matchAwayTeam').value = match.awayTeam || '';
      document.getElementById('matchAwayLogo').value = match.awayLogo || '';
      _syncLogoPreview('matchHomeLogo', 'homeLogoPreview');
      _syncLogoPreview('matchAwayLogo', 'awayLogoPreview');
      document.getElementById('matchVenue').value    = match.venue || '';
      document.getElementById('matchResult').value   = match.result || '';
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
      document.getElementById('matchVenue').value    = 'Palazzetto ARKÉ — Melissano';
      document.getElementById('matchResult').value   = '';
    }
  }

  document.getElementById('matchSave').addEventListener('click', function () {
    var date = document.getElementById('matchDate').value;
    if (!date) { alert('La data è obbligatoria.'); return; }
    var awayTeam = document.getElementById('matchAwayTeam').value.trim();
    if (!awayTeam) { alert('La squadra avversaria è obbligatoria.'); return; }

    var match = Object.assign({}, _matchEditing || {}, {
      date:      date,
      time:      document.getElementById('matchTime').value,
      category:  document.getElementById('matchCategory').value,
      isHome:    document.getElementById('matchIsHome').checked,
      homeTeam:  document.getElementById('matchHomeTeam').value.trim(),
      homeLogo:  document.getElementById('matchHomeLogo').value.trim(),
      awayTeam:  awayTeam,
      awayLogo:  document.getElementById('matchAwayLogo').value.trim(),
      venue:     document.getElementById('matchVenue').value.trim(),
      result:    document.getElementById('matchResult').value.trim()
    });
    DB.saveMatch(match, renderCalendario);
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
     LOGO UPLOAD INTEGRATO NEL FORM PARTITA
  ================================================ */

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

        var ratio = h / w;
        var outW  = size;
        var outH  = Math.round(size * ratio);

        var canvas = document.createElement('canvas');
        canvas.width  = outW;
        canvas.height = outH;
        canvas.getContext('2d').drawImage(img, 0, 0, outW, outH);
        cb(canvas.toDataURL('image/png'));
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
  var _catEditing    = null;
  var _playerEditing = null;
  var _staffEditing  = null;
  var _currentCatId  = null;

  var _SQUAD_PANELS = ['squadreList', 'squadreCatForm', 'squadrePlayerForm', 'squadreStaffForm'];

  function _showSquadrePanel(id) {
    _SQUAD_PANELS.forEach(function (p) {
      document.getElementById(p).classList.toggle('is-hidden', p !== id);
    });
  }

  function renderSquadre() {
    _showSquadrePanel('squadreList');
    setTopbarBtn('Nuova categoria', function () { openCategoryForm(null); });
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

    accordion.innerHTML = categories.map(function (cat) {
      var players = VV.getPlayers(cat.id).sort(function (a, b) { return (a.number || 99) - (b.number || 99); });
      var staff   = VV.getStaff(cat.id);

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
        return '<div class="roster-person">' +
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
          '<div>' + staffRows + '</div>' +
        '</div>' +
        '<div class="squad-subsection">' +
          '<div class="squad-subsection-hd"><span>Roster</span><button class="btn-sm" onclick="AdminActions.addPlayer(' + cat.id + ')">+ Aggiungi</button></div>' +
          '<div>' + playerRows + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
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
    document.getElementById('playerRole').value    = player ? (player.role   || 'Schiacciatore') : 'Schiacciatore';
    document.getElementById('playerYear').value    = player ? (player.year   || '') : '';
    document.getElementById('playerPhoto').value   = player ? (player.photo  || '') : '';
    _syncPersonPreview('playerPhoto', 'playerPhotoPreview');
  }

  document.getElementById('playerSave').addEventListener('click', function () {
    var name = document.getElementById('playerName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var numVal  = document.getElementById('playerNumber').value;
    var yearVal = document.getElementById('playerYear').value;
    var player = Object.assign({}, _playerEditing || {}, {
      categoryId: _currentCatId,
      name:       name,
      number:     numVal  ? +numVal  : null,
      role:       document.getElementById('playerRole').value,
      year:       yearVal ? +yearVal : null,
      photo:      document.getElementById('playerPhoto').value.trim()
    });
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
    _syncPersonPreview('staffPhoto', 'staffPhotoPreview');
  }

  document.getElementById('staffSave').addEventListener('click', function () {
    var name = document.getElementById('staffName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var person = Object.assign({}, _staffEditing || {}, {
      categoryId: _currentCatId,
      name:       name,
      role:       document.getElementById('staffRole').value,
      photo:      document.getElementById('staffPhoto').value.trim()
    });
    DB.saveStaffMember(person, renderSquadre);
  });

  document.getElementById('staffCancel').addEventListener('click', renderSquadre);

  /* ---- Person photo upload (shared) ---- */
  function _syncPersonPreview(inputId, previewId) {
    var val  = document.getElementById(inputId).value;
    var prev = document.getElementById(previewId);
    if (val) { prev.src = val; prev.style.display = ''; }
    else       prev.style.display = 'none';
  }

  var _personPhotoInputsReady = false;
  function _initPersonPhotoInputs() {
    if (_personPhotoInputsReady) return;
    _personPhotoInputsReady = true;
    [
      { file: 'playerPhotoFile', url: 'playerPhoto', preview: 'playerPhotoPreview' },
      { file: 'staffPhotoFile',  url: 'staffPhoto',  preview: 'staffPhotoPreview'  }
    ].forEach(function (cfg) {
      document.getElementById(cfg.file).addEventListener('change', function () {
        if (!this.files.length) return;
        var fileEl = this;
        convertLogoToPng(this.files[0], 200, function (dataUrl) {
          document.getElementById(cfg.url).value = dataUrl;
          _syncPersonPreview(cfg.url, cfg.preview);
          fileEl.value = '';
        });
      });
      document.getElementById(cfg.url).addEventListener('input', function () {
        _syncPersonPreview(cfg.url, cfg.preview);
      });
    });
  }

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
     NUMERI HOMEPAGE
  ================================================ */
  var NUMERI_ICONS = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polygon points="12,2 22,8.5 12,15 2,8.5"/><polyline points="2,15 12,21.5 22,15"/><polyline points="2,11.5 12,18 22,11.5"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>'
  ];

  function renderNumeri() {
    var stats = VV.getStats();
    var grid  = document.getElementById('numeriGrid');

    grid.innerHTML = stats.map(function (stat, idx) {
      return '<div class="numeri-card">' +
        '<div class="numeri-card-header">' +
          '<div class="numeri-card-icon">' + (NUMERI_ICONS[idx] || NUMERI_ICONS[0]) + '</div>' +
          '<span>Statistica ' + (idx + 1) + '</span>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Valore *</label>' +
          '<input type="text" id="stat' + idx + 'Value" class="form-input" value="' + esc(stat.value) + '" placeholder="es. 150">' +
        '</div>' +
        '<div class="numeri-row">' +
          '<div class="form-group">' +
            '<label class="form-label">Prefisso</label>' +
            '<input type="text" id="stat' + idx + 'Prefix" class="form-input" value="' + esc(stat.prefix || '') + '" placeholder="es. Dal ">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Suffisso</label>' +
            '<input type="text" id="stat' + idx + 'Suffix" class="form-input" value="' + esc(stat.suffix || '') + '" placeholder="es. +">' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Etichetta</label>' +
          '<input type="text" id="stat' + idx + 'Label" class="form-input" value="' + esc(stat.label) + '" placeholder="es. Atleti in rosa">' +
        '</div>' +
      '</div>';
    }).join('');

    document.getElementById('numeriSave').onclick = function () {
      var updated = stats.map(function (stat, idx) {
        return {
          id:     stat.id,
          value:  document.getElementById('stat' + idx + 'Value').value.trim(),
          prefix: document.getElementById('stat' + idx + 'Prefix').value,
          suffix: document.getElementById('stat' + idx + 'Suffix').value,
          label:  document.getElementById('stat' + idx + 'Label').value.trim()
        };
      });
      DB.saveStats(updated, function () {
        var btn = document.getElementById('numeriSave');
        var orig = btn.textContent;
        btn.textContent = 'Salvato ✓';
        btn.disabled = true;
        setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 2000);
      });
    };
  }

  window.AdminActions = {
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
    editMatch: function (id) { openMatchForm(VV.getMatch(id)); },
    deleteMatch: function (id) {
      confirm('Eliminare questa partita?', function () {
        DB.deleteMatch(id, refreshMatchTable);
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

})();
