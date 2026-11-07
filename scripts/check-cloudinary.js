#!/usr/bin/env node
/**
 * Collaudo della firma dei caricamenti Cloudinary:  node scripts/check-cloudinary.js
 * Senza rete e senza chiavi vere (segreto finto). Verifica: la firma coincide con l'esempio ufficiale di Cloudinary,
 * l'ordine delle chiavi e i parametri esclusi, la funzione /api/cloudinary-firma (rifiuti: metodo, altra origine,
 * senza accesso, token falso, non dirigente; 503 "chiavi-mancanti" senza chiavi; risposta firmata con le chiavi) e
 * che la risposta non contenga mai il segreto.
 */
const assert = require('assert');
const path = require('path');

const C = require('../api/_cloudinary-logic');

/* ---------- Firebase finto ---------- */
const dirigenti = { dir1: { nome: 'Presidente' } };
const utenti = { 'tok-dir': 'dir1', 'tok-altro': 'altro1' };
const app = {
  firestore: () => ({ collection: () => ({ doc: (id) => ({ get: async () => ({ exists: id in dirigenti }) }) }) }),
  auth: () => ({ verifyIdToken: async (t) => { if (!utenti[t]) throw new Error('token'); return { uid: utenti[t] }; } })
};
require.cache[require.resolve(path.join('..', 'api', '_firebase.js'))] = {
  id: 'fb', filename: 'fb', loaded: true,
  exports: { getApp: () => app, stessaOrigine: (r) => !r.headers.origin || new URL(r.headers.origin).host === r.headers.host, safeJson: () => ({}) }
};
const handler = require('../api/cloudinary-firma');

