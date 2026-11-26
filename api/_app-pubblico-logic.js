/**
 * Dati pubblici per l'app del telefono (VVW-37). Servito come /api/app-pubblico (rewrite in vercel.json verso
 * api/sitemap.js: il piano Hobby ammette al massimo 12 funzioni).
 *
 *   GET /api/app-pubblico               -> un solo JSON con i contenuti pubblici del sito (senza il testo degli articoli)
 *   GET /api/app-pubblico?articolo=<id> -> un articolo pubblicato, con il testo (HTML scritto in admin: l'app lo deve filtrare)
 *
 * Si legge Firestore con l'API REST e la chiave pubblica del sito, quindi valgono le firestore.rules. In più ogni
 * campo che esce è scritto qui uno per uno (niente copie dell'intero documento) e valgono gli stessi filtri del sito.
 * "settings" e "siteData" si leggono SOLO documento per documento (settings/asd è privato).
 * Gli allenamenti non ci sono: il sito li mostra solo nell'area atleti.
 *
 * Letture: una rigenerazione costa circa un documento per ogni elemento (~146 il 26/11/2026). La risposta resta
 * in cache CACHE_SECONDI sulla CDN (per ogni zona) e in memoria nella funzione.
 */
const news = require('./_news-anteprima-logic');

const CACHE_SECONDI = 900;          /* unico posto in cui si decide ogni quanto si rileggono i dati */
const ERRORE_SECONDI = 60;          /* dopo un errore di Firestore non si ritenta prima di così */

const SITO = 'https://www.victorvolley.it';
const PROJECT = 'victor-volley';
const API_KEY = 'AIzaSyAEwljngFef_1WGZBdQ-SAqAvLwyXGxjmk';
/* La chiave web è limitata ai referrer del sito (come in sitemap.js). */
const REFERER = 'https://www.victorvolley.it/';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/* ---------------- Firestore REST ---------------- */

function valore(f) {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(valore);
  if ('mapValue' in f) return oggetto(f.mapValue.fields);
  return null;
}

function oggetto(fields) {
  const o = {};
  Object.keys(fields || {}).forEach((k) => { o[k] = valore(fields[k]); });
  return o;
}

async function chiama(url, opzioni) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const o = opzioni || {};
    return await fetch(url, Object.assign({}, o, { signal: ctrl.signal, headers: Object.assign({ Referer: REFERER }, o.headers) }));
  } finally { clearTimeout(t); }
}

async function leggiRaccolta(nome) {
  const docs = [];
  let pagina = '';
  for (let i = 0; i < 10; i++) {
    const res = await chiama(`${BASE}/${nome}?pageSize=300&key=${API_KEY}` + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''));
    if (!res.ok) throw new Error(nome + ': HTTP ' + res.status);
    const data = await res.json();
    (data.documents || []).forEach((d) => docs.push(oggetto(d.fields)));
    pagina = data.nextPageToken;
    if (!pagina) return docs;
  }
  throw new Error(nome + ': troppi documenti');   /* meglio un errore che un elenco tagliato */
}

/** Un documento per indirizzo; null se non esiste. */
async function leggiDocumento(percorso) {
  const res = await chiama(`${BASE}/${percorso}?key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(percorso + ': HTTP ' + res.status);
  return oggetto((await res.json()).fields);
}

/** Articoli pubblicati (tutti, o quello con il campo id indicato). Le bozze non vengono nemmeno scaricate. */
async function leggiArticoli(id) {
  const pubblicato = { fieldFilter: { field: { fieldPath: 'published' }, op: 'EQUAL', value: { booleanValue: true } } };
  const where = id
    ? { fieldFilter: { field: { fieldPath: 'id' }, op: 'EQUAL', value: { integerValue: String(id) } } }
    : pubblicato;
  const res = await chiama(`${BASE}:runQuery?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: Object.assign({ from: [{ collectionId: 'articles' }], where }, id ? { limit: 1 } : {}) })
  });
  if (!res.ok) throw new Error('articles: HTTP ' + res.status);
  const righe = await res.json();
  return (Array.isArray(righe) ? righe : []).filter((r) => r.document).map((r) => oggetto(r.document.fields))
    .filter((a) => a.published === true);
}

/* ---------------- campi ---------------- */

const testo = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
const lista = (v) => (Array.isArray(v) ? v : []);
const oggetti = (v) => lista(v).filter((x) => x && typeof x === 'object' && !Array.isArray(x));
const testi = (v) => lista(v).filter((x) => typeof x === 'string' && x);

