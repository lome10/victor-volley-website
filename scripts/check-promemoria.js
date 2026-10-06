#!/usr/bin/env node
/**
 * Collaudo della logica dei promemoria email:  node scripts/check-promemoria.js
 * Funzioni pure di api/_promemoria-logic.js con date finte: soglie (rate 7 e 1 giorno prima, 1/8/15/22 dopo;
 * certificato 30/7/0), tolleranza di un giorno, caselle finte, esclusioni, escape dell'HTML, fuso orario di Roma.
 * Non tocca Firestore né invia email.
 */
const assert = require('assert');
const L = require('../api/_promemoria-logic');

let passed = 0;
function t(nome, fn) {
  try { fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + e.message); process.exitCode = 1; }
}

const OGGI = '2026-10-15';
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const genitore = { uid: 'g1', email: 'mamma@example.com', ruolo: 'genitore', nome: 'Anna' };
const atleta = (extra) => Object.assign({ id: 'a1', nome: 'Luca', cognome: 'Rossi', accessi: [genitore] }, extra || {});
const rata = (g, extra) => Object.assign({ id: 'r1', atletaId: 'a1', importo: 150, note: '1ª rata', pagata: false, scadenza: addDays(OGGI, g) }, extra || {});
const chiavi = (p) => p.map((x) => x.chiave).sort();
const run = (atleti, rate) => L.costruisciPromemoria({ atleti, rate, oggi: OGGI });

/* ---- rate: giorni dalla scadenza → chiave attesa (null = nessun promemoria) ---- */
const attesiRata = { 8: null, 7: 'p7', 6: 'p7', 5: null, 4: null, 3: null, 2: null, 1: 'p1', 0: 'p1', '-1': 'd1', '-2': 'd1', '-3': null, '-7': null, '-8': 'd8', '-9': 'd8', '-10': null, '-15': 'd15', '-16': 'd15', '-22': 'd22', '-23': 'd22', '-24': null, '-40': null };
Object.keys(attesiRata).forEach((g) => t('rata a ' + g + ' giorni', () => {
  const p = run([atleta()], [rata(Number(g))]);
  if (attesiRata[g] === null) assert.deepStrictEqual(p, []);
  else assert.deepStrictEqual(chiavi(p), ['rata_r1_' + attesiRata[g]]);
}));

/* ---- certificato ---- */
const attesiCert = { 31: null, 30: 'p30', 29: 'p30', 28: null, 15: null, 8: null, 7: 'p7', 6: 'p7', 5: null, 1: null, 0: 'p0', '-1': 'p0', '-2': null, '-30': null };
Object.keys(attesiCert).forEach((g) => t('certificato a ' + g + ' giorni', () => {
  const sc = addDays(OGGI, Number(g));
  const p = run([atleta({ certMedicoScadenza: sc })], []);
  if (attesiCert[g] === null) assert.deepStrictEqual(p, []);
  else assert.deepStrictEqual(chiavi(p), ['cert_a1_' + sc + '_' + attesiCert[g]]);
}));

t('dopo un rinnovo la chiave del certificato cambia (i promemoria ripartono)', () => {
  const a = run([atleta({ certMedicoScadenza: addDays(OGGI, 7) })], [])[0].chiave;
  const b = L.costruisciPromemoria({ atleti: [atleta({ certMedicoScadenza: addDays(OGGI, 7) })], rate: [], oggi: OGGI })[0].chiave;
  const c = L.costruisciPromemoria({ atleti: [atleta({ certMedicoScadenza: addDays(OGGI, 372) })], rate: [], oggi: addDays(OGGI, 365) })[0].chiave;
  assert.strictEqual(a, b); assert.notStrictEqual(a, c);
});

