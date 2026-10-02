/* Victor Volley — script della pagina index.html (5), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  var GRADIENTS = [
    'linear-gradient(180deg,#031e3e 0%,#053063 60%,#084080 100%)',
    'linear-gradient(180deg,#0a3a70 0%,#053063 55%,#CB2168 100%)',
    'linear-gradient(180deg,#031e3a 0%,#053063 60%,#0070D6 100%)',
    'linear-gradient(180deg,#1a0533 0%,#3d0b72 55%,#CB2168 100%)',
    'linear-gradient(180deg,#0d2a04 0%,#1a4a0e 55%,#2d7a1f 100%)',
    'linear-gradient(180deg,#2a0d04 0%,#5a1a0e 55%,#9a2f1f 100%)'
  ];
  function badgeCls(cat) { return cat === 'Prima Divisione' ? 'hero-card-cat--magenta' : 'hero-card-cat--azzurro'; }
  function catBadges(cats) {
    if (!cats.length) return '';
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
      cats.map(function (c) { return '<span class="hero-card-cat ' + badgeCls(c) + '" style="margin-bottom:0">' + esc(c) + '</span>'; }).join('') +
    '</div>';
  }

  DB.load(['articles'], function () {
    var articles = VV.getArticles(true)
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .slice(0, 6);

    var track    = document.getElementById('newsCardsTrack');
    var prevBtn  = document.getElementById('newsCardsPrev');
    var nextBtn  = document.getElementById('newsCardsNext');
    var dotsWrap = document.getElementById('newsDotsMobile');
    if (!track || !articles.length) return;

    track.innerHTML = articles.map(function (a, i) {
      var bgStyle = a.image
        ? 'background-image:url(' + esc(a.image) + ')' + (a.imageFocus ? ';background-position:' + esc(a.imageFocus) : '')
        : 'background:' + GRADIENTS[i % GRADIENTS.length];
      return '<article class="hero-card" data-id="' + a.id + '">' +
        '<div class="hero-card-bg" style="' + bgStyle + '"></div>' +
        '<div class="hero-card-overlay"></div>' +
        '<div class="hero-card-content">' +
          catBadges(VV.getArticleCategories(a)) +
          '<h2 class="hero-card-title">' + esc(a.title) + '</h2>' +
          '<a href="/news-dettaglio?id=' + a.id + '" class="hero-card-cta" ' +
             'data-nav-id="' + esc(a.id) + '">Leggi &rarr;</a>' +
        '</div>' +
      '</article>';
    }).join('');

    var cards    = track.querySelectorAll('.hero-card');
    var CARD_GAP = 16;
    var offsetPx = 0;

    function cardStep() {
      return cards[0] ? cards[0].offsetWidth + CARD_GAP : 0;
    }
    /* Scorrimento massimo reale: larghezza vera di tutte le card meno
       quella vera visibile — nessuna stima "quante card entrano",
       così non si può né fermarsi prima né andare oltre il contenuto. */
    function maxOffsetPx() {
      return Math.max(0, track.scrollWidth - track.parentElement.clientWidth);
    }
    function slideBy(deltaCards) {
      var max = maxOffsetPx();
      offsetPx = Math.max(0, Math.min(offsetPx + deltaCards * cardStep(), max));
      track.style.transform = 'translateX(-' + offsetPx + 'px)';
      prevBtn.disabled = offsetPx <= 0;
      nextBtn.disabled = offsetPx >= max - 1; /* -1: tolleranza per arrotondamenti subpixel */
    }

    prevBtn.addEventListener('click', function () { slideBy(-1); });
    nextBtn.addEventListener('click', function () { slideBy(1); });
    window.addEventListener('resize', function () { slideBy(0); });
    slideBy(0);

    /* Hover (desktop) */
    cards.forEach(function (card) {
      card.addEventListener('mouseenter', function () {
        track.classList.add('has-hover');
        cards.forEach(function (c) { c.classList.remove('is-hovered'); });
        card.classList.add('is-hovered');
      });
      card.addEventListener('mouseleave', function () {
        card.classList.remove('is-hovered');
        track.classList.remove('has-hover');
      });
      card.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') return;
        var id = card.getAttribute('data-id');
        sessionStorage.setItem('vv_nav_id', id);
        window.location.href = '/news-dettaglio?id=' + id;
      });
    });

    /* Dots (mobile scroll-snap) */
    articles.forEach(function (_, i) {
      var dot = document.createElement('span');
      dot.className = 'hero-dot-m' + (i === 0 ? ' is-active' : '');
      dotsWrap.appendChild(dot);
    });
    var dotEls = dotsWrap.querySelectorAll('.hero-dot-m');
    track.addEventListener('scroll', function () {
      var mid = track.scrollLeft + track.clientWidth / 2;
      var closest = 0, minDist = Infinity;
      cards.forEach(function (card, i) {
        var dist = Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      dotEls.forEach(function (d, i) { d.classList.toggle('is-active', i === closest); });
    }, { passive: true });
  });
})();
