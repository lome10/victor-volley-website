/* Victor Volley — Animazioni signature (sezione 2.ter del piano)
   1. Parallax leggero sull'hero (solo desktop)
   2. Contatori numerici animati (stats strip)
   3. Countdown prossima partita
   4. Reveal a cascata delle card (stagger animation)
   Tutte rispettano prefers-reduced-motion. */

(function () {
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================
     Utility: Intersection Observer riusabile
  ============================================================ */
  function onVisible(elements, callback, options) {
    if (!('IntersectionObserver' in window)) {
      // Fallback: esegui subito senza animazione
      Array.prototype.forEach.call(elements, function (el) { callback(el); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          callback(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, options || { threshold: 0.15 });
    Array.prototype.forEach.call(elements, function (el) { observer.observe(el); });
  }

  /* ============================================================
     1. REVEAL A CASCATA
     Applicato a tutti gli elementi .reveal presenti nella pagina.
     Delay crescente di 80ms per i primi 8 elementi per griglia.
  ============================================================ */
  function initReveal() {
    var revealEls = document.querySelectorAll('.reveal');
    if (!revealEls.length) return;

    if (reducedMotion) {
      // Con reduced motion: mostra tutto subito, solo opacity (no translateY)
      Array.prototype.forEach.call(revealEls, function (el) {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }

    // Raggruppa elementi per parent grid (per calcolare stagger relativo al gruppo)
    var groups = new Map();
    Array.prototype.forEach.call(revealEls, function (el) {
      var parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(el);
    });

    onVisible(revealEls, function (el) {
      var parent = el.parentElement;
      var siblings = groups.get(parent) || [el];
      var idx = siblings.indexOf(el);
      // Stagger: max 8 posizioni diverse, poi delay fisso a 640ms
      var delay = Math.min(idx, 8) * 80;
      el.style.transitionDelay = delay + 'ms';
      el.classList.add('is-visible');
    }, { threshold: 0.1 });
  }

  /* ============================================================
     2. PARALLAX HERO
     Solo desktop (min-width 900px) e no reduced motion.
     Muove #heroBg al 35% della velocità di scroll.
  ============================================================ */
  function initParallax() {
    var heroBg = document.getElementById('heroBg');
    if (!heroBg || reducedMotion) return;
    if (window.innerWidth < 900) return;

    heroBg.style.willChange = 'transform';

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          var scrollY = window.pageYOffset;
          // Limita lo spostamento a ±70px per evitare bordi vuoti
          var offset = Math.min(Math.max(scrollY * 0.35, -70), 70);
          heroBg.style.transform = 'translateY(' + offset + 'px)';
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ============================================================
     3. CONTATORI NUMERICI ANIMATI
     Attivati quando la stats-strip entra nella viewport.
     Legge data-count (numero target), data-prefix, data-suffix.
  ============================================================ */
  function animateCount(el, target, prefix, suffix, duration) {
    var start = null;
    var from = 0;

    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      // Easing ease-out: decelerare verso la fine
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(from + (target - from) * eased);
      el.textContent = (prefix || '') + current + (suffix || '');
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function initCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    if (reducedMotion) return; // mostra valori statici già presenti nell'HTML

    onVisible(counters, function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      var prefix = el.getAttribute('data-prefix') || '';
      var suffix = el.getAttribute('data-suffix') || '';
      animateCount(el, target, prefix, suffix, 1300);
    }, { threshold: 0.3 });
  }

  /* ============================================================
     4. COUNTDOWN PROSSIMA PARTITA
     Cerca elementi con data-match="YYYY-MM-DDTHH:MM:SS".
     Aggiorna ogni minuto i display GG/ORE/MIN.
  ============================================================ */
  function initCountdown() {
    var cdEl = document.getElementById('countdown-1');
    if (!cdEl) return;

    var matchDate = cdEl.getAttribute('data-match');
    if (!matchDate) return;

    var target = new Date(matchDate);
    var elD = document.getElementById('cd1-d');
    var elH = document.getElementById('cd1-h');
    var elM = document.getElementById('cd1-m');
    if (!elD || !elH || !elM) return;

    function update() {
      var now  = new Date();
      var diff = target - now;

      if (diff <= 0) {
        elD.textContent = '0';
        elH.textContent = '0';
        elM.textContent = '0';
        return;
      }

      var totalMin = Math.floor(diff / 60000);
      var days  = Math.floor(totalMin / (60 * 24));
      var hours = Math.floor((totalMin % (60 * 24)) / 60);
      var mins  = totalMin % 60;

      elD.textContent = days;
      elH.textContent = hours;
      elM.textContent = mins;
    }

    update();
    setInterval(update, 60000);
  }

  /* ============================================================
     5. PALLONE DECORATIVO — già gestito in CSS via @keyframes
        (ball-float su .deco-ball). Niente JS aggiuntivo necessario.
        Con reduced motion, la media query CSS azzera la durata.
  ============================================================ */

  /* ============================================================
     Init al caricamento DOM
  ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    initReveal();
    initParallax();
    initCounters();
    initCountdown();
  });
})();
