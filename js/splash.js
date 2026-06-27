(function () {
  var STORAGE_KEY = 'vv_splash_shown';

  function hideSplash(instant) {
    var splash = document.getElementById('splash-screen');
    if (!splash) return;
    if (instant) { splash.style.display = 'none'; return; }
    splash.classList.add('is-fading');
    setTimeout(function () { splash.style.display = 'none'; }, 420);
  }

  function runSplash() {
    var splash = document.getElementById('splash-screen');
    var pct   = document.getElementById('splashPercent');
    if (!splash || !pct) return;

    var DURATION = 1500;
    var start    = null;

    var safetyTimer = setTimeout(function () {
      sessionStorage.setItem(STORAGE_KEY, '1');
      hideSplash(false);
    }, 2400);

    function step(ts) {
      if (!start) start = ts;
      var elapsed  = ts - start;
      var progress = Math.min(elapsed / DURATION, 1);
      // ease-out quad so the counter slows as it approaches 100
      var eased = 1 - Math.pow(1 - progress, 2);
      pct.textContent = Math.round(eased * 100) + '%';

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        pct.textContent = '100%';
        clearTimeout(safetyTimer);
        sessionStorage.setItem(STORAGE_KEY, '1');
        setTimeout(function () { hideSplash(false); }, 120);
      }
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(step);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (sessionStorage.getItem(STORAGE_KEY)) { hideSplash(true); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sessionStorage.setItem(STORAGE_KEY, '1');
      hideSplash(true);
      return;
    }
    runSplash();
  });
})();
