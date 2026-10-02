/* Victor Volley — script della pagina news-dettaglio.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  function badgeCls(cat) { return cat === 'Prima Divisione' ? 'badge--magenta' : 'badge--azzurro'; }
  function heroCatCls(cat) { return cat === 'Prima Divisione' ? 'hero-card-cat--magenta' : 'hero-card-cat--azzurro'; }
  function catBadges(cats) {
    return cats.map(function (c) { return '<span class="badge ' + badgeCls(c) + '">' + esc(c) + '</span>'; }).join(' ');
  }
  function heroCatBadges(cats) {
    if (!cats.length) return '';
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
      cats.map(function (c) { return '<span class="hero-card-cat ' + heroCatCls(c) + '" style="margin-bottom:0">' + esc(c) + '</span>'; }).join('') +
    '</div>';
  }

  var _qs  = (window.location.search.match(/[?&]id=([^&#]+)/) || [])[1];
  var _ss  = sessionStorage.getItem('vv_nav_id');
  var id   = parseInt(_qs || _ss || '', 10);
  sessionStorage.removeItem('vv_nav_id');
  if (isNaN(id) || id <= 0) { window.location.href = '/news'; return; }

  DB.load(['articles', 'sponsors'], function () {
  var content = document.getElementById('articleContent');
  var article = VV.getArticle(id);

  if (!article) {
    content.innerHTML =
      '<p style="color:#888;text-align:center;padding:64px 0;font-size:16px">Articolo non trovato.<br>' +
      '<a href="/news" style="color:var(--c-azzurro)">Torna alle news</a></p>';
    return;
  }

  /* Sponsor sopra l'articolo — fino a 3, scelti dall'admin per questo articolo,
     tutti alla stessa dimensione e sempre interi (mai ritagliati). */
  var sponsorsEl = document.getElementById('articleSponsors');
  var articleSponsorIds = Array.isArray(article.sponsor_ids) ? article.sponsor_ids : [];
  if (sponsorsEl && articleSponsorIds.length) {
    var articleSponsors = VV.getSponsors()
      .filter(function (s) { return !!s.logo && articleSponsorIds.indexOf(s.id) >= 0; })
      .sort(function (a, b) { return articleSponsorIds.indexOf(a.id) - articleSponsorIds.indexOf(b.id); })
      .slice(0, 3);

    sponsorsEl.innerHTML = articleSponsors.map(function (s) {
      var inner = '<img loading="lazy" decoding="async" src="' + esc(s.logo) + '" alt="' + esc(s.nome) + '" class="art-sponsors-logo">';
      return VV.safeUrl(s.url)
        ? '<a href="' + esc(VV.safeUrl(s.url)) + '" class="art-sponsors-item" target="_blank" rel="noopener">' + inner + '</a>'
        : '<div class="art-sponsors-item">' + inner + '</div>';
    }).join('');
  }

  /* Cover — formato scelto in admin (default 4:5), coerente con hero/news card per il focus point */
  var cover = document.getElementById('articleCover');
  cover.style.aspectRatio = article.coverRatio === '9:16' ? '9 / 16' : '4 / 5';
  cover.innerHTML = article.image
    ? '<img fetchpriority="high" decoding="async" src="' + esc(article.image) + '" alt="' + esc(article.title) + '"' + (article.imageFocus ? ' style="object-position:' + esc(article.imageFocus) + '"' : '') + '>'
    : '<div class="article-cover-placeholder">&#127944;</div>';

  /* Metadati */
  var catEl  = document.getElementById('articleCategory');
  catEl.innerHTML = catBadges(VV.getArticleCategories(article));
  document.getElementById('articleDate').textContent  = VV.formatDate(article.date);
  document.getElementById('articleTitle').textContent = article.title;
  document.title = article.title + ' — Victor Volley';
  /* Canonical e anteprima dell'articolo (Google esegue il JS; l'immagine solo se è un URL vero, non un base64). */
  (function () {
    var SITE = 'https://www.victorvolley.it', url = SITE + '/news-dettaglio?id=' + article.id;
    function up(tag, attr, key, val, attr2) {
      var el = document.querySelector(tag + '[' + attr + '="' + key + '"]');
      if (!el) { el = document.createElement(tag); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute(attr2, val);
    }
    up('link', 'rel', 'canonical', url, 'href');
    up('meta', 'property', 'og:url', url, 'content');
    up('meta', 'property', 'og:title', document.title, 'content');
    if (article.excerpt) up('meta', 'property', 'og:description', article.excerpt, 'content');
    if (/^https?:\/\//.test(article.image || '')) up('meta', 'property', 'og:image', article.image, 'content');
  })();

  /* Corpo */
  var bodyEl = document.getElementById('articleBody');
  /* Il corpo è HTML scritto in admin: passa da DOMPurify (via script, onclick, iframe, javascript:…).
     Se la libreria non si carica si mostra solo testo semplice, mai HTML grezzo. */
  if (!article.content) {
    bodyEl.innerHTML = '<p style="color:#aaa;font-style:italic">Contenuto non disponibile.</p>';
  } else if (window.DOMPurify) {
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
      if (node.tagName === 'A' && node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
    });
    bodyEl.innerHTML = DOMPurify.sanitize(article.content, {
      ADD_ATTR: ['target'],
      /* niente moduli/campi (phishing), SVG/MathML né CSS incorporato: gli articoli non ne hanno bisogno */
      FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math', 'style']
    });
  } else {
    bodyEl.textContent = article.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Articoli correlati — stessa card 4:5 e stessa animazione hover di hero/news.
     Su mobile diventa un carosello scroll-snap (come l'hero) con puntini,
     così titolo e badge hanno spazio a sufficienza per restare leggibili. */
  var others = VV.getArticles(true).filter(function (a) { return a.id !== article.id; }).slice(0, 3);
  if (others.length) {
    var relatedGrid = document.getElementById('relatedGrid');
    var relatedDots = document.getElementById('relatedDotsMobile');
    document.getElementById('relatedSection').style.display = '';
    relatedGrid.innerHTML = others.map(function (a) {
      var bgHtml = VV.cardBgHtml(a, 'linear-gradient(135deg,#053063,#008CFD)');
      return '<article class="hero-card" data-id="' + a.id + '">' +
        bgHtml +
        '<div class="hero-card-overlay"></div>' +
        '<div class="hero-card-content">' +
          heroCatBadges(VV.getArticleCategories(a)) +
          '<h2 class="hero-card-title">' + esc(a.title) + '</h2>' +
          '<a href="/news-dettaglio?id=' + a.id + '" class="hero-card-cta" ' +
             'data-nav-id="' + esc(a.id) + '">Leggi &rarr;</a>' +
        '</div>' +
      '</article>';
    }).join('');

    var relatedCards = relatedGrid.querySelectorAll('.hero-card');
    relatedCards.forEach(function (card) {
      card.addEventListener('mouseenter', function () {
        relatedGrid.classList.add('has-hover');
        relatedCards.forEach(function (c) { c.classList.remove('is-hovered'); });
        card.classList.add('is-hovered');
      });
      card.addEventListener('mouseleave', function () {
        card.classList.remove('is-hovered');
        relatedGrid.classList.remove('has-hover');
      });
      card.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') return;
        var relId = card.getAttribute('data-id');
        sessionStorage.setItem('vv_nav_id', relId);
        window.location.href = '/news-dettaglio?id=' + relId;
      });
    });

    /* Dots (carosello mobile scroll-snap) */
    others.forEach(function (_, i) {
      var dot = document.createElement('span');
      dot.className = 'hero-dot-m' + (i === 0 ? ' is-active' : '');
      relatedDots.appendChild(dot);
    });
    var relatedDotEls = relatedDots.querySelectorAll('.hero-dot-m');
    relatedGrid.addEventListener('scroll', function () {
      var mid = relatedGrid.scrollLeft + relatedGrid.clientWidth / 2;
      var closest = 0, minDist = Infinity;
      relatedCards.forEach(function (card, i) {
        var dist = Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      relatedDotEls.forEach(function (d, i) { d.classList.toggle('is-active', i === closest); });
    }, { passive: true });
  }
  }); // DB.load
})();
