/* Controllo di js/db.js con un Firestore finto (nessuna rete, nessun dato reale):
   - il callback arriva solo a scrittura confermata;
   - scrittura rifiutata: banner in italiano, cache riletta, callback NON chiamato, pulsante riacceso;
   - senza rete (la scrittura non risponde mai): dopo il tempo massimo avviso + pulsante libero;
     se poi la scrittura riesce, avviso «ok» e il callback NON scatta (non sposta la schermata);
   - doppio salvataggio da Invio/codice (senza evento) ignorato finché il primo non finisce;
   - DB.errorMessage traduce Firebase/rete e lascia i nostri messaggi italiani.
   Uso: node scripts/check-db.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
let failNext = false, hang = false, releaseHang = null;
const banners = [];
let loads = 0;

const fakeDoc = () => ({
  set: () => hang
    ? new Promise(ok => { releaseHang = () => ok(); })
    : new Promise((ok, ko) => setTimeout(() => (failNext
      ? ko(failNext === 'sconosciuto' ? { code: 'qualcosa-di-nuovo', message: 'English text' } : { code: 'permission-denied', message: 'Missing or insufficient permissions.' })
      : ok()), 5)),
  delete: () => Promise.resolve(),
  get: () => { loads++; return Promise.resolve({ exists: false, data: () => ({}) }); }
});
const fakeCol = () => ({
  doc: fakeDoc,
  add: () => hang
    ? new Promise(ok => { releaseHang = () => ok({ id: 'F1' }); })
    : new Promise((ok, ko) => setTimeout(() => (failNext ? ko({ code: 'unavailable', message: 'x' }) : ok({ id: 'F1' })), 5)),
  get: () => { loads++; return Promise.resolve({ forEach() {} }); }
});
const VV = {
  saveArticle: a => Object.assign({ id: 7 }, a), getArticle: () => null, deleteArticle() {},
  _load() {}, applyGironeLogos: x => x, setSquadreGirone() {}, normalizeGirone: () => ({ squadre: [] })
};
const win = {
  db: { collection: fakeCol }, VV,
  Admin: { avviso: (t, tipo) => banners.push([tipo, t]) },
  alert: t => banners.push(['alert', t]),
  event: null, setTimeout, clearTimeout
};
win.window = win;
vm.createContext(win);
vm.runInContext('var VV = window.VV; var console = { error() {}, warn() {} };' + src, win);
const DB = win.DB;

let bad = 0;
function ok(label, cond) { if (!cond) { bad++; console.error('FALLITO: ' + label); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const bottone = () => ({ disabled: false, closest(s) { return s === 'button' ? this : null; } });

(async () => {
  /* 1. successo: cb dopo la scrittura */
  let cb = false;
  const saved = DB.saveArticle({ title: 'x' }, () => { cb = true; });
  ok('1a record restituito subito, cb non ancora chiamato', saved.id === 7 && cb === false);
  await wait(30);
  ok('1b cb chiamato a scrittura confermata, nessun banner', cb === true && banners.length === 0);

  /* 2. rifiuto: banner in italiano, cache riletta, niente cb */
  failNext = true; cb = false; const l0 = loads;
  DB.saveArticle({ title: 'y' }, () => { cb = true; });
  await wait(30);
  ok('2a cb NON chiamato', cb === false);
  ok('2b banner in italiano', banners.length === 1 && banners[0][0] === 'errore' && /Non hai il permesso/.test(banners[0][1]));
  ok('2c cache riletta da Firestore', loads > l0);
  ok('2d "Riprova" compare una volta sola (motivo senza Riprova)', (banners[0][1].match(/Riprova/g) || []).length === 1);
  /* motivo che contiene già «Riprova.» (errore sconosciuto): una volta sola, non due */
  banners.length = 0; DB.writeTimeoutMs = 15000;
  failNext = 'sconosciuto';
  DB.saveArticle({ title: 'y2' }, () => {});
  await wait(30);
  ok('2e "Riprova" una volta sola anche con "Errore imprevisto. Riprova."',
    banners.length === 1 && /Errore imprevisto\./.test(banners[0][1]) && (banners[0][1].match(/Riprova/g) || []).length === 1);
  failNext = false; banners.length = 0;

  /* 3. traduzioni */
  const e = DB.errorMessage;
  ok('3a password debole', /troppo debole/.test(e({ code: 'auth/weak-password', message: 'Firebase: Password should be at least 6 characters' })));
  ok('3b messaggio nostro lasciato com\'e\'', e(new Error('Questa persona è già un allenatore.')) === 'Questa persona è già un allenatore.');
  ok('3c rete', e({ message: 'Failed to fetch' }) === 'Connessione assente o instabile.');
  ok('3d codice sconosciuto in inglese -> generico', e({ code: 'qualcosa-di-nuovo', message: 'English text' }) === 'Errore imprevisto. Riprova.');
  ok('3e vuoto', e(null) === 'Errore imprevisto. Riprova.');
  ok('3f email gia\' registrata', e({ code: 'auth/email-already-in-use' }) === 'Email già registrata.');

  /* 4. pulsante spento durante la scrittura e riacceso dopo */
  const b1 = bottone(); win.event = { target: b1 };
  DB.saveArticle({ title: 'z' }, () => {});
  win.event = null;
  ok('4a pulsante spento durante', b1.disabled === true);
  await wait(30);
  ok('4b pulsante riacceso dopo', b1.disabled === false);

  /* 5. senza rete: la scrittura non risponde mai */
  hang = true; DB.writeTimeoutMs = 60; banners.length = 0; cb = false;
  const b2 = bottone(); win.event = { target: b2 };
  DB.saveArticle({ title: 'offline' }, () => { cb = true; });
  win.event = null;
  ok('5a pulsante spento durante l\'attesa', b2.disabled === true);
  await wait(20);
  ok('5b nessun banner prima del tempo massimo', banners.length === 0);
  await wait(80);
  ok('5c dopo il tempo massimo pulsante libero e cb NON chiamato', b2.disabled === false && cb === false);
  ok('5d il messaggio dice che puo\' completarsi dopo', banners.length === 1 && /Connessione assente/.test(banners[0][1]) && /Resta in coda e potrebbe completarsi/.test(banners[0][1]));

  /* 6. la scrittura in coda riesce dopo il timeout */
  releaseHang(); await wait(20);
  ok('6 banner ok a posteriori e cb ancora NON chiamato', banners.length === 2 && banners[1][0] === 'ok' && cb === false);

  /* 7. doppio salvataggio senza evento (Invio/codice) */
  hang = false; DB.writeTimeoutMs = 15000; banners.length = 0;
  let n = 0;
  const r1 = DB.saveArticle({ title: 'a' }, () => { n++; });
  const r2 = DB.saveArticle({ title: 'a' }, () => { n++; });
  ok('7a la seconda chiamata e\' ignorata', !!r1 && r2 === null);
  await wait(30);
  ok('7b un solo cb', n === 1);
  const r3 = DB.saveArticle({ title: 'b' }, () => { n++; });
  await wait(30);
  ok('7c finita la prima si puo\' salvare di nuovo', !!r3 && n === 2);
  const a = DB.saveArticle({ id: 1, title: 'x' }, () => {}), b = DB.saveArticle({ id: 2, title: 'y' }, () => {});
  ok('7d record diversi non si bloccano a vicenda', !!a && !!b);
  await wait(30);

  /* 8. dopo un errore la chiave si libera */
  failNext = true;
  DB.saveArticle({ title: 'c' }, () => {});
  await wait(30);
  failNext = false;
  ok('8 dopo un errore si puo\' riprovare', DB.saveArticle({ title: 'c' }, () => {}) !== null);
  await wait(30);

  if (bad) { console.error('check-db: ' + bad + ' controlli falliti'); process.exit(1); }
  console.log('check-db: OK (scrittura confermata, rifiutata, senza rete, doppio salvataggio, traduzioni)');
})();
