/* Victor Volley — avviso «In diretta» (js/live-banner.js)
   Compare in basso, su ogni pagina che lo carica, quando c'è una partita con codice Set Point Pulse
   in programma OGGI (stessa regola di js/diretta.js) e siamo nella sua finestra: da 1 ora e mezza
   prima dell'inizio fino a 4 ore dopo (tutto il giorno se manca l'orario). Si chiude con la X e
   non ricompare per quella partita finché non si chiude la scheda.
   Dipende da: db.js (DB.load) + data.js (VV.getPartite) + esc.js. */
(function () {
  if (!window.DB || !window.VV) return;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayLocal() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* true se `now` è nella finestra della partita */
  function inWindow(p, now) {
    var m = /^(\d{1,2}):(\d{2})/.exec(p.ora || '');
    if (!m) return true;
    var start = new Date(p.data + 'T' + pad(+m[1]) + ':' + m[2] + ':00');
    if (isNaN(start)) return true;
    return now >= start.getTime() - 90 * 60000 && now <= start.getTime() + 4 * 3600000;
  }

  function findLive() {
    var oggi = todayLocal(), now = Date.now();
    return VV.getPartite().filter(function (p) {
      return p && p.stato !== 'conclusa' && p.spp_code && p.data === oggi && inWindow(p, now) &&
        p.squadra_casa && p.squadra_ospite && p.squadra_casa !== 'undefined' && p.squadra_ospite !== 'undefined';
    })[0] || null;
  }

  function dismissedKey(p) { return 'vv_live_dismissed_' + p.id; }
  function isDismissed(p) { try { return sessionStorage.getItem(dismissedKey(p)) === '1'; } catch (e) { return false; } }
  function dismiss(p) { try { sessionStorage.setItem(dismissedKey(p), '1'); } catch (e) { /* storage non disponibile */ } }

  function show(p) {
    if (document.getElementById('liveBanner')) return;
    var box = document.createElement('div');
    box.id = 'liveBanner';
    box.className = 'live-banner';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Partita in diretta');
    box.innerHTML =
      '<a class="live-banner-link" href="/diretta">' +
        '<span class="live-banner-dot" aria-hidden="true"></span>' +
        '<span class="live-banner-text"><strong>In diretta</strong>' +
          '<span class="live-banner-match">' + esc(p.squadra_casa) + ' &ndash; ' + esc(p.squadra_ospite) + '</span></span>' +
        '<span class="live-banner-cta">Guarda &rarr;</span>' +
      '</a>' +
      '<button type="button" class="live-banner-close" aria-label="Chiudi avviso">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
      '</button>';
    box.querySelector('.live-banner-close').addEventListener('click', function () {
      dismiss(p);
      box.parentNode.removeChild(box);
    });
    document.body.appendChild(box);
  }

  DB.load(['partite'], function () {
    var p = findLive();
    if (p && !isDismissed(p)) show(p);
  });
})();
