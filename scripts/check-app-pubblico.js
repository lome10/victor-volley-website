#!/usr/bin/env node
/**
 * Collaudo dei dati per l'app:  node scripts/check-app-pubblico.js
 * Esegue api/sitemap.js (che smista /api/app-pubblico) con un Firestore finto: nessuna rete, nessun dato vero.
 * Ogni dato privato finto contiene la parola SEGRETO: nel JSON non deve comparire mai.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const radice = path.join(__dirname, '..');
const handler = require('../api/sitemap');
const L = require('../api/_app-pubblico-logic');

/* ---------- Firestore finto ---------- */
const campo = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(campo) } };
  return { mapValue: { fields: campi(v) } };
};
const campi = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, campo(v)]));
const CLOUD = 'https://res.cloudinary.com/x/image/upload/v1/';

const cat = (id, name, extra) => Object.assign({ id, name, abbr: 'X', color: '#000', description: '', schedule: '', active: true, showInSquadre: true, nota: 'SEGRETO-cat' }, extra);
const raccolte = {
  articles: [
    { id: 1, title: 'Vecchio', date: '2026-10-01', category: 'Società', excerpt: '', content: '<p>Testo del primo articolo.</p>', image: CLOUD + 'a.jpg', published: true, autore: 'SEGRETO-uid' },
    { id: 2, title: 'Nuovo', date: '2026-11-01', categories: ['Prima Divisione'], excerpt: 'Riassunto scritto', content: '<p>x</p>', image: 'data:image/png;base64,SEGRETO', published: true, heroOrder: 1, sponsor_ids: [10] },
    { id: 3, title: 'SEGRETO-bozza', date: '2026-11-02', content: 'SEGRETO-bozza', published: false }
  ],
  partite: [
    { id: 'm1', stagione: '2026/2027', categoria: 'Prima Divisione', squadra_casa: 'A.S.D. Victor Volley', squadra_ospite: 'Altra Squadra', logo_casa: '', logo_ospite: 'assets/altra.png', data: '2026-11-30', ora: '18:00', palazzetto: 'P', stato: 'conclusa', set_casa: '3', set_ospite: 0, spp_code: null, codice_tabellone: 'SEGRETO-tabellone' }
  ],
  albums: [
    { id: 1, title: 'Festa d’estate', date: '2026-07-01', category: 'Società', photos: [{ id: 'foto/1', name: 'SEGRETO-nomefile', w: 10, h: 20 }] },
    { id: 2, title: 'Vuoto SEGRETO-album', date: '2026-08-01', photos: [] }
  ],
  categories: [cat(3, 'Società', { showInSquadre: false }), cat(1, 'Prima Divisione'), cat(2, 'Spenta SEGRETO', { active: false })],
  players: [
    { id: 1, categoryId: 1, name: 'Giocatrice Finta', number: 7, role: 'Schiacciatore', gender: 'F', photo: CLOUD + 'g.jpg', stagione: '2026/2027', year: 'SEGRETO-anno', highlight: 'SEGRETO-hl' },
    { id: 2, categoryId: 2, name: 'SEGRETO-categoria-spenta' },
    { id: 3, categoryId: 3, name: 'SEGRETO-categoria-nascosta' }
  ],
  staff: [{ id: 1, categoryId: 1, name: 'Mister Finto', role: 'Allenatore', telefono: 'SEGRETO-tel' }, { id: 2, categoryId: 2, name: 'SEGRETO-staff' }]
};
const girone = { stagione: '2026/2027', squadre: [{ id: 'victor-volley', nome: 'Victor Volley', logo: 'assets/logo.png', home: true }], gironi: [{ categoria: 'Prima Divisione', girone: 'B', squadre: ['victor-volley'], partite: [{ id: 'g1', giornata: 1, squadra_casa: 'Victor Volley', squadra_ospite: 'Altra', set_casa: 3, set_ospite: 1, parziali: [[25, 20]], arbitro: 'SEGRETO-arbitro' }] }] };
const documenti = {
  'settings/sponsor': { items: [{ id: 10, nome: 'Sponsor', logo: CLOUD + 's.png', url: 'javascript:SEGRETO', order: 2, livello: 'gold', ripetizioni: 3, importo: 'SEGRETO-importo' }] },
  'settings/seasons': { items: [{ id: '2026/2027', name: '2026/2027', current: true }] },
  'settings/maglia': { enabled: true, title: 'Maglia', subtitle: '', revealDate: '' },
  'settings/livelliSponsorSub': { gold: 'Oro' },
  'siteData/girone': { json: JSON.stringify(girone), updatedBy: 'SEGRETO-uid' },
  'settings/asd': { cf: 'SEGRETO-asd' }
};

