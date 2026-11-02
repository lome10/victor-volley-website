/* Victor Volley — Area Allenatore
   L'allenatore entra dal login dell'area dirigenti (/admin), che lo manda qui. Tre sezioni:
   - Atleti: l'elenco delle sue squadre (cognome, nome, data di nascita, telefono dei genitori, note per l'allenatore) da
     /api/allenatore-atleti, che controlla allenatori/{uid} e restituisce soltanto quei campi per le categorie assegnate;
   - Presenze: si segnano un giorno alla volta (comodo da telefono) o in una griglia con tutti i giorni (da computer);
   - Statistiche: la presenza di ogni atleta, calcolata con le regole di js/presenze-stat.js (le stesse dell'admin).
   Le presenze passano da /api/allenatore-presenze, che ricontrolla tutto sul server. */
(function () {
  'use strict';

  /* Le presenze contano dal 29/10/2026 (richiesta di Lorenzo): gli allenamenti prima di questa data non si mostrano. */
  var INIZIO = '2026-10-29';
  var VERDE = '#16A34A', ROSSO = '#DC2626', GRIGIO = '#CBD5E1';

  function $(id) { return document.getElementById(id); }
  function show(id, yes) { $(id).classList.toggle('is-hidden', !yes); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function bottone(cls, testo, onClick) {
    var b = el('button', cls, testo);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function telefono() { return window.matchMedia && window.matchMedia('(max-width: 719px)').matches; }

  /* 2012-03-04 → 4/3/2012 (e anni compiuti) */
  function dataIt(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '—';
    var nato = new Date(+m[1], +m[2] - 1, +m[3]);
    var oggi = new Date();
    var eta = oggi.getFullYear() - nato.getFullYear();
    if (oggi.getMonth() < nato.getMonth() || (oggi.getMonth() === nato.getMonth() && oggi.getDate() < nato.getDate())) eta--;
    return (+m[3]) + '/' + (+m[2]) + '/' + m[1] + (eta >= 0 && eta < 100 ? ' (' + eta + ' anni)' : '');
  }

  /* Il numero resta com'è scritto; il link tel: tiene solo cifre e un eventuale + iniziale */
  function telHref(numero) {
    var pulito = String(numero || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    return pulito ? 'tel:' + pulito : '';
  }

  function pillole(voci, attivo, onScegli, etichetta) {
    var box = el('div', 'pv-pills');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', etichetta);
    voci.forEach(function (v) {
      var b = bottone('pv-pill' + (v[0] === attivo ? ' is-active' : ''), v[1], function () { if (v[0] !== attivo) onScegli(v[0]); });
      b.setAttribute('aria-pressed', String(v[0] === attivo));
      box.appendChild(b);
    });
    return box;
  }

  /* ---------------- ATLETI ---------------- */
  var _atleti = null, _atCat = '', _atCerca = '';

  function riempiAtleti() {
    var box = $('atBox');
    box.textContent = '';
    var dati = _atleti;
    var cats = [];
    dati.atleti.forEach(function (a) { if (cats.indexOf(a.categoria || '') === -1) cats.push(a.categoria || ''); });
    if (cats.indexOf(_atCat) === -1) _atCat = '';

    if (cats.length > 1) {
      box.appendChild(pillole([['', 'Tutte']].concat(cats.map(function (c) { return [c, c || 'Senza categoria']; })), _atCat,
        function (c) { _atCat = c; riempiAtleti(); }, 'Squadra'));
    }
    var cerca = el('input', 'at-cerca');
    cerca.type = 'search';
    cerca.placeholder = 'Cerca per nome…';
    cerca.value = _atCerca;
    cerca.setAttribute('aria-label', 'Cerca un atleta per nome');
    cerca.autocomplete = 'off';
    box.appendChild(cerca);
    var risultato = el('div', 'at-lista');
    var conta = el('p', 'co-sub');
    box.appendChild(conta);
    box.appendChild(risultato);
    cerca.addEventListener('input', function () { _atCerca = cerca.value; disegnaElencoAtleti(risultato, conta); });
    disegnaElencoAtleti(risultato, conta);
  }

  function disegnaElencoAtleti(lista, conta) {
    lista.textContent = '';
    var q = _atCerca.trim().toLowerCase();
    var vis = _atleti.atleti.filter(function (a) {
      if (_atCat && (a.categoria || '') !== _atCat) return false;
      return !q || ((a.cognome + ' ' + a.nome).toLowerCase().indexOf(q) !== -1);
    });
    conta.textContent = vis.length + (vis.length === 1 ? ' atleta' : ' atleti');
    if (!vis.length) { lista.appendChild(el('p', 'co-none', 'Nessun atleta trovato.')); return; }

    var categoria = null, gruppo = null;
    vis.forEach(function (a) {
      if (a.categoria !== categoria) {
        categoria = a.categoria;
        lista.appendChild(el('h2', 'co-cat', categoria || 'Senza categoria'));
        gruppo = el('div', 'at-gruppo');
        var head = el('div', 'at-riga at-head');
        ['Cognome e nome', 'Nato il', 'Genitori', 'Note'].forEach(function (t) { head.appendChild(el('span', '', t)); });
        gruppo.appendChild(head);
        lista.appendChild(gruppo);
      }
      var riga = el('div', 'at-riga');
      riga.appendChild(el('span', 'at-nome', (a.cognome + ' ' + a.nome).trim()));
      var nato = el('span', 'at-nato', dataIt(a.dataNascita));
      riga.appendChild(nato);
      var tel = el('span', 'at-tel');
      if (!a.genitori.length) tel.appendChild(el('span', 'co-none', 'Telefono non inserito'));
      a.genitori.forEach(function (g) {
        var etichetta = [g.nome, g.parentela && g.nome ? '(' + g.parentela + ')' : g.parentela].filter(Boolean).join(' ');
        var href = telHref(g.telefono);
        var voce = el(href ? 'a' : 'span', 'at-chiama');
        if (href) { voce.href = href; voce.setAttribute('aria-label', 'Chiama ' + (etichetta || 'il genitore') + ' ' + g.telefono); }
        if (etichetta) voce.appendChild(el('span', 'at-chi', etichetta));
        voce.appendChild(el('strong', '', g.telefono));
        tel.appendChild(voce);
      });
      riga.appendChild(tel);
      riga.appendChild(a.note ? el('span', 'co-note at-note', a.note) : el('span', 'co-none at-note', '—'));
      gruppo.appendChild(riga);
    });
  }

  function render(dati) {
    $('coachName').textContent = ((dati.allenatore.nome || '') + ' ' + (dati.allenatore.cognome || '')).trim();
    _atleti = dati;
    if (!dati.atleti.length) {
      $('coachMsg').textContent = 'Non ci sono ancora atleti nelle tue squadre.';
      return;
    }
    $('coachMsg').textContent = '';
    riempiAtleti();
  }

  function carica(user) {
    _user = user;
    show('deniedScreen', false);
    show('dashboard', true);
    $('coachMsg').textContent = 'Caricamento…';
    user.getIdToken().then(function (token) {
      return fetch('/api/allenatore-atleti', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
    }).then(function (r) {
      if (r.status === 403) { show('dashboard', false); show('deniedScreen', true); return null; }
      if (r.status === 401) { auth.signOut().then(function () { location.reload(); }); return null; }
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (dati) {
      if (dati) render(dati);
    }).catch(function (e) {
      console.error('[allenatore]', e);
      $('coachMsg').textContent = 'Non riesco a caricare l\'elenco. Controlla la connessione e riprova.';
    });
  }

  /* ---------------- dati delle presenze ---------------- */
  var NEXT = { '': 'p', p: 'a', a: '' };
  var _user = null, _pres = null, _presLoaded = false;
  var _catNome = '', _modo = '', _giorno = '', _filtro = 'tutte', _extra = 0;
  var _periodo = 30, _statOrd = 'ass', _statSel = '';

  function apiPresenze(metodo, corpo) {
    return _user.getIdToken().then(function (token) {
      var opts = { method: metodo, cache: 'no-store', headers: { Authorization: 'Bearer ' + token } };
      if (corpo) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(corpo); }
      return fetch('/api/allenatore-presenze', opts);
    });
  }

  function dataDa(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function giornoCorto(iso) {
    return ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][dataDa(iso).getDay()] + ' ' + dataDa(iso).getDate() + '/' + (dataDa(iso).getMonth() + 1);
  }
  function giornoLungo(iso) {
    var t = dataDa(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function sigla(iso) { return ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'][dataDa(iso).getDay()]; }
  function aggiungiGiorni(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10);
  }

  function catCorrente() {
    return _pres.categorie.filter(function (c) { return c.categoria === _catNome; })[0] || _pres.categorie[0];
  }

  /* I giorni di allenamento della squadra, uno per data (due orari lo stesso giorno = un giorno), dal più vecchio. */
  function giorniUnici(cat) {
    var per = {}, out = [];
    cat.giorni.slice().reverse().forEach(function (g) {
      if (!per[g.data]) { per[g.data] = { data: g.data, ore: [] }; out.push(per[g.data]); }
      if (g.oraInizio) per[g.data].ore.push(g.oraInizio);
    });
    return out;
  }

  function statoDi(cat, data, atleta) { return (cat.presenze[data] || {})[atleta.id] || ''; }

  function conteggio(cat, data) {
    var si = 0, no = 0;
    cat.atleti.forEach(function (a) { var s = statoDi(cat, data, a); if (s === 'p') si++; else if (s === 'a') no++; });
    return { si: si, no: no, nr: cat.atleti.length - si - no };
  }

  function avviso(testo) { $('presMsg').textContent = testo; $('statMsg').textContent = testo; }

  /* Cambia lo stato di più atlete in un giorno: prima subito sullo schermo, poi sul server; se un salvataggio fallisce
     rimette com'era quello e lo dice. */
  function impostaMolti(cat, data, atlete, dopo, ridisegna) {
    var prima = {};
    var seg = cat.presenze[data] = cat.presenze[data] || {};
    atlete.forEach(function (a) {
      prima[a.id] = seg[a.id] || '';
      if (dopo) seg[a.id] = dopo; else delete seg[a.id];
    });
    avviso('');
    ridisegna();
    return Promise.all(atlete.map(function (a) {
      return apiPresenze('POST', { categoria: cat.categoria, data: data, atletaId: a.id, stato: dopo }).then(function (r) {
        if (r.status === 401) { auth.signOut().then(function () { location.reload(); }); return; }
        if (!r.ok) throw new Error('http ' + r.status);
      }).catch(function (e) {
        console.error('[allenatore] presenza', e);
        if (prima[a.id]) seg[a.id] = prima[a.id]; else delete seg[a.id];
        avviso('Non sono riuscito a salvare tutto: controlla e riprova.');
      });
    })).then(ridisegna);
  }

  function imposta(cat, data, atleta, dopo, ridisegna) { return impostaMolti(cat, data, [atleta], dopo, ridisegna); }

  function pillCategorie(onCambia) {
    if (_pres.categorie.length < 2) return null;
    return pillole(_pres.categorie.map(function (c) { return [c.categoria, c.categoria]; }), catCorrente().categoria,
      function (c) { _catNome = c; _giorno = ''; _extra = 0; _statSel = ''; onCambia(); }, 'Squadra');
  }

  function vuoto(box, testo) { box.appendChild(el('p', 'co-none', testo)); }

  /* ---------------- PRESENZE ---------------- */
  function disegnaPresenze() {
    if (!_pres) return;
    var box = $('presBox');
    box.textContent = '';
    var cat = catCorrente();
    var pills = pillCategorie(disegnaPresenze);
    if (pills) box.appendChild(pills);
    if (!cat.giorni.length) { vuoto(box, 'Per questa squadra non ci sono allenamenti in calendario.'); return; }
    if (!cat.atleti.length) { vuoto(box, 'Non ci sono ancora atleti in questa squadra.'); return; }

    var modo = _modo || (telefono() ? 'giorno' : 'griglia');
    box.appendChild(pillole([['giorno', 'Un giorno alla volta'], ['griglia', 'Tutti i giorni']], modo,
      function (m) { _modo = m; disegnaPresenze(); }, 'Modo di segnare'));
    if (modo === 'giorno') vistaGiorno(box, cat); else vistaGriglia(box, cat);
  }

  function giornoIniziale(giorni) {
    var passati = giorni.filter(function (g) { return g.data <= _pres.oggi; });
    return passati.length ? passati[passati.length - 1].data : giorni[0].data;
  }

  function vistaGiorno(box, cat) {
    var giorni = giorniUnici(cat);
    if (!_giorno || !giorni.some(function (g) { return g.data === _giorno; })) _giorno = giornoIniziale(giorni);
    var sel = giorni.filter(function (g) { return g.data === _giorno; })[0];

    var strip = el('div', 'pv-strip');
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Giorni di allenamento');
    var da = aggiungiGiorni(_pres.oggi, -28);
    giorni.filter(function (g) { return g.data >= da; }).forEach(function (g) {
      var c = conteggio(cat, g.data);
      var nota = g.data === _pres.oggi ? 'oggi' : g.data < _pres.oggi ? (cat.atleti.length - c.nr) + '/' + cat.atleti.length : (g.ore[0] || '');
      var b = bottone('pv-day' + (g.data === _giorno ? ' is-active' : ''), '', function () { _giorno = g.data; disegnaPresenze(); });
      b.setAttribute('aria-pressed', String(g.data === _giorno));
      b.setAttribute('aria-label', giornoLungo(g.data));
      b.appendChild(el('span', 'pv-dow', sigla(g.data)));
      b.appendChild(el('span', 'pv-num', String(dataDa(g.data).getDate())));
      b.appendChild(el('span', 'pv-nota', nota));
      strip.appendChild(b);
    });
    box.appendChild(strip);
    var attivo = strip.querySelector('.is-active');
    if (attivo) strip.scrollLeft = attivo.offsetLeft - (strip.clientWidth - attivo.offsetWidth) / 2;

    var c = conteggio(cat, _giorno), tot = cat.atleti.length;
    var testa = el('div', 'pv-testa');
    testa.appendChild(el('h2', 'pv-titolo', (_giorno === _pres.oggi ? 'Oggi · ' : '') + giornoLungo(_giorno) + (sel.ore.length ? ' · ' + sel.ore.join(' · ') : '')));
    testa.appendChild(el('span', 'pv-segnati', (tot - c.nr) + ' su ' + tot + ' segnati'));
    box.appendChild(testa);
    var barra = el('div', 'pv-bar'), b1 = el('span'), b2 = el('span');
    b1.style.width = (c.si / tot * 100) + '%';
    b2.style.width = (c.no / tot * 100) + '%';
    barra.appendChild(b1);
    barra.appendChild(b2);
    box.appendChild(barra);

    var azioni = el('div', 'pv-azioni');
    var conta = el('div', 'pv-conta');
    conta.appendChild(el('strong', 'pv-si', c.si + ' presenti'));
    conta.appendChild(el('strong', 'pv-no', c.no + ' assenti'));
    azioni.appendChild(conta);
    if (c.nr) {
      azioni.appendChild(bottone('pv-tutti', c.nr === tot ? 'Tutti presenti' : 'Restanti presenti', function () {
        impostaMolti(cat, _giorno, cat.atleti.filter(function (a) { return !statoDi(cat, _giorno, a); }), 'p', disegnaPresenze);
      }));
    }
    box.appendChild(azioni);

    box.appendChild(pillole([['tutte', 'Tutte (' + tot + ')'], ['assenti', 'Assenti (' + c.no + ')'], ['da', 'Da segnare (' + c.nr + ')']], _filtro,
      function (f) { _filtro = f; disegnaPresenze(); }, 'Filtro'));

    var lista = el('div', 'pv-lista');
    var mostrate = cat.atleti.filter(function (a) {
      var s = statoDi(cat, _giorno, a);
      return _filtro === 'tutte' || (_filtro === 'assenti' && s === 'a') || (_filtro === 'da' && !s);
    });
    if (!mostrate.length) lista.appendChild(el('p', 'co-none', _filtro === 'da' ? 'Tutto segnato per questo giorno.' : 'Nessuna atleta in questo elenco.'));
    mostrate.forEach(function (a) {
      var s = statoDi(cat, _giorno, a);
      var riga = el('div', 'pv-riga');
      var nome = el('div', 'pv-nome');
      nome.appendChild(el('span', '', (a.cognome + ' ' + a.nome).trim()));
      if (!s && _giorno <= _pres.oggi) nome.appendChild(el('small', '', 'Da segnare'));
      riga.appendChild(nome);
      riga.appendChild(siNo(cat, _giorno, a, s, disegnaPresenze));
      lista.appendChild(riga);
    });
    box.appendChild(lista);
    box.appendChild(el('p', 'co-sub', 'Si salva da solo ad ogni tocco. Puoi correggere o completare un allenamento fino a 60 giorni dopo.'));
  }

  /* I due pulsanti Sì / No di un'atleta in un giorno; toccare di nuovo quello acceso toglie la risposta. */
  function siNo(cat, data, atleta, stato, ridisegna) {
    var yn = el('span', 'pv-yn');
    [['p', 'Sì', 'presente'], ['a', 'No', 'assente']].forEach(function (o) {
      var b = bottone(stato === o[0] ? 'is-on' : '', o[1], function () { imposta(cat, data, atleta, stato === o[0] ? '' : o[0], ridisegna); });
      b.dataset.v = o[0];
      b.setAttribute('aria-pressed', String(stato === o[0]));
      b.setAttribute('aria-label', (atleta.cognome + ' ' + atleta.nome + ', ' + giornoCorto(data) + ': ' + o[2]).trim());
      yn.appendChild(b);
    });
    return yn;
  }

  function vistaGriglia(box, cat) {
    var tutti = giorniUnici(cat);
    var passati = tutti.filter(function (g) { return g.data <= _pres.oggi; });
    var futuri = tutti.filter(function (g) { return g.data > _pres.oggi; }).slice(0, 2);
    var n = 8 + 8 * _extra;
    var vis = passati.slice(-n).concat(futuri);

    var testa = el('div', 'pv-testa');
    var hint = el('p', 'co-sub', 'Tocca una casella: presente, poi assente, poi vuota. Si salva da sola.');
    testa.appendChild(hint);
    if (vis.some(function (g) { return g.data === _pres.oggi; })) {
      testa.appendChild(bottone('pv-tutti', 'Oggi: segna i restanti presenti', function () {
        impostaMolti(cat, _pres.oggi, cat.atleti.filter(function (a) { return !statoDi(cat, _pres.oggi, a); }), 'p', disegnaPresenze);
      }));
    }
    box.appendChild(testa);

    var wrap = el('div', 'co-wrap');
    var tab = el('table', 'pv-grid');
    var head = el('tr');
    head.appendChild(el('th', 'pv-gnome', 'Atleta'));
    vis.forEach(function (g) {
      var c = conteggio(cat, g.data);
      var th = el('th', g.data === _pres.oggi ? 'pv-oggi' : '');
      th.appendChild(el('span', 'pv-dow', sigla(g.data)));
      th.appendChild(el('span', 'pv-num', String(dataDa(g.data).getDate())));
      th.appendChild(el('span', 'pv-nota', g.data === _pres.oggi ? 'oggi' : g.data < _pres.oggi ? (cat.atleti.length - c.nr) + '/' + cat.atleti.length : (g.ore[0] || '')));
      head.appendChild(th);
    });
    head.appendChild(el('th', 'pv-gpct', 'Presenza'));
    var thead = el('thead');
    thead.appendChild(head);
    tab.appendChild(thead);
    var tbody = el('tbody');
    cat.atleti.forEach(function (a) {
      var tr = el('tr');
      tr.appendChild(el('td', 'pv-gnome', (a.cognome + ' ' + a.nome).trim()));
      vis.forEach(function (g) {
        var s = statoDi(cat, g.data, a);
        var td = el('td', g.data === _pres.oggi ? 'pv-oggi' : '');
        var b = bottone('pv-cell', s === 'p' ? 'Sì' : s === 'a' ? 'No' : '', function () { imposta(cat, g.data, a, NEXT[s], disegnaPresenze); });
        b.dataset.s = s;
        b.setAttribute('aria-label', (a.cognome + ' ' + a.nome + ', ' + giornoCorto(g.data) + ': ' + (s === 'p' ? 'presente' : s === 'a' ? 'assente' : 'da segnare')).trim());
        td.appendChild(b);
        tr.appendChild(td);
      });
      var st = statDi(cat, a, 30);
      tr.appendChild(el('td', 'pv-gpct', st.pct === null ? '—' : st.pct + '%'));
      tbody.appendChild(tr);
    });
    tab.appendChild(tbody);
    wrap.appendChild(tab);
    box.appendChild(wrap);
    if (passati.length > n) box.appendChild(bottone('pv-altri', 'Mostra giorni precedenti', function () { _extra++; disegnaPresenze(); }));
  }

  /* ---------------- STATISTICHE ---------------- */
  /* Le statistiche di un'atleta sugli ultimi `giorni` giorni (oggi compreso). */
  function statDi(cat, atleta, giorni) {
    var da = aggiungiGiorni(_pres.oggi, -giorni);
    var date = cat.giorni.filter(function (g) { return g.data <= _pres.oggi && g.data > da; }).map(function (g) { return g.data; });
    var stati = {};
    date.forEach(function (d) { stati[d] = statoDi(cat, d, atleta); });
    return PresenzeStat.calcola(date, stati);
  }

  function barrette(ultimi) {
    var box = el('span', 'st-ticks');
    var si = ultimi.filter(function (x) { return x === 'p'; }).length, no = ultimi.filter(function (x) { return x === 'a'; }).length;
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', si + ' presenze e ' + no + ' assenze negli ultimi ' + ultimi.length + ' allenamenti');
    ultimi.forEach(function (x) { var t = el('span'); t.dataset.s = x; box.appendChild(t); });
    return box;
  }

  function svg(tag, attr) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attr).forEach(function (k) { n.setAttribute(k, attr[k]); });
    return n;
  }

  /* Ciambella: verde le presenze, rossa le assenze (sui giorni segnati). */
  function ciambella(s) {
    var box = el('div', 'st-ring');
    var R = 54, C = 2 * Math.PI * R;
    var g = svg('svg', { width: 128, height: 128, viewBox: '0 0 128 128', role: 'img', 'aria-label': 'Presenza ' + (s.pct === null ? 'non disponibile' : s.pct + ' per cento') });
    g.appendChild(svg('circle', { cx: 64, cy: 64, r: R, fill: 'none', stroke: '#E2E8F0', 'stroke-width': 12 }));
    if (s.segnate) {
      var vSi = C * s.si / s.segnate, vNo = C * s.no / s.segnate;
      if (vNo) g.appendChild(svg('circle', { cx: 64, cy: 64, r: R, fill: 'none', stroke: ROSSO, 'stroke-width': 12, 'stroke-dasharray': vNo + ' ' + C, 'stroke-dashoffset': -vSi, transform: 'rotate(-90 64 64)' }));
      if (vSi) g.appendChild(svg('circle', { cx: 64, cy: 64, r: R, fill: 'none', stroke: VERDE, 'stroke-width': 12, 'stroke-dasharray': vSi + ' ' + C, transform: 'rotate(-90 64 64)' }));
    }
    box.appendChild(g);
    var mezzo = el('div', 'st-ring-n');
    mezzo.appendChild(el('strong', '', s.pct === null ? '—' : s.pct + '%'));
    mezzo.appendChild(el('span', '', 'presenza'));
    box.appendChild(mezzo);
    return box;
  }

  function disegnaStat() {
    if (!_pres) return;
    var box = $('statBox');
    box.textContent = '';
    var cat = catCorrente();
    var pills = pillCategorie(disegnaStat);
    if (pills) box.appendChild(pills);
    var fatti = cat.giorni.filter(function (g) { return g.data <= _pres.oggi; }).length;
    if (!cat.atleti.length || !fatti) { vuoto(box, !cat.atleti.length ? 'Non ci sono ancora atleti in questa squadra.' : 'Non ci sono ancora allenamenti svolti.'); return; }

    var righe = cat.atleti.map(function (a) { return { a: a, s: statDi(cat, a, _periodo) }; });
    if (_statOrd === 'ass') {
      /* chi non ha niente di segnato va in fondo: non si sa se manca */
      righe.sort(function (x, y) {
        return ((x.s.pct === null) - (y.s.pct === null)) || ((x.s.pct || 0) - (y.s.pct || 0)) || x.a.cognome.localeCompare(y.a.cognome, 'it');
      });
    }
    var sel = righe.filter(function (r) { return r.a.id === _statSel; })[0];
    if (!sel && !telefono()) { sel = righe[0]; _statSel = sel.a.id; }
    var squadra = PresenzeStat.media(righe.map(function (r) { return r.s; }));

    var wrap = el('div', 'st-wrap' + (sel ? ' has-sel' : ''));
    var sx = el('section', 'st-left');
    sx.appendChild(pillole([[30, 'Ultimi 30 giorni'], [60, 'Ultimi 60 giorni']], _periodo, function (p) { _periodo = p; disegnaStat(); }, 'Periodo'));
    var cards = el('div', 'st-cards');
    [['Media squadra', squadra === null ? '—' : squadra + '%'], ['Allenamenti', String(cat.giorni.filter(function (g) { return g.data <= _pres.oggi && g.data > aggiungiGiorni(_pres.oggi, -_periodo); }).length)]].forEach(function (c) {
      var k = el('div', 'st-card');
      k.appendChild(el('span', 'st-lab', c[0]));
      k.appendChild(el('strong', '', c[1]));
      cards.appendChild(k);
    });
    sx.appendChild(cards);
    sx.appendChild(pillole([['ass', 'Presenza più bassa'], ['nome', 'In ordine A–Z']], _statOrd, function (o) { _statOrd = o; disegnaStat(); }, 'Ordine'));
    var elenco = el('div', 'st-elenco');
    righe.forEach(function (r) {
      var b = bottone('st-voce' + (sel && sel.a.id === r.a.id ? ' is-sel' : ''), '', function () { _statSel = r.a.id; disegnaStat(); window.scrollTo(0, 0); });
      b.setAttribute('aria-pressed', String(!!sel && sel.a.id === r.a.id));
      var nome = el('span', 'st-nome');
      nome.appendChild(el('strong', '', (r.a.cognome + ' ' + r.a.nome).trim()));
      nome.appendChild(el('small', '', r.s.segnate ? r.s.si + ' presente · ' + r.s.no + ' assente · ' + r.s.nr + ' da segnare' : 'Ancora niente di segnato'));
      b.appendChild(nome);
      if (r.s.segnate) b.appendChild(barrette(r.s.ultimi));
      b.appendChild(el('span', 'st-pct', r.s.pct === null ? '—' : r.s.pct + '%'));
      elenco.appendChild(b);
    });
    sx.appendChild(elenco);
    wrap.appendChild(sx);

    if (sel) wrap.appendChild(scheda(cat, sel.a, squadra));
    box.appendChild(wrap);
  }

  function scheda(cat, atleta, squadra) {
    var box = el('section', 'st-right');
    box.appendChild(bottone('st-back', '‹ Statistiche', function () { _statSel = ''; disegnaStat(); }));
    var s = statDi(cat, atleta, _periodo);
    var testa = el('div', 'st-box');
    var tit = el('div', 'pv-testa');
    tit.appendChild(el('h2', 'st-h', (atleta.cognome + ' ' + atleta.nome).trim()));
    tit.appendChild(el('span', 'co-sub', cat.categoria + ' · ultimi ' + _periodo + ' giorni'));
    testa.appendChild(tit);
    var riga = el('div', 'st-riep');
    riga.appendChild(ciambella(s));
    var num = el('div', 'st-num');
    [['Presente', s.si, VERDE], ['Assente', s.no, ROSSO], ['Da segnare', s.nr, GRIGIO]].forEach(function (n) {
      var k = el('div', 'st-n');
      k.appendChild(el('strong', '', String(n[1])));
      var l = el('span', 'st-l');
      var p = el('i');
      p.style.background = n[2];
      l.appendChild(p);
      l.appendChild(document.createTextNode(n[0]));
      k.appendChild(l);
      num.appendChild(k);
    });
    riga.appendChild(num);
    testa.appendChild(riga);
    if (squadra !== null) {
      var conf = el('div', 'st-conf');
      var cima = el('div', 'st-conf-t');
      cima.appendChild(el('span', '', 'Rispetto alla squadra'));
      cima.appendChild(el('span', '', 'squadra ' + squadra + '%'));
      conf.appendChild(cima);
      var asta = el('div', 'st-asta'), pieno = el('span'), segno = el('i');
      pieno.style.width = (s.pct || 0) + '%';
      segno.style.left = squadra + '%';
      asta.appendChild(pieno);
      asta.appendChild(segno);
      conf.appendChild(asta);
      testa.appendChild(conf);
    }
    box.appendChild(testa);

    var storia = el('div', 'st-box st-storia');
    var ht = el('div', 'pv-testa');
    ht.appendChild(el('h3', 'st-h3', 'Allenamenti'));
    ht.appendChild(el('span', 'co-sub', 'Correggi con Sì e No: si aggiorna per tutti'));
    storia.appendChild(ht);
    giorniUnici(cat).filter(function (g) { return g.data <= _pres.oggi; }).slice(-10).reverse().forEach(function (g) {
      var r = el('div', 'st-hist');
      var q = el('div', 'st-quando');
      q.appendChild(el('strong', '', String(dataDa(g.data).getDate())));
      q.appendChild(el('small', '', dataDa(g.data).toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()));
      r.appendChild(q);
      var d = el('div', 'st-giorno', giornoLungo(g.data).split(' ')[0]);
      if (g.ore.length) d.appendChild(el('small', '', g.ore.join(' · ')));
      r.appendChild(d);
      r.appendChild(siNo(cat, g.data, atleta, statoDi(cat, g.data, atleta), disegnaStat));
      storia.appendChild(r);
    });
    box.appendChild(storia);
    return box;
  }

  function caricaPresenze() {
    $('presMsg').textContent = 'Caricamento…';
    $('statMsg').textContent = 'Caricamento…';
    apiPresenze('GET').then(function (r) {
      if (r.status === 401) { auth.signOut().then(function () { location.reload(); }); return null; }
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (dati) {
      if (!dati) return;
      dati.categorie.forEach(function (c) { c.giorni = c.giorni.filter(function (g) { return g.data >= INIZIO; }); });
      _pres = dati; _presLoaded = true;
      _catNome = dati.categorie.length ? dati.categorie[0].categoria : '';
      avviso('');
      disegnaPresenze();
      disegnaStat();
    }).catch(function (e) {
      console.error('[allenatore] presenze', e);
      avviso('Non riesco a caricare le presenze. Controlla la connessione e riprova.');
    });
  }

  function mostra(vista) {
    var sezioni = [['atleti', 'viewAtleti', 'tabAtleti'], ['presenze', 'viewPresenze', 'tabPresenze'], ['stat', 'viewStat', 'tabStat']];
    sezioni.forEach(function (s) {
      show(s[1], vista === s[0]);
      $(s[2]).classList.toggle('is-active', vista === s[0]);
      $(s[2]).setAttribute('aria-pressed', String(vista === s[0]));
    });
    if ((vista === 'presenze' || vista === 'stat') && !_presLoaded) caricaPresenze();
    else if (vista === 'presenze' && _pres) disegnaPresenze();
    else if (vista === 'stat' && _pres) disegnaStat();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('tabAtleti').addEventListener('click', function () { mostra('atleti'); });
    $('tabPresenze').addEventListener('click', function () { mostra('presenze'); });
    $('tabStat').addEventListener('click', function () { mostra('stat'); });
  });

  document.addEventListener('DOMContentLoaded', function () {
    auth.onAuthStateChanged(function (user) {
      if (user) carica(user);
      else location.replace('/admin'); /* il login è quello dell'area dirigenti */
    });

    function esci() { auth.signOut().then(function () { location.reload(); }); }
    $('logoutBtn').addEventListener('click', esci);
    $('deniedLogoutBtn').addEventListener('click', esci);
  });
})();
