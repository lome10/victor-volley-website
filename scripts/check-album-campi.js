#!/usr/bin/env node
/* Ordine e copertina degli album (VVW-43, revisione di Geppetto 27/11): lo spostamento e la copertina scrivono
   SOLO i campi `order` / `cover` (update in un'unica scrittura), mai l'elenco delle foto. Così un caricamento di
   foto in corso o un altro admin aperto non perdono foto, e il registro ha una riga per spostamento.
   Firestore finto, js/data.js e js/db.js veri. Nessuna rete, nessun dato reale. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const scritture = [];          /* ogni scrittura arrivata al "server": { tipo, fid, dati } */
const registro = [];
const ALBUM = [
  { id: 1, title: 'Uno', date: '2026-01-01', photos: [{ id: 'vv/1a' }, { id: 'vv/1b' }], photoCount: 2 },
  { id: 2, title: 'Due', date: '2026-02-01', photos: [{ id: 'vv/2a' }], photoCount: 1 },
  { id: 3, title: 'Tre', date: '2026-03-01', photos: [{ id: 'vv/3a' }], photoCount: 1 }
];
const presto = () => new Promise((ok) => setTimeout(ok, 5));
const doc = (fid) => ({
  set: (dati) => { scritture.push({ tipo: 'set', fid, dati }); return presto(); },
  update: (dati) => { scritture.push({ tipo: 'update', fid, dati }); return presto(); },
  get: () => Promise.resolve({ exists: false, data: () => ({}) }),
  delete: () => Promise.resolve()
});
const col = (name) => ({
  doc,
  add: () => Promise.resolve({ id: 'nuovo' }),
  get: () => Promise.resolve({
    forEach: (f) => (name === 'albums' ? ALBUM : []).forEach((a) => f({ id: 'F' + a.id, data: () => JSON.parse(JSON.stringify(a)) }))
  })
});
const batch = () => {
  const ops = [];
  return {
    update: (ref, dati) => { ops.push(() => ref.update(dati)); },
    set: (ref, dati) => { ops.push(() => ref.set(dati)); },
    commit: () => Promise.all(ops.map((f) => f()))
  };
};
const win = { db: { collection: col, batch }, Admin: { avviso() {} }, alert() {}, event: null, setTimeout, clearTimeout, console: { error() {}, warn() {}, log() {} } };
win.window = win;
vm.createContext(win);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), win);
vm.runInContext(fs.readFileSync(path.join(root, 'js/db.js'), 'utf8'), win);
const { VV, DB } = win;

