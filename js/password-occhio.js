/* L'«occhietto» sui campi password: tocca per vedere quello che stai scrivendo, tocca di nuovo per nasconderlo.
   Si mette da solo su OGNI campo <input type="password"> della pagina (anche quelli aggiunti dopo): accesso atleti,
   cambio password, «Scegli la password», accesso e cambio password del pannello. Il campo resta lo stesso (stesso
   id, stesso autocomplete): cambia solo il tipo tra password e text. Si nasconde da solo quando si invia il modulo,
   quando la pagina viene chiusa o messa in secondo piano. */
(function () {
  'use strict';

  var OCCHIO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var OCCHIO_BARRATO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a19.7 19.7 0 0 1-3.17 4.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var stile = document.createElement('style');
  stile.textContent =
    '.pw-wrap{position:relative;display:block}' +
    '.pw-wrap>input{display:block;width:100%;box-sizing:border-box;padding-right:46px}' +
    '.pw-occhio{position:absolute;top:0;right:0;bottom:0;width:44px;display:flex;align-items:center;justify-content:center;' +
    'margin:0;padding:0;border:0;background:transparent;color:#64748b;cursor:pointer;border-radius:0 7px 7px 0}' +
    '.pw-occhio:hover{color:#0f172a}' +
    '.pw-occhio:focus-visible{outline:2px solid #008CFD;outline-offset:-2px}' +
    '.pw-occhio svg{display:block;pointer-events:none}';
  document.head.appendChild(stile);

  function mostra(campo, bottone, si) {
    campo.type = si ? 'text' : 'password';
    bottone.setAttribute('aria-pressed', si ? 'true' : 'false');
    bottone.setAttribute('aria-label', si ? 'Nascondi la password' : 'Mostra la password');
    bottone.title = si ? 'Nascondi la password' : 'Mostra la password';
    bottone.innerHTML = si ? OCCHIO_BARRATO : OCCHIO;
  }

  function aggiungi(campo) {
    if (campo.getAttribute('data-pw-occhio')) return;
    campo.setAttribute('data-pw-occhio', '1');
    var scatola = document.createElement('span');
    scatola.className = 'pw-wrap';
    var bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'pw-occhio';
    campo.parentNode.insertBefore(scatola, campo);
    scatola.appendChild(campo);
    scatola.appendChild(bottone);
    mostra(campo, bottone, false);
    // il campo non perde il fuoco (né il cursore) quando si tocca l'occhio
    bottone.addEventListener('mousedown', function (e) { e.preventDefault(); });
    bottone.addEventListener('click', function () { mostra(campo, bottone, campo.type === 'password'); });
    var nascondi = function () { if (campo.type !== 'password') mostra(campo, bottone, false); };
    if (campo.form) campo.form.addEventListener('submit', nascondi);
    window.addEventListener('pagehide', nascondi);
    document.addEventListener('visibilitychange', function () { if (document.hidden) nascondi(); });
  }

  function tutti() {
    var campi = document.querySelectorAll('input[type="password"]:not([data-pw-occhio])');
    for (var i = 0; i < campi.length; i++) aggiungi(campi[i]);
  }

  tutti();
  if (window.MutationObserver) {
    var atteso = false;
    new MutationObserver(function () {
      if (atteso) return;
      atteso = true;
      requestAnimationFrame(function () { atteso = false; tutti(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
