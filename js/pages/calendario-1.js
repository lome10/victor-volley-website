/* Victor Volley — script della pagina calendario.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function () {
  function slug(s) { return s.toLowerCase().replace(/\s+/g, '-').replace(/[àáâ]/g,'a').replace(/[èéê]/g,'e').replace(/[ìí]/g,'i').replace(/[òó]/g,'o').replace(/[ùú]/g,'u'); }
  function isVV(nome) { return (nome || '').toLowerCase().indexOf('victor') !== -1; }

  var PIN_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  var CAL_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 13v5M9.5 15.5h5"/></svg>';

  /* ---- File .ics (aggiunge la partita al calendario del telefono/PC) ---- */
  function icsEscape(t) {
    return String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }
  function icsFold(line) {
    var out = [];
    while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
    out.push(line);
    return out.join('\r\n');
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function icsStamp(d) {
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }
  /* Orario «flottante» (ora locale di chi apre il file): gara e spettatori sono nello stesso fuso.
     Senza orario l'evento dura un giorno intero. Durata stimata: 2 ore. */
  function icsEvent(p) {
    var ymd = p.data.replace(/-/g, '');
    var m = /^(\d{1,2}):(\d{2})/.exec(p.ora || '');
    var lines = ['BEGIN:VEVENT', 'UID:partita-' + p.id + '@victorvolley.it', 'DTSTAMP:' + icsStamp(new Date())];
    if (m) {
      var h = +m[1], mi = +m[2], hEnd = h + 2;
      lines.push('DTSTART:' + ymd + 'T' + pad2(h) + pad2(mi) + '00');
      lines.push('DTEND:' + ymd + 'T' + (hEnd > 23 ? '235900' : pad2(hEnd) + pad2(mi) + '00'));
    } else {
      var nx = new Date(p.data + 'T00:00:00'); nx.setDate(nx.getDate() + 1);
      lines.push('DTSTART;VALUE=DATE:' + ymd);
      lines.push('DTEND;VALUE=DATE:' + nx.getFullYear() + pad2(nx.getMonth() + 1) + pad2(nx.getDate()));
    }
    lines.push('SUMMARY:' + icsEscape(p.squadra_casa + ' - ' + p.squadra_ospite + (p.categoria ? ' (' + p.categoria + ')' : '')));
    if (p.palazzetto) lines.push('LOCATION:' + icsEscape(p.palazzetto));
    lines.push('END:VEVENT');
    return lines.map(icsFold).join('\r\n');
  }
  function downloadIcs(partite, filename) {
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Victor Volley//Calendario//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
      .concat(partite.map(icsEvent)).concat(['END:VCALENDAR']).join('\r\n') + '\r\n';
    var url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }
  /* In Firestore ci sono partite con avversario non ancora noto salvato come testo "undefined" */
  function validName(n) { return !!n && n !== "undefined" && n !== "null"; }
  /* Link «aggiungi evento» di Google Calendar: su telefono apre l'app (o la pagina) con l'evento già compilato.
     ctz = fuso della gara, così l'orario resta quello giusto ovunque si apra. */
  function gcalUrl(p) {
    var ymd = p.data.replace(/-/g, '');
    var m = /^(\d{1,2}):(\d{2})/.exec(p.ora || '');
    var dates;
    if (m) {
      var h = +m[1], mi = +m[2], hEnd = h + 2;
      dates = ymd + 'T' + pad2(h) + pad2(mi) + '00/' + ymd + 'T' + (hEnd > 23 ? '235900' : pad2(hEnd) + pad2(mi) + '00');
    } else {
      var nx = new Date(p.data + 'T00:00:00'); nx.setDate(nx.getDate() + 1);
      dates = ymd + '/' + nx.getFullYear() + pad2(nx.getMonth() + 1) + pad2(nx.getDate());
    }
    var q = ['action=TEMPLATE',
      'text=' + encodeURIComponent(p.squadra_casa + ' - ' + p.squadra_ospite + (p.categoria ? ' (' + p.categoria + ')' : '')),
      'dates=' + dates,
      'ctz=Europe/Rome'];
    if (p.palazzetto) q.push('location=' + encodeURIComponent(p.palazzetto));
    q.push('details=' + encodeURIComponent('Victor Volley — calendario partite: https://www.victorvolley.it/calendario'));
    return 'https://calendar.google.com/calendar/render?' + q.join('&');
  }
  function hasValidData(p) {
    return !!p && /^\d{4}-\d{2}-\d{2}$/.test(p.data || '') && validName(p.squadra_casa) && validName(p.squadra_ospite);
  }

  var GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  var MESI   = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  function formatDataCard(dateStr, ora) {
    var d = new Date(dateStr + 'T00:00:00');
    return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear() + (ora ? ' - ' + ora : '');
  }

  function inSeason(p, seasonId) { return !p.stagione || p.stagione === seasonId; }

  /* ================================================
     TAB CATEGORIA
  ================================================ */
  var categories = [];
  var activeCat  = null;

  function buildCatNav() {
    var nav = document.getElementById('calCatNav');
    nav.innerHTML = categories.map(function (c) {
      var s = slug(c);
      return '<button type="button" role="tab" aria-selected="' + (s === activeCat ? 'true' : 'false') + '"' +
        (s === activeCat ? ' class="is-active"' : '') + ' data-cat="' + s + '">' + esc(c) + '</button>';
    }).join('');
    nav.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () { activateCat(btn.dataset.cat); });
    });
  }

  function buildCatPanels() {
    var wrap = document.getElementById('calCatPanels');
    wrap.innerHTML = categories.map(function (c) {
      var s = slug(c);
      return '<section class="cal-cat-panel' + (s === activeCat ? '' : ' is-hidden') + '" data-cat="' + s + '" aria-label="' + esc(c) + '">' +
        '<div class="container cal-cols" data-role="cols">' +
          '<div class="cal-col-left">' +
            '<div class="cal-section-block">' +
              '<div class="cal-section-head">' +
                '<h2 class="cal-section-title">Calendario</h2>' +
                '<button type="button" class="cal-jump-btn" data-role="jump-next">Vai alla prossima partita &darr;</button>' +
              '</div>' +
              '<div class="cal-toolbar">' +
                '<label class="cal-team-filter">Squadra avversaria ' +
                  '<select data-role="team-filter"><option value="">Tutte le squadre</option></select>' +
                '</label>' +
                '<button type="button" class="cal-ics-all" data-role="ics-all">' + CAL_ICON + ' Aggiungi tutte al calendario</button>' +
              '</div>' +
              '<div class="fixture-list" data-role="fixtures"></div>' +
              '<div class="cal-girone-wrap is-hidden" data-role="girone-wrap"></div>' +
            '</div>' +
          '</div>' +
          '<div class="cal-col-right is-hidden" data-role="classifica-wrap">' +
            '<h2 class="cal-section-title">Classifica</h2>' +
            '<div class="stand-panel" data-role="classifica"></div>' +
          '</div>' +
        '</div>' +
      '</section>';
    }).join('');
  }

  function activateCat(cat) {
    if (categories.map(slug).indexOf(cat) < 0) cat = slug(categories[0]);
    activeCat = cat;
    document.querySelectorAll('#calCatNav button').forEach(function (b) {
      var active = b.dataset.cat === cat;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.cal-cat-panel').forEach(function (p) {
      p.classList.toggle('is-hidden', p.dataset.cat !== cat);
    });
    if (history.replaceState) history.replaceState(null, '', '#' + cat);
  }

  /* ================================================
     CLASSIFICA (Prima Divisione — dati girone.json)
     Mostrata solo nel pannello della categoria a cui
     il girone appartiene; per le altre resta nascosta
     finché non esisteranno dati.
  ================================================ */
  function standRow(r, squadre, homeId) {
    var s = Girone.squadraById(squadre, r.id);
    var isHome = r.id === homeId;
    var logo = s.logo
      ? '<img loading="lazy" decoding="async" src="' + esc(s.logo) + '" class="stand-logo" alt="">'
      : '<span class="stand-logo-init">' + esc((s.nome || '?').charAt(0)) + '</span>';
    return '<tr' + (isHome ? ' class="stand-row--vv"' : '') + '>' +
      '<td class="stand-pos">' + (r._pos) + '</td>' +
      '<td><div class="stand-name" title="' + esc(s.nome) + '">' + logo + '<span class="stand-name-text">' + esc(s.nome) + '</span></div></td>' +
      '<td class="stand-stat">' + r.v + '</td>' +
      '<td class="stand-stat">' + r.p + '</td>' +
      '<td class="stand-pts">' + r.pts + '</td>' +
    '</tr>';
  }

  /* Un girone per categoria: ognuno va nel pannello della propria categoria
     (che esiste solo se la categoria ha partite) e compare con almeno 2 squadre. */
  function renderClassifica() {
    if (!window.Girone) return;

    Girone.loadGironi().then(function (gironi) {
      gironi.forEach(renderGirone);
    }).catch(function (e) { console.warn('[calendario] classifica non disponibile:', e); });
  }

  /* ---- Tutte le partite del girone (a tendina, sotto le card della Victor) ----
     Legge le partite del girone (siteData/girone), non quelle del calendario: ci sono anche
     le partite tra le altre squadre. Lo sponsor del blocco si cerca per nome tra gli sponsor del sito. */
  var SPONSOR_GIRONE = 'Puglia in food';
  var MESI_BREVI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  var GIORNI_BREVI = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

  function sponsorGirone() {
    var key = VV.teamKey(SPONSOR_GIRONE);
    return VV.getSponsors().filter(function (s) { return VV.teamKey(s.nome) === key && s.logo; })[0] || null;
  }

  function sponsorBadgeHtml(sp, cls, conLink) {
    if (!sp) return '';
    var img = '<img loading="lazy" decoding="async" src="' + esc(VV.imgUrl(sp.logo, 160)) + '" alt="' + esc(sp.nome) + '" class="cal-girone-spon-logo">';
    var url = conLink && /^https?:\/\//.test(sp.url || '') ? sp.url : '';
    return '<span class="' + cls + '"><span class="cal-girone-spon-lbl">Presentato da</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener sponsored" class="cal-girone-spon-link">' + img + '</a>' : img) + '</span>';
  }

  function gironeTeam(squadre, id) {
    var s = Girone.squadraById(squadre, id);
    var logo = s.logo
      ? '<img loading="lazy" decoding="async" src="' + esc(s.logo) + '" class="stand-logo" alt="">'
      : '<span class="stand-logo-init">' + esc((s.nome || '?').charAt(0).toUpperCase()) + '</span>';
    return { s: s, html: logo + '<span class="gp-team-name">' + esc(s.nome) + '</span>' };
  }

  function gironePartitaRow(m, squadre) {
    var c = gironeTeam(squadre, m.squadra_casa), o = gironeTeam(squadre, m.squadra_ospite);
    var vv = c.s.home || o.s.home;
    var hasScore = m.set_casa != null && m.set_ospite != null;
    var casaWins = hasScore && +m.set_casa > +m.set_ospite;
    var d = m.data ? new Date(m.data + 'T00:00:00') : null;
    var when = d ? GIORNI_BREVI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI_BREVI[d.getMonth()] + (m.ora ? ' · ' + esc(m.ora) : '') : 'Data da definire';
    return '<li class="gp-row' + (vv ? ' gp-row--vv' : '') + '">' +
      '<span class="gp-when">' + when + '</span>' +
      '<span class="gp-team gp-team--casa' + (casaWins ? ' is-win' : '') + (c.s.home ? ' gp-team--vv' : '') + '">' + c.html + '</span>' +
      '<span class="gp-score">' + (hasScore ? esc(m.set_casa) + ' – ' + esc(m.set_ospite) : 'vs') + '</span>' +
      '<span class="gp-team gp-team--ospite' + (hasScore && !casaWins ? ' is-win' : '') + (o.s.home ? ' gp-team--vv' : '') + '">' + o.html + '</span>' +
      (m.palazzetto ? '<span class="gp-venue">' + PIN_ICON + '<span>' + esc(m.palazzetto) + '</span></span>' : '') +
    '</li>';
  }

  function renderGironePartite(girone, panel) {
    var wrap = panel.querySelector('[data-role="girone-wrap"]');
    if (!wrap) return;
    var partite = (girone.partite || []).filter(function (m) { return m.squadra_casa && m.squadra_ospite; });
    if (!partite.length) { wrap.classList.add('is-hidden'); wrap.innerHTML = ''; return; }

    var ordina = function (a, b) { return (a.data || '').localeCompare(b.data || '') || (a.ora || '').localeCompare(b.ora || ''); };
    var giornate = [], perG = {};
    partite.slice().sort(ordina).forEach(function (m) {
      var k = m.giornata || 0;
      if (!perG[k]) { perG[k] = []; giornate.push(k); }
      perG[k].push(m);
    });
    giornate.sort(function (a, b) { return a - b; });

    var sp = sponsorGirone();
    var corpo = giornate.map(function (k) {
      var lista = perG[k].sort(ordina);
      var gioca = {};
      lista.forEach(function (m) { gioca[m.squadra_casa] = gioca[m.squadra_ospite] = true; });
      var riposa = girone.squadre.filter(function (s) { return !gioca[s.id]; }).map(function (s) { return s.nome; });
      return '<section class="gp-giornata">' +
        '<h3 class="gp-giornata-title">' + (k ? k + 'ª giornata' : 'Partite') + '</h3>' +
        '<ul class="gp-list">' + lista.map(function (m) { return gironePartitaRow(m, girone.squadre); }).join('') + '</ul>' +
        (k && riposa.length ? '<p class="gp-riposa">Riposa: ' + esc(riposa.join(', ')) + '</p>' : '') +
      '</section>';
    }).join('');

    var apertoPrima = wrap.querySelector('details') && wrap.querySelector('details').open;
    wrap.innerHTML = '<details class="cal-girone"' + (apertoPrima ? ' open' : '') + '>' +
      '<summary class="cal-girone-sum"><span class="cal-girone-sum-text">Tutte le partite del girone' +
        (girone.girone ? ' ' + esc(girone.girone) : '') + '<small>' + partite.length + ' partite · ' + giornate.length + ' giornate</small></span>' +
        sponsorBadgeHtml(sp, 'cal-girone-spon', false) +
        '<span class="cal-girone-chev" aria-hidden="true"></span></summary>' +
      '<div class="cal-girone-body">' + corpo + (sp ? sponsorBadgeHtml(sp, 'cal-girone-spon cal-girone-spon--foot', true) : '') + '</div>' +
    '</details>';
    wrap.classList.remove('is-hidden');
  }

  function renderGirone(girone) {
    if (!girone || !girone.categoria || girone.squadre.length < 2) return;

    var panel = document.querySelector('.cal-cat-panel[data-cat="' + slug(girone.categoria) + '"]');
    if (!panel) return;
    var block = panel.querySelector('[data-role="classifica-wrap"]');
    var target = panel.querySelector('[data-role="classifica"]');
    if (!block || !target) return;

    var classifica = Girone.calcolaClassifica(girone);
    classifica.forEach(function (r, i) { r._pos = i + 1; });
    var homeSquadra = girone.squadre.filter(function (s) { return s.home; })[0];
    var homeId      = homeSquadra ? homeSquadra.id : null;
    var sub = (girone.girone ? 'Girone ' + girone.girone : '') +
      (girone.stagione ? ' · Stagione ' + girone.stagione : '');

    target.innerHTML =
      '<div class="stand-head">' +
        '<div class="stand-title">Classifica</div>' +
        '<div class="stand-sub">' + esc(sub) + '</div>' +
      '</div>' +
      '<table class="stand-table">' +
        '<thead><tr>' +
          '<th class="stand-pos">#</th><th>Squadra</th>' +
          '<th class="stand-stat" title="Vittorie">V</th>' +
          '<th class="stand-stat" title="Sconfitte">P</th>' +
          '<th class="stand-pts">Pt</th>' +
        '</tr></thead>' +
        '<tbody>' + classifica.map(function (r) { return standRow(r, girone.squadre, homeId); }).join('') + '</tbody>' +
      '</table>' +
      '<div class="stand-footer">' + esc(girone.stagione || '') + '</div>';

    block.classList.remove('is-hidden');
    panel.querySelector('[data-role="cols"]').classList.add('cal-cols--split');
    renderGironePartite(girone, panel);
  }

  /* ================================================
     CALENDARIO / RISULTATI (dati partite)
     Le categorie mostrate come tab derivano dai valori
     "categoria" effettivamente presenti nelle partite,
     non dall'elenco categorie di Squadre: quest'ultimo può
     non coincidere (es. una categoria non ancora configurata
     lì può già avere partite, o viceversa).
  ================================================ */
  function uniqueCats(list) {
    var cats = [];
    list.forEach(function (p) { if (cats.indexOf(p.categoria) < 0) cats.push(p.categoria); });
    cats.sort(function (a, b) {
      if (a === 'Prima Divisione') return -1;
      if (b === 'Prima Divisione') return 1;
      return 0;
    });
    return cats;
  }

  DB.loadOrError(['seasons', 'partite', 'sponsors'], 'calCatPanels', function () {
  var seasons      = VV.getSeasons();
  var activeSeason = VV.getCurrentSeason() || seasons[0];
  if (!activeSeason) { document.getElementById('calCatPanels').innerHTML = '<div class="container">' + VV.emptyStateHtml('Calendario in arrivo', 'Le date saranno pubblicate appena la federazione le comunica.') + '</div>'; return; }
  var allPartite   = VV.getPartite();

  categories = uniqueCats(allPartite);
  var catSlugs  = categories.map(slug);
  var hashSlug  = location.hash.slice(1);
  activeCat = catSlugs.indexOf(hashSlug) >= 0 ? hashSlug : catSlugs[0];
  buildCatNav();
  buildCatPanels();
  renderClassifica();

  var stagionNav = document.getElementById('calStagionNav');
  var label      = document.getElementById('calStagioneLabel');

  if (seasons.length > 1) {
    stagionNav.style.display = '';
    stagionNav.innerHTML = seasons.map(function (s) {
      return '<button type="button"' + (s.id === activeSeason.id ? ' class="is-active"' : '') + ' data-season="' + esc(s.id) + '">' + esc(s.name || s.id) + '</button>';
    }).join('');
    stagionNav.querySelectorAll('[data-season]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        stagionNav.querySelectorAll('[data-season]').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        activeSeason = seasons.find(function (s) { return s.id === btn.dataset.season; }) || activeSeason;
        label.textContent = 'Stagione ' + activeSeason.id;
        renderMatches();
      });
    });
  }

  label.textContent = 'Stagione ' + activeSeason.id;

  var today = new Date().toISOString().slice(0, 10);

  function resultClass(p) {
    if (p.set_casa == null || p.set_ospite == null) return '';
    var vvSets  = isVV(p.squadra_casa) ? p.set_casa   : p.set_ospite;
    var oppSets = isVV(p.squadra_casa) ? p.set_ospite : p.set_casa;
    return vvSets > oppSets ? 'vittoria' : 'sconfitta';
  }

  function teamLogo(src, nome) {
    return src
      ? '<img loading="lazy" decoding="async" src="' + esc(src) + '" alt="" class="fixture-team-logo">'
      : '<span class="fixture-team-logo-init">' + esc((nome || '?').charAt(0).toUpperCase()) + '</span>';
  }

  function teamScore(n, rCls) {
    return '<span class="fixture-row-score fixture-row-score--' + rCls + '">' + n + '</span>';
  }

  function fixtureRow(p, isNext) {
    var isHome   = isVV(p.squadra_casa);
    var hasScore = p.set_casa != null && p.set_ospite != null;
    var rCls     = hasScore ? resultClass(p) : '';
    var casaWins = hasScore && +p.set_casa > +p.set_ospite;

    return '<div class="fixture-row ' + (isHome ? 'cool' : 'warm') + (isNext ? ' fixture-row--next' : '') + ' reveal">' +
      (isNext ? '<span class="fixture-row-next-badge">Prossima partita</span>' : '') +
      '<div class="fixture-row-top">' +
        '<span class="fixture-row-date">' + formatDataCard(p.data, p.ora) + '</span>' +
        '<span class="fixture-row-tag fixture-row-tag--' + (isHome ? 'casa' : 'trasf') + '">' + (isHome ? 'Casa' : 'Trasferta') + '</span>' +
      '</div>' +
      '<div class="fixture-teams">' +
        '<div class="fixture-team' + (isHome ? ' fixture-team--vv' : '') + '">' + teamLogo(p.logo_casa, p.squadra_casa) + '<span class="fixture-team-name">' + (casaWins ? '<strong>' + esc(p.squadra_casa) + '</strong>' : esc(p.squadra_casa)) + '</span>' + (hasScore ? teamScore(p.set_casa, rCls) : '') + '</div>' +
        '<div class="fixture-team' + (!isHome ? ' fixture-team--vv' : '') + '">' + teamLogo(p.logo_ospite, p.squadra_ospite) + '<span class="fixture-team-name">' + (hasScore && !casaWins ? '<strong>' + esc(p.squadra_ospite) + '</strong>' : esc(p.squadra_ospite)) + '</span>' + (hasScore ? teamScore(p.set_ospite, rCls) : '') + '</div>' +
      '</div>' +
      '<div class="fixture-row-venue">' + PIN_ICON + '<span class="fixture-row-venue-text">' + esc(p.palazzetto || '—') + '</span>' +
        (!isPast(p) && hasValidData(p)
          ? '<a class="fixture-ics" href="' + esc(gcalUrl(p)) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc('Aggiungi a Google Calendar: ' + p.squadra_casa + ' - ' + p.squadra_ospite) + '">' + CAL_ICON + ' Aggiungi al calendario</a>'
          : '') +
      '</div>' +
    '</div>';
  }

  function isPast(p) { return p.stato === 'conclusa' || p.data < today; }

  function opponentOf(p) { return isVV(p.squadra_casa) ? p.squadra_ospite : p.squadra_casa; }

  function renderMatches() {
    var partite = allPartite.filter(function (p) { return inSeason(p, activeSeason.id); });

    categories.forEach(function (c) {
      var s     = slug(c);
      var panel = document.querySelector('.cal-cat-panel[data-cat="' + s + '"]');
      if (!panel) return;

      var tutte = partite.filter(function (p) { return slug(p.categoria) === s; })
        .sort(function (a, b) { return a.data === b.data ? (a.ora || '').localeCompare(b.ora || '') : a.data.localeCompare(b.data); });

      /* Filtro per squadra avversaria: l'elenco dipende da categoria e stagione */
      var avversari = [];
      tutte.forEach(function (p) {
        var o = opponentOf(p);
        if (validName(o) && avversari.indexOf(o) < 0) avversari.push(o);
      });
      avversari.sort(function (a, b) { return a.localeCompare(b, 'it'); });
      var sel = panel.querySelector('[data-role="team-filter"]');
      var scelta = panel.dataset.team || '';
      if (avversari.indexOf(scelta) < 0) { scelta = ''; panel.dataset.team = ''; }
      sel.innerHTML = '<option value="">Tutte le squadre</option>' +
        avversari.map(function (o) { return '<option value="' + esc(o) + '"' + (o === scelta ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
      sel.parentNode.style.display = avversari.length > 1 ? '' : 'none';

      var catPartite = scelta ? tutte.filter(function (p) { return opponentOf(p) === scelta; }) : tutte;
      var nextIdx = catPartite.findIndex(function (p) { return !isPast(p); });

      var list = panel.querySelector('[data-role="fixtures"]');
      list.innerHTML = catPartite.length
        ? catPartite.map(function (p, i) { return fixtureRow(p, i === nextIdx); }).join('')
        : '<div class="fixture-list-empty">Calendario in arrivo: le date saranno pubblicate appena la federazione le comunica.</div>';

      var jumpBtn = panel.querySelector('[data-role="jump-next"]');
      var nextRow = list.querySelector('.fixture-row--next');
      jumpBtn.style.display = nextRow ? '' : 'none';
      jumpBtn.onclick = function () {
        nextRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };

      /* «Aggiungi tutte»: le partite future (con data e squadre) dell'elenco mostrato */
      var future = catPartite.filter(function (p) { return !isPast(p) && hasValidData(p); });
      var icsAll = panel.querySelector('[data-role="ics-all"]');
      icsAll.style.display = future.length > 1 ? '' : 'none';
      icsAll.onclick = function () {
        downloadIcs(future, 'victor-volley-' + s + (scelta ? '-' + slug(scelta) : '') + '.ics');
      };
    });
  }

  /* Cambio squadra nel filtro */
  var panelsEl = document.getElementById('calCatPanels');
  panelsEl.addEventListener('change', function (e) {
    var sel = e.target.closest && e.target.closest('[data-role="team-filter"]');
    if (!sel) return;
    sel.closest('.cal-cat-panel').dataset.team = sel.value;
    renderMatches();
  });

  /* Dati strutturati (SportsEvent) per le prossime partite: ci sono solo se con data e squadre note. */
  function offsetRome(dateStr, ora) {
    try {
      var part = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', timeZoneName: 'longOffset' })
        .formatToParts(new Date(dateStr + 'T' + ora + ':00Z')).filter(function (x) { return x.type === 'timeZoneName'; })[0];
      var m = part && /GMT([+-]\d{2}):?(\d{2})?/.exec(part.value);
      return m ? m[1] + ':' + (m[2] || '00') : '';
    } catch (e) { return ''; }
  }
  function renderJsonLd() {
    var events = allPartite
      .filter(function (p) { return inSeason(p, activeSeason.id) && !isPast(p) && hasValidData(p); })
      .sort(function (a, b) { return a.data === b.data ? (a.ora || '').localeCompare(b.ora || '') : a.data.localeCompare(b.data); })
      .slice(0, 12)
      .map(function (p) {
        var hasOra = /^\d{1,2}:\d{2}/.test(p.ora || '');
        var ora = hasOra ? pad2(+p.ora.split(':')[0]) + ':' + p.ora.split(':')[1].slice(0, 2) : '';
        var ev = {
          '@type': 'SportsEvent',
          name: p.squadra_casa + ' - ' + p.squadra_ospite + (p.categoria ? ' (' + p.categoria + ')' : ''),
          sport: 'Volleyball',
          startDate: hasOra ? p.data + 'T' + ora + ':00' + offsetRome(p.data, ora) : p.data,
          eventStatus: 'https://schema.org/EventScheduled',
          homeTeam: { '@type': 'SportsTeam', name: p.squadra_casa },
          awayTeam: { '@type': 'SportsTeam', name: p.squadra_ospite },
          organizer: { '@type': 'Organization', name: 'Victor Volley', url: 'https://www.victorvolley.it/' }
        };
        if (p.palazzetto) ev.location = { '@type': 'Place', name: p.palazzetto, address: p.palazzetto };
        return ev;
      });
    if (events.length) VV.setJsonLd('ld-partite', { '@context': 'https://schema.org', '@graph': events });
  }

  renderMatches();
  renderJsonLd();
  }); // DB.load
})();
