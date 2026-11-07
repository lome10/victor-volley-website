/**
 * Pagina di un articolo con l'anteprima giusta per chi condivide (funzione serverless Vercel). Raggiunta solo dai
 * crawler dei social e dei motori di ricerca (rewrite con controllo dello User-Agent in vercel.json): gli utenti
 * normali restano sulla pagina statica news-articolo.html (rewrite su /news-dettaglio).
 *
 * GET /news-dettaglio?id=N  ->  /api/news-anteprima?id=N
 *
 * Legge UN articolo dalla raccolta pubblica "articles" di Firestore con l'API REST (stessa chiave pubblica di
 * js/firebase-config.js e di api/sitemap.js: le regole permettono la lettura) e restituisce la pagina con titolo,
 * descrizione, immagine e indirizzo veri. Se l'articolo non esiste, non è pubblicato o Firestore non risponde,
 * restituisce la pagina com'è (cache breve). Cache della CDN: 1 ora (poi si rilegge): al massimo circa una lettura
 * all'ora per articolo, qualunque sia il numero di condivisioni. Nessuna scrittura.
 */
const fs = require('fs');
const path = require('path');
const L = require('./_news-anteprima-logic');

const PROJECT = 'victor-volley';
const API_KEY = 'AIzaSyAEwljngFef_1WGZBdQ-SAqAvLwyXGxjmk';

function valore(f) {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  return undefined;
}

/** Un solo articolo per campo id (numerico). Restituisce l'oggetto o null. */
async function leggiArticolo(id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'articles' }],
        where: { fieldFilter: { field: { fieldPath: 'id' }, op: 'EQUAL', value: { integerValue: String(id) } } },
        limit: 1
      }
    })
  });
  if (!res.ok) throw new Error('articles: HTTP ' + res.status);
  const righe = await res.json();
  const doc = Array.isArray(righe) && righe[0] && righe[0].document;
  if (!doc || !doc.fields) return null;
  const o = {};
  ['id', 'title', 'excerpt', 'content', 'image', 'published'].forEach((k) => { o[k] = valore(doc.fields[k]); });
  return o;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Metodo non consentito.');
  }
  const pagina = fs.readFileSync(path.join(__dirname, '..', 'news-articolo.html'), 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const id = L.idDaQuery(req.query && req.query.id);
  let html = pagina, cache = 'public, s-maxage=60, stale-while-revalidate=300';
  if (id) {
    try {
      const a = await leggiArticolo(id);
      if (a && a.published === true) {
        html = L.inietta(pagina, a);
        cache = 'public, s-maxage=3600, stale-while-revalidate=86400';
      }
    } catch (e) { console.error('[news-anteprima]', e.message); }
  }
  res.setHeader('Cache-Control', cache);
  return res.status(200).send(req.method === 'HEAD' ? '' : html);
};
