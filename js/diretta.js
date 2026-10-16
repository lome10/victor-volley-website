/**
 * Victor Volley — Pagina Diretta
 * Video streaming YouTube + tabellone live con grafica propria (dati da Set Point Pulse, polling ogni 5 s).
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
  /* Tabellone: i dati arrivano da Set Point Pulse (endpoint pubblico per
     società, aggiornato ogni pochi secondi); la grafica è nostra. */
  var SPP_URL = 'https://victor-volley.setpointpulse.com/api/club/victor-volley/live';

  /* "VICTOR VOLLEY VITA" -> "Victor Volley Vita" (i nomi arrivano in maiuscolo) */
  function nomeLeggibile(n) {
    return String(n || '').toLowerCase().replace(/(^|[ .'-])([a-zà-ú])/g, function (m, sep, c) { return sep + c.toUpperCase(); });
  }

  /* Le squadre si riconoscono dal NOME (Team A dell'app non è sempre la squadra di casa):
     elenco squadre del girone (nome + logo), altrimenti il logo Victor, altrimenti l'iniziale. */
  function squadraInfo(nome) {
    var sq = (window.VV && VV.findSquadraGirone) ? VV.findSquadraGirone(nome) : null;
    var isVictor = /victor/i.test(nome || '');
    return {
      nome: sq && sq.nome ? sq.nome : (isVictor ? 'Victor Volley' : nomeLeggibile(nome)),
      logo: sq && sq.logo ? sq.logo : (isVictor ? 'assets/logo.png' : '')
    };
  }

  /* Partita di oggi in calendario con una delle due squadre (per categoria e palazzetto). */
  function partitaDiOggi(live) {
    var k = function (n) { return VV.teamKey ? VV.teamKey(n) : String(n || '').toLowerCase(); };
    var a = k(live.home && live.home.name), b = k(live.away && live.away.name);
    var d = new Date();
    var oggi = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return (VV.getPartite() || []).filter(function (p) {
      if (p.data !== oggi) return false;
      var c = k(p.squadra_casa), o = k(p.squadra_ospite);
      return (c === a || c === b || o === a || o === b);
    })[0] || null;
  }

  function teamBlock(t, serving) {
    var info = squadraInfo(t.name);
    return (
      '<div class="dt-team' + (serving ? ' is-serving' : '') + '">' +
        '<div class="dt-team-logo">' + logoHtml(info.nome, info.logo) + '</div>' +
        '<span class="dt-team-name">' + esc(info.nome) + '</span>' +
        '<span class="dt-serve"' + (serving ? ' role="img" aria-label="Al servizio"' : ' aria-hidden="true"') + '></span>' +
      '</div>'
    );
  }

  function setChips(hist) {
    if (!hist || !hist.length) return '';
    return '<div class="dt-setchips" aria-label="Set conclusi">' + hist.map(function (s, i) {
      return '<span class="dt-setchip"><small>Set ' + (i + 1) + '</small>' + s.home + '&ndash;' + s.away + '</span>';
    }).join('') + '</div>';
  }

  /* Partita in corso (status live) o appena finita (status finished) */
  function renderSpp(j) {
    var live = j.status === 'live';
    var cal = partitaDiOggi(j);
    var h = j.home, a = j.away;
    var cat = cal && cal.categoria ? catLabel(cal.categoria) : '';
    var meta = cal
      ? esc((cal.palazzetto || '')) + (cal.palazzetto ? ' · ' : '') + esc(formatData(cal.data, cal.ora))
      : '';
    return (
      '<div class="dt-top">' +
        '<span class="dt-cat">' + esc(cat || (live ? 'In diretta' : 'Risultato finale')) + '</span>' +
        (live
          ? '<span class="dt-live-badge" aria-label="Partita in corso"><span class="dt-live-dot" aria-hidden="true"></span>LIVE</span>'
          : '<span class="dt-final-badge">Partita conclusa</span>') +
      '</div>' +
      '<div class="dt-teams dt-teams--live">' +
        teamBlock(h, live && j.serving === 'home') +
        '<div class="dt-vs-col dt-scorecol">' +
          (live
            ? '<span class="dt-vs-label">Set ' + (j.currentSet || 1) + '</span>' +
              '<div class="dt-points" aria-label="Punteggio del set">' +
                '<span>' + h.points + '</span><i>&ndash;</i><span>' + a.points + '</span></div>'
            : '<span class="dt-vs-label">Set vinti</span>') +
          '<div class="dt-setswon' + (live ? '' : ' dt-setswon--final') + '" aria-label="Set vinti"><span>' + h.sets + '</span><i>&ndash;</i><span>' + a.sets + '</span></div>' +
          (live ? '<span class="dt-vs-label">set vinti</span>' : '') +
        '</div>' +
        teamBlock(a, live && j.serving === 'away') +
      '</div>' +
      setChips(j.setHistory) +
      (meta ? '<p class="dt-meta">' + meta + '</p>' : '')
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
  var fallbackHtml = '<p class="dt-loading">Caricamento tabellone&hellip;</p>';
  var ultimoRender = '';
  var pollTimer = null;

  function paint(html, chiave) {
    var el = document.getElementById('direttaTabellone');
    if (!el || chiave === ultimoRender) return;
    ultimoRender = chiave;
    el.innerHTML = html;
  }

  /* Legge lo stato dal tabellone; senza partita (o in caso di errore) mostra il riquadro di ripiego. */
  function poll() {
    if (document.hidden) return;
    fetch(SPP_URL, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        if (j && (j.status === 'live' || j.status === 'finished') && j.home && j.away) {
          paint(renderSpp(j), JSON.stringify(j));
        } else {
          paint(fallbackHtml, 'fallback:' + fallbackHtml);
        }
      });
  }

  function init() {
    var el = document.getElementById('direttaTabellone');
    if (!el) return;

    new Promise(function (resolve) { DB.load(['partite'], resolve); }).then(function () {
      if (DB.failed(['partite'])) {
        fallbackHtml = VV.errorStateHtml('Non riusciamo a caricare le partite.');
        paint(fallbackHtml, 'errore');
        var rb = el.querySelector('[data-retry]');
        if (rb) rb.addEventListener('click', function () { rb.disabled = true; rb.textContent = 'Riprovo…'; DB.retry(['partite'], init); });
        return;
      }
      var partite = VV.getPartite();
      var d = new Date();
      var oggi = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);

      var upcoming = partite
        .filter(function (p) { return p.stato === 'programmata' && p.data >= oggi; })
        .sort(function (a, b) { return a.data > b.data ? 1 : -1; })[0];

      var ultimaConclusa = partite
        .filter(function (p) { return p.stato === 'conclusa'; })
        .sort(function (a, b) { return a.data < b.data ? 1 : -1; })[0];

      fallbackHtml = upcoming ? renderUpcoming(upcoming)
        : ultimaConclusa ? renderConcluded(ultimaConclusa, 'Ultimo risultato')
        : '<p class="dt-loading">Nessuna diretta disponibile al momento.</p>';
    }).catch(function (e) {
      console.warn('[diretta] errore caricamento partite:', e);
      fallbackHtml = '<p class="dt-loading">Nessuna diretta disponibile al momento.</p>';
    }).then(function () {
      poll();
      if (!pollTimer) pollTimer = setInterval(poll, 5000);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initVideo();
    init();
  });
})();
