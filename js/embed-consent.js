/* Victor Volley — consenso ai contenuti esterni (Google Maps, YouTube).
   Questi iframe impostano cookie di terze parti: non partono finché l'utente non preme «Carica».
   Si può caricare solo per quella volta o «sempre» (ricordato in localStorage con la chiave vv_embed_consent);
   la scelta si revoca dalla pagina /privacy. Senza localStorage funziona comunque, solo senza memoria. */
var VVConsent = (function () {
  var KEY = 'vv_embed_consent';

  function has() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function grant() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* storage non disponibile */ } }
  function revoke() { try { localStorage.removeItem(KEY); } catch (e) { /* storage non disponibile */ } }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* Mostra html (l'iframe) dentro container, ma solo con consenso; altrimenti un riquadro con il pulsante.
     opts = { provider: 'Google Maps', link: url di ripiego (apre il servizio in una nuova scheda) }.
     Richiamabile più volte con html aggiornato: se il riquadro è già a video si aggiorna solo l'html in attesa. */
  function gate(container, html, opts) {
    opts = opts || {};
    container._gateHtml = html;
    if (has()) { container.innerHTML = html; container._gated = false; return; }
    if (container._gated) return;
    container._gated = true;
    container.innerHTML =
      '<div class="embed-gate">' +
        '<p><strong>' + esc(opts.provider) + '</strong> &egrave; un servizio esterno che pu&ograve; impostare cookie propri.<br>' +
          'Il contenuto viene caricato solo se lo vuoi.</p>' +
        '<div class="embed-gate-actions">' +
          '<button type="button" class="btn btn--primary" data-embed="once">Carica</button>' +
          '<button type="button" class="btn btn--outline" data-embed="always">Carica sempre</button>' +
        '</div>' +
        '<p class="embed-gate-note">Dettagli nell&rsquo;<a href="/privacy#cookie">informativa su privacy e cookie</a>.' +
          (opts.link ? ' &middot; <a href="' + esc(opts.link) + '" target="_blank" rel="noopener">Apri su ' + esc(opts.provider) + ' &#8599;</a>' : '') + '</p>' +
      '</div>';
    container.addEventListener('click', function onClick(e) {
      var b = e.target.closest ? e.target.closest('[data-embed]') : null;
      if (!b || !container._gated) return;
      if (b.getAttribute('data-embed') === 'always') grant();
      container._gated = false;
      container.innerHTML = container._gateHtml;
    });
  }

  return { has: has, grant: grant, revoke: revoke, gate: gate };
})();