/* ---- esclusioni ---- */
t('rata pagata ignorata', () => assert.deepStrictEqual(run([atleta()], [rata(7, { pagata: true })]), []));
t('rata senza scadenza o con data non valida ignorata', () => {
  assert.deepStrictEqual(run([atleta()], [rata(7, { scadenza: '' })]), []);
  assert.deepStrictEqual(run([atleta()], [rata(7, { scadenza: '12/10/2026' })]), []);
});
t('rata di un atleta inesistente ignorata', () => assert.deepStrictEqual(run([atleta({ id: 'zz' })], [rata(7)]), []));
t('email @victorvolley e non valide escluse', () => {
  const a = atleta({ accessi: [{ uid: 'x', email: 'luca@victorvolley.it' }, { uid: 'y', email: 'non-una-email' }, genitore] });
  const p = run([a], [rata(7)]);
  assert.deepStrictEqual(p[0].destinatari.map((d) => d.email), ['mamma@example.com']);
});
t('nessun destinatario reale → nessun promemoria', () => {
  assert.deepStrictEqual(run([atleta({ accessi: [{ uid: 'x', email: 'luca@victorvolley.it' }] })], [rata(7)]), []);
});
t('atleta senza accessi ma con email: riceve lui', () => {
  const p = run([atleta({ accessi: undefined, email: 'atleta@example.com' })], [rata(7)]);
  assert.deepStrictEqual(p[0].destinatari.map((d) => d.email), ['atleta@example.com']);
});
t('stessa email due volte → una sola', () => {
  const p = run([atleta({ accessi: [genitore, Object.assign({}, genitore, { uid: 'g2', email: 'MAMMA@example.com' })] })], [rata(7)]);
  assert.strictEqual(p[0].destinatari.length, 1);
});

/* ---- raggruppamento e opt-out ---- */
t('una sola email per genitore con più figli e più scadenze', () => {
  const atleti = [atleta(), atleta({ id: 'a2', nome: 'Giulia', certMedicoScadenza: addDays(OGGI, 7) })];
  const g = L.raggruppaPerDestinatario(run(atleti, [rata(7), rata(1, { id: 'r2', atletaId: 'a2' })]));
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0].voci.length, 3);
});
t('chi ha disattivato i promemoria è escluso', () => {
  const g = L.raggruppaPerDestinatario(run([atleta()], [rata(7)]), new Set(['g1']));
  assert.deepStrictEqual(g, []);
});

/* ---- email ---- */
t('il saluto usa il solo nome (anche due nomi); senza «prenome» resta il nome intero', () => {
  const con = run([atleta({ accessi: [Object.assign({}, genitore, { nome: 'Palamà Ilaria Ilenia', cognome: 'Palamà', prenome: 'Ilaria Ilenia' })] })], [rata(7)]);
  assert.strictEqual(con[0].destinatari[0].nome, 'Ilaria Ilenia');
  const vecchio = run([atleta()], [rata(7)]);
  assert.strictEqual(vecchio[0].destinatari[0].nome, 'Anna');
});
t('oggetto singolare e plurale', () => {
  const uno = L.componiEmail({ email: 'a@b.it', nome: '', voci: [{ testo: 'x', livello: 'orange' }] }, 'https://www.victorvolley.it');
  const due = L.componiEmail({ email: 'a@b.it', nome: '', voci: [{ testo: 'x', livello: 'orange' }, { testo: 'y', livello: 'red' }] }, 'https://www.victorvolley.it/');
  assert.ok(/1 scadenza$/.test(uno.subject)); assert.ok(/2 scadenze$/.test(due.subject));
  assert.ok(due.html.includes('https://www.victorvolley.it/atleta') && !due.html.includes('//atleta'));
});
t('HTML e apici dei nomi sono escapati nel corpo HTML', () => {
  const m = L.componiEmail({ email: 'a@b.it', nome: '<img src=x onerror=alert(1)>', voci: [{ testo: 'Quota «<b>x</b>» di O\'Neil', livello: 'red' }] }, 'https://www.victorvolley.it');
  assert.ok(!/<img src=x|<b>x<\/b>/.test(m.html));
  assert.ok(m.html.includes('&lt;b&gt;x&lt;/b&gt;') && m.html.includes('O&#39;Neil'));
});

/* ---- date ---- */
t('«oggi» è il giorno di calendario a Roma, non in UTC', () => {
  assert.strictEqual(L.oggiRoma(new Date('2026-10-04T23:30:00Z')), '2026-10-05');   // 01:30 a Roma (ora legale)
  assert.strictEqual(L.oggiRoma(new Date('2026-12-31T23:30:00Z')), '2027-01-01');   // 00:30 a Roma (ora solare)
  assert.strictEqual(L.oggiRoma(new Date('2026-10-05T10:00:00Z')), '2026-10-05');
});
t('differenza in giorni a cavallo del cambio ora', () => {
  assert.strictEqual(L.giorniTra('2026-10-24', '2026-10-26'), 2);   // 25 ottobre 2026: torna l'ora solare
  assert.strictEqual(L.giorniTra('2026-03-28', '2026-03-30'), 2);   // 29 marzo 2026: ora legale
});

if (process.exitCode) { console.error('\nCollaudo promemoria: PROBLEMI (vedi sopra).'); }
else { console.log('OK: ' + passed + ' verifiche sui promemoria (soglie, esclusioni, email, fuso orario).'); }
