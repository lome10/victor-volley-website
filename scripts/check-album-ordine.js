#!/usr/bin/env node
/* Ordine delle gallerie scelto in admin (VVW-43, scelte di Lorenzo 27/11): vale ovunque (pagina Galleria, Home,
   admin, app) e gli album nuovi (senza `order`) stanno in cima, dal più recente.
   Controlla VV.sortAlbums e VV.moveAlbum (js/data.js) e che /api/app-pubblico usi la stessa regola. Nessuna rete. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const finestra = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), { window: finestra });
const VV = finestra.VV;
const L = require('../api/_app-pubblico-logic');

let n = 0, errori = 0;
function t(nome, fn) {
  try { fn(); n++; } catch (e) { errori++; console.error('  ✗ ' + nome + '\n    ' + e.message.split('\n').join('\n    ')); }
}
const ids = (l) => l.map((a) => a.id);
const A = (id, date, order) => (order === undefined ? { id, date, title: 'A' + id } : { id, date, title: 'A' + id, order });

t('senza nessun ordine: dal più recente, a pari data id più alto prima (come prima)', () => {
  assert.deepStrictEqual(ids(VV.sortAlbums([A(1, '2026-01-01'), A(2, '2026-03-01'), A(3, '2026-03-01'), A(4, '')])), [3, 2, 1, 4]);
});

t('con l\'ordine di admin: 1, 2, 3…; gli album nuovi (senza order) in cima', () => {
  const l = [A(1, '2026-01-01', 2), A(2, '2026-03-01', 3), A(3, '2025-01-01', 1), A(9, '2026-11-27'), A(8, '2026-11-01')];
  assert.deepStrictEqual(ids(VV.sortAlbums(l)), [9, 8, 3, 1, 2]);
  assert.deepStrictEqual(ids(l), [1, 2, 3, 9, 8], 'sortAlbums non deve cambiare la lista originale');
});

t('sposta prima / dopo: nuovo order 1..n solo per chi cambia; ai bordi non si muove', () => {
  const l = [A(1, '2026-01-01'), A(2, '2026-02-01'), A(3, '2026-03-01')];   /* ordine: 3, 2, 1 */
  const c = VV.moveAlbum(l, 1, -1);                                          /* 1 sale: 3, 1, 2 */
  assert.deepStrictEqual(c.map((a) => [a.id, a.order]), [[3, 1], [1, 2], [2, 3]]);
  assert.strictEqual(l[0].order, undefined, 'moveAlbum non deve cambiare la lista originale');
  const dopo = l.map((a) => c.find((x) => x.id === a.id) || a);
  assert.deepStrictEqual(ids(VV.sortAlbums(dopo)), [3, 1, 2]);
  assert.strictEqual(VV.moveAlbum(dopo, 3, -1).length, 0);
  assert.strictEqual(VV.moveAlbum(dopo, 2, 1).length, 0);
  assert.strictEqual(VV.moveAlbum(dopo, 99, 1).length, 0);
  /* un secondo spostamento salva solo i due che si scambiano */
  assert.deepStrictEqual(VV.moveAlbum(dopo, 2, -1).map((a) => [a.id, a.order]), [[2, 2], [1, 3]]);
});

t('album nuovo dopo un riordino: compare in cima; spostandolo prende un posto e tutti tornano 1..n', () => {
  const l = [A(1, '2026-01-01', 1), A(2, '2026-02-01', 2), A(5, '2026-11-27')];
  assert.deepStrictEqual(ids(VV.sortAlbums(l)), [5, 1, 2]);
  assert.deepStrictEqual(VV.moveAlbum(l, 5, 1).map((a) => [a.id, a.order]), [[1, 1], [5, 2], [2, 3]].filter(([id, o]) => !(id === 1 && o === 1)));
});

t('/api/app-pubblico: stessa regola di js/data.js', () => {
  const casi = [
    [A(1, '2026-01-01'), A(2, '2026-03-01'), A(3, '2026-03-01'), A(4, '')],
    [A(1, '2026-01-01', 2), A(2, '2026-03-01', 3), A(3, '2025-01-01', 1), A(9, '2026-11-27'), A(8, '2026-11-01')],
    [A(1, '2026-01-01', 1), A(2, '2026-01-01', 1), A(3, '2026-02-01', 1)]
  ];
  casi.forEach((c) => assert.deepStrictEqual(ids(L.ordinaAlbum(c)), ids(VV.sortAlbums(c))));
  const foto = [{ id: 'f', w: 1, h: 1 }];
  const corpo = L.componi({ albums: [A(1, '2026-01-01', 2), A(2, '2026-03-01', 1), A(3, '2026-11-27'), { id: 4, date: '2026-12-01', title: 'vuoto', photos: [] }].map((a) => Object.assign({ photos: foto }, a)) }, new Date());
  assert.deepStrictEqual(ids(corpo.album), [3, 2, 1], 'nuovo in cima, poi l\'ordine di admin; senza foto non c\'è');
});

t('copertina: scelta in admin se c\'è ancora, se no la prima foto; uguale nel sito e in /api/app-pubblico', () => {
  const ph = [{ id: 'vv/a' }, { id: 'vv/b' }];
  assert.strictEqual(VV.albumCoverId({ photos: ph }), 'vv/a');
  assert.strictEqual(VV.albumCoverId({ photos: ph, cover: 'vv/b' }), 'vv/b');
  assert.strictEqual(VV.albumCoverId({ photos: ph, cover: 'vv/cancellata' }), 'vv/a');
  assert.strictEqual(VV.albumCoverId({ photos: [] , cover: 'vv/b' }), '');
  assert.strictEqual(VV.albumCoverId(null), '');
  const foto = [{ id: 'vv/a', w: 1, h: 1 }, { id: 'vv/b', w: 1, h: 1 }];
  const corpo = L.componi({ albums: [
    { id: 1, date: '2026-01-01', title: 'x', photos: foto, cover: 'vv/b' },
    { id: 2, date: '2026-02-01', title: 'y', photos: foto },
    { id: 3, date: '2026-03-01', title: 'z', photos: foto, cover: 'vv/cancellata' }
  ] }, new Date());
  assert.deepStrictEqual(corpo.album.map((a) => [a.id, a.copertina]), [[3, 'vv/a'], [2, 'vv/a'], [1, 'vv/b']]);
  corpo.album.forEach((a) => assert.strictEqual(a.copertina, VV.albumCoverId({ photos: a.photos, cover: [null, 'vv/b', null, 'vv/cancellata'][a.id] })));
});

if (errori) { console.error('check-album-ordine: ' + errori + ' errori'); process.exit(1); }
console.log('check-album-ordine: ' + n + ' controlli superati');
