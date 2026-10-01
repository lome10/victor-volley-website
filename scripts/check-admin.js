#!/usr/bin/env node
/**
 * Controllo statico del pannello admin (nessuna dipendenza, nessun browser, nessun login).
 * Da lanciare prima e dopo ogni modifica grossa a js/admin.js:  node scripts/check-admin.js
 *
 * Verifica che:
 *   1. js/admin.js e gli altri JS abbiano sintassi valida;
 *   2. ogni handler inline (onclick="AdminActions.x()" / "DG.x()") punti a una funzione definita;
 *   3. ogni voce di menu (data-section) abbia la sezione HTML, il titolo e il ramo in goTo();
 *   4. ogni id usato con document.getElementById in admin.js esista in admin.html
 *      (o sia creato dinamicamente nello stesso file).
 *
 * Non sostituisce la checklist manuale (docs/SMOKE_TEST_ADMIN.md): non vede i dati reali.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('admin.html');
const adminFiles = ['js/admin.js'].concat(
  fs.existsSync(path.join(root, 'js/admin'))
    ? fs.readdirSync(path.join(root, 'js/admin'), { recursive: true })
        .filter((f) => String(f).endsWith('.js')).map((f) => 'js/admin/' + f)
    : []
);
const js = adminFiles.map(read).join('\n');

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);

/* 1. sintassi ------------------------------------------------------------ */
fs.readdirSync(path.join(root, 'js'), { recursive: true })
  .filter((f) => String(f).endsWith('.js') && !String(f).includes('vendor'))
  .forEach((f) => {
    try { execFileSync(process.execPath, ['--check', path.join(root, 'js', String(f))], { stdio: 'pipe' }); }
    catch (e) { fail('Sintassi non valida: js/' + f + '\n' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n')); }
  });

/* 2. handler inline ------------------------------------------------------- */
const defined = { AdminActions: new Set(), DG: new Set() };
const addDef = (ns, name) => { defined[ns].add(name); if (ns === 'DG') defined.AdminActions.add(name); else defined.DG.add(name); };

/* DG e AdminActions sono lo stesso oggetto (var DG = window.AdminActions) */
for (const m of js.matchAll(/(?:window\.)?(AdminActions|DG)\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) addDef(m[1], m[2]);

const lit = js.indexOf('window.AdminActions = {');
if (lit < 0) fail('Non trovo il letterale "window.AdminActions = {" in admin.js');
else {
  const end = js.indexOf('\n  };', lit);
  js.slice(lit, end).split('\n').forEach((line) => {
    const k = /^    ([A-Za-z_$][\w$]*)\s*:/.exec(line);
    if (k) addDef('AdminActions', k[1]);
  });
}
const usages = new Map();
/* i commenti a blocco di JS vengono svuotati (stesse righe) per non contare gli esempi nei commenti */
const blank = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
for (const [file, text] of [['admin.html', html]].concat(adminFiles.map((f) => [f, blank(read(f))]))) {
  text.split('\n').forEach((line, i) => {
    if (!/\bon(click|change|input|submit|keyup|keydown|blur|focus)\s*=/.test(line)) return;
    for (const m of line.matchAll(/\b(AdminActions|DG)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      const key = m[1] + '.' + m[2];
      if (!usages.has(key)) usages.set(key, file + ':' + (i + 1));
    }
  });
}
for (const [key, where] of usages) {
  const [ns, name] = key.split('.');
  if (!defined[ns].has(name)) fail('Handler inline senza funzione: ' + key + '()  (usato in ' + where + ')');
}
notes.push(usages.size + ' handler inline distinti controllati, ' + defined.AdminActions.size + ' funzioni esposte');

/* 3. menu e sezioni --------------------------------------------------------- */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sections = [...html.matchAll(/data-section="(\w+)"/g)].map((m) => m[1]);
const sectionsObj = /var SECTIONS = \{([\s\S]*?)\};/.exec(js);
const goTo = /function goTo\(section\) \{([\s\S]*?)\n  \}\n/.exec(js);
sections.forEach((s) => {
  if (!new RegExp('id="section' + cap(s) + '"').test(html)) fail('Menu "' + s + '": manca <section id="section' + cap(s) + '">');
  if (!sectionsObj || !new RegExp('\\b' + s + '\\s*:').test(sectionsObj[1])) fail('Menu "' + s + '": manca in SECTIONS (titolo)');
  if (s !== 'dashboard' && goTo && !goTo[1].includes("section === '" + s + "'")) fail('Menu "' + s + '": nessun ramo in goTo()');
});
notes.push(sections.length + ' voci di menu controllate');

/* 4. id usati da getElementById ---------------------------------------------- */
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const dynamicIds = new Set([...js.matchAll(/\bid="([^"]+)"/g), ...js.matchAll(/\.id\s*=\s*'([^']+)'/g)].map((m) => m[1]));
const missing = new Map();
for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) {
  if (!htmlIds.has(m[1]) && !dynamicIds.has(m[1])) missing.set(m[1], (missing.get(m[1]) || 0) + 1);
}
for (const [id, n] of missing) fail('getElementById("' + id + '") ×' + n + ': id assente da admin.html e non creato nel JS');
notes.push(new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1])).size + ' id distinti controllati');

/* esito ------------------------------------------------------------------------ */
notes.forEach((n) => console.log('  · ' + n));
if (problems.length) {
  console.log('\n' + problems.length + ' problema/i:');
  problems.forEach((p) => console.log(' ✗ ' + p));
  process.exit(1);
}
console.log('\nOK: nessun problema trovato.');
