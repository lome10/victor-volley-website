/* Victor Volley — script della pagina squadre.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function () {

  function slugify(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ruolo';
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    var a = parts[0] ? parts[0][0] : '';
    var b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
  }

  function inSeason(record, seasonId) {
    return !record.stagione || record.stagione === seasonId;
  }

  var ROLE_ORDER = ['Palleggiatore', 'Laterale', 'Opposto', 'Centrale', 'Libero', 'Universale'];
  var WARM_ROLES = { Laterale: true, Opposto: true, Universale: true };
  var FEMININE_ROLES = { Palleggiatore: 'Palleggiatrice' };

  function roleLabel(role, gender) {
    return (gender === 'F' && FEMININE_ROLES[role]) ? FEMININE_ROLES[role] : role;
  }

  function personPhotoHtml(p) {
    if (p.photo) {
      return '<img loading="lazy" decoding="async" src="' + esc(p.photo) + '" alt="" style="object-position:' + esc(p.photoFocus || '50% 25%') + '">';
    }
    return '<span class="sq-initial">' + esc(initials(p.name)) + '</span>';
  }

  function rosterCardHtml(p, warm) {
    var numBadge = p.number ? '<span class="sq-num-badge">' + p.number + '</span>' : '';
    var ghost    = p.number ? '<span class="sq-ghost-num">' + p.number + '</span>' : '';
    return '<article class="sq-roster-card ' + (warm ? 'warm' : 'cool') + ' reveal">' +
      '<div class="sq-face">' + personPhotoHtml(p) + '</div>' +
      ghost + numBadge +
      '<div class="sq-scrim"><div class="sq-name">' + esc(p.name) + '</div><div class="sq-role">' + esc(roleLabel(p.role, p.gender)) + '</div></div>' +
    '</article>';
  }

  function staffCardHtml(s) {
    return '<div class="sq-staff-card">' +
      '<div class="sq-staff-avatar">' + personPhotoHtml(s) + '</div>' +
      '<div class="sq-staff-name">' + esc(s.name) + '</div>' +
      '<div class="sq-staff-role">' + esc(s.role) + '</div>' +
    '</div>';
  }

  function renderCategorySection(cat, players, staff) {
    var hasPlayers = players.length > 0;
    var hasStaff   = staff.length > 0;

    /* ---- Staff a nastro: subito in cima, non in fondo alla pagina ---- */
    var staffHtml = '';
    if (hasStaff) {
      staffHtml = '<section class="sq-staff-zone"><div class="container">' +
        '<p class="sq-eyebrow">Panchina</p>' +
        '<h3 class="sq-section-title">Staff tecnico</h3>' +
        '<div class="sq-staff-strip">' + staff.map(staffCardHtml).join('') + '</div>' +
      '</div></section>';
    }

    /* ---- Roster: raggruppato per ruolo, un carosello orizzontale per riga ---- */
    var rosterHtml = '';
    if (hasPlayers) {
      var groups = {};
      players.forEach(function (p) {
        var r = p.role || 'Altro';
        (groups[r] = groups[r] || []).push(p);
      });
      var roleKeys = ROLE_ORDER.filter(function (r) { return groups[r]; });
      Object.keys(groups).forEach(function (r) { if (roleKeys.indexOf(r) === -1) roleKeys.push(r); });

      var chipsHtml = '<button type="button" class="sq-chip is-active" data-role="all">Tutte</button>' +
        roleKeys.map(function (r) {
          var label = roleLabel(r, groups[r][0].gender);
          return '<button type="button" class="sq-chip" data-role="' + slugify(r) + '">' + esc(label) + '</button>';
        }).join('');

      var shelvesHtml = roleKeys.map(function (r) {
        var warm  = !!WARM_ROLES[r];
        var label = roleLabel(r, groups[r][0].gender);
        var list  = groups[r].slice().sort(function (a, b) { return (a.number || 99) - (b.number || 99); });
        var gridClass = 'sq-shelf-grid' + (list.length > 2 ? ' sq-shelf-grid--scroll' : '');
        return '<section class="sq-shelf" data-role="' + slugify(r) + '">' +
          '<div class="sq-shelf-head">' +
            '<div class="sq-shelf-title"><h3>' + esc(label) + '</h3></div>' +
          '</div>' +
          '<div class="' + gridClass + '">' + list.map(function (p) { return rosterCardHtml(p, warm); }).join('') + '</div>' +
        '</section>';
      }).join('');

      rosterHtml = '<nav class="sq-filter-zone" aria-label="Filtro per ruolo"><div class="container"><div class="sq-filter-row">' + chipsHtml + '</div></div></nav>' +
        '<div class="sq-shelves"><div class="container">' + shelvesHtml + '</div></div>';
    }

    var emptyHtml = (!hasStaff && !hasPlayers)
      ? '<div class="container"><p class="sq-empty">Informazioni in aggiornamento.</p></div>'
      : '';

    return '<section class="sq-cat-section" id="cat-' + cat.id + '" aria-labelledby="cat-h-' + cat.id + '" style="display:none">' +
      staffHtml + rosterHtml + emptyHtml +
    '</section>';
  }

  function centerShelfSliders(section) {
    if (section.dataset.sqCentered) return;
    section.dataset.sqCentered = '1';
    if (!window.matchMedia('(max-width: 720px)').matches) return;
    section.querySelectorAll('.sq-shelf-grid--scroll').forEach(function (grid) {
      var second = grid.children[1];
      if (second) second.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
  }

  function initSquadreSection(section) {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Filtro per ruolo -> scroll allo scaffale */
    var chips   = section.querySelectorAll('.sq-chip');
    var shelves = section.querySelectorAll('.sq-shelf');

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        var role = chip.dataset.role;
        var target = (role === 'all')
          ? section.querySelector('.sq-filter-zone')
          : section.querySelector('.sq-shelf[data-role="' + role + '"]');
        if (target) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      });
    });

    if ('IntersectionObserver' in window && shelves.length) {
      var shelfObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var role = entry.target.dataset.role;
            chips.forEach(function (c) { c.classList.toggle('is-active', c.dataset.role === role); });
          }
        });
      }, { rootMargin: '-45% 0px -45% 0px' });
      shelves.forEach(function (s) { shelfObs.observe(s); });
    }

  }

  DB.loadOrError(['categories', 'seasons', 'players', 'staff'], 'squadreMain', function () {
  var categories   = VV.getCategories(true).filter(function (c) { return c.showInSquadre !== false; });
  var seasons      = VV.getSeasons();
  var activeSeason = VV.getCurrentSeason() || seasons[0];
  if (!activeSeason) { document.getElementById('squadreMain').innerHTML = '<div class="container">' + VV.emptyStateHtml('Nessuna stagione disponibile', 'Le rose saranno pubblicate presto.') + '</div>'; return; }

  var main       = document.getElementById('squadreMain');
  var catSelect  = document.getElementById('sqCatSelect');
  var catTitle   = document.getElementById('sqCatTitle');
  var seasonLbl  = document.getElementById('sqSeasonLabel');
  var stagionNav = document.getElementById('stagionNav');

  var _activeCatId = categories.length ? categories[0].id : null;

  /* ---- Stagione switch ---- */
  if (seasons.length > 1) {
    stagionNav.innerHTML = seasons.map(function (s) {
      return '<button type="button" data-season="' + esc(s.id) + '"' + (s.id === activeSeason.id ? ' class="is-active"' : '') + '>' + esc(s.name || s.id) + '</button>';
    }).join('');
    stagionNav.querySelectorAll('[data-season]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        stagionNav.querySelectorAll('[data-season]').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        activeSeason = seasons.find(function (s) { return s.id === btn.dataset.season; }) || activeSeason;
        renderAll();
      });
    });
  } else {
    stagionNav.style.display = 'none';
  }

  /* ---- Categoria switch ---- */
  catSelect.innerHTML = categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
  catSelect.addEventListener('change', function () { showCat(this.value); });

  function showCat(id) {
    _activeCatId = id;
    main.querySelectorAll('.sq-cat-section').forEach(function (s) { s.style.display = 'none'; });
    var target = document.getElementById('cat-' + id);
    if (target) { target.style.display = ''; centerShelfSliders(target); }
    catSelect.value = String(id);
    var cat = categories.find(function (c) { return String(c.id) === String(id); });
    catTitle.textContent = cat ? cat.name : 'Le nostre squadre';
  }

  function renderAll() {
    seasonLbl.textContent = 'Stagione ' + (activeSeason.name || activeSeason.id);

    if (!categories.length) {
      main.innerHTML = '<div class="container">' + VV.emptyStateHtml('Nessuna squadra disponibile', 'Le rose della stagione saranno pubblicate presto.') + '</div>';
      return;
    }

    function orderKey(p, isPlayer) {
      if (p.order != null) return p.order;
      return isPlayer && p.number != null ? p.number : 999;
    }

    main.innerHTML = categories.map(function (cat) {
      var players = VV.getPlayers(cat.id)
        .filter(function (p) { return inSeason(p, activeSeason.id); })
        .sort(function (a, b) { return orderKey(a, true) - orderKey(b, true); });
      var staff = VV.getStaff(cat.id)
        .filter(function (s) { return inSeason(s, activeSeason.id); })
        .sort(function (a, b) { return orderKey(a, false) - orderKey(b, false); });
      return renderCategorySection(cat, players, staff);
    }).join('');

    main.querySelectorAll('.sq-cat-section').forEach(initSquadreSection);
    if (_activeCatId) showCat(_activeCatId);
  }

  renderAll();

  }); // DB.load
})();
