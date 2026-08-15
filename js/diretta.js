/**
 * Victor Volley — Pagina Diretta
 * Video streaming YouTube (canale, persistente) + tabellone live via embed Set Point Pulse.
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
     Render: tabellone
  ------------------------------------------------------- */
  function renderLive(p) {
    return (
      '<div class="dt-top">' +
        '<span class="dt-cat">' + esc(catLabel(p.categoria)) + '</span>' +
        '<span class="dt-live-badge" aria-label="Partita in corso"><span class="dt-live-dot" aria-hidden="true"></span>LIVE</span>' +
      '</div>' +
      '<div class="dt-spp-embed">' +
        '<iframe src="https://set-point-pulse.lovable.app/embed/' + esc(p.spp_code) + '" width="480" height="120" frameborder="0"></iframe>' +
      '</div>' +
      '<p class="dt-meta">' + esc(p.squadra_casa) + ' &ndash; ' + esc(p.squadra_ospite) + '</p>' +
      '<p class="dt-meta">' + esc(p.palazzetto || '') + (p.palazzetto ? ' · ' : '') + esc(formatData(p.data, p.ora)) + '</p>'
    );
  }

  function renderConcluded(p, label) {
    var sc = p.set_casa != null ? p.set_casa : 0;
    var so = p.set_ospite != null ? p.set_ospite : 0;
    var casaWins = sc > so;
    return (
      '<p class="dt-upcoming-label">' + esc(label) + '</p>' +
      '<div class="dt-teams">' +
        '<div class="dt-team">' +
          '<div class="dt-team-logo">' + logoHtml(p.squadra_casa, p.logo_casa) + '</div>' +
          '<span class="dt-team-name">' + (casaWins ? '<strong>' + esc(p.squadra_casa) + '</strong>' : esc(p.squadra_casa)) + '</span>' +
          '<span class="dt-team-sets">' + sc + '</span>' +
        '</div>' +
        '<div class="dt-vs-col"><span class="dt-vs-label">Finale</span></div>' +
        '<div class="dt-team">' +
          '<div class="dt-team-logo">' + logoHtml(p.squadra_ospite, p.logo_ospite) + '</div>' +
          '<span class="dt-team-name">' + (!casaWins ? '<strong>' + esc(p.squadra_ospite) + '</strong>' : esc(p.squadra_ospite)) + '</span>' +
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
      '<p class="dt-upcoming-note">Il tabellone si attiver&agrave; il giorno della partita.</p>'
    );
  }

  function renderEmpty() {
    return '<p class="dt-loading">Nessuna diretta disponibile al momento.</p>';
  }

  /* -------------------------------------------------------
     Init principale
  ------------------------------------------------------- */
  function init() {
    var el = document.getElementById('direttaTabellone');
    if (!el) return;

    new Promise(function (resolve) { DB.load(['partite'], resolve); }).then(function () {
      var partite = VV.getPartite();
      var oggi = new Date().toISOString().slice(0, 10);

      /* "In diretta": partita programmata per oggi con un codice Set Point
         Pulse assegnato. È l'app SPP a gestire da sé gli stati pre/durante/
         dopo partita all'interno del proprio widget. */
      var live = partite.filter(function (p) {
        return p.stato === 'programmata' && p.spp_code && p.data === oggi;
      })[0];

      if (live) {
        el.innerHTML = renderLive(live);
        renderVideo(true);
        return;
      }

      renderVideo(false);

      var upcoming = partite
        .filter(function (p) { return p.stato === 'programmata' && p.data >= oggi; })
        .sort(function (a, b) { return a.data > b.data ? 1 : -1; })[0];

      if (upcoming) {
        el.innerHTML = renderUpcoming(upcoming);
        return;
      }

      var ultimaConclusa = partite
        .filter(function (p) { return p.stato === 'conclusa'; })
        .sort(function (a, b) { return a.data < b.data ? 1 : -1; })[0];

      el.innerHTML = ultimaConclusa ? renderConcluded(ultimaConclusa, 'Ultimo risultato') : renderEmpty();
    }).catch(function (e) {
      console.warn('[diretta] errore caricamento partite:', e);
      renderVideo(false);
      el.innerHTML = renderEmpty();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderVideo(false);
    init();
  });
})();
