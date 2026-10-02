#!/usr/bin/env node
/**
 * Controllo statico della Content-Security-Policy:  node scripts/check-csp.js
 *
 * Le pagine pubbliche hanno una policy rigorosa (script-src 'self' + hash dello splash, niente gestori
 * inline). Questo controllo segnala ciò che la farebbe scattare in produzione:
 *   1. script inline eseguibili nelle pagine HTML (ammesso solo l'anti-flash dello splash, di cui
 *      vercel.json contiene l'hash; i blocchi JSON-LD non sono codice);
 *   2. attributi inline onclick=/onerror=/onmouseover=... nelle pagine pubbliche e nel JS che esse caricano
 *      (admin.html e js/admin* sono esclusi: la loro policy ammette i gestori inline con script-src-attr);
 *   3. eval()/new Function() nel JS del sito;
 *   4. che vercel.json abbia una policy per le pagine pubbliche e una per /admin, e che l'hash dello
 *      splash coincida con quello dello script nelle pagine.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const problems = [];

const vercel = JSON.parse(read('vercel.json'));
const policyOf = (source) => {
  const rule = vercel.headers.find((h) => h.source === source);
  const hd = rule && rule.headers.find((x) => /^Content-Security-Policy/.test(x.key));
  return hd ? hd.value : null;
};
const publicPolicy = policyOf('/((?!admin).*)');
const adminPolicy = policyOf('/admin/:path*');
if (!publicPolicy) problems.push('vercel.json: manca la CSP per le pagine pubbliche (source "/((?!admin).*)")');
if (!adminPolicy) problems.push('vercel.json: manca la CSP per /admin (source "/admin/:path*")');
if (publicPolicy && /script-src[^;]*'unsafe-inline'/.test(publicPolicy)) problems.push("vercel.json: la policy pubblica non deve ammettere 'unsafe-inline' per gli script");
if (publicPolicy && /script-src-attr/.test(publicPolicy)) problems.push('vercel.json: la policy pubblica non deve avere script-src-attr (niente gestori inline)');
if (adminPolicy && !/script-src-attr 'unsafe-inline'/.test(adminPolicy)) problems.push("vercel.json: la policy admin deve avere script-src-attr 'unsafe-inline' (i pulsanti usano onclick generati dal codice)");

const hashesInPolicy = new Set([...(publicPolicy || '').matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]));
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html') && f !== 'admin.html');
let inlineOk = 0;

for (const f of pages) {
  const html = read(f);
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\ssrc=/.test(m[1]) || /ld\+json|application\/json/.test(m[1])) continue;
    const h = 'sha256-' + crypto.createHash('sha256').update(m[2]).digest('base64');
    if (hashesInPolicy.has(h)) { inlineOk++; continue; }
    problems.push(f + ': script inline non ammesso dalla CSP (' + m[2].trim().slice(0, 50).replace(/\s+/g, ' ') + '…). Spostarlo in js/pages/ oppure aggiornare l\'hash in vercel.json');
  }
  for (const m of html.matchAll(/\son(?:click|change|error|load|mouse\w+|key\w+|input|submit|focus|blur)\s*=/gi)) {
    problems.push(f + ': attributo inline ' + m[0].trim() + ' (la CSP pubblica lo blocca): usare addEventListener o i gestori delegati di js/main.js');
  }
}

/* JS caricato dalle pagine pubbliche (tutto js/ tranne admin*, vendor) */
const publicJs = fs.readdirSync(path.join(root, 'js'), { recursive: true }).map(String)
  .map((f) => f.replace(/\\/g, '/'))
  .filter((f) => f.endsWith('.js') && !f.startsWith('vendor/') && !f.startsWith('admin/') && f !== 'admin.js');
for (const f of publicJs) {
  const code = read('js/' + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of code.matchAll(/\bon(?:click|change|error|load|mouseover|mouseout|keydown|keyup|submit)=\\?["']/g)) {
    problems.push('js/' + f + ': attributo inline generato dal codice (' + m[0] + '): la CSP pubblica lo blocca');
  }
  if (/(?<![\w$.])eval\s*\(|new\s+Function\s*\(/.test(code)) problems.push('js/' + f + ': eval/new Function non ammessi dalla CSP');
}

console.log('  · ' + pages.length + ' pagine pubbliche controllate, ' + inlineOk + ' script inline coperti da hash, ' + publicJs.length + ' file JS pubblici');
if (problems.length) { console.log('\n' + problems.length + ' problema/i:'); problems.forEach((p) => console.log(' ✗ ' + p)); process.exit(1); }
console.log('\nOK: nessun elemento che la CSP pubblica bloccherebbe.');
