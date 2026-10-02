#!/usr/bin/env node
/**
 * Controllo statico su esc() (escape HTML): una sola definizione, in js/esc.js.
 * Da lanciare dopo aver toccato pagine HTML o file JS:  node scripts/check-esc.js
 *
 * Verifica che:
 *   1. non esistano altre definizioni di esc() (function esc / var esc = function ...) oltre a js/esc.js;
 *   2. ogni pagina HTML che usa esc() (nel proprio codice o nei JS che carica) carichi js/esc.js;
 *   3. js/esc.js sia caricato PRIMA degli script di js/ che usano esc().
 *
 * Le variabili locali che rinominano esc (es. "var esc = A.esc" nei file di js/admin/) sono ammesse:
 * puntano alla funzione condivisa. _esc() di js/atleta.js è un'altra funzione (non tratta 0/null come vuoto).
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const problems = [];

const jsFiles = fs.readdirSync(path.join(root, 'js'), { recursive: true })
  .map(String).filter((f) => f.endsWith('.js') && !f.includes('vendor')).map((f) => 'js/' + f.replace(/\\/g, '/'));
const htmlFiles = fs.readdirSync(root).filter((f) => f.endsWith('.html'));

/* 1. definizioni duplicate */
const DEF = /(?:^|[^\w$.])function\s+esc\s*\(|(?:^|[^\w$.])(?:var|let|const)\s+esc\s*=\s*function/m;
for (const f of jsFiles.concat(htmlFiles)) {
  if (f === 'js/esc.js') continue;
  if (DEF.test(read(f))) problems.push('Definizione locale di esc() in ' + f + ': usare js/esc.js');
}
if (!/function esc\s*\(/.test(read('js/esc.js'))) problems.push('js/esc.js non definisce esc()');

/* 2-3. pagine che usano esc() */
const USES = /(?<![\w$.])esc\s*\(/;
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
let checked = 0;
for (const f of htmlFiles) {
  const html = read(f);
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1].replace(/\?.*$/, '').replace(/^\//, ''));
  const loaded = srcs.filter((s) => s.startsWith('js/') && !s.includes('vendor') && fs.existsSync(path.join(root, s)));
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const uses = USES.test(stripComments(inline)) || loaded.some((s) => s !== 'js/esc.js' && USES.test(stripComments(read(s))));
  if (!uses) continue;
  checked++;
  const iEsc = srcs.indexOf('js/esc.js');
  if (iEsc < 0) { problems.push(f + ' usa esc() ma non carica js/esc.js'); continue; }
  for (const s of loaded) {
    if (s !== 'js/esc.js' && USES.test(stripComments(read(s))) && srcs.indexOf(s) < iEsc) problems.push(f + ': js/esc.js va caricato prima di ' + s);
  }
}

console.log('  · ' + checked + ' pagine che usano esc() controllate');
if (problems.length) { console.log('\n' + problems.length + ' problema/i:'); problems.forEach((p) => console.log(' ✗ ' + p)); process.exit(1); }
console.log('\nOK: esc() ha un\'unica definizione e tutte le pagine la caricano.');
