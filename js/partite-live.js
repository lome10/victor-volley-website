/**
 * Victor Volley — Partite Live
 * Carica data/partite.json, arricchisce con dati Supabase (live/conclusa)
 * e popola la partite-bar della home con aggiornamenti realtime.
 */
(function () {
  'use strict';

  /* -------------------------------------------------------
     Supabase client — creato solo se le credenziali sono
     state configurate (non placeholder).
  ------------------------------------------------------- */
  var _sb = null;

  function getSupabase() {
    if (_sb) return _sb;
    if (!window.SUPABASE_URL || window.SUPABASE_URL === 'INSERISCI_URL_SUPABASE') return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return _sb;
  }

  /* Canali realtime attivi — puliti su beforeunload */
  var _channels = [];

  /* -------------------------------------------------------
     Helpers HTML
  ------------------------------------------------------- */
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var CAT_ABBREV = {
    'prima divisione': 'P.DIV',
    'under 18': 'U18', 'under 13': 'U13', 'under 12': 'U12',
    'minivolley': 'MINI'
  };
  function abbrevCat(cat) { return CAT_ABBREV[(cat || '').toLowerCase()] || cat; }
  function catCls(cat) { return cat === 'Prima Divisione' ? 'partite-card-cat--magenta' : ''; }

  var LOGO_MAP = { 'victor volley': 'assets/logo.png' };

  function logoHtml(nome, logoSrc) {
    var src = logoSrc || LOGO_MAP[(nome || '').toLowerCase().trim()];
    return src
      ? '<img src="' + esc(src) + '" alt="' + esc(nome) + '" class="partite-card-logo-img">'
      : '<span class="partite-card-logo-init">' + esc((nome || '?').charAt(0).toUpperCase()) + '</span>';
  }

  function teamEl(nome, logoSrc) {
    return '<div class="partite-card-team">' +
      '<div class="partite-card-logo">' + logoHtml(nome, logoSrc) + '</div>' +
      '<span class="partite-card-tname">' + esc(nome) + '</span>' +
    '</div>';
  }

  function formatData(dateStr, ora) {
    var d = new Date(dateStr + 'T00:00:00');
    var giorni = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    var mesi   = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    return giorni[d.getDay()] + ' ' + d.getDate() + ' ' + mesi[d.getMonth()] + (ora ? ' · ' + ora : '');
  }

  /* -------------------------------------------------------
     Renderers delle card
  ------------------------------------------------------- */
  function cardProssima(p) {
    return '<div class="partite-card" data-partita-id="' + esc(p.id) + '">' +
      '<div class="partite-card-top">' +
        '<span class="partite-card-cat ' + catCls(p.categoria) + '">' + esc(abbrevCat(p.categoria)) + '</span>' +
        '<span class="partite-card-date">' + esc(formatData(p.data, p.ora)) + '</span>' +
      '</div>' +
      '<div class="partite-card-body">' +
        '<div class="partite-card-teams">' +
          teamEl(p.squadra_casa, p.logo_casa) +
          teamEl(p.squadra_ospite, p.logo_ospite) +
        '</div>' +
        '<div class="partite-card-vs-col"><span class="partite-card-vs">VS</span></div>' +
      '</div>' +
    '</div>';
  }

  function cardConclusa(p, setCasa, setOspite) {
    var sc = (setCasa  !== null && setCasa  !== undefined) ? setCasa  : (p.set_casa   || 0);
    var so = (setOspite !== null && setOspite !== undefined) ? setOspite : (p.set_ospite || 0);
    return '<div class="partite-card" data-partita-id="' + esc(p.id) + '">' +
      '<div class="partite-card-top">' +
        '<span class="partite-card-cat ' + catCls(p.categoria) + '">' + esc(abbrevCat(p.categoria)) + '</span>' +
        '<span class="partite-card-date">' + esc(formatData(p.data, null)) + '</span>' +
      '</div>' +
      '<div class="partite-card-body">' +
        '<div class="partite-card-teams">' +
          teamEl(p.squadra_casa, p.logo_casa) +
          teamEl(p.squadra_ospite, p.logo_ospite) +
        '</div>' +
        '<div class="partite-card-scores-col">' +
          '<div class="partite-card-pts">' + sc + '</div>' +
          '<div class="partite-card-pts">' + so + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function cardLive(p, state) {
    var teamCasa   = (p.tabellone_squadra_casa || 'A') === 'A' ? 'A' : 'B';
    var teamOspite = teamCasa === 'A' ? 'B' : 'A';

    var setCasa    = (state && state['team' + teamCasa]   && state['team' + teamCasa].sets   != null) ? state['team' + teamCasa].sets   : 0;
    var setOspite  = (state && state['team' + teamOspite] && state['team' + teamOspite].sets  != null) ? state['team' + teamOspite].sets  : 0;
    var scoreCasa  = (state && state['team' + teamCasa]   && state['team' + teamCasa].score  != null) ? state['team' + teamCasa].score  : 0;
    var scoreOsp   = (state && state['team' + teamOspite] && state['team' + teamOspite].score != null) ? state['team' + teamOspite].score : 0;
    var currentSet = (state && state.currentSet != null) ? state.currentSet : 1;

    var setConclusi = ((state && state.history) || [])
      .filter(function (e) { return e && e.setCompleted; })
      .map(function (e) { return e.setCompleted; });

    var setDetailHtml = '';
    if (setConclusi.length) {
      setDetailHtml =
        '<div class="partite-card-set-detail" hidden>' +
          setConclusi.map(function (s) {
            var sCasa = teamCasa === 'A' ? (s.scoreA != null ? s.scoreA : 0) : (s.scoreB != null ? s.scoreB : 0);
            var sOsp  = teamOspite === 'A' ? (s.scoreA != null ? s.scoreA : 0) : (s.scoreB != null ? s.scoreB : 0);
            return '<span class="partite-card-set-row">Set ' + (s.setNumber || '') + ': ' + sCasa + '–' + sOsp + '</span>';
          }).join('') +
        '</div>';
    }

    return '<div class="partite-card partite-card--live" data-partita-id="' + esc(p.id) + '" tabindex="0">' +
      '<div class="partite-card-top">' +
        '<span class="partite-card-cat ' + catCls(p.categoria) + '">' + esc(abbrevCat(p.categoria)) + '</span>' +
        '<span class="partite-card-live-badge" aria-label="Partita in corso">' +
          '<span class="partite-card-live-dot" aria-hidden="true"></span>LIVE' +
        '</span>' +
      '</div>' +
      '<div class="partite-card-body">' +
        '<div class="partite-card-teams">' +
          teamEl(p.squadra_casa, p.logo_casa) +
          teamEl(p.squadra_ospite, p.logo_ospite) +
        '</div>' +
        '<div class="partite-card-scores-col">' +
          '<div class="partite-card-pts">' + setCasa + '</div>' +
          '<div class="partite-card-pts">' + setOspite + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="partite-card-live-detail">' +
        '<span class="partite-card-live-score">Set ' + currentSet + ': ' + scoreCasa + '–' + scoreOsp + '</span>' +
        (setConclusi.length
          ? '<button class="partite-card-live-expand" aria-expanded="false" aria-label="Mostra tabellino">&#9656;</button>'
          : '') +
      '</div>' +
      setDetailHtml +
    '</div>';
  }

  /* -------------------------------------------------------
     Logica stato: usa sempre state.matchOver, mai status
  ------------------------------------------------------- */
  function resolveState(p, sessionRow) {
    if (!p.codice_tabellone) return { stato: p.stato || 'programmata' };
    if (!sessionRow) return { stato: 'programmata' };

    var st = sessionRow.state || {};
    if (st.matchOver === true) {
      var teamCasa   = (p.tabellone_squadra_casa || 'A') === 'A' ? 'A' : 'B';
      var teamOspite = teamCasa === 'A' ? 'B' : 'A';
      return {
        stato:      'conclusa',
        set_casa:   (st['team' + teamCasa]   && st['team' + teamCasa].sets   != null) ? st['team' + teamCasa].sets   : 0,
        set_ospite: (st['team' + teamOspite] && st['team' + teamOspite].sets != null) ? st['team' + teamOspite].sets : 0
      };
    }
    return { stato: 'live', liveState: st, sessionId: sessionRow.id };
  }

  /* -------------------------------------------------------
     Supabase: fetch singola sessione
  ------------------------------------------------------- */
  function fetchSession(code) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve(null);
    return sb
      .from('match_sessions')
      .select('id, state, status')
      .eq('code', code)
      .maybeSingle()
      .then(function (res) {
        if (res.error) { console.warn('[partite-live] Supabase error:', res.error.message); return null; }
        return res.data;
      })
      .catch(function (e) { console.warn('[partite-live] fetch session failed:', e); return null; });
  }

  /* -------------------------------------------------------
     Supabase: realtime subscription per una partita live
  ------------------------------------------------------- */
  function subscribeToSession(partita, sessionId, onUpdate) {
    var sb = getSupabase();
    if (!sb) return null;

    var channel = sb
      .channel('vv-match-' + sessionId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'match_sessions',
        filter: 'id=eq.' + sessionId
      }, function (payload) {
        onUpdate(payload.new.state, payload.new);
      })
      .subscribe();

    _channels.push(channel);
    return channel;
  }

  function removeChannel(ch) {
    var sb = getSupabase();
    if (!sb || !ch) return;
    try { sb.removeChannel(ch); } catch (e) {}
    var idx = _channels.indexOf(ch);
    if (idx !== -1) _channels.splice(idx, 1);
  }

  /* -------------------------------------------------------
     DOM: aggiornamento card singola
  ------------------------------------------------------- */
  function replaceCard(partitaId, newHtml) {
    var el = document.querySelector('[data-partita-id="' + partitaId + '"]');
    if (!el) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    var newEl = tmp.firstElementChild;
    el.parentNode.replaceChild(newEl, el);
    initExpandBtn(newEl);
  }

  function moveToConcluse(partitaId, conclusaHtml) {
    var elSrc = document.querySelector('#partiteProssime [data-partita-id="' + partitaId + '"]');
    if (elSrc) elSrc.remove();

    var elC = document.getElementById('partiteConcluse');
    if (!elC) return;
    var empty = elC.querySelector('.partite-empty');
    if (empty) empty.remove();

    var tmp = document.createElement('div');
    tmp.innerHTML = conclusaHtml;
    elC.insertBefore(tmp.firstElementChild, elC.firstChild);
  }

  /* -------------------------------------------------------
     UX: expand/collapse tabellino set su card live
  ------------------------------------------------------- */
  function initExpandBtn(cardEl) {
    var btn    = cardEl.querySelector('.partite-card-live-expand');
    var detail = cardEl.querySelector('.partite-card-set-detail');
    if (!btn || !detail) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      detail.hidden = expanded;
      btn.innerHTML = expanded ? '&#9656;' : '&#9662;';
    });

    cardEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  }

  /* -------------------------------------------------------
     Init principale
  ------------------------------------------------------- */
  function init() {
    var elP = document.getElementById('partiteProssime');
    var elC = document.getElementById('partiteConcluse');
    if (!elP && !elC) return;

    var loadPartite = (window.firebase && firebase.apps && firebase.apps.length)
      ? firebase.firestore().collection('siteData').doc('partite').get()
          .then(function (doc) {
            if (doc.exists && doc.data() && doc.data().json) return JSON.parse(doc.data().json);
            return fetch('data/partite.json').then(function (r) { return r.json(); });
          })
          .catch(function () { return fetch('data/partite.json').then(function (r) { return r.json(); }); })
      : fetch('data/partite.json').then(function (r) { return r.json(); });

    loadPartite
      .then(function (partite) {

        /* Fetch sessioni Supabase per le partite con codice_tabellone */
        var withCode = partite.filter(function (p) { return p.codice_tabellone; });

        var sessionPromises = withCode.map(function (p) {
          return fetchSession(p.codice_tabellone).then(function (row) {
            return { id: p.id, row: row };
          });
        });

        Promise.all(sessionPromises).then(function (results) {

          var sessionMap = {};
          results.forEach(function (r) { sessionMap[r.id] = r.row; });

          /* Arricchisci ogni partita con lo stato risolto */
          var enriched = partite.map(function (p) {
            var session = sessionMap[p.id] || null;
            var info    = resolveState(p, session);
            return Object.assign({}, p, info, { _session: session });
          });

          /* Ordina e separa */
          var prossime = enriched
            .filter(function (p) { return p.stato === 'programmata' || p.stato === 'live'; })
            .sort(function (a, b) { return a.data > b.data ? 1 : -1; })
            .slice(0, 2);

          var concluse = enriched
            .filter(function (p) { return p.stato === 'conclusa'; })
            .sort(function (a, b) { return a.data < b.data ? 1 : -1; })
            .slice(0, 2);

          /* Fallback colonna concluse: usa extra prossime */
          var concluseRender = concluse.length ? concluse : prossime.slice(2);

          /* Render prossime */
          if (elP) {
            if (prossime.length) {
              elP.innerHTML = prossime.map(function (p) {
                return p.stato === 'live' ? cardLive(p, p.liveState) : cardProssima(p);
              }).join('');
              elP.querySelectorAll('.partite-card--live').forEach(initExpandBtn);
            } else {
              elP.innerHTML = '<div class="partite-empty">Nessuna partita in programma.</div>';
            }
          }

          /* Render concluse */
          if (elC) {
            if (concluseRender.length) {
              elC.innerHTML = concluseRender.map(function (p) {
                return p.stato === 'conclusa'
                  ? cardConclusa(p, p.set_casa, p.set_ospite)
                  : cardProssima(p);
              }).join('');
            } else {
              elC.innerHTML = '<div class="partite-empty">Nessun risultato disponibile.</div>';
            }
          }

          /* Realtime: subscribe solo alle partite live con sessione nota */
          enriched
            .filter(function (p) { return p.stato === 'live' && p._session; })
            .forEach(function (p) {
              var ch = subscribeToSession(p, p.sessionId, function (newState) {
                if (newState && newState.matchOver === true) {
                  /* Partita finita: sposta in concluse */
                  var teamCasa   = (p.tabellone_squadra_casa || 'A') === 'A' ? 'A' : 'B';
                  var teamOspite = teamCasa === 'A' ? 'B' : 'A';
                  var updatedP = Object.assign({}, p, {
                    set_casa:   (newState['team' + teamCasa]   && newState['team' + teamCasa].sets   != null) ? newState['team' + teamCasa].sets   : 0,
                    set_ospite: (newState['team' + teamOspite] && newState['team' + teamOspite].sets != null) ? newState['team' + teamOspite].sets : 0
                  });
                  moveToConcluse(p.id, cardConclusa(updatedP, updatedP.set_casa, updatedP.set_ospite));
                  removeChannel(ch);
                } else {
                  /* Aggiorna card live */
                  replaceCard(p.id, cardLive(p, newState));
                }
              });
            });

        }).catch(function (e) {
          console.warn('[partite-live] Promise.all sessions error:', e);
        });

      })
      .catch(function (e) {
        console.warn('[partite-live] fetch partite.json error:', e);
      });
  }

  /* -------------------------------------------------------
     Cleanup WebSocket su uscita dalla pagina
  ------------------------------------------------------- */
  window.addEventListener('beforeunload', function () {
    var sb = getSupabase();
    if (!sb) return;
    _channels.forEach(function (ch) { try { sb.removeChannel(ch); } catch (e) {} });
    _channels = [];
  });

  document.addEventListener('DOMContentLoaded', init);
})();