let letture = [];     // indirizzi chiesti (senza chiave)
let referer = [];
let rotto = '';       // pezzo di indirizzo che risponde 500
global.fetch = async (url, opt) => {
  const percorso = url.split('/documents')[1].split('?')[0];
  letture.push(percorso);
  referer.push(opt.headers.Referer);
  if (rotto && percorso.includes(rotto)) return { ok: false, status: 500, json: async () => ({}) };
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  if (percorso === ':runQuery') {
    const q = JSON.parse(opt.body).structuredQuery;
    const { field, value } = q.where.fieldFilter;
    const atteso = 'booleanValue' in value ? value.booleanValue : Number(value.integerValue);
    const trovati = raccolte.articles.filter((a) => a[field.fieldPath] === atteso);
    return ok(trovati.length ? trovati.map((a) => ({ document: { fields: campi(a) } })) : [{ readTime: 'x' }]);
  }
  const nome = percorso.slice(1);
  if (raccolte[nome]) return ok({ documents: raccolte[nome].map((d) => ({ fields: campi(d) })) });
  if (documenti[nome]) return ok({ fields: campi(documenti[nome]) });
  return { ok: false, status: 404, json: async () => ({}) };
};

async function chiedi(query, metodo) {
  const r = { code: 200, body: undefined, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  await handler({ method: metodo || 'GET', query, headers: {} }, r);
  return r;
}

let n = 0;
async function t(nome, fn) {
  L.azzera(); letture = []; referer = []; rotto = '';
  try { await fn(); n++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n  ')); process.exitCode = 1; }
}

const silenzia = console.error;

(async () => {
  await t('elenco: nessun dato privato, nessuna bozza, nessun allenamento', async () => {
    const r = await chiedi({ app: '1' });
    assert.strictEqual(r.code, 200);
    const s = JSON.stringify(r.body);
    assert.ok(!s.includes('SEGRETO'), 'dato privato nel JSON: ' + s.slice(s.indexOf('SEGRETO') - 80, s.indexOf('SEGRETO') + 40));
    assert.ok(!('content' in r.body.articoli[0]));
    assert.deepStrictEqual(Object.keys(r.body).sort(), ['album', 'articoli', 'categorie', 'categorieArticoli', 'generatoIl', 'giocatori', 'girone', 'livelliSponsor', 'maglia', 'partite', 'sponsor', 'staff', 'stagioni', 'versione']);
  });

  await t('letture: solo queste, una volta; mai settings/asd, mai un elenco di settings o siteData; Referer del sito', async () => {
    await chiedi({ app: '1' });
    assert.deepStrictEqual(letture.slice().sort(), ['/albums', '/categories', '/partite', '/players', '/settings/categorieArticoli', '/settings/livelliSponsorSub', '/settings/maglia', '/settings/seasons', '/settings/sponsor', '/siteData/girone', '/staff', ':runQuery']);
    assert.ok(referer.every((x) => x === 'https://www.victorvolley.it/'));
  });

  await t('stessi filtri e ritocchi del sito', async () => {
    const b = (await chiedi({ app: '1' })).body;
    assert.deepStrictEqual(b.articoli.map((a) => a.id), [2, 1]);
    assert.strictEqual(b.articoli[0].image, '');
    assert.strictEqual(b.articoli[1].riassunto, 'Testo del primo articolo.');
    assert.deepStrictEqual(b.articoli[1].categories, ['Società']);
    assert.deepStrictEqual(b.categorie.map((c) => c.id), [3, 1]);   /* ordine di Firestore, come il sito */
    assert.deepStrictEqual(b.giocatori.map((p) => [p.name, p.role]), [['Giocatrice Finta', 'Laterale']]);
    assert.deepStrictEqual(b.staff.map((p) => p.id), [1]);
    assert.deepStrictEqual(b.album.map((a) => [a.slug, a.photoCount]), [['festa-d-estate', 1]]);
    const p = b.partite[0];
    assert.deepStrictEqual([p.setCasa, p.setOspite, p.sppCode], [3, 0, null]);
    assert.strictEqual(p.logoCasa, 'https://www.victorvolley.it/assets/logo.png');
    assert.strictEqual(p.logoOspite, 'https://www.victorvolley.it/assets/altra.png');
    assert.strictEqual(b.sponsor[0].url, '');
    assert.deepStrictEqual(b.girone.gironi[0].partite[0].parziali, [[25, 20]]);
    assert.strictEqual(b.maglia.videoUrl, L.predefiniti.MAGLIA_PREDEFINITA.videoUrl);
    assert.strictEqual(b.livelliSponsor.gold, 'Oro');
    assert.strictEqual(b.livelliSponsor.silver, L.predefiniti.LIVELLI_PREDEFINITI.silver);
    assert.deepStrictEqual(b.categorieArticoli, L.predefiniti.CATEGORIE_ARTICOLI_PREDEFINITE);
  });

  await t('regole copiate uguali a js/data.js', async () => {
    const finestra = {};
    vm.runInNewContext(fs.readFileSync(path.join(radice, 'js/data.js'), 'utf8'), { window: finestra });
    const VV = finestra.VV;
    const album = [{ id: 1, title: 'Città & mare' }, { id: 2, title: 'Città e mare' }, { id: 3, title: '!!!' }, { id: 4, title: 'x', slug: 'scelto' }];
    VV._load('albums', album);
    album.forEach((a) => assert.strictEqual(L.slugAlbum(a, album), VV.getAlbumSlug(a)));
    const squadre = girone.squadre.concat({ id: 'volley-lecce', nome: 'A.S.D. Volley Lecce', logo: '' });
    VV.setSquadreGirone(squadre);
    ['Victor Volley Vita', 'ASD VOLLEY LECCE', 'volley  lecce s.r.l.', 'Sconosciuta', ''].forEach((nome) => {
      assert.strictEqual(L.chiaveSquadra(nome), VV.teamKey(nome));
      assert.strictEqual(L.trovaSquadra(squadre, nome), VV.findSquadraGirone(nome));
    });
    const uguali = (a, b) => assert.deepStrictEqual(a, JSON.parse(JSON.stringify(b)));
    uguali(L.predefiniti.STAGIONI_PREDEFINITE, VV.getSeasons.call(VV));
    uguali(L.predefiniti.CATEGORIE_ARTICOLI_PREDEFINITE, VV.getCategorieArticoli());
    uguali(L.predefiniti.MAGLIA_PREDEFINITA, VV.getMaglia());
    uguali(L.predefiniti.LIVELLI_PREDEFINITI, VV.getLivelliSponsorSub());
  });

  await t('cache: una sola rigenerazione per richieste insieme o ravvicinate', async () => {
    await Promise.all([chiedi({ app: '1' }), chiedi({ app: '1' })]);
    const r = await chiedi({ app: '1' });
    assert.strictEqual(letture.length, 12);
    assert.ok(/^public, s-maxage=(900|8\d\d), stale-while-revalidate=900$/.test(r.headers['Cache-Control']), r.headers['Cache-Control']);
  });

  await t('cache: memoria e CDN non si sommano; scaduta si rilegge', async () => {
    const vero = Date.now;
    try {
      let ora = vero();
      Date.now = () => ora;
      await chiedi({ app: '1' });
      ora += 600 * 1000;
      assert.strictEqual((await chiedi({ app: '1' })).headers['Cache-Control'], 'public, s-maxage=300, stale-while-revalidate=900');
      assert.strictEqual(letture.length, 12);
      ora += 301 * 1000;
      await chiedi({ app: '1' });
      assert.strictEqual(letture.length, 24);
    } finally { Date.now = vero; }
  });

  await t('parametri non previsti: 400 senza leggere nulla', async () => {
    for (const q of [{ app: '1', x: '1' }, { app: '2' }, { app: '1', articolo: 'abc' }, { app: '1', articolo: '007' }, { app: '1', articolo: ['1', '2'] }, { app: '1', articolo: '' }]) {
      const r = await chiedi(q);
      assert.strictEqual(r.code, 400, JSON.stringify(q));
      assert.strictEqual(r.headers['Cache-Control'], 'no-store');
    }
    assert.strictEqual((await chiedi({ app: '1' }, 'POST')).code, 405);
    assert.strictEqual(letture.length, 0);
  });

  await t('articolo: testo del solo pubblicato; bozza e inesistente = 404', async () => {
    const r = await chiedi({ app: '1', articolo: '1' });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.content, '<p>Testo del primo articolo.</p>');
    assert.ok(!JSON.stringify(r.body).includes('SEGRETO'));
    for (const id of ['3', '99']) {
      const no = await chiedi({ app: '1', articolo: id });
      assert.strictEqual(no.code, 404);
      assert.ok(!JSON.stringify(no.body).includes('SEGRETO'));
    }
    assert.strictEqual(letture.length, 3);
  });

  await t('Firestore rotto: 503, mai un JSON a metà, e per un minuto non si rilegge', async () => {
    console.error = () => {};
    try {
      rotto = '/players';
      const r = await chiedi({ app: '1' });
      assert.strictEqual(r.code, 503);
      assert.strictEqual(r.headers['Cache-Control'], 'no-store');
      assert.deepStrictEqual(Object.keys(r.body), ['errore']);
      const fatte = letture.length;
      rotto = '';
      assert.strictEqual((await chiedi({ app: '1' })).code, 503);
      assert.strictEqual(letture.length, fatte);
    } finally { console.error = silenzia; }
  });

  await t('sitemap invariata e vercel.json: rewrite giusta, funzioni ancora al massimo 12', async () => {
    const r = await chiedi({});
    assert.strictEqual(r.headers['Content-Type'], 'application/xml; charset=utf-8');
    const indirizzi = r.body.split('<loc>').slice(1).map((x) => x.split('</loc>')[0].replace('https://www.victorvolley.it', ''));
    assert.deepStrictEqual(indirizzi, ['/', '/news', '/squadre', '/calendario', '/galleria', '/sponsor', '/contatti', '/unisciti-a-noi', '/diretta', '/privacy',
      '/news-dettaglio?id=2', '/news-dettaglio?id=1', '/galleria/festa-d-estate']);
    assert.strictEqual(r.headers['Cache-Control'], 'public, s-maxage=3600, stale-while-revalidate=86400');
    assert.strictEqual((await chiedi({ x: '1' })).code, 400);
    const v = JSON.parse(fs.readFileSync(path.join(radice, 'vercel.json'), 'utf8'));
    assert.ok(v.rewrites.some((x) => x.source === '/api/app-pubblico' && x.destination === '/api/sitemap?app=1'));
    assert.ok(fs.readdirSync(path.join(radice, 'api')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).length <= 12);
  });

  if (!process.exitCode) console.log('check-app-pubblico: ' + n + ' controlli superati');
})();
