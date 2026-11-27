#!/usr/bin/env node
/* Nuvoletta "Ciao, sono Victor!" e avviso «In diretta» (scelta di Lorenzo, 27/11): se c'è l'avviso la nuvoletta
   non compare, perché coprirebbe "Guarda →" e la X dell'avviso. Il tasto "Chiedi a Victor" resta sempre.
   Fa girare i file veri js/live-banner.js e js/chatbot.js su una pagina finta (nessuna rete, nessun browser),
   con l'orologio in mano al test. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const DATI = JSON.parse(fs.readFileSync(path.join(root, 'data/chatbot.json'), 'utf8'));
const CODICE = {
  avviso: fs.readFileSync(path.join(root, 'js/live-banner.js'), 'utf8'),
  bot: fs.readFileSync(path.join(root, 'js/chatbot.js'), 'utf8')
};
let errors = 0;
const fail = (m) => { errors++; console.error('  ✗ ' + m); };

/* ---------- pagina finta: solo quello che i due file usano ---------- */
function pagina() {
  const ascolti = [];
  function nodo(tag) {
    const n = {
      tagName: String(tag).toUpperCase(), children: [], parentNode: null, hidden: false, id: '', className: '', textContent: '',
      type: '', value: '', attrs: {}, on: {},
      classList: { toggle() {}, add() {}, remove() {} },
      appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
      removeChild(c) { n.children = n.children.filter((x) => x !== c); c.parentNode = null; return c; },
      setAttribute(k, v) { n.attrs[k] = String(v); },
      getAttribute(k) { return n.attrs[k]; },
      addEventListener(t, f) { (n.on[t] = n.on[t] || []).push(f); },
      focus() {}, scrollIntoView() {},
      querySelector() { return nodo('button'); },
      querySelectorAll() { return []; },
      set innerHTML(v) { n._html = v; },
      get innerHTML() { return n._html || ''; }
    };
    return n;
  }
  const body = nodo('body');
  const trova = (n, id) => (n.id === id ? n : n.children.reduce((r, c) => r || trova(c, id), null));
  const document = {
    readyState: 'complete', body,
    createElement: nodo,
    getElementById: (id) => trova(body, id),
    addEventListener(t, f) { ascolti.push([t, f]); },
    dispatchEvent(ev) { ascolti.filter(([t]) => t === ev.type).forEach(([, f]) => f(ev)); return true; }
  };
  const timer = [];
  const storage = {};
  return {
    document, body, timer,
    sandbox: {
      document, console, Promise, Date, JSON, Math, Object, Array, String, Number, RegExp,
      CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
      location: { search: '' },
      sessionStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
      setTimeout: (f, ms) => { timer.push({ f, ms }); return timer.length; },
      clearTimeout() {},
      fetch: async () => ({ ok: true, json: async () => DATI }),
      esc: (s) => String(s)
    }
  };
}

const pad = (n) => (n < 10 ? '0' : '') + n;
const oggi = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const PARTITA = () => {
  const d = new Date();
  return { id: 'p1', stato: 'programmata', spp_code: 'X', data: oggi(), ora: pad(d.getHours()) + ':' + pad(d.getMinutes()), squadra_casa: 'VICTOR VOLLEY VITA', squadra_ospite: 'ALTRA' };
};

/* diretta: true/false; avvisoDopo: true = le partite arrivano DOPO che la nuvoletta è già comparsa */
async function prova(diretta, avvisoDopo) {
  const p = pagina();
  let caricato = null;
  p.sandbox.DB = { load: (_, cb) => { caricato = cb; } };
  p.sandbox.VV = { getPartite: () => (diretta ? [PARTITA()] : []) };
  p.sandbox.window = p.sandbox;
  vm.createContext(p.sandbox);
  vm.runInContext(CODICE.avviso, p.sandbox);    /* nelle pagine live-banner.js viene prima di chatbot.js */
  vm.runInContext(CODICE.bot, p.sandbox);
  await new Promise((r) => setImmediate(r));    /* fetch del json del chatbot */
  if (!avvisoDopo && caricato) caricato();
  p.timer.filter((t) => t.ms === 3500).forEach((t) => t.f());   /* passano 3,5 secondi */
  if (avvisoDopo && caricato) caricato();
  const tip = (function cerca(n) { return n.className === 'vvbot-tip' ? n : n.children.reduce((r, c) => r || cerca(c), null); })(p.body);
  const fab = (function cerca(n) { return n.className === 'vvbot-fab' ? n : n.children.reduce((r, c) => r || cerca(c), null); })(p.body);
  return { tip: tip && !tip.hidden, avviso: !!p.document.getElementById('liveBanner'), tasto: !!fab };
}

(async () => {
  const senza = await prova(false, false);
  if (!senza.tip) fail('senza diretta la nuvoletta deve comparire dopo 3,5 s');
  if (senza.avviso) fail('senza diretta non deve esserci l\'avviso');

  const con = await prova(true, false);
  if (!con.avviso) fail('con la diretta l\'avviso deve esserci');
  if (con.tip) fail('con l\'avviso «In diretta» la nuvoletta non deve comparire (copre "Guarda →" e la X)');
  if (!con.tasto) fail('il tasto "Chiedi a Victor" deve restare anche con l\'avviso');

  const dopo = await prova(true, true);
  if (!dopo.avviso) fail('avviso arrivato dopo: deve esserci');
  if (dopo.tip) fail('se l\'avviso arriva quando la nuvoletta è già aperta, la nuvoletta si chiude');

  console.log('check-chatbot-avviso: ' + (errors ? errors + ' errori' : 'tutto ok'));
  process.exit(errors ? 1 : 0);
})();
