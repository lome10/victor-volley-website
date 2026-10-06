#!/usr/bin/env node
/**
 * Collaudo dell'invito a scegliere la password:  node scripts/check-invito.js
 * Esegue api/invia-invito.js e api/imposta-password.js con Firestore, Firebase Auth e Brevo finti (in memoria):
 * non tocca nulla di reale. Verifica: invio e contenuto dell'email, codice monouso e senza scadenza, revoca dei
 * link precedenti, rifiuti (non dirigente, bersaglio dirigente, genitore non collegato, email interna, codice
 * sbagliato, password corta, altra origine), nessun codice in chiaro su Firestore, ripristino se l'email non parte.
 */
const assert = require('assert');
const path = require('path');

/* ---------- Firestore e Auth finti ---------- */
const store = {};              // { raccolta: { id: dati } }
const passwords = {};          // uid → password impostata
const col = (n) => (store[n] = store[n] || {});
function docRef(n, id) {
  return {
    id, get: async () => ({ exists: id in col(n), id, data: () => col(n)[id], ref: docRef(n, id) }),
    set: async (d) => { col(n)[id] = { ...d }; }, update: async (d) => { Object.assign(col(n)[id], d); },
    delete: async () => { delete col(n)[id]; }
  };
}
function query(n, filtri) {
  return {
    where: (c, op, v) => query(n, filtri.concat([[c, v]])),
    get: async () => ({ docs: Object.keys(col(n)).filter((id) => filtri.every(([c, v]) => col(n)[id][c] === v)).map((id) => ({ id, ref: docRef(n, id), data: () => col(n)[id] })) })
  };
}
const firestore = {
  collection: (n) => ({ doc: (id) => docRef(n, id), where: (c, op, v) => query(n, [[c, v]]) }),
  batch: () => { const ops = []; return { update: (ref, d) => ops.push(() => ref.update(d)), commit: async () => { for (const o of ops) await o(); } }; },
  runTransaction: async (fn) => fn({ get: (ref) => ref.get(), update: (ref, d) => ref.update(d) })
};
let utenti = {};
const app = {
  firestore: () => firestore,
  auth: () => ({
    verifyIdToken: async (t) => { if (!utenti[t]) throw new Error('token'); return { uid: utenti[t] }; },
    updateUser: async (uid, d) => { if (uid === 'sparito') { const e = new Error('x'); e.code = 'auth/user-not-found'; throw e; } passwords[uid] = d.password; }
  })
};
require.cache[require.resolve(path.join('..', 'api', '_firebase.js'))] = {
  id: 'fb', filename: 'fb', loaded: true,
  exports: { getApp: () => app, stessaOrigine: (r) => !r.headers.origin || new URL(r.headers.origin).host === r.headers.host, safeJson: (s) => { try { return JSON.parse(s); } catch (e) { return {}; } } }
};

/* ---------- Brevo finto ---------- */
let email = null, brevoOk = true;
global.fetch = async (url, opt) => {
  if (!brevoOk) return { ok: false, status: 500 };
  email = JSON.parse(opt.body); return { ok: true, status: 201 };
};
process.env.BREVO_API_KEY = 'k'; process.env.EMAIL_FROM = 'segreteria@victorvolley.it'; process.env.SITE_URL = 'https://www.victorvolley.it';

const invia = require('../api/invia-invito');
const imposta = require('../api/imposta-password');
const I = require('../api/_invito-logic');

