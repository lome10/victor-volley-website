/* Victor Volley — script della pagina index.html (2), estratto dall'HTML per la Content-Security-Policy. */
(function () {

  DB.load(['sponsors'], function () {
    var sponsorSection = document.getElementById('sponsorSection');
    var all = VV.getSponsors().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!all.length) return;

    var gold = all.filter(function (s) { return (s.livello || 'silver') === 'gold'; });
    var rest = all.filter(function (s) { return (s.livello || 'silver') !== 'gold' && !!s.logo; });
    var shown = false;

    /* Gold: card grandi e statiche, stesse di /sponsor (nome per esteso se manca il logo) */
    if (gold.length) {
      var goldGrid = document.getElementById('sponsorGoldGrid');
      goldGrid.innerHTML = gold.map(function (s) {
        var inner = s.logo
          ? '<img loading="lazy" decoding="async" src="' + esc(VV.imgUrl(s.logo, 400)) + '" alt="' + esc(s.nome) + '" class="sponsor-card-logo">'
          : '<div class="sponsor-card-name">' + esc(s.nome) + '</div>';
        var cls = 'sponsor-card sponsor-card--gold reveal';
        return VV.safeUrl(s.url)
          ? '<a href="' + esc(VV.safeUrl(s.url)) + '" target="_blank" rel="noopener" class="' + cls + '">' + inner + '</a>'
          : '<div class="' + cls + '">' + inner + '</div>';
      }).join('');
      goldGrid.style.display = '';
      shown = true;
    }

    /* Silver/Bronze: ticker scorrevole (richiede un logo), ripetizioni
       intervallate (un round per volta, non tutte di fila, così un logo
       ripetuto ricompare solo dopo il turno degli altri) */
    if (rest.length) {
      var ticker = document.getElementById('sponsorTicker');
      var track  = document.getElementById('sponsorTickerTrack');
      function makeItem(s) {
        var inner = '<img loading="lazy" decoding="async" src="' + esc(VV.imgUrl(s.logo, 400)) + '" alt="' + esc(s.nome) + '" class="spt-logo">';
        return VV.safeUrl(s.url)
          ? '<a href="' + esc(VV.safeUrl(s.url)) + '" class="spt-item" target="_blank" rel="noopener">' + inner + '</a>'
          : '<div class="spt-item">' + inner + '</div>';
      }

      var remaining = rest.map(function (s) { return { s: s, left: Math.max(1, s.ripetizioni || 1) }; });
      var items = [];
      var any = true;
      while (any) {
        any = false;
        remaining.forEach(function (r) {
          if (r.left > 0) { items.push(r.s); r.left--; any = true; }
        });
      }

      var html = items.map(makeItem).join('');
      track.innerHTML = html + html; /* duplica per loop seamless */
      track.style.animationDuration = Math.max(15, items.length * 4) + 's';
      ticker.style.display = 'block';
      shown = true;
    }

    if (shown) sponsorSection.style.display = '';
  });
})();
