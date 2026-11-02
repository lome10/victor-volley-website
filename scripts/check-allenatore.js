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
const docRef = (n, id) => ({
  id,
  get: async () => ({ exists: id in col(n), id, data: () => col(n)[id] }),
  /* set con merge: i campi semplici si sovrascrivono, la mappa `segnate` si unisce (come fa Firestore) */
  set: async (d, o) => { const prima = (o && o.merge && col(n)[id]) || {}; col(n)[id] = { ...prima, ...d, ...(d.segnate ? { segnate: { ...(prima.segnate || {}), ...d.segnate } } : {}) }; },
  delete: async () => { delete col(n)[id]; }
});
const filtra = (n, filtri) => ({
  where: (c, op, v) => filtra(n, filtri.concat([[c, op, v]])),
  get: async () => ({ docs: Object.keys(col(n)).filter((id) => filtri.every(([c, op, v]) => (op === 'in' && v.length <= 30 && v.includes(col(n)[id][c])) || (op === '==' && col(n)[id][c] === v))).map((id) => ({ id, data: () => col(n)[id] })) })
});
const firestore = {
  collection: (n) => ({
    doc: (id) => docRef(n, id),
    where: (c, op, v) => filtra(n, [[c, op, v]])
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
const presenze = require('../api/allenatore-presenze');
const L = require('../api/_allenatore-logic');

const res = () => { const r = { code: 200, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const chiama = async (tok, extra, method) => { const r = res(); await handler({ method: method || 'GET', headers: { host: 'www.victorvolley.it', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(extra || {}) } }, r); return r; };

const chiamaP = async (tok, metodo, body) => { const r = res(); await presenze({ method: metodo, body, headers: { host: 'www.victorvolley.it', ...(tok ? { authorization: 'Bearer ' + tok } : {}) } }, r); return r; };

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
    infoMediche: 'allergia al lattice', note: 'segnalazione riservata', noteAllenatore: 'Palleggiatrice, torna dall\'infortunio', emergenzaTelefono: '0805550000'
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
  await t('di ogni atleta arrivano solo nome, cognome, categoria, data di nascita, telefono dei genitori e note per l\'allenatore', async () => {
    const giulia = (await chiama('tok-ren')).body.atleti.find((a) => a.cognome === 'Verdi');
    assert.deepStrictEqual(giulia, {
      cognome: 'Verdi', nome: 'Giulia', categoria: 'Under 14 F', dataNascita: '2012-03-04',
      genitori: [{ nome: 'Marco Verdi', parentela: 'Padre', telefono: '3401234567' }, { nome: 'Laura Rossi', parentela: '', telefono: '3489876543' }],
      note: 'Palleggiatrice, torna dall\'infortunio'
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
    assert.strictEqual(atleti.find((a) => a.cognome === 'Bruni').note, '');
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
  /* ---------- presenze agli allenamenti ---------- */
  const OGGI = L.oggiRoma();
  const weekdayOggi = ((new Date(OGGI + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
  const domani = ((weekdayOggi) % 7) + 1;
  col('allenamenti').t1 = { categoria: 'Under 14 F', giorno: weekdayOggi, oraInizio: '17:30', oraFine: '19:00', luogo: 'Palestra' };
  col('allenamenti').t2 = { categoria: 'Under 14 F', giorno: domani, oraInizio: '18:00', validoFino: '2000-01-01' };   /* scaduto */
  col('allenamenti').t3 = { categoria: 'Serie D', giorno: weekdayOggi, oraInizio: '20:00' };                          /* non sua */

  await t('presenze: il mister vede i giorni di allenamento (prossimi 7 e ultimi 60, oggi compreso), gli atleti e nient\'altro', async () => {
    const r = await chiamaP('tok-ren', 'GET');
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.oggi, OGGI);
    const u14 = r.body.categorie.find((c) => c.categoria === 'Under 14 F');
    const tra7 = new Date(OGGI + 'T00:00:00Z'); tra7.setUTCDate(tra7.getUTCDate() + 7);
    assert.strictEqual(u14.giorni[0].data, tra7.toISOString().slice(0, 10), 'il primo è fra 7 giorni');
    assert.ok(u14.giorni.some((g) => g.data === OGGI), 'oggi c\'è');
    assert.ok(u14.giorni.every((g) => g.orarioId === 't1'), 'ogni giorno porta l\'id dell\'orario');
    assert.ok(u14.giorni.every((g) => ((new Date(g.data + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1 === weekdayOggi), 'solo il giorno della settimana giusto');
    assert.ok(u14.giorni.length >= 9, 'circa 60 giorni indietro più la settimana che viene');
    assert.deepStrictEqual(u14.atleti.map((a) => a.cognome), ['Alberti', 'Verdi']);
    assert.deepStrictEqual(Object.keys(u14.atleti[0]).sort(), ['cognome', 'id', 'nome']);
    assert.ok(!r.body.categorie.some((c) => c.categoria === 'Serie D'), 'le categorie di altri non compaiono');
    assert.ok(!JSON.stringify(r.body).includes('VRDGLI12C44F205X'), 'nessun dato riservato');
  });
  await t('presenze: segna presente, poi assente, poi toglie; la tabella lo ricorda', async () => {
    const dati = { categoria: 'Under 14 F', data: OGGI, atletaId: 'a1' };
    assert.strictEqual((await chiamaP('tok-ren', 'POST', { ...dati, stato: 'p' })).code, 200);
    assert.strictEqual((await chiamaP('tok-ren', 'POST', { ...dati, atletaId: 'a4', stato: 'a' })).code, 200);
    let u14 = (await chiamaP('tok-ren', 'GET')).body.categorie.find((c) => c.categoria === 'Under 14 F');
    assert.deepStrictEqual(u14.presenze[OGGI], { a1: 'p', a4: 'a' });
    /* è la stessa risposta "ci sarò / non ci sarò" delle giocatrici: stessa chiave, stesso documento */
    const risposta = col('presenze')['a-t1-' + OGGI + '_a1'];
    assert.ok(risposta, 'scritta in presenze');
    assert.deepStrictEqual([risposta.risposta, risposta.tipo, risposta.eventoId, risposta.data, risposta.categoria, risposta.rispostaDa],
      ['si', 'allenamento', 't1', OGGI, 'Under 14 F', 'ren']);
    assert.strictEqual((await chiamaP('tok-ren', 'POST', { ...dati, stato: '' })).code, 200);
    u14 = (await chiamaP('tok-ren', 'GET')).body.categorie.find((c) => c.categoria === 'Under 14 F');
    assert.deepStrictEqual(u14.presenze[OGGI], { a4: 'a' }, 'toglierlo non cancella gli altri');
    assert.ok(!col('presenze')['a-t1-' + OGGI + '_a1'], 'tolta anche da presenze');
  });
  await t('presenze: giocatrici, mister e dirigenti scrivono nella stessa risposta e l\'ultima vince', async () => {
    const chiave = 'a-t1-' + OGGI + '_a1';
    /* la giocatrice (o il genitore) dice "non ci sarò" prima dell'allenamento */
    col('presenze')[chiave] = { eventKey: 'a-t1-' + OGGI, tipo: 'allenamento', eventoId: 't1', data: OGGI, categoria: 'Under 14 F', atletaId: 'a1', risposta: 'no', rispostaDa: 'genitore', rispostaIl: '2026-01-01T10:00:00.000Z' };
    let u14 = (await chiamaP('tok-ren', 'GET')).body.categorie.find((c) => c.categoria === 'Under 14 F');
    assert.strictEqual(u14.presenze[OGGI].a1, 'a', 'il mister vede la risposta della giocatrice');
    /* il mister la corregge: c'era comunque */
    assert.strictEqual((await chiamaP('tok-ren', 'POST', { categoria: 'Under 14 F', data: OGGI, atletaId: 'a1', stato: 'p' })).code, 200);
    assert.strictEqual(col('presenze')[chiave].risposta, 'si');
    assert.strictEqual(col('presenze')[chiave].rispostaDa, 'ren');
    /* un dirigente dal pannello scrive lo stesso documento e il mister lo vede */
    col('presenze')[chiave] = { ...col('presenze')[chiave], risposta: 'no', rispostaDa: 'dirigente', rispostaIl: '2099-01-01T00:00:00.000Z' };
    u14 = (await chiamaP('tok-ren', 'GET')).body.categorie.find((c) => c.categoria === 'Under 14 F');
    assert.strictEqual(u14.presenze[OGGI].a1, 'a');
    /* le risposte a partite e ad altre categorie non finiscono nella tabella */
    col('presenze')['p-9_a1'] = { eventKey: 'p-9', tipo: 'partita', data: OGGI, categoria: 'Under 14 F', atletaId: 'a1', risposta: 'si', rispostaDa: 'x', rispostaIl: '2099-01-02T00:00:00.000Z' };
    col('presenze')['a-t3-' + OGGI + '_a3'] = { eventKey: 'a-t3-' + OGGI, tipo: 'allenamento', data: OGGI, categoria: 'Serie D', atletaId: 'a3', risposta: 'si', rispostaDa: 'x', rispostaIl: '2099-01-02T00:00:00.000Z' };
    u14 = (await chiamaP('tok-ren', 'GET')).body.categorie.find((c) => c.categoria === 'Under 14 F');
    assert.strictEqual(u14.presenze[OGGI].a1, 'a', 'una partita non cambia l\'allenamento');
    assert.ok(!JSON.stringify(u14.presenze).includes('a3'));
    delete col('presenze')[chiave]; delete col('presenze')['p-9_a1']; delete col('presenze')['a-t3-' + OGGI + '_a3'];
    delete col('presenze')['a-t1-' + OGGI + '_a4'];
  });
  await t('presenze: si può segnare in anticipo (fino a 7 giorni) e le giornate del vecchio sistema si leggono ancora', async () => {
    const tra7 = new Date(OGGI + 'T00:00:00Z'); tra7.setUTCDate(tra7.getUTCDate() + 7);
    const data = tra7.toISOString().slice(0, 10);
    assert.strictEqual((await chiamaP('tok-ren', 'POST', { categoria: 'Under 14 F', data, atletaId: 'a1', stato: 'a' })).code, 200);
    assert.strictEqual(col('presenze')['a-t1-' + data + '_a1'].risposta, 'no');
    delete col('presenze')['a-t1-' + data + '_a1'];
    col('presenzeAllenamento')['under-14-f_2000-01-01'] = { categoria: 'Under 14 F', data: '2000-01-01', segnate: { a1: 'p' } };
    const u14 = (await chiamaP('tok-ren', 'GET')).body.categorie.find((c) => c.categoria === 'Under 14 F');
    assert.deepStrictEqual(u14.presenze['2000-01-01'], { a1: 'p' });
    delete col('presenzeAllenamento')['under-14-f_2000-01-01'];
  });
  await t('presenze: rifiuta categoria non sua, atleta di un\'altra categoria, giorni senza allenamento, futuro, date e stati strani', async () => {
    const ok = { categoria: 'Under 14 F', data: OGGI, atletaId: 'a1', stato: 'p' };
    const prova = async (cambio, codice, perche) => assert.strictEqual((await chiamaP('tok-ren', 'POST', { ...ok, ...cambio })).code, codice, perche);
    await prova({ categoria: 'Serie D', atletaId: 'a3' }, 403, 'categoria di un altro mister');
    await prova({ atletaId: 'a3' }, 403, 'atleta di Serie D in Under 14');
    await prova({ atletaId: 'inesistente' }, 403, 'atleta che non esiste');
    await prova({ data: L.dataValida('2026-02-30') ? OGGI : '2026-02-30' }, 400, 'data che non esiste');
    await prova({ data: '29/10/2026' }, 400, 'formato sbagliato');
    const futuro = new Date(OGGI + 'T00:00:00Z'); futuro.setUTCDate(futuro.getUTCDate() + 14);
    await prova({ data: futuro.toISOString().slice(0, 10) }, 400, 'stesso giorno della settimana ma troppo in là');
    const ieri = new Date(OGGI + 'T00:00:00Z'); ieri.setUTCDate(ieri.getUTCDate() - 1);
    await prova({ data: ieri.toISOString().slice(0, 10) }, 400, 'giorno in cui non si allena');
    const vecchio = new Date(OGGI + 'T00:00:00Z'); vecchio.setUTCDate(vecchio.getUTCDate() - 7 * 12);
    await prova({ data: vecchio.toISOString().slice(0, 10) }, 400, 'oltre i 60 giorni');
    await prova({ stato: 'x' }, 400, 'stato non ammesso');
    await prova({ atletaId: 'a1/../x' }, 400, 'id con barra');
  });
  await t('presenze: solo mister attivi, solo dallo stesso sito, solo GET e POST', async () => {
    assert.strictEqual((await chiamaP(null, 'GET')).code, 401);
    assert.strictEqual((await chiamaP('falso', 'GET')).code, 401);
    assert.strictEqual((await chiamaP('tok-dir', 'GET')).code, 403, 'un dirigente usa il pannello');
    assert.strictEqual((await chiamaP('tok-gen', 'POST', { categoria: 'Under 14 F', data: OGGI, atletaId: 'a1', stato: 'p' })).code, 403, 'un genitore non può segnare');
    assert.strictEqual((await chiamaP('tok-off', 'GET')).code, 403);
    assert.strictEqual((await chiamaP('tok-ren', 'DELETE')).code, 405);
  });
  await t('presenze: la logica dei giorni e le regole di Firestore (solo i dirigenti leggono, nessuno scrive dal browser)', () => {
    assert.strictEqual(L.dataValida('2026-10-29'), true);
    assert.strictEqual(L.dataValida('2026-11-31'), false);
    assert.strictEqual(L.idGiornata('Under 14 F', '2026-10-29'), 'under-14-f_2026-10-29');
    assert.strictEqual(L.idGiornata('Minivolley S3', '2026-10-29'), 'minivolley-s3_2026-10-29');
    /* giovedì 29/10/2026: la squadra che si allena il giovedì (giorno 4) lo ha tra i giorni */
    const gg = L.giorniAllenamento([{ id: 'x/1', categoria: 'S3', giorno: 4, oraInizio: '17:00' }], 'S3', '2026-10-29');
    assert.strictEqual(gg[0].data, '2026-11-05', 'il primo è il giovedì della settimana che viene');
    assert.ok(gg.some((g) => g.data === '2026-10-29') && gg[0].orarioId === 'x/1');
    assert.strictEqual(L.chiaveAllenamento('x/1', '2026-10-29'), 'a-x_1-2026-10-29', 'la stessa chiave dell\'area atleti');
    assert.strictEqual(L.giorniAllenamento([{ categoria: 'S3', giorno: 4, validoFino: '2026-10-22' }], 'S3', '2026-10-29')[0].data, '2026-10-22');
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const m = /match \/presenzeAllenamento\/\{docId\}\s*\{([\s\S]*?)\n\s*\}/.exec(rules);
    assert.ok(m, 'manca la regola');
    assert.ok(/allow read: if isDirigente\(\)/.test(m[1]) && /allow write: if false/.test(m[1]));
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

  await t('statistiche di presenza: contano solo i giorni segnati, assenze di fila, colori', () => {
    const S = require('../js/presenze-stat.js');
    /* 9 date con una doppia = 8 giorni; 3 presente, 3 assente, 2 non segnati */
    const giorni = ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28', '2026-10-28'];
    const stati = { '2026-10-05': 'p', '2026-10-07': 'p', '2026-10-12': 'p', '2026-10-19': 'a', '2026-10-26': 'a', '2026-10-28': 'a' };
    const r = S.calcola(giorni, stati);
    assert.deepStrictEqual([r.si, r.no, r.segnate, r.nr, r.pct], [3, 3, 6, 2, 50], 'i non segnati non abbassano la percentuale');
    assert.strictEqual(r.assenzeDiFila, 3, 'le ultime tre segnate sono assenze (il 21/10 non segnato si salta)');
    assert.deepStrictEqual(r.ultimi, ['p', 'p', 'p', '', 'a', '', 'a', 'a'], 'dal più vecchio al più recente');
    /* niente di segnato: percentuale assente, non 0 */
    const vuoto = S.calcola(['2026-10-05'], {});
    assert.strictEqual(vuoto.pct, null);
    assert.strictEqual(S.calcola([], {}).pct, null);
    /* una presenza interrompe la serie di assenze */
    assert.strictEqual(S.calcola(['2026-10-05', '2026-10-07', '2026-10-12'], { '2026-10-05': 'a', '2026-10-07': 'p', '2026-10-12': 'a' }).assenzeDiFila, 1);
    assert.strictEqual(S.colore(100), '#16A34A'); assert.strictEqual(S.colore(70), '#B45309');
    assert.strictEqual(S.colore(40), '#DC2626'); assert.strictEqual(S.colore(null), '#64748B');
    assert.strictEqual(S.media([{ pct: 80 }, { pct: 60 }, { pct: null }]), 70);
    assert.strictEqual(S.media([{ pct: null }]), null);
    assert.strictEqual(S.inizioStagione('2026-10-30'), '2026-09-01');
    assert.strictEqual(S.inizioStagione('2027-03-02'), '2026-09-01');
    assert.strictEqual(S.inizioStagione('2026-09-01'), '2026-09-01');
  });

  if (!process.exitCode) console.log('check-allenatore: ' + n + ' prove superate.');
})();
