/**
 * Victor Volley — Photo Storage (IndexedDB)
 * Comprime le immagini prima di salvarle (max 1200px, qualità 0.75).
 * Esposto come window.PhotoDB
 */
(function (global) {
  'use strict';

  var DB_NAME    = 'vv_gallery';
  var DB_VERSION = 1;
  var STORE      = 'photos';
  var MAX_PX     = 1200;
  var QUALITY    = 0.75;

  var PhotoDB = {
    _db: null,

    init: function (cb) {
      if (this._db) { cb && cb(); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('albumId', 'albumId', { unique: false });
        }
      };
      req.onsuccess = function (e) {
        PhotoDB._db = e.target.result;
        cb && cb();
      };
      req.onerror = function () { console.error('PhotoDB: impossibile aprire IndexedDB'); };
    },

    /* Aggiunge un array di File, comprimendoli. cb(addedCount) */
    addPhotos: function (albumId, files, onProgress, onDone) {
      var total = files.length, done = 0;
      if (!total) { onDone && onDone(0); return; }
      Array.prototype.forEach.call(files, function (file) {
        PhotoDB._compress(file, function (dataUrl) {
          var tx = PhotoDB._db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).add({
            albumId:   albumId,
            dataUrl:   dataUrl,
            name:      file.name,
            timestamp: Date.now()
          });
          tx.oncomplete = function () {
            done++;
            onProgress && onProgress(done, total);
            if (done === total) onDone && onDone(done);
          };
        });
      });
    },

    /* Restituisce tutte le foto di un album. cb(array) */
    getPhotos: function (albumId, cb) {
      var tx      = this._db.transaction(STORE, 'readonly');
      var idx     = tx.objectStore(STORE).index('albumId');
      var results = [];
      idx.openCursor(IDBKeyRange.only(albumId)).onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) { results.push(cursor.value); cursor.continue(); }
        else cb(results);
      };
    },

    /* Restituisce la prima foto di ogni album (per le anteprime). cb({albumId: dataUrl}) */
    getCovers: function (albumIds, cb) {
      var covers  = {};
      var pending = albumIds.length;
      if (!pending) { cb({}); return; }
      albumIds.forEach(function (aid) {
        var tx  = PhotoDB._db.transaction(STORE, 'readonly');
        var idx = tx.objectStore(STORE).index('albumId');
        idx.openCursor(IDBKeyRange.only(aid)).onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) covers[aid] = cursor.value.dataUrl;
          pending--;
          if (pending === 0) cb(covers);
        };
      });
    },

    /* Elimina una singola foto per id */
    deletePhoto: function (id, cb) {
      var tx = this._db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id).onsuccess = function () { cb && cb(); };
    },

    /* Elimina tutte le foto di un album */
    deleteAlbumPhotos: function (albumId, cb) {
      PhotoDB.getPhotos(albumId, function (photos) {
        if (!photos.length) { cb && cb(); return; }
        var remaining = photos.length;
        photos.forEach(function (p) {
          PhotoDB.deletePhoto(p.id, function () {
            remaining--;
            if (remaining === 0) cb && cb();
          });
        });
      });
    },

    /* Comprime un File a max MAX_PX px e QUALITY jpeg. cb(dataUrl) */
    _compress: function (file, cb) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > MAX_PX || h > MAX_PX) {
            if (w >= h) { h = Math.round(h * MAX_PX / w); w = MAX_PX; }
            else        { w = Math.round(w * MAX_PX / h); h = MAX_PX; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          cb(canvas.toDataURL('image/jpeg', QUALITY));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  global.PhotoDB = PhotoDB;
})(window);
