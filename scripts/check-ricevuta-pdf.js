#!/usr/bin/env node
/**
 * Collaudo dell'invio automatico della ricevuta:  node scripts/check-ricevuta-pdf.js
 *   1. PDF (api/_ricevuta-pdf.js): file valido di una pagina, anche con caratteri fuori dal set dei font, testi lunghi,
 *      ricevuta annullata, logo o firma mancanti/illeggibili;
 *   2. destinatari e testo dell'email (api/_ricevuta-logic.js);
 *   3. api/invia-ricevuta.js con Firestore, Firebase Auth e Brevo finti: permessi, ricevuta annullata, senza atleta o
 *      senza indirizzi, invio con l'allegato PDF, nessun doppio invio, «rimanda», errori di Brevo.
 * Non tocca nulla di reale.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

let n = 0;
async function t(nome, fn) { try { await fn(); n++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }

/* ---------- Firestore e Auth finti ---------- */
const store = {};
const col = (c) => (store[c] = store[c] || {});
const docRef = (c, id) => ({
  id, get: async () => ({ exists: id in col(c), id, data: () => col(c)[id], ref: docRef(c, id) }),
  set: async (d) => { col(c)[id] = { ...d }; }, update: async (d) => { Object.assign(col(c)[id], d); }
});
const utenti = { 'tok-dir': 'dir1', 'tok-gen': 'gen1', 'tok-senzamail': 'dir2', 'tok-seg': 'seg1', 'tok-prs': 'prs1', 'tok-boh': 'boh1' };
const emailDi = { dir1: 'Dir@Example.com', gen1: 'gen@example.com' };
const app = {
  firestore: () => ({ collection: (c) => ({ doc: (id) => docRef(c, id), add: async (d) => { const id = 'auto' + Object.keys(col(c)).length; col(c)[id] = { ...d }; return docRef(c, id); } }) }),
  auth: () => ({ verifyIdToken: async (tk) => { if (!utenti[tk]) throw new Error('token'); return { uid: utenti[tk], email: emailDi[utenti[tk]] }; } })
};
require.cache[require.resolve(path.join('..', 'api', '_firebase.js'))] = {
  id: 'fb', filename: 'fb', loaded: true,
  exports: { getApp: () => app, stessaOrigine: (r) => !r.headers.origin || new URL(r.headers.origin).host === r.headers.host, safeJson: (s) => { try { return JSON.parse(s); } catch (e) { return {}; } } }
};
/* Brevo finto: registra ogni invio; `giu` = destinatari per cui fallisce */
let invii = [], giu = new Set(), tuttoGiu = false;
global.fetch = async (url, opt) => {
  const b = JSON.parse(opt.body);
  if (tuttoGiu || giu.has(b.to[0].email)) return { ok: false, status: 500 };
  invii.push(b); return { ok: true, status: 201 };
};
process.env.BREVO_API_KEY = 'k'; process.env.EMAIL_FROM = 'segreteria@victorvolley.it'; process.env.SITE_URL = 'https://www.victorvolley.it';

const { creaPdf, righe, sicuro } = require('../api/_ricevuta-pdf');
const R = require('../api/_ricevuta-logic');
const invia = require('../api/invia-ricevuta');
const logo = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo.png'));
const FIRMA = 'data:image/png;base64,' + logo.toString('base64');

const ric = (extra) => Object.assign({
  numero: '2026/0001', data: '2026-10-06', importo: 150, stato: 'valida', tipoIncasso: 'Quota associativa', causale: '1ª rata stagione 2026/27',
  modalita: 'Bonifico', riferimento: '', bollo: 'Esente.', atletaId: 'a1',
  pagatore: { nome: 'ROSSI MARIO', cf: '', indirizzo: '', ruolo: 'Genitore / tutore' }, atleta: { nome: 'Rossi Luca', cf: '', dataNascita: '' },
  asd: { denominazione: 'ASD Victor Volley', codiceFiscale: '00000000000', sede: 'Racale', affiliazione: 'FIPAV', codiceAffiliazione: '1', rasd: true, luogo: 'Racale', presidente: 'Cuna Matteo', firma: FIRMA }
}, extra || {});
const paginePdf = async (bytes) => { const d = await PDFDocument.load(bytes); return d.getPageCount(); };

