/* Victor Volley — script della pagina index.html (3), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  var MAX = 7;
  /* Forma di ogni tessera del mosaico (colonne × righe) e ritaglio richiesto a Cloudinary: grande, alta, due quadrate, larga, due quadrate. */
  var FORME = [
    { cls: 'is-big',  w: 900, h: 900 },
    { cls: 'is-tall', w: 450, h: 900 },
    { cls: '',        w: 450, h: 450 },
    { cls: '',        w: 450, h: 450 },
    { cls: 'is-wide', w: 900, h: 450 },
    { cls: '',        w: 450, h: 450 },
    { cls: '',        w: 450, h: 450 }
  ];
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
    document.getElementById('galleryPreviewGrid').innerHTML = picks.map(function (p, i) {
      /* con meno di 7 foto il mosaico lascerebbe buchi: tessere tutte quadrate */
      var f = picks.length === MAX ? FORME[i] : { cls: '', w: 450, h: 450 };
      return '<a class="gallery-preview-item ' + f.cls + '" href="' + href + '" aria-label="' + esc('Apri album: ' + album.title) + '">' +
        '<img src="' + PhotoDB.sized(p.id, f.w, f.h) + '" alt="' + esc(album.title) + '" width="' + f.w + '" height="' + f.h + '" loading="lazy" decoding="async">' +
      '</a>';
    }).join('');
    document.getElementById('galleryPreviewSection').style.display = '';
  });
})();
