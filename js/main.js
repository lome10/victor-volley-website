/* Victor Volley — main.js
   Comportamento generale: chiusura mega-menu con Escape,
   highlight voce nav attiva su pagine interne con anchor. */

document.addEventListener('DOMContentLoaded', function () {

  // Chiudi mega-menu con Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.megamenu.is-open').forEach(function (m) {
        m.classList.remove('is-open');
        var trigger = m.previousElementSibling;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        var li = m.closest('.has-megamenu');
        if (li) li.classList.remove('is-open');
      });
      var mobileNav = document.getElementById('mobile-nav-panel');
      var hamburger = document.querySelector('.hamburger');
      if (mobileNav && mobileNav.classList.contains('is-open')) {
        mobileNav.classList.remove('is-open');
        if (hamburger) { hamburger.classList.remove('is-open'); hamburger.setAttribute('aria-expanded', 'false'); }
        mobileNav.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    }
  });

  // Aggiorna anno copyright nei footer generati inline (fallback)
  var yearEls = document.querySelectorAll('#footer-year');
  yearEls.forEach(function (el) { el.textContent = new Date().getFullYear(); });

});
