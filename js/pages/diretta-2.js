/* Victor Volley — script della pagina diretta.html (2), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  DB.load(['sponsors'], function () {
    var goldEl = document.getElementById('direttaSponsorsGold');
    var ticker = document.getElementById('sponsorTicker');
    var track  = document.getElementById('sponsorTickerTrack');
    if (!goldEl || !ticker || !track) return;

    var sponsors = VV.getSponsors().filter(function (s) { return !!s.logo; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!sponsors.length) return;


    var gold = sponsors.filter(function (s) { return (s.livello || 'silver') === 'gold'; });
    var rest = sponsors.filter(function (s) { return (s.livello || 'silver') !== 'gold'; });

    if (gold.length) {
      var goldHtml = gold.map(function (s) {
        var inner = '<img src="' + esc(s.logo) + '" alt="' + esc(s.nome) + '" class="dt-sponsors-gold-logo">';
        return s.url
          ? '<a href="' + esc(s.url) + '" class="dt-sponsors-gold-item" target="_blank" rel="noopener">' + inner + '</a>'
          : '<div class="dt-sponsors-gold-item">' + inner + '</div>';
      }).join('');

      goldEl.innerHTML = '<div class="dt-sponsors-gold-track" id="direttaGoldTrack">' + goldHtml + '</div>';

      /* Su mobile: se i loghi non ci stanno su una riga, passa allo scorrimento
         automatico invece di andare a capo su più righe o restare minuscoli. */
      var goldTrack = document.getElementById('direttaGoldTrack');
      if (window.innerWidth <= 640 && gold.length > 1 && goldTrack.scrollWidth > goldEl.clientWidth + 4) {
        var dur = Math.max(12, gold.length * 5) + 's';
        goldTrack.className = 'dt-sponsors-gold-track is-scrolling';
        goldTrack.style.animationDuration = dur;
        goldTrack.innerHTML = goldHtml + goldHtml; /* duplica per loop seamless */
      }
    }

    if (rest.length) {
      function makeItem(s) {
        var inner = '<img src="' + esc(s.logo) + '" alt="' + esc(s.nome) + '" class="spt-logo">';
        return s.url
          ? '<a href="' + esc(s.url) + '" class="spt-item" target="_blank" rel="noopener">' + inner + '</a>'
          : '<div class="spt-item">' + inner + '</div>';
      }

      /* Ripetizioni intervallate: un round per volta, non tutte di fila,
         così un logo ripetuto ricompare solo dopo il turno degli altri. */
      function roundRobin(list) {
        var remaining = list.map(function (s) { return { s: s, left: Math.max(1, s.ripetizioni || 1) }; });
        var out = [];
        var any = true;
        while (any) {
          any = false;
          remaining.forEach(function (r) {
            if (r.left > 0) { out.push(r.s); r.left--; any = true; }
          });
        }
        return out;
      }

      var silver = rest.filter(function (s) { return (s.livello || 'silver') === 'silver'; });
      var bronze = rest.filter(function (s) { return s.livello === 'bronze'; });
      var silverSeq = roundRobin(silver);
      var bronzeSeq = roundRobin(bronze);

      /* Ogni silver è seguito da 2 bronze (a ciclo continuo sulla lista bronze) */
      var items = [];
      if (silverSeq.length && bronzeSeq.length) {
        var bi = 0;
        silverSeq.forEach(function (s) {
          items.push(s);
          items.push(bronzeSeq[bi % bronzeSeq.length]); bi++;
          items.push(bronzeSeq[bi % bronzeSeq.length]); bi++;
        });
      } else {
        items = silverSeq.length ? silverSeq : bronzeSeq;
      }

      var html = items.map(makeItem).join('');
      track.innerHTML = html + html; /* duplica per loop seamless */
      track.style.animationDuration = Math.max(15, items.length * 4) + 's';
      ticker.style.display = 'block';
    }
  });
})();
