/**
 * Victor Volley — Foto della galleria (Cloudinary)
 *
 * I file stanno su Cloudinary (CDN + ridimensionamento al volo dall'URL);
 * l'elenco delle foto di ogni album sta nel documento dell'album su Firestore
 * (album.photos = [{ id: publicId, name, w, h }]), quindi la galleria pubblica
 * non fa letture aggiuntive: le foto arrivano insieme agli album.
 *
 * Configurazione in js/config.js: CLOUDINARY_CLOUD e CLOUDINARY_PRESET
 * (preset "unsigned" con cartella e formati limitati).
 * Esposto come window.PhotoDB
 */
(function (global) {
  'use strict';

  var UPLOAD_MAX_PX  = 2000;   /* lato lungo massimo prima dell'upload */
  var UPLOAD_QUALITY = 0.85;
  var CONCURRENCY    = 3;      /* upload in parallelo */
  var RETRIES        = 2;
  var FLUSH_EVERY    = 10;     /* salva l'elenco sull'album ogni N foto caricate */

  var THUMB_TRANSFORM = 'c_fill,g_auto,w_600,h_450,f_auto,q_auto';
  var COVER_TRANSFORM = 'c_fill,g_auto,w_500,h_375,f_auto,q_auto';
  var FULL_TRANSFORM  = 'c_limit,w_1800,f_auto,q_auto';

  function _cloud()  { return global.CLOUDINARY_CLOUD; }
  function _preset() { return global.CLOUDINARY_PRESET; }
  function _configured() {
    var c = _cloud();
    return !!(c && c.indexOf('INSERISCI') !== 0 && _preset());
  }
  function _url(transform, publicId) {
    return 'https://res.cloudinary.com/' + _cloud() + '/image/upload/' + transform + '/' + encodeURI(publicId);
  }

  /* Aggiunge gli URL pronti all'uso a una foto salvata. */
  function _decorate(p) {
    return {
      id:    p.id,
      name:  p.name || '',
      w:     p.w || 0,
      h:     p.h || 0,
      thumb: _url(THUMB_TRANSFORM, p.id),
      url:   _url(FULL_TRANSFORM, p.id)
    };
  }

  /* Ridimensiona (lato lungo max UPLOAD_MAX_PX) e ricomprime in JPEG: 200 scatti da
     telefono da 4-5 MB diventano ~500 KB l'uno, l'upload è molto più rapido.
     Se il browser non sa decodificare il file (es. HEIC) si carica l'originale. */
  function _prepare(file) {
    return new Promise(function (resolve) {
      function fromBitmap(src, w, h) {
        var scale = Math.min(1, UPLOAD_MAX_PX / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(src, 0, 0, cw, ch);
        canvas.toBlob(function (blob) { resolve(blob || file); }, 'image/jpeg', UPLOAD_QUALITY);
      }
      if (global.createImageBitmap) {
        global.createImageBitmap(file, { imageOrientation: 'from-image' })
          .then(function (bmp) { fromBitmap(bmp, bmp.width, bmp.height); })
          .catch(function () { resolve(file); });
        return;
      }
      var img = new Image(), objUrl = URL.createObjectURL(file);
      img.onload  = function () { URL.revokeObjectURL(objUrl); fromBitmap(img, img.naturalWidth, img.naturalHeight); };
      img.onerror = function () { URL.revokeObjectURL(objUrl); resolve(file); };
      img.src = objUrl;
    });
  }

  function _upload(blob, fileName) {
    var fd = new FormData();
    fd.append('file', blob, fileName);
    fd.append('upload_preset', _preset());
    return fetch('https://api.cloudinary.com/v1_1/' + _cloud() + '/image/upload', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + res.status));
          return j;
        });
      });
  }

  function _uploadWithRetry(blob, fileName, attempt) {
    return _upload(blob, fileName).catch(function (err) {
      if ((attempt || 0) >= RETRIES) throw err;
      return new Promise(function (r) { setTimeout(r, 800 * ((attempt || 0) + 1)); })
        .then(function () { return _uploadWithRetry(blob, fileName, (attempt || 0) + 1); });
    });
  }

  var PhotoDB = {
    init: function (cb) { cb && cb(); },

    isConfigured: _configured,

    /* Carica i file su Cloudinary e li aggiunge all'album.
       onProgress(done, total) · onDone(addedCount, failedNames[]) */
    addPhotos: function (albumId, files, onProgress, onDone) {
      /* Ordine naturale per nome (IMG_2 prima di IMG_10): è l'ordine in cui le foto
         compariranno nell'album, indipendentemente da quale upload finisce prima. */
      var list = Array.prototype.slice.call(files).sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
      var total = list.length;
      if (!total) { onDone && onDone(0, []); return; }
      if (!_configured()) { onDone && onDone(0, list.map(function (f) { return f.name; })); return; }

      var next = 0, done = 0, added = 0, failed = [], sinceFlush = 0;
      var results = [];   /* results[i] = foto caricata dal file i (vuoto se fallita o ancora in corso) */
      var startAlbum = global.VV.getAlbum(albumId);
      var base = startAlbum && startAlbum.photos ? startAlbum.photos.slice() : [];

      /* Riscrive l'elenco dell'album = foto già presenti + nuove, nell'ordine dei file. */
      function flush() {
        if (!sinceFlush) return;
        var album = global.VV.getAlbum(albumId);
        sinceFlush = 0;
        if (!album) return;
        album.photos = base.concat(results.filter(Boolean));
        album.photoCount = album.photos.length;
        global.DB.saveAlbum(album);
      }

      function worker() {
        if (next >= list.length) return Promise.resolve();
        var index = next++, file = list[index];
        return _prepare(file)
          .then(function (blob) { return _uploadWithRetry(blob, file.name.replace(/\.[^.]+$/, '') + '.jpg', 0); })
          .then(function (r) {
            results[index] = { id: r.public_id, name: file.name.replace(/\.[^.]+$/, ''), w: r.width, h: r.height };
            added++;
            if (++sinceFlush >= FLUSH_EVERY) flush();
          })
          .catch(function (err) {
            console.error('[PhotoDB] upload fallito:', file.name, err);
            failed.push(file.name);
          })
          .then(function () {
            done++;
            onProgress && onProgress(done, total);
            return worker();
          });
      }

      var workers = [];
      for (var i = 0; i < Math.min(CONCURRENCY, total); i++) workers.push(worker());
      Promise.all(workers).then(function () {
        flush();
        onDone && onDone(added, failed);
      });
    },

    /* Foto di un album, con gli URL già pronti (thumb per la griglia, url per il lightbox). cb(array) */
    getPhotos: function (albumId, cb) {
      var album = global.VV.getAlbum(albumId);
      cb((album && album.photos ? album.photos : []).map(_decorate));
    },

    /* Anteprima di copertina di ogni album (la prima foto). cb({albumId: url}) */
    getCovers: function (albumIds, cb) {
      var covers = {};
      albumIds.forEach(function (aid) {
        var album = global.VV.getAlbum(aid);
        if (album && album.photos && album.photos.length) covers[aid] = _url(COVER_TRANSFORM, album.photos[0].id);
      });
      cb(covers);
    },

    /* Toglie una foto dall'album. Il file resta su Cloudinary (si elimina dalla console). */
    deletePhoto: function (albumId, photoId, cb) {
      var album = global.VV.getAlbum(albumId);
      if (album && album.photos) {
        album.photos = album.photos.filter(function (p) { return p.id !== photoId; });
        album.photoCount = album.photos.length;
        global.DB.saveAlbum(album);
      }
      cb && cb();
    },

    /* Le foto vivono nel documento dell'album: cancellando l'album spariscono con lui. */
    deleteAlbumPhotos: function (albumId, cb) { cb && cb(); }
  };

  global.PhotoDB = PhotoDB;
})(window);
