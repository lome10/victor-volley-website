/* Victor Volley — Area Allenatore
   Pagina di SOLA LETTURA. L'allenatore entra dal login dell'area dirigenti (/admin), che lo manda qui; l'elenco dei suoi atleti (cognome, nome, data di
   nascita, telefono dei genitori, note per l'allenatore) arriva da /api/allenatore-atleti, che controlla allenatori/{uid} e restituisce
   soltanto quei campi, solo per le categorie assegnate. Qui non c'è nessuna scrittura. */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function show(id, yes) { $(id).classList.toggle('is-hidden', !yes); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

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

  function render(dati) {
    $('coachName').textContent = ((dati.allenatore.nome || '') + ' ' + (dati.allenatore.cognome || '')).trim();
    $('coachCats').textContent = (dati.categorie || []).join(' · ');
    var lista = $('coachList');
    lista.textContent = '';
    if (!dati.atleti.length) {
      $('coachMsg').textContent = 'Non ci sono ancora atleti nelle tue squadre.';
      return;
    }
    $('coachMsg').textContent = dati.atleti.length + (dati.atleti.length === 1 ? ' atleta' : ' atleti');

    var categoria = null, tabella = null;
    dati.atleti.forEach(function (a) {
      if (a.categoria !== categoria) {
        categoria = a.categoria;
        lista.appendChild(el('h2', 'co-cat', categoria || 'Senza categoria'));
        var wrap = el('div', 'co-wrap');
        tabella = el('table', 'co-table');
        var head = el('tr');
        ['Cognome e nome', 'Data di nascita', 'Genitore e telefono', 'Note'].forEach(function (t) { head.appendChild(el('th', '', t)); });
        var thead = el('thead'); thead.appendChild(head); tabella.appendChild(thead);
        tabella.appendChild(el('tbody'));
        wrap.appendChild(tabella);
        lista.appendChild(wrap);
      }
      var riga = el('tr');
      riga.appendChild(el('td', 'co-name', (a.cognome + ' ' + a.nome).trim()));
      riga.appendChild(el('td', '', dataIt(a.dataNascita)));
      var tel = el('td');
      if (!a.genitori.length) tel.appendChild(el('span', 'co-none', 'Telefono non inserito'));
      a.genitori.forEach(function (g) {
        var voce = el('div', 'co-phone');
        var etichetta = [g.nome, g.parentela && g.nome ? '(' + g.parentela + ')' : g.parentela].filter(Boolean).join(' ');
        if (etichetta) voce.appendChild(el('span', 'co-who', etichetta + ': '));
        var href = telHref(g.telefono);
        if (href) {
          var link = el('a', '', g.telefono);
          link.href = href;
          voce.appendChild(link);
        } else {
          voce.appendChild(el('span', '', g.telefono));
        }
        tel.appendChild(voce);
      });
      riga.appendChild(tel);
      riga.appendChild(a.note ? el('td', 'co-note', a.note) : el('td', 'co-none', '—'));
      tabella.querySelector('tbody').appendChild(riga);
    });
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


  /* ---------------- presenze agli allenamenti ----------------
     Una tabella per categoria: righe = atleti, colonne = i giorni di allenamento (dagli orari in "allenamenti"),
     il più recente per primo. Ogni tocco su una casella la fa passare da vuota a presente (P), assente (A), vuota;
     il salvataggio passa da /api/allenatore-presenze, che ricontrolla tutto sul server. */
  var NEXT = { '': 'p', p: 'a', a: '' };
  var _user = null, _pres = null, _presLoaded = false;

  function apiPresenze(metodo, corpo) {
    return _user.getIdToken().then(function (token) {
      var opts = { method: metodo, cache: 'no-store', headers: { Authorization: 'Bearer ' + token } };
      if (corpo) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(corpo); }
      return fetch('/api/allenatore-presenze', opts);
    });
  }

  function giornoCorto(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    var nomi = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
    return nomi[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] + ' ' + (+m[3]) + '/' + (+m[2]);
  }

  function cella(cat, giorno, atleta, bottone) {
    var stato = (cat.presenze[giorno.data] || {})[atleta.id] || '';
    bottone.dataset.s = stato;
    bottone.textContent = stato === 'p' ? 'P' : stato === 'a' ? 'A' : '';
    bottone.setAttribute('aria-label', (atleta.cognome + ' ' + atleta.nome + ', ' + giornoCorto(giorno.data) + ': ' +
      (stato === 'p' ? 'presente' : stato === 'a' ? 'assente' : 'non segnato')).trim());
  }

  function riepilogo(cat) {
    cat.atleti.forEach(function (a) {
      /* Solo gli allenamenti già fatti: i giorni che verranno si possono segnare ma non contano ancora. */
      var tot = 0, p = 0;
      cat.giorni.forEach(function (g) {
        if (g.data > _pres.oggi) return;
        tot++;
        if (((cat.presenze[g.data] || {})[a.id]) === 'p') p++;
      });
      a._sum = p + '/' + tot;
    });
  }

  function disegnaPresenze() {
    var lista = $('presList');
    lista.textContent = '';
    _pres.categorie.forEach(function (cat) {
      lista.appendChild(el('h2', 'co-cat', cat.categoria));
      if (!cat.giorni.length) { lista.appendChild(el('p', 'co-none', 'Per questa squadra non ci sono allenamenti in calendario.')); return; }
      if (!cat.atleti.length) { lista.appendChild(el('p', 'co-none', 'Non ci sono ancora atleti in questa squadra.')); return; }
      riepilogo(cat);
      var wrap = el('div', 'co-wrap');
      var tab = el('table', 'pr-table');
      var head = el('tr');
      head.appendChild(el('th', 'pr-name', 'Atleta'));
      cat.giorni.forEach(function (g) {
        var th = el('th', g.data === _pres.oggi ? 'pr-today' : '', (g.data === _pres.oggi ? 'oggi ' : '') + giornoCorto(g.data));
        if (g.oraInizio) th.appendChild(el('span', 'pr-hour', g.oraInizio));
        head.appendChild(th);
      });
      head.appendChild(el('th', '', 'Presenze'));
      var thead = el('thead'); thead.appendChild(head); tab.appendChild(thead);
      var tbody = el('tbody');
      cat.atleti.forEach(function (a) {
        var tr = el('tr');
        tr.appendChild(el('td', 'pr-name', (a.cognome + ' ' + a.nome).trim()));
        cat.giorni.forEach(function (g) {
          var td = el('td');
          var b = el('button', 'pr-cell');
          b.type = 'button';
          cella(cat, g, a, b);
          b.addEventListener('click', function () { tocca(cat, g, a, b); });
          td.appendChild(b);
          tr.appendChild(td);
        });
        var sum = el('td', 'pr-sum', a._sum);
        sum.dataset.sum = a.id;
        tr.appendChild(sum);
        tbody.appendChild(tr);
      });
      tab.appendChild(tbody);
      wrap.appendChild(tab);
      lista.appendChild(wrap);
    });
  }

  /* Cambia subito la casella e salva; se il salvataggio fallisce, la rimette com'era e lo dice. */
  function tocca(cat, giorno, atleta, bottone) {
    var segnate = cat.presenze[giorno.data] = cat.presenze[giorno.data] || {};
    var prima = segnate[atleta.id] || '';
    var dopo = NEXT[prima];
    segnate[atleta.id] = dopo;
    cella(cat, giorno, atleta, bottone);
    bottone.disabled = true;
    $('presMsg').textContent = '';
    apiPresenze('POST', { categoria: cat.categoria, data: giorno.data, atletaId: atleta.id, stato: dopo }).then(function (r) {
      if (r.status === 401) { auth.signOut().then(function () { location.reload(); }); return; }
      if (!r.ok) throw new Error('http ' + r.status);
      var somma = document.querySelector('[data-sum="' + atleta.id + '"]');
      riepilogo(cat);
      if (somma) somma.textContent = atleta._sum;
    }).catch(function (e) {
      console.error('[allenatore] presenza', e);
      segnate[atleta.id] = prima;
      cella(cat, giorno, atleta, bottone);
      $('presMsg').textContent = 'Non sono riuscito a salvare: riprova.';
    }).then(function () { bottone.disabled = false; });
  }

  function caricaPresenze() {
    $('presMsg').textContent = 'Caricamento…';
    apiPresenze('GET').then(function (r) {
      if (r.status === 401) { auth.signOut().then(function () { location.reload(); }); return null; }
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (dati) {
      if (!dati) return;
      _pres = dati; _presLoaded = true;
      $('presMsg').textContent = '';
      $('statMsg').textContent = '';
      disegnaPresenze();
      disegnaStat();
    }).catch(function (e) {
      console.error('[allenatore] presenze', e);
      $('presMsg').textContent = 'Non riesco a caricare le presenze. Controlla la connessione e riprova.';
      $('statMsg').textContent = 'Non riesco a caricare le presenze. Controlla la connessione e riprova.';
    });
  }

  /* ---------------- statistiche di presenza per atleta ----------------
     Si calcolano da quello che la pagina ha già (gli ultimi 60 giorni di allenamenti e le presenze segnate), con le
     regole di js/presenze-stat.js, le stesse dell'admin. Dalla scheda di un'atleta si possono correggere i giorni. */
  var STAT_GIORNI = 30, STAT_GIORNI_LUNGO = 60;
  var _statOrd = 'ass', _statSel = null;

  function aggiungiGiorni(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10);
  }

  /* Le statistiche di un'atleta sugli ultimi `giorni` giorni (oggi compreso). */
  function statDi(cat, atleta, giorni) {
    var da = aggiungiGiorni(_pres.oggi, -giorni);
    var date = cat.giorni.filter(function (g) { return g.data <= _pres.oggi && g.data > da; }).map(function (g) { return g.data; });
    var stati = {};
    date.forEach(function (d) { stati[d] = (cat.presenze[d] || {})[atleta.id] || ''; });
    return PresenzeStat.calcola(date, stati);
  }

  function puntini(ultimi) {
    var box = el('div', 'st-dots');
    var si = ultimi.filter(function (x) { return x === 'p'; }).length, no = ultimi.filter(function (x) { return x === 'a'; }).length;
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', si + ' presenze e ' + no + ' assenze negli ultimi ' + ultimi.length + ' allenamenti');
    ultimi.forEach(function (x) { var d = el('span', 'st-dot'); d.dataset.s = x; box.appendChild(d); });
    return box;
  }

  function disegnaStat() {
    if (!_pres) return;
    if (_statSel) { disegnaScheda(); return; }
    show('statScheda', false);
    show('statListaBox', true);
    var lista = $('statList');
    lista.textContent = '';
    _pres.categorie.forEach(function (cat) {
      lista.appendChild(el('h2', 'co-cat', cat.categoria));
      var giaFatti = cat.giorni.filter(function (g) { return g.data <= _pres.oggi; }).length;
      if (!cat.atleti.length || !giaFatti) {
        lista.appendChild(el('p', 'co-none', !cat.atleti.length ? 'Non ci sono ancora atleti in questa squadra.' : 'Non ci sono ancora allenamenti svolti.'));
        return;
      }
      var righe = cat.atleti.map(function (a) { return { a: a, s: statDi(cat, a, STAT_GIORNI) }; });
      var mediaSq = PresenzeStat.media(righe.map(function (r) { return r.s; }));
      lista.appendChild(el('p', 'co-sub', 'Media della squadra: ' + (mediaSq === null ? '—' : mediaSq + '%')));
      var sort = el('div', 'st-sort');
      [['ass', 'Chi manca di più'], ['nome', 'In ordine A–Z']].forEach(function (o) {
        var b = el('button', _statOrd === o[0] ? 'is-active' : '', o[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(_statOrd === o[0]));
        b.addEventListener('click', function () { _statOrd = o[0]; disegnaStat(); });
        sort.appendChild(b);
      });
      lista.appendChild(sort);
      if (_statOrd === 'ass') {
        /* chi non ha niente di segnato va in fondo: non si sa se manca */
        righe.sort(function (x, y) {
          return ((x.s.pct === null) - (y.s.pct === null)) || ((x.s.pct || 0) - (y.s.pct || 0)) || x.a.cognome.localeCompare(y.a.cognome, 'it');
        });
      }
      righe.forEach(function (r) {
        var card = el('button', 'st-card');
        card.type = 'button';
        var top = el('div', 'st-row');
        top.appendChild(el('span', 'st-name', (r.a.cognome + ' ' + r.a.nome).trim()));
        var pct = el('span', 'st-pct', r.s.pct === null ? '—' : r.s.pct + '%');
        pct.style.color = PresenzeStat.colore(r.s.pct);
        top.appendChild(pct);
        var bottom = el('div', 'st-row');
        bottom.appendChild(r.s.segnate ? puntini(r.s.ultimi) : el('span', 'co-none', 'Ancora niente di segnato'));
        card.appendChild(top);
        card.appendChild(bottom);
        card.addEventListener('click', function () { _statSel = { cat: cat.categoria, id: r.a.id }; disegnaScheda(); window.scrollTo(0, 0); });
        lista.appendChild(card);
      });
    });
  }

  /* Cambia lo stato di un'atleta in un giorno e lo salva; se fallisce, lo rimette com'era e lo dice in `msg`. */
  function impostaStato(cat, giorno, atleta, dopo, msg, fine) {
    var segnate = cat.presenze[giorno.data] = cat.presenze[giorno.data] || {};
    var prima = segnate[atleta.id] || '';
    segnate[atleta.id] = dopo;
    msg.textContent = '';
    apiPresenze('POST', { categoria: cat.categoria, data: giorno.data, atletaId: atleta.id, stato: dopo }).then(function (r) {
      if (r.status === 401) { auth.signOut().then(function () { location.reload(); }); return; }
      if (!r.ok) throw new Error('http ' + r.status);
    }).catch(function (e) {
      console.error('[allenatore] presenza', e);
      segnate[atleta.id] = prima;
      msg.textContent = 'Non sono riuscito a salvare: riprova.';
    }).then(function () { fine(msg.textContent); });
  }

  function disegnaScheda(messaggio) {
    var cat = _pres.categorie.filter(function (c) { return c.categoria === _statSel.cat; })[0];
    var atleta = cat && cat.atleti.filter(function (a) { return a.id === _statSel.id; })[0];
    if (!atleta) { _statSel = null; disegnaStat(); return; }
    show('statListaBox', false);
    show('statScheda', true);
    var box = $('statScheda');
    box.textContent = '';
    var indietro = el('button', 'st-back', '‹ Atleti');
    indietro.type = 'button';
    indietro.addEventListener('click', function () { _statSel = null; disegnaStat(); });
    box.appendChild(indietro);
    box.appendChild(el('h1', 'co-title', (atleta.cognome + ' ' + atleta.nome).trim()));
    box.appendChild(el('p', 'co-sub', cat.categoria));

    var s30 = statDi(cat, atleta, STAT_GIORNI), s60 = statDi(cat, atleta, STAT_GIORNI_LUNGO);
    var squadra = PresenzeStat.media(cat.atleti.map(function (a) { return statDi(cat, a, STAT_GIORNI); }));
    var stat = el('div', 'st-box');
    stat.appendChild(el('div', 'st-lab', 'Presenza · ultimi 30 giorni'));
    var grande = el('div', 'st-big', s30.pct === null ? '—' : s30.pct + '%');
    grande.style.color = PresenzeStat.colore(s30.pct);
    stat.appendChild(grande);
    if (s30.segnate) {
      var barra = el('div', 'st-bar'), a1 = el('span'), a2 = el('span');
      a1.style.width = (s30.si / s30.segnate * 100) + '%';
      a2.style.width = (s30.no / s30.segnate * 100) + '%';
      barra.appendChild(a1);
      barra.appendChild(a2);
      stat.appendChild(barra);
    }
    stat.appendChild(el('p', 'co-sub', s30.si + ' presente · ' + s30.no + ' assente · ' + s30.nr + ' non segnati' +
      (squadra === null ? '' : ' · media squadra ' + squadra + '%')));
    if (s60.segnate) stat.appendChild(el('p', 'co-sub', 'Ultimi 60 giorni: ' + s60.pct + '% (' + s60.si + ' su ' + s60.segnate + ' segnati)'));
    box.appendChild(stat);

    box.appendChild(el('h2', 'co-cat', 'Ultimi allenamenti'));
    var msg = el('p', 'co-msg', messaggio || '');
    msg.setAttribute('role', 'status');
    cat.giorni.filter(function (g) { return g.data <= _pres.oggi; }).slice(0, 10).forEach(function (g) {
      var stato = (cat.presenze[g.data] || {})[atleta.id] || '';
      var riga = el('div', 'st-hist');
      var quando = el('div', '', giornoCorto(g.data) + (g.oraInizio ? ' · ' + g.oraInizio : ''));
      var yn = el('div', 'st-yn');
      [['p', 'Sì', 'presente'], ['a', 'No', 'assente']].forEach(function (o) {
        var b = el('button', stato === o[0] ? 'is-on' : '', o[1]);
        b.type = 'button';
        b.dataset.v = o[0];
        b.setAttribute('aria-pressed', String(stato === o[0]));
        b.setAttribute('aria-label', giornoCorto(g.data) + ': ' + o[2]);
        b.addEventListener('click', function () {
          yn.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
          impostaStato(cat, g, atleta, stato === o[0] ? '' : o[0], msg, function (testo) { disegnaScheda(testo); });
        });
        yn.appendChild(b);
      });
      riga.appendChild(quando);
      riga.appendChild(yn);
      box.appendChild(riga);
    });
    box.appendChild(msg);
    box.appendChild(el('p', 'co-sub', 'Puoi correggere una presenza anche dopo l\'allenamento: si aggiorna per tutti.'));
  }

  function mostra(vista) {
    var pres = vista === 'presenze', stat = vista === 'stat', atleti = vista === 'atleti';
    show('viewAtleti', atleti);
    show('viewPresenze', pres);
    show('viewStat', stat);
    [['tabAtleti', atleti], ['tabPresenze', pres], ['tabStat', stat]].forEach(function (t) {
      $(t[0]).classList.toggle('is-active', t[1]);
      $(t[0]).setAttribute('aria-pressed', String(t[1]));
    });
    if ((pres || stat) && !_presLoaded) caricaPresenze();
    else if (pres && _pres) disegnaPresenze();
    else if (stat && _pres) disegnaStat();
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
