/**
 * Victor Volley — Pagina Diretta
 * Video streaming YouTube (canale, persistente) + tabellone live via embed Set Point Pulse.
 */
(function () {
  'use strict';

  /* -------------------------------------------------------
     Helpers
  ------------------------------------------------------- */
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
      ? '<img loading="lazy" decoding="async" src="' + esc(src) + '" alt="">'
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
     l'iframe live solo quando YouTube dice che il canale sta trasmettendo
     (/api/youtube-live, controllata ogni minuto);
     altrimenti mostriamo un avviso + l'ultimo video caricato (playlist
     "uploads" del canale, ricavata da UC... -> UU...).
  ------------------------------------------------------- */
  var CHANNEL_URL = 'https://www.youtube.com/@VictorVolleyVita';

  function uploadsPlaylistId(channelId) {
    return channelId.indexOf('UC') === 0 ? 'UU' + channelId.slice(2) : null;
  }

  function renderVideo(isLive, lastVideoId) {
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

    /* Ultimo video realmente riproducibile (ricavato dal server): la playlist
       "uploads" inizia anche con le dirette programmate, che non si vedono. */
    if (lastVideoId && /^[\w-]{11}$/.test(lastVideoId)) {
      if (msgEl) {
        msgEl.hidden = false;
        msgEl.innerHTML = 'Nessuna partita &egrave; al momento in diretta.<br>Nel frattempo, dai un&rsquo;occhiata alla nostra ultima partita.';
      }
      el.innerHTML =
        '<iframe src="https://www.youtube.com/embed/' + lastVideoId + '?autoplay=1&mute=1" ' +
          'title="Ultimo video Victor Volley" ' +
          'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
          'allowfullscreen></iframe>';
      return;
    }

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

  /* Il canale sta trasmettendo adesso? Risponde /api/youtube-live; se non
     risponde si considera "no" (si vede l'ultimo video, mai "non disponibile"). */
  var videoLive = null;
  function checkLive() {
    return fetch('/api/youtube-live', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { live: false }; })
      .then(function (j) { return { live: !!(j && j.live), last: (j && j.lastVideoId) || null }; })
      .catch(function () { return { live: false, last: null }; });
  }
  function initVideo() {
    function tick() {
      checkLive().then(function (st) {
        var chiave = st.live ? 'live' : 'last:' + st.last;
        if (chiave === videoLive) return;
        videoLive = chiave;
        renderVideo(st.live, st.last);
      });
    }
    tick();
    setInterval(tick, 60000);
  }

  /* -------------------------------------------------------
     Render: tabellone
  ------------------------------------------------------- */
  /* Tabellone Set Point Pulse: indirizzo fisso per società, segue da solo la
     partita in corso (altrimenti scrive "Nessuna partita in corso"). Sempre
     presente: non dipende dal calendario né da campi da compilare. */
  function embedHtml() {
    return (
      '<div class="dt-spp-embed">' +
        '<iframe src="https://victor-volley.setpointpulse.com/embed/club/victor-volley" width="480" height="120" title="Tabellone live Victor Volley" loading="lazy"></iframe>' +
      '</div>'
    );
  }

  function renderLive(p) {
    return (
      '<div class="dt-top">' +
        '<span class="dt-cat">' + esc(catLabel(p.categoria)) + '</span>' +
        '<span class="dt-live-badge" aria-label="Partita di oggi"><span class="dt-live-dot" aria-hidden="true"></span>OGGI</span>' +
      '</div>' +
      embedHtml() +
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
      '<p class="dt-upcoming-note">Il tabellone si attiva da solo quando inizia la partita.</p>'
    );
  }

  /* -------------------------------------------------------
     Init principale
  ------------------------------------------------------- */
  function init() {
    var el = document.getElementById('direttaTabellone');
    if (!el) return;

    new Promise(function (resolve) { DB.load(['partite'], resolve); }).then(function () {
      if (DB.failed(['partite'])) {
        el.innerHTML = embedHtml() + VV.errorStateHtml('Non riusciamo a caricare le partite.');
        var rb = el.querySelector('[data-retry]');
        if (rb) rb.addEventListener('click', function () { rb.disabled = true; rb.textContent = 'Riprovo…'; DB.retry(['partite'], init); });
        return;
      }
      var partite = VV.getPartite();
      var d = new Date();
      var oggi = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);

      /* Il tabellone c'è sempre (embedHtml); il video lo decide initVideo.
         Qui solo il riquadro con la partita di oggi, se c'è in calendario. */
      var live = partite.filter(function (p) {
        return p.stato === 'programmata' && p.data === oggi;
      })[0];

      if (live) {
        el.innerHTML = renderLive(live);
        return;
      }

      var upcoming = partite
        .filter(function (p) { return p.stato === 'programmata' && p.data >= oggi; })
        .sort(function (a, b) { return a.data > b.data ? 1 : -1; })[0];

      if (upcoming) {
        el.innerHTML = embedHtml() + renderUpcoming(upcoming);
        return;
      }

      var ultimaConclusa = partite
        .filter(function (p) { return p.stato === 'conclusa'; })
        .sort(function (a, b) { return a.data < b.data ? 1 : -1; })[0];

      el.innerHTML = embedHtml() + (ultimaConclusa ? renderConcluded(ultimaConclusa, 'Ultimo risultato') : '');
    }).catch(function (e) {
      console.warn('[diretta] errore caricamento partite:', e);
      el.innerHTML = embedHtml();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initVideo();
    init();
  });
})();
