/**
 * Victor Volley — Girone Prima Divisione
 * Carica data/girone.json, calcola la classifica e popola:
 *   - homepage: featured card + pannello classifica
 *   - admin:    tabella classifica + lista partite
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

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
    if (s && s.logo) return '<img src="' + esc(s.logo) + '" alt="' + esc(s.nome) + '" class="' + esc(cls) + '">';
    return '<span class="' + esc(cls) + '--init">' + esc((s && s.nome || '?').charAt(0).toUpperCase()) + '</span>';
  }

  /* ----------------------------------------------------------------
     Featured card (homepage)
  ---------------------------------------------------------------- */
  function renderFeatured(match, squadre, homeId) {
    var casa   = squadraById(squadre, match.squadra_casa);
    var ospite = squadraById(squadre, match.squadra_ospite);
    var isHome = match.squadra_casa === homeId;
    var vv     = isHome ? casa   : ospite;
    var avv    = isHome ? ospite : casa;
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
        '<span class="gf-badge gf-badge--cat">Prima Divisione</span>' +
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
     Pannello classifica (homepage + admin)
  ---------------------------------------------------------------- */
  function renderClassifica(classifica, squadre, girone, homeId) {
    var rows = classifica.map(function (r, i) {
      var s = squadraById(squadre, r.id);
      var isVV = r.id === homeId;
      return '<tr class="' + (isVV ? 'gc-row--vv' : '') + '">' +
        '<td class="gc-pos">' + (i + 1) + '</td>' +
        '<td class="gc-name">' +
          (s.logo
            ? '<img src="' + esc(s.logo) + '" class="gc-logo" alt="">'
            : '<span class="gc-logo-init">' + esc((s.nome || '?').charAt(0)) + '</span>') +
          esc(s.nome) +
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
      '<div class="gc-footer">' + esc(girone.stagione || '') + '</div>' +
    '</div>';
  }

  /* ----------------------------------------------------------------
     Sezione admin: classifica + partite
  ---------------------------------------------------------------- */
  function renderAdmin(girone, classifica, homeId) {
    var elCl = document.getElementById('gironeAdminClassifica');
    var elPt = document.getElementById('gironeAdminPartite');

    if (elCl) elCl.innerHTML = renderClassifica(classifica, girone.squadre, girone, homeId);

    if (elPt) {
      var today    = new Date().toISOString().slice(0, 10);
      var giocate  = girone.partite.filter(function (p) { return p.set_casa != null; });
      var upcoming = girone.partite.filter(function (p) { return p.set_casa == null && p.data >= today; });

      function row(p, played) {
        var c = squadraById(girone.squadre, p.squadra_casa);
        var o = squadraById(girone.squadre, p.squadra_ospite);
        return '<tr>' +
          '<td>' + esc(formatData(p.data, p.ora)) + '</td>' +
          '<td>' + esc(c.nome) + '</td>' +
          '<td class="ga-vs">–</td>' +
          '<td>' + esc(o.nome) + '</td>' +
          (played
            ? '<td class="ga-result">' + p.set_casa + '&ndash;' + p.set_ospite + '</td>'
            : '<td class="ga-result ga-result--empty">—</td>') +
        '</tr>';
      }

      var html = '';
      if (giocate.length) {
        html += '<p class="ga-label">Risultati</p>' +
          '<table class="admin-table"><thead><tr><th>Data</th><th>Casa</th><th></th><th>Ospite</th><th>Set</th></tr></thead>' +
          '<tbody>' + giocate.map(function (p) { return row(p, true); }).join('') + '</tbody></table>';
      }
      if (upcoming.length) {
        html += '<p class="ga-label" style="margin-top:28px">Prossime partite</p>' +
          '<table class="admin-table"><thead><tr><th>Data</th><th>Casa</th><th></th><th>Ospite</th><th>Set</th></tr></thead>' +
          '<tbody>' + upcoming.map(function (p) { return row(p, false); }).join('') + '</tbody></table>';
      }
      if (!html) html = '<p style="color:var(--a-muted)">Nessuna partita inserita.</p>';
      elPt.innerHTML = html;
    }
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
     Init
  ---------------------------------------------------------------- */
  function init() {
    var elFeat = document.getElementById('gironeFeatured');
    var elCl   = document.getElementById('gironeClassifica');
    var elAdCl = document.getElementById('gironeAdminClassifica');
    var elAdPt = document.getElementById('gironeAdminPartite');
    if (!elFeat && !elCl && !elAdCl && !elAdPt) return;

    fetch('data/girone.json')
      .then(function (r) { return r.json(); })
      .then(function (girone) {
        var classifica = calcolaClassifica(girone);
        var homeSquadra = girone.squadre.filter(function (s) { return s.home; })[0];
        var homeId = homeSquadra ? homeSquadra.id : null;
        var today  = new Date().toISOString().slice(0, 10);

        /* Homepage */
        if (elFeat || elCl) {
          var next = homeId ? girone.partite.filter(function (p) {
            return (p.squadra_casa === homeId || p.squadra_ospite === homeId)
              && p.set_casa == null && p.data >= today;
          }).sort(function (a, b) { return a.data > b.data ? 1 : -1; })[0] : null;

          if (elFeat) {
            elFeat.innerHTML = next
              ? renderFeatured(next, girone.squadre, homeId)
              : '<div class="gf-empty">Nessuna partita in programma per la Prima Divisione.</div>';
            tick();
            setInterval(tick, 60000);
          }
          if (elCl) {
            elCl.innerHTML = renderClassifica(classifica, girone.squadre, girone, homeId);
          }
        }

        /* Admin */
        renderAdmin(girone, classifica, homeId);
      })
      .catch(function (e) { console.warn('[girone] fetch failed:', e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
