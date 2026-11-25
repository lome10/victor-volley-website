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

  /* ---------- partite vere (risposte "dinamico") ----------
     Le domande con "dinamico" nel JSON rispondono con i dati della collection pubblica "partite"
     (la stessa del Calendario): prima la frase con la partita vera, poi la risposta fissa col link.
     Se i dati non arrivano resta solo la risposta fissa. */
  var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var FIRESTORE_PARTITE = 'https://firestore.googleapis.com/v1/projects/victor-volley/databases/(default)/documents/partite?pageSize=300';

  function oggiIso(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function nomeSquadra(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s'(.-])([a-zà-ù])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  function quando(p) {
    var d = new Date(p.data + 'T00:00:00');
    if (isNaN(d)) return p.data || '';
    return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + (p.ora ? ' alle ' + p.ora : '');
  }
  /* Categorie nominate nella domanda ("under 19", "u19", "prima divisione"): se nessuna, tutte. */
  function categorieChieste(partite, text) {
    var n = ' ' + norm(text) + ' ';
    var tutte = [];
    partite.forEach(function (p) { if (p.categoria && tutte.indexOf(p.categoria) === -1) tutte.push(p.categoria); });
    return tutte.filter(function (c) {
      var cn = norm(c), num = (cn.match(/\d+/) || [''])[0];
      return n.indexOf(' ' + cn + ' ') !== -1 || (num && (n.indexOf(' u' + num + ' ') !== -1 || n.indexOf(' under' + num + ' ') !== -1))
        || (/prima divisione/.test(cn) && /\b(1|prima) ?(a )?div/.test(n));
    });
  }
  function rispostaDinamica(tipo, partite, text, oggi) {
    var cats = categorieChieste(partite, text);
    var lista = cats.length ? partite.filter(function (p) { return cats.indexOf(p.categoria) !== -1; }) : partite;
    var ord = function (a, b) { return ((a.data || '') + (a.ora || '')) < ((b.data || '') + (b.ora || '')) ? -1 : 1; };
    var perCategoria = function (arr) {
      var visti = {}, out = [];
      arr.forEach(function (p) { if (!visti[p.categoria]) { visti[p.categoria] = true; out.push(p); } });
      return out;
    };
    if (tipo === 'prossima_partita') {
      var future = lista.filter(function (p) { return p.stato !== 'conclusa' && (p.data || '') >= oggi; }).sort(ord);
      if (!future.length) return cats.length ? 'Per ' + cats.join(' e ') + ' non ci sono partite in programma nel calendario.' : 'Al momento non ci sono partite in programma nel calendario.';
      var righe = perCategoria(future).map(function (p) {
        return p.categoria + ': ' + nomeSquadra(p.squadra_casa) + ' - ' + nomeSquadra(p.squadra_ospite) + ', ' + quando(p) + (p.palazzetto ? ', ' + p.palazzetto : '') + '.';
      });
      return (righe.length > 1 ? 'Le prossime partite:\n' : 'La prossima partita è ') + righe.join('\n');
    }
    if (tipo === 'ultimo_risultato') {
      var finite = lista.filter(function (p) { return p.stato === 'conclusa' && p.set_casa != null && p.set_ospite != null; }).sort(ord).reverse();
      if (!finite.length) return null;
      var r = perCategoria(finite).map(function (p) {
        var d = new Date(p.data + 'T00:00:00');
        return p.categoria + ': ' + nomeSquadra(p.squadra_casa) + ' ' + p.set_casa + '-' + p.set_ospite + ' ' + nomeSquadra(p.squadra_ospite) + (isNaN(d) ? '' : ' (' + d.getDate() + ' ' + MESI[d.getMonth()] + ')') + '.';
      });
      return (r.length > 1 ? 'Gli ultimi risultati:\n' : 'L\'ultimo risultato: ') + r.join('\n');
    }
    return null;
  }
  function valoreFirestore(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return +v.integerValue;
    if ('doubleValue' in v) return v.doubleValue;
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    return null;
  }
  var partiteCache = null;
  function caricaPartite() {
    if (window.VV && typeof VV.getPartite === 'function' && VV.getPartite().length) return Promise.resolve(VV.getPartite());
    if (partiteCache) return partiteCache;
    partiteCache = fetch(FIRESTORE_PARTITE)
      .then(function (r) { if (!r.ok) throw new Error('partite ' + r.status); return r.json(); })
      .then(function (j) {
        return (j.documents || []).map(function (doc) {
          var o = {};
          Object.keys(doc.fields || {}).forEach(function (k) { o[k] = valoreFirestore(doc.fields[k]); });
          return o;
        });
      })
      .catch(function (e) { partiteCache = null; throw e; });
    return partiteCache;
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

  function answer(entry, text) {
    clearChips();
    if (entry.dinamico) {
      var attesa = bubble('bot', 'Controllo il calendario…');
      caricaPartite()
        .then(function (partite) { return rispostaDinamica(entry.dinamico, partite, text || '', oggiIso()); })
        .catch(function (e) { if (window.console) console.warn('[chatbot] partite', e); return null; })
        .then(function (frase) {
          attesa.parentNode.parentNode.removeChild(attesa.parentNode);
          if (frase) bubble('bot', frase);
          bubble('bot', entry.risposta, entry.link);
          after();
        });
      return;
    }
    bubble('bot', entry.risposta, entry.link);
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
      answer(res[0].e, text);
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
  function hideTip(remember) {
    if (el.tip) el.tip.hidden = true;
    if (remember) { try { sessionStorage.setItem('vvbot_tip', '1'); } catch (e) { /* senza storage: l'invito riappare, nessun danno */ } }
  }
  function showTipLater() {
    var seen = false;
    try { seen = sessionStorage.getItem('vvbot_tip') === '1'; } catch (e) { /* ignora */ }
    if (seen || !state.data.invito) return;
    setTimeout(function () { if (!state.open) { el.tip.hidden = false; } }, 3500);
  }

  function setOpen(open) {
    state.open = open;
    if (open) hideTip(true);
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
    el.btn.appendChild(h('span', 'vvbot-fab-ico', '🏐'));
    el.btn.appendChild(h('span', 'vvbot-fab-txt', state.data.etichetta || 'Chiedi a Victor'));
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
    el.tip = h('div', 'vvbot-tip');
    el.tip.hidden = true;
    var tipTxt = h('button', 'vvbot-tip-txt', state.data.invito || '');
    tipTxt.type = 'button';
    tipTxt.addEventListener('click', function () { hideTip(true); setOpen(true); });
    var tipX = h('button', 'vvbot-tip-x', '×');
    tipX.type = 'button';
    tipX.setAttribute('aria-label', 'Chiudi il suggerimento');
    tipX.addEventListener('click', function () { hideTip(true); });
    el.tip.appendChild(tipTxt);
    el.tip.appendChild(tipX);
    root.appendChild(el.tip);
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
    else showTipLater();
  }

  /* per i test in Node: nessun DOM */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      _prepare: function (data) { state.data = data; state.flat = []; data.categorie.forEach(function (c) { c.domande.forEach(function (d) { state.flat.push(d); }); }); },
      _search: search,
      _norm: norm,
      _dinamica: rispostaDinamica
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
