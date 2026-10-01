/* Victor Volley — Area Atleti
   Un account (atleta o genitore) vede una o più schede `atleti/{id}`: quelle che
   lo elencano in `accessUids`, più la scheda con id = uid dei documenti creati
   prima dei genitori. */
(function () {
  'use strict';

  var _user    = null;
  var _atleti  = [];      /* schede visibili a questo account */
  var _current = null;    /* scheda selezionata */
  var _view    = 'home';
  var _teamsLoaded = false;

  document.addEventListener('DOMContentLoaded', function () {

    auth.onAuthStateChanged(function (user) {
      if (user) {
        _user = user;
        _loadDashboard(user);
      } else {
        _showLogin();
      }
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

    document.getElementById('alNav').addEventListener('click', function (e) {
      var btn = e.target.closest('.al-nav-btn');
      if (btn) _showView(btn.dataset.view);
    });

    document.querySelectorAll('[data-goto]').forEach(function (el) {
      el.addEventListener('click', function () { _showView(el.dataset.goto); });
    });

    document.getElementById('childBarInner').addEventListener('click', function (e) {
      var btn = e.target.closest('.al-child');
      if (btn) _selectAtleta(btn.dataset.id);
    });

    document.getElementById('pwdForm').addEventListener('submit', _changePassword);

  });

  function _showLogin() {
    document.getElementById('loginScreen').classList.remove('is-hidden');
    document.getElementById('dashboard').classList.add('is-hidden');
  }

  /* ---------------- caricamento ---------------- */

  function _loadDashboard(user) {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('dashboard').classList.remove('is-hidden');

    var loadErr = null;
    function guard(p) { return p.catch(function (e) { loadErr = loadErr || e; console.error('[atleta]', e); return null; }); }

    Promise.all([
      guard(db.collection('atleti').where('accessUids', 'array-contains', user.uid).get()),
      guard(db.collection('atleti').doc(user.uid).get())
    ]).then(function (res) {
      var byId = {};
      if (res[0]) res[0].forEach(function (d) { byId[d.id] = Object.assign({ uid: d.id }, d.data()); });
      if (res[1] && res[1].exists) byId[res[1].id] = Object.assign({ uid: res[1].id }, res[1].data());

      _atleti = Object.keys(byId).map(function (k) { return byId[k]; });
      _atleti.sort(function (a, b) { return _fullName(a).localeCompare(_fullName(b), 'it'); });

      document.getElementById('loadingState').classList.add('is-hidden');

      if (!_atleti.length) {
        if (loadErr) {
          var ns = document.getElementById('noDataState');
          ns.querySelector('p').textContent = 'Errore nel caricamento. Riprova più tardi.';
          ns.classList.remove('is-hidden');
          return;
        }
        document.getElementById('noDataState').classList.remove('is-hidden');
        return;
      }

      document.getElementById('atletaContent').classList.remove('is-hidden');
      document.getElementById('profiloEmail').textContent = user.email || '';
      _renderChildBar();
      _selectAtleta(_atleti[0].uid);
    });
  }

  /* ---------------- selezione atleta ---------------- */

  function _renderChildBar() {
    var bar = document.getElementById('childBar');
    if (_atleti.length < 2) { bar.classList.add('is-hidden'); return; }
    bar.classList.remove('is-hidden');
    document.getElementById('childBarInner').innerHTML = _atleti.map(function (a) {
      return '<button type="button" class="al-child" role="tab" data-id="' + _esc(a.uid) + '">' +
        _esc(a.nome || _fullName(a)) + '</button>';
    }).join('');
  }

  function _selectAtleta(id) {
    _current = _atleti.find(function (a) { return a.uid === id; }) || _atleti[0];

    document.querySelectorAll('.al-child').forEach(function (b) {
      var on = b.dataset.id === _current.uid;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    _renderHero(_current);
    _renderHome(_current);
    _renderCert(_current);
    _renderRate(_current);
    _renderModulo(_current);
    if (_view === 'squadra') _renderSquadra(_current);
  }

  function _showView(name) {
    _view = name;
    document.querySelectorAll('.al-view').forEach(function (v) {
      v.classList.toggle('is-hidden', v.id !== 'view-' + name);
    });
    document.querySelectorAll('.al-nav-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === name);
    });
    if (name === 'squadra' && _current) _renderSquadra(_current);
    window.scrollTo(0, 0);
  }

  /* ---------------- hero ---------------- */

  function _renderHero(a) {
    document.getElementById('atletaNome').textContent = _fullName(a);
    document.getElementById('atletaAvatar').textContent =
      ((a.nome || '').charAt(0) + (a.cognome || '').charAt(0)).toUpperCase();
    document.getElementById('atletaMeta').innerHTML = a.categoria
      ? '<span class="al-chip">' + _esc(a.categoria) + '</span>'
      : '<span class="al-muted">Squadra non ancora assegnata</span>';
  }

  /* ---------------- home: da fare + riepilogo ---------------- */

  function _todoItems(a) {
    var items = [];

    if (!a.certMedicoScadenza) {
      items.push({ lvl: 'orange', text: 'Certificato medico non ancora consegnato.' });
    } else {
      var d = _daysDiff(a.certMedicoScadenza);
      if (d < 0) {
        items.push({ lvl: 'red', text: 'Certificato medico scaduto il ' + _fmtDate(a.certMedicoScadenza) + '.' });
      } else if (d <= 30) {
        items.push({ lvl: 'orange', text: 'Il certificato medico scade ' + _inDays(d) + ' (' + _fmtDate(a.certMedicoScadenza) + ').' });
      }
    }

    (a.rate || []).forEach(function (r) {
      if (r.pagata || !r.scadenza) return;
      var d = _daysDiff(r.scadenza);
      var what = '«' + (r.descrizione || 'Quota') + '» (€' + (+r.importo || 0).toFixed(2) + ')';
      if (d < 0) {
        items.push({ lvl: 'red', text: 'Quota ' + what + ' scaduta il ' + _fmtDate(r.scadenza) + '.' });
      } else if (d <= 14) {
        items.push({ lvl: 'orange', text: 'Quota ' + what + ' in scadenza ' + _inDays(d) + ' (' + _fmtDate(r.scadenza) + ').' });
      }
    });

    items.sort(function (x, y) { return (x.lvl === 'red' ? 0 : 1) - (y.lvl === 'red' ? 0 : 1); });
    return items;
  }

  function _renderHome(a) {
    var items = _todoItems(a);
    document.getElementById('todoList').innerHTML = items.length
      ? items.map(function (it) {
          return '<li class="al-todo al-todo--' + it.lvl + '"><span class="al-todo-dot"></span><span>' + _esc(it.text) + '</span></li>';
        }).join('')
      : '<li class="al-todo al-todo--ok"><span class="al-todo-dot"></span><span>Tutto in regola, non c\'è niente da fare.</span></li>';

    /* tile certificato */
    var tc = document.getElementById('tileCert'), tcs = document.getElementById('tileCertSub');
    if (a.certMedicoScadenza) {
      var d = _daysDiff(a.certMedicoScadenza);
      tc.textContent  = d < 0 ? 'Scaduto' : d <= 30 ? 'In scadenza' : 'Valido';
      tc.className    = 'al-tile-value ' + (d < 0 ? 'is-red' : d <= 30 ? 'is-orange' : 'is-green');
      tcs.textContent = 'Fino al ' + _fmtDate(a.certMedicoScadenza);
    } else {
      tc.textContent = 'Non inserito'; tc.className = 'al-tile-value is-orange'; tcs.textContent = '';
    }

    /* tile quote */
    var t = _totaliRate(a), tr = document.getElementById('tileRate'), trs = document.getElementById('tileRateSub');
    if (t.totale > 0) {
      tr.textContent  = t.dovuto > 0 ? '€' + t.dovuto.toFixed(2) : 'Saldate';
      tr.className    = 'al-tile-value ' + (t.dovuto > 0 ? 'is-orange' : 'is-green');
      trs.textContent = t.dovuto > 0 ? 'ancora da versare' : 'Totale €' + t.totale.toFixed(2);
    } else {
      tr.textContent = '—'; tr.className = 'al-tile-value'; trs.textContent = 'Nessuna quota inserita';
    }
  }

  /* ---------------- squadra ---------------- */

  function _renderSquadra(a) {
    var el = document.getElementById('squadraContent');

    if (!_teamsLoaded) {
      el.innerHTML = '<p class="al-muted">Caricamento…</p>';
      DB.load(['categories', 'seasons', 'players', 'staff'], function () {
        _teamsLoaded = true;
        if (_view === 'squadra' && _current) _renderSquadra(_current);
      });
      return;
    }

    var cat = a.categoria && VV.getCategories().find(function (c) { return c.name === a.categoria; });
    if (!cat) {
      el.innerHTML = '<div class="al-card"><div class="al-card-body"><p class="al-muted">La squadra non è ancora stata assegnata.</p></div></div>';
      return;
    }

    var season   = VV.getCurrentSeason() || VV.getSeasons()[0];
    var seasonId = season && season.id;
    function inSeason(r) { return !r.stagione || !seasonId || r.stagione === seasonId; }
    function order(p) { return p.order != null ? p.order : (p.number != null ? p.number : 999); }

    var players = VV.getPlayers(cat.id).filter(inSeason).sort(function (x, y) { return order(x) - order(y); });
    var staff   = VV.getStaff(cat.id).filter(inSeason).sort(function (x, y) { return order(x) - order(y); });

    /* solo nome, numero e ruolo: gli stessi dati già pubblici nella pagina Squadre */
    var html = '<div class="al-card"><div class="al-card-header"><div>' +
      '<div class="al-card-title">' + _esc(cat.name) + '</div>' +
      '<div class="al-card-sub">' + (season ? 'Stagione ' + _esc(season.name || season.id) : '') + '</div></div></div>';

    html += '<div class="al-card-body">';
    if (staff.length) {
      html += '<h2 class="al-list-title">Staff</h2><ul class="al-people">' + staff.map(function (s) {
        return '<li class="al-person"><span class="al-person-num al-person-num--staff"></span>' +
          '<span class="al-person-name">' + _esc(s.name) + '</span>' +
          '<span class="al-person-role">' + _esc(s.role || '') + '</span></li>';
      }).join('') + '</ul>';
    }
    html += '<h2 class="al-list-title">Giocatori</h2>';
    html += players.length
      ? '<ul class="al-people">' + players.map(function (p) {
          return '<li class="al-person"><span class="al-person-num">' + (p.number != null ? _esc(p.number) : '') + '</span>' +
            '<span class="al-person-name">' + _esc(p.name) + '</span>' +
            '<span class="al-person-role">' + _esc(_roleLabel(p.role, p.gender)) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="al-muted">Nessun giocatore inserito.</p>';
    html += '</div></div>';

    el.innerHTML = html;
  }

  function _roleLabel(role, gender) {
    return (gender === 'F' && role === 'Palleggiatore') ? 'Palleggiatrice' : (role || '');
  }

  /* ---------------- documenti e pagamenti ---------------- */

  function _renderCert(data) {
    var scadenza = data.certMedicoScadenza || '';
    document.getElementById('certScadenza').textContent = scadenza ? _fmtDate(scadenza) : 'Non inserita';

    var badge = document.getElementById('certBadge');
    badge.textContent = '';
    badge.className   = 'al-badge';
    if (scadenza) {
      var days = _daysDiff(scadenza);
      if (days < 0) {
        badge.textContent = 'Scaduto';
        badge.className   = 'al-badge al-badge--red';
      } else if (days <= 30) {
        badge.textContent = 'In scadenza';
        badge.className   = 'al-badge al-badge--orange';
      } else {
        badge.textContent = 'Valido';
        badge.className   = 'al-badge al-badge--green';
      }
    }

    var pdfRow = document.getElementById('certPdfRow');
    pdfRow.classList.toggle('is-hidden', !data.certMedicoUrl);
    if (data.certMedicoUrl) document.getElementById('certPdfLink').href = _driveViewUrl(data.certMedicoUrl);
  }

  function _totaliRate(data) {
    var rate    = data.rate || [];
    var totale  = rate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
    var saldato = rate.filter(function (r) { return r.pagata; })
                      .reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
    return { totale: totale, saldato: saldato, dovuto: totale - saldato };
  }

  function _renderRate(data) {
    var rate = data.rate || [];
    var t    = _totaliRate(data);

    document.getElementById('rateSub').textContent = t.totale > 0
      ? 'Saldato: €' + t.saldato.toFixed(2) + '  ·  Dovuto: €' + t.dovuto.toFixed(2)
      : 'Stagione corrente';

    if (!rate.length) {
      document.getElementById('rateList').innerHTML = '<p class="al-muted">Nessuna quota inserita.</p>';
      return;
    }

    document.getElementById('rateList').innerHTML = rate.map(function (r) {
      var paid = !!r.pagata;
      return '<div class="al-rate-item' + (paid ? ' al-rate-item--paid' : '') + '">' +
        '<div class="al-rate-info">' +
          '<div class="al-rate-desc">' + _esc(r.descrizione || 'Quota') + '</div>' +
          '<div class="al-rate-date">Scadenza: ' + (r.scadenza ? _fmtDate(r.scadenza) : '—') + '</div>' +
        '</div>' +
        '<div class="al-rate-right">' +
          '<div class="al-rate-amount">€' + (+r.importo || 0).toFixed(2) + '</div>' +
          (paid
            ? '<span class="al-badge al-badge--green">Pagata</span>'
            : '<span class="al-badge al-badge--red">Da pagare</span>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _renderModulo(data) {
    var el = document.getElementById('moduloContent');
    if (data.moduloIscrizioneUrl) {
      var url = _driveViewUrl(data.moduloIscrizioneUrl);
      el.innerHTML = '<a href="' + _esc(url) + '" target="_blank" rel="noopener" class="al-btn-ghost al-btn-sm">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>' +
        'Apri modulo PDF' +
        '</a>';
    } else {
      el.innerHTML = '<p class="al-muted">Modulo non ancora disponibile.</p>';
    }
  }

  /* ---------------- profilo: cambio password ---------------- */

  function _changePassword(e) {
    e.preventDefault();
    var cur = document.getElementById('pwdCurrent').value;
    var nw  = document.getElementById('pwdNew').value;
    var cf  = document.getElementById('pwdConfirm').value;
    var msg = document.getElementById('pwdMsg');
    var btn = document.getElementById('pwdSubmit');

    function say(text, ok) { msg.textContent = text; msg.className = 'al-form-msg ' + (ok ? 'is-ok' : 'is-err'); }

    if (nw.length < 6) { say('La nuova password deve avere almeno 6 caratteri.'); return; }
    if (nw !== cf)     { say('Le due password non coincidono.'); return; }
    if (nw === cur)    { say('La nuova password deve essere diversa da quella attuale.'); return; }

    btn.disabled = true;
    var user = auth.currentUser;
    var cred = firebase.auth.EmailAuthProvider.credential(user.email, cur);

    user.reauthenticateWithCredential(cred)
      .then(function () { return user.updatePassword(nw); })
      .then(function () {
        say('Password aggiornata.', true);
        document.getElementById('pwdForm').reset();
      })
      .catch(function (err) {
        var code = err && err.code;
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
          say('La password attuale non è corretta.');
        } else if (code === 'auth/too-many-requests') {
          say('Troppi tentativi. Riprova tra qualche minuto.');
        } else if (code === 'auth/weak-password') {
          say('La nuova password è troppo debole.');
        } else {
          console.error('[atleta] password', err);
          say('Non è stato possibile aggiornare la password. Riprova.');
        }
      })
      .then(function () { btn.disabled = false; });
  }

  /* ---------------- utils ---------------- */

  /* Google Drive: link di condivisione → link di visualizzazione */
  function _driveViewUrl(url) {
    if (!url) return '#';
    var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/view';
    return url;
  }

  function _fullName(a) { return ((a.nome || '') + ' ' + (a.cognome || '')).trim(); }

  function _daysDiff(dateStr) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }

  function _inDays(d) { return d === 0 ? 'oggi' : d === 1 ? 'domani' : 'tra ' + d + ' giorni'; }

  function _fmtDate(str) {
    if (!str) return '—';
    var p = str.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
