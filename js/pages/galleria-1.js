/* Victor Volley — script della pagina galleria.html (1), estratto dall'HTML per la Content-Security-Policy. */
/* /galleria            → elenco degli album (filtrabile per categoria)
   /galleria/<slug>     → foto di un album (vercel.json riscrive lo slug su questa stessa pagina) */
(function () {
  function catSlug(s) { return String(s || '').toLowerCase().replace(/\s+/g, '-').replace(/[àáâ]/g,'a').replace(/[èéê]/g,'e').replace(/[ìí]/g,'i').replace(/[òó]/g,'o').replace(/[ùú]/g,'u'); }
  function byId(id) { return document.getElementById(id); }
  var SITE = 'https://www.victorvolley.it';
  /* Canonical e anteprima si aggiornano da JS perché questa pagina serve più indirizzi (Google esegue il JS). */
  function setLink(rel, href) {
    var l = document.querySelector('link[rel="' + rel + '"]');
    if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); }
    l.href = href;
  }
  function setMeta(attr, key, content) {
    var m = document.querySelector('meta[' + attr + '="' + key + '"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute(attr, key); document.head.appendChild(m); }
    m.setAttribute('content', content);
  }
  function setPageMeta(path, title, desc) {
    setLink('canonical', SITE + path);
    setMeta('property', 'og:url', SITE + path);
    if (title) setMeta('property', 'og:title', title);
    if (desc)  setMeta('property', 'og:description', desc);
  }

  var container   = byId('galleriaContainer');
  var albumNav    = byId('galAlbumNav');
  var others      = byId('galOthers');
  var lightboxEl  = byId('lightbox');
  var lightboxImg = byId('lightboxImg');
  var lightboxCap = byId('lightboxCaption');
  var prevBtn     = byId('lightboxPrev');
  var nextBtn     = byId('lightboxNext');

  /* ---- Lightbox ---- */
  var lbPhotos = [], lbIdx = 0, lbTitle = '', lbTrigger = null;

  function showPhoto(idx) {
    lbIdx = idx;
    var p = lbPhotos[idx];
    lightboxImg.src = p.url;
    lightboxImg.alt = lbTitle;
    lightboxCap.textContent = (lbTitle ? lbTitle + ' — ' : '') + (idx + 1) + ' / ' + lbPhotos.length;
    prevBtn.style.display = lbPhotos.length > 1 ? '' : 'none';
    nextBtn.style.display = lbPhotos.length > 1 ? '' : 'none';
    /* Precarica le vicine, così scorrere con le frecce è immediato */
    [1, -1].forEach(function (d) {
      var n = lbPhotos[(idx + d + lbPhotos.length) % lbPhotos.length];
      if (n && n !== p) { var pre = new Image(); pre.src = n.url; }
    });
  }
  /* Focus da tastiera: all'apertura si sposta sul pulsante Chiudi (il modo più rapido per
     uscire), alla chiusura torna sulla foto/elemento che l'ha aperta invece di perdersi
     in cima alla pagina. Tab resta intrappolato tra i pulsanti del visualizzatore. */
  function lbFocusables() {
    return [prevBtn, nextBtn, byId('lightboxClose')].filter(function (el) { return el.offsetParent !== null; });
  }
  function openLightbox(photos, startIdx, title, trigger) {
    lbPhotos = photos; lbTitle = title || '';
    lbTrigger = trigger || document.activeElement;
    showPhoto(startIdx);
    lightboxEl.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    byId('lightboxClose').focus();
  }
  function closeLightbox() {
    lightboxEl.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lbTrigger && document.contains(lbTrigger)) lbTrigger.focus();
    lbTrigger = null;
  }
  byId('lightboxClose').addEventListener('click', closeLightbox);
  lightboxEl.addEventListener('click', function (e) {
    if (e.target === lightboxEl || e.target.classList.contains('lightbox-body')) closeLightbox();
  });
  /* Swipe orizzontale su telefono: foto precedente / successiva */
  var touchX = null;
  lightboxEl.addEventListener('touchstart', function (e) { touchX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  lightboxEl.addEventListener('touchend', function (e) {
    if (touchX === null || lbPhotos.length < 2) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 50) return;
    showPhoto((lbIdx + (dx < 0 ? 1 : -1) + lbPhotos.length) % lbPhotos.length);
  }, { passive: true });
  prevBtn.addEventListener('click', function () { showPhoto((lbIdx - 1 + lbPhotos.length) % lbPhotos.length); });
  nextBtn.addEventListener('click', function () { showPhoto((lbIdx + 1) % lbPhotos.length); });
  document.addEventListener('keydown', function (e) {
    if (!lightboxEl.classList.contains('is-open')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   showPhoto((lbIdx - 1 + lbPhotos.length) % lbPhotos.length);
    if (e.key === 'ArrowRight')  showPhoto((lbIdx + 1) % lbPhotos.length);
    if (e.key === 'Tab') {
      var f = lbFocusables();
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      var next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
      e.preventDefault();
      f[next < 0 ? 0 : next].focus();
    }
  });

  /* ---- Helpers ---- */
  function hasPhotos(a) { return a.photos && a.photos.length; }
  function sortAlbums(list) {
    return list.slice().sort(function (a, b) {
      var da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? 1 : -1;
      return b.id - a.id;
    });
  }
  function albumHref(a) { return '/galleria/' + encodeURIComponent(VV.getAlbumSlug(a)); }
  function albumMeta(a) {
    return [a.date ? VV.formatDateShort(a.date) : '', (a.photos || []).length + ' foto'].filter(Boolean).join(' · ');
  }
  function cardsHtml(albums) {
    var covers = {};
    PhotoDB.getCovers(albums.map(function (a) { return a.id; }), function (c) { covers = c; });
    return albums.map(function (a) {
      return '<a class="album-card-pub" href="' + albumHref(a) + '" data-cat="' + catSlug(a.category) + '" aria-label="' + esc('Apri album: ' + a.title) + '">' +
        (covers[a.id] ? '<img src="' + covers[a.id] + '" alt="" loading="lazy" decoding="async">' : '') +
        '<span class="album-card-body">' +
          '<span class="album-card-title">' + esc(a.title) + '</span>' +
          '<span class="album-card-meta">' + esc(albumMeta(a)) + '</span>' +
        '</span></a>';
    }).join('');
  }
  function emptyHtml(msg) {
    return '<div class="gallery-empty"><p>' + msg + '<br><span class="gallery-empty-note">Le foto verranno caricate dalla societ&agrave;.</span></p></div>';
  }

  /* ---- Vista: elenco album ---- */
  function renderIndex(albums) {
    setPageMeta('/galleria');
    if (!albums.length) {
      container.innerHTML = emptyHtml('Nessun album ancora.');
      return;
    }
    container.innerHTML = '<div class="album-grid">' + cardsHtml(albums) + '</div>';

  }

  /* ---- Vista: un album ---- */
  function renderAlbum(album, albums) {
    var photos = [];
    PhotoDB.getPhotos(album.id, function (r) { photos = r; });

    document.title = album.title + ' — Galleria — Victor Volley';
    setPageMeta('/galleria/' + encodeURIComponent(VV.getAlbumSlug(album)), document.title, 'Foto dell\'album "' + album.title + '" — Victor Volley.');
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', 'Foto dell\'album "' + album.title + '" — Victor Volley.');
    byId('galBreadcrumb').innerHTML = '<a href="/">Home</a> / <a href="/galleria">Galleria</a> / ' + esc(album.title);
    byId('galTitle').textContent = album.title;
    byId('galSubtitle').textContent = [album.date ? VV.formatDateShort(album.date) : '', photos.length + ' foto'].filter(Boolean).join(' · ');

    /* Barra di navigazione: torna all'elenco + salto rapido a un altro album */
    var nav = '<a class="gal-back" href="/galleria">&larr; Tutti gli album</a>';
    var elsewhere = albums.filter(function (a) { return a.id !== album.id; });
    if (elsewhere.length) {
      nav += '<label class="gal-switch">Vai a un altro album ' +
        '<select id="galSwitch"><option value="">Scegli…</option>' +
        elsewhere.map(function (a) { return '<option value="' + albumHref(a) + '">' + esc(a.title) + '</option>'; }).join('') +
        '</select></label>';
    }
    albumNav.innerHTML = nav;
    albumNav.style.display = '';
    var sel = byId('galSwitch');
    if (sel) sel.addEventListener('change', function () { if (sel.value) window.location.href = sel.value; });

    if (!photos.length) {
      container.innerHTML = emptyHtml('Nessuna foto in questo album.');
    } else {
      container.innerHTML = '<div class="gallery-grid">' + photos.map(function (p, i) {
        return '<div class="gallery-item" data-photo-idx="' + i + '" tabindex="0" role="button" aria-label="' + esc(album.title + ' — foto ' + (i + 1)) + '">' +
          '<img src="' + p.thumb + '" alt="' + esc(album.title) + '" loading="lazy" decoding="async">' +
        '</div>';
      }).join('') + '</div>';
      container.querySelectorAll('.gallery-item').forEach(function (item) {
        function open() { openLightbox(photos, parseInt(item.getAttribute('data-photo-idx'), 10), album.title, item); }
        item.addEventListener('click', open);
        item.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    }

    /* Altri album in fondo, così si continua a sfogliare senza tornare indietro */
    if (elsewhere.length) {
      others.innerHTML =
        '<div class="gal-others-hd"><h2>Altri album</h2><a href="/galleria">Vedi tutti &rarr;</a></div>' +
        '<div class="album-grid">' + cardsHtml(elsewhere.slice(0, 6)) + '</div>';
      others.style.display = '';
    }
  }

  function renderNotFound() {
    document.title = 'Album non trovato — Victor Volley';
    setMeta('name', 'robots', 'noindex');
    byId('galBreadcrumb').innerHTML = '<a href="/">Home</a> / <a href="/galleria">Galleria</a>';
    byId('galTitle').textContent = 'Album non trovato';
    byId('galSubtitle').textContent = '';
    container.innerHTML = '<div class="gallery-empty"><p>Questo album non esiste, o non &egrave; pi&ugrave; disponibile.<br>' +
      '<a href="/galleria">&larr; Torna a tutti gli album</a></p></div>';
  }

  /* ---- Avvio ---- */
  DB.loadOrError(['albums'], 'galleriaContainer', function () {
    var m = window.location.pathname.match(/^\/galleria\/([^\/]+)\/?$/);
    var albums = sortAlbums(VV.getAlbums().filter(hasPhotos));
    if (!m) { renderIndex(albums); return; }
    var album = VV.getAlbumBySlug(decodeURIComponent(m[1]));
    if (!album) renderNotFound(); else renderAlbum(album, albums);
  });
})();
