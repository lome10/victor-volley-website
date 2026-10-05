#!/usr/bin/env node
/**
 * Cache-busting automatico:
 *   node scripts/stamp-versions.js           riscrive il ?v= di ogni JS/CSS locale citato dalle pagine HTML
 *   node scripts/stamp-versions.js --check   non scrive: fallisce se qualche ?v= non è aggiornato
 *
 * Il valore è l'hash (8 caratteri) del contenuto del file, con i fine riga normalizzati: cambia solo quando
 * cambia il file ed è uguale su Windows (CRLF), in CI e su Vercel (LF). Esclusi: js/vendor/, _vercel, URL esterni.
 * Dopo aver modificato un JS/CSS basta lanciare lo script (senza --check) e committare anche gli HTML toccati.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const cache = {};

function hashOf(rel) {
  if (!(rel in cache)) {
    const abs = path.join(root, rel);
    cache[rel] = fs.existsSync(abs)
      ? crypto.createHash('sha1').update(fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8)
      : null;
  }
  return cache[rel];
}

const ref = /(\b(?:src|href)=")([^"?#]+\.(?:js|css))(\?v=[^"]*)?(")/g;
const stale = [];
let changed = 0;

fs.readdirSync(root).filter((f) => f.endsWith('.html')).forEach((page) => {
  const abs = path.join(root, page);
  const before = fs.readFileSync(abs, 'utf8');
  const after = before.replace(ref, (all, pre, url, ver, post) => {
    if (/^(https?:)?\/\//.test(url) || url.includes('_vercel') || url.includes('vendor/')) return all;
    const h = hashOf(url.replace(/^\//, ''));
    if (!h) return all; // file mancante: lo segnala check-site.js
    const wanted = '?v=' + h;
    if (ver !== wanted) stale.push(page + ': ' + url + ' (' + (ver || 'senza versione') + ' → ' + wanted + ')');
    return pre + url + wanted + post;
  });
  if (after !== before && !checkOnly) { fs.writeFileSync(abs, after); changed++; }
});

if (checkOnly) {
  if (stale.length) {
    console.error('Versioni ?v= non aggiornate (lancia: node scripts/stamp-versions.js):');
    stale.forEach((s) => console.error('  - ' + s));
    process.exit(1);
  }
  console.log('OK: tutti i ?v= corrispondono al contenuto dei file.');
} else {
  console.log(changed ? 'Aggiornate ' + stale.length + ' versioni in ' + changed + ' pagine.' : 'Nessuna modifica: tutto già aggiornato.');
}