const res = () => { const r = { code: 200, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const chiama = async (req) => { const r = res(); await handler({ method: 'POST', headers: { host: 'www.victorvolley.it' }, ...req }, r); return r; };

const SEGRETO_FINTO = 'segreto-finto-solo-per-il-test';
let n = 0;
async function t(nome, fn) {
  try { await fn(); n++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; }
}

(async () => {
  await t('firma = esempio ufficiale Cloudinary', () => {
    const p = { timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' };
    assert.strictEqual(C.firma(p, 'abcd'), 'bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
  await t('ordine alfabetico indipendente da come arrivano i parametri', () => {
    assert.strictEqual(C.stringaDaFirmare({ upload_preset: 'x', timestamp: 5 }), 'timestamp=5&upload_preset=x');
    assert.strictEqual(C.firma({ b: 1, a: 2 }, 's'), C.firma({ a: 2, b: 1 }, 's'));
  });
  await t('file, api_key, cloud_name, resource_type e signature non si firmano', () => {
    const base = { timestamp: 1, upload_preset: 'p' };
    const con = Object.assign({ file: 'x', api_key: 'k', cloud_name: 'c', resource_type: 'image', signature: 's' }, base);
    assert.strictEqual(C.firma(con, 'z'), C.firma(base, 'z'));
  });
  await t('valori vuoti ignorati, array con la virgola', () => {
    assert.strictEqual(C.stringaDaFirmare({ a: '', b: null, c: undefined, d: ['x', 'y'] }), 'd=x,y');
  });
  await t('parametri del caricamento: timestamp in secondi e preset del server (o predefinito)', () => {
    assert.deepStrictEqual(C.parametriCaricamento({}, 1700000000999), { timestamp: 1700000000, upload_preset: 'victor-day' });
    assert.strictEqual(C.parametriCaricamento({ CLOUDINARY_PRESET: 'altro' }, 0).upload_preset, 'altro');
  });

  delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET;
  await t('solo POST (405)', async () => { const r = await chiama({ method: 'GET' }); assert.strictEqual(r.code, 405); });
  await t('altra origine rifiutata (403)', async () => {
    const r = await chiama({ headers: { host: 'www.victorvolley.it', origin: 'https://altro-sito.example', authorization: 'Bearer tok-dir' } });
    assert.strictEqual(r.code, 403);
  });
  await t('senza accesso (401)', async () => { const r = await chiama({}); assert.strictEqual(r.code, 401); });
  await t('token falso (401)', async () => { const r = await chiama({ headers: { host: 'www.victorvolley.it', authorization: 'Bearer falso' } }); assert.strictEqual(r.code, 401); });
  await t('utente valido ma non dirigente (403)', async () => {
    process.env.CLOUDINARY_API_KEY = 'k'; process.env.CLOUDINARY_API_SECRET = SEGRETO_FINTO;
    const r = await chiama({ headers: { host: 'www.victorvolley.it', authorization: 'Bearer tok-altro' } });
    assert.strictEqual(r.code, 403); assert.ok(!JSON.stringify(r.body).includes(SEGRETO_FINTO));
    delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET;
  });
  await t('dirigente senza chiavi sul server: 503 chiavi-mancanti (il pannello carica come prima)', async () => {
    const r = await chiama({ headers: { host: 'www.victorvolley.it', authorization: 'Bearer tok-dir' } });
    assert.strictEqual(r.code, 503); assert.strictEqual(r.body.codice, 'chiavi-mancanti');
  });
  await t('dirigente con le chiavi: firma valida, nessun segreto nella risposta', async () => {
    process.env.CLOUDINARY_API_KEY = 'chiave-finta'; process.env.CLOUDINARY_API_SECRET = SEGRETO_FINTO;
    const r = await chiama({ headers: { host: 'www.victorvolley.it', authorization: 'Bearer tok-dir' } });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.headers['Cache-Control'], 'no-store');
    assert.strictEqual(r.body.apiKey, 'chiave-finta'); assert.strictEqual(r.body.uploadPreset, 'victor-day');
    assert.strictEqual(r.body.signature, C.firma({ timestamp: r.body.timestamp, upload_preset: 'victor-day' }, SEGRETO_FINTO));
    assert.ok(!JSON.stringify(r.body).includes(SEGRETO_FINTO));
    assert.ok(Math.abs(r.body.timestamp - Date.now() / 1000) < 5);
  });

  /* ---------- Lato pannello: js/photodb.js eseguito con finestra, accesso e rete finti ---------- */
  const fs = require('fs'), vm = require('vm');
  function pannello(rispostaFirma) {
    const chiamate = [];
    const win = {
      CLOUDINARY_CLOUD: 'nube', CLOUDINARY_PRESET: 'victor-day', VV: {}, DB: {},
      auth: { currentUser: { getIdToken: async () => 'tok-dir' } }
    };
    win.window = win;
    const ctx = vm.createContext({
      window: win, console: { warn: (m) => chiamate.push(['warn', m]), log() {} }, FormData, Blob, Promise, setTimeout, String, Math, Date, Array, JSON,
      document: {}, navigator: {},
      fetch: async (url, opt) => {
        chiamate.push([url, opt]);
        if (url === '/api/cloudinary-firma') return { ok: rispostaFirma.status === 200, status: rispostaFirma.status, json: async () => rispostaFirma.body };
        return { ok: true, status: 200, json: async () => ({ secure_url: 'https://res.cloudinary.com/nube/img.jpg' }) };
      }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'photodb.js'), 'utf8'), ctx);
    return { PhotoDB: win.PhotoDB, chiamate };
  }
  const campi = (c) => { const x = c.find((e) => String(e[0]).includes('api.cloudinary.com')); return Object.fromEntries([...x[1].body.entries()].filter(([k]) => k !== 'file')); };

  await t('pannello: con la firma manda api_key, timestamp, signature e preset del server', async () => {
    const { PhotoDB, chiamate } = pannello({ status: 200, body: { apiKey: 'k1', timestamp: 1700000000, signature: 'abc', uploadPreset: 'victor-day' } });
    const j = await PhotoDB.uploadImage(new Blob(['x']), 'a.jpg');
    assert.strictEqual(j.secure_url, 'https://res.cloudinary.com/nube/img.jpg');
    assert.deepStrictEqual(campi(chiamate), { api_key: 'k1', timestamp: '1700000000', signature: 'abc', upload_preset: 'victor-day' });
    assert.strictEqual(chiamate[0][1].headers.Authorization, 'Bearer tok-dir');
  });
  await t('pannello: 503 chiavi-mancanti -> carica come prima (solo preset) e lo scrive in console', async () => {
    const { PhotoDB, chiamate } = pannello({ status: 503, body: { codice: 'chiavi-mancanti' } });
    await PhotoDB.uploadImage(new Blob(['x']), 'a.jpg');
    assert.deepStrictEqual(campi(chiamate), { upload_preset: 'victor-day' });
    assert.ok(chiamate.some((c) => c[0] === 'warn'));
  });
  await t('pannello: altri errori della firma (401) bloccano il caricamento, niente invio a Cloudinary', async () => {
    const { PhotoDB, chiamate } = pannello({ status: 401, body: { error: 'Sessione non valida' } });
    await assert.rejects(() => PhotoDB.uploadImage(new Blob(['x']), 'a.jpg'), /Sessione non valida/);
    assert.ok(!chiamate.some((c) => String(c[0]).includes('api.cloudinary.com')));
  });

  if (!process.exitCode) console.log('OK: ' + n + ' verifiche sulla firma dei caricamenti Cloudinary.');
})();
