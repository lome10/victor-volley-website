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
      var tot = cat.giorni.length, p = 0;
      cat.giorni.forEach(function (g) { if (((cat.presenze[g.data] || {})[a.id]) === 'p') p++; });
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
      disegnaPresenze();
    }).catch(function (e) {
      console.error('[allenatore] presenze', e);
      $('presMsg').textContent = 'Non riesco a caricare le presenze. Controlla la connessione e riprova.';
    });
  }

  function mostra(vista) {
    var pres = vista === 'presenze';
    show('viewAtleti', !pres);
    show('viewPresenze', pres);
    $('tabAtleti').classList.toggle('is-active', !pres);
    $('tabPresenze').classList.toggle('is-active', pres);
    $('tabAtleti').setAttribute('aria-pressed', String(!pres));
    $('tabPresenze').setAttribute('aria-pressed', String(pres));
    if (pres && !_presLoaded) caricaPresenze();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('tabAtleti').addEventListener('click', function () { mostra('atleti'); });
    $('tabPresenze').addEventListener('click', function () { mostra('presenze'); });
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
