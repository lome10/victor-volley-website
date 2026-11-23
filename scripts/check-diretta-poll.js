#!/usr/bin/env node
/**
 * Collaudo del ritmo del tabellone in /diretta:  node scripts/check-diretta-poll.js
 * js/diretta.js chiede lo stato a Set Point Pulse (/api/club/victor-volley/live). Ogni richiesta conta nel
 * tetto di Vercel, quindi: ogni 5 s solo con una partita in corso ('live'), ogni 60 s senza partita
 * ('none') o a partita finita ('finished'); con la scheda nascosta nessuna richiesta.
 * Carica js/diretta.js in un ambiente finto con un orologio finto e conta QUANDO parte ogni richiesta.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'diretta.js'), 'utf8');
const SPP = 'https://victor-volley.setpointpulse.com/api/club/victor-volley/live';
const TEAM = (name) => ({ name: name, points: 3, sets: 0, timeouts: 0 });
const LIVE = { status: 'live', home: TEAM('VICTOR VOLLEY'), away: TEAM('OSPITI'), currentSet: 1, serving: 'home', setHistory: [] };
const FINISHED = Object.assign({}, LIVE, { status: 'finished', matchOver: true });
const NONE = { status: 'none', home: null, away: null, setHistory: [] };

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

/** Avvia la pagina finta. `risposte(n)` dà la risposta della n-esima richiesta al tabellone (null = errore di rete). */
async function avvia(risposte) {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const add = (fn, ms, every) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn: fn, every: every ? ms : 0 }); return id; };
  const clear = (id) => { timers.delete(id); };
  const listeners = {};
  const el = () => ({ innerHTML: '', hidden: false, querySelector: () => null, addEventListener: () => {} });
  const elements = { direttaTabellone: el(), direttaVideo: el(), direttaVideoMsg: el() };
  const document = {
    hidden: false,
    getElementById: (id) => elements[id] || null,
    querySelector: () => null,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  };
  const chiamate = [];
  const fetch = (url) => {
    if (url !== SPP) return Promise.resolve({ ok: true, json: () => Promise.resolve({ live: false, lastVideoId: null }) });
    const body = risposte(chiamate.length);
    chiamate.push(now);
    if (body === null) return Promise.reject(new Error('rete'));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };
  const window = { YOUTUBE_CHANNEL_ID: 'INSERISCI_CHANNEL_ID_YOUTUBE' };
  const DB = { load: (_k, cb) => cb(), failed: () => false, retry: () => {} };
  const VV = { getPartite: () => [], errorStateHtml: (m) => m, teamKey: (n) => String(n || '').toLowerCase() };
  new Function('window', 'document', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'location', 'DB', 'VV', 'esc', SRC)(
    window, document, fetch,
    (fn, ms) => add(fn, ms, false), clear, (fn, ms) => add(fn, ms, true), clear,
    { origin: 'https://www.victorvolley.it' }, DB, VV, (s) => String(s == null ? '' : s));
  (listeners.DOMContentLoaded || []).forEach((fn) => fn());
  await flush();

  /** Fa scorrere l'orologio finto fino a `fino` ms, eseguendo i timer in ordine. */
  async function avanza(fino) {
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= fino && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at += t.every; else timers.delete(id);
      t.fn();
      await flush();
    }
    now = fino;
  }
  return { chiamate, avanza, document };
}

let passed = 0;
async function t(nome, fn) {
  try { await fn(); passed++; } catch (e) { console.error('FALLITO: ' + nome + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; }
}
const intervalli = (c) => c.slice(1).map((x, i) => x - c[i]);

(async () => {
  await t("senza partita ('none') una richiesta al minuto", async () => {
    const p = await avvia(() => NONE);
    await p.avanza(5 * 60000);
    assert.deepStrictEqual(intervalli(p.chiamate), [60000, 60000, 60000, 60000, 60000]);
  });

  await t("con la partita in corso ('live') ogni 5 s, a partita finita di nuovo ogni 60 s", async () => {
    const seq = [NONE, LIVE, LIVE, LIVE, FINISHED, FINISHED, LIVE, LIVE];
    const p = await avvia((n) => seq[Math.min(n, seq.length - 1)]);
    await p.avanza(60000 + 15000 + 60000 + 60000 + 5000);
    assert.deepStrictEqual(intervalli(p.chiamate), [60000, 5000, 5000, 5000, 60000, 60000, 5000]);
  });

  await t('un errore di rete non accelera: senza partita resta 60 s, in partita resta 5 s', async () => {
    const seq = [NONE, null, null, LIVE, null, LIVE];
    const p = await avvia((n) => seq[Math.min(n, seq.length - 1)]);
    await p.avanza(3 * 60000 + 10000);
    assert.deepStrictEqual(intervalli(p.chiamate), [60000, 60000, 60000, 5000, 5000]);
  });

  await t('scheda nascosta: nessuna richiesta, riprende quando torna visibile', async () => {
    const p = await avvia(() => LIVE);
    assert.strictEqual(p.chiamate.length, 1);
    p.document.hidden = true;
    await p.avanza(5 * 60000);
    assert.strictEqual(p.chiamate.length, 1);
    p.document.hidden = false;
    await p.avanza(5 * 60000 + 5000);
    assert.strictEqual(p.chiamate.length, 2);
  });

  if (process.exitCode) console.error('\nCollaudo ritmo /diretta: ci sono errori.');
  else console.log('Collaudo ritmo /diretta: ' + passed + ' controlli superati.');
})();
