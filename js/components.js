/* Victor Volley — sidebar + footer condivisi */
(function () {
  var page = window.location.pathname.split('/').pop() || 'index.html';

  var SVG = {
    fb:      '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>',
    ig:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
    tt:      '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg>',
    pin:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    mail:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>',
    phone:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="6,9 12,15 18,9"/></svg>',
    arrow:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="9,18 15,12 9,6"/></svg>'
  };

  function isActive(p) { return page === p ? ' is-active' : ''; }

  /* ---- SIDEBAR ---- */
  function buildSidebar() {
    var el = document.querySelector('header.site-header');
    if (!el) return;

    el.innerHTML =
      '<div class="sidebar-logo">' +
        '<a href="index.html" aria-label="Victor Volley — home">' +
          '<img src="assets/logo.png" alt="Victor Volley">' +
        '</a>' +
      '</div>' +

      '<nav class="sidebar-nav" aria-label="Navigazione principale">' +
        '<ul class="sidebar-nav-list">' +

          '<li>' +
            '<a href="index.html" class="sidebar-nav-link' + (page === 'index.html' || page === '' ? ' is-active' : '') + '">Home</a>' +
          '</li>' +

          _sidebarItem('snav-squadre', 'Squadre', 'Le nostre squadre', [
            ['squadre.html#prima-divisione', 'Prima Divisione'],
            ['squadre.html#under-19',        'Under 19'],
            ['squadre.html#under-13',        'Under 13'],
            ['squadre.html#under-12',        'Under 12'],
            ['squadre.html#minivolley',      'Minivolley']
          ], page === 'squadre.html') +

          _sidebarItem('snav-stagione', 'Stagione', 'Stagione 2025/26', [
            ['calendario.html',           'Calendario'],
            ['calendario.html#risultati', 'Risultati'],
            ['contatti.html#palazzetto',  'Palazzetto ARKÉ']
          ], page === 'calendario.html') +

          '<li>' +
            '<a href="news.html" class="sidebar-nav-link' + isActive('news.html') + '">News</a>' +
          '</li>' +

          '<li>' +
            '<a href="galleria.html" class="sidebar-nav-link' + isActive('galleria.html') + '">Galleria</a>' +
          '</li>' +

          '<li>' +
            '<a href="sponsor.html" class="sidebar-nav-link' + isActive('sponsor.html') + '">Sponsor</a>' +
          '</li>' +

          '<li>' +
            '<a href="contatti.html" class="sidebar-nav-link' + isActive('contatti.html') + '">Contatti</a>' +
          '</li>' +

        '</ul>' +
      '</nav>' +

      '<div class="sidebar-cta">' +
        '<a href="unisciti-a-noi.html" class="sidebar-cta-btn">' +
          'Gioca<br>con noi' +
        '</a>' +
      '</div>' +

      '<div class="sidebar-bottom">' +
        '<a href="https://www.facebook.com/share/1EVp57f8nJ/?mibextid=wwXIfr" class="sidebar-social-link" aria-label="Facebook" target="_blank" rel="noopener noreferrer">' + SVG.fb + '</a>' +
        '<a href="https://www.instagram.com/victorvolleyvita?igsh=MWwyYW94MnV4d2h3Nw==" class="sidebar-social-link" aria-label="Instagram" target="_blank" rel="noopener noreferrer">' + SVG.ig + '</a>' +
        '<a href="https://www.tiktok.com/@victor.volley?_r=1&_t=ZN-97Yb5Cn2O5j" class="sidebar-social-link" aria-label="TikTok" target="_blank" rel="noopener noreferrer">' + SVG.tt + '</a>' +
      '</div>';

    _initFlyouts(el);
    _initMobileToggle(el);
  }

  function _sidebarItem(id, label, flyoutTitle, links, active) {
    return '<li class="sidebar-nav-item' + (active ? ' is-open' : '') + '" id="' + id + '">' +
      '<button class="sidebar-nav-trigger' + (active ? ' is-active' : '') + '" aria-expanded="' + (active ? 'true' : 'false') + '">' +
        label +
        ' <span class="sidebar-nav-arrow" aria-hidden="true">' + SVG.chevron + '</span>' +
      '</button>' +
      '<div class="sidebar-flyout' + (active ? ' is-open' : '') + '">' +
        '<div class="sidebar-flyout-title">' + flyoutTitle + '</div>' +
        links.map(function(l) {
          return '<a href="' + l[0] + '" class="sidebar-flyout-link">' + l[1] + '</a>';
        }).join('') +
      '</div>' +
    '</li>';
  }

  function _initFlyouts(sidebar) {
    sidebar.querySelectorAll('.sidebar-nav-item').forEach(function(item) {
      var trigger = item.querySelector('.sidebar-nav-trigger');
      var flyout  = item.querySelector('.sidebar-flyout');
      if (!trigger || !flyout) return;

      function openItem() {
        sidebar.querySelectorAll('.sidebar-nav-item').forEach(function(o) {
          if (o !== item) {
            o.classList.remove('is-open');
            o.querySelector('.sidebar-flyout').classList.remove('is-open');
            o.querySelector('.sidebar-nav-trigger').setAttribute('aria-expanded', 'false');
          }
        });
        item.classList.add('is-open');
        flyout.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }

      function closeItem() {
        item.classList.remove('is-open');
        flyout.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }

      item.addEventListener('mouseenter', function() {
        if (window.innerWidth > 900) openItem();
      });
      item.addEventListener('mouseleave', function() {
        if (window.innerWidth > 900) closeItem();
      });

      trigger.addEventListener('click', function() {
        item.classList.contains('is-open') ? closeItem() : openItem();
      });
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.site-header')) {
        sidebar.querySelectorAll('.sidebar-nav-item').forEach(function(item) {
          item.classList.remove('is-open');
          item.querySelector('.sidebar-flyout').classList.remove('is-open');
          item.querySelector('.sidebar-nav-trigger').setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  function _initMobileToggle(sidebar) {
    var toggle  = document.createElement('button');
    toggle.className = 'sidebar-toggle';
    toggle.id = 'sidebarToggle';
    toggle.setAttribute('aria-label', 'Apri menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML =
      '<span class="sidebar-toggle-line"></span>' +
      '<span class="sidebar-toggle-line"></span>' +
      '<span class="sidebar-toggle-line"></span>';

    var overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';

    document.body.appendChild(toggle);
    document.body.appendChild(overlay);

    function openSidebar() {
      sidebar.classList.add('is-open');
      toggle.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      sidebar.classList.remove('is-open');
      toggle.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    toggle.addEventListener('click', function() {
      sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar();
    });

    overlay.addEventListener('click', closeSidebar);
  }

  /* ---- FOOTER ---- */
  function buildFooter() {
    var el = document.querySelector('footer.site-footer');
    if (!el) return;
    var year = new Date().getFullYear();

    el.innerHTML =
      '<div class="container">' +
        '<div class="footer-main">' +
          '<div>' +
            '<img src="assets/logo.png" alt="Victor Volley" class="footer-logo-img">' +
            '<p class="footer-tagline">Societ&agrave; sportiva dilettantistica<br>Melissano (LE) &mdash; dal 2019</p>' +
            '<div class="footer-social">' +
              '<a href="https://www.facebook.com/share/1EVp57f8nJ/?mibextid=wwXIfr" aria-label="Facebook" target="_blank" rel="noopener noreferrer">' + SVG.fb + '</a>' +
              '<a href="https://www.instagram.com/victorvolleyvita?igsh=MWwyYW94MnV4d2h3Nw==" aria-label="Instagram" target="_blank" rel="noopener noreferrer">' + SVG.ig + '</a>' +
              '<a href="https://www.tiktok.com/@victor.volley?_r=1&_t=ZN-97Yb5Cn2O5j" aria-label="TikTok" target="_blank" rel="noopener noreferrer">' + SVG.tt + '</a>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div class="footer-col-title">Link rapidi</div>' +
            '<ul class="footer-links">' +
              '<li><a href="index.html">Home</a></li>' +
              '<li><a href="squadre.html">Le squadre</a></li>' +
              '<li><a href="calendario.html">Calendario</a></li>' +
              '<li><a href="news.html">News</a></li>' +
              '<li><a href="galleria.html">Galleria</a></li>' +
              '<li><a href="unisciti-a-noi.html">Vieni a giocare con noi</a></li>' +
              '<li><a href="contatti.html">Contatti</a></li>' +
            '</ul>' +
          '</div>' +
          '<div>' +
            '<div class="footer-col-title">Dove siamo</div>' +
            '<div class="footer-contact-item">' + SVG.pin +
              '<span>Palazzetto ARK&Eacute; &mdash; Melissano (LE)<br>' +
              '<small style="color:rgba(255,255,255,0.3);font-size:11px">&#9888; Indirizzo da confermare</small></span>' +
            '</div>' +
            '<div class="footer-contact-item">' + SVG.mail +
              '<span><a href="mailto:info@victorvolley.it" style="color:rgba(255,255,255,0.65)">info@victorvolley.it</a>' +
              ' <small style="color:rgba(255,255,255,0.3);font-size:11px">(placeholder)</small></span>' +
            '</div>' +
            '<div class="footer-contact-item">' + SVG.phone +
              '<span style="color:rgba(255,255,255,0.4)">Telefono &mdash; da confermare</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="footer-bottom">' +
          '<p>&copy; ' + year + ' Victor Volley &mdash; Melissano (LE). Tutti i diritti riservati.</p>' +
          '<a href="#">Privacy policy</a>' +
        '</div>' +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildSidebar();
    buildFooter();
  });
})();