(async () => {
  /* ---------- 1. PDF ---------- */
  await t('PDF valido di una pagina', async () => {
    const b = await creaPdf(ric(), { logo, oggi: '06/10/2026' });
    assert.strictEqual(Buffer.from(b).slice(0, 5).toString(), '%PDF-'); assert.strictEqual(await paginePdf(b), 1);
    assert.ok(b.length > 5000 && b.length < 2000000, 'dimensione ' + b.length);
  });
  await t('caratteri fuori dal set dei font non fanno fallire', async () => {
    const b = await creaPdf(ric({ causale: 'Quota 日本語 😀 àèìòù «x» € ’', pagatore: { nome: 'Zoë Łukasz 😀', cf: '', indirizzo: '', ruolo: 'Pagatore' } }), { logo });
    assert.strictEqual(await paginePdf(b), 1);
    assert.strictEqual(sicuro(require('pdf-lib').StandardFonts && (await (await PDFDocument.create()).embedFont('Helvetica')), 'à€日'), 'à€?');
  });
  await t('testi molto lunghi vanno a capo e restano in una pagina', async () => {
    const lungo = 'parola '.repeat(120);
    const b = await creaPdf(ric({ causale: lungo, bollo: lungo, riferimento: lungo, motivoAnnullamento: lungo }), { logo });
    assert.strictEqual(await paginePdf(b), 1);
  });
  await t('ricevuta annullata, senza logo, senza firma o con firma rovinata', async () => {
    for (const extra of [
      { stato: 'annullata', dataAnnullamento: '2026-10-07', motivoAnnullamento: 'importo errato' },
      { asd: { ...ric().asd, firma: '' } }, { asd: { ...ric().asd, firma: 'data:image/png;base64,AAAA' } },
      { asd: { ...ric().asd, firma: 'javascript:alert(1)' } }, { atleta: null }, { riferimento: 'CRO 123' }, { importo: 0.5 }, { importo: 1234.5 }
    ]) assert.strictEqual(await paginePdf(await creaPdf(ric(extra), { logo })), 1);
    assert.strictEqual(await paginePdf(await creaPdf(ric(), {})), 1);
    assert.strictEqual(await paginePdf(await creaPdf(ric(), { logo: Buffer.from('non è un png') })), 1);
  });
  await t('a capo per parole', async () => {
    const f = await (await PDFDocument.create()).embedFont('Helvetica');
    const r = righe(f, 10, 'uno due tre quattro cinque sei sette otto nove dieci', 60);
    assert.ok(r.length > 1 && r.every((x) => f.widthOfTextAtSize(x, 10) <= 60 || !x.includes(' ')));
    assert.deepStrictEqual(righe(f, 10, '', 60), ['']);
  });

  /* ---------- 2. destinatari e testo ---------- */
  await t('destinatari: genitori con email vera, altrimenti l’atleta', () => {
    const g = (uid, email, ruolo, nome) => ({ uid, email, ruolo, nome });
    const a = { accessi: [g('1', 'Mamma@Example.com', 'genitore', 'Anna'), g('2', 'papa@victorvolley.it', 'genitore', 'Paolo'), g('3', 'mamma@example.com', 'genitore', 'Anna bis'), g('4', 'luca@example.com', 'atleta', ''), g('5', 'zio@example.com', 'genitore', 'Zio')] };
    assert.deepStrictEqual(R.destinatariRicevuta(a).map((d) => d.email), ['mamma@example.com', 'zio@example.com']);
    assert.deepStrictEqual(R.destinatariRicevuta({ accessi: [g('4', 'luca@example.com', 'atleta', ''), g('2', 'papa@victorvolley.it', 'genitore', '')] }).map((d) => d.email), ['luca@example.com']);
    assert.deepStrictEqual(R.destinatariRicevuta({ accessi: [g('2', 'papa@victorvolley.it', 'genitore', '')] }), []);
    assert.deepStrictEqual(R.destinatariRicevuta({}), []); assert.deepStrictEqual(R.destinatariRicevuta(null), []);
    /* il saluto usa il solo nome se c'è (due nomi inclusi), altrimenti il nome intero di prima */
    assert.strictEqual(R.destinatariRicevuta({ accessi: [{ email: 'a@example.com', ruolo: 'genitore', nome: 'Palamà Ilaria Ilenia', cognome: 'Palamà', prenome: 'Ilaria Ilenia' }] })[0].nome, 'Ilaria Ilenia');
    assert.strictEqual(R.destinatariRicevuta({ accessi: [{ email: 'a@example.com', ruolo: 'genitore', nome: 'Anna' }] })[0].nome, 'Anna');
  });
  await t('testo dell’email: dati giusti, escape, nessun «undefined»', () => {
    const m = R.componiEmailRicevuta(ric({ causale: '<b>x</b> & "y"', atleta: { nome: 'O\'Neil <i>' } }), { nome: '<img onerror=1>' }, 'https://www.victorvolley.it/');
    assert.ok(/ricevuta n\. 2026\/0001$/.test(m.subject));
    assert.ok(!/<img onerror|<b>x<\/b>|<i>/.test(m.html) && m.html.includes('&lt;b&gt;x&lt;/b&gt;') && m.html.includes('O&#39;Neil'));
    assert.ok(m.html.includes('150,00') && m.text.includes('150,00') && m.html.includes('https://www.victorvolley.it/atleta') && !m.html.includes('//atleta'));
    const s = R.componiEmailRicevuta(ric({ atleta: null }), {}, 'https://www.victorvolley.it');
    assert.ok(/^Buongiorno,/.test(s.text) && !/undefined/.test(s.text + s.html));
  });

  /* ---------- 3. funzione invia-ricevuta ---------- */
  const res = () => { const r = { code: 200, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = () => {}; return r; };
  const chiama = async (body, tok, extra) => { const r = res(); await invia({ method: 'POST', headers: { host: 'www.victorvolley.it', ...(tok === null ? {} : { authorization: 'Bearer ' + (tok || 'tok-dir') }), ...(extra || {}) }, body }, r); return r; };
  col('dirigenti').dir1 = { nome: 'Dina', cognome: 'Capo' }; col('dirigenti').dir2 = {}; col('dirigenti').seg1 = { ruolo: 'segreteria' }; col('dirigenti').prs1 = { ruolo: 'presenze' }; col('dirigenti').boh1 = { ruolo: 'boh' };
  col('atleti').a1 = { accessi: [{ uid: 'g1', email: 'mamma@example.com', ruolo: 'genitore', nome: 'Anna' }, { uid: 'g2', email: 'papa@example.com', ruolo: 'genitore', nome: 'Paolo' }] };
  col('atleti').a2 = { accessi: [{ uid: 'g3', email: 'solo@victorvolley.it', ruolo: 'genitore', nome: 'X' }] };
  const nuova = (id, extra) => { col('ricevute')[id] = ric(extra); return id; };

  await t('permessi e richieste non valide', async () => {
    nuova('2026_0001');
    assert.strictEqual((await chiama({ ricevutaId: '2026_0001' }, null)).code, 401);
    assert.strictEqual((await chiama({ ricevutaId: '2026_0001' }, 'tok-gen')).code, 403);
    assert.strictEqual((await chiama({ ricevutaId: '2026_0001' }, 'tok-dir', { origin: 'https://evil.example' })).code, 403);
    assert.strictEqual((await chiama({}, 'tok-dir')).code, 400); assert.strictEqual((await chiama({ ricevutaId: '../x' }, 'tok-dir')).code, 400);
    assert.strictEqual((await chiama({ ricevutaId: '2026_9999' }, 'tok-dir')).code, 404);
    assert.strictEqual(invii.length, 0);
  });
  await t('ruoli: la segreteria invia; «presenze» e un ruolo sconosciuto no (403, nulla parte)', async () => {
    nuova('2026_0030'); invii = [];
    assert.strictEqual((await chiama({ ricevutaId: '2026_0030' }, 'tok-prs')).code, 403);
    assert.strictEqual((await chiama({ ricevutaId: '2026_0030' }, 'tok-boh')).code, 403);
    assert.strictEqual((await chiama({ esempio: true }, 'tok-prs')).code, 403);
    assert.strictEqual(invii.length, 0);
    assert.strictEqual((await chiama({ ricevutaId: '2026_0030' }, 'tok-seg')).code, 200);
    assert.strictEqual(invii.length, 2); invii = [];
  });
  await t('annullata: rifiutata. Senza atleta o senza indirizzi: non parte nulla e dice perché', async () => {
    nuova('2026_0002', { stato: 'annullata' }); nuova('2026_0003', { atletaId: null }); nuova('2026_0004', { atletaId: 'a2' }); nuova('2026_0005', { atletaId: 'inesistente' });
    assert.strictEqual((await chiama({ ricevutaId: '2026_0002' })).code, 409);
    assert.strictEqual((await chiama({ ricevutaId: '2026_0003' })).body.motivo, 'nessun-atleta');
    assert.strictEqual((await chiama({ ricevutaId: '2026_0004' })).body.motivo, 'nessun-destinatario');
    assert.strictEqual((await chiama({ ricevutaId: '2026_0005' })).body.motivo, 'nessun-destinatario');
    assert.strictEqual(invii.length, 0); assert.ok(!col('ricevute')['2026_0004'].emailInviata);
  });
  await t('invio ai due genitori con il PDF in allegato; registra l’esito senza indirizzi in chiaro', async () => {
    const r = await chiama({ ricevutaId: '2026_0001' });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.inviata, true); assert.deepStrictEqual(r.body.a.sort(), ['mamma@example.com', 'papa@example.com']);
    assert.strictEqual(invii.length, 2);
    const b = invii.find((x) => x.to[0].email === 'mamma@example.com');
    assert.strictEqual(b.sender.email, 'segreteria@victorvolley.it'); assert.ok(/Ciao Anna/.test(b.textContent));
    assert.strictEqual(b.attachment.length, 1); assert.strictEqual(b.attachment[0].name, 'Ricevuta-2026-0001.pdf');
    const pdf = Buffer.from(b.attachment[0].content, 'base64');
    assert.strictEqual(pdf.slice(0, 5).toString(), '%PDF-'); assert.strictEqual(await paginePdf(pdf), 1);
    const e = col('ricevute')['2026_0001'].emailInviata;
    assert.ok(e && e.da === 'dir1' && e.a.length === 2 && !JSON.stringify(e).includes('mamma@example.com'), JSON.stringify(e));
  });
  await t('non si rispedisce da sola; «rimanda» sì', async () => {
    invii = [];
    const r = await chiama({ ricevutaId: '2026_0001' });
    assert.strictEqual(r.body.inviata, false); assert.strictEqual(r.body.motivo, 'gia-inviata'); assert.strictEqual(invii.length, 0);
    const r2 = await chiama({ ricevutaId: '2026_0001', rimanda: true });
    assert.strictEqual(r2.body.inviata, true); assert.strictEqual(invii.length, 2);
  });
  await t('Brevo giù: errore 502 e niente segnato come inviato', async () => {
    nuova('2026_0006'); invii = []; tuttoGiu = true;
    const r = await chiama({ ricevutaId: '2026_0006' }); tuttoGiu = false;
    assert.strictEqual(r.code, 502); assert.ok(!col('ricevute')['2026_0006'].emailInviata);
  });
  await t('un solo genitore irraggiungibile: invia all’altro e lo segnala', async () => {
    nuova('2026_0007'); invii = []; giu = new Set(['papa@example.com']);
    const r = await chiama({ ricevutaId: '2026_0007' }); giu = new Set();
    assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.a, ['mamma@example.com']); assert.strictEqual(r.body.falliti, 1);
    assert.strictEqual(col('ricevute')['2026_0007'].emailInviata.a.length, 1);
  });
  await t('senza servizio email configurato: 503 e nessun invio', async () => {
    nuova('2026_0008'); const k = process.env.BREVO_API_KEY; delete process.env.BREVO_API_KEY; invii = [];
    const r = await chiama({ ricevutaId: '2026_0008' }); process.env.BREVO_API_KEY = k;
    assert.strictEqual(r.code, 503); assert.strictEqual(invii.length, 0);
  });

  await t('invio di prova: solo all\'email del chiamante (anche se il client ne manda un\'altra), PDF in allegato, nessuna scrittura sulle ricevute, voce nel Log', async () => {
    col('settings').asd = { denominazione: 'ASD Victor Volley', codiceFiscale: '00000000000', sede: 'Racale', rasd: true, luogo: 'Racale', presidente: 'Cuna Matteo' };
    col('firme').presidente = { img: FIRMA };
    const prima = JSON.stringify(store.ricevute); invii = [];
    const r = await chiama({ esempio: true, a: 'altro@example.com' });
    assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.a, ['dir@example.com']); assert.strictEqual(r.body.esempio, true);
    assert.strictEqual(invii.length, 1); assert.strictEqual(invii[0].to.length, 1); assert.strictEqual(invii[0].to[0].email, 'dir@example.com');
    assert.ok(invii[0].subject.startsWith('[ESEMPIO] ') && /ESEMPIO/.test(invii[0].textContent));
    assert.strictEqual(invii[0].attachment[0].name, 'Ricevuta-ESEMPIO.pdf');
    const pdf = Buffer.from(invii[0].attachment[0].content, 'base64');
    assert.strictEqual(pdf.slice(0, 5).toString(), '%PDF-'); assert.strictEqual(await paginePdf(pdf), 1);
    assert.strictEqual(JSON.stringify(store.ricevute), prima, 'il registro non deve cambiare');
    const log = Object.values(store.auditLog || {}); assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].dirigenteId, 'dir1'); assert.strictEqual(log[0].dirigenteNome, 'Dina Capo'); assert.strictEqual(log[0].entita, 'ricevuta');
    assert.ok(/^inviata a d\*\*\*@e\*\*\*\.com$/.test(log[0].campi[0].dopo), log[0].campi[0].dopo); assert.ok(!JSON.stringify(log).includes('dir@example.com'));
  });
  await t('invio di prova: permessi, account senza email e Brevo giù (nessuna voce nel Log se non parte)', async () => {
    invii = []; const logPrima = Object.keys(store.auditLog || {}).length;
    assert.strictEqual((await chiama({ esempio: true }, 'tok-gen')).code, 403);
    assert.strictEqual((await chiama({ esempio: true }, null)).code, 401);
    assert.strictEqual((await chiama({ esempio: true }, 'tok-senzamail')).code, 400);
    assert.strictEqual(invii.length, 0);
    tuttoGiu = true; const r = await chiama({ esempio: true }); tuttoGiu = false;
    assert.strictEqual(r.code, 502); assert.strictEqual(Object.keys(store.auditLog || {}).length, logPrima);
  });
  await t('registro emailInvii: ogni invio e rimando si aggiunge (indirizzi mascherati, chi, quando); massimo 50', async () => {
    nuova('2026_0020'); invii = [];
    await chiama({ ricevutaId: '2026_0020' }); await chiama({ ricevutaId: '2026_0020', rimanda: true });
    const reg = col('ricevute')['2026_0020'].emailInvii;
    assert.strictEqual(reg.length, 2); assert.strictEqual(reg[0].rimando, false); assert.strictEqual(reg[1].rimando, true);
    assert.strictEqual(reg[0].da, 'dir1'); assert.ok(reg[0].il && reg[0].a.length === 2 && reg[0].a.every((x) => x.includes('***')));
    assert.ok(!JSON.stringify(reg).includes('mamma@example.com'));
    col('ricevute')['2026_0020'].emailInvii = Array.from({ length: 60 }, (_, i) => ({ il: 'x' + i }));
    await chiama({ ricevutaId: '2026_0020', rimanda: true });
    const r50 = col('ricevute')['2026_0020'].emailInvii; assert.strictEqual(r50.length, 50); assert.strictEqual(r50[49].rimando, true);
  });

  console.log(process.exitCode ? 'Collaudo fallito.' : 'OK: ' + n + ' verifiche su PDF, destinatari e invio della ricevuta.');
})();