const res = () => { const r = { code: 200, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const post = async (fn, body, extra) => { const r = res(); await fn({ method: 'POST', headers: { host: 'www.victorvolley.it', ...(extra || {}) }, body }, r); return r; };
const codiceDa = () => /#t=([A-Za-z0-9_-]+)/.exec(email.textContent || email.htmlContent || '')[1];
const testoEmail = () => email.textContent;

let n = 0;
async function t(nome, fn) { try { await fn(); n++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

(async () => {
  utenti = { 'tok-dir': 'dir1', 'tok-gen': 'gen1' };
  col('dirigenti').dir1 = { nome: 'Presidente' };
  col('dirigenti').dir2 = {};
  col('atleti').a1 = { nome: 'Luca', cognome: 'Rossi', accessi: [
    { uid: 'gen1', email: 'Mamma@Example.com', ruolo: 'genitore', nome: 'Anna' },
    { uid: 'gen2', email: 'papa@victorvolley.it', ruolo: 'genitore', nome: 'Paolo' },
    { uid: 'dir2', email: 'dir@example.com', ruolo: 'genitore', nome: 'Dir' },
    { uid: 'a1', email: 'luca@example.com', ruolo: 'atleta', nome: '' }
  ] };
  const auth = (tok) => ({ authorization: 'Bearer ' + tok });
  const invito = (extra, tok) => post(invia, { atletaUid: 'a1', uid: 'gen1', ...extra }, auth(tok || 'tok-dir'));

  await t('rifiuta chi non è dirigente e chi non ha token', async () => {
    assert.strictEqual((await invito({}, 'tok-gen')).code, 403);
    assert.strictEqual((await post(invia, { atletaUid: 'a1', uid: 'gen1' })).code, 401);
    assert.strictEqual((await post(invia, { atletaUid: 'a1', uid: 'gen1' }, { ...auth('tok-dir'), origin: 'https://evil.example' })).code, 403);
  });
  await t('rifiuta bersagli non ammessi', async () => {
    assert.strictEqual((await invito({ uid: 'dir2' })).code, 404, 'un dirigente non si invita');
    assert.strictEqual((await invito({ uid: 'sconosciuto' })).code, 404, 'non collegato alla scheda');
    assert.strictEqual((await invito({ uid: 'a1' })).code, 404, 'solo i genitori');
    assert.strictEqual((await invito({ uid: 'gen2' })).code, 400, 'email interna @victorvolley');
    assert.strictEqual((await invito({ atletaUid: 'nessuna' })).code, 404);
    assert.strictEqual(Object.keys(col('inviti')).length, 0);
  });

  let codice1;
  await t('invia l’email giusta e salva solo l’impronta', async () => {
    const r = await invito({});
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.email, 'mamma@example.com');
    assert.strictEqual(email.sender.email, 'segreteria@victorvolley.it');
    assert.strictEqual(email.to[0].email, 'mamma@example.com');
    assert.ok(/Luca Rossi/.test(testoEmail()) && /Ciao Anna/.test(testoEmail()));
    codice1 = codiceDa();
    assert.ok(I.codiceValido(codice1));
    assert.ok(testoEmail().includes('https://www.victorvolley.it/imposta-password#t=' + codice1));
    const ids = Object.keys(col('inviti'));
    assert.deepStrictEqual(ids, [I.impronta(codice1)]);
    assert.ok(!JSON.stringify(store.inviti).includes(codice1), 'il codice non deve stare su Firestore');
    assert.strictEqual(col('inviti')[ids[0]].stato, 'attivo');
  });
  await t('se l’email non parte, l’invito non resta e i vecchi restano validi', async () => {
    brevoOk = false;
    const r = await invito({}); brevoOk = true;
    assert.strictEqual(r.code, 502);
    assert.deepStrictEqual(Object.keys(col('inviti')), [I.impronta(codice1)]);
    assert.strictEqual(col('inviti')[I.impronta(codice1)].stato, 'attivo');
  });
  let codice2;
  await t('un nuovo invito revoca il precedente', async () => {
    assert.strictEqual((await invito({})).code, 200);
    codice2 = codiceDa(); assert.notStrictEqual(codice1, codice2);
    assert.strictEqual(col('inviti')[I.impronta(codice1)].stato, 'revocato');
    assert.strictEqual(col('inviti')[I.impronta(codice2)].stato, 'attivo');
    assert.strictEqual((await post(imposta, { token: codice1, soloVerifica: true })).code, 404);
    assert.strictEqual((await post(imposta, { token: codice1, password: 'Abcdefghij1!' })).code, 404);
    assert.strictEqual(passwords.gen1, undefined);
  });
  await t('verifica del link', async () => {
    const r = await post(imposta, { token: codice2, soloVerifica: true });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.email, 'mamma@example.com');
    assert.strictEqual(col('inviti')[I.impronta(codice2)].stato, 'attivo', 'verificare non consuma');
  });
  await t('rifiuta codici e password sbagliati', async () => {
    assert.strictEqual((await post(imposta, { token: 'abc', password: 'Abcdefghij1!' })).code, 404);
    assert.strictEqual((await post(imposta, { token: I.nuovoCodice(), password: 'Abcdefghij1!' })).code, 404);
    assert.strictEqual((await post(imposta, { password: 'Abcdefghij1!' })).code, 404);
    assert.strictEqual((await post(imposta, { token: codice2, password: 'corta' })).code, 400);
    assert.strictEqual((await post(imposta, { token: codice2, password: 'Abcdefghij1!' }, { origin: 'https://evil.example' })).code, 403);
    assert.strictEqual(col('inviti')[I.impronta(codice2)].stato, 'attivo');
    assert.strictEqual(passwords.gen1, undefined);
  });
  await t('imposta la password una volta sola', async () => {
    const r = await post(imposta, { token: codice2, password: 'La-mia-password-1' });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.email, 'mamma@example.com');
    assert.strictEqual(passwords.gen1, 'La-mia-password-1');
    assert.strictEqual(col('inviti')[I.impronta(codice2)].stato, 'usato');
    const di_nuovo = await post(imposta, { token: codice2, password: 'Altra-password-2' });
    assert.strictEqual(di_nuovo.code, 404); assert.strictEqual(passwords.gen1, 'La-mia-password-1');
    assert.strictEqual((await post(imposta, { token: codice2, soloVerifica: true })).code, 404);
  });
  await t('un secondo tentativo con lo stesso codice lo trova già usato', async () => {
    assert.strictEqual((await invito({})).code, 200); const c = codiceDa();
    // qui le due richieste sono in sequenza; l'esclusione tra richieste davvero contemporanee è la transazione Firestore
    const [a, b] = [await post(imposta, { token: c, password: 'Prima-password-1' }), await post(imposta, { token: c, password: 'Seconda-password-2' })];
    assert.deepStrictEqual([a.code, b.code].sort(), [200, 404]);
    assert.strictEqual(passwords.gen1, 'Prima-password-1');
  });
  await t('non imposta la password a un dirigente, nemmeno con un codice valido', async () => {
    const c = I.nuovoCodice();
    col('inviti')[I.impronta(c)] = { uid: 'dir2', email: 'dir@example.com', stato: 'attivo' };
    assert.strictEqual((await post(imposta, { token: c, password: 'Abcdefghij1!' })).code, 404);
    assert.strictEqual(passwords.dir2, undefined);
    assert.strictEqual(col('inviti')[I.impronta(c)].stato, 'attivo', 'il codice viene rilasciato');
  });
  await t('account sparito da Firebase: errore chiaro e codice rilasciato', async () => {
    const c = I.nuovoCodice();
    col('inviti')[I.impronta(c)] = { uid: 'sparito', email: 'x@example.com', stato: 'attivo' };
    assert.strictEqual((await post(imposta, { token: c, password: 'Abcdefghij1!' })).code, 404);
  });
  await t('senza servizio email configurato non crea nulla', async () => {
    const prima = Object.keys(col('inviti')).length, k = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    const r = await invito({}); process.env.BREVO_API_KEY = k;
    assert.strictEqual(r.code, 503); assert.strictEqual(Object.keys(col('inviti')).length, prima);
  });
  await t('l’invito saluta con il solo nome (anche se sono due), non con il cognome', async () => {
    col('atleti').a3 = { nome: 'Matteo', cognome: 'Biasco', accessi: [{ uid: 'g9', email: 'ilaria@example.com', ruolo: 'genitore', nome: 'Palamà Ilaria Ilenia', cognome: 'Palamà', prenome: 'Ilaria Ilenia' }] };
    const r = await post(invia, { atletaUid: 'a3', uid: 'g9' }, { authorization: 'Bearer tok-dir' });
    assert.strictEqual(r.code, 200);
    assert.ok(email.textContent.startsWith('Ciao Ilaria Ilenia,') && !/Palamà/.test(email.textContent.split('\n')[0]), email.textContent.split('\n')[0]);
    assert.strictEqual(email.to[0].name, 'Ilaria Ilenia');
  });
  await t('testo dell’email: escape dell’HTML e nessun nome inventato', () => {
    const m = I.componiInvito({ nome: '<b>Anna</b>', email: 'a@example.com', atletaNome: 'Luca "L" Rossi' }, 'https://www.victorvolley.it/imposta-password#t=abc', 'https://www.victorvolley.it');
    assert.ok(!/<b>Anna/.test(m.html) && /&lt;b&gt;Anna/.test(m.html));
    const senza = I.componiInvito({ email: 'a@example.com' }, 'https://x/#t=abc', 'https://www.victorvolley.it');
    assert.ok(/^Buongiorno,/.test(senza.text) && !/ di undefined| di $/m.test(senza.text));
  });

  console.log(process.exitCode ? 'Collaudo fallito.' : 'OK: ' + n + ' verifiche sull’invito alla password.');
})();
