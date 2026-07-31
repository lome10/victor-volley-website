/**
 * Victor Volley — Data Layer (localStorage)
 * Esposto come window.VV
 */
(function (global) {
  'use strict';

  var KEYS = {
    articles:   'vv_articles',
    albums:     'vv_albums',
    categories: 'vv_categories',
    players:    'vv_players',
    staff:      'vv_staff',
    partite:    'vv_partite'
  };

  var DEFAULT_STATS = [
    { id: 1, value: '2019', prefix: 'Dal ', suffix: '',  label: 'Anno di fondazione' },
    { id: 2, value: '5',    prefix: '',     suffix: '',  label: 'Categorie attive'   },
    { id: 3, value: '150',  prefix: '',     suffix: '+', label: 'Atleti in rosa'     },
    { id: 4, value: '1',    prefix: '',     suffix: '',  label: 'Palazzetto di casa' }
  ];

  var _stats    = null;
  var _sponsors = [];
  var _seasons  = [];
  var _maglia   = null;
  var _categorieArticoli = null;

  var DEFAULT_CATEGORIE_ARTICOLI = ['Prima Divisione', 'Under 19', 'Under 13', 'Under 12', 'Minivolley', 'Società'];

  var DEFAULT_MAGLIA = {
    enabled: true,
    title: 'Nuova maglia 2026/27',
    subtitle: 'Il reveal si avvicina: presto potrai ruotarla, ingrandirla ed esplorarla in un render 3D interattivo.',
    revealDate: '2026-08-18T00:00:00'
  };

  var DEFAULTS = {
    articles: [
      { id: 1, title: 'Inizia la nuova stagione: presentate tutte le squadre', category: 'Società', date: '2025-10-01', excerpt: 'La Victor Volley è pronta per la nuova stagione sportiva. Presentate ufficialmente le cinque categorie.', content: '<p>La Victor Volley è pronta per la nuova stagione sportiva. Presentate ufficialmente le cinque categorie.</p>', image: '', published: true },
      { id: 2, title: "Vittoria convincente della Prima Divisione all'esordio", category: 'Prima Divisione', date: '2025-10-12', excerpt: 'Prima giornata di campionato positiva: la Prima Divisione conquista i tre punti in casa.', content: '<p>Prima giornata di campionato positiva: la Prima Divisione conquista i tre punti in casa.</p>', image: '', published: true },
      { id: 3, title: 'Aperte le iscrizioni al Minivolley 2025/2026', category: 'Minivolley', date: '2025-09-15', excerpt: 'Sono aperte le iscrizioni al Minivolley per bambini dai 6 ai 10 anni. Venite a provare gratuitamente.', content: '<p>Sono aperte le iscrizioni al Minivolley per bambini dai 6 ai 10 anni.</p>', image: '', published: true }
    ],
    albums: [],
    categories: [
      { id:1, name:'Prima Divisione', abbr:'PD',  color:'#008CFD', description:'Campionato senior FIPAV',      schedule:'', showInSquadre:true,  active:true },
      { id:2, name:'Under 19',        abbr:'U19', color:'#0070D6', description:'Categoria giovanile',           schedule:'', showInSquadre:true,  active:true },
      { id:3, name:'Under 13',        abbr:'U13', color:'#CB2168', description:'Categoria giovanile',           schedule:'', showInSquadre:true,  active:true },
      { id:4, name:'Under 12',        abbr:'U12', color:'#e05090', description:'Categoria giovanile',           schedule:'', showInSquadre:true,  active:true },
      { id:5, name:'Minivolley',      abbr:'MV',  color:'#f59e0b', description:'Per bambini dai 6 ai 10 anni', schedule:'', showInSquadre:true,  active:true },
      { id:6, name:'Società',         abbr:'SOC', color:'#10b981', description:'Notizie generali della società',schedule:'', showInSquadre:false, active:true }
    ],
    players: [],
    staff:   []
  };

  /* Cache in-memory: db.js la popola da Firestore tramite VV._load() */
  var _cache = {};
  function _read(k)     { return Object.prototype.hasOwnProperty.call(_cache, k) ? _cache[k] : null; }
  function _write(k, v) { _cache[k] = v; }
  function _nextId(arr) { return arr.length ? Math.max.apply(null, arr.map(function(x){ return x.id || 0; })) + 1 : 1; }

  var VV = {

    /* ---- ARTICLES ---- */
    getArticles: function (publishedOnly) {
      var arr = _read(KEYS.articles) || DEFAULTS.articles.slice();
      return publishedOnly ? arr.filter(function(a){ return a.published; }) : arr;
    },
    getArticle: function (id) {
      return this.getArticles().find(function(a){ return a.id === +id; }) || null;
    },
    saveArticle: function (article) {
      var arr = this.getArticles();
      var idx = arr.findIndex(function(a){ return a.id === article.id; });
      if (idx >= 0) { arr[idx] = article; } else { article.id = _nextId(arr); arr.unshift(article); }
      _write(KEYS.articles, arr);
      return article;
    },
    deleteArticle: function (id) {
      _write(KEYS.articles, this.getArticles().filter(function(a){ return a.id !== +id; }));
    },

    /* ---- ALBUMS ---- */
    getAlbums:   function ()    { return _read(KEYS.albums) || []; },
    getAlbum:    function (id)  { return this.getAlbums().find(function(a){ return a.id === +id; }) || null; },
    saveAlbum:   function (album) {
      var arr = this.getAlbums();
      var idx = arr.findIndex(function(a){ return a.id === album.id; });
      if (idx >= 0) { arr[idx] = album; } else { album.id = _nextId(arr); arr.unshift(album); }
      _write(KEYS.albums, arr);
      return album;
    },
    deleteAlbum: function (id)  { _write(KEYS.albums, this.getAlbums().filter(function(a){ return a.id !== +id; })); },

    /* ---- CATEGORIES ---- */
    getCategories: function (activeOnly) {
      var arr = _read(KEYS.categories) || DEFAULTS.categories.slice();
      return activeOnly ? arr.filter(function(c){ return c.active; }) : arr;
    },
    getCategory: function (id) {
      return this.getCategories().find(function(c){ return c.id === +id; }) || null;
    },
    saveCategory: function (cat) {
      var arr = this.getCategories();
      var idx = arr.findIndex(function(c){ return c.id === cat.id; });
      if (idx >= 0) { arr[idx] = cat; } else { cat.id = _nextId(arr); arr.push(cat); }
      _write(KEYS.categories, arr);
      return cat;
    },
    deleteCategory: function (id) {
      _write(KEYS.categories, this.getCategories().filter(function(c){ return c.id !== +id; }));
      _write(KEYS.players, this.getPlayers().filter(function(p){ return p.categoryId !== +id; }));
      _write(KEYS.staff,   this.getStaff().filter(function(s){ return s.categoryId !== +id; }));
    },

    /* ---- PLAYERS ---- */
    getPlayers: function (categoryId) {
      var arr = (_read(KEYS.players) || []).map(function (p) {
        if (p.role === 'Schiacciatore') p = Object.assign({}, p, { role: 'Laterale' });
        return p;
      });
      return categoryId !== undefined
        ? arr.filter(function(p){ return p.categoryId === +categoryId; })
        : arr;
    },
    savePlayer: function (player) {
      var arr = _read(KEYS.players) || [];
      var idx = arr.findIndex(function(p){ return p.id === player.id; });
      if (idx >= 0) { arr[idx] = player; } else { player.id = _nextId(arr); arr.push(player); }
      _write(KEYS.players, arr);
      return player;
    },
    deletePlayer: function (id) {
      _write(KEYS.players, (_read(KEYS.players) || []).filter(function(p){ return p.id !== +id; }));
    },

    /* ---- STAFF ---- */
    getStaff: function (categoryId) {
      var arr = _read(KEYS.staff) || [];
      return categoryId !== undefined
        ? arr.filter(function(s){ return s.categoryId === +categoryId; })
        : arr;
    },
    saveStaffMember: function (person) {
      var arr = _read(KEYS.staff) || [];
      var idx = arr.findIndex(function(s){ return s.id === person.id; });
      if (idx >= 0) { arr[idx] = person; } else { person.id = _nextId(arr); arr.push(person); }
      _write(KEYS.staff, arr);
      return person;
    },
    deleteStaffMember: function (id) {
      _write(KEYS.staff, (_read(KEYS.staff) || []).filter(function(s){ return s.id !== +id; }));
    },

    /* ---- HELPERS ---- */
    formatDate: function (s) {
      if (!s) return '';
      var d = new Date(s + 'T00:00:00');
      return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    },
    formatDateShort: function (s) {
      if (!s) return '';
      var d = new Date(s + 'T00:00:00');
      return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    catColor: function (cat) {
      var found = this.getCategories().find(function(c){ return c.name === cat; });
      if (found) return found.color;
      var fallback = { 'Prima Divisione':'#008CFD','Under 19':'#0070D6','Under 13':'#CB2168','Under 12':'#e05090','Minivolley':'#f59e0b','Società':'#10b981' };
      return fallback[cat] || '#008CFD';
    },
    getCategoryNames: function () {
      return this.getCategories(true).map(function(c){ return c.name; });
    },
    get CATEGORIES() {
      return this.getCategoryNames();
    },

    /* ---- CATEGORIE ARTICOLI (separate dalle categorie squadra) ---- */
    getCategorieArticoli: function () { return _categorieArticoli || DEFAULT_CATEGORIE_ARTICOLI.slice(); },
    setCategorieArticoli: function (items) { _categorieArticoli = Array.isArray(items) ? items : null; },
    getArticleCategories: function (article) {
      if (!article) return [];
      if (Array.isArray(article.categories) && article.categories.length) return article.categories;
      return article.category ? [article.category] : [];
    },

    /* ---- STATS ---- */
    getStats: function () { return _stats || DEFAULT_STATS.slice(); },
    setStats: function (items) { _stats = items && items.length ? items : DEFAULT_STATS.slice(); },

    /* ---- SPONSORS ---- */
    getSponsors: function () { return _sponsors.slice(); },
    setSponsors: function (items) { _sponsors = Array.isArray(items) ? items : []; },

    /* ---- MAGLIA TEASER (homepage) ---- */
    getMaglia: function () { return _maglia || Object.assign({}, DEFAULT_MAGLIA); },
    setMaglia: function (obj) { _maglia = obj && typeof obj === 'object' ? obj : null; },

    /* ---- PARTITE (calendario) — una collection Firestore, un documento
       per partita: niente più sovrascritture dell'intero elenco quando
       più persone lavorano in admin contemporaneamente. ---- */
    getPartite: function () { return _read(KEYS.partite) || []; },
    getPartita: function (id) {
      return this.getPartite().find(function (p) { return p.id === id; }) || null;
    },
    savePartita: function (partita) {
      if (!partita.id) partita.id = 'm' + Date.now();
      var arr = this.getPartite();
      var idx = arr.findIndex(function (p) { return p.id === partita.id; });
      if (idx >= 0) { arr[idx] = partita; } else { arr.push(partita); }
      _write(KEYS.partite, arr);
      return partita;
    },
    deletePartita: function (id) {
      _write(KEYS.partite, this.getPartite().filter(function (p) { return p.id !== id; }));
    },
    /* Bulk-set usato solo dalla migrazione una tantum (vedi DB.migratePartiteToCollection) */
    setPartite: function (items) { _write(KEYS.partite, Array.isArray(items) ? items : []); },

    /* ---- SEASONS ---- */
    getSeasons: function () {
      return _seasons.length ? _seasons.slice() : [{ id: '2025/2026', name: '2025/2026', current: true }];
    },
    getCurrentSeason: function () {
      var ss = this.getSeasons();
      return ss.find(function (s) { return s.current; }) || ss[0] || null;
    },
    setSeasons: function (items) { _seasons = Array.isArray(items) ? items : []; },
    saveSeason: function (season) {
      var idx = _seasons.findIndex(function (s) { return s.id === season.id; });
      if (idx >= 0) { _seasons[idx] = season; } else { _seasons.unshift(season); }
    },
    deleteSeason: function (id) {
      _seasons = _seasons.filter(function (s) { return s.id !== id; });
    },
    setCurrentSeason: function (id) {
      _seasons.forEach(function (s) { s.current = (s.id === id); });
    },

    /* Chiamato da db.js per popolare la cache da Firestore */
    _load: function (col, items) {
      if (KEYS[col]) _cache[KEYS[col]] = items;
    }
  };

  global.VV = VV;
})(window);
