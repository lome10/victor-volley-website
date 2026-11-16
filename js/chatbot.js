/* Assistente Victor — chatbot a risposte fisse.
   Legge data/chatbot.json (categorie > domande con parole chiave) e risponde cercando
   la domanda piu' vicina a quello che scrive l'utente. Nessun servizio esterno, nessun dato inviato:
   tutto avviene nel browser. Il testo scritto dall'utente non viene mai inserito come HTML. */
(function () {
  'use strict';

  var DATA_URL = '/data/chatbot.json';
  var INSTAGRAM = 'https://www.instagram.com/asdvictorvolley';   /* unico link esterno ammesso */
  var MIN_SCORE = 2;          /* sotto questa soglia: nessuna risposta sicura */
  var MAX_SUGGEST = 3;
  var STOP = ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'uno', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
    'e', 'o', 'ma', 'che', 'chi', 'cosa', 'come', 'dove', 'quando', 'quanto', 'quanti', 'quale', 'quali', 'si', 'mi', 'ti', 'ci',
    'vi', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'dal', 'dalla', 'nel',
    'nella', 'sul', 'sulla', 'mio', 'mia', 'tuo', 'tua', 'sono', 'ho', 'ha', 'hanno', 'e\'', 'posso', 'puo', 'puoi', 'vorrei',
    'voglio', 'fare', 'avete', 'avere', 'questo', 'questa', 'anche', 'non', 'se', 'ne', 'io', 'tu', 'noi', 'voi', 'piu', 'molto'];

  var state = { data: null, flat: [], open: false, started: false };
  var el = {};

  /* ---------- testo ---------- */
  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tokens(s) {
    return norm(s).split(' ').filter(function (t) { return t && STOP.indexOf(t) === -1; });
  }
  function stem(t) {            /* toglie la vocale finale: "squadra"/"squadre", "iscrivere"/"iscrizione" restano vicini */
    return t.length > 4 ? t.replace(/[aeio]$/, '') : t;
  }

  /* ---------- ricerca ---------- */
  function score(entry, qNorm, qTokens) {
    var s = 0, i, p, pn;
    var padded = ' ' + qNorm + ' ';
    for (i = 0; i < entry.parole.length; i++) {
      p = entry.parole[i];
      pn = norm(p);
      if (!pn) continue;
      if (padded.indexOf(' ' + pn + ' ') !== -1) {
        s += pn.indexOf(' ') !== -1 ? 4 : 3;                    /* frase intera o parola chiave */
      } else {
        var pt = tokens(p);
        if (pt.length > 1) {                                     /* frase: tutte le parole presenti, in qualsiasi ordine */
          var all = pt.every(function (t) { return qTokens.indexOf(t) !== -1 || qTokens.some(function (u) { return stem(u) === stem(t); }); });
          if (all) s += 3;
        } else if (pt.length === 1 && qTokens.some(function (u) { return stem(u) === stem(pt[0]); })) {
          s += 2;                                                /* stessa radice */
        }
      }
    }
    /* parole in comune con il testo della domanda tipo */
    var qt = tokens(entry.q);
    qt.forEach(function (t) {
      if (qTokens.some(function (u) { return stem(u) === stem(t); })) s += 1;
    });
    return s;
  }

  function search(text) {
    var qNorm = norm(text), qTokens = tokens(text);
    if (!qTokens.length) return [];
    return state.flat.map(function (e) { return { e: e, s: score(e, qNorm, qTokens) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s; });
  }

  /* ---------- DOM ---------- */
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function scrollDown() { el.log.scrollTop = el.log.scrollHeight; }

  function bubble(who, text, link) {
    var row = h('div', 'vvbot-row vvbot-' + who);
    var b = h('div', 'vvbot-bubble');
    b.appendChild(h('p', null, text));
    if (link && link.url && (/^\//.test(link.url) || link.url === INSTAGRAM)) {   /* link interni, o il profilo Instagram */
      var a = h('a', 'vvbot-link', link.testo || 'Apri');
      a.href = link.url;
      if (link.url === INSTAGRAM) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      b.appendChild(a);
    }
    row.appendChild(b);
    el.log.appendChild(row);
    scrollDown();
    return b;
  }

  function chips(items, onPick, cls) {
    var wrap = h('div', 'vvbot-chips' + (cls ? ' ' + cls : ''));
    items.forEach(function (it) {
      var c = h('button', 'vvbot-chip', it.label);
      c.type = 'button';
      c.addEventListener('click', function () { onPick(it); });
      wrap.appendChild(c);
    });
    el.log.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function clearChips() {
    var all = el.log.querySelectorAll('.vvbot-chips');
    for (var i = 0; i < all.length; i++) all[i].parentNode.removeChild(all[i]);
  }

  function showTopics() {
    clearChips();
    chips(state.data.categorie.map(function (c) { return { label: c.titolo, cat: c }; }), function (it) {
      bubble('user', it.label);
      showCategory(it.cat);
    });
  }

  function showCategory(cat) {
    clearChips();
    bubble('bot', 'Ecco le domande su «' + cat.titolo + '». Scegline una.');
    var items = cat.domande.map(function (d) { return { label: d.q, entry: d }; });
    items.push({ label: '← Altri argomenti', back: true });
    chips(items, function (it) {
      if (it.back) { bubble('user', 'Altri argomenti'); showTopics(); return; }
      bubble('user', it.entry.q);
      answer(it.entry);
    }, 'vvbot-chips-col');
  }

  function answer(entry) {
    clearChips();
    bubble('bot', entry.risposta, entry.link);
    if (entry.da_compilare) { /* risposta generica: non e' ancora stata scritta dalla societa' */ }
    after();
  }

  function after() {
    chips([{ label: 'Altra domanda', more: true }, { label: 'Parla con la società', human: true }], function (it) {
      if (it.human) { bubble('user', 'Parla con la società'); human(); return; }
      bubble('user', 'Altra domanda');
      showTopics();
    });
  }

  function human() {
    clearChips();
    bubble('bot', 'Scrivici a ' + state.data.email + ' oppure usa il modulo contatti: ti risponde una persona della società.', state.data.fallback_link);
    after();
  }

  function onSend(text) {
    text = String(text || '').trim().slice(0, 300);
    if (!text) return;
    bubble('user', text);
    clearChips();
    var n = norm(text);
    if (state.data.saluti.indexOf(n) !== -1) { bubble('bot', 'Ciao! Come posso aiutarti?'); showTopics(); return; }
    if (state.data.grazie.indexOf(n) !== -1) { bubble('bot', 'Di niente! Se hai altre domande sono qui.'); after(); return; }
    var res = search(text);
    if (res.length && res[0].s >= MIN_SCORE && (res.length === 1 || res[0].s > res[1].s)) {
      answer(res[0].e);
      return;
    }
    var near = res.filter(function (x) { return x.s >= MIN_SCORE - 1; }).slice(0, MAX_SUGGEST);
    if (near.length) {
      bubble('bot', 'Forse cercavi una di queste domande?');
      var items = near.map(function (x) { return { label: x.e.q, entry: x.e }; });
      items.push({ label: 'Nessuna di queste', none: true });
      chips(items, function (it) {
        if (it.none) { bubble('user', 'Nessuna di queste'); human(); return; }
        bubble('user', it.entry.q);
        answer(it.entry);
      }, 'vvbot-chips-col');
      return;
    }
    bubble('bot', state.data.fallback, state.data.fallback_link);
    after();
  }

  /* ---------- apertura ---------- */
  function setOpen(open) {
    state.open = open;
    el.panel.hidden = !open;
    el.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    el.btn.classList.toggle('is-open', open);
    if (open) {
      if (!state.started) { state.started = true; start(); }
      setTimeout(function () { el.input.focus(); }, 50);
    }
  }

  function start() {
    bubble('bot', state.data.saluto);
    var note = h('p', 'vvbot-note', state.data.avviso);
    el.log.appendChild(note);
    showTopics();
  }

  function build() {
    var root = h('div', 'vvbot');
    root.setAttribute('data-vvbot', '');

    el.btn = h('button', 'vvbot-fab');
    el.btn.type = 'button';
    el.btn.setAttribute('aria-label', 'Apri l\'assistente Victor');
    el.btn.setAttribute('aria-expanded', 'false');
    el.btn.setAttribute('aria-controls', 'vvbot-panel');
    el.btn.appendChild(h('span', 'vvbot-fab-ico', '💬'));
    el.btn.appendChild(h('span', 'vvbot-fab-txt', 'Serve aiuto?'));
    el.btn.addEventListener('click', function () { setOpen(!state.open); });

    el.panel = h('section', 'vvbot-panel');
    el.panel.id = 'vvbot-panel';
    el.panel.hidden = true;
    el.panel.setAttribute('role', 'dialog');
    el.panel.setAttribute('aria-label', state.data.nome);

    var head = h('header', 'vvbot-head');
    var ttl = h('div', 'vvbot-title');
    ttl.appendChild(h('strong', null, state.data.nome));
    ttl.appendChild(h('span', null, 'Risponde subito, senza registrarti'));
    head.appendChild(ttl);
    var close = h('button', 'vvbot-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Chiudi l\'assistente');
    close.addEventListener('click', function () { setOpen(false); el.btn.focus(); });
    head.appendChild(close);

    el.log = h('div', 'vvbot-log');
    el.log.setAttribute('role', 'log');
    el.log.setAttribute('aria-live', 'polite');

    var form = h('form', 'vvbot-form');
    el.input = h('input', 'vvbot-input');
    el.input.type = 'text';
    el.input.maxLength = 300;
    el.input.placeholder = 'Scrivi la tua domanda…';
    el.input.setAttribute('aria-label', 'La tua domanda');
    el.input.autocomplete = 'off';
    var send = h('button', 'vvbot-send', 'Invia');
    send.type = 'submit';
    form.appendChild(el.input);
    form.appendChild(send);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var t = el.input.value;
      el.input.value = '';
      onSend(t);
    });

    el.panel.appendChild(head);
    el.panel.appendChild(el.log);
    el.panel.appendChild(form);
    root.appendChild(el.panel);
    root.appendChild(el.btn);
    document.body.appendChild(root);

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && state.open) { setOpen(false); el.btn.focus(); }
    });
  }

  function init(data) {
    state.data = data;
    state.flat = [];
    data.categorie.forEach(function (c) { c.domande.forEach(function (d) { state.flat.push(d); }); });
    build();
    if (/[?&]chatbot=1\b/.test(location.search)) setOpen(true);
  }

  /* per i test in Node: nessun DOM */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      _prepare: function (data) { state.data = data; state.flat = []; data.categorie.forEach(function (c) { c.domande.forEach(function (d) { state.flat.push(d); }); }); },
      _search: search,
      _norm: norm
    };
    return;
  }

  function load() {
    fetch(DATA_URL, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('chatbot ' + r.status); return r.json(); })
      .then(init)
      .catch(function (e) { if (window.console) console.warn('[chatbot]', e); });  /* se non si carica, il sito resta com'e' */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
