#!/usr/bin/env node
/**
 * Controllo delle raccolte Firestore:  node scripts/check-collections.js
 *
 *   1. ogni raccolta usata dal codice (js/, api/) ha una regola in firestore.rules (senza regola Firestore
 *      risponde 403 e la funzione sembra «rotta» solo in produzione);
 *   2. ogni regola riguarda una raccolta davvero usata (le regole orfane allargano la superficie d'accesso
 *      senza motivo: è il caso della vecchia `matches`);
 *   3. ogni raccolta usata è inclusa in BACKUP_COLLECTIONS (js/admin.js), altrimenti il backup è incompleto.
 *
 * Eccezione al punto 3: SOLO_SERVER, raccolte che il browser non può leggere (regola `if false`) e che quindi
 * il backup, fatto dal browser di un dirigente, non può includere.
 *
 * Nomi cercati: collection('x'), _col('x'), le chiavi di `_ids` in js/db.js e BACKUP_COLLECTIONS.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const problems = [];
const SOLO_SERVER = new Set(['inviti']);

function walk(dir, out) {
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((e) => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') walk(rel, out); }
    else if (e.name.endsWith('.js')) out.push(rel);
  });
  return out;
}
const files = ['js', 'api'].reduce((acc, d) => (fs.existsSync(path.join(root, d)) ? walk(d, acc) : acc), []);

/* ---------- raccolte usate dal codice ---------- */
const used = new Map(); // nome → primo file in cui compare
const note = (name, file) => { if (!used.has(name)) used.set(name, file); };
files.forEach((f) => {
  const src = read(f);
  let m;
  const re = /\b(?:collection|_col)\(\s*(['"])([A-Za-z][A-Za-z0-9_]*)\1\s*\)/g;
  while ((m = re.exec(src))) note(m[2], f);
});
// chiavi di `_ids` in js/db.js: sono i nomi passati dinamicamente a _col(name)
const db = read('js/db.js');
const ids = db.match(/var\s+_ids\s*=\s*\{([\s\S]*?)\};/);
if (!ids) problems.push('Non trovo la definizione di `_ids` in js/db.js: aggiorna questo controllo.');
else (ids[1].match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:/gm) || []).forEach((k) => note(k.replace(/[\s:]/g, ''), 'js/db.js'));

/* ---------- regole ---------- */
const rules = read('firestore.rules');
const ruled = new Set();
let m;
const reRule = /^\s*match\s+\/([A-Za-z][A-Za-z0-9_]*)\/\{[^}]+\}/gm;
while ((m = reRule.exec(rules))) if (m[1] !== 'databases') ruled.add(m[1]); // `databases` è il match radice

used.forEach((file, name) => {
  if (!ruled.has(name)) problems.push('Raccolta «' + name + '» usata in ' + file + ' ma senza regola in firestore.rules (risponderebbe 403).');
});
ruled.forEach((name) => {
  if (!used.has(name)) problems.push('Regola per «' + name + '» in firestore.rules ma nessuna raccolta con questo nome nel codice: toglila o aggiorna il controllo.');
});

/* ---------- backup (solo avviso) ---------- */
const bk = read('js/admin.js').match(/BACKUP_COLLECTIONS\s*=\s*\[([\s\S]*?)\]/);
let missing = [];
if (!bk) problems.push('Non trovo BACKUP_COLLECTIONS in js/admin.js: aggiorna questo controllo.');
else {
  const inBackup = new Set((bk[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)));
  missing = [...used.keys()].filter((n) => !inBackup.has(n) && !SOLO_SERVER.has(n)).sort();
}

console.log('Raccolte usate: ' + used.size + ' · regole: ' + ruled.size);
if (missing.length) problems.push('Raccolte non incluse nel backup (BACKUP_COLLECTIONS in js/admin.js): ' + missing.join(', '));
if (problems.length) {
  console.error('\nPROBLEMI:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('OK: raccolte e regole coerenti.');
