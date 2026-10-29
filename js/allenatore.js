/* Victor Volley — Area Allenatore
   Pagina di SOLA LETTURA. L'allenatore entra dal login dell'area dirigenti (/admin), che lo manda qui; l'elenco dei suoi atleti (cognome, nome, data di
   nascita, telefono dei genitori) arriva da /api/allenatore-atleti, che controlla allenatori/{uid} e restituisce
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
        ['Cognome e nome', 'Data di nascita', 'Genitore e telefono'].forEach(function (t) { head.appendChild(el('th', '', t)); });
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
      tabella.querySelector('tbody').appendChild(riga);
    });
  }

  function carica(user) {
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
