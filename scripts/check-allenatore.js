#!/usr/bin/env node
/**
 * Collaudo dell'Area Allenatore:  node scripts/check-allenatore.js
 * Esegue api/allenatore-atleti.js con Firestore e Firebase Auth finti (in memoria): non tocca nulla di reale.
 * Verifica: l'allenatore vede SOLO gli atleti delle sue categorie e SOLO cognome, nome, data di nascita e telefono dei
 * genitori (mai codice fiscale, indirizzo, note mediche, email); rifiuta chi non è allenatore (dirigenti compresi),
 * l'accesso senza categorie o disattivato, i metodi diversi da GET, le altre origini e i token non validi.
 * Controlla anche che le regole di Firestore sulla raccolta `allenatori` siano chiuse.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* ---------- Firestore e Auth finti ---------- */
const store = {};
const col = (n) => (store[n] = store[n] || {});
const docRef = (n, id) => ({ id, get: async () => ({ exists: id in col(n), id, data: () => col(n)[id] }) });
const firestore = {
  collection: (n) => ({
    doc: (id) => docRef(n, id),
    where: (c, op, v) => ({
      get: async () => ({ docs: Object.keys(col(n)).filter((id) => op === 'in' && v.length <= 30 && v.includes(col(n)[id][c])).map((id) => ({ id, data: () => col(n)[id] })) })
    })
  }),
  getAll: async (...refs) => Promise.all(refs.map((r) => r.get()))
};
let utenti = {};
const app = { firestore: () => firestore, auth: () => ({ verifyIdToken: async (t) => { if (!utenti[t]) throw new Error('token'); return { uid: utenti[t] }; } }) };
require.cache[require.resolve(path.join('..', 'api', '_firebase.js'))] = {
  id: 'fb', filename: 'fb', loaded: true,
  exports: { getApp: () => app, stessaOrigine: (r) => !r.headers.origin || new URL(r.headers.origin).host === r.headers.host, safeJson: () => ({}) }
};

const handler = require('../api/allenatore-atleti');
const L = require('../api/_allenatore-logic');