let errori = 0;
const ok = (nome, cond) => { if (!cond) { errori++; console.error('  ✗ ' + nome); } };
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => DB.load(['albums'], r));
  DB.setAuditHook((entita, id, label, azione, cambi) => registro.push({ entita, id, label, cambi }));
  ok('esiste DB.saveAlbumFields (scrive solo i campi)', typeof DB.saveAlbumFields === 'function');
  ok('esiste DB.isSaving', typeof DB.isSaving === 'function');
  if (errori) { console.error('check-album-campi: ' + errori + ' errori'); process.exit(1); }

  /* 1. primo spostamento: tutti gli album ricevono order, ma solo come campo */
  const cambi = VV.moveAlbum(VV.getAlbums(), 1, -1);   /* ordine 3,2,1 → 3,1,2 */
  let fatto = false;
  const r = DB.saveAlbumFields(cambi.map((a) => ({ id: a.id, fields: { order: a.order } })), 'lo spostamento',
    { id: 1, label: 'Uno', campo: 'posizione', prima: 3, dopo: 2 }, () => { fatto = true; });
  ok('1a risponde subito (non null)', r === true);
  ok('1b in corso: DB.isSaving("saveAlbum") vero', DB.isSaving('saveAlbum') === true);
  ok('1c la copia locale ha già il nuovo ordine', VV.sortAlbums(VV.getAlbums()).map((a) => a.id).join() === '3,1,2');
  ok('1d un secondo spostamento mentre il primo è in corso viene rifiutato (null), non sovrascrive', DB.saveAlbumFields([{ id: 2, fields: { order: 9 } }], 'x', null, () => {}) === null);
  await attendi(40);
  ok('1e callback a scrittura confermata', fatto === true);
  ok('1f nessun set(): solo update', scritture.length === 3 && scritture.every((s) => s.tipo === 'update'));
  ok('1g ogni update contiene solo {order}, niente foto', scritture.every((s) => Object.keys(s.dati).join() === 'order'));
  ok('1h una sola riga di registro', registro.length === 1 && registro[0].cambi[0].campo === 'posizione');
  ok('1i finita la scrittura isSaving torna falso', DB.isSaving('saveAlbum') === false);
  ok('1l le foto locali sono intatte', VV.getAlbum(1).photos.length === 2);

  /* 2. foto aggiunte da un altro admin (sul server, non qui): lo spostamento non le tocca perché non scrive photos */
  scritture.length = 0; registro.length = 0;
  DB.saveAlbumFields(VV.moveAlbum(VV.getAlbums(), 2, -1).map((a) => ({ id: a.id, fields: { order: a.order } })), 'lo spostamento',
    { id: 2, label: 'Due', campo: 'posizione', prima: 3, dopo: 2 }, () => {});
  await attendi(40);
  ok('2a solo i due album che si scambiano', scritture.length === 2 && scritture.every((s) => s.tipo === 'update' && !('photos' in s.dati)));

  /* 3. copertina: un solo update con {cover} */
  scritture.length = 0; registro.length = 0;
  DB.saveAlbumFields([{ id: 1, fields: { cover: 'vv/1b' } }], 'la copertina', { id: 1, label: 'Uno', campo: 'copertina', prima: '', dopo: 'vv/1b' }, () => {});
  await attendi(40);
  ok('3a un solo update {cover} sull\'album giusto', scritture.length === 1 && scritture[0].fid === 'F1' && Object.keys(scritture[0].dati).join() === 'cover');
  ok('3b la copertina locale è quella scelta', VV.albumCoverId(VV.getAlbum(1)) === 'vv/1b');
  ok('3c una riga di registro', registro.length === 1 && registro[0].cambi[0].dopo === 'vv/1b');

  /* 4. caricamento foto (DB.saveAlbum dell'album intero) in corso: isSaving lo vede, l'admin ferma le frecce */
  scritture.length = 0;
  DB.saveAlbum(Object.assign({}, VV.getAlbum(3), { photos: VV.getAlbum(3).photos.concat([{ id: 'vv/3b' }]) }), () => {});
  ok('4a isSaving vero durante il salvataggio delle foto', DB.isSaving('saveAlbum') === true);
  await attendi(40);
  ok('4b e falso dopo', DB.isSaving('saveAlbum') === false);

  /* 5. admin: frecce e Copertina passano da saveAlbumFields e si fermano durante un caricamento */
  const cms = fs.readFileSync(path.join(root, 'js/admin/cms.js'), 'utf8');
  const corpo = (nome) => { const i = cms.indexOf('    ' + nome + ': function'); return i < 0 ? '' : cms.slice(i, cms.indexOf('\n    },', i)); };
  ['moveAlbum', 'setAlbumCover'].forEach((n) => {
    const c = corpo(n);
    ok('5 ' + n + ' usa DB.saveAlbumFields e non DB.saveAlbum', /DB\.saveAlbumFields\(/.test(c) && !/DB\.saveAlbum\(/.test(c));
    ok('5 ' + n + ' si ferma durante un caricamento o un salvataggio', /_photoUploading/.test(c) && /DB\.isSaving\('saveAlbum'\)/.test(c));
    ok('5 ' + n + ' avvisa se il salvataggio viene rifiutato (null)', /=== null/.test(c));
  });

  console.log('check-album-campi: ' + (errori ? errori + ' errori' : 'tutto ok'));
  process.exit(errori ? 1 : 0);
})();
