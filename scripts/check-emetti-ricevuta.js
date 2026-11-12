#!/usr/bin/env node
/**
 * Collaudo dell'emissione ricevute con numero dal server:  node scripts/check-emetti-ricevuta.js
 * api/emetti-ricevuta.js con Firestore e Firebase Auth finti (nessuna rete). Verifica: permessi (ruoli), validazione,
 * numerazione che prosegue dal contatore e non si azzera, due richieste insieme = numeri diversi, numero già occupato
 * saltato, Dati ASD / firma / bollo / emessaDa decisi dal server (il browser non li falsifica), invio ripetuto con la
 * stessa chiave = nessun doppione. La prova con transazioni VERE (emulatore) è in scripts/check-emissione-emulatore.js.
 */
const assert = require('assert');
const path = require('path');

/* ---------- Firestore finto con transazioni (una alla volta, come l'esito dei tentativi ripetuti di Firestore) ---------- */
const store = {};
const col = (c) => (store[c] = store[c] || {});
const docRef = (c, id) => ({
  id, path: c + '/' + id,
  get: async () => ({ exists: id in col(c), id, data: () => col(c)[id], ref: docRef(c, id) })
});
let coda = Promise.resolve();
const db = {
  collection: (c) => ({ doc: (id) => docRef(c, id) }),
  runTransaction: (fn) => {
    const esegui = async () => {
      const scritture = [];
      const tx = { get: async (r) => r.get(), set: (r, d) => scritture.push([r, d]) };
      const out = await fn(tx);
      scritture.forEach(([r, d]) => { col(r.path.split('/')[0])[r.id] = JSON.parse(JSON.stringify(d)); });
      return out;
    };
    const p = coda.then(esegui, esegui);
    coda = p.catch(() => {});
    return p;
  }
};
const utenti = { 'tok-pres': 'pres', 'tok-seg': 'seg', 'tok-prs': 'prs', 'tok-gen': 'gen', 'tok-mas': 'mas' };
const app = {
  firestore: () => db,
  auth: () => ({ verifyIdToken: async (tk) => { if (!utenti[tk]) throw new Error('token'); return { uid: utenti[tk], email: utenti[tk] + '@example.com' }; } })
};
require.cache[require.resolve(path.join('..', 'api', '_firebase.js'))] = {
  id: 'fb', filename: 'fb', loaded: true,
  exports: { getApp: () => app, stessaOrigine: (r) => !r.headers.origin || new URL(r.headers.origin).host === r.headers.host, safeJson: (s) => { try { return JSON.parse(s); } catch (e) { return {}; } } }
};
const emetti = require('../api/emetti-ricevuta');

