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
  var _squadreGirone = [];
  /* I loghi dell'elenco possono essere file del sito ("assets/logo.png"): li rendo assoluti per le pagine annidate. */
  function absLogo(u) { return /^(https?:|data:)/.test(u) || u.charAt(0) === '/' ? u : '/' + u; }
  var _maglia   = null;
  var _categorieArticoli = null;
  var _livelliSponsorSub = null;

  var DEFAULT_CATEGORIE_ARTICOLI = ['Prima Divisione', 'Under 19', 'Under 13', 'Under 12', 'Minivolley', 'Società'];

  var DEFAULT_MAGLIA = {
    enabled: true,
    title: 'Nuova maglia 2026/27',
    subtitle: 'KIT SHOWDOWN VICTOR VOLLEY - SEASON 26/27',
    revealDate: '2026-08-18T00:00:00',
    videoUrl: 'https://www.youtube.com/watch?v=TSGp37hHVJs'
  };

  var DEFAULT_LIVELLI_SPONSOR_SUB = {
    gold:   'I partner principali della società',
    silver: 'Le aziende che ci sostengono ogni stagione',
    bronze: 'Gli amici della Victor Volley'
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
    /* Slug dell'album = indirizzo della sua pagina (/galleria/<slug>). Se l'album non ne ha uno salvato
       (creato prima dello slug) lo ricavo dal titolo; in caso di doppioni il più vecchio tiene il nome
       pulito e gli altri ricevono il proprio id come suffisso. */
    /* Solo link http(s): scarta "javascript:", "data:" e simili prima di metterli in un href. */
    safeUrl: function (u) {
      u = String(u || '').trim();
      return /^https?:\/\//i.test(u) ? u : '';
    },
    slugify: function (text) {
      return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'album';
    },
    getAlbumSlug: function (album) {
      if (!album) return '';
      if (album.slug) return album.slug;
      var self = this, base = self.slugify(album.title);
      var clash = self.getAlbums().some(function (o) {
        return o.id !== album.id && (o.slug ? o.slug === base : (self.slugify(o.title) === base && o.id < album.id));
      });
      return clash ? base + '-' + album.id : base;
    },
    getAlbumBySlug: function (slug) {
      var self = this;
      return self.getAlbums().find(function (a) { return self.getAlbumSlug(a) === slug; }) || null;
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
    /* Sfondo di una hero-card: <img> con lazy loading (o sfumatura se manca l'immagine).
       eager=true per la prima card, visibile subito. */
    cardBgHtml: function (article, gradient, eager) {
      var e = function (v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      if (!article.image) return '<div class="hero-card-bg" style="background:' + gradient + '"></div>';
      return '<div class="hero-card-bg"><img src="' + e(article.image) + '" alt=""' +
        (eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"' +
        (article.imageFocus ? ' style="object-position:' + e(article.imageFocus) + '"' : '') + '></div>';
    },
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

    /* ---- LIVELLI SPONSOR: sottotitolo mostrato nella pagina Partner
       per ciascun livello (Gold/Silver/Bronze restano fissi come chiave
       interna, cambia solo il testo mostrato) ---- */
    getLivelliSponsorSub: function () { return Object.assign({}, DEFAULT_LIVELLI_SPONSOR_SUB, _livelliSponsorSub || {}); },
    setLivelliSponsorSub: function (obj) { _livelliSponsorSub = obj && typeof obj === 'object' ? obj : null; },

    /* ---- MAGLIA TEASER (homepage) ---- */
    getMaglia: function () { return _maglia || Object.assign({}, DEFAULT_MAGLIA); },
    /* Il video ha un valore di default anche per il documento Firestore salvato prima
       che esistesse il campo (videoUrl assente); una stringa vuota salvata dall'admin
       invece lo disattiva, e torna il countdown. */
    setMaglia: function (obj) {
      _maglia = obj && typeof obj === 'object' ? obj : null;
      if (_maglia && _maglia.videoUrl === undefined) _maglia = Object.assign({}, _maglia, { videoUrl: DEFAULT_MAGLIA.videoUrl });
    },

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
    /* ---- ELENCO SQUADRE DEL GIRONE ----
       Unica fonte dei loghi delle squadre: viene da siteData/girone
       (campo "squadre": id, nome, logo, home) e serve sia alla classifica
       sia alle card delle partite. */
    setSquadreGirone: function (list) { _squadreGirone = Array.isArray(list) ? list : []; },

    /* Formato del documento siteData/girone (v2): anagrafica unica delle
       squadre + un girone per categoria:
         { stagione, squadre:[{id,nome,logo,home}],
           gironi:[{categoria, girone, squadre:[id…], partite:[…]}] }
       Il vecchio formato (un solo girone: categoria/girone/squadre-oggetto/
       partite al primo livello) viene convertito qui, così continua a funzionare. */
    normalizeGirone: function (raw) {
      raw = raw || {};
      var ids = function (arr) { return (arr || []).map(function (x) { return typeof x === 'string' ? x : x.id; }); };
      var squadre = (raw.squadre || []).map(function (s) { return typeof s === 'string' ? { id: s, nome: s } : s; });
      var gironi;
      if (Array.isArray(raw.gironi)) {
        gironi = raw.gironi.map(function (g) {
          return { categoria: g.categoria || '', girone: g.girone || '', squadre: ids(g.squadre), partite: g.partite || [] };
        });
      } else if (raw.categoria) {
        gironi = [{ categoria: raw.categoria, girone: raw.girone || '', squadre: ids(squadre), partite: raw.partite || [] }];
      } else {
        gironi = [];
      }
      return { stagione: raw.stagione || '', squadre: squadre, gironi: gironi };
    },
    getSquadreGirone: function () { return _squadreGirone; },

    /* Chiave di confronto tra nomi: minuscolo, senza accenti, punteggiatura
       né sigle societarie (A.S.D., S.S.D., S.R.L.…). */
    teamKey: function (nome) {
      return String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ').replace(/\b(asd|ssd|srl|arl|ssdarl|a s d|s s d|s r l)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
    },
    /* Squadra dell'elenco che corrisponde a un nome libero (o null).
       Qualsiasi nome con "victor" è la squadra di casa. */
    findSquadraGirone: function (nome) {
      var key = this.teamKey(nome);
      if (!key) return null;
      var self = this;
      if (key.indexOf('victor') !== -1) {
        var home = _squadreGirone.filter(function (s) { return s.home; })[0];
        if (home) return home;
      }
      return _squadreGirone.filter(function (s) {
        return self.teamKey(s.nome) === key || s.id === key.replace(/ /g, '-');
      })[0] || null;
    },
    /* Per ogni partita, se la squadra è nell'elenco usa il suo logo al posto
       di quello scritto sulla partita (che resta come ripiego in
       logo_casa_orig / logo_ospite_orig, per l'admin). */
    applyGironeLogos: function (partite) {
      var self = this;
      (partite || []).forEach(function (p) {
        var c = self.findSquadraGirone(p.squadra_casa);
        var o = self.findSquadraGirone(p.squadra_ospite);
        /* ripartendo sempre dal logo scritto sulla partita, così si può rilanciare */
        if (p.logo_casa_orig   === undefined) p.logo_casa_orig   = p.logo_casa   || '';
        if (p.logo_ospite_orig === undefined) p.logo_ospite_orig = p.logo_ospite || '';
        p.logo_casa   = p.logo_casa_orig;
        p.logo_ospite = p.logo_ospite_orig;
        if (c && c.logo) p.logo_casa   = absLogo(c.logo);
        if (o && o.logo) p.logo_ospite = absLogo(o.logo);
      });
      return partite;
    },

    _load: function (col, items) {
      if (KEYS[col]) _cache[KEYS[col]] = items;
    }
  };

  global.VV = VV;
})(window);
