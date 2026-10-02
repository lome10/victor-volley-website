/* Victor Volley — script della pagina diretta.html (1), estratto dall'HTML per la Content-Security-Policy. */
if (/^(localhost|127.0.0.1)$/.test(location.hostname)) {
  var s = document.createElement('script');
  s.src = 'js/dev-sponsor-fixture.js';
  document.currentScript.parentNode.insertBefore(s, document.currentScript.nextSibling);
}
