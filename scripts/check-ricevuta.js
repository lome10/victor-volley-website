#!/usr/bin/env node
/**
 * Collaudo del documento ricevuta:  node scripts/check-ricevuta.js
 * Importo in lettere (regole dell'italiano: elisioni centottanta/ventotto, accento su «tré» solo a fine composto),
 * presenza nel documento, escape dell'HTML, firma accettata solo come PNG, riga del riferimento nascosta se vuota.
 */
const assert = require('assert');
global.window = global;
global.location = { origin: 'https://www.victorvolley.it' };
require('../js/ricevuta-doc.js');
const D = window.RicevutaDoc;

let passed = 0;
function t(nome, fn) {
  try { fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + e.message); process.exitCode = 1; }
}

const casi = {
  1: 'uno/00', 2: 'due/00', 3: 'tre/00', 10: 'dieci/00', 13: 'tredici/00', 16: 'sedici/00', 19: 'diciannove/00',
  20: 'venti/00', 21: 'ventuno/00', 23: 'ventitré/00', 28: 'ventotto/00', 31: 'trentuno/00', 33: 'trentatré/00',
  40: 'quaranta/00', 48: 'quarantotto/00', 80: 'ottanta/00', 81: 'ottantuno/00', 99: 'novantanove/00',
  100: 'cento/00', 101: 'centouno/00', 103: 'centotré/00', 108: 'centotto/00', 110: 'centodieci/00', 118: 'centodiciotto/00',
  121: 'centoventuno/00', 128: 'centoventotto/00', 150: 'centocinquanta/00', 180: 'centottanta/00', 181: 'centottantuno/00',
  188: 'centottantotto/00', 200: 'duecento/00', 208: 'duecentotto/00', 280: 'duecentottanta/00', 303: 'trecentotré/00',
  999: 'novecentonovantanove/00',
  1000: 'mille/00', 1001: 'milleuno/00', 1003: 'milletré/00', 1100: 'millecento/00', 1180: 'millecentottanta/00',
  2000: 'duemila/00', 2023: 'duemilaventitré/00', 3000: 'tremila/00', 10000: 'diecimila/00', 21000: 'ventunomila/00',
  23000: 'ventitremila/00', 100000: 'centomila/00', 123456: 'centoventitremilaquattrocentocinquantasei/00',
  1000000: 'un milione/00', 1000001: 'un milione uno/00', 1000003: 'un milione tre/00', 2500000: 'due milioni cinquecentomila/00',
  12.5: 'dodici/50', 150.5: 'centocinquanta/50', 0.99: 'zero/99', 19.99: 'diciannove/99', [0.1 + 0.2]: 'zero/30', 1234.56: 'milleduecentotrentaquattro/56'
};
Object.keys(casi).forEach((k) => t('in lettere: ' + k, () => assert.strictEqual(D.inLettere(Number(k)), casi[k])));

t('importo non valido o fuori intervallo → vuoto', () => {
  assert.strictEqual(D.inLettere(-5), '');
  assert.strictEqual(D.inLettere(1e12), '');
  assert.strictEqual(D.inLettere(NaN), '');
});

const ric = (extra) => Object.assign({
  numero: '2026/0001', data: '2026-10-05', importo: 150, stato: 'valida', tipoIncasso: 'Quota associativa', causale: 'Quota 2026',
  modalita: 'Bonifico', riferimento: '', bollo: 'Esente.',
  pagatore: { nome: 'ROSSI MARIO', cf: '', indirizzo: '', ruolo: 'Genitore / tutore' }, atleta: null,
  asd: { denominazione: 'ASD Victor Volley', codiceFiscale: '00000000000', sede: 'Racale', affiliazione: 'FIPAV', codiceAffiliazione: '', rasd: true, luogo: 'Racale', presidente: 'Cuna Matteo' }
}, extra || {});

t('il documento riporta l\'importo in lettere sotto «IMPORTO RICEVUTO»', () => {
  const h = D.html(ric(), 'x');
  assert.ok(h.includes('Euro centocinquanta/00'));
  assert.ok(h.indexOf('IMPORTO RICEVUTO') < h.indexOf('Euro centocinquanta/00'));
  assert.ok(D.html(ric({ importo: 123 }), 'x').includes('Euro centoventitré/00'));
});
t('riga «Riferimento pagamento» nascosta se vuota, presente se compilata', () => {
  assert.ok(!D.html(ric(), 'x').includes('Riferimento pagamento'));
  assert.ok(D.html(ric({ riferimento: 'CRO 123' }), 'x').includes('Riferimento pagamento'));
});
t('firma: accettato solo data:image/png;base64', () => {
  const ok = D.html(ric({ asd: Object.assign({}, ric().asd, { firma: 'data:image/png;base64,AAAA' }) }), 'x');
  const ko = D.html(ric({ asd: Object.assign({}, ric().asd, { firma: 'javascript:alert(1)' }) }), 'x');
  const svg = D.html(ric({ asd: Object.assign({}, ric().asd, { firma: 'data:image/svg+xml;base64,AAAA' }) }), 'x');
  assert.ok(/class="sigimg"/.test(ok)); assert.ok(!/class="sigimg"/.test(ko)); assert.ok(!/class="sigimg"/.test(svg));
});
t('HTML dei campi escapato', () => {
  const h = D.html(ric({ causale: '<script>alert(1)</script>', pagatore: { nome: 'O\'Neil <b>x</b>', cf: '', indirizzo: '', ruolo: 'Pagatore' } }), 'x');
  assert.ok(!h.includes('<script>alert(1)</script>') && !h.includes('<b>x</b>'));
  assert.ok(h.includes('O&#39;Neil'));
});
t('ricevuta annullata: timbro e motivo', () => {
  const h = D.html(ric({ stato: 'annullata', dataAnnullamento: '2026-10-06', motivoAnnullamento: 'Errore' }), 'x');
  assert.ok(h.includes('ANNULLATA') && h.includes('Errore'));
  assert.ok(!D.html(ric(), 'x').includes('ANNULLATA'));
});

if (process.exitCode) { console.error('\nCollaudo ricevuta: PROBLEMI (vedi sopra).'); }
else { console.log('OK: ' + passed + ' verifiche sulla ricevuta (importo in lettere, documento, escape, firma).'); }