const res = () => { const r = { code: 200, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = () => {}; return r; };
const chiama = async (body, tok, extra) => { const r = res(); await emetti({ method: 'POST', headers: { host: 'www.victorvolley.it', ...(tok === null ? {} : { authorization: 'Bearer ' + (tok || 'tok-pres') }), ...(extra || {}) }, body }, r); return r; };
const valido = (extra) => Object.assign({
  data: '2026-11-12', importo: 150, tipoIncasso: 'Quota associativa', causale: '1ª rata stagione 2026/27', modalita: 'Bonifico', riferimento: '', note: '',
  atletaId: 'a1', rateIds: ['r1'], pagatore: { nome: 'ROSSI MARIO', cf: '', indirizzo: '', ruolo: 'Genitore / tutore' }, atleta: { nome: 'Rossi Luca', cf: '', dataNascita: '' }
}, extra || {});

let n = 0;
async function t(nome, fn) { try { await fn(); n++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

(async () => {
  col('dirigenti').pres = { nome: 'Matteo', cognome: 'Cuna' };
  col('dirigenti').mas = { nome: 'Lorenzo', ruolo: 'master' };
  col('dirigenti').seg = { nome: 'Sara', ruolo: 'segreteria' };
  col('dirigenti').prs = { nome: 'Pia', ruolo: 'presenze' };
  col('atleti').a1 = { nome: 'Luca' };
  col('settings').asd = { denominazione: 'ASD Victor Volley', codiceFiscale: '00000000000', rasd: false, presidente: 'Cuna Matteo' };
  col('firme').presidente = { img: 'data:image/png;base64,AAAA' };
  col('contatoriRicevute')['2026'] = { ultimo: 41 };   // la numerazione NON riparte da 1

  await t('permessi: serve il token; presidente, master e segreteria emettono; «presenze» e le famiglie no', async () => {
    assert.strictEqual((await chiama(valido(), null)).code, 401);
    assert.strictEqual((await chiama(valido(), 'falso')).code, 401);
    assert.strictEqual((await chiama(valido(), 'tok-gen')).code, 403);
    assert.strictEqual((await chiama(valido(), 'tok-prs')).code, 403);
    assert.strictEqual((await chiama(valido(), 'tok-pres', { origin: 'https://evil.example' })).code, 403);
    assert.strictEqual(Object.keys(col('ricevute')).length, 0, 'nulla scritto finora');
    assert.strictEqual(col('contatoriRicevute')['2026'].ultimo, 41);
    const g = res(); g.setHeader = () => {}; await emetti({ method: 'GET', headers: { host: 'x' } }, g); assert.strictEqual(g.code, 405);
  });
  await t('la numerazione prosegue dal contatore (42), il server decide numero, stato, anno, chi emette', async () => {
    const r = await chiama(valido({ numero: '2026/0001', progressivo: 1, stato: 'annullata', emessaDa: 'Falso' }));
    assert.strictEqual(r.code, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.id, '2026_0042'); assert.strictEqual(r.body.ricevuta.numero, '2026/0042');
    assert.strictEqual(r.body.ricevuta.progressivo, 42); assert.strictEqual(r.body.ricevuta.anno, 2026);
    assert.strictEqual(r.body.ricevuta.stato, 'valida'); assert.strictEqual(r.body.ricevuta.emessaDa, 'Matteo Cuna');
    assert.ok(/^\d{4}-\d\d-\d\dT/.test(r.body.ricevuta.createdAt));
    assert.strictEqual(col('contatoriRicevute')['2026'].ultimo, 42);
    assert.strictEqual(col('ricevute')['2026_0042'].importo, 150);
  });
  await t('i Dati ASD, la firma e il bollo li mette il server (il browser non li falsifica)', async () => {
    const r = await chiama(valido({ asd: { denominazione: 'FALSA', firma: 'x' }, bollo: 'Esente', importo: 100 }), 'tok-seg');
    assert.strictEqual(r.code, 200); const d = r.body.ricevuta;
    assert.strictEqual(d.asd.denominazione, 'ASD Victor Volley'); assert.strictEqual(d.asd.codiceFiscale, '00000000000');
    assert.strictEqual(d.asd.firma, 'data:image/png;base64,AAAA'); assert.strictEqual(d.asd.presidente, 'Cuna Matteo');
    assert.ok(/da assolvere/.test(d.bollo), 'rasd false e importo > 77,47: bollo da assolvere');
    assert.strictEqual(d.emessaDa, 'Sara');
    const piccola = (await chiama(valido({ importo: 50 }), 'tok-mas')).body.ricevuta;
    assert.ok(/non dovuta/.test(piccola.bollo)); assert.strictEqual(piccola.emessaDa, 'Lorenzo');
    col('settings').asd.rasd = true;
    assert.ok(/art\. 27-bis/.test((await chiama(valido())).body.ricevuta.bollo), 'RASD: esente');
    delete col('settings').asd; delete col('firme').presidente;
    const senza = (await chiama(valido())).body.ricevuta;   // come il pannello: valori predefiniti, firma vuota
    assert.strictEqual(senza.asd.denominazione, 'ASD Victor Volley'); assert.strictEqual(senza.asd.firma, ''); assert.strictEqual(senza.asd.rasd, true);
    col('settings').asd = { denominazione: 'ASD Victor Volley', codiceFiscale: '00000000000', rasd: false, presidente: 'Cuna Matteo' }; col('firme').presidente = { img: 'data:image/png;base64,AAAA' };
  });
  await t('validazione: dati sbagliati = 400 e il contatore non si muove', async () => {
    const prima = col('contatoriRicevute')['2026'].ultimo, nRic = Object.keys(col('ricevute')).length;
    const casi = [valido({ data: '2026-13-40' }), valido({ data: '12/11/2026' }), valido({ data: '1999-01-01' }), valido({ importo: 0 }), valido({ importo: -5 }),
      valido({ importo: 'abc' }), valido({ importo: 1e9 }), valido({ tipoIncasso: 'Inventato' }), valido({ modalita: 'Bitcoin' }), valido({ causale: '  ' }),
      valido({ pagatore: { nome: '' } }), valido({ pagatore: null }), valido({ pagatore: { nome: 'X', cf: 'CORTO' } }), valido({ atletaId: '../x' }), valido({ atletaId: 5 })];
    for (const c of casi) assert.strictEqual((await chiama(c)).code, 400, JSON.stringify(c).slice(0, 90));
    assert.strictEqual((await chiama(valido({ atletaId: 'inesistente' }))).code, 404);
    assert.strictEqual(col('contatoriRicevute')['2026'].ultimo, prima); assert.strictEqual(Object.keys(col('ricevute')).length, nRic);
  });
  await t('senza atleta (altri incassi) e con codice fiscale valido: ok; anno dalla data; contatore per anno', async () => {
    const r = await chiama(valido({ atletaId: null, atleta: null, rateIds: [], pagatore: { nome: 'Mario', cf: 'rssmra80a01h501u', ruolo: 'Pagatore' } }));
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.ricevuta.atletaId, null); assert.strictEqual(r.body.ricevuta.pagatore.cf, 'RSSMRA80A01H501U');
    const nuovoAnno = (await chiama(valido({ data: '2027-01-05' }))).body;
    assert.strictEqual(nuovoAnno.id, '2027_0001', 'un nuovo anno riparte da 1 col proprio contatore'); assert.strictEqual(col('contatoriRicevute')['2027'].ultimo, 1);
  });
  await t('due richieste insieme: numeri diversi, nessun buco, contatore allineato', async () => {
    const prima = col('contatoriRicevute')['2026'].ultimo;
    const out = await Promise.all(Array.from({ length: 12 }, () => chiama(valido())));
    assert.ok(out.every((r) => r.code === 200));
    const nums = out.map((r) => r.body.ricevuta.progressivo).sort((a, b) => a - b);
    assert.deepStrictEqual(nums, Array.from({ length: 12 }, (_, i) => prima + 1 + i));
    assert.strictEqual(col('contatoriRicevute')['2026'].ultimo, prima + 12);
  });
  await t('contatore rimasto indietro: salta i numeri già usati invece di fallire', async () => {
    const ultimo = col('contatoriRicevute')['2026'].ultimo;
    col('contatoriRicevute')['2026'].ultimo = ultimo - 3;   // indietro di 3
    const r = await chiama(valido());
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.ricevuta.progressivo, ultimo + 1);
    assert.strictEqual(col('contatoriRicevute')['2026'].ultimo, ultimo + 1);
  });
  await t('stessa chiave = nessun doppione: restituisce la ricevuta già emessa', async () => {
    const k = 'chiave-di-prova-1';
    const a = await chiama(valido({ chiave: k })), nRic = Object.keys(col('ricevute')).length, ultimo = col('contatoriRicevute')['2026'].ultimo;
    const b = await chiama(valido({ chiave: k }));
    assert.strictEqual(a.code, 200); assert.strictEqual(b.code, 200);
    assert.strictEqual(b.body.id, a.body.id); assert.strictEqual(b.body.ripetuta, true); assert.strictEqual(a.body.ripetuta, false);
    assert.strictEqual(Object.keys(col('ricevute')).length, nRic); assert.strictEqual(col('contatoriRicevute')['2026'].ultimo, ultimo);
    const c = await chiama(valido({ chiave: 'chiave-di-prova-2' })); assert.notStrictEqual(c.body.id, a.body.id);
    const strana = await chiama(valido({ chiave: 'a b' })); assert.strictEqual(strana.code, 200, 'una chiave non valida si ignora, non blocca l\'emissione');
  });
  await t('contesa sul contatore (ABORTED): riprova da solo e riesce, senza doppioni', async () => {
    const orig = db.runTransaction; let tentativi = 0;
    db.runTransaction = (fn) => { tentativi++; if (tentativi <= 2) { const e = new Error('10 ABORTED: Transaction lock timeout.'); e.code = 10; return Promise.reject(e); } return orig(fn); };
    const prima = Object.keys(col('ricevute')).length;
    const r = await chiama(valido()); db.runTransaction = orig;
    assert.strictEqual(r.code, 200); assert.strictEqual(tentativi, 3); assert.strictEqual(Object.keys(col('ricevute')).length, prima + 1);
  });
  await t('errore interno: messaggio in italiano, nessun dettaglio tecnico', async () => {
    const orig = db.runTransaction; db.runTransaction = async () => { throw new Error('segreto interno'); };
    const r = await chiama(valido()); db.runTransaction = orig;
    assert.strictEqual(r.code, 500); assert.ok(/riprova/i.test(r.body.error) && !/segreto/.test(r.body.error));
  });

  if (!process.exitCode) console.log('OK: ' + n + ' verifiche sull\'emissione delle ricevute con numero dal server.');
})();
