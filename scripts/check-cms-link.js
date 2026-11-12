#!/usr/bin/env node
/**
 * Collaudo dei link degli articoli:  node scripts/check-cms-link.js
 * 1) il bottone «link» dell'editor (js/admin/cms.js, _urlLinkSicuro): solo http/https/mailto/tel, https:// se manca il protocollo;
 * 2) la ripulitura dell'articolo sul sito pubblico (js/pages/news-dettaglio-1.js, URI_AMMESSI usata da DOMPurify).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function t(nome, fn) { try { fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } }
function estrai(file, tag) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').split(String.fromCharCode(13)).join('');
  const i = src.indexOf(tag + ':inizio'), j = src.indexOf(tag + ':fine');
  assert.ok(i > 0 && j > i, tag + ' non trovato in ' + file);
  return src.slice(src.indexOf('\n', i) + 1, src.lastIndexOf('\n', j));
}

const sicuro = new Function(estrai('js/admin/cms.js', 'LINK-SICURO') + '; return _urlLinkSicuro;')();

t('Editor: http, https, mailto e tel passano così come sono', () => {
  ['https://www.victorvolley.it/news', 'http://esempio.it', 'HTTPS://ESEMPIO.IT', 'mailto:info@victorvolley.it', 'tel:+390801234567'].forEach((u) => assert.strictEqual(sicuro(u), u, u));
});
t('Editor: senza protocollo si aggiunge https://', () => {
  assert.strictEqual(sicuro('www.victorvolley.it'), 'https://www.victorvolley.it');
  assert.strictEqual(sicuro('  victorvolley.it/news  '), 'https://victorvolley.it/news');
  assert.strictEqual(sicuro('sito.it:8080/pagina'), 'https://sito.it:8080/pagina', 'host:porta non è un protocollo');
  assert.strictEqual(sicuro('//cdn.esempio.it/x'), 'https://cdn.esempio.it/x');
});
t('Editor: javascript:, data:, vbscript: e altri protocolli si scartano, anche travestiti', () => {
  ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'java\nscript:alert(1)', 'java\tscript:alert(1)', 'jav&#x61;script:alert(1)'.replace('&#x61;', 'a'),
    'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'ftp://esempio.it/f', 'file:///C:/x', 'sms:333', 'blob:https://x', '\u0001javascript:alert(1)', 'https:javascript:alert(1)'.replace('https:', 'javascript:')]
    .forEach((u) => assert.strictEqual(sicuro(u), '', JSON.stringify(u)));
});
t('Editor: vuoto, spazi e testo con spazi interni non diventano un link', () => {
  ['', '   ', null, undefined, 'due parole.it', 'https://'].forEach((u) => assert.ok(sicuro(u) === '' || sicuro(u) === 'https://', JSON.stringify(u)));
  assert.strictEqual(sicuro('due parole.it'), ''); assert.strictEqual(sicuro(''), ''); assert.strictEqual(sicuro('   '), '');
});

const uri = new Function(estrai('js/pages/news-dettaglio-1.js', 'URI-AMMESSI') + '; return URI_AMMESSI;')();
t('Sito pubblico: restano http, https, mailto, tel e gli indirizzi relativi', () => {
  ['https://victorvolley.it/x', 'http://esempio.it', 'mailto:a@b.it', 'tel:+39333', '/news/qualcosa', '#sezione', '?q=1', 'pagina.html', '../altro'].forEach((u) => assert.ok(uri.test(u), u));
});
t('Sito pubblico: javascript:, data:, vbscript:, ftp:, sms:, callto:, xmpp: non passano', () => {
  ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'vbscript:x', 'ftp://esempio.it', 'sms:333', 'callto:foo', 'xmpp:a@b', 'matrix:r/x', 'cid:abc'].forEach((u) => assert.ok(!uri.test(u), u));
});

console.log(process.exitCode ? 'Collaudo fallito.' : 'OK: ' + passed + ' verifiche sui link degli articoli (editor e sito pubblico).');
