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

/* Gestori delegati al posto degli attributi inline (onclick/onerror), che la Content-Security-Policy non ammette. */
(function () {
  /* Link "Leggi →": ricorda quale articolo si sta aprendo (data-nav-id). */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-nav-id]');
    if (!a) return;
    try { sessionStorage.setItem('vv_nav_id', a.getAttribute('data-nav-id')); } catch (err) { /* storage non disponibile */ }
  });
  /* Immagini con data-fallback: se la prima fonte non carica, prova la seconda, una volta sola. */
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.getAttribute('data-fallback') || img.getAttribute('data-fallback-used')) return;
    img.setAttribute('data-fallback-used', '1');
    img.src = img.getAttribute('data-fallback');
  }, true);
})();