const res = () => { const r = { code: 200, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const chiama = async (tok, extra, method) => { const r = res(); await handler({ method: method || 'GET', headers: { host: 'www.victorvolley.it', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(extra || {}) } }, r); return r; };

let n = 0;
async function t(nome, fn) { try { await fn(); n++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

(async () => {
  utenti = { 'tok-ren': 'ren', 'tok-dir': 'dir1', 'tok-gen': 'gen1', 'tok-vuoto': 'vuoto', 'tok-off': 'off', 'tok-sa': 'sa' };
  col('allenatori').ren = { nome: 'Renato', cognome: 'Bianchi', email: 'renato@example.com', categorie: ['Under 14 F', 'Under 16 F'] };
  col('allenatori').vuoto = { nome: 'V', cognome: 'V', categorie: [] };
  col('allenatori').off = { nome: 'O', cognome: 'O', categorie: ['Under 14 F'], attivo: false };
  col('allenatori').sa = { nome: 'S', cognome: 'A', categorie: ['Under 14 F'], senzaAccesso: true };
  col('dirigenti').dir1 = { nome: 'Presidente' };

  col('atleti').a1 = { nome: 'Giulia', cognome: 'Verdi', categoria: 'Under 14 F', accessUids: ['gen1'] };
  col('atleti').a2 = { nome: 'Anna', cognome: 'Bruni', categoria: 'Under 16 F' };
  col('atleti').a3 = { nome: 'Sara', cognome: 'Neri', categoria: 'Serie D' };       /* categoria che Renato non allena */
  col('atleti').a4 = { nome: 'Elena', cognome: 'Alberti', categoria: 'Under 14 F' };
  col('atletiDati').a1 = {
    dataNascita: '2012-03-04', codiceFiscale: 'VRDGLI12C44F205X', indirizzo: 'Via Roma 1', telefono: '3331112222', emailContatto: 'giulia@example.com',
    tutore1Prenome: 'Marco', tutore1Cognome: 'Verdi', tutore1Parentela: 'Padre', tutore1Telefono: '3401234567', tutore1Email: 'marco@example.com',
    tutore1CodiceFiscale: 'VRDMRC70A01F205Z', tutore2Prenome: 'Laura', tutore2Cognome: 'Rossi', tutore2Telefono: ' 3489876543 ',
    infoMediche: 'allergia al lattice', note: 'segnalazione riservata', emergenzaTelefono: '0805550000'
  };
  col('atletiDati').a2 = { dataNascita: '2010-11-20', tutore1Prenome: 'Piero', tutore1Cognome: 'Bruni' };   /* nessun telefono */
  col('atletiDati').a3 = { dataNascita: '2001-01-01', tutore1Telefono: '3999999999' };
  /* a4 non ha anagrafica riservata */

  await t('l’allenatore vede solo gli atleti delle sue categorie, in ordine', async () => {
    const r = await chiama('tok-ren');
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body.atleti.map((a) => a.cognome), ['Alberti', 'Verdi', 'Bruni'], 'Under 14 F poi Under 16 F, per cognome; Serie D esclusa');
    assert.deepStrictEqual(r.body.categorie, ['Under 14 F', 'Under 16 F']);
    assert.deepStrictEqual(r.body.allenatore, { nome: 'Renato', cognome: 'Bianchi' });
    assert.strictEqual(r.headers['Cache-Control'], 'no-store');
  });
  await t('di ogni atleta arrivano solo nome, cognome, categoria, data di nascita e telefono dei genitori', async () => {
    const giulia = (await chiama('tok-ren')).body.atleti.find((a) => a.cognome === 'Verdi');
    assert.deepStrictEqual(giulia, {
      cognome: 'Verdi', nome: 'Giulia', categoria: 'Under 14 F', dataNascita: '2012-03-04',
      genitori: [{ nome: 'Marco Verdi', parentela: 'Padre', telefono: '3401234567' }, { nome: 'Laura Rossi', parentela: '', telefono: '3489876543' }]
    });
  });
  await t('nessun dato riservato esce dalla risposta, qualunque sia il campo', async () => {
    const testo = JSON.stringify((await chiama('tok-ren')).body);
    ['VRDGLI12C44F205X', 'VRDMRC70A01F205Z', 'Via Roma', '3331112222', 'giulia@example.com', 'marco@example.com', 'lattice', 'riservata', '0805550000', '3999999999'].forEach((segreto) =>
      assert.ok(!testo.includes(segreto), 'non deve comparire: ' + segreto));
  });
  await t('un atleta senza telefono o senza anagrafica compare lo stesso, con la lista dei genitori vuota', async () => {
    const atleti = (await chiama('tok-ren')).body.atleti;
    assert.deepStrictEqual(atleti.find((a) => a.cognome === 'Bruni').genitori, []);
    const alberti = atleti.find((a) => a.cognome === 'Alberti');
    assert.deepStrictEqual([alberti.dataNascita, alberti.genitori], ['', []]);
  });
  await t('rifiuta chi non è allenatore: dirigenti, famiglie, senza token, token falso', async () => {
    assert.strictEqual((await chiama('tok-dir')).code, 403);
    assert.strictEqual((await chiama('tok-gen')).code, 403);
    assert.strictEqual((await chiama(null)).code, 401);
    assert.strictEqual((await chiama('falso')).code, 401);
  });
  await t('rifiuta l’accesso senza categorie, disattivato o «senza accesso»', async () => {
    assert.strictEqual((await chiama('tok-vuoto')).code, 403);
    assert.strictEqual((await chiama('tok-off')).code, 403);
    assert.strictEqual((await chiama('tok-sa')).code, 403);
  });
  await t('solo GET e solo dallo stesso sito', async () => {
    assert.strictEqual((await chiama('tok-ren', {}, 'POST')).code, 405);
    assert.strictEqual((await chiama('tok-ren', { origin: 'https://evil.example' })).code, 403);
    assert.strictEqual((await chiama('tok-ren', { origin: 'https://www.victorvolley.it' })).code, 200);
  });
  await t('con più di 10 categorie interroga a gruppi e non perde nessuno', async () => {
    const molte = Array.from({ length: 13 }, (_, i) => 'Cat ' + i);
    col('allenatori').molte = { nome: 'M', cognome: 'M', categorie: molte };
    utenti['tok-molte'] = 'molte';
    molte.forEach((c, i) => { col('atleti')['m' + i] = { nome: 'N' + i, cognome: 'C' + i, categoria: c }; });
    assert.strictEqual((await chiama('tok-molte')).body.atleti.length, 13);
  });
  await t('la logica: categorie pulite, date di riserva dalla scheda pubblica', () => {
    assert.deepStrictEqual(L.categorieAllenatore({ categorie: [' A ', 'A', '', 5, 'B'] }), ['A', 'B']);
    assert.strictEqual(L.categorieAllenatore(null), null);
    assert.strictEqual(L.schedaAtleta({ nome: 'X', cognome: 'Y', categoria: 'C', dataNascita: '2011-01-01' }, {}).dataNascita, '2011-01-01');
  });
  await t('le regole di Firestore: ognuno legge solo il proprio profilo, scrivono solo i dirigenti', () => {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const m = /match \/allenatori\/\{uid\}\s*\{([\s\S]*?)\n\s*\}/.exec(rules);
    assert.ok(m, 'manca la regola per allenatori');
    assert.ok(/allow read: if signedIn\(\) && \(request\.auth\.uid == uid \|\| isDirigente\(\)\)/.test(m[1]), 'lettura: solo il proprio profilo o un dirigente');
    assert.ok(/allow write: if isDirigente\(\)/.test(m[1]), 'scrittura: solo dirigenti');
    assert.ok(!/allow (read|write)[^;]*if true/.test(m[1]), 'mai aperta a tutti');
    /* L'allenatore NON deve poter leggere le schede degli atleti dalle regole (i suoi dati passano dal server). */
    assert.ok(!/allenatori/.test(rules.replace(/match \/allenatori\/\{uid\}[\s\S]*?\n\s*\}/, '')), 'le altre regole non devono nominare gli allenatori');
  });

  if (!process.exitCode) console.log('check-allenatore: ' + n + ' prove superate.');
})();
