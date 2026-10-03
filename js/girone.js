/**
 * Victor Volley — Girone Prima Divisione
 * Carica data/girone.json, calcola la classifica e popola:
 *   - homepage: featured card + pannello classifica
 */
(function (global) {
  'use strict';

  var GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  var MESI   = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  function formatData(dateStr, ora) {
    var d = new Date(dateStr + 'T00:00:00');
    var s = GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
    if (ora) s += ' · ' + ora;
    return s;
  }

  /* ----------------------------------------------------------------
     Classifica italiana pallavolo:
       3-0 / 3-1 → vincitore 3 pt, perdente 0 pt
       3-2       → vincitore 2 pt, perdente 1 pt
  ---------------------------------------------------------------- */
  function calcolaClassifica(girone) {
    var map = {};
    girone.squadre.forEach(function (s) {
      map[s.id] = { id: s.id, pg: 0, v: 0, p: 0, sf: 0, ss: 0, pts: 0 };
    });

    girone.partite.forEach(function (m) {
      if (m.set_casa == null || m.set_ospite == null) return;
      if (!map[m.squadra_casa] || !map[m.squadra_ospite]) return;

      var sc = +m.set_casa, so = +m.set_ospite;
      map[m.squadra_casa].pg++;
      map[m.squadra_ospite].pg++;
      map[m.squadra_casa].sf   += sc;
      map[m.squadra_casa].ss   += so;
      map[m.squadra_ospite].sf += so;
      map[m.squadra_ospite].ss += sc;

      var winner = sc > so ? m.squadra_casa : m.squadra_ospite;
      var loser  = sc > so ? m.squadra_ospite : m.squadra_casa;
      map[winner].v++;
      map[loser].p++;
      if (sc + so === 5) { map[winner].pts += 2; map[loser].pts += 1; }
      else               { map[winner].pts += 3; }
    });

    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      if (b.pts !== a.pts) return b.pts - a.pts;
      var rA = a.ss ? a.sf / a.ss : a.sf, rB = b.ss ? b.sf / b.ss : b.sf;
      return rB - rA;
    });
  }

  function squadraById(squadre, id) {
    for (var i = 0; i < squadre.length; i++) { if (squadre[i].id === id) return squadre[i]; }
    return { id: id, nome: id };
  }

  function logoEl(s, cls) {
    if (s && s.logo) return '<img loading="lazy" decoding="async" src="' + esc(s.logo) + '" alt="' + esc(s.nome) + '" class="' + esc(cls) + '">';
    return '<span class="' + esc(cls) + '--init">' + esc((s && s.nome || '?').charAt(0).toUpperCase()) + '</span>';
  }

  /* ----------------------------------------------------------------
     Featured card (homepage) — dalla partita reale del calendario
  ---------------------------------------------------------------- */
  function _isVV(nome) { return (nome || '').toLowerCase().indexOf('victor') !== -1; }

  /* Card "prossima partita" per una partita reale del calendario (collection
     "partite"): squadra_casa/ospite sono nomi liberi, non id di un elenco
     squadre, e i loghi sono già sul match (logo_casa/logo_ospite). */
  function renderFeatured(match) {
    var isHome = _isVV(match.squadra_casa);
    var vv  = { nome: isHome ? match.squadra_casa : match.squadra_ospite, logo: isHome ? match.logo_casa : match.logo_ospite };
    var avv = { nome: isHome ? match.squadra_ospite : match.squadra_casa, logo: isHome ? match.logo_ospite : match.logo_casa };
    var pin = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';

    var cd = '';
    if (match.ora) {
      var dt = match.data + 'T' + match.ora + ':00';
      cd = '<div class="gf-countdown" data-match="' + esc(dt) + '">' +
        '<div class="gf-cd-unit"><div class="gf-cd-num cd-days">--</div><div class="gf-cd-label">GG</div></div>' +
        '<div class="gf-cd-unit"><div class="gf-cd-num cd-hours">--</div><div class="gf-cd-label">ORE</div></div>' +
        '<div class="gf-cd-unit"><div class="gf-cd-num cd-mins">--</div><div class="gf-cd-label">MIN</div></div>' +
      '</div>';
    }

    return '<div class="gf-card' + (isHome ? ' gf-card--home' : '') + '">' +
      '<div class="gf-top">' +
        '<span class="gf-badge gf-badge--cat">' + esc(match.categoria || 'Prima Divisione') + '</span>' +
        '<span class="gf-badge ' + (isHome ? 'gf-badge--home' : 'gf-badge--away') + '">' + (isHome ? 'Casa' : 'Trasferta') + '</span>' +
        '<span class="gf-date">' + esc(formatData(match.data, match.ora)) + '</span>' +
      '</div>' +
      '<div class="gf-body">' +
        '<div class="gf-team">' +
          '<div class="gf-logo">' + logoEl(vv, 'gf-logo-img') + '</div>' +
          '<span class="gf-tname gf-tname--vv">' + esc(vv.nome) + '</span>' +
        '</div>' +
        '<div class="gf-vs">VS</div>' +
        '<div class="gf-team gf-team--opp">' +
          '<div class="gf-logo">' + logoEl(avv, 'gf-logo-img') + '</div>' +
          '<span class="gf-tname">' + esc(avv.nome) + '</span>' +
        '</div>' +
      '</div>' +
      (match.palazzetto
        ? '<div class="gf-venue">' + pin + esc(match.palazzetto) + '</div>'
        : '') +
      cd +
    '</div>';
  }

  /* ----------------------------------------------------------------
     Pannello classifica (homepage + calendario)
  ---------------------------------------------------------------- */
  /* Specchietto di 5 squadre con la Victor al centro (2 sopra, 2 sotto);
     ai bordi la finestra scorre: 1ª → 4 sotto, 2ª → 1 sopra e 3 sotto,
     ultima → 4 sopra, penultima → 3 sopra e 1 sotto. */
  var WINDOW_SIZE = 5;

  function finestraClassifica(classifica, homeId) {
    var n = classifica.length;
    if (n <= WINDOW_SIZE) return { da: 0, a: n };
    var pos = -1;
    for (var i = 0; i < n; i++) { if (classifica[i].id === homeId) { pos = i; break; } }
    if (pos < 0) return { da: 0, a: WINDOW_SIZE };
    var da = Math.max(0, Math.min(pos - 2, n - WINDOW_SIZE));
    return { da: da, a: da + WINDOW_SIZE };
  }

  function renderClassifica(classifica, squadre, girone, homeId) {
    var fin = finestraClassifica(classifica, homeId);
    var rows = classifica.map(function (r, i) {
      if (i < fin.da || i >= fin.a) return '';
      var s = squadraById(squadre, r.id);
      var isVV = r.id === homeId;
      return '<tr class="' + (isVV ? 'gc-row--vv' : '') + '">' +
        '<td class="gc-pos">' + (i + 1) + '</td>' +
        '<td class="gc-name">' +
          (s.logo
            ? '<img loading="lazy" decoding="async" src="' + esc(s.logo) + '" class="gc-logo" alt="">'
            : '<span class="gc-logo-init">' + esc((s.nome || '?').charAt(0)) + '</span>') +
          '<span class="gc-name-text">' + esc(s.nome) + '</span>' +
        '</td>' +
        '<td class="gc-stat">' + r.v + '</td>' +
        '<td class="gc-stat">' + r.p + '</td>' +
        '<td class="gc-pts">' + r.pts + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="gc-panel">' +
      '<div class="gc-header">' +
        '<span class="gc-title">Classifica</span>' +
        '<span class="gc-sub">' + esc(girone.categoria || '') + (girone.girone ? ' · Girone ' + girone.girone : '') + '</span>' +
      '</div>' +
      '<table class="gc-table">' +
        '<thead><tr>' +
          '<th class="gc-pos">#</th><th class="gc-name">Squadra</th>' +
          '<th class="gc-stat" title="Vittorie">V</th>' +
          '<th class="gc-stat" title="Sconfitte">P</th>' +
          '<th class="gc-pts">Pt</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '<div class="gc-footer">' + esc(girone.stagione || '') +
        (classifica.length > WINDOW_SIZE ? ' · <a href="calendario.html">Classifica completa</a>' : '') + '</div>' +
    '</div>';
  }

  /* ----------------------------------------------------------------
     Countdown
  ---------------------------------------------------------------- */
  function tick() {
    document.querySelectorAll('.gf-countdown[data-match]').forEach(function (el) {
      var diff = new Date(el.getAttribute('data-match')) - new Date();
      if (diff <= 0) { el.style.display = 'none'; return; }
      var d  = Math.floor(diff / 86400000);
      var h  = Math.floor((diff % 86400000) / 3600000);
      var mn = Math.floor((diff % 3600000) / 60000);
      el.querySelector('.cd-days').textContent  = String(d).padStart(2, '0');
      el.querySelector('.cd-hours').textContent = String(h).padStart(2, '0');
      el.querySelector('.cd-mins').textContent  = String(mn).padStart(2, '0');
    });
  }

  /* ----------------------------------------------------------------
     Caricamento: Firestore prima, fallback al file statico
  ---------------------------------------------------------------- */
  function loadGirone() {
    if (window.firebase && firebase.apps && firebase.apps.length) {
      return firebase.firestore().collection('siteData').doc('girone').get()
        .then(function (doc) {
          if (doc.exists && doc.data() && doc.data().json) {
            return JSON.parse(doc.data().json);
          }
          return fetch('/data/girone.json').then(function (r) { return r.json(); });
        })
        .catch(function () {
          return fetch('/data/girone.json').then(function (r) { return r.json(); });
        });
    }
    return fetch('/data/girone.json').then(function (r) { return r.json(); });
  }

  /* Gironi pronti per classifica e card: uno per categoria, con le squadre
     risolte dall'anagrafica unica (nome + logo). Ogni elemento ha la forma
     { stagione, categoria, girone, squadre:[{id,nome,logo,home}], partite }. */
  function loadGironi() {
    return loadGirone().then(function (raw) {
      var n = VV.normalizeGirone(raw), byId = {};
      n.squadre.forEach(function (s) { byId[s.id] = s; });
      return n.gironi.map(function (g) {
        return {
          stagione:  n.stagione,
          categoria: g.categoria,
          girone:    g.girone,
          partite:   g.partite,
          squadre:   g.squadre.map(function (id) { return byId[id] || { id: id, nome: id }; })
        };
      });
    });
  }

  /* ----------------------------------------------------------------
     Init
  ---------------------------------------------------------------- */
  function init() {
    var elFeat = document.getElementById('gironeFeatured');
    var elCl   = document.getElementById('gironeClassifica');
    if (!elFeat && !elCl) return;

    loadGironi()
      .then(function (gironi) {
        /* La home mostra la Prima Squadra: girone di Prima Divisione. */
        var girone = gironi.filter(function (g) { return g.categoria === 'Prima Divisione'; })[0];

        /* Homepage — classifica gestita a mano via girone.json (il Calendario
           registra solo le partite della Prima Squadra, non l'intero girone,
           quindi da lì non è calcolabile una classifica vera). */
        if (elCl && girone && girone.squadre.length > 1) {
          var homeSquadra = girone.squadre.filter(function (s) { return s.home; })[0];
          elCl.innerHTML = renderClassifica(calcolaClassifica(girone), girone.squadre, girone, homeSquadra ? homeSquadra.id : null);
        }

        /* La card "Prossima partita" invece legge dal calendario reale
           (stagione corrente + Prima Divisione), non più da girone.json. */
        if (elFeat && window.DB && typeof DB.load === 'function') {
          DB.load(['partite', 'seasons'], function () {
            var season   = VV.getCurrentSeason();
            var todayStr = new Date().toISOString().slice(0, 10);
            var next = VV.getPartite().filter(function (p) {
              return p.categoria === 'Prima Divisione'
                && (!season || p.stagione === season.id)
                && p.stato !== 'conclusa'
                && p.data >= todayStr;
            }).sort(function (a, b) { return a.data > b.data ? 1 : -1; })[0];

            elFeat.innerHTML = next
              ? renderFeatured(next)
              : '<div class="gf-empty">Calendario in arrivo: le date della Prima Divisione saranno pubblicate appena disponibili.</div>';
            tick();
            setInterval(tick, 60000);
          });
        }

      })
      .catch(function (e) { console.warn('[girone] fetch failed:', e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Esposto per riuso in altre pagine (es. calendario.html), così la logica
     di calcolo classifica e i renderer restano in un solo posto. */
  global.Girone = {
    loadGirone:        loadGirone,
    loadGironi:        loadGironi,
    calcolaClassifica: calcolaClassifica,
    squadraById:       squadraById,
    renderClassifica:  renderClassifica,
    formatData:        formatData
  };

})(window);
