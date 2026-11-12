/* Victor Volley — Firestore sync layer
   Esposto come window.DB
   Dipende da: firebase-config.js (window.db, window.auth) + data.js (window.VV)

   Pattern: scrittura ottimistica.
   - VV.* aggiorna la cache in-memory subito (sincrono)
   - _upsert / _remove scrivono su Firestore in background (asincrono)
   - Il callback UI (cb) viene chiamato SOLO quando Firestore ha confermato la scrittura. Se la scrittura
     fallisce: banner d'errore in italiano, cache rilletta dal server e cb NON chiamato (il modulo resta
     aperto e si può riprovare). Le funzioni di salvataggio e di eliminazione restituiscono comunque subito il record.

   Audit log: ogni scrittura passa da _audit(), che inoltra a un hook impostato
   da chi ha fatto login (vedi DB.setAuditHook — usato da admin.js) invece di
   duplicare la logica di log in ogni singolo metodo.

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

  /* ---- ERRORI IN ITALIANO — funzione unica (DB.errorMessage) ----
     Firebase e il browser danno messaggi in inglese: qui li traduciamo. Gli errori che lanciamo noi
     (senza .code) hanno già un testo italiano e restano come sono. */
  var _ERR_CODICI = {
    'permission-denied':          'Non hai il permesso di fare questa modifica.',
    'unauthenticated':            'La sessione è scaduta: esci e rientra.',
    'auth/requires-recent-login': 'La sessione è scaduta: esci e rientra.',
    'auth/user-token-expired':    'La sessione è scaduta: esci e rientra.',
    'unavailable':                'Connessione assente o instabile.',
    'deadline-exceeded':          'Connessione assente o instabile.',
    'auth/network-request-failed': 'Connessione assente o instabile.',
    'resource-exhausted':         'Limite del servizio raggiunto: riprova più tardi.',
    'not-found':                  'Il dato non esiste più.',
    'already-exists':             'Esiste già un dato con questo nome.',
    'aborted':                    'Un altro utente ha modificato lo stesso dato: riprova.',
    'auth/email-already-in-use':  'Email già registrata.',
    'auth/invalid-email':         'L’email non è valida.',
    'auth/weak-password':         'La password è troppo debole: scegline una più lunga.',
    'auth/too-many-requests':     'Troppi tentativi: riprova tra qualche minuto.',
    'auth/user-not-found':        'Non esiste un account con questa email.',
    'auth/wrong-password':        'Password non corretta.',
    'auth/invalid-credential':    'Email o password non corrette.'
  };
  function _errIt(err) {
    if (!err) return 'Errore imprevisto. Riprova.';
    if (err.code && _ERR_CODICI[err.code]) return _ERR_CODICI[err.code];
    var msg = String(err.message || '');
    if (/failed to fetch|networkerror|load failed|network request failed|offline/i.test(msg)) return 'Connessione assente o instabile.';
    if (err.code || err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError || !msg) return 'Errore imprevisto. Riprova.';
    return msg;
  }

  /* Messaggio visibile: banner del pannello se c'è, altrimenti alert (le pagine pubbliche non scrivono). */
  function _notifyError(testo) {
    if (global.Admin && typeof global.Admin.avviso === 'function') global.Admin.avviso(testo, 'errore');
    else global.alert(testo);
  }

  /* Rilegge da Firestore la parte appena scritta male: la cache in memoria era già stata aggiornata
     (scrittura ottimistica) e non deve restare con un dato che sul server non c'è. */
  function _resync(part) {
    var st = _parts[part];
    if (!st) return;
    st.loaded = false; st.loading = false; st.error = false;
    _ensurePart(part);
  }

  function _writeFailed(part, what, err) {
    console.error('[DB] ' + what, err);
    /* «Riprova» solo se il motivo non lo dice già (es. «Errore imprevisto. Riprova.») */
    var motivo = _errIt(err);
    _notifyError('Operazione non riuscita: ' + what + '. ' + motivo + (/riprova/i.test(motivo) ? '' : ' Riprova.'));
    _resync(part);
  }

  /* Attende la scrittura: solo se riesce registra il log e chiama cb (la schermata passa avanti);
     se fallisce mostra l'errore, riallinea la cache e NON chiama cb (il modulo resta aperto). */
  /* Blocco «in salvataggio» per chiave (es. «saveArticle:7», «saveArticle:new», «saveSponsors»): vale per ogni
     strada (clic, Invio, codice), non solo per il pulsante. La chiave la imposta il wrapper in fondo al file. */
  var _inflight = {}, _currentKey = null;

  /* Senza rete Firestore NON dà errore: mette la scrittura in coda e la promessa resta in sospeso. Dopo questo
     tempo si avvisa e si sblocca il pulsante; la scrittura resta in coda e può completarsi più tardi. */
  var DEFAULT_WRITE_TIMEOUT_MS = 15000;

  function _after(part, what, write, audit, cb, cbArg) {
    var key = _currentKey; _currentKey = null;
    /* Il pulsante appena toccato resta spento finché la scrittura non finisce: ora il cb arriva dopo la rete,
       e un secondo tocco salverebbe due volte. (window.event esiste solo dentro un gestore di clic.) */
    var ev = global.event, btn = ev && ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (btn && btn.disabled) btn = null;
    if (btn) btn.disabled = true;
    var scaduta = false, chiusa = false;
    function libera() { if (btn) btn.disabled = false; if (key) delete _inflight[key]; }
    var timer = setTimeout(function () {
      if (chiusa) return;
      scaduta = true;
      libera();
      _notifyError('Connessione assente: il salvataggio non è confermato (' + what + '). Resta in coda e potrebbe completarsi da solo appena torna la rete: prima di rifarlo controlla l’elenco.');
    }, typeof DB.writeTimeoutMs === 'number' ? DB.writeTimeoutMs : DEFAULT_WRITE_TIMEOUT_MS);
    write.then(function () {
      chiusa = true; clearTimeout(timer); libera();
      try { audit(); } catch (e) { console.error('[DB] log ' + what, e); }
      if (scaduta) {
        /* già avvisato che non era confermato: ora lo è. La schermata non si sposta da sola (cb non chiamato). */
        if (global.Admin && typeof global.Admin.avviso === 'function') global.Admin.avviso('Il salvataggio è andato a buon fine (' + what + '): la connessione è tornata. Ricarica l’elenco per vederlo.', 'ok');
        return;
      }
      if (cb) cb(cbArg);
    }, function (e) { chiusa = true; clearTimeout(timer); libera(); _writeFailed(part, what, e); });
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
  var PART_NAMES = ['articles', 'partite', 'albums', 'categories', 'players', 'staff', 'sponsors', 'seasons', 'stats', 'maglia', 'categorieArticoli', 'livelliSponsorSub'];

  var _parts = {};
  PART_NAMES.forEach(function (name) { _parts[name] = { loaded: false, loading: false, error: false, pending: [] }; });

  function _settingsDoc(id, applyFn) {
    return global.db.collection('settings').doc(id).get().then(function (doc) {
      if (doc.exists && Array.isArray(doc.data().items)) applyFn(doc.data().items);
    });
  }

  /* Collection "partite": un documento per partita (id partita = id doc),
     upsert/delete indipendenti — niente più sovrascritture dell'intero
     elenco quando più persone lavorano in admin insieme (vedi il vecchio
     schema a doc unico, ormai migrato). */
  /* Elenco squadre del girone (siteData/girone, campo "squadre"): fonte
     unica dei loghi. In caso di errore resta vuoto e valgono i loghi
     scritti sulle singole partite. */
  function _loadSquadreGirone() {
    return global.db.collection('siteData').doc('girone').get().then(function (doc) {
      if (doc.exists && doc.data() && doc.data().json) return JSON.parse(doc.data().json);
      return fetch('/data/girone.json').then(function (r) { return r.json(); });
    }).then(function (g) {
      VV.setSquadreGirone(VV.normalizeGirone(g).squadre);
    }).catch(function (err) { console.warn('[DB] squadre girone', err); });
  }

  function _loadOnePartite() {
    return Promise.all([
      _col('partite').get(),
      _loadSquadreGirone()
    ]).then(function (res) {
      var items = [];
      res[0].forEach(function (doc) { items.push(doc.data()); });
      VV._load('partite', VV.applyGironeLogos(items));
    });
  }

  /* settings/maglia: un unico oggetto (non {items:[...]}), gestisce da sé
     l'assenza del doc lasciando VV.getMaglia() sui valori di default. */
  function _fetchMaglia() {
    return global.db.collection('settings').doc('maglia').get().then(function (doc) {
      if (doc.exists) VV.setMaglia(doc.data());
    });
  }

  /* settings/livelliSponsorSub: un unico oggetto {gold,silver,bronze},
     stessa logica di settings/maglia — in assenza del doc restano i
     sottotitoli di default (vedi DEFAULT_LIVELLI_SPONSOR_SUB in data.js). */
  function _fetchLivelliSponsorSub() {
    return global.db.collection('settings').doc('livelliSponsorSub').get().then(function (doc) {
      if (doc.exists) VV.setLivelliSponsorSub(doc.data());
    });
  }

  function _fetchPart(name) {
    switch (name) {
      case 'articles':   return _loadOne('articles');
      case 'partite':    return _loadOnePartite();
      case 'albums':     return _loadOne('albums');
      case 'categories': return _loadOne('categories');
      case 'players':    return _loadOne('players');
      case 'staff':      return _loadOne('staff');
      case 'sponsors':   return _settingsDoc('sponsor', VV.setSponsors);
      case 'seasons':    return _settingsDoc('seasons', VV.setSeasons);
      case 'stats':      return _settingsDoc('stats',   VV.setStats);
      case 'maglia':     return _fetchMaglia();
      case 'categorieArticoli': return _settingsDoc('categorieArticoli', VV.setCategorieArticoli);
      case 'livelliSponsorSub': return _fetchLivelliSponsorSub();
      default:           return Promise.resolve();
    }
  }

  function _ensurePart(name) {
    var state = _parts[name];
    if (!state) return Promise.resolve(); /* parte sconosciuta: ignorata */
    if (!state.loading) {
      state.loading = true;
      _fetchPart(name)
        .then(function () { state.error = false; }, function (err) { state.error = true; console.error('[DB] load ' + name, err); })
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

    /* true se almeno una delle parti non si è caricata (rete o permessi). */
    failed: function (parts) {
      return (parts || []).some(function (n) { return _parts[n] && _parts[n].error; });
    },

    /* Rimette in coda le parti andate in errore, poi chiama cb. */
    retry: function (parts, cb) {
      (parts || []).forEach(function (n) {
        var st = _parts[n];
        if (st && st.error) { st.error = false; st.loaded = false; st.loading = false; }
      });
      DB.load(parts, cb);
    },

    /* Come load(), ma se il caricamento fallisce mostra in `target`
       (elemento o id) un messaggio con «Riprova» invece di chiamare cb:
       così una rete assente non si confonde con «nessun risultato». */
    loadOrError: function (parts, target, cb, message) {
      function el() { return typeof target === 'string' ? document.getElementById(target) : target; }
      function run() {
        DB.load(parts, function () {
          var box = el();
          if (!DB.failed(parts) || !box) { cb(); return; }
          box.innerHTML = VV.errorStateHtml(message);
          var btn = box.querySelector('[data-retry]');
          if (btn) btn.addEventListener('click', function () {
            btn.disabled = true; btn.textContent = 'Riprovo…';
            DB.retry(parts, run);
          });
        });
      }
      run();
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
      _after('articles', 'salvataggio dell’articolo', _upsert('articles', saved), function () {
        _audit('articolo', String(saved.id), 'Articolo — ' + saved.title, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }, cb);
      return saved;
    },
    deleteArticle: function (id, cb) {
      var before = VV.getArticle(id);
      VV.deleteArticle(id);
      _after('articles', 'l’eliminazione dell’articolo', _remove('articles', id), function () {
        _audit('articolo', String(id), 'Articolo — ' + (before ? before.title : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }, cb);
    },

    /* ---- PARTITE (calendario) ---------------------------------- */
    /* Un documento per partita (doc id = id partita): ogni salvataggio/
       eliminazione tocca solo il proprio documento, mai l'elenco intero. */
    savePartita: function (partita, cb) {
      var before = partita.id ? VV.getPartita(partita.id) : null;
      var saved  = VV.savePartita(partita);
      _after('partite', 'salvataggio della partita', _col('partite').doc(String(saved.id)).set(saved), function () {
        var label = (saved.squadra_casa || '?') + ' vs ' + (saved.squadra_ospite || '?');
        _audit('partita', String(saved.id), label, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }, cb, saved);
      return saved;
    },
    deletePartita: function (id, cb) {
      var before = VV.getPartita(id);
      VV.deletePartita(id);
      _after('partite', 'l’eliminazione della partita', _col('partite').doc(String(id)).delete(), function () {
        var label = before ? ((before.squadra_casa || '?') + ' vs ' + (before.squadra_ospite || '?')) : String(id);
        _audit('partita', String(id), label, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }, cb);
    },

    /* ---- ALBUMS ---------------------------------------------- */
    saveAlbum: function (album, cb) {
      var before = album.id ? VV.getAlbum(album.id) : null;
      var saved  = VV.saveAlbum(album);
      _after('albums', 'salvataggio dell’album', _upsert('albums', saved), function () {
        _audit('album', String(saved.id), 'Album — ' + saved.title, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved).filter(function (k) { return k !== 'photos'; })));
      }, cb, saved);
      return saved;
    },
    deleteAlbum: function (id, cb) {
      var before = VV.getAlbum(id);
      VV.deleteAlbum(id);
      _after('albums', 'l’eliminazione dell’album', _remove('albums', id), function () {
        _audit('album', String(id), 'Album — ' + (before ? before.title : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }, cb);
    },

    /* ---- CATEGORIES ------------------------------------------ */
    saveCategory: function (cat, cb) {
      var before = cat.id ? VV.getCategory(cat.id) : null;
      var saved  = VV.saveCategory(cat);
      _after('categories', 'salvataggio della categoria', _upsert('categories', saved), function () {
        _audit('categoria', String(saved.id), 'Categoria — ' + saved.name, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }, cb, saved);
      return saved;
    },
    deleteCategory: function (id, cb) {
      var before  = VV.getCategory(id);
      var players = VV.getPlayers(id);
      var staff   = VV.getStaff(id);
      VV.deleteCategory(id);          /* aggiorna cache in-memory (cascade) */
      /* cascade Firestore: la schermata passa avanti solo quando tutto è stato scritto */
      var ops = [_remove('categories', id)];
      players.forEach(function (p) {
        ops.push(_remove('players', p.id));
        ops.push(_col('giocatoriDati').doc(String(p.id)).delete());
      });
      staff.forEach(function (s)   { ops.push(_remove('staff',   s.id)); });
      var write = Promise.all(ops);
      write.catch(function () { _resync('players'); _resync('staff'); });   /* il resto lo riallinea _after */
      _after('categories', 'l’eliminazione della squadra', write, function () {
        _audit('categoria', String(id), 'Categoria — ' + (before ? before.name : id), 'delete', [{ campo: '(record, con giocatori/staff collegati)', prima: 'presente', dopo: null }]);
      }, cb);
    },

    /* ---- PLAYERS --------------------------------------------- */
    savePlayer: function (player, cb) {
      var before = player.id ? _findById(VV.getPlayers(), player.id) : null;
      var saved  = VV.savePlayer(player);
      _after('players', 'salvataggio del giocatore', _upsert('players', saved), function () {
        _audit('giocatore', String(saved.id), 'Giocatore — ' + saved.name, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }, cb, saved);
      return saved;
    },
    deletePlayer: function (id, cb) {
      var before = _findById(VV.getPlayers(), id);
      VV.deletePlayer(id);
      _after('players', 'l’eliminazione del giocatore', _remove('players', id), function () {
        _audit('giocatore', String(id), 'Giocatore — ' + (before ? before.name : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }, cb);
      _col('giocatoriDati').doc(String(id)).delete().catch(function (e) { console.error('[DB] deletePlayer anno di nascita', e); });
    },

    /* ---- STAFF ----------------------------------------------- */
    saveStaffMember: function (person, cb) {
      var before = person.id ? _findById(VV.getStaff(), person.id) : null;
      var saved  = VV.saveStaffMember(person);
      _after('staff', 'salvataggio del membro dello staff', _upsert('staff', saved), function () {
        _audit('staff', String(saved.id), 'Staff — ' + saved.name, before ? 'update' : 'create', _diffRecord(before, saved, Object.keys(saved)));
      }, cb, saved);
      return saved;
    },
    deleteStaffMember: function (id, cb) {
      var before = _findById(VV.getStaff(), id);
      VV.deleteStaffMember(id);
      _after('staff', 'l’eliminazione del membro dello staff', _remove('staff', id), function () {
        _audit('staff', String(id), 'Staff — ' + (before ? before.name : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }, cb);
    },

    /* ---- CATEGORIE ARTICOLI ----------------------------------- */
    saveCategorieArticoli: function (items, cb) {
      var before = VV.getCategorieArticoli();
      VV.setCategorieArticoli(items);
      _after('categorieArticoli', 'salvataggio delle categorie degli articoli', global.db.collection('settings').doc('categorieArticoli').set({ items: items }), function () {
        _audit('categorieArticoli', 'categorieArticoli', 'Categorie articoli', 'update', [{ campo: '(elenco)', prima: before.length + ' categorie', dopo: items.length + ' categorie' }]);
      }, cb);
    },

    /* ---- STATS ---------------------------------------------- */
    saveStats: function (items, cb) {
      var before = VV.getStats();
      VV.setStats(items);
      _after('stats', 'salvataggio delle statistiche', global.db.collection('settings').doc('stats').set({ items: items }), function () {
        _audit('statistiche', 'stats', 'Statistiche homepage', 'update', [{ campo: '(elenco)', prima: before.length + ' voci', dopo: items.length + ' voci' }]);
      }, cb);
    },

    /* ---- SPONSORS ------------------------------------------- */
    saveSponsors: function (items, cb) {
      var before = VV.getSponsors();
      VV.setSponsors(items);
      _after('sponsors', 'salvataggio degli sponsor', global.db.collection('settings').doc('sponsor').set({ items: items }), function () {
        _audit('sponsorSito', 'sponsor', 'Sponsor (vetrina sito)', 'update', [{ campo: '(elenco)', prima: before.length + ' sponsor', dopo: items.length + ' sponsor' }]);
      }, cb);
    },

    /* ---- MAGLIA TEASER (homepage) ----------------------------- */
    saveMaglia: function (obj, cb) {
      var before = VV.getMaglia();
      VV.setMaglia(obj);
      _after('maglia', 'salvataggio del teaser della maglia', global.db.collection('settings').doc('maglia').set(obj), function () {
        _audit('magliaTeaser', 'maglia', 'Teaser nuova maglia (homepage)', 'update', _diffRecord(before, obj, Object.keys(obj)));
      }, cb);
    },

    /* ---- LIVELLI SPONSOR: sottotitolo per livello (pagina Partner) --- */
    saveLivelliSponsorSub: function (obj, cb) {
      var before = VV.getLivelliSponsorSub();
      VV.setLivelliSponsorSub(obj);
      _after('livelliSponsorSub', 'salvataggio dei testi dei livelli sponsor', global.db.collection('settings').doc('livelliSponsorSub').set(obj), function () {
        _audit('livelliSponsorSub', 'livelliSponsorSub', 'Testi livelli sponsor (pagina Partner)', 'update', _diffRecord(before, obj, Object.keys(obj)));
      }, cb);
    },

    /* ---- SEASONS -------------------------------------------- */
    saveSeason: function (season, cb) {
      var before = _findById(VV.getSeasons(), season.id);
      VV.saveSeason(season);
      _after('seasons', 'salvataggio della stagione', global.db.collection('settings').doc('seasons').set({ items: VV.getSeasons() }), function () {
        _audit('stagioneSito', String(season.id), 'Stagione sito — ' + (season.name || season.id), before ? 'update' : 'create', _diffRecord(before, season, Object.keys(season)));
      }, cb);
    },
    deleteSeason: function (id, cb) {
      var before = _findById(VV.getSeasons(), id);
      VV.deleteSeason(id);
      _after('seasons', 'l’eliminazione della stagione', global.db.collection('settings').doc('seasons').set({ items: VV.getSeasons() }), function () {
        _audit('stagioneSito', String(id), 'Stagione sito — ' + (before ? before.name : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }, cb);
    },
    setCurrentSeason: function (id, cb) {
      VV.setCurrentSeason(id);
      _after('seasons', 'cambio della stagione attiva', global.db.collection('settings').doc('seasons').set({ items: VV.getSeasons() }), function () {
        _audit('stagioneSito', String(id), 'Stagione sito attiva', 'update', [{ campo: 'current', prima: null, dopo: id }]);
      }, cb);
    },

    /* Messaggio d'errore in italiano per qualsiasi errore (Firebase, rete, o nostro): usato da tutto il pannello. */
    errorMessage: _errIt

  };

  /* Tempo massimo di attesa della conferma di una scrittura (ms); modificabile per i test. */
  DB.writeTimeoutMs = DEFAULT_WRITE_TIMEOUT_MS;

  /* Blocco del doppio salvataggio: se la stessa operazione sullo stesso record è già in corso (secondo tocco,
     Invio, codice) la seconda chiamata viene ignorata e restituisce null. Tutti i salvataggi/eliminazioni passano di qui. */
  ['saveArticle', 'deleteArticle', 'savePartita', 'deletePartita', 'saveAlbum', 'deleteAlbum', 'saveCategory', 'deleteCategory',
   'savePlayer', 'deletePlayer', 'saveStaffMember', 'deleteStaffMember', 'saveCategorieArticoli', 'saveStats', 'saveSponsors',
   'saveMaglia', 'saveLivelliSponsorSub', 'saveSeason', 'deleteSeason', 'setCurrentSeason'].forEach(function (name) {
    var orig = DB[name];
    DB[name] = function (arg) {
      var id = (arg && typeof arg === 'object' && !Array.isArray(arg)) ? arg.id : (typeof arg === 'number' || typeof arg === 'string' ? arg : undefined);
      var key = name + (id !== undefined && id !== null && id !== '' ? ':' + id : (/^(save(Article|Partita|Album|Category|Player|StaffMember|Season))$/.test(name) ? ':new' : ''));
      if (_inflight[key]) return null;
      _inflight[key] = true;
      _currentKey = key;
      try {
        return orig.apply(DB, arguments);
      } finally {
        if (_currentKey !== null) { delete _inflight[key]; _currentKey = null; }   /* nessuna scrittura partita: niente blocco */
      }
    };
  });

  global.DB = DB;
})(window);
