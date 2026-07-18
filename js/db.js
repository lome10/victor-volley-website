/* Victor Volley — Firestore sync layer
   Esposto come window.DB
   Dipende da: firebase-config.js (window.db, window.auth) + data.js (window.VV)

   Pattern: scrittura ottimistica.
   - VV.* aggiorna la cache in-memory subito (sincrono)
   - _upsert / _remove scrivono su Firestore in background (asincrono)
   - Il callback UI viene chiamato dopo l'aggiornamento in-memory, non dopo Firestore
   Questo rende l'interfaccia admin sempre reattiva.

   Audit log: ogni scrittura passa da _audit(), che inoltra a un hook impostato
   da chi ha fatto login (vedi DB.setAuditHook — usato da admin.js) invece di
   duplicare la logica di log in ogni singolo metodo.

   Migrazione da localStorage (da console, dopo il primo login):
     DB.migrateFromLocalStorage(function(){ location.reload(); });
*/
(function (global) {
  'use strict';

  /* ---- Mappa: colName → { numericId: firestoreDocId } ---- */
  var _ids = {
    articles:   {},
    albums:     {},
    categories: {},
    players:    {},
    staff:      {}
  };

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

  function _findById(arr, id) {
    return arr.find(function (x) { return x.id === +id; }) || null;
  }

  /* ---- AUDIT LOG — hook centralizzato ---- */
  var _auditHook = null;

  function _truncate(v) {
    return typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v;
  }

  function _diffRecord(oldObj, newObj, fields) {
    var out = [];
    (fields || Object.keys(newObj)).forEach(function (f) {
      var a = oldObj ? oldObj[f] : undefined;
      var b = newObj[f];
      var an = a === undefined ? null : a, bn = b === undefined ? null : b;
      if (JSON.stringify(an) !== JSON.stringify(bn)) out.push({ campo: f, prima: _truncate(an), dopo: _truncate(bn) });
    });
    return out;
  }

  function _audit(entita, entitaId, entitaLabel, azione, changes) {
    if (_auditHook && changes && changes.length) _auditHook(entita, entitaId, entitaLabel, azione, changes);
  }

  /* ============================================================
     Caricamento a parti: ogni "parte" ha il proprio stato di
     caricamento (loaded/loading/pending), così ogni pagina può
     chiedere con DB.load([...]) solo i dati che le servono invece
     di aspettare sempre tutte le collezioni/documenti del sito.
     DB.init() resta disponibile e carica semplicemente tutte le parti
     (usato dall'admin, che ha bisogno di tutto).

     Per aggiungere una parte nuova in futuro: aggiungerla a PART_NAMES
     e insegnare a _fetchPart come caricarla.
  ============================================================ */
  var PART_NAMES = ['articles', 'partite', 'albums', 'categories', 'players', 'staff', 'sponsors', 'seasons', 'stats'];

  var _parts = {};
  PART_NAMES.forEach(function (name) { _parts[name] = { loaded: false, loading: false, pending: [] }; });

  function _settingsDoc(id, applyFn) {
    return global.db.collection('settings').doc(id).get().then(function (doc) {
      if (doc.exists && Array.isArray(doc.data().items)) applyFn(doc.data().items);
    });
  }

  /* siteData/partite: un unico doc con un JSON stringify dentro (non una
     collection con un doc per partita), con fallback su data/partite.json
     se il doc non esiste ancora o Firestore non è raggiungibile. */
  function _fetchPartiteStatic() {
    return fetch('data/partite.json').then(function (r) { return r.json(); }).then(function (data) {
      VV.setPartite(data);
    });
  }

  function _fetchPartite() {
    try {
      return global.db.collection('siteData').doc('partite').get()
        .then(function (doc) {
          if (doc.exists && doc.data() && doc.data().json) {
            VV.setPartite(JSON.parse(doc.data().json));
            return;
          }
          return _fetchPartiteStatic();
        })
        .catch(function () { return _fetchPartiteStatic(); });
    } catch (e) {
      return _fetchPartiteStatic();
    }
  }

  function _fetchPart(name) {
    switch (name) {
      case 'articles':   return _loadOne('articles');
      case 'partite':    return _fetchPartite();
      case 'albums':     return _loadOne('albums');
      case 'categories': return _loadOne('categories');
      case 'players':    return _loadOne('players');
      case 'staff':      return _loadOne('staff');
      case 'sponsors':   return _settingsDoc('sponsor', VV.setSponsors);
      case 'seasons':    return _settingsDoc('seasons', VV.setSeasons);
      case 'stats':      return _settingsDoc('stats',   VV.setStats);
      default:           return Promise.resolve();
    }
  }

  function _ensurePart(name) {
    var state = _parts[name];
    if (!state) return Promise.resolve(); /* parte sconosciuta: ignorata */
    if (!state.loading) {
      state.loading = true;
      _fetchPart(name)
        .catch(function (err) { console.error('[DB] load ' + name, err); })
        .then(function () {
          state.loaded = true;
          var cbs = state.pending.slice(); state.pending = [];
          cbs.forEach(function (resolve) { resolve(); });
        });
    }
    if (state.loaded) return Promise.resolve();
    return new Promise(function (resolve) { state.pending.push(resolve); });
  }

  /* ============================================================
     DB pubblico
  ============================================================ */
  var DB = {

    /* ---- AUDIT ------------------------------------------------- */
    /* Chi ha fatto login (admin.js) registra qui il proprio logger,
       così ogni scrittura di questo file produce anche una riga di log
       senza doverla ripetere in ogni metodo. */
    setAuditHook: function (fn) { _auditHook = fn; },

    /* ---- LOAD MIRATO ------------------------------------------ */
    /* Carica solo le parti richieste, es: DB.load(['sponsors'], cb).
       Parti disponibili: vedi PART_NAMES sopra. Sicuro da chiamare più
       volte con parti diverse da script diversi sulla stessa pagina:
       ogni parte viene scaricata una sola volta e messa in cache. */
    load: function (parts, cb) {
      Promise.all((parts || []).map(_ensurePart)).then(function () { if (cb) cb(); });
    },

    /* ---- INIT ------------------------------------------------ */
    /* Carica tutto (usato dall'admin, che gestisce ogni sezione). Per le
       pagine pubbliche preferire DB.load([...]) con solo ciò che serve. */
    init: function (cb) {
      DB.load(PART_NAMES, cb);
    },

    /* ---- ARTICLES -------------------------------------------- */
    saveArticle: function (article, cb) {
      var before = article.id ? VV.getArticle(article.id) : null;
      var saved  = VV.saveArticle(article);
      if (cb) cb();
      _upsert('articles', saved).then(function () {
        _audit('articolo', String(saved.id), 'Articolo — ' + saved.title, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }).catch(function (e) { console.error('[DB] saveArticle', e); });
      return saved;
    },
    deleteArticle: function (id, cb) {
      var before = VV.getArticle(id);
      VV.deleteArticle(id);
      if (cb) cb();
      _remove('articles', id).then(function () {
        _audit('articolo', String(id), 'Articolo — ' + (before ? before.title : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).catch(function (e) { console.error('[DB] deleteArticle', e); });
    },

    /* ---- PARTITE (calendario) ---------------------------------- */
    /* siteData/partite è un doc unico con l'intero array in JSON, quindi
       il salvataggio riscrive sempre l'array completo (non un upsert per id). */
    savePartite: function (items, cb) {
      var before = VV.getPartite();
      VV.setPartite(items);
      if (cb) cb();
      global.db.collection('siteData').doc('partite').set({
        json:      JSON.stringify(items),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        _audit('calendario', 'partite', 'Calendario partite', 'update', [{ campo: '(elenco)', prima: before.length + ' partite', dopo: items.length + ' partite' }]);
      }).catch(function (e) { console.error('[DB] savePartite', e); });
    },

    /* ---- ALBUMS ---------------------------------------------- */
    saveAlbum: function (album, cb) {
      var before = album.id ? VV.getAlbum(album.id) : null;
      var saved  = VV.saveAlbum(album);
      if (cb) cb(saved);
      _upsert('albums', saved).then(function () {
        _audit('album', String(saved.id), 'Album — ' + saved.title, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }).catch(function (e) { console.error('[DB] saveAlbum', e); });
      return saved;
    },
    deleteAlbum: function (id, cb) {
      var before = VV.getAlbum(id);
      VV.deleteAlbum(id);
      if (cb) cb();
      _remove('albums', id).then(function () {
        _audit('album', String(id), 'Album — ' + (before ? before.title : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).catch(function (e) { console.error('[DB] deleteAlbum', e); });
    },

    /* ---- CATEGORIES ------------------------------------------ */
    saveCategory: function (cat, cb) {
      var before = cat.id ? VV.getCategory(cat.id) : null;
      var saved  = VV.saveCategory(cat);
      if (cb) cb(saved);
      _upsert('categories', saved).then(function () {
        _audit('categoria', String(saved.id), 'Categoria — ' + saved.name, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }).catch(function (e) { console.error('[DB] saveCategory', e); });
      return saved;
    },
    deleteCategory: function (id, cb) {
      var before  = VV.getCategory(id);
      var players = VV.getPlayers(id);
      var staff   = VV.getStaff(id);
      VV.deleteCategory(id);          /* aggiorna cache in-memory (cascade) */
      if (cb) cb();
      /* cascade Firestore in background */
      var ops = [_remove('categories', id)];
      players.forEach(function (p) { ops.push(_remove('players', p.id)); });
      staff.forEach(function (s)   { ops.push(_remove('staff',   s.id)); });
      Promise.all(ops).then(function () {
        _audit('categoria', String(id), 'Categoria — ' + (before ? before.name : id), 'delete', [{ campo: '(record, con giocatori/staff collegati)', prima: 'presente', dopo: null }]);
      }).catch(function (e) { console.error('[DB] deleteCategory cascade', e); });
    },

    /* ---- PLAYERS --------------------------------------------- */
    savePlayer: function (player, cb) {
      var before = player.id ? _findById(VV.getPlayers(), player.id) : null;
      var saved  = VV.savePlayer(player);
      if (cb) cb(saved);
      _upsert('players', saved).then(function () {
        _audit('giocatore', String(saved.id), 'Giocatore — ' + saved.name, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }).catch(function (e) { console.error('[DB] savePlayer', e); });
      return saved;
    },
    deletePlayer: function (id, cb) {
      var before = _findById(VV.getPlayers(), id);
      VV.deletePlayer(id);
      if (cb) cb();
      _remove('players', id).then(function () {
        _audit('giocatore', String(id), 'Giocatore — ' + (before ? before.name : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).catch(function (e) { console.error('[DB] deletePlayer', e); });
    },

    /* ---- STAFF ----------------------------------------------- */
    saveStaffMember: function (person, cb) {
      var before = person.id ? _findById(VV.getStaff(), person.id) : null;
      var saved  = VV.saveStaffMember(person);
      if (cb) cb(saved);
      _upsert('staff', saved).then(function () {
        _audit('staff', String(saved.id), 'Staff — ' + saved.name, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }).catch(function (e) { console.error('[DB] saveStaff', e); });
      return saved;
    },
    deleteStaffMember: function (id, cb) {
      var before = _findById(VV.getStaff(), id);
      VV.deleteStaffMember(id);
      if (cb) cb();
      _remove('staff', id).then(function () {
        _audit('staff', String(id), 'Staff — ' + (before ? before.name : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).catch(function (e) { console.error('[DB] deleteStaff', e); });
    },

    /* ---- STATS ---------------------------------------------- */
    saveStats: function (items, cb) {
      var before = VV.getStats();
      VV.setStats(items);
      if (cb) cb();
      global.db.collection('settings').doc('stats').set({ items: items })
        .then(function () {
          _audit('statistiche', 'stats', 'Statistiche homepage', 'update', [{ campo: '(elenco)', prima: before.length + ' voci', dopo: items.length + ' voci' }]);
        })
        .catch(function (e) { console.error('[DB] saveStats', e); });
    },

    /* ---- SPONSORS ------------------------------------------- */
    saveSponsors: function (items, cb) {
      var before = VV.getSponsors();
      VV.setSponsors(items);
      if (cb) cb();
      global.db.collection('settings').doc('sponsor').set({ items: items })
        .then(function () {
          _audit('sponsorSito', 'sponsor', 'Sponsor (vetrina sito)', 'update', [{ campo: '(elenco)', prima: before.length + ' sponsor', dopo: items.length + ' sponsor' }]);
        })
        .catch(function (e) { console.error('[DB] saveSponsors', e); });
    },

    /* ---- SEASONS -------------------------------------------- */
    saveSeason: function (season, cb) {
      var before = _findById(VV.getSeasons(), season.id);
      VV.saveSeason(season);
      if (cb) cb();
      global.db.collection('settings').doc('seasons').set({ items: VV.getSeasons() })
        .then(function () {
          _audit('stagioneSito', String(season.id), 'Stagione sito — ' + (season.name || season.id), before ? 'update' : 'create', _diffRecord(before, season, Object.keys(season)));
        })
        .catch(function (e) { console.error('[DB] saveSeason', e); });
    },
    deleteSeason: function (id, cb) {
      var before = _findById(VV.getSeasons(), id);
      VV.deleteSeason(id);
      if (cb) cb();
      global.db.collection('settings').doc('seasons').set({ items: VV.getSeasons() })
        .then(function () {
          _audit('stagioneSito', String(id), 'Stagione sito — ' + (before ? before.name : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
        })
        .catch(function (e) { console.error('[DB] deleteSeason', e); });
    },
    setCurrentSeason: function (id, cb) {
      VV.setCurrentSeason(id);
      if (cb) cb();
      global.db.collection('settings').doc('seasons').set({ items: VV.getSeasons() })
        .then(function () {
          _audit('stagioneSito', String(id), 'Stagione sito attiva', 'update', [{ campo: 'current', prima: null, dopo: id }]);
        })
        .catch(function (e) { console.error('[DB] setCurrentSeason', e); });
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
