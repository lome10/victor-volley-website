/* Victor Volley — script della pagina sponsor.html (2), estratto dall'HTML per la Content-Security-Policy. */
(function () {

  var TIERS = [
    { key: 'gold',   label: 'Gold' },
    { key: 'silver', label: 'Silver' },
    { key: 'bronze', label: 'Bronze' }
  ];

  function card(s, tierKey) {
    var inner = s.logo
      ? '<img loading="lazy" decoding="async" src="' + esc(s.logo) + '" alt="' + esc(s.nome) + '" class="sponsor-card-logo">'
      : '<div class="sponsor-card-name">' + esc(s.nome) + '</div>';
    var cls = 'sponsor-card sponsor-card--' + tierKey + ' reveal';
    return VV.safeUrl(s.url)
      ? '<a href="' + esc(VV.safeUrl(s.url)) + '" target="_blank" rel="noopener" class="' + cls + '">' + inner + '</a>'
      : '<div class="' + cls + '">' + inner + '</div>';
  }

  function emptyState(tierKey, label) {
    return '<div class="sponsor-tier-empty">Nessun partner ' + label + ' al momento. ' +
      '<a href="#richiedi-info">Vuoi essere il primo?</a></div>';
  }

  DB.loadOrError(['sponsors', 'livelliSponsorSub'], 'sponsorTiers', function () {
    var sponsors = VV.getSponsors().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var subTexts = VV.getLivelliSponsorSub();
    var wrap = document.getElementById('sponsorTiers');

    wrap.innerHTML = TIERS.map(function (t) {
      var list = sponsors.filter(function (s) { return (s.livello || 'silver') === t.key; });
      var gridHtml = list.length
        ? list.map(function (s) { return card(s, t.key); }).join('')
        : emptyState(t.key, t.label);

      return '<div class="sponsor-tier">' +
        '<div class="sponsor-tier-head">' +
          '<span class="sponsor-tier-badge sponsor-tier-badge--' + t.key + '">' + t.label + '</span>' +
          '<span class="sponsor-tier-sub">' + esc(subTexts[t.key]) + '</span>' +
        '</div>' +
        '<div class="sponsor-grid sponsor-grid--' + t.key + '">' + gridHtml + '</div>' +
      '</div>';
    }).join('');
  });
})();
