/* Victor Volley — Firestore sync layer
   Esposto come window.DB
   Dipende da: firebase-config.js (window.db, window.auth) + data.js (window.VV)

   Pattern: scrittura ottimistica.
   - VV.* aggiorna la cache in-memory subito (sincrono)
   - _upsert / _remove scrivono su Firestore in background (asincrono)
   - Il callback UI viene chiamato dopo l'aggiornamento in-memory, non dopo Firestore
   Questo rende l'interfaccia admin sempre reattiva.

   Migrazione da localStorage (da console, dopo il primo login):
     DB.migrateFromLocalStorage(function(){ location.reload(); });
*/
(function (global) {
  'use strict';

  /* ---- Mappa: colName → { numericId: firestoreDocId } ---- */
  var _ids = {
    articles:   {},
    matches:    {},
    albums:     {},
    categories: {},
    players:    {},
    staff:      {}
  };

  /* ---- Stato init ---- */
  var _initialized = false;
  var _loading     = false;
  var _pending     = [];

  /* ---- Helpers interni ---- */
  function _col(name) { return global.db.collection(name); }

  function _loadOne(name) {
    return _col(name).get().then(function (snap) {
      var items = [];
      snap.forEach(function (doc) {
        var data = doc.data();
        if (data.id) _ids[name][+data.id] = doc.id;
        items.push(data);
      });
      VV._load(name, items);
    });
  }

  function _fid(col, numId) {
    return _ids[col][+numId] || null;
  }

  function _upsert(col, item) {
    var numId = +item.id;
    var fid   = _fid(col, numId);
    if (fid) {
      return _col(col).doc(fid).set(item);
    }
    return _col(col).add(item).then(function (ref) {
      _ids[col][numId] = ref.id;
    });
  }

  function _remove(col, numId) {
    var fid = _fid(col, +numId);
    if (!fid) return Promise.resolve();
    return _col(col).doc(fid).delete().then(function () {
      delete _ids[col][+numId];
    });
  }

  /* ============================================================
     DB pubblico
  ============================================================ */
  var DB = {

    /* ---- INIT ------------------------------------------------ */
    init: function (cb) {
      if (_initialized) { if (cb) cb(); return; }
      _pending.push(cb);
      if (_loading) return;
      _loading = true;

      var loadStats = global.db.collection('settings').doc('stats').get()
        .then(function (doc) {
          if (doc.exists && Array.isArray(doc.data().items)) {
            VV.setStats(doc.data().items);
          }
        });

      var loadSponsors = global.db.collection('settings').doc('sponsor').get()
        .then(function (doc) {
          if (doc.exists && Array.isArray(doc.data().items)) {
            VV.setSponsors(doc.data().items);
          }
        });

      Promise.all([
        _loadOne('articles'),
        _loadOne('matches'),
        _loadOne('albums'),
        _loadOne('categories'),
        _loadOne('players'),
        _loadOne('staff'),
        loadSponsors,
        loadStats
      ]).then(function () {
        _initialized = true;
        _loading     = false;
        var cbs = _pending.slice(); _pending = [];
        cbs.forEach(function (fn) { if (fn) fn(); });
      }).catch(function (err) {
        console.error('[DB] init error:', err);
        _initialized = true;
        _loading     = false;
        var cbs = _pending.slice(); _pending = [];
        cbs.forEach(function (fn) { if (fn) fn(); });
      });
    },

    /* ---- ARTICLES -------------------------------------------- */
    saveArticle: function (article, cb) {
      var saved = VV.saveArticle(article);
      if (cb) cb();
      _upsert('articles', saved).catch(function (e) { console.error('[DB] saveArticle', e); });
      return saved;
    },
    deleteArticle: function (id, cb) {
      VV.deleteArticle(id);
      if (cb) cb();
      _remove('articles', id).catch(function (e) { console.error('[DB] deleteArticle', e); });
    },

    /* ---- MATCHES --------------------------------------------- */
    saveMatch: function (match, cb) {
      var saved = VV.saveMatch(match);
      if (cb) cb();
      _upsert('matches', saved).catch(function (e) { console.error('[DB] saveMatch', e); });
      return saved;
    },
    deleteMatch: function (id, cb) {
      VV.deleteMatch(id);
      if (cb) cb();
      _remove('matches', id).catch(function (e) { console.error('[DB] deleteMatch', e); });
    },

    /* ---- ALBUMS ---------------------------------------------- */
    saveAlbum: function (album, cb) {
      var saved = VV.saveAlbum(album);
      if (cb) cb(saved);
      _upsert('albums', saved).catch(function (e) { console.error('[DB] saveAlbum', e); });
      return saved;
    },
    deleteAlbum: function (id, cb) {
      VV.deleteAlbum(id);
      if (cb) cb();
      _remove('albums', id).catch(function (e) { console.error('[DB] deleteAlbum', e); });
    },

    /* ---- CATEGORIES ------------------------------------------ */
    saveCategory: function (cat, cb) {
      var saved = VV.saveCategory(cat);
      if (cb) cb(saved);
      _upsert('categories', saved).catch(function (e) { console.error('[DB] saveCategory', e); });
      return saved;
    },
    deleteCategory: function (id, cb) {
      var players = VV.getPlayers(id);
      var staff   = VV.getStaff(id);
      VV.deleteCategory(id);          /* aggiorna cache in-memory (cascade) */
      if (cb) cb();
      /* cascade Firestore in background */
      var ops = [_remove('categories', id)];
      players.forEach(function (p) { ops.push(_remove('players', p.id)); });
      staff.forEach(function (s)   { ops.push(_remove('staff',   s.id)); });
      Promise.all(ops).catch(function (e) { console.error('[DB] deleteCategory cascade', e); });
    },

    /* ---- PLAYERS --------------------------------------------- */
    savePlayer: function (player, cb) {
      var saved = VV.savePlayer(player);
      if (cb) cb(saved);
      _upsert('players', saved).catch(function (e) { console.error('[DB] savePlayer', e); });
      return saved;
    },
    deletePlayer: function (id, cb) {
      VV.deletePlayer(id);
      if (cb) cb();
      _remove('players', id).catch(function (e) { console.error('[DB] deletePlayer', e); });
    },

    /* ---- STAFF ----------------------------------------------- */
    saveStaffMember: function (person, cb) {
      var saved = VV.saveStaffMember(person);
      if (cb) cb(saved);
      _upsert('staff', saved).catch(function (e) { console.error('[DB] saveStaff', e); });
      return saved;
    },
    deleteStaffMember: function (id, cb) {
      VV.deleteStaffMember(id);
      if (cb) cb();
      _remove('staff', id).catch(function (e) { console.error('[DB] deleteStaff', e); });
    },

    /* ---- STATS ---------------------------------------------- */
    saveStats: function (items, cb) {
      VV.setStats(items);
      if (cb) cb();
      global.db.collection('settings').doc('stats').set({ items: items })
        .catch(function (e) { console.error('[DB] saveStats', e); });
    },

    /* ---- SPONSORS ------------------------------------------- */
    saveSponsors: function (items, cb) {
      VV.setSponsors(items);
      if (cb) cb();
      global.db.collection('settings').doc('sponsor').set({ items: items })
        .catch(function (e) { console.error('[DB] saveSponsors', e); });
    },

    /* ---- MIGRATION HELPER ------------------------------------ */
    /*
      Da usare UNA VOLTA dalla console del browser dopo il primo login,
      per importare i dati esistenti da localStorage in Firestore:

        DB.migrateFromLocalStorage(function(){ location.reload(); });
    */
    migrateFromLocalStorage: function (done) {
      var LS_KEYS = {
        articles:   'vv_articles',
        matches:    'vv_matches',
        albums:     'vv_albums',
        categories: 'vv_categories',
        players:    'vv_players',
        staff:      'vv_staff'
      };
      var ops = [];
      Object.keys(LS_KEYS).forEach(function (col) {
        try {
          var raw = localStorage.getItem(LS_KEYS[col]);
          if (!raw) return;
          var items = JSON.parse(raw);
          if (!Array.isArray(items) || !items.length) return;
          items.forEach(function (item) {
            if (!item || !item.id) return;
            ops.push(
              _col(col).add(item).then(function (ref) {
                _ids[col][+item.id] = ref.id;
              })
            );
          });
        } catch (e) { console.error('[DB] migrate ' + col, e); }
      });
      Promise.all(ops)
        .then(function () {
          console.log('[DB] Migrazione completata: ' + ops.length + ' documenti importati.');
          if (done) done();
        })
        .catch(function (e) {
          console.error('[DB] Migrazione fallita:', e);
          if (done) done();
        });
    }

  };

  global.DB = DB;
})(window);
