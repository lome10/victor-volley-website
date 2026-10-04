#!/usr/bin/env node
/**
 * Controllo statico generale del sito:  node scripts/check-site.js
 *
 *   1. sintassi di ogni file JS (js/, api/, scripts/; esclusi vendor e node_modules);
 *   2. JSON validi: vercel.json, manifest, package.json, data/*.json e i blocchi JSON-LD delle pagine;
 *   3. ogni file locale citato da src/href delle pagine HTML esiste (con le «clean URL» di Vercel:
 *      /news → news.html) e i percorsi del manifest e di vercel.json (rewrite verso /api/...) esistono.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const problems = [];
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const fail = (msg) => problems.push(msg);

/* ---------- 1. sintassi JS ---------- */
function walk(dir, out) {
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((e) => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') walk(rel, out); }
    else if (e.name.endsWith('.js')) out.push(rel);
  });
  return out;
}
const jsFiles = ['js', 'api', 'scripts'].reduce((acc, d) => exists(d) ? walk(d, acc) : acc, []);
jsFiles.forEach((f) => {
  try { execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); }
  catch (e) { fail('Errore di sintassi in ' + f + ': ' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')); }
});

/* ---------- 2. JSON ---------- */
function checkJson(rel) {
  try { return JSON.parse(read(rel)); } catch (e) { fail('JSON non valido: ' + rel + ' (' + e.message + ')'); return null; }
}
['vercel.json', 'manifest.webmanifest', 'package.json'].forEach((f) => { if (exists(f)) checkJson(f); });
if (exists('data')) fs.readdirSync(path.join(root, 'data')).filter((f) => f.endsWith('.json')).forEach((f) => checkJson('data/' + f));

const htmlFiles = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
htmlFiles.forEach((f) => {
  const html = read(f);
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) { try { JSON.parse(m[1]); } catch (e) { fail('JSON-LD non valido in ' + f + ' (' + e.message + ')'); } }
});

/* ---------- 3. riferimenti locali ---------- */
function resolves(ref, fromHtml) {
  let p = ref.split('#')[0].split('?')[0];
  if (!p) return true;
  if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(p)) return true;
  p = decodeURIComponent(p);
  const rel = p.startsWith('/') ? p.slice(1) : p;
  if (rel === '') return true;
  if (exists(rel) && fs.statSync(path.join(root, rel)).isFile()) return true;
  if (exists(rel + '.html')) return true;                                 /* clean URL */
  if (/^galleria\//.test(rel) || /^admin(\/|$)/.test(rel)) return true;   /* rewrite di vercel.json */
  if (/^api\//.test(rel) && exists(rel + '.js')) return true;
  if (/^_vercel\//.test(rel)) return true;                                /* script di Vercel Insights */
  return false;
}
htmlFiles.forEach((f) => {
  const html = read(f).replace(/<!--[\s\S]*?-->/g, '');
  const re = /\s(?:src|href)="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (!resolves(m[1], f)) fail(f + ': file non trovato → ' + m[1]);
  }
});
const manifest = exists('manifest.webmanifest') ? checkJson('manifest.webmanifest') : null;
if (manifest) {
  (manifest.icons || []).forEach((i) => { if (!resolves(i.src)) fail('manifest: icona non trovata → ' + i.src); });
  (manifest.shortcuts || []).forEach((s) => { if (!resolves(s.url)) fail('manifest: scorciatoia non valida → ' + s.url); });
}
const vercel = exists('vercel.json') ? checkJson('vercel.json') : null;
if (vercel) {
  (vercel.rewrites || []).forEach((r) => {
    if (/^\/api\//.test(r.destination) && !exists(r.destination.slice(1) + '.js')) fail('vercel.json: manca la funzione ' + r.destination);
  });
}

console.log('Controllati: ' + jsFiles.length + ' file JS, ' + htmlFiles.length + ' pagine HTML.');
if (problems.length) {
  console.log('\n' + problems.length + ' problema/i:');
  problems.forEach((p) => console.log(' ✗ ' + p));
  process.exit(1);
}
console.log('OK: sintassi, JSON e riferimenti locali a posto.');
