/* Victor Volley — script della pagina index.html (3), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  var MAX = 8;
  /* Indici ben distribuiti nell'album (primo, metà, terzi…), così non sono le prime foto in fila. */
  function spread(n, count) {
    var out = [], seen = {};
    for (var k = 1; out.length < count && k <= n; k++) {
      for (var i = 0; i < k && out.length < count; i++) {
        var idx = Math.floor(i * n / k);
        if (!seen[idx]) { seen[idx] = true; out.push(idx); }
      }
    }
    return out;
  }
  DB.loadOrError(['albums'], 'galleryPreviewGrid', function () {
    var albums = VV.getAlbums()
      .filter(function (a) { return a.photos && a.photos.length; })
      .sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : (b.date || '') > (a.date || '') ? 1 : 0; });
    if (!albums.length) { document.getElementById('galleryPreviewGrid').innerHTML = ''; return; }
    var album = albums[0];
    var photos = [];
    PhotoDB.getPhotos(album.id, function (r) { photos = r; });
    var picks = spread(photos.length, MAX).map(function (i) { return photos[i]; });
    var href = '/galleria/' + encodeURIComponent(VV.getAlbumSlug(album));

    document.getElementById('gallery-preview-title').textContent = album.title || 'Galleria foto';
    document.getElementById('galleryPreviewSubtitle').textContent =
      [album.date ? VV.formatDateShort(album.date) : '', photos.length + ' foto']
        .filter(Boolean).join(' · ');
    document.getElementById('galleryPreviewLink').href = href;
    document.getElementById('galleryPreviewGrid').innerHTML = picks.map(function (p) {
      return '<a class="gallery-preview-item" href="' + href + '" aria-label="' + esc('Apri album: ' + album.title) + '">' +
        '<img src="' + p.thumb + '" alt="' + esc(album.title) + '" loading="lazy" decoding="async">' +
      '</a>';
    }).join('');
    document.getElementById('galleryPreviewSection').style.display = '';
  });
})();
