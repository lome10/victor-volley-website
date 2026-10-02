/* Victor Volley — script della pagina index.html (4), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  /* Altezza reale della barra delle partite → variabile CSS: serve a dimensionare il video
     (schermo intero meno la barra + un po', così per vederlo tutto si scorre appena). */
  var bar = document.getElementById('partiteBar');
  if (bar) {
    var setBarH = function () { document.documentElement.style.setProperty('--partite-bar-h', bar.offsetHeight + 'px'); };
    setBarH();
    if ('ResizeObserver' in window) new ResizeObserver(setBarH).observe(bar);
    else window.addEventListener('resize', setBarH);
  }

  /* ID del video da un link YouTube (watch?v=, youtu.be, embed, shorts) o dall'ID stesso. */
  function youtubeId(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    var m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    if (m) return m[1];
    return /^[\w-]{11}$/.test(s) ? s : '';
  }

  /* Video in autoplay senza audio (i browser lo consentono solo se muto), in loop, con i
     controlli YouTube visibili per attivare l'audio. Il player viene caricato solo quando la
     sezione sta per entrare nella schermata, e va in pausa quando esce (niente banda sprecata).
     Con "riduci animazioni" attivo nel sistema non parte da solo: resta la copertina con il play. */
  function showVideo(id, title) {
    ['.maglia-silhouette', '.maglia-teaser-badge', '#magliaCountdown'].forEach(function (sel) {
      var n = document.querySelector('#magliaTeaserContent ' + sel);
      if (n) n.style.display = 'none';
    });
    document.getElementById('magliaTeaserSection').classList.add('maglia-teaser--video');
    var box = document.getElementById('magliaVideo');
    var safeTitle = (title || 'Presentazione maglia').replace(/"/g, '&quot;');
    var poster = '<img class="maglia-video-poster" src="https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg" alt="" decoding="async" ' +
      'data-fallback="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg">';
    box.innerHTML = poster;
    box.hidden = false;

    var iframe = null, pausedByUs = false, isMuted = true;
    function command(func) {
      if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: '' }), '*');
    }
    /* muted = true: modalità "sfondo" (autoplay muto, loop, nessuna interfaccia YouTube).
       Un parametro ufficiale per nascondere titolo/canale non esiste più, quindi: controls=0 toglie
       barra e ingranaggio delle impostazioni; l'iframe non riceve mai il mouse (niente barra titolo
       all'hover) ed è ingrandito e ritagliato dal CSS, così la fascia col titolo resta fuori dal riquadro.
       Al posto dei controlli c'è un solo pulsante audio, che comanda il player via API. */
    function load(muted) {
      if (iframe) return;
      var q = 'autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin) +
        (muted ? '&mute=1&loop=1&playlist=' + id + '&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&cc_load_policy=0' : '');
      box.classList.toggle('maglia-video--bg', muted);
      box.innerHTML = poster +
        '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?' + q + '" title="' + safeTitle + '" tabindex="-1" ' +
        'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>' +
        (muted ? '<button type="button" class="maglia-video-audio" aria-label="Attiva l\'audio" aria-pressed="false">' +
          '<svg class="ico-off" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.4-2.4-1.4-1.4L15.2 10.6 12.8 8.2l-1.4 1.4 2.4 2.4-2.4 2.4 1.4 1.4 2.4-2.4 2.4 2.4 1.4-1.4L16.6 12z"/></svg>' +
          '<svg class="ico-on" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>' +
        '</button>' : '');
      iframe = box.querySelector('iframe');
      var audioBtn = box.querySelector('.maglia-video-audio');
      if (audioBtn) audioBtn.addEventListener('click', function () {
        isMuted = !isMuted;
        command(isMuted ? 'mute' : 'unMute');
        audioBtn.setAttribute('aria-pressed', String(!isMuted));
        audioBtn.setAttribute('aria-label', isMuted ? 'Attiva l\'audio' : 'Disattiva l\'audio');
        audioBtn.classList.toggle('is-on', !isMuted);
      });
    }

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      box.innerHTML = '<button type="button" class="maglia-video-play" aria-label="Guarda il video: ' + safeTitle + '">' + poster +
        '<span class="maglia-video-btn" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></span></button>';
      box.querySelector('button').addEventListener('click', function () { load(false); });
      return;
    }

    if (!('IntersectionObserver' in window)) { load(true); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (!iframe) load(true);
          else if (pausedByUs) { pausedByUs = false; command('playVideo'); }
        } else if (iframe) {
          pausedByUs = true;
          command('pauseVideo');
        }
      });
    }, { rootMargin: '150px 0px', threshold: 0.25 }).observe(box);
  }

  DB.load(['maglia'], function () {
    var m = VV.getMaglia();
    var section = document.getElementById('magliaTeaserSection');
    if (!m.enabled) return;
    section.style.display = '';

    document.getElementById('maglia-title').textContent = m.title || '';
    document.getElementById('magliaTeaserSubtitle').textContent = m.subtitle || '';

    var videoId = youtubeId(m.videoUrl);

    /* Video di presentazione: prende il posto di countdown, silhouette e badge "In arrivo". */
    if (videoId) {
      showVideo(videoId, m.title);
      return;
    }

    var el = document.getElementById('magliaCountdown');
    var target = new Date(m.revealDate).getTime();
    if (isNaN(target)) { el.style.display = 'none'; return; }

    var nums = {
      days: el.querySelector('[data-unit="days"]'),
      hours: el.querySelector('[data-unit="hours"]'),
      minutes: el.querySelector('[data-unit="minutes"]'),
      seconds: el.querySelector('[data-unit="seconds"]')
    };
    function pad(n) { return String(n).padStart(2, '0'); }
    function tick() {
      var diff = target - Date.now();
      if (diff <= 0) {
        el.classList.add('is-done');
        nums.days.textContent = nums.hours.textContent = nums.minutes.textContent = nums.seconds.textContent = '00';
        clearInterval(timer);
        return;
      }
      var s = Math.floor(diff / 1000);
      nums.days.textContent = pad(Math.floor(s / 86400));
      nums.hours.textContent = pad(Math.floor((s % 86400) / 3600));
      nums.minutes.textContent = pad(Math.floor((s % 3600) / 60));
      nums.seconds.textContent = pad(s % 60);
    }
    tick();
    var timer = setInterval(tick, 1000);
  });
})();
