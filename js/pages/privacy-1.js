/* Victor Volley — script della pagina privacy.html: revoca del consenso ai contenuti esterni. */
(function () {
  var btn = document.getElementById('revokeEmbeds');
  var status = document.getElementById('revokeStatus');
  if (!btn) return;
  btn.addEventListener('click', function () {
    VVConsent.revoke();
    if (status) status.textContent = '✓ Consenso revocato: Maps e YouTube torneranno a chiederti il permesso.';
  });
})();
