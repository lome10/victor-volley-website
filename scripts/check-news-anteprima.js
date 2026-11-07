#!/usr/bin/env node
/**
 * Collaudo dell'anteprima di condivisione delle news:  node scripts/check-news-anteprima.js
 * Esegue api/news-anteprima.js con Firestore finto (nessuna rete, nessun dato vero). Verifica: titolo, descrizione,
 * immagine e indirizzo dell'articolo nella pagina; testo speciale escapato (nessun codice che passa); immagine
 * base64 ignorata; Cloudinary 1200 px in JPEG; articolo non pubblicato / inesistente / id non valido / errore di
 * Firestore = pagina com'e' (senza leggere nulla quando l'id non e' valido); un solo tag per ogni metadato;
 * regola di vercel.json solo per i crawler e file incluso nella funzione.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const radice = path.join(__dirname, '..');
const pagina = fs.readFileSync(path.join(radice, 'news-dettaglio.html'), 'utf8');

let articoli = [];       // finti, come li restituisce Firestore
let chiamate = [];
let firestoreRotto = false;
const campo = (v) => (typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { integerValue: String(v) });
global.fetch = async (url, opt) => {
  chiamate.push({ url, body: JSON.parse(opt.body) });
  if (firestoreRotto) return { ok: false, status: 500, json: async () => ({}) };
  const idCercato = Number(chiamate[chiamate.length - 1].body.structuredQuery.where.fieldFilter.value.integerValue);
  const a = articoli.find((x) => x.id === idCercato);
  return { ok: true, status: 200, json: async () => (a ? [{ document: { fields: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, campo(v)])) } }] : [{ readTime: 'x' }]) };
};

const handler = require('../api/news-anteprima');
const L = require('../api/_news-anteprima-logic');

const res = () => { const r = { code: 200, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.send = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const chiedi = async (id, metodo) => { const r = res(); chiamate = []; await handler({ method: metodo || 'GET', query: { id }, headers: {} }, r); return r; };
const conta = (h, re) => (h.match(re) || []).length;

let n = 0;
async function t(nome, fn) {
  try { await fn(); n++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; }
}

(async () => {
  articoli = [
    { id: 7, title: 'La Prima Divisione vince 3-0 a Taviano', excerpt: 'Una gara perfetta, tre set netti.', content: '<p>Testo lungo</p>', image: 'https://res.cloudinary.com/plbxnqlc/image/upload/v123/foto.jpg', published: true },
    { id: 8, title: 'Bozza non pubblicata', excerpt: 'x', image: '', published: false },
    { id: 9, title: 'Titolo "strano" <b>&</b> \'apici\'', excerpt: '', content: '<h2>Sottotitolo</h2><p>Primo paragrafo con <a href="x">un link</a> e &amp; altro.</p><script>alert(1)</script>', image: 'data:image/png;base64,AAAA', published: true },
    { id: 10, title: '"><script>alert(1)</script>', excerpt: '"><img src=x onerror=alert(1)>', image: 'https://esempio.it/a.jpg" onerror="alert(1)', published: true }
  ];

  await t('articolo pubblicato: titolo, descrizione, immagine Cloudinary 1200 JPEG, indirizzo, tipo articolo', async () => {
    const r = await chiedi('7');
    assert.strictEqual(r.code, 200);
    assert.ok(r.body.includes('<title>La Prima Divisione vince 3-0 a Taviano — Victor Volley</title>'));
    assert.ok(r.body.includes('<meta property="og:title" content="La Prima Divisione vince 3-0 a Taviano — Victor Volley">'));
    assert.ok(r.body.includes('<meta property="og:description" content="Una gara perfetta, tre set netti.">'));
    assert.ok(r.body.includes('<meta name="description" content="Una gara perfetta, tre set netti.">'));
    assert.ok(r.body.includes('<meta property="og:image" content="https://res.cloudinary.com/plbxnqlc/image/upload/f_jpg,q_auto,c_limit,w_1200/v123/foto.jpg">'));
    assert.ok(!/og:image:width|og:image:height/.test(r.body));
    assert.ok(r.body.includes('<meta property="og:url" content="https://www.victorvolley.it/news-dettaglio?id=7">'));
    assert.ok(r.body.includes('<link rel="canonical" href="https://www.victorvolley.it/news-dettaglio?id=7">'));
    assert.ok(r.body.includes('<meta property="og:type" content="article">'));
    assert.ok(!r.body.includes('Articolo — Victor Volley'));
  });
  await t('un solo tag per ogni metadato (nessun doppione)', async () => {
    const h = (await chiedi('7')).body;
    for (const re of [/<title>/g, /og:title"/g, /og:description"/g, /name="description"/g, /og:image"/g, /og:url"/g, /rel="canonical"/g, /og:type"/g]) assert.strictEqual(conta(h, re), 1, String(re));
  });
  await t('la query a Firestore: una sola, raccolta articles, campo id, limite 1', async () => {
    await chiedi('7');
    assert.strictEqual(chiamate.length, 1);
    const q = chiamate[0].body.structuredQuery;
    assert.strictEqual(q.from[0].collectionId, 'articles'); assert.strictEqual(q.limit, 1);
    assert.strictEqual(q.where.fieldFilter.value.integerValue, '7');
  });
  await t('titolo con virgolette, apici e tag: escapato; senza excerpt la descrizione viene dal testo, senza script', async () => {
    const h = (await chiedi('9')).body;
    assert.ok(h.includes('content="Titolo &quot;strano&quot; &lt;b&gt;&amp;&lt;/b&gt; &#39;apici&#39; — Victor Volley"'));
    assert.ok(h.includes('<meta name="description" content="Sottotitolo Primo paragrafo con un link e &amp; altro.">'));
    assert.ok(!h.includes('alert(1)') || h.indexOf('alert(1)') === -1);
  });
  await t('immagine base64 ignorata: resta l\'immagine del sito con le sue misure', async () => {
    const h = (await chiedi('9')).body;
    assert.ok(h.includes('https://www.victorvolley.it/assets/og-image.jpg'));
    assert.ok(/og:image:width/.test(h));
    assert.ok(!h.includes('base64'));
  });
  await t('attacco nei campi: nessun tag o attributo che passa', async () => {
    const h = (await chiedi('10')).body;
    assert.ok(!h.includes('<script>alert(1)'));
    assert.ok(!/<img src=x/.test(h));
    assert.ok(!/content="[^"]*" onerror=/.test(h));
    assert.ok(!/onerror="alert/.test(h.split('<body')[0]));
  });
  await t('articolo non pubblicato: pagina com\'e\'', async () => { assert.strictEqual((await chiedi('8')).body, pagina); });
  await t('articolo inesistente: pagina com\'e\'', async () => { assert.strictEqual((await chiedi('999')).body, pagina); });
  await t('id non valido: pagina com\'e\' e nessuna lettura', async () => {
    for (const id of ['abc', '', '1;DROP', '-5', '0', '1234567890', undefined, ['7', '8']]) {
      const r = await chiedi(id);
      if (Array.isArray(id)) { assert.ok(r.body.includes('Prima Divisione vince')); continue; }
      assert.strictEqual(r.body, pagina, String(id)); assert.strictEqual(chiamate.length, 0, String(id));
    }
  });
  await t('errore di Firestore: pagina com\'e\', cache breve, nessun crash', async () => {
    firestoreRotto = true; const r = await chiedi('7'); firestoreRotto = false;
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body, pagina); assert.ok(/s-maxage=60/.test(r.headers['Cache-Control']));
  });
  await t('cache: 1 ora per l\'articolo vero (con rivalidazione), breve per il resto', async () => {
    assert.ok(/s-maxage=3600/.test((await chiedi('7')).headers['Cache-Control']));
    assert.ok(/s-maxage=60/.test((await chiedi('8')).headers['Cache-Control']));
    assert.strictEqual((await chiedi('7')).headers['Content-Type'], 'text/html; charset=utf-8');
  });
  await t('HEAD senza corpo; POST rifiutato (405)', async () => {
    assert.strictEqual((await chiedi('7', 'HEAD')).body, '');
    const r = await chiedi('7', 'POST'); assert.strictEqual(r.code, 405);
  });
  await t('descrizione lunga tagliata a parola intera con puntini; immagine non https scartata', () => {
    const d = L.descrizione({ excerpt: '', content: '<p>' + 'parola '.repeat(60) + '</p>' });
    assert.ok(d.length <= 156 && d.endsWith('…') && !/\sparol…$/.test(d));
    assert.strictEqual(L.immagineSocial('http://x.it/a.jpg'), ''); assert.strictEqual(L.immagineSocial('javascript:alert(1)'), '');
  });

  const v = JSON.parse(fs.readFileSync(path.join(radice, 'vercel.json'), 'utf8'));
  await t('vercel.json: rewrite solo con User-Agent dei crawler; pagina inclusa nella funzione', () => {
    const rw = v.rewrites.find((r) => r.source === '/news-dettaglio');
    assert.ok(rw && rw.destination === '/api/news-anteprima' && rw.has && rw.has[0].key === 'user-agent');
    const re = new RegExp(rw.has[0].value);
    for (const ua of ['WhatsApp/2.23.20.0 A', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'TelegramBot (like TwitterBot)', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'Slackbot-LinkExpanding 1.0', 'Twitterbot/1.0', 'LinkedInBot/1.0', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)']) assert.ok(re.test(ua), ua);
    for (const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36', '']) assert.ok(!re.test(ua), ua);
    assert.ok(/news-dettaglio\.html/.test(v.functions['api/news-anteprima.js'].includeFiles));
  });

  if (!process.exitCode) console.log('OK: ' + n + ' verifiche sull\'anteprima di condivisione delle news.');
})();