/** Immagine: indirizzo https, oppure file del sito reso assoluto. Mai base64 o altri schemi. */
function immagine(v) {
  const u = testo(v).trim();
  if (/^https:\/\//i.test(u)) return u;
  if (/^\/?assets\//.test(u)) return SITO + '/' + u.replace(/^\//, '');
  return '';
}

/** Link da aprire: solo http/https, come VV.safeUrl. */
function collegamento(v) {
  const u = testo(v).trim();
  return /^https?:\/\//i.test(u) ? u : '';
}

/* ---- Regole copiate da js/data.js (il test scripts/check-app-pubblico.js le confronta con l'originale) ---- */

function slugify(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'album';
}

function slugAlbum(album, tutti) {
  if (album.slug) return album.slug;
  const base = slugify(album.title);
  const doppio = tutti.some((o) => o.id !== album.id && (o.slug ? o.slug === base : (slugify(o.title) === base && o.id < album.id)));
  return doppio ? base + '-' + album.id : base;
}

function chiaveSquadra(nome) {
  return String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(asd|ssd|srl|arl|ssdarl|a s d|s s d|s r l)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function trovaSquadra(squadre, nome) {
  const key = chiaveSquadra(nome);
  if (!key) return null;
  if (key.indexOf('victor') !== -1) {
    const casa = squadre.filter((s) => s.home)[0];
    if (casa) return casa;
  }
  return squadre.filter((s) => chiaveSquadra(s.nome) === key || s.id === key.replace(/ /g, '-'))[0] || null;
}

const STAGIONI_PREDEFINITE = [{ id: '2025/2026', name: '2025/2026', current: true }];
const CATEGORIE_ARTICOLI_PREDEFINITE = ['Prima Divisione', 'Under 19', 'Under 13', 'Under 12', 'Minivolley', 'Società'];
const MAGLIA_PREDEFINITA = {
  enabled: true,
  title: 'Nuova maglia 2026/27',
  subtitle: 'KIT SHOWDOWN VICTOR VOLLEY - SEASON 26/27',
  revealDate: '2026-08-18T00:00:00',
  videoUrl: 'https://www.youtube.com/watch?v=TSGp37hHVJs'
};
const LIVELLI_PREDEFINITI = {
  gold: 'I partner principali della società',
  silver: 'Le aziende che ci sostengono ogni stagione',
  bronze: 'Gli amici della Victor Volley'
};

/* ---------------- forma del JSON ---------------- */

function parziali(v) {
  return lista(v).filter(Array.isArray).map((s) => [numero(s[0]), numero(s[1])]);
}

function girone(raw) {
  raw = raw || {};
  const ids = (arr) => lista(arr).map((x) => testo(typeof x === 'string' ? x : x && x.id));
  const squadre = lista(raw.squadre).map((s) => {
    const o = typeof s === 'string' ? { id: s, nome: s } : (s || {});
    return { id: testo(o.id), nome: testo(o.nome), logo: immagine(o.logo), home: !!o.home };
  });
  const gruppi = Array.isArray(raw.gironi) ? raw.gironi
    : raw.categoria ? [{ categoria: raw.categoria, girone: raw.girone, squadre: squadre.map((s) => s.id), partite: raw.partite }] : [];
  return {
    stagione: testo(raw.stagione),
    squadre,
    gironi: oggetti(gruppi).map((g) => ({
      categoria: testo(g.categoria),
      girone: testo(g.girone),
      squadre: ids(g.squadre),
      partite: oggetti(g.partite).map((p) => ({
        id: testo(p.id), giornata: numero(p.giornata), data: testo(p.data), ora: testo(p.ora), palazzetto: testo(p.palazzetto),
        squadra_casa: testo(p.squadra_casa), squadra_ospite: testo(p.squadra_ospite),
        set_casa: numero(p.set_casa), set_ospite: numero(p.set_ospite), parziali: parziali(p.parziali)
      }))
    }))
  };
}

function categorieArticolo(a) {
  const c = testi(a.categories);
  return c.length ? c : testi([a.category]);
}

/** Campi comuni all'elenco e al singolo articolo. */
function baseArticolo(a) {
  return {
    id: numero(a.id),
    title: testo(a.title),
    date: testo(a.date),
    categories: categorieArticolo(a),
    image: immagine(a.image),
    imageFocus: testo(a.imageFocus),
    coverRatio: testo(a.coverRatio) || '4:5',
    sponsorIds: lista(a.sponsor_ids).map(numero).filter((n) => n !== null)
  };
}

function partita(p, squadre) {
  /* Come VV.applyGironeLogos: il logo dell'elenco squadre vince su quello scritto sulla partita. */
  const logo = (nome, proprio, originale) => {
    const s = trovaSquadra(squadre, nome);
    return (s && s.logo) || immagine(originale !== undefined ? originale : proprio);
  };
  return {
    id: testo(p.id),
    stagione: testo(p.stagione),
    categoria: testo(p.categoria),
    squadraCasa: testo(p.squadra_casa),
    squadraOspite: testo(p.squadra_ospite),
    logoCasa: logo(p.squadra_casa, p.logo_casa, p.logo_casa_orig),
    logoOspite: logo(p.squadra_ospite, p.logo_ospite, p.logo_ospite_orig),
    data: testo(p.data),
    ora: testo(p.ora),
    palazzetto: testo(p.palazzetto),
    stato: testo(p.stato),
    setCasa: numero(p.set_casa),
    setOspite: numero(p.set_ospite),
    sppCode: testo(p.spp_code) || null
  };
}

function persona(p) {
  return {
    id: numero(p.id),
    categoriaId: numero(p.categoryId),
    stagione: testo(p.stagione),
    name: testo(p.name),
    role: testo(p.role),
    photo: immagine(p.photo),
    photoFocus: testo(p.photoFocus),
    order: numero(p.order)
  };
}

/** Dai documenti letti al JSON dell'app. Funzione pura. */
function componi(d, adesso) {
  const g = girone(d.girone);

  const categorie = oggetti(d.categories).filter((c) => c.active).sort((a, b) => a.id - b.id).map((c) => ({
    id: numero(c.id), name: testo(c.name), abbr: testo(c.abbr), color: testo(c.color),
    description: testo(c.description), schedule: testo(c.schedule), showInSquadre: c.showInSquadre !== false
  }));
  /* Rose: solo le categorie che la pagina Squadre mostra. */
  const visibili = new Set(categorie.filter((c) => c.showInSquadre).map((c) => c.id));
  const inRosa = (p) => visibili.has(numero(p.categoryId));

  const albumGrezzi = oggetti(d.albums);
  const album = albumGrezzi.map((a) => {
    const photos = oggetti(a.photos).filter((f) => testo(f.id)).map((f) => ({ id: testo(f.id), w: numero(f.w), h: numero(f.h) }));
    return {
      id: numero(a.id), slug: slugAlbum(a, albumGrezzi), title: testo(a.title), date: testo(a.date),
      category: testo(a.category), photoCount: photos.length, photos
    };
  }).filter((a) => a.photos.length).sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

  const stagioni = oggetti(d.seasons && d.seasons.items);
  const catArticoli = d.categorieArticoli && Array.isArray(d.categorieArticoli.items) ? testi(d.categorieArticoli.items) : null;
  const maglia = Object.assign({}, d.maglia || MAGLIA_PREDEFINITA);
  if (maglia.videoUrl === undefined) maglia.videoUrl = MAGLIA_PREDEFINITA.videoUrl;
  const livelli = Object.assign({}, LIVELLI_PREDEFINITI, d.livelli || {});

  return {
    versione: 1,
    generatoIl: adesso.toISOString(),
    stagioni: (stagioni.length ? stagioni : STAGIONI_PREDEFINITE).map((s) => ({ id: testo(s.id), name: testo(s.name), current: !!s.current })),
    categorie,
    articoli: oggetti(d.articles).filter((a) => a.published === true && numero(a.id))
      .sort((a, b) => (testo(a.date) < testo(b.date) ? 1 : -1))
      .map((a) => Object.assign(baseArticolo(a), {
        riassunto: news.descrizione({ excerpt: testo(a.excerpt), content: testo(a.content) }),
        heroOrder: numero(a.heroOrder)
      })),
    categorieArticoli: catArticoli || CATEGORIE_ARTICOLI_PREDEFINITE.slice(),
    partite: oggetti(d.partite).map((p) => partita(p, g.squadre)),
    girone: g,
    giocatori: oggetti(d.players).filter(inRosa).map((p) => Object.assign(persona(p), {
      number: numero(p.number),
      role: p.role === 'Schiacciatore' ? 'Laterale' : testo(p.role),
      gender: testo(p.gender)
    })),
    staff: oggetti(d.staff).filter(inRosa).map(persona),
    album,
    sponsor: oggetti(d.sponsor && d.sponsor.items).map((s) => ({
      id: numero(s.id), nome: testo(s.nome), logo: immagine(s.logo), url: collegamento(s.url),
      order: numero(s.order), livello: testo(s.livello) || 'silver', ripetizioni: Math.max(1, numero(s.ripetizioni) || 1)
    })).sort((a, b) => (a.order || 0) - (b.order || 0)),
    livelliSponsor: { gold: testo(livelli.gold), silver: testo(livelli.silver), bronze: testo(livelli.bronze) },
    maglia: {
      enabled: !!maglia.enabled, title: testo(maglia.title), subtitle: testo(maglia.subtitle),
      revealDate: testo(maglia.revealDate), videoUrl: testo(maglia.videoUrl)
    }
  };
}

async function leggiTutto() {
  const [articles, partite, albums, categories, players, staff, sponsor, seasons, maglia, livelli, categorieArticoli, gironeDoc] = await Promise.all([
    leggiArticoli(),
    leggiRaccolta('partite'),
    leggiRaccolta('albums'),
    leggiRaccolta('categories'),
    leggiRaccolta('players'),
    leggiRaccolta('staff'),
    leggiDocumento('settings/sponsor'),
    leggiDocumento('settings/seasons'),
    leggiDocumento('settings/maglia'),
    leggiDocumento('settings/livelliSponsorSub'),
    leggiDocumento('settings/categorieArticoli'),
    leggiDocumento('siteData/girone')
  ]);
  /* Come js/girone.js: senza il documento vale il file del sito. */
  const g = gironeDoc && gironeDoc.json ? JSON.parse(gironeDoc.json) : require('../data/girone.json');
  return { articles, partite, albums, categories, players, staff, sponsor, seasons, maglia, livelli, categorieArticoli, girone: g };
}

/* ---------------- richiesta ---------------- */

let memoria = null;       /* { corpo, quando } */
let inCorso = null;       /* una sola rigenerazione alla volta */
let erroreDal = 0;

function azzera() { memoria = null; inCorso = null; erroreDal = 0; }

async function istantanea(adesso) {
  if (memoria && adesso - memoria.quando < CACHE_SECONDI * 1000) return memoria;
  if (adesso - erroreDal < ERRORE_SECONDI * 1000) throw new Error('errore recente: non ritento ancora');
  if (!inCorso) {
    inCorso = leggiTutto()
      .then((d) => (memoria = { corpo: componi(d, new Date(adesso)), quando: adesso }))
      .catch((e) => { erroreDal = adesso; throw e; })
      .finally(() => { inCorso = null; });
  }
  return inCorso;
}

function rispondi(res, stato, cache, corpo) {
  res.setHeader('Cache-Control', cache);
  return res.status(stato).json(corpo);
}

async function gestisci(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return rispondi(res, 405, 'no-store', { errore: 'Metodo non consentito.' });
  }
  /* Solo i parametri previsti: una query diversa a ogni richiesta aggirerebbe la cache e rileggerebbe Firestore.
     Si controlla PRIMA di leggere qualsiasi cosa. */
  const q = req.query || {};
  const articolo = q.articolo;
  if (q.app !== '1' || Object.keys(q).some((k) => k !== 'app' && k !== 'articolo') ||
      (articolo !== undefined && !(typeof articolo === 'string' && /^[1-9]\d{0,8}$/.test(articolo)))) {
    return rispondi(res, 400, 'no-store', { errore: 'Parametri non previsti.' });
  }

  try {
    if (articolo !== undefined) {
      const a = (await leggiArticoli(Number(articolo)))[0];
      if (!a) return rispondi(res, 404, 'public, s-maxage=60', { errore: 'Articolo non trovato.' });
      return rispondi(res, 200, 'public, s-maxage=3600, stale-while-revalidate=3600',
        Object.assign(baseArticolo(a), { content: testo(a.content) }));
    }
    const adesso = Date.now();
    const m = await istantanea(adesso);
    /* La CDN tiene la risposta solo per il tempo che resta: memoria e CDN non si sommano. */
    const resta = Math.max(60, CACHE_SECONDI - Math.floor((adesso - m.quando) / 1000));
    return rispondi(res, 200, `public, s-maxage=${resta}, stale-while-revalidate=${CACHE_SECONDI}`, m.corpo);
  } catch (e) {
    console.error('[app-pubblico]', e.message);
    return rispondi(res, 503, 'no-store', { errore: 'Dati non disponibili, riprova tra poco.' });
  }
}

module.exports = {
  gestisci, componi, azzera, CACHE_SECONDI, ERRORE_SECONDI,
  /* esportate per il confronto con js/data.js nei test */
  slugAlbum, chiaveSquadra, trovaSquadra, girone,
  predefiniti: { STAGIONI_PREDEFINITE, CATEGORIE_ARTICOLI_PREDEFINITE, MAGLIA_PREDEFINITA, LIVELLI_PREDEFINITI }
};
