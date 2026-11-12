#!/usr/bin/env node
/**
 * Collaudo dei ruoli dei dirigenti lato server:  node scripts/check-ruolo.js
 * api/_ruolo.js (stesse regole di firestore.rules): campo mancante o vuoto = presidente (chi c'è oggi non cambia),
 * confronto in minuscolo, valore sconosciuto = nessun permesso, account senza documento = nessun ruolo.
 * E controlla che le funzioni del server per i dirigenti usino il controllo (altrimenti un ruolo ridotto passerebbe).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = require('../api/_ruolo');

const doc = (dati) => ({ exists: dati !== undefined, data: () => dati });
let n = 0;
function t(nome, fn) { try { fn(); n++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + e.message); process.exitCode = 1; } }

t('senza campo, vuoto, null o non testo: presidente (nessun dirigente di oggi perde nulla)', () => {
  for (const d of [{}, { nome: 'x' }, { ruolo: '' }, { ruolo: null }, { ruolo: 5 }, { ruolo: undefined }]) {
    assert.strictEqual(R.ruoloDa(doc(d)), 'presidente', JSON.stringify(d));
    assert.ok(R.ePresidente(doc(d)) && R.puoGestireAtleti(doc(d)));
  }
});
t('presidente, segreteria e presenze (anche in maiuscolo)', () => {
  assert.strictEqual(R.ruoloDa(doc({ ruolo: 'Presidente' })), 'presidente');
  assert.ok(R.puoGestireAtleti(doc({ ruolo: 'segreteria' })) && !R.ePresidente(doc({ ruolo: 'segreteria' })));
  assert.ok(R.puoGestireAtleti(doc({ ruolo: 'SEGRETERIA' })));
  assert.ok(!R.puoGestireAtleti(doc({ ruolo: 'presenze' })) && !R.ePresidente(doc({ ruolo: 'presenze' })));
});
t('ruolo sconosciuto o account senza documento: nessun permesso', () => {
  assert.ok(!R.puoGestireAtleti(doc({ ruolo: 'boh' })) && !R.ePresidente(doc({ ruolo: 'boh' })));
  assert.ok(!R.puoGestireAtleti(doc(undefined)) && !R.ePresidente(doc(undefined)) && R.ruoloDa(null) === null);
});
t('snapshot senza data(): conta come presidente (compatibilità con i test e i finti)', () => {
  assert.strictEqual(R.ruoloDa({ exists: true }), 'presidente');
});
t('le funzioni del server per i dirigenti controllano il ruolo', () => {
  for (const f of ['cloudinary-firma', 'invia-ricevuta', 'invia-invito', 'set-athlete-password', 'promemoria-anteprima']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'api', f + '.js'), 'utf8');
    assert.ok(/require\('\.\/_ruolo'\)/.test(s) && /puoGestireAtleti\(/.test(s), f);
  }
});
t('le regole di Firestore hanno le stesse funzioni e il default presidente', () => {
  const r = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  assert.ok(/function ruoloDirigente\(\)/.test(r) && /: 'presidente';/.test(r), 'default presidente');
  for (const f of ['isPresidente', 'isSegreteria', 'isPresenze']) assert.ok(new RegExp('function ' + f + '\\(\\)').test(r), f);
});

if (process.exitCode) console.error('\nCollaudo ruoli: PROBLEMI (vedi sopra).');
else console.log('OK: ' + n + ' verifiche sui ruoli dei dirigenti (server e regole).');
