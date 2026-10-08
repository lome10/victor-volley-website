/* Victor Volley — script della pagina index.html (6), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  var GRADIENTS = [
    'linear-gradient(180deg,#031e3e 0%,#053063 60%,#084080 100%)',
    'linear-gradient(180deg,#0a3a70 0%,#053063 55%,#CB2168 100%)',
    'linear-gradient(180deg,#031e3a 0%,#053063 60%,#0070D6 100%)',
    'linear-gradient(180deg,#1a0533 0%,#3d0b72 55%,#CB2168 100%)'
  ];

  function badgeCls(cat) { return cat === 'Prima Divisione' ? 'hero-card-cat--magenta' : 'hero-card-cat--azzurro'; }
  function catBadges(cats) {
    if (!cats.length) return '';
    return '<div class="hero-card-cats">' +
      cats.map(function (c) { return '<span class="hero-card-cat ' + badgeCls(c) + ' hero-card-cat--flush">' + esc(c) + '</span>'; }).join('') +
    '</div>';
  }

  DB.loadOrError(['articles'], 'heroCardsTrack', function () {
  var all      = VV.getArticles(true).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var ordered  = all.filter(function (a) { return a.heroOrder > 0; })
                    .sort(function (a, b) { return a.heroOrder - b.heroOrder; });
  var articles = (ordered.length ? ordered : all).slice(0, 3);

  var track = document.getElementById('heroCardsTrack');
  if (track && !articles.length) track.innerHTML = '';
  if (!track || !articles.length) return;

  /* Costruisce le card */
  track.innerHTML = articles.map(function (a, i) {
    var bgHtml = VV.cardBgHtml(a, GRADIENTS[i % GRADIENTS.length], i === 0);
    return '<article class="hero-card" data-id="' + a.id + '">' +
      bgHtml +
      '<div class="hero-card-overlay"></div>' +
      '<div class="hero-card-content">' +
        catBadges(VV.getArticleCategories(a)) +
        '<h2 class="hero-card-title">' + esc(a.title) + '</h2>' +
        '<a href="/news-dettaglio?id=' + a.id + '" class="hero-card-cta" ' +
           'data-nav-id="' + esc(a.id) + '">Leggi &rarr;</a>' +
      '</div>' +
    '</article>';
  }).join('');

  /* Hover */
  var cards = track.querySelectorAll('.hero-card');
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

  /* Dots carosello — visibili solo su mobile via CSS */
  var dotsWrap = document.createElement('div');
  dotsWrap.className = 'hero-dots-mobile';
  articles.forEach(function (_, i) {
    var dot = document.createElement('span');
    dot.className = 'hero-dot-m' + (i === 0 ? ' is-active' : '');
    dotsWrap.appendChild(dot);
  });
  track.parentElement.appendChild(dotsWrap);

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

  }); // DB.load
})();
