/* Victor Volley — script della pagina news.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  var PAGE_SIZE = 6;
  var currentPage = 0;
  var currentFilter = 'all';

  var GRADIENTS = [
    'linear-gradient(180deg,#053063 0%,#0a5cbf 55%,#008CFD 100%)',
    'linear-gradient(180deg,#3d0b1e 0%,#8a1040 55%,#CB2168 100%)',
    'linear-gradient(180deg,#0a3d2e 0%,#145c44 55%,#1a8a5a 100%)',
    'linear-gradient(180deg,#0d2a04 0%,#1a4a0e 55%,#2d7a1f 100%)',
    'linear-gradient(180deg,#1a0533 0%,#3d0b72 55%,#CB2168 100%)'
  ];

  function slug(s) { return s.toLowerCase().replace(/\s+/g,'-').replace(/[àáâ]/g,'a').replace(/[èéê]/g,'e').replace(/[ìí]/g,'i').replace(/[òó]/g,'o').replace(/[ùú]/g,'u'); }
  function badgeCls(cat) { return cat === 'Prima Divisione' ? 'hero-card-cat--magenta' : 'hero-card-cat--azzurro'; }
  function catBadges(cats) {
    if (!cats.length) return '';
    return '<div class="hero-card-cats">' +
      cats.map(function (c) { return '<span class="hero-card-cat ' + badgeCls(c) + ' hero-card-cat--flush">' + esc(c) + '</span>'; }).join('') +
    '</div>';
  }

  DB.loadOrError(['articles'], 'newsPageCards', function () {
    var articles = VV.getArticles(true)
      .filter(function (a) { return a.id && !isNaN(+a.id); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var grid       = document.getElementById('newsPageCards');
    var filterBar  = document.getElementById('newsFilterBar');
    var pagination = document.getElementById('newsPagination');

    /* Categorie */
    var cats = [];
    articles.forEach(function (a) {
      VV.getArticleCategories(a).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
    });

    filterBar.innerHTML =
      '<button class="filter-btn is-active" data-filter="all">Tutte</button>' +
      cats.map(function (c) {
        return '<button class="filter-btn" data-filter="' + slug(c) + '">' + esc(c) + '</button>';
      }).join('');

    function getFiltered() {
      if (currentFilter === 'all') return articles;
      return articles.filter(function (a) {
        return VV.getArticleCategories(a).map(slug).indexOf(currentFilter) >= 0;
      });
    }

    function render() {
      var filtered   = getFiltered();
      var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (currentPage >= totalPages) currentPage = totalPages - 1;
      var start = currentPage * PAGE_SIZE;
      var page  = filtered.slice(start, start + PAGE_SIZE);

      if (!page.length) {
        grid.innerHTML = VV.emptyStateHtml(currentFilter === 'all' ? 'Nessun articolo pubblicato' : 'Nessun articolo in questa categoria', currentFilter === 'all' ? 'Torna a trovarci presto: le novità arriveranno qui.' : 'Prova con un&rsquo;altra categoria.', '', '');
      } else {
        grid.innerHTML = page.map(function (a, i) {
          var bgHtml = VV.cardBgHtml(a, GRADIENTS[(start + i) % GRADIENTS.length], i === 0);
          var aCats = VV.getArticleCategories(a);
          return '<article class="hero-card" data-cat="' + aCats.map(slug).join(' ') + '" data-id="' + esc(a.id) + '">' +
            bgHtml +
            '<div class="hero-card-overlay"></div>' +
            '<div class="hero-card-content">' +
              catBadges(aCats) +
              '<h2 class="hero-card-title">' + esc(a.title) + '</h2>' +
              '<a href="/news-dettaglio?id=' + esc(a.id) + '" class="hero-card-cta" ' +
                 'data-nav-id="' + esc(a.id) + '">Leggi &rarr;</a>' +
            '</div>' +
          '</article>';
        }).join('');

        /* Stessa animazione hover della hero (zoom bg + lift + dim sui vicini) e card interamente cliccabile */
        var cards = grid.querySelectorAll('.hero-card');
        cards.forEach(function (card) {
          card.addEventListener('mouseenter', function () {
            grid.classList.add('has-hover');
            cards.forEach(function (c) { c.classList.remove('is-hovered'); });
            card.classList.add('is-hovered');
          });
          card.addEventListener('mouseleave', function () {
            card.classList.remove('is-hovered');
            grid.classList.remove('has-hover');
          });
          card.addEventListener('click', function (e) {
            if (e.target.tagName === 'A') return;
            var id = card.getAttribute('data-id');
            sessionStorage.setItem('vv_nav_id', id);
            window.location.href = '/news-dettaglio?id=' + id;
          });
        });
      }

      /* Paginazione */
      if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
      }
      pagination.innerHTML =
        '<button class="news-pagination-btn" id="pgPrev"' + (currentPage === 0 ? ' disabled' : '') + '>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="15,18 9,12 15,6"/></svg> Precedente' +
        '</button>' +
        '<span class="news-pagination-info">Pag.&nbsp;' + (currentPage + 1) + ' / ' + totalPages + '</span>' +
        '<button class="news-pagination-btn" id="pgNext"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>' +
          'Successiva <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="9,18 15,12 9,6"/></svg>' +
        '</button>';

      document.getElementById('pgPrev').addEventListener('click', function () {
        currentPage--;
        render();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      document.getElementById('pgNext').addEventListener('click', function () {
        currentPage++;
        render();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    render();

    /* Filtro */
    filterBar.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBar.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        currentFilter = btn.getAttribute('data-filter');
        currentPage = 0;
        render();
      });
    });
  }); // DB.load
})();
