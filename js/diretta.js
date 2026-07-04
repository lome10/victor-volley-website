/**
 * Victor Volley — Pagina Diretta
 * Video streaming YouTube (canale, persistente) + tabellone live via Supabase.
 */
(function () {
  'use strict';

  /* -------------------------------------------------------
     Helpers
  ------------------------------------------------------- */
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var CAT_ABBREV = {
    'prima divisione': 'Prima Divisione',
    'under 18': 'Under 18', 'under 13': 'Under 13', 'under 12': 'Under 12',
    'minivolley': 'Minivolley'
  };
  function catLabel(cat) { return CAT_ABBREV[(cat || '').toLowerCase()] || cat || ''; }

  var LOGO_MAP = { 'victor volley': 'assets/logo.png' };
  function logoHtml(nome, logoSrc) {
    var src = logoSrc || LOGO_MAP[(nome || '').toLowerCase().trim()];
    return src
      ? '<img src="' + esc(src) + '" alt="">'
      : '<span class="dt-team-logo-init">' + esc((nome || '?').charAt(0).toUpperCase()) + '</span>';
  }

  function formatData(dateStr, ora) {
    var d = new Date(dateStr + 'T00:00:00');
    var giorni = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    var mesi   = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    return giorni[d.getDay()] + ' ' + d.getDate() + ' ' + mesi[d.getMonth()] + (ora ? ' · ' + ora : '');
  }

  /* -------------------------------------------------------
     Video streaming — embed del canale YouTube.
     L'embed persistente /embed/live_stream?channel= mostra "Video non
     disponibile" quando il canale non sta trasmettendo in questo
     momento (cosa vera quasi sempre): per evitarlo, carichiamo
     l'iframe live solo quando il tabellone segnala una partita live;
     altrimenti mostriamo un avviso + l'ultimo video caricato (playlist
     "uploads" del canale, ricavata da UC... -> UU...).
  ------------------------------------------------------- */
  var CHANNEL_URL = 'https://www.youtube.com/@VictorVolleyVita';

  function uploadsPlaylistId(channelId) {
    return channelId.indexOf('UC') === 0 ? 'UU' + channelId.slice(2) : null;
  }

  function renderVideo(isLive) {
    var el    = document.getElementById('direttaVideo');
    var msgEl = document.getElementById('direttaVideoMsg');
    if (!el) return;
    var channelId = window.YOUTUBE_CHANNEL_ID;
    var hasChannel = channelId && channelId !== 'INSERISCI_CHANNEL_ID_YOUTUBE';

    if (isLive && hasChannel) {
      if (msgEl) msgEl.hidden = true;
      el.innerHTML =
        '<iframe src="https://www.youtube.com/embed/live_stream?channel=' + encodeURIComponent(channelId) + '&autoplay=1&mute=1" ' +
          'title="Diretta YouTube Victor Volley" ' +
          'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
          'allowfullscreen></iframe>' +
        '<a class="dt-video-fallback" href="' + CHANNEL_URL + '/live" target="_blank" rel="noopener">Guarda su YouTube &#8599;</a>';
      return;
    }

    var playlistId = hasChannel ? uploadsPlaylistId(channelId) : null;

    if (playlistId) {
      if (msgEl) {
        msgEl.hidden = false;
        msgEl.innerHTML = 'Nessuna partita &egrave; al momento in diretta.<br>Nel frattempo, dai un&rsquo;occhiata alla nostra ultima partita.';
      }
      el.innerHTML =
        '<iframe src="https://www.youtube.com/embed/videoseries?list=' + encodeURIComponent(playlistId) + '&autoplay=1&mute=1" ' +
          'title="Ultimo video Victor Volley" ' +
          'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
          'allowfullscreen></iframe>';
      return;
    }

    if (msgEl) msgEl.hidden = true;
    el.innerHTML =
      '<div class="dt-video-placeholder">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' +
        '<span>Streaming non ancora configurato.<br>Segui la diretta su <a href="' + CHANNEL_URL + '/live" target="_blank" rel="noopener">YouTube</a>.</span>' +
      '</div>';
  }

  /* -------------------------------------------------------
     Supabase — tabellone live (stessa logica di partite-live.js)
  ------------------------------------------------------- */
  var _sb = null;
  function getSupabase() {
    if (_sb) return _sb;
    if (!window.SUPABASE_URL || window.SUPABASE_URL === 'INSERISCI_URL_SUPABASE') return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return _sb;
  }

  var _channel = null;
  function subscribeToSession(sessionId, onUpdate) {
    var sb = getSupabase();
    if (!sb) return null;
    var ch = sb
      .channel('vv-diretta-' + sessionId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'match_sessions', filter: 'id=eq.' + sessionId
      }, function (payload) { onUpdate(payload.new.state, payload.new); })
      .subscribe();
    _channel = ch;
    return ch;
  }
  function removeChannel() {
    var sb = getSupabase();
    if (!sb || !_channel) return;
    try { sb.removeChannel(_channel); } catch (e) {}
    _channel = null;
  }

  function fetchSession(code) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve(null);
    return sb.from('match_sessions').select('id, state, status').eq('code', code).maybeSingle()
      .then(function (res) {
        if (res.error) { console.warn('[diretta] Supabase error:', res.error.message); return null; }
        return res.data;
      })
      .catch(function (e) { console.warn('[diretta] fetch session failed:', e); return null; });
  }

  function resolveState(p, sessionRow) {
    if (!p.codice_tabellone || !sessionRow) return { stato: p.stato };
    var st = sessionRow.state || {};
    var teamCasa   = (p.tabellone_squadra_casa || 'A') === 'A' ? 'A' : 'B';
    var teamOspite = teamCasa === 'A' ? 'B' : 'A';
    if (st.matchOver === true) {
      return {
        stato: 'conclusa',
        set_casa:   (st['team' + teamCasa]   && st['team' + teamCasa].sets   != null) ? st['team' + teamCasa].sets   : 0,
        set_ospite: (st['team' + teamOspite] && st['team' + teamOspite].sets != null) ? st['team' + teamOspite].sets : 0
      };
    }
    return { stato: 'live', liveState: st, sessionId: sessionRow.id };
  }

  /* -------------------------------------------------------
     Render: tabellone
  ------------------------------------------------------- */
  function renderLive(p, state) {
    var teamCasa   = (p.tabellone_squadra_casa || 'A') === 'A' ? 'A' : 'B';
    var teamOspite = teamCasa === 'A' ? 'B' : 'A';

    var setCasa   = (state['team' + teamCasa]   && state['team' + teamCasa].sets   != null) ? state['team' + teamCasa].sets   : 0;
    var setOspite = (state['team' + teamOspite] && state['team' + teamOspite].sets != null) ? state['team' + teamOspite].sets : 0;
    var scoreCasa = (state['team' + teamCasa]   && state['team' + teamCasa].score  != null) ? state['team' + teamCasa].score  : 0;
    var scoreOsp  = (state['team' + teamOspite] && state['team' + teamOspite].score != null) ? state['team' + teamOspite].score : 0;
    var currentSet = state.currentSet != null ? state.currentSet : 1;

    var storico = (state.history || [])
      .filter(function (e) { return e && e.setCompleted; })
      .map(function (e) { return e.setCompleted; });

    var rowsHtml = storico.map(function (s) {
      var sCasa = teamCasa === 'A' ? (s.scoreA != null ? s.scoreA : 0) : (s.scoreB != null ? s.scoreB : 0);
      var sOsp  = teamOspite === 'A' ? (s.scoreA != null ? s.scoreA : 0) : (s.scoreB != null ? s.scoreB : 0);
      return '<tr><td>Set ' + (s.setNumber || '') + '</td><td>' + sCasa + '</td><td>' + sOsp + '</td></tr>';
    }).join('');

    return (
      '<div class="dt-top">' +
        '<span class="dt-cat">' + esc(catLabel(p.categoria)) + '</span>' +
        '<span class="dt-live-badge" aria-label="Partita in corso"><span class="dt-live-dot" aria-hidden="true"></span>LIVE</span>' +
      '</div>' +
      '<div class="dt-teams">' +
        '<div class="dt-team">' +
          '<div class="dt-team-logo">' + logoHtml(p.squadra_casa, p.logo_casa) + '</div>' +
          '<span class="dt-team-name">' + esc(p.squadra_casa) + '</span>' +
          '<span class="dt-team-sets">' + setCasa + '</span>' +
        '</div>' +
        '<div class="dt-vs-col">' +
          '<span class="dt-vs-label">Set ' + currentSet + '</span>' +
          '<span class="dt-current-score">' + scoreCasa + '&ndash;' + scoreOsp + '</span>' +
        '</div>' +
        '<div class="dt-team">' +
          '<div class="dt-team-logo">' + logoHtml(p.squadra_ospite, p.logo_ospite) + '</div>' +
          '<span class="dt-team-name">' + esc(p.squadra_ospite) + '</span>' +
          '<span class="dt-team-sets">' + setOspite + '</span>' +
        '</div>' +
      '</div>' +
      (rowsHtml
        ? '<table class="dt-sets-table"><thead><tr><th></th><th>' + esc(p.squadra_casa) + '</th><th>' + esc(p.squadra_ospite) + '</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>'
        : '') +
      '<p class="dt-meta">' + esc(p.palazzetto || '') + (p.palazzetto ? ' · ' : '') + esc(formatData(p.data, p.ora)) + '</p>'
    );
  }

  function renderConcluded(p, label) {
    var sc = p.set_casa != null ? p.set_casa : 0;
    var so = p.set_ospite != null ? p.set_ospite : 0;
    return (
      '<p class="dt-upcoming-label">' + esc(label) + '</p>' +
      '<div class="dt-teams">' +
        '<div class="dt-team">' +
          '<div class="dt-team-logo">' + logoHtml(p.squadra_casa, p.logo_casa) + '</div>' +
          '<span class="dt-team-name">' + esc(p.squadra_casa) + '</span>' +
          '<span class="dt-team-sets">' + sc + '</span>' +
        '</div>' +
        '<div class="dt-vs-col"><span class="dt-vs-label">Finale</span></div>' +
        '<div class="dt-team">' +
          '<div class="dt-team-logo">' + logoHtml(p.squadra_ospite, p.logo_ospite) + '</div>' +
          '<span class="dt-team-name">' + esc(p.squadra_ospite) + '</span>' +
          '<span class="dt-team-sets">' + so + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="dt-meta">' + esc(catLabel(p.categoria)) + ' · ' + esc(formatData(p.data, null)) + '</p>'
    );
  }

  function renderUpcoming(p) {
    return (
      '<p class="dt-upcoming-label">Prossima diretta</p>' +
      '<div class="dt-teams">' +
        '<div class="dt-team">' +
          '<div class="dt-team-logo">' + logoHtml(p.squadra_casa, p.logo_casa) + '</div>' +
          '<span class="dt-team-name">' + esc(p.squadra_casa) + '</span>' +
        '</div>' +
        '<div class="dt-vs-col"><span class="dt-vs-label">vs</span></div>' +
        '<div class="dt-team">' +
          '<div class="dt-team-logo">' + logoHtml(p.squadra_ospite, p.logo_ospite) + '</div>' +
          '<span class="dt-team-name">' + esc(p.squadra_ospite) + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="dt-meta">' + esc(catLabel(p.categoria)) + ' · ' + esc(formatData(p.data, p.ora)) + (p.palazzetto ? ' · ' + esc(p.palazzetto) : '') + '</p>' +
      '<p class="dt-upcoming-note">Il tabellone si attiver&agrave; automaticamente all&rsquo;inizio della partita.</p>'
    );
  }

  function renderEmpty() {
    return '<p class="dt-loading">Nessuna diretta disponibile al momento.</p>';
  }

  /* -------------------------------------------------------
     Init principale
  ------------------------------------------------------- */
  var _pollTimer = null;

  function init() {
    var el = document.getElementById('direttaTabellone');
    if (!el) return;

    var loadPartite = (window.firebase && firebase.apps && firebase.apps.length)
      ? firebase.firestore().collection('siteData').doc('partite').get()
          .then(function (doc) {
            if (doc.exists && doc.data() && doc.data().json) return JSON.parse(doc.data().json);
            return fetch('data/partite.json').then(function (r) { return r.json(); });
          })
          .catch(function () { return fetch('data/partite.json').then(function (r) { return r.json(); }); })
      : fetch('data/partite.json').then(function (r) { return r.json(); });

    loadPartite.then(function (partite) {
      var withCode = partite.filter(function (p) { return p.codice_tabellone; });

      Promise.all(withCode.map(function (p) {
        return fetchSession(p.codice_tabellone).then(function (row) { return { id: p.id, row: row }; });
      })).then(function (results) {
        var sessionMap = {};
        results.forEach(function (r) { sessionMap[r.id] = r.row; });

        var enriched = partite.map(function (p) {
          var info = resolveState(p, sessionMap[p.id] || null);
          return Object.assign({}, p, info);
        });

        var live = enriched.filter(function (p) { return p.stato === 'live'; })[0];

        if (live) {
          el.innerHTML = renderLive(live, live.liveState);
          renderVideo(true);
          subscribeToSession(live.sessionId, function (newState) {
            if (newState && newState.matchOver === true) {
              removeChannel();
              renderVideo(false);
              el.innerHTML = renderConcluded(Object.assign({}, live, resolveState(live, { state: newState })), 'Partita conclusa');
            } else {
              el.innerHTML = renderLive(live, newState);
            }
          });
          return;
        }

        renderVideo(false);

        var oggi = new Date().toISOString().slice(0, 10);
        var upcoming = enriched
          .filter(function (p) { return p.stato === 'programmata' && p.data >= oggi; })
          .sort(function (a, b) { return a.data > b.data ? 1 : -1; })[0];

        if (upcoming) {
          el.innerHTML = renderUpcoming(upcoming);
          if (upcoming.codice_tabellone) {
            _pollTimer = setInterval(function () {
              fetchSession(upcoming.codice_tabellone).then(function (row) {
                if (!row) return;
                var info = resolveState(upcoming, row);
                if (info.stato === 'live') {
                  clearInterval(_pollTimer);
                  var live2 = Object.assign({}, upcoming, info);
                  el.innerHTML = renderLive(live2, info.liveState);
                  renderVideo(true);
                  subscribeToSession(info.sessionId, function (newState) {
                    if (newState && newState.matchOver === true) {
                      removeChannel();
                      renderVideo(false);
                      el.innerHTML = renderConcluded(Object.assign({}, live2, resolveState(live2, { state: newState })), 'Partita conclusa');
                    } else {
                      el.innerHTML = renderLive(live2, newState);
                    }
                  });
                } else if (info.stato === 'conclusa') {
                  clearInterval(_pollTimer);
                  el.innerHTML = renderConcluded(Object.assign({}, upcoming, info), 'Partita conclusa');
                }
              });
            }, 60000);
          }
          return;
        }

        var ultimaConclusa = enriched
          .filter(function (p) { return p.stato === 'conclusa'; })
          .sort(function (a, b) { return a.data < b.data ? 1 : -1; })[0];

        el.innerHTML = ultimaConclusa ? renderConcluded(ultimaConclusa, 'Ultimo risultato') : renderEmpty();
      }).catch(function (e) {
        console.warn('[diretta] errore sessioni Supabase:', e);
        renderVideo(false);
        el.innerHTML = renderEmpty();
      });
    }).catch(function (e) {
      console.warn('[diretta] errore caricamento partite:', e);
      renderVideo(false);
      el.innerHTML = renderEmpty();
    });
  }

  window.addEventListener('beforeunload', function () {
    if (_pollTimer) clearInterval(_pollTimer);
    removeChannel();
  });

  document.addEventListener('DOMContentLoaded', function () {
    renderVideo(false);
    init();
  });
})();
