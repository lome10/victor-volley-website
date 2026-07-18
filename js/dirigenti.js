/* Victor Volley — Area Dirigenti (CRM sponsor + Budget & Forecast)

   Modello dati (Firestore):
     dirigenti/{uid}        -> esistenza del doc = utente con ruolo dirigente
     budgetSeasons/{id}     -> stagioni (nome, obiettivoSaldo, isAttiva, ...)
     aziende/{id}           -> anagrafica sponsor, trasversale alle stagioni
     sponsorizzazioni/{id}  -> il "deal" per stagione (aziendaId + seasonId)
     attivita/{id}          -> timeline chiamate/email/incontri per sponsorizzazione
     promemoria/{id}        -> follow-up per sponsorizzazione
     categorieAtleti/{id}   -> rette per categoria/stagione
     vociSpesa/{id}         -> spese per stagione
     auditLog/{id}          -> log immutabile (solo create, mai update/delete)

   Ogni scrittura passa da _logWrite() così il log resta centralizzato in un
   solo punto invece di essere ripetuto in ogni handler.
*/
(function () {
  'use strict';

  var _uid = null, _dirigenteNome = '';
  var _dirigentiList = [];
  var _seasons = [];
  var _currentSeasonId = null;
  var _aziende = [];
  var _sponsorizzazioni = [];
  var _attivita = [];
  var _promemoria = [];
  var _categorieAtleti = [];
  var _vociSpesa = [];
  var _auditLog = [];
  var _curSponsorId = null, _curAziendaId = null;
  var _openModalId = null;

  window.DG = {};

  /* ================================================
     BOOTSTRAP
  ================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    auth.onAuthStateChanged(function (user) {
      if (user) _checkRole(user);
      else _showLogin();
    });

    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('emailInput').value.trim();
      var pwd   = document.getElementById('passwordInput').value;
      var errEl = document.getElementById('loginError');
      errEl.textContent = '';
      auth.signInWithEmailAndPassword(email, pwd).catch(function () {
        errEl.textContent = 'Email o password non corretti.';
      });
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
      auth.signOut().then(function () { location.reload(); });
    });
    document.getElementById('deniedLogoutBtn').addEventListener('click', function () {
      auth.signOut().then(function () { location.reload(); });
    });

    _initTabs();
    _initDrawer();
    _initModals();

    document.getElementById('filterMieiSponsor').addEventListener('change', _renderKanban);

    document.getElementById('seasonSelect').addEventListener('change', function () {
      _currentSeasonId = this.value;
      _loadSeasonScoped().then(function () {
        _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards();
        _renderCharts(); _renderKanban(); _renderRette(); _renderSpese();
      });
    });

    document.getElementById('obiettivoSave').addEventListener('click', _saveObiettivo);

    ['logFilterEntita', 'logFilterDirigente', 'logFilterDal', 'logFilterAl'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', _renderLog);
    });
  });

  function _checkRole(user) {
    db.collection('dirigenti').doc(user.uid).get().then(function (doc) {
      if (!doc.exists) { _showDenied(); return; }
      var data = doc.data();
      _uid = user.uid;
      _dirigenteNome = ((data.nome || '') + ' ' + (data.cognome || '')).trim() || data.email || user.email;
      _loadAll();
    }).catch(function (err) {
      console.error('[dirigenti] role check', err);
      _showDenied();
    });
  }

  function _showLogin() {
    document.getElementById('loginScreen').classList.remove('is-hidden');
    document.getElementById('deniedScreen').classList.add('is-hidden');
    document.getElementById('dgApp').classList.add('is-hidden');
  }
  function _showDenied() {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('deniedScreen').classList.remove('is-hidden');
    document.getElementById('dgApp').classList.add('is-hidden');
  }
  function _showApp() {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('deniedScreen').classList.add('is-hidden');
    document.getElementById('dgApp').classList.remove('is-hidden');
    document.getElementById('dgNome').textContent = _dirigenteNome;
  }

  /* ================================================
     CARICAMENTO DATI
  ================================================ */
  function _mapDoc(d) { return Object.assign({ id: d.id }, d.data()); }

  function _loadAll() {
    Promise.all([
      db.collection('dirigenti').get(),
      db.collection('budgetSeasons').get(),
      db.collection('aziende').get(),
      db.collection('sponsorizzazioni').get(),
      db.collection('attivita').get(),
      db.collection('promemoria').get()
    ]).then(function (res) {
      _dirigentiList    = res[0].docs.map(_mapDoc);
      _seasons          = res[1].docs.map(_mapDoc).sort(function (a, b) { return (a.nome || '') < (b.nome || '') ? 1 : -1; });
      _aziende          = res[2].docs.map(_mapDoc);
      _sponsorizzazioni = res[3].docs.map(_mapDoc);
      _attivita         = res[4].docs.map(_mapDoc);
      _promemoria       = res[5].docs.map(_mapDoc);

      var chain = _seasons.length ? Promise.resolve() : _createDefaultSeason();

      return chain.then(function () {
        var active = _seasons.find(function (s) { return s.isAttiva; }) || _seasons[0];
        _currentSeasonId = active.id;
        _populateSeasonSelect();
        _populateResponsabileSelects();
        _populateLogDirigenteFilter();
        return _loadSeasonScoped();
      });
    }).then(function () {
      return _loadAuditLog();
    }).then(function () {
      _showApp();
      _renderObiettivo();
      _renderPromemoriaWidget();
      _renderStatCards();
      _renderCharts();
      _renderKanban();
      _renderRette();
      _renderSpese();
    }).catch(function (err) {
      console.error('[dirigenti] loadAll', err);
      alert('Errore nel caricamento dei dati. Ricarica la pagina.');
    });
  }

  function _createDefaultSeason() {
    var y = new Date().getFullYear();
    var data = { nome: y + '/' + (y + 1), dataInizio: '', dataFine: '', obiettivoSaldo: 0, isAttiva: true, createdAt: new Date().toISOString() };
    var ref = db.collection('budgetSeasons').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _seasons = [data];
    });
  }

  function _loadSeasonScoped() {
    return Promise.all([
      db.collection('categorieAtleti').where('seasonId', '==', _currentSeasonId).get(),
      db.collection('vociSpesa').where('seasonId', '==', _currentSeasonId).get()
    ]).then(function (res) {
      _categorieAtleti = res[0].docs.map(_mapDoc);
      _vociSpesa       = res[1].docs.map(_mapDoc);
    });
  }

  function _loadAuditLog() {
    return db.collection('auditLog').orderBy('timestamp', 'desc').limit(300).get().then(function (snap) {
      _auditLog = snap.docs.map(_mapDoc);
      _renderLog();
    }).catch(function (err) {
      console.error('[dirigenti] log', err);
      document.getElementById('logBody').innerHTML = '<tr><td colspan="6" class="dg-empty">Errore nel caricamento del log.</td></tr>';
    });
  }

  /* ================================================
     AUDIT LOG — helper centralizzato
  ================================================ */
  function _diff(oldObj, newObj, fields) {
    var out = [];
    (fields || Object.keys(newObj)).forEach(function (f) {
      var a = oldObj ? oldObj[f] : undefined;
      var b = newObj[f];
      var an = a === undefined ? null : a;
      var bn = b === undefined ? null : b;
      if (JSON.stringify(an) !== JSON.stringify(bn)) out.push({ campo: f, prima: an, dopo: bn });
    });
    return out;
  }

  function _logWrite(entita, entitaId, entitaLabel, azione, changes) {
    if (!changes || !changes.length) return Promise.resolve();
    var batch = db.batch();
    var localEntries = [];
    changes.forEach(function (ch) {
      var ref = db.collection('auditLog').doc();
      var entry = {
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        dirigenteId: _uid,
        dirigenteNome: _dirigenteNome,
        entita: entita,
        entitaId: entitaId,
        entitaLabel: entitaLabel,
        azione: azione,
        campo: ch.campo,
        valorePrecedente: ch.prima,
        valoreNuovo: ch.dopo
      };
      batch.set(ref, entry);
      localEntries.push(Object.assign({ id: ref.id }, entry, { timestamp: new Date() }));
    });
    return batch.commit().then(function () {
      Array.prototype.unshift.apply(_auditLog, localEntries);
      _renderLog();
    }).catch(function (e) {
      /* il log non deve mai bloccare l'operazione principale, già salvata */
      console.error('[audit log]', e);
    });
  }

  /* ================================================
     TABS
  ================================================ */
  function _initTabs() {
    document.querySelectorAll('.dg-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { _switchTab(btn.dataset.tab); });
    });
  }
  function _switchTab(tab) {
    document.querySelectorAll('.dg-tab').forEach(function (btn) { btn.classList.toggle('is-active', btn.dataset.tab === tab); });
    document.querySelectorAll('.dg-section').forEach(function (sec) { sec.classList.add('is-hidden'); });
    document.getElementById('tab' + _cap(tab)).classList.remove('is-hidden');
  }

  /* ================================================
     OBIETTIVO / RIEPILOGO
  ================================================ */
  function _calcRiepilogo() {
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; });
    var sponsorChiusi = cur.filter(function (s) { return s.stato === 'chiuso'; })
      .reduce(function (s, x) { return s + (+x.importoConfermato || 0); }, 0);
    var sponsorPotenziali = cur.filter(function (s) { return s.stato !== 'chiuso' && s.stato !== 'rifiutato'; })
      .reduce(function (s, x) { return s + (+x.importoStimato || 0) * (+x.probabilitaChiusura || 0); }, 0);
    var rette = _categorieAtleti.reduce(function (s, c) { return s + (+c.incassato || 0); }, 0);
    var uscite = _vociSpesa.reduce(function (s, v) { return s + (+v.importoSostenuto || 0); }, 0);
    var entrateConfermate = sponsorChiusi + rette;
    var saldo = entrateConfermate - uscite;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var obiettivo = +season.obiettivoSaldo || 0;
    var differenza = saldo - obiettivo;
    var pct = obiettivo > 0 ? Math.round(saldo / obiettivo * 100) : 0;
    return {
      sponsorChiusi: sponsorChiusi, sponsorPotenziali: sponsorPotenziali, rette: rette, uscite: uscite,
      entrateConfermate: entrateConfermate, saldo: saldo, obiettivo: obiettivo, differenza: differenza, pct: pct
    };
  }

  function _renderObiettivo() {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    document.getElementById('obiettivoSeasonNome').textContent = 'Stagione ' + (season.nome || '—');
    document.getElementById('obiettivoInput').value = season.obiettivoSaldo || 0;
    var r = _calcRiepilogo();
    var pct = Math.max(0, Math.min(100, r.pct));
    document.getElementById('obiettivoBarFill').style.width = pct + '%';
    document.getElementById('obiettivoPct').textContent = r.pct + '%';
  }

  function _saveObiettivo() {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var v = +document.getElementById('obiettivoInput').value || 0;
    var old = { obiettivoSaldo: season.obiettivoSaldo || 0 };
    season.obiettivoSaldo = v;
    db.collection('budgetSeasons').doc(season.id).update({ obiettivoSaldo: v })
      .then(function () { return _logWrite('obiettivo', season.id, 'Obiettivo — stagione ' + season.nome, 'update', _diff(old, { obiettivoSaldo: v }, ['obiettivoSaldo'])); })
      .then(function () { _renderObiettivo(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _renderPromemoriaWidget() {
    var curIds = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; }).map(function (s) { return s.id; });
    var upcoming = _promemoria.filter(function (p) {
      return !p.completato && curIds.indexOf(p.sponsorizzazioneId) !== -1 && _daysDiff(p.dataScadenza) <= 7;
    }).sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });

    var widget = document.getElementById('promemoriaWidget');
    if (!upcoming.length) { widget.classList.add('is-hidden'); return; }
    widget.classList.remove('is-hidden');
    document.getElementById('promemoriaWidgetList').innerHTML = upcoming.map(function (p) {
      var s = _sponsorizzazioni.find(function (x) { return x.id === p.sponsorizzazioneId; });
      var az = s ? _aziendaById(s.aziendaId) : null;
      var days = _daysDiff(p.dataScadenza);
      var badge = days < 0
        ? '<span class="dg-chip dg-chip--overdue">Scaduto</span>'
        : '<span class="dg-chip dg-chip--soon">' + _fmtDate(p.dataScadenza) + '</span>';
      return '<div class="dg-reminder-item" onclick="DG.openFromReminder(\'' + p.sponsorizzazioneId + '\')">' +
        '<div class="dg-reminder-info"><div class="dg-reminder-azienda">' + esc(az ? az.ragioneSociale : '—') + '</div>' +
        '<div class="dg-reminder-desc">' + esc(p.descrizione || '') + '</div></div>' + badge + '</div>';
    }).join('');
  }

  DG.openFromReminder = function (sponsorId) {
    _switchTab('sponsor');
    _openDrawer(sponsorId);
  };

  function _statCard(label, val2, cls) {
    var sign = val2 < 0 ? '-' : '';
    return '<div class="dg-stat-card ' + (cls || '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + sign + '€' + Math.abs(Math.round(val2)).toLocaleString('it-IT') + '</div></div>';
  }

  function _renderStatCards() {
    var r = _calcRiepilogo();
    document.getElementById('dgStatRow').innerHTML =
      _statCard('Entrate confermate', r.entrateConfermate, '') +
      _statCard('Uscite', r.uscite, '--red') +
      _statCard('Saldo', r.saldo, r.saldo >= 0 ? '--green' : '--red') +
      _statCard('Differenza da obiettivo', r.differenza, r.differenza >= 0 ? '--green' : '--orange');
  }

  /* ================================================
     CHARTS — SVG inline, nessuna libreria esterna
  ================================================ */
  function _svgBarChart(entrate, uscite, obiettivo) {
    var w = 480, h = 220, pad = 40;
    var max = Math.max(entrate, uscite, obiettivo, 1) * 1.15;
    var barW = 76, gap = 70, chartH = h - pad * 2;
    function y(v) { return pad + chartH - (v / max * chartH); }
    var bars = [{ label: 'Entrate', val: entrate, color: '#10B981' }, { label: 'Uscite', val: uscite, color: '#EF4444' }];
    var startX = pad + 30;

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="220" role="img" aria-label="Entrate vs uscite vs obiettivo">';
    svg += '<line x1="' + pad + '" y1="' + (pad + chartH) + '" x2="' + (w - pad) + '" y2="' + (pad + chartH) + '" stroke="#C3C2B7" stroke-width="1"/>';

    if (obiettivo > 0) {
      var oy = y(obiettivo);
      svg += '<line x1="' + pad + '" y1="' + oy + '" x2="' + (w - pad) + '" y2="' + oy + '" stroke="#1E3A5F" stroke-width="2" stroke-dasharray="5,4"/>';
      svg += '<text x="' + (w - pad) + '" y="' + (oy - 8) + '" text-anchor="end" font-size="11" fill="#1E3A5F" font-weight="700">Obiettivo €' + Math.round(obiettivo).toLocaleString('it-IT') + '</text>';
    }

    bars.forEach(function (b, i) {
      var bx = startX + i * (barW + gap);
      var by = y(b.val);
      var bh = (pad + chartH) - by;
      svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + Math.max(bh, 0) + '" rx="4" fill="' + b.color + '"/>';
      svg += '<text x="' + (bx + barW / 2) + '" y="' + (by - 8) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#1E293B">€' + Math.round(b.val).toLocaleString('it-IT') + '</text>';
      svg += '<text x="' + (bx + barW / 2) + '" y="' + (pad + chartH + 20) + '" text-anchor="middle" font-size="12" fill="#64748B">' + b.label + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  function _svgDonut(parts) {
    var total = parts.reduce(function (s, p) { return s + p.value; }, 0) || 1;
    var size = 200, r = 80, cx = 100, cy = 100, strokeW = 28, GAP = 4;
    var circumference = 2 * Math.PI * r;
    var offset = 0, segs = '';
    parts.forEach(function (p) {
      var frac = p.value / total;
      var full = frac * circumference;
      var len = Math.max(full - GAP, 0);
      segs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + p.color + '" stroke-width="' + strokeW +
        '" stroke-dasharray="' + len + ' ' + (circumference - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      offset += full;
    });
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="100%" height="200" role="img" aria-label="Composizione entrate">' + segs +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - strokeW / 2 - 4) + '" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="12" fill="#64748B">Totale</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#1E293B">€' + Math.round(total).toLocaleString('it-IT') + '</text>' +
      '</svg>';
    var legend = '<div class="dg-chart-legend">' + parts.map(function (p) {
      var pct = total ? Math.round(p.value / total * 100) : 0;
      return '<div class="dg-chart-legend-item"><span class="dg-chart-legend-swatch" style="background:' + p.color + '"></span>' +
        esc(p.label) + ' — €' + Math.round(p.value).toLocaleString('it-IT') + ' (' + pct + '%)</div>';
    }).join('') + '</div>';
    return svg + legend;
  }

  function _renderCharts() {
    var r = _calcRiepilogo();
    document.getElementById('chartBar').innerHTML = _svgBarChart(r.entrateConfermate, r.uscite, r.obiettivo);
    document.getElementById('chartDonut').innerHTML = _svgDonut([
      { label: 'Rette atleti', value: r.rette, color: '#008CFD' },
      { label: 'Sponsor chiusi', value: r.sponsorChiusi, color: '#10B981' },
      { label: 'Sponsor potenziali (pesato)', value: r.sponsorPotenziali, color: '#F59E0B' }
    ]);
  }

  /* ================================================
     KANBAN SPONSOR
  ================================================ */
  var STATI = ['prospect', 'contattato', 'in_trattativa', 'chiuso', 'rifiutato'];

  function _renderKanban() {
    var onlyMine = document.getElementById('filterMieiSponsor').checked;
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; });

    STATI.forEach(function (stato) {
      var items = cur.filter(function (s) { return s.stato === stato && (!onlyMine || s.dirigenteResponsabileId === _uid); });
      document.getElementById('count' + _cap(stato)).textContent = items.length;
      var col = document.getElementById('col' + _cap(stato));
      if (!items.length) { col.innerHTML = ''; return; }
      col.innerHTML = items.map(function (s) {
        var azienda = _aziendaById(s.aziendaId);
        var importo = s.stato === 'chiuso' ? (s.importoConfermato || 0) : (s.importoStimato || 0);
        var resp = _dirigentiList.find(function (d) { return d.id === s.dirigenteResponsabileId; });
        var prom = _nextPromemoria(s.id);
        var chip = '';
        if (prom) {
          var days = _daysDiff(prom.dataScadenza);
          if (days < 0) chip = '<span class="dg-chip dg-chip--overdue">Scaduto</span>';
          else if (days <= 7) chip = '<span class="dg-chip dg-chip--soon">' + _fmtDate(prom.dataScadenza) + '</span>';
        }
        return '<div class="dg-kanban-card" draggable="true" data-id="' + s.id + '">' +
          '<div class="dg-kanban-card-top">' +
          '<span class="dg-kanban-card-nome">' + esc(azienda ? azienda.ragioneSociale : '—') +
          (azienda && _isStorico(azienda.id) ? ' <span class="dg-badge dg-badge--storico" title="Sponsor storico">storico</span>' : '') +
          '</span></div>' +
          '<div class="dg-kanban-card-importo">€' + Number(importo || 0).toLocaleString('it-IT') + '</div>' +
          '<div class="dg-kanban-card-bottom">' +
          '<span class="dg-avatar" title="' + esc(resp ? (resp.nome + ' ' + resp.cognome) : 'Non assegnato') + '">' + (resp ? _initials(resp.nome, resp.cognome) : '?') + '</span>' +
          chip +
          '</div></div>';
      }).join('');
    });

    _attachKanbanEvents();
  }

  function _attachKanbanEvents() {
    document.querySelectorAll('.dg-kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); });
      card.addEventListener('click', function () { _openDrawer(card.dataset.id); });
    });
    document.querySelectorAll('.dg-kanban-col-body').forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('dg-drop-hover'); });
      col.addEventListener('dragleave', function () { col.classList.remove('dg-drop-hover'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('dg-drop-hover');
        var id = e.dataTransfer.getData('text/plain');
        var stato = col.closest('.dg-kanban-col').dataset.stato;
        _changeStato(id, stato);
      });
    });
  }

  function _changeStato(id, novoStato) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s || s.stato === novoStato) return;
    var old = Object.assign({}, s);
    var patch = { stato: novoStato };
    if (novoStato === 'chiuso' && !s.importoConfermato) patch.importoConfermato = s.importoStimato || 0;
    Object.assign(s, patch);
    _renderKanban(); _renderStatCards(); _renderCharts();
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    db.collection('sponsorizzazioni').doc(id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ================================================
     DRAWER — Scheda Azienda
  ================================================ */
  function _initDrawer() {
    document.getElementById('drawerCloseBtn').addEventListener('click', _closeDrawer);
    document.getElementById('drawerOverlay').addEventListener('click', _closeDrawer);
    document.querySelectorAll('.dg-drawer-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { _switchDrawerTab(btn.dataset.dtab); });
    });
  }

  function _openDrawer(sponsorId) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === sponsorId; });
    if (!s) return;
    _curSponsorId = sponsorId;
    _curAziendaId = s.aziendaId;
    var az = _aziendaById(_curAziendaId);
    document.getElementById('drawerAziendaNome').textContent = az ? az.ragioneSociale : '—';
    document.getElementById('drawerStoricoBadge').classList.toggle('is-hidden', !_isStorico(_curAziendaId));
    document.getElementById('drawerOverlay').classList.remove('is-hidden');
    document.getElementById('aziendaDrawer').classList.remove('is-hidden');
    requestAnimationFrame(function () { document.getElementById('aziendaDrawer').classList.add('is-open'); });
    _switchDrawerTab('anagrafica');
  }

  function _closeDrawer() {
    document.getElementById('aziendaDrawer').classList.remove('is-open');
    setTimeout(function () {
      document.getElementById('aziendaDrawer').classList.add('is-hidden');
      document.getElementById('drawerOverlay').classList.add('is-hidden');
    }, 250);
  }

  function _switchDrawerTab(tab) {
    document.querySelectorAll('.dg-drawer-tab').forEach(function (btn) { btn.classList.toggle('is-active', btn.dataset.dtab === tab); });
    var fn = { anagrafica: _tabAnagrafica, deal: _tabDeal, timeline: _tabTimeline, promemoria: _tabPromemoria, storico: _tabStorico }[tab];
    document.getElementById('drawerBody').innerHTML = fn ? fn() : '';
  }

  function _field(id, label, value) {
    return '<div class="dg-form-group"><label class="dg-form-label">' + label + '</label>' +
      '<input class="dg-form-input" id="' + id + '" value="' + escAttr(value) + '"></div>';
  }

  function _tabAnagrafica() {
    var a = _aziendaById(_curAziendaId) || {};
    return '<div class="dg-form-group"><label class="dg-form-label">Ragione sociale</label><input class="dg-form-input" id="dgAzNome" value="' + escAttr(a.ragioneSociale) + '"></div>' +
      '<div class="dg-form-grid">' +
      _field('dgAzSettore', 'Settore', a.settore) +
      _field('dgAzReferente', 'Referente', a.referente) +
      _field('dgAzTelefono', 'Telefono', a.telefono) +
      _field('dgAzEmail', 'Email', a.email) +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Sito web</label><input class="dg-form-input" id="dgAzSito" value="' + escAttr(a.sitoWeb) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Note</label><textarea class="dg-form-input dg-form-textarea" id="dgAzNote" rows="3">' + esc(a.note || '') + '</textarea></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.saveAzienda()">Salva anagrafica</button></div>';
  }

  DG.saveAzienda = function () {
    var a = _aziendaById(_curAziendaId);
    if (!a) return;
    var old = Object.assign({}, a);
    var patch = {
      ragioneSociale: val('dgAzNome'), settore: val('dgAzSettore'), referente: val('dgAzReferente'),
      telefono: val('dgAzTelefono'), email: val('dgAzEmail'), sitoWeb: val('dgAzSito'), note: val('dgAzNote')
    };
    Object.assign(a, patch);
    db.collection('aziende').doc(a.id).update(patch)
      .then(function () { return _logWrite('azienda', a.id, 'Azienda — ' + patch.ragioneSociale, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () {
        document.getElementById('drawerAziendaNome').textContent = patch.ragioneSociale;
        _renderKanban();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabDeal() {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return '';
    var respOptions = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === s.dirigenteResponsabileId ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
    var statoOptions = STATI.map(function (st) {
      return '<option value="' + st + '"' + (st === s.stato ? ' selected' : '') + '>' + _statoLabel(st) + '</option>';
    }).join('');
    var tipoOptions = ['denaro', 'servizi', 'materiale'].map(function (t) {
      return '<option value="' + t + '"' + (t === s.tipologia ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
    return '<div class="dg-form-group"><label class="dg-form-label">Stato</label><select id="dgDealStato" class="dg-form-input">' + statoOptions + '</select></div>' +
      '<div class="dg-form-grid">' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo stimato (€)</label><input type="number" id="dgDealStimato" class="dg-form-input" value="' + (s.importoStimato || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Probabilità chiusura</label><input type="number" id="dgDealProb" class="dg-form-input" min="0" max="1" step="0.05" value="' + (s.probabilitaChiusura || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo confermato (€)</label><input type="number" id="dgDealConfermato" class="dg-form-input" value="' + (s.importoConfermato || 0) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Tipologia</label><select id="dgDealTipologia" class="dg-form-input">' + tipoOptions + '</select></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Data firma</label><input type="date" id="dgDealFirma" class="dg-form-input" value="' + (s.dataFirma || '') + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgDealScadenza" class="dg-form-input" value="' + (s.scadenza || '') + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Modalità pagamento</label><input type="text" id="dgDealPagamento" class="dg-form-input" value="' + escAttr(s.modalitaPagamento) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Responsabile</label><select id="dgDealResponsabile" class="dg-form-input">' + respOptions + '</select></div>' +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Contropartite</label><textarea id="dgDealContropartite" class="dg-form-input dg-form-textarea" rows="2">' + esc(s.contropartite || '') + '</textarea></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Note</label><textarea id="dgDealNote" class="dg-form-input dg-form-textarea" rows="2">' + esc(s.note || '') + '</textarea></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.saveDeal()">Salva</button></div>';
  }

  DG.saveDeal = function () {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return;
    var old = Object.assign({}, s);
    var patch = {
      stato: val('dgDealStato'),
      importoStimato: +val('dgDealStimato') || 0,
      probabilitaChiusura: +val('dgDealProb') || 0,
      importoConfermato: +val('dgDealConfermato') || 0,
      tipologia: val('dgDealTipologia'),
      dataFirma: val('dgDealFirma'),
      scadenza: val('dgDealScadenza'),
      modalitaPagamento: val('dgDealPagamento'),
      dirigenteResponsabileId: val('dgDealResponsabile'),
      contropartite: val('dgDealContropartite'),
      note: val('dgDealNote')
    };
    Object.assign(s, patch);
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    db.collection('sponsorizzazioni').doc(s.id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { _renderKanban(); _renderStatCards(); _renderCharts(); _switchDrawerTab('deal'); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabTimeline() {
    var items = _attivita.filter(function (a) { return a.sponsorizzazioneId === _curSponsorId; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var list = items.length ? '<div class="dg-timeline">' + items.map(function (a) {
      return '<div class="dg-timeline-item"><span class="dg-timeline-dot"></span>' +
        '<div class="dg-timeline-content"><div>' + _tipoLabel(a.tipo) + ' — ' + esc(a.descrizione || '') + '</div>' +
        '<div class="dg-timeline-meta">' + _fmtDate(a.data) + ' · ' + esc(a.dirigenteNome || '') + '</div></div></div>';
    }).join('') + '</div>' : '<p class="dg-muted">Nessuna attività registrata.</p>';

    var tipoOptions = ['chiamata', 'email', 'incontro', 'nota'].map(function (t) { return '<option value="' + t + '">' + _tipoLabel(t) + '</option>'; }).join('');

    return list +
      '<div class="dg-form-group" style="margin-top:18px"><label class="dg-form-label">Tipo</label><select id="dgAttTipo" class="dg-form-input">' + tipoOptions + '</select></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Data</label><input type="date" id="dgAttData" class="dg-form-input" value="' + _todayISO() + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Descrizione</label><textarea id="dgAttDesc" class="dg-form-input dg-form-textarea" rows="2" placeholder="Cosa è stato detto/fatto..."></textarea></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addAttivita()">Aggiungi</button></div>';
  }

  DG.addAttivita = function () {
    var desc = val('dgAttDesc').trim();
    if (!desc) { alert('Inserisci una descrizione.'); return; }
    var data = {
      sponsorizzazioneId: _curSponsorId, tipo: val('dgAttTipo'), data: val('dgAttData'),
      dirigenteId: _uid, dirigenteNome: _dirigenteNome, descrizione: desc, createdAt: new Date().toISOString()
    };
    var ref = db.collection('attivita').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _attivita.unshift(data);
      return _logWrite('attivita', ref.id, 'Attività — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _switchDrawerTab('timeline'); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabPromemoria() {
    var items = _promemoria.filter(function (p) { return p.sponsorizzazioneId === _curSponsorId; })
      .sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    var list = items.length ? items.map(function (p) {
      var resp = _dirigentiList.find(function (d) { return d.id === p.dirigenteAssegnatoId; });
      return '<div class="dg-reminder-item" style="cursor:default">' +
        '<label class="dg-check" style="align-items:flex-start"><input type="checkbox" ' + (p.completato ? 'checked' : '') + ' onchange="DG.toggleReminder(\'' + p.id + '\', this.checked)">' +
        '<span><div class="dg-reminder-desc" style="color:var(--dg-text);font-weight:600">' + esc(p.descrizione || '') + '</div>' +
        '<div class="dg-reminder-desc">Scadenza: ' + _fmtDate(p.dataScadenza) + ' · ' + esc(resp ? (resp.nome + ' ' + resp.cognome) : '—') + '</div></span></label>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteReminder(\'' + p.id + '\')">' + _delIconSm() + '</button></div>';
    }).join('') : '<p class="dg-muted">Nessun promemoria.</p>';

    var respOptions = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === _uid ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');

    return '<div style="display:flex;flex-direction:column;gap:8px">' + list + '</div>' +
      '<div class="dg-form-group" style="margin-top:18px"><label class="dg-form-label">Descrizione</label><input type="text" id="dgPromDesc" class="dg-form-input" placeholder="es. Richiamare dopo invio preventivo"></div>' +
      '<div class="dg-form-grid">' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgPromData" class="dg-form-input"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Assegnato a</label><select id="dgPromAssegnato" class="dg-form-input">' + respOptions + '</select></div>' +
      '</div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addPromemoria()">Aggiungi</button></div>';
  }

  DG.addPromemoria = function () {
    var desc = val('dgPromDesc').trim();
    var scad = val('dgPromData');
    if (!desc || !scad) { alert('Descrizione e scadenza sono obbligatorie.'); return; }
    var data = {
      sponsorizzazioneId: _curSponsorId, dataScadenza: scad, descrizione: desc,
      dirigenteAssegnatoId: val('dgPromAssegnato'), completato: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('promemoria').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _promemoria.unshift(data);
      return _logWrite('promemoria', ref.id, 'Promemoria — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _switchDrawerTab('promemoria'); _renderPromemoriaWidget(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.toggleReminder = function (id, checked) {
    var p = _promemoria.find(function (x) { return x.id === id; });
    if (!p) return;
    var old = { completato: !!p.completato };
    p.completato = checked;
    db.collection('promemoria').doc(id).update({ completato: checked })
      .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'update', _diff(old, { completato: checked }, ['completato'])); })
      .then(function () { _renderPromemoriaWidget(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteReminder = function (id) {
    if (!confirm('Eliminare questo promemoria?')) return;
    db.collection('promemoria').doc(id).delete()
      .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
      .then(function () {
        _promemoria = _promemoria.filter(function (x) { return x.id !== id; });
        _switchDrawerTab('promemoria'); _renderPromemoriaWidget();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabStorico() {
    var items = _sponsorizzazioni.filter(function (s) { return s.aziendaId === _curAziendaId; })
      .sort(function (a, b) { return a.seasonId === b.seasonId ? 0 : (a.seasonId < b.seasonId ? 1 : -1); });
    if (!items.length) return '<p class="dg-muted">Nessuno storico disponibile.</p>';
    return '<div class="dg-timeline">' + items.map(function (s) {
      var season = _seasons.find(function (x) { return x.id === s.seasonId; });
      var importo = s.stato === 'chiuso' ? s.importoConfermato : s.importoStimato;
      return '<div class="dg-timeline-item"><span class="dg-timeline-dot" style="background:' + _statoColor(s.stato) + '"></span>' +
        '<div class="dg-timeline-content"><div><strong>' + esc(season ? season.nome : '—') + '</strong> — ' + _statoLabel(s.stato) + ' — €' + Number(importo || 0).toLocaleString('it-IT') + '</div></div></div>';
    }).join('') + '</div>';
  }

  /* ================================================
     RETTE ATLETI
  ================================================ */
  function _renderRette() {
    var body = document.getElementById('retteBody');
    if (!_categorieAtleti.length) { body.innerHTML = '<tr><td colspan="7" class="dg-empty">Nessuna categoria per questa stagione.</td></tr>'; return; }
    body.innerHTML = _categorieAtleti.map(function (c) {
      var previsto = (+c.nAtletiPrevisti || 0) * (+c.rettaUnitaria || 0);
      var incassato = +c.incassato || 0;
      var diff = incassato - previsto;
      return '<tr>' +
        '<td>' + esc(c.nome) + '</td>' +
        '<td>' + (c.nAtletiPrevisti || 0) + '</td>' +
        '<td>€' + Number(c.rettaUnitaria || 0).toLocaleString('it-IT') + '</td>' +
        '<td>€' + previsto.toLocaleString('it-IT') + '</td>' +
        '<td><input type="number" class="dg-table-input" value="' + incassato + '" data-id="' + c.id + '" onchange="DG.saveIncassato(this)"></td>' +
        '<td class="' + (diff >= 0 ? 'dg-diff-pos' : 'dg-diff-neg') + '">' + (diff >= 0 ? '+' : '') + Math.round(diff).toLocaleString('it-IT') + ' €</td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteCategoria(\'' + c.id + '\')">' + _delIconSm() + '</button></td>' +
        '</tr>';
    }).join('');
  }

  DG.saveIncassato = function (el) {
    var id = el.dataset.id;
    var c = _categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    var old = { incassato: c.incassato || 0 };
    var v = +el.value || 0;
    c.incassato = v;
    db.collection('categorieAtleti').doc(id).update({ incassato: v })
      .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'update', _diff(old, { incassato: v }, ['incassato'])); })
      .then(function () { _renderRette(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteCategoria = function (id) {
    var c = _categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    if (!confirm('Eliminare la categoria "' + c.nome + '"?')) return;
    db.collection('categorieAtleti').doc(id).delete()
      .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
      .then(function () {
        _categorieAtleti = _categorieAtleti.filter(function (x) { return x.id !== id; });
        _renderRette(); _renderStatCards(); _renderCharts();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* ================================================
     SPESE
  ================================================ */
  function _renderSpese() {
    var body = document.getElementById('speseBody');
    if (!_vociSpesa.length) { body.innerHTML = '<tr><td colspan="5" class="dg-empty">Nessuna voce di spesa per questa stagione.</td></tr>'; return; }
    body.innerHTML = _vociSpesa.map(function (v) {
      return '<tr>' +
        '<td>' + esc(v.categoria) + '</td>' +
        '<td><input type="number" class="dg-table-input" value="' + (v.importoPreventivato || 0) + '" data-id="' + v.id + '" data-field="importoPreventivato" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><input type="number" class="dg-table-input" value="' + (v.importoSostenuto || 0) + '" data-id="' + v.id + '" data-field="importoSostenuto" onchange="DG.saveSpesaField(this)"></td>' +
        '<td>' + esc(v.note || '') + '</td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteSpesa(\'' + v.id + '\')">' + _delIconSm() + '</button></td>' +
        '</tr>';
    }).join('');
  }

  DG.saveSpesaField = function (el) {
    var id = el.dataset.id, field = el.dataset.field;
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var old = {}; old[field] = v[field] || 0;
    var nv = +el.value || 0;
    v[field] = nv;
    var patch = {}; patch[field] = nv;
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, [field])); })
      .then(function () { _renderSpese(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteSpesa = function (id) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    if (!confirm('Eliminare la voce "' + v.categoria + '"?')) return;
    db.collection('vociSpesa').doc(id).delete()
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
      .then(function () {
        _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== id; });
        _renderSpese(); _renderStatCards(); _renderCharts();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* ================================================
     LOG (sola lettura)
  ================================================ */
  function _logDate(l) {
    if (!l.timestamp) return null;
    if (l.timestamp.toDate) return l.timestamp.toDate();
    if (l.timestamp instanceof Date) return l.timestamp;
    return new Date(l.timestamp);
  }

  function _fmtDateTime(l) {
    var d = _logDate(l);
    if (!d) return '—';
    return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  function _fmtLogVal(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function _renderLog() {
    var entita = document.getElementById('logFilterEntita').value;
    var dirigente = document.getElementById('logFilterDirigente').value;
    var dal = document.getElementById('logFilterDal').value;
    var al = document.getElementById('logFilterAl').value;

    var rows = _auditLog.filter(function (l) {
      if (entita && l.entita !== entita) return false;
      if (dirigente && l.dirigenteId !== dirigente) return false;
      var ts = _logDate(l);
      if (dal && ts && ts < new Date(dal)) return false;
      if (al && ts) { var alDate = new Date(al); alDate.setHours(23, 59, 59, 999); if (ts > alDate) return false; }
      return true;
    });

    var body = document.getElementById('logBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="dg-empty">Nessuna voce di log.</td></tr>'; return; }
    body.innerHTML = rows.map(function (l) {
      return '<tr>' +
        '<td>' + _fmtDateTime(l) + '</td>' +
        '<td>' + esc(l.dirigenteNome || '—') + '</td>' +
        '<td>' + esc(l.entitaLabel || l.entita) + '</td>' +
        '<td>' + esc(l.campo || '') + '</td>' +
        '<td>' + esc(_fmtLogVal(l.valorePrecedente)) + '</td>' +
        '<td>' + esc(_fmtLogVal(l.valoreNuovo)) + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ================================================
     MODALI
  ================================================ */
  function _openModal(id) {
    _openModalId = id;
    document.getElementById('modalOverlay').classList.remove('is-hidden');
    document.getElementById(id).classList.remove('is-hidden');
  }
  function _closeModal(id) {
    _openModalId = null;
    document.getElementById('modalOverlay').classList.add('is-hidden');
    document.getElementById(id).classList.add('is-hidden');
  }

  function _initModals() {
    document.getElementById('modalOverlay').addEventListener('click', function () { if (_openModalId) _closeModal(_openModalId); });

    /* Nuovo sponsor */
    document.getElementById('newSponsorBtn').addEventListener('click', function () {
      document.getElementById('newSponsorAziendaSelect').innerHTML = '<option value="">— Crea nuova azienda —</option>' +
        _aziende.map(function (a) { return '<option value="' + a.id + '">' + esc(a.ragioneSociale) + '</option>'; }).join('');
      document.getElementById('newAziendaFields').classList.remove('is-hidden');
      ['newAziendaNome', 'newAziendaSettore', 'newAziendaReferente', 'newAziendaTelefono', 'newAziendaEmail'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('newSponsorImporto').value = '';
      _openModal('newSponsorModal');
    });
    document.getElementById('newSponsorClose').addEventListener('click', function () { _closeModal('newSponsorModal'); });
    document.getElementById('newSponsorCancel').addEventListener('click', function () { _closeModal('newSponsorModal'); });
    document.getElementById('newSponsorAziendaSelect').addEventListener('change', function () {
      document.getElementById('newAziendaFields').classList.toggle('is-hidden', !!this.value);
    });
    document.getElementById('newSponsorSave').addEventListener('click', _saveNewSponsor);

    /* Nuova stagione */
    document.getElementById('newSeasonBtn').addEventListener('click', function () {
      ['seasonNomeInput', 'seasonInizioInput', 'seasonFineInput'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('seasonObiettivoInput').value = 0;
      _openModal('newSeasonModal');
    });
    document.getElementById('newSeasonClose').addEventListener('click', function () { _closeModal('newSeasonModal'); });
    document.getElementById('newSeasonCancel').addEventListener('click', function () { _closeModal('newSeasonModal'); });
    document.getElementById('newSeasonSave').addEventListener('click', _saveNewSeason);

    /* Nuova categoria */
    document.getElementById('newCategoriaBtn').addEventListener('click', function () {
      document.getElementById('categoriaNomeInput').value = '';
      document.getElementById('categoriaNInput').value = 0;
      document.getElementById('categoriaRettaInput').value = 0;
      _openModal('newCategoriaModal');
    });
    document.getElementById('newCategoriaClose').addEventListener('click', function () { _closeModal('newCategoriaModal'); });
    document.getElementById('newCategoriaCancel').addEventListener('click', function () { _closeModal('newCategoriaModal'); });
    document.getElementById('newCategoriaSave').addEventListener('click', _saveNewCategoria);

    /* Nuova voce di spesa */
    document.getElementById('newSpesaBtn').addEventListener('click', function () {
      document.getElementById('spesaCategoriaInput').value = '';
      document.getElementById('spesaPreventivatoInput').value = 0;
      document.getElementById('spesaSostenutoInput').value = 0;
      document.getElementById('spesaNoteInput').value = '';
      _openModal('newSpesaModal');
    });
    document.getElementById('newSpesaClose').addEventListener('click', function () { _closeModal('newSpesaModal'); });
    document.getElementById('newSpesaCancel').addEventListener('click', function () { _closeModal('newSpesaModal'); });
    document.getElementById('newSpesaSave').addEventListener('click', _saveNewSpesa);
  }

  function _saveNewSponsor() {
    var aziendaSel = val('newSponsorAziendaSelect');
    var importo = +val('newSponsorImporto') || 0;
    var prob = +val('newSponsorProbabilita') || 0.5;
    var resp = val('newSponsorResponsabile');
    var tipologia = val('newSponsorTipologia');

    function createSponsorizzazione(aziendaId, aziendaNome) {
      var data = {
        aziendaId: aziendaId, seasonId: _currentSeasonId, stato: 'prospect',
        importoStimato: importo, probabilitaChiusura: prob, importoConfermato: 0,
        tipologia: tipologia, dataFirma: '', scadenza: '', modalitaPagamento: '',
        dirigenteResponsabileId: resp, contropartite: '', note: '', createdAt: new Date().toISOString()
      };
      var ref = db.collection('sponsorizzazioni').doc();
      return ref.set(data).then(function () {
        data.id = ref.id;
        _sponsorizzazioni.push(data);
        return _logWrite('sponsorizzazione', ref.id, 'Sponsorizzazione — ' + aziendaNome, 'create', _diff({}, data, Object.keys(data)));
      });
    }

    var p;
    if (aziendaSel) {
      var az = _aziendaById(aziendaSel);
      p = createSponsorizzazione(aziendaSel, az ? az.ragioneSociale : '');
    } else {
      var nome = val('newAziendaNome').trim();
      if (!nome) { alert('Inserisci la ragione sociale.'); return; }
      var aziendaData = {
        ragioneSociale: nome, settore: val('newAziendaSettore'), referente: val('newAziendaReferente'),
        telefono: val('newAziendaTelefono'), email: val('newAziendaEmail'), sitoWeb: '', note: '', createdAt: new Date().toISOString()
      };
      var aref = db.collection('aziende').doc();
      p = aref.set(aziendaData).then(function () {
        aziendaData.id = aref.id;
        _aziende.push(aziendaData);
        return _logWrite('azienda', aref.id, 'Azienda — ' + nome, 'create', _diff({}, aziendaData, Object.keys(aziendaData)));
      }).then(function () { return createSponsorizzazione(aref.id, nome); });
    }

    p.then(function () {
      _closeModal('newSponsorModal');
      _renderKanban(); _renderStatCards(); _renderCharts();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewSeason() {
    var nome = val('seasonNomeInput').trim();
    if (!nome) { alert('Inserisci il nome della stagione.'); return; }
    var data = {
      nome: nome, dataInizio: val('seasonInizioInput'), dataFine: val('seasonFineInput'),
      obiettivoSaldo: +val('seasonObiettivoInput') || 0, isAttiva: true, createdAt: new Date().toISOString()
    };
    var batch = db.batch();
    var ref = db.collection('budgetSeasons').doc();
    batch.set(ref, data);
    _seasons.forEach(function (s) { if (s.isAttiva) batch.update(db.collection('budgetSeasons').doc(s.id), { isAttiva: false }); });

    batch.commit().then(function () {
      data.id = ref.id;
      _seasons.forEach(function (s) { s.isAttiva = false; });
      _seasons.unshift(data);
      _currentSeasonId = ref.id;
      return _logWrite('obiettivo', ref.id, 'Stagione — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeModal('newSeasonModal');
      _populateSeasonSelect();
      return _loadSeasonScoped();
    }).then(function () {
      _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards(); _renderCharts(); _renderKanban(); _renderRette(); _renderSpese();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewCategoria() {
    var nome = val('categoriaNomeInput').trim();
    if (!nome) { alert('Inserisci il nome della categoria.'); return; }
    var data = {
      seasonId: _currentSeasonId, nome: nome,
      nAtletiPrevisti: +val('categoriaNInput') || 0,
      rettaUnitaria: +val('categoriaRettaInput') || 0,
      incassato: 0
    };
    var ref = db.collection('categorieAtleti').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _categorieAtleti.push(data);
      return _logWrite('categoriaAtleti', ref.id, 'Categoria — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeModal('newCategoriaModal');
      _renderRette();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewSpesa() {
    var categoria = val('spesaCategoriaInput').trim();
    if (!categoria) { alert('Inserisci il nome della voce di spesa.'); return; }
    var data = {
      seasonId: _currentSeasonId, categoria: categoria,
      importoPreventivato: +val('spesaPreventivatoInput') || 0,
      importoSostenuto: +val('spesaSostenutoInput') || 0,
      note: val('spesaNoteInput').trim()
    };
    var ref = db.collection('vociSpesa').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + categoria, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeModal('newSpesaModal');
      _renderSpese(); _renderStatCards(); _renderCharts();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ================================================
     SELECT POPULATORS
  ================================================ */
  function _populateSeasonSelect() {
    var sel = document.getElementById('seasonSelect');
    sel.innerHTML = _seasons.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === _currentSeasonId ? ' selected' : '') + '>' + esc(s.nome) + (s.isAttiva ? ' (attiva)' : '') + '</option>';
    }).join('');
  }
  function _populateResponsabileSelects() {
    var sel = document.getElementById('newSponsorResponsabile');
    sel.innerHTML = _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === _uid ? ' selected' : '') + '>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
  }
  function _populateLogDirigenteFilter() {
    var sel = document.getElementById('logFilterDirigente');
    sel.innerHTML = '<option value="">Tutti i dirigenti</option>' + _dirigentiList.map(function (d) {
      return '<option value="' + d.id + '">' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</option>';
    }).join('');
  }

  /* ================================================
     UTILS
  ================================================ */
  function val(id) { return document.getElementById(id).value; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function _cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function _aziendaById(id) { return _aziende.find(function (a) { return a.id === id; }); }
  function _isStorico(aziendaId) { return _sponsorizzazioni.some(function (s) { return s.aziendaId === aziendaId && s.seasonId !== _currentSeasonId; }); }
  function _daysDiff(dateStr) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function _fmtDate(str) { if (!str) return '—'; var p = str.split('-'); return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : str; }
  function _todayISO() { return new Date().toISOString().slice(0, 10); }
  function _initials(nome, cognome) { return ((nome || '?').charAt(0) + (cognome || '').charAt(0)).toUpperCase(); }
  function _nextPromemoria(sponsorId) {
    var items = _promemoria.filter(function (p) { return p.sponsorizzazioneId === sponsorId && !p.completato; })
      .sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    return items[0] || null;
  }
  function _statoLabel(s) { return { prospect: 'Prospect', contattato: 'Contattato', in_trattativa: 'In Trattativa', chiuso: 'Chiuso', rifiutato: 'Rifiutato' }[s] || s; }
  function _statoColor(s) { return { prospect: '#64748B', contattato: '#008CFD', in_trattativa: '#F59E0B', chiuso: '#10B981', rifiutato: '#EF4444' }[s] || '#64748B'; }
  function _tipoLabel(t) { return { chiamata: 'Chiamata', email: 'Email', incontro: 'Incontro', nota: 'Nota' }[t] || t; }
  function _delIconSm() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>'; }

})();
