/**
 * Sitemap dinamica (funzione serverless Vercel), servita come /sitemap.xml
 * (vedi "rewrites" in vercel.json).
 *
 * Contiene le pagine fisse più gli articoli pubblicati e gli album con foto,
 * letti dalle raccolte pubbliche di Firestore con l'API REST (stessa chiave
 * pubblica già presente in js/firebase-config.js: le regole permettono la lettura).
 * Se Firestore non risponde, restano le pagine fisse e la cache è breve.
 */
const SITE = 'https://www.victorvolley.it';
const PROJECT = 'victor-volley';
const API_KEY = 'AIzaSyAEwljngFef_1WGZBdQ-SAqAvLwyXGxjmk';

const STATIC_PAGES = ['/', '/news', '/squadre', '/calendario', '/galleria', '/sponsor', '/contatti', '/unisciti-a-noi', '/diretta', '/privacy'];

/* Uguale a VV.slugify (js/data.js): gli URL degli album devono coincidere con quelli del sito. */
function slugify(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'album';
}

function value(f) {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).length;
  return undefined;
}

async function readCollection(name, fields) {
  const docs = [];
  let pageToken = '';
  for (let i = 0; i < 20; i++) {
    const qs = fields.map((f) => 'mask.fieldPaths=' + encodeURIComponent(f)).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${name}?pageSize=300&${qs}&key=${API_KEY}` +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(name + ': HTTP ' + res.status);
    const data = await res.json();
    (data.documents || []).forEach((d) => {
      const o = {};
      Object.keys(d.fields || {}).forEach((k) => { o[k] = value(d.fields[k]); });
      docs.push(o);
    });
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return docs;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const validDate = (d) => (/^\d{4}-\d{2}-\d{2}/.test(d || '') ? d.slice(0, 10) : '');

function entry(path, lastmod) {
  return '  <url><loc>' + esc(SITE + path) + '</loc>' + (lastmod ? '<lastmod>' + lastmod + '</lastmod>' : '') + '</url>';
}

module.exports = async (req, res) => {
  const urls = STATIC_PAGES.map((p) => entry(p));
  let complete = true;

  try {
    const articles = await readCollection('articles', ['id', 'date', 'published']);
    articles
      .filter((a) => a.published && a.id != null && !isNaN(+a.id))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((a) => urls.push(entry('/news-dettaglio?id=' + a.id, validDate(a.date))));
  } catch (e) { complete = false; console.error('[sitemap] articoli', e.message); }

  try {
    const albums = await readCollection('albums', ['id', 'title', 'slug', 'date', 'photos', 'photoCount']);
    const withPhotos = albums.filter((a) => (a.photoCount || a.photos || 0) > 0);
    /* Come VV.getAlbumSlug: slug esplicito, altrimenti titolo; in caso di doppione il più recente prende «-id». */
    const base = (a) => a.slug || slugify(a.title);
    withPhotos.forEach((a) => {
      const clash = albums.some((o) => o.id !== a.id && (o.slug ? o.slug === base(a) : (slugify(o.title) === base(a) && o.id < a.id)));
      const slug = a.slug ? a.slug : (clash ? base(a) + '-' + a.id : base(a));
      urls.push(entry('/galleria/' + encodeURIComponent(slug), validDate(a.date)));
    });
  } catch (e) { complete = false; console.error('[sitemap] album', e.message); }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', complete ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=60');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n');
};
