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
  var SECTIONS = { dashboard: 'Dashboard', articoli: 'Articoli', calendario: 'Calendario', galleria: 'Galleria', squadre: 'Squadre', numeri: 'Numeri homepage', atleti: 'Atleti', girone: 'Girone Prima Divisione', datiJson: 'File JSON' };

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
    if (section === 'atleti')     renderAtleti();
    if (section === 'datiJson')   renderDatiJson();
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
    var THR     = 240;

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
      var isWhitish = px[pi] >= THR && px[pi + 1] >= THR && px[pi + 2] >= THR;
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
          return db.collection('atleti').doc(uid).set({
            uid: uid, nome: nome, cognome: cognome, email: email,
            categoria: categ, certMedicoScadenza: certSc,
            certMedicoUrl: '', moduloIscrizioneUrl: '',
            rate: [], note: '', createdAt: new Date().toISOString()
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
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

  /* ---- Salva cert. medico ---- */
  document.getElementById('detCertSave').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var scadenza = document.getElementById('detCertScadenza').value;
    var url      = document.getElementById('certPdfUrl').value.trim();
    _editingAtleta.certMedicoScadenza = scadenza;
    _editingAtleta.certMedicoUrl      = url;
    document.getElementById('certPdfLinkWrap').classList.toggle('is-hidden', !url);
    if (url) document.getElementById('certPdfLink').href = _driveViewUrl(url);
    db.collection('atleti').doc(_editingAtleta.uid)
      .update({ certMedicoScadenza: scadenza, certMedicoUrl: url })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

  /* ---- Salva modulo iscrizione ---- */
  document.getElementById('detModuloSave').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var url = document.getElementById('moduloPdfUrl').value.trim();
    _editingAtleta.moduloIscrizioneUrl = url;
    document.getElementById('moduloPdfLinkWrap').classList.toggle('is-hidden', !url);
    if (url) document.getElementById('moduloPdfLink').href = _driveViewUrl(url);
    db.collection('atleti').doc(_editingAtleta.uid)
      .update({ moduloIscrizioneUrl: url })
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
    _editingAtleta.rate.push({
      id: Date.now().toString(), descrizione: desc,
      importo: importo, scadenza: scad, pagata: false, dataPagamento: null
    });

    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
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
    confirm(
      'Eliminare l\'atleta dal gestionale? Le credenziali Firebase resteranno attive.',
      function () {
        db.collection('atleti').doc(uid).delete()
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
    var r = _editingAtleta.rate[idx];
    r.pagata = !r.pagata;
    r.dataPagamento = r.pagata ? new Date().toISOString().slice(0, 10) : null;
    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
      .then(_renderRateAdmin)
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  window.AdminActions.deleteRata = function (idx) {
    if (!_editingAtleta || !_editingAtleta.rate) return;
    _editingAtleta.rate.splice(idx, 1);
    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
      .then(_renderRateAdmin)
      .catch(function (e) { alert('Errore: ' + e.message); });
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

})();
