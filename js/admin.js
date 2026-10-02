/* Victor Volley — Admin Panel Logic */
(function () {
  'use strict';

  /* ================================================
     BOOTSTRAP — Firebase Auth + ruolo dirigente
  ================================================ */
  var _uid = null, _dirigenteNome = '';

  document.addEventListener('DOMContentLoaded', function () {
    /* Ripristina sessione se l'utente è già autenticato */
    auth.onAuthStateChanged(function (user) {
      if (user) _checkRole(user);
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

    document.getElementById('deniedLogoutBtn').addEventListener('click', function () {
      auth.signOut().then(function () { location.reload(); });
    });
  });

  /* L'accesso al pannello richiede l'esistenza di un documento in
     "dirigenti" — non basta più un login Firebase qualsiasi. */
  function _checkRole(user) {
    db.collection('dirigenti').doc(user.uid).get().then(function (doc) {
      if (!doc.exists) { _showDenied(); return; }
      var data = doc.data();
      _uid = user.uid;
      _dirigenteNome = ((data.nome || '') + ' ' + (data.cognome || '')).trim() || data.email || user.email;
      DB.setAuditHook(_logWrite);
      showApp();
    }).catch(function (err) {
      console.error('[admin] role check', err);
      _showDenied();
    });
  }

  function _showDenied() {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('deniedScreen').classList.remove('is-hidden');
  }

  function showApp() {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('deniedScreen').classList.add('is-hidden');
    document.getElementById('adminApp').classList.remove('is-hidden');
    DB.init(function () {
      PhotoDB.init(function () {
        initNav();
        Admin.budget.loadData(function () {
          var initialSection = _sectionFromPath();
          _suppressPush = true;
          goTo(initialSection);
          _suppressPush = false;
          history.replaceState({ section: initialSection }, '', '/admin/' + initialSection);
        });
      });
    });
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () { location.reload(); });
  });

  /* ================================================
     ESPORTA BACKUP — tutte le collezioni Firestore del sito
     in un unico file JSON scaricato dal browser. Firestore (piano
     gratuito) non fa backup automatici: questo è il modo più semplice
     per avere una copia offline dei dati, da rifare ogni tanto.
     Aggiungere qui una nuova collezione quando se ne crea una.
  ================================================ */
  var BACKUP_COLLECTIONS = [
    'articles', 'partite', 'albums', 'categories', 'players', 'staff',
    'atleti', 'atletiRette', 'attivita', 'auditLog', 'aziende', 'bacheca',
    'budgetSeasons', 'categorieAtleti', 'categorieSpesa', 'dirigenti',
    'pianoEditoriale', 'promemoria', 'rateAtleti', 'sottospese',
    'sponsorizzazioni', 'tranchePagamento', 'vociSpesa', 'settings', 'siteData'
  ];

  document.getElementById('btnExportBackup').addEventListener('click', function () {
    var btn = this, label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = btn.innerHTML.replace('Esporta backup', 'Esportazione…');

    Promise.all(BACKUP_COLLECTIONS.map(function (name) {
      return db.collection(name).get().then(function (snap) {
        var docs = {};
        snap.forEach(function (d) { docs[d.id] = d.data(); });
        return [name, docs];
      }).catch(function (e) {
        console.error('[backup]', name, e);
        return [name, { _errore: e.message }];
      });
    })).then(function (pairs) {
      var out = { generatedAt: new Date().toISOString(), collections: {} };
      pairs.forEach(function (p) { out.collections[p[0]] = p[1]; });
      var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url;
      a.download = 'victor-volley-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }).catch(function (e) {
      alert('Errore durante l\'esportazione: ' + e.message);
    }).then(function () {
      btn.disabled = false;
      btn.innerHTML = label;
    });
  });

  /* ================================================
     CAMBIA LA MIA PASSWORD (self-service dirigente)
     Le email @victorvolley non sono caselle reali: niente
     reset via email, quindi il dirigente cambia la password
     da qui confermando quella attuale. Pulsante nella topbar
     della Dashboard, vedi renderDashboard().
  ================================================ */
  function _openMyPasswordModal() {
    document.getElementById('myPwdCurrent').value = '';
    document.getElementById('myPwdNew').value = '';
    document.getElementById('myPwdConfirm').value = '';
    var msg = document.getElementById('myPwdMsg');
    msg.classList.add('is-hidden');
    _openBudgetModal('myPasswordModal');
  }
  document.getElementById('myPasswordClose').addEventListener('click', function () { _closeBudgetModal('myPasswordModal'); });
  document.getElementById('myPwdCancel').addEventListener('click', function () { _closeBudgetModal('myPasswordModal'); });

  document.getElementById('myPwdSave').addEventListener('click', function () {
    var btn        = this;
    var msg        = document.getElementById('myPwdMsg');
    var current    = document.getElementById('myPwdCurrent').value;
    var pwd        = document.getElementById('myPwdNew').value;
    var confirmPwd = document.getElementById('myPwdConfirm').value;

    msg.classList.add('is-hidden');

    if (!current) {
      msg.textContent = 'Inserisci la password attuale.';
      msg.style.color = 'var(--a-red)';
      msg.classList.remove('is-hidden');
      return;
    }
    if (pwd.length < 6) {
      msg.textContent = 'La nuova password deve avere almeno 6 caratteri.';
      msg.style.color = 'var(--a-red)';
      msg.classList.remove('is-hidden');
      return;
    }
    if (pwd !== confirmPwd) {
      msg.textContent = 'Le due password non coincidono.';
      msg.style.color = 'var(--a-red)';
      msg.classList.remove('is-hidden');
      return;
    }

    var user = auth.currentUser;
    if (!user) return;

    btn.disabled = true;
    btn.textContent = 'Salvataggio…';

    var cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
    user.reauthenticateWithCredential(cred)
      .then(function () { return user.updatePassword(pwd); })
      .then(function () {
        msg.textContent = 'Password aggiornata con successo.';
        msg.style.color = 'var(--a-green)';
        msg.classList.remove('is-hidden');
        document.getElementById('myPwdCurrent').value = '';
        document.getElementById('myPwdNew').value = '';
        document.getElementById('myPwdConfirm').value = '';
        btn.disabled = false;
        btn.textContent = 'Salva password';
      })
      .catch(function (err) {
        var text = 'Errore: ' + (err.message || 'riprova più tardi.');
        if (err.code === 'auth/wrong-password') text = 'Password attuale non corretta.';
        if (err.code === 'auth/too-many-requests') text = 'Troppi tentativi. Riprova tra qualche minuto.';
        msg.textContent = text;
        msg.style.color = 'var(--a-red)';
        msg.classList.remove('is-hidden');
        btn.disabled = false;
        btn.textContent = 'Salva password';
      });
  });

  /* ================================================
     NAVIGATION
  ================================================ */
  var SECTIONS = {
    dashboard: 'Dashboard', articoli: 'Articoli', calendario: 'Calendario', allenamenti: 'Allenamenti', presenze: 'Presenze', comunicazioni: 'Avvisi', pianoEditoriale: 'Piano Editoriale',
    bacheca: 'Bacheca', galleria: 'Galleria', squadre: 'Squadre',
    sponsor: 'Sponsor', atleti: 'Atleti', dirigenti: 'Dirigenti', datiJson: 'File JSON',
    log: 'Log', budget: 'Budget & Forecast'
  };

  function initNav() {
    document.querySelectorAll('.admin-nav-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        goTo(el.dataset.section);
        _closeSidebar();
      });
    });
    document.querySelectorAll('.admin-nav-group').forEach(function (g) { _setGroupOpen(g, false); });
    document.querySelectorAll('.admin-nav-group-head').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _setGroupOpen(btn.parentElement, btn.parentElement.classList.contains('is-collapsed'));
      });
    });
    _initSidebarToggle();
    window.addEventListener('popstate', function (e) {
      var section = (e.state && e.state.section) || _sectionFromPath();
      _suppressPush = true;
      goTo(section);
      _suppressPush = false;
    });
  }

  /* ---- Gruppi del menù: comprimibili; quello della sezione attiva si apre da solo ---- */
  function _setGroupOpen(group, open) {
    group.classList.toggle('is-collapsed', !open);
    group.querySelector('.admin-nav-group-head').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* ---- Routing: ogni sezione ha il proprio URL (/admin/<sezione>),
     gestito via History API — niente reload, resta una SPA. ---- */
  var _suppressPush = false;
  function _sectionFromPath() {
    var m = location.pathname.match(/^\/admin\/([a-zA-Z]+)/);
    var s = m ? m[1] : 'dashboard';
    return SECTIONS[s] ? s : 'dashboard';
  }

  /* ---- Sidebar off-canvas (mobile) ---- */
  function _openSidebar() {
    document.getElementById('adminSidebar').classList.add('is-open');
    document.getElementById('sidebarOverlay').classList.remove('is-hidden');
    document.getElementById('sidebarToggle').setAttribute('aria-expanded', 'true');
  }
  function _closeSidebar() {
    document.getElementById('adminSidebar').classList.remove('is-open');
    document.getElementById('sidebarOverlay').classList.add('is-hidden');
    document.getElementById('sidebarToggle').setAttribute('aria-expanded', 'false');
  }
  function _initSidebarToggle() {
    document.getElementById('sidebarToggle').addEventListener('click', function () {
      var sidebar = document.getElementById('adminSidebar');
      if (sidebar.classList.contains('is-open')) _closeSidebar(); else _openSidebar();
    });
    document.getElementById('sidebarOverlay').addEventListener('click', _closeSidebar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') _closeSidebar();
    });
  }

  function goTo(section) {
    var bootLoading = document.getElementById('adminBootLoading');
    if (bootLoading) bootLoading.classList.add('is-hidden');
    document.querySelectorAll('.admin-nav-item').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.section === section);
    });
    document.querySelectorAll('.admin-nav-group').forEach(function (g) {
      if (g.querySelector('.admin-nav-item.is-active')) _setGroupOpen(g, true);
    });
    document.querySelectorAll('.admin-section').forEach(function (el) {
      el.classList.add('is-hidden');
    });
    document.getElementById('section' + cap(section)).classList.remove('is-hidden');
    document.getElementById('topbarTitle').textContent = SECTIONS[section] || section;
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('seasonBar').classList.toggle('is-hidden', section !== 'budget');

    if (section === 'dashboard')  renderDashboard();
    if (section === 'articoli')   Admin.cms.renderArticoli();
    if (section === 'calendario') Admin.cms.renderCalendario();
    if (section === 'allenamenti') Admin.atleti.renderAllenamenti();
    if (section === 'presenze')   Admin.atleti.renderPresenze();
    if (section === 'comunicazioni') Admin.atleti.renderComunicazioni();
    if (section === 'pianoEditoriale') renderPianoEditoriale();
    if (section === 'bacheca')    renderBacheca();
    if (section === 'galleria')   Admin.cms.renderGalleria();
    if (section === 'squadre')    Admin.cms.renderSquadre();
    if (section === 'sponsor')    Admin.cms.renderSponsor();
    if (section === 'atleti')     Admin.atleti.render();
    if (section === 'dirigenti')  renderDirigenti();
    if (section === 'datiJson')   renderDatiJson();
    if (section === 'log')        Admin.budget.renderLog();
    if (section === 'budget')     Admin.budget.renderActiveTab();

    if (!_suppressPush) {
      var path = '/admin/' + section;
      if (location.pathname !== path) history.pushState({ section: section }, '', path);
    }
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ================================================
     DASHBOARD
  ================================================ */
  function renderDashboard() {
    var pwdBtn = document.createElement('button');
    pwdBtn.className = 'btn-ghost';
    pwdBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Cambia password';
    pwdBtn.addEventListener('click', _openMyPasswordModal);
    document.getElementById('topbarActions').appendChild(pwdBtn);

    var articles = VV.getArticles();
    var partite  = VV.getPartite();
    var albums   = VV.getAlbums();
    var today    = new Date().toISOString().slice(0, 10);

    var future = partite.filter(function (p) { return p.data >= today; });

    document.getElementById('dashStats').innerHTML =
      _statCard('📰', articles.length, 'Articoli', '--blue') +
      _statCard('📅', partite.length, 'Partite', '--green') +
      _statCard('🖼️', albums.length, 'Album galleria', '--yellow') +
      _statCard('⚽', future.length, 'Prossime partite', '--red');

    var artHtml = articles.slice(0, 5).map(function (a) {
      return '<div class="dash-item"><span class="dash-item-title">' + esc(a.title) + '</span>' +
        '<span class="dash-item-meta">' + VV.formatDateShort(a.date) + '</span></div>';
    }).join('') || '<div class="dash-item"><span class="dash-item-meta">Nessun articolo</span></div>';

    var matchHtml = future.slice(0, 5).map(function (m) {
      return '<div class="dash-item"><span class="dash-item-title">' + esc(m.squadra_casa) + ' vs ' + esc(m.squadra_ospite) + '</span>' +
        '<span class="dash-item-meta">' + VV.formatDateShort(m.data) + '</span></div>';
    }).join('') || '<div class="dash-item"><span class="dash-item-meta">Nessuna partita</span></div>';

    document.getElementById('dashArticles').innerHTML = artHtml;
    document.getElementById('dashMatches').innerHTML = matchHtml;

    Admin.budget.renderDashBudgetWidget();
    Admin.budget.renderDashCashflowWidget();
    Admin.budget.renderDashSpeseWidget();
    Admin.cms.renderStagioni();
    Admin.cms.renderMaglia();
  }

  function _statCard(icon, val, label, mod) {
    return '<div class="stat-card">' +
      '<div class="stat-icon stat-icon' + mod + '" style="font-size:22px">' + icon + '</div>' +
      '<div><div class="stat-value">' + val + '</div><div class="stat-label">' + label + '</div></div>' +
      '</div>';
  }

  /* ---- Icone dei pulsanti (usate anche da Atleti e Budget) ---- */
  var EDIT_ICON_SM  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var DEL_ICON_SM   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';

  /* I metodi per i pulsanti inline (onclick="AdminActions.x()") sono aggiunti qui dai file in js/admin/ e dal resto di questo file. */
  window.AdminActions = {};

  /* ================================================
     CONFIRM MODAL
  ================================================ */
  var _confirmCb = null;

  function confirm(text, cb) {
    document.getElementById('confirmText').textContent = text;
    _confirmCb = cb;
    document.getElementById('confirmModal').classList.remove('is-hidden');
  }

  document.getElementById('confirmOk').addEventListener('click', function () {
    document.getElementById('confirmModal').classList.add('is-hidden');
    _confirmCb && _confirmCb();
  });

  document.getElementById('confirmCancel').addEventListener('click', function () {
    document.getElementById('confirmModal').classList.add('is-hidden');
  });

  /* ================================================
     PUBLIC ACTIONS (chiamate dai button inline)
  ================================================ */

  /* ================================================
     UTILS
  ================================================ */
  function showSubview(section, view) {
    var list    = document.getElementById(section + 'List');
    var form    = document.getElementById(section + 'Form');
    var photos  = document.getElementById(section + 'Photos');
    if (list)   list.classList.toggle('is-hidden', view !== 'list');
    if (form)   form.classList.toggle('is-hidden', view !== 'form');
    if (photos) photos.classList.toggle('is-hidden', view !== 'photos');
  }

  function setTopbarBtn(label, cb) {
    var btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ' + label;
    btn.addEventListener('click', cb);
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('topbarActions').appendChild(btn);
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---- Date: usate da Atleti e dal Budget ---- */
  function _daysDiff(dateStr) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }

  function _fmtDate(str) {
    if (!str) return '—';
    var p = str.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  var MESI_IT_MIN = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  function _fmtDateLong(str) {
    if (!str) return '—';
    var p = str.split('-');
    return (+p[2]) + ' ' + MESI_IT_MIN[(+p[1]) - 1] + ' ' + p[0];
  }

  /* ================================================
     DIRIGENTI (accesso Area Dirigenti)
  ================================================ */
  var _dirigentiCache = [];

  function renderDirigenti() {
    _showDirigentiView('list');
    setTopbarBtn('Nuovo dirigente', function () { _openDirigenteForm(); });
    _loadDirigenti();
  }

  function _showDirigentiView(view) {
    document.getElementById('dirigentiList').classList.toggle('is-hidden', view !== 'list');
    document.getElementById('dirigentiForm').classList.toggle('is-hidden', view !== 'form');
  }

  function _loadDirigenti() {
    document.getElementById('dirigentiBody').innerHTML =
      '<tr><td colspan="3" style="text-align:center;color:var(--a-muted);padding:20px">Caricamento…</td></tr>';

    db.collection('dirigenti').get().then(function (snap) {
      _dirigentiCache = [];
      snap.forEach(function (doc) {
        _dirigentiCache.push(Object.assign({ uid: doc.id }, doc.data()));
      });
      _dirigentiCache.sort(function (a, b) {
        return (a.nome || '') < (b.nome || '') ? -1 : 1;
      });
      _renderDirigentiRows();
    }).catch(function (err) {
      console.error('[Dirigenti]', err);
      document.getElementById('dirigentiBody').innerHTML =
        '<tr><td colspan="3" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  function _renderDirigentiRows() {
    if (!_dirigentiCache.length) {
      document.getElementById('dirigentiBody').innerHTML =
        '<tr><td colspan="3"><div class="empty-state"><p>Nessun dirigente con accesso.</p></div></td></tr>';
      return;
    }
    var EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var DEL_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
    document.getElementById('dirigentiBody').innerHTML = _dirigentiCache.map(function (d) {
      return '<tr>' +
        '<td>' + esc((d.nome || '') + ' ' + (d.cognome || '')) + '</td>' +
        '<td>' + esc(d.email || '') + '</td>' +
        '<td style="text-align:right">' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteDirigente(\'' + d.uid + '\')" title="Revoca accesso">' + DEL_ICON + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function _openDirigenteForm() {
    _showDirigentiView('form');
    document.getElementById('topbarActions').innerHTML = '';
    ['dirigenteNome', 'dirigenteCognome', 'dirigenteEmail', 'dirigentePassword'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
  }

  document.getElementById('dirigenteFormCancel').addEventListener('click', renderDirigenti);

  document.getElementById('dirigenteFormSave').addEventListener('click', function () {
    var nome    = document.getElementById('dirigenteNome').value.trim();
    var cognome = document.getElementById('dirigenteCognome').value.trim();
    var email   = document.getElementById('dirigenteEmail').value.trim();
    var pwd     = document.getElementById('dirigentePassword').value;

    if (!nome || !cognome || !email || !pwd) {
      alert('Nome, cognome, email e password sono obbligatori.'); return;
    }
    if (pwd.length < 6) { alert('La password deve avere almeno 6 caratteri.'); return; }

    var btn = document.getElementById('dirigenteFormSave');
    btn.textContent = 'Creazione…'; btn.disabled = true;

    /* secondary app per non disconnettere l'admin */
    var existing  = firebase.apps.find(function (a) { return a.name === 'dirigente-creator'; });
    var secondary = existing || firebase.initializeApp(firebase.app().options, 'dirigente-creator');
    var secAuth   = secondary.auth();

    secAuth.createUserWithEmailAndPassword(email, pwd)
      .then(function (cred) {
        var uid = cred.user.uid;
        return secAuth.signOut().then(function () {
          var data = {
            uid: uid, nome: nome, cognome: cognome, email: email,
            createdAt: new Date().toISOString()
          };
          return db.collection('dirigenti').doc(uid).set(data).then(function () {
            return _logWrite('dirigente', uid, 'Dirigente — ' + cognome + ' ' + nome, 'create', _diff({}, data, Object.keys(data)));
          });
        });
      })
      .then(renderDirigenti)
      .catch(function (err) {
        var msg = err.code === 'auth/email-already-in-use'
          ? 'Email già registrata.' : err.message;
        alert('Errore: ' + msg);
        btn.textContent = 'Crea dirigente'; btn.disabled = false;
      });
  });

  window.AdminActions.deleteDirigente = function (uid) {
    var target = _dirigentiCache.find(function (d) { return d.uid === uid; });
    confirm(
      'Revocare l\'accesso all\'Area Dirigenti? Le credenziali Firebase resteranno attive.',
      function () {
        db.collection('dirigenti').doc(uid).delete()
          .then(function () {
            return _logWrite('dirigente', uid, 'Dirigente — ' + (target ? target.cognome + ' ' + target.nome : uid), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
          })
          .then(function () {
            _dirigentiCache = _dirigentiCache.filter(function (d) { return d.uid !== uid; });
            _renderDirigentiRows();
          })
          .catch(function (e) { alert('Errore: ' + e.message); });
      }
    );
  };

  /* ================================================
     PIANO EDITORIALE (Instagram / Facebook / TikTok / Sito)
     Dati privati dell'Area Dirigenti — stesso pattern di attivita/
     promemoria: niente cache pubblica VV.js, caricamento lazy on-demand
     al primo accesso alla sezione, scrittura diretta su Firestore.
  ================================================ */
  var _peItems     = [];
  var _peLoaded    = false;
  var _peEditing   = null;
  var _peDirigenti = null;
  var _peMonthCursor = new Date();
  _peMonthCursor.setDate(1);
  var _pePlatformFilter = { instagram: true, facebook: true, tiktok: true, sito: true };

  var PE_PLATFORMS = [
    { key: 'instagram', label: 'Instagram', chipClass: 'chip--pink'  },
    { key: 'facebook',  label: 'Facebook',  chipClass: 'chip--blue'  },
    { key: 'tiktok',    label: 'TikTok',    chipClass: 'chip--black' },
    { key: 'sito',      label: 'Sito Web',  chipClass: 'chip--green' }
  ];
  var PE_WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  function _peYmd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _loadPianoEditoriale(cb) {
    if (_peLoaded) { cb(); return; }
    db.collection('pianoEditoriale').get().then(function (snap) {
      _peItems = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      _peLoaded = true;
      cb();
    }).catch(function (e) {
      console.error('[pianoEditoriale] load', e);
      _peLoaded = true;
      cb();
    });
  }

  function _loadPeDirigenti(cb) {
    if (_peDirigenti) { cb(); return; }
    db.collection('dirigenti').get().then(function (snap) {
      _peDirigenti = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
      cb();
    }).catch(function (e) {
      console.error('[pianoEditoriale] dirigenti', e);
      _peDirigenti = [];
      cb();
    });
  }

  function renderPianoEditoriale() {
    _loadPianoEditoriale(function () {
      showSubview('pianoEditoriale', 'list');
      setTopbarBtn('Nuovo contenuto', function () { _openPeForm(null, null); });
      _renderPeFilterBox();
      _renderPeGrid();
    });
  }

  function _renderPeFilterBox() {
    var box = document.getElementById('pePlatformFilter');
    box.innerHTML = PE_PLATFORMS.map(function (p) {
      var checked = _pePlatformFilter[p.key] ? ' checked' : '';
      return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:5px 12px;border:1px solid #e2e8f0;border-radius:20px;cursor:pointer;user-select:none">' +
        '<input type="checkbox" class="peFilterCheck" value="' + p.key + '"' + checked + '> ' + p.label +
        '</label>';
    }).join('');
    box.querySelectorAll('.peFilterCheck').forEach(function (cb) {
      cb.addEventListener('change', function () {
        _pePlatformFilter[cb.value] = cb.checked;
        _renderPeGrid();
      });
    });
  }

  function _peIsMobile() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  function _peDayItems(ymd) {
    return _peItems.filter(function (it) {
      return it.data === ymd && (it.piattaforme || []).some(function (p) { return _pePlatformFilter[p]; });
    }).sort(function (a, b) { return (a.ora || '').localeCompare(b.ora || ''); });
  }

  function _peItemPlatform(it) {
    var platKey = (it.piattaforme || [])[0];
    return PE_PLATFORMS.find(function (p) { return p.key === platKey; }) || PE_PLATFORMS[0];
  }

  function _renderPeGrid() {
    document.getElementById('peMonthLabel').textContent =
      cap(_peMonthCursor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));

    if (_peIsMobile()) { _renderPeAgenda(); return; }

    var year  = _peMonthCursor.getFullYear();
    var month = _peMonthCursor.getMonth();
    var firstOfMonth  = new Date(year, month, 1);
    var startOffset   = (firstOfMonth.getDay() + 6) % 7; /* lun = 0 */
    var gridStart     = new Date(year, month, 1 - startOffset);
    var todayYmd      = _peYmd(new Date());

    var html = PE_WEEKDAYS.map(function (w) { return '<div class="pe-cal-weekday">' + w + '</div>'; }).join('');

    for (var i = 0; i < 42; i++) {
      var cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      var ymd      = _peYmd(cellDate);
      var inMonth  = cellDate.getMonth() === month;
      var dayItems = _peDayItems(ymd);

      var chipsHtml = dayItems.map(function (it) {
        var plat = _peItemPlatform(it);
        return '<div class="pe-chip chip ' + plat.chipClass + '" onclick="AdminActions.editPianoEditoriale(\'' + it.id + '\')" title="' + esc(it.titolo) + '">' + esc(it.titolo) + '</div>';
      }).join('');

      html +=
        '<div class="pe-cal-cell' + (inMonth ? '' : ' pe-cal-cell--out') + (ymd === todayYmd ? ' pe-cal-cell--today' : '') + '">' +
          '<div class="pe-cal-cell-head"><span>' + cellDate.getDate() + '</span>' +
            '<button type="button" class="pe-cal-add" onclick="AdminActions.newPianoEditoriale(\'' + ymd + '\')" title="Nuovo contenuto">+</button>' +
          '</div>' +
          '<div class="pe-cal-cell-body">' + chipsHtml + '</div>' +
        '</div>';
    }

    var grid = document.getElementById('peCalGrid');
    grid.className = 'pe-cal-grid';
    grid.innerHTML = html;
  }

  function _renderPeAgenda() {
    var year  = _peMonthCursor.getFullYear();
    var month = _peMonthCursor.getMonth();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var todayYmd = _peYmd(new Date());
    var weekdaysFull = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

    var rows = [];
    for (var d = 1; d <= daysInMonth; d++) {
      var cellDate = new Date(year, month, d);
      var ymd = _peYmd(cellDate);
      var dayItems = _peDayItems(ymd);
      if (!dayItems.length) continue;

      var itemsHtml = dayItems.map(function (it) {
        var plat = _peItemPlatform(it);
        return '<div class="pe-agenda-item ' + plat.chipClass + '" onclick="AdminActions.editPianoEditoriale(\'' + it.id + '\')">' +
          '<div class="pe-agenda-item-top">' +
            '<span class="pe-agenda-item-title">' + esc(it.titolo) + '</span>' +
            (it.ora ? '<span class="pe-agenda-item-time">' + esc(it.ora) + '</span>' : '') +
          '</div>' +
          '<div class="pe-agenda-item-plat">' + esc(plat.label) + '</div>' +
        '</div>';
      }).join('');

      rows.push(
        '<div class="pe-agenda-day' + (ymd === todayYmd ? ' pe-agenda-day--today' : '') + '">' +
          '<div class="pe-agenda-day-head">' +
            '<span>' + weekdaysFull[(cellDate.getDay() + 6) % 7] + ' ' + d + (ymd === todayYmd ? ' <span class="pe-agenda-today-tag">Oggi</span>' : '') + '</span>' +
            '<button type="button" class="pe-cal-add" onclick="AdminActions.newPianoEditoriale(\'' + ymd + '\')" title="Nuovo contenuto">+</button>' +
          '</div>' +
          itemsHtml +
        '</div>'
      );
    }

    var html = rows.length ? rows.join('') :
      '<div class="pe-agenda-empty">Nessun contenuto pianificato questo mese.</div>';

    var grid = document.getElementById('peCalGrid');
    grid.className = 'pe-agenda-list';
    grid.innerHTML = html;
  }

  document.getElementById('peMonthPrev').addEventListener('click', function () {
    _peMonthCursor.setMonth(_peMonthCursor.getMonth() - 1);
    _renderPeGrid();
  });
  document.getElementById('peMonthNext').addEventListener('click', function () {
    _peMonthCursor.setMonth(_peMonthCursor.getMonth() + 1);
    _renderPeGrid();
  });
  document.getElementById('peMonthToday').addEventListener('click', function () {
    _peMonthCursor = new Date();
    _peMonthCursor.setDate(1);
    _renderPeGrid();
  });
  (function () {
    var _peResizeT = null;
    window.addEventListener('resize', function () {
      clearTimeout(_peResizeT);
      _peResizeT = setTimeout(function () {
        if (_peLoaded && !document.getElementById('sectionPianoEditoriale').classList.contains('is-hidden')) {
          _renderPeGrid();
        }
      }, 150);
    });
  })();

  function _renderPePiattaformeCheckboxes(selected) {
    var box = document.getElementById('pePiattaformeBox');
    box.innerHTML = PE_PLATFORMS.map(function (p) {
      var checked = selected.indexOf(p.key) !== -1 ? ' checked' : '';
      return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 14px;border:1px solid #e2e8f0;border-radius:20px;cursor:pointer;user-select:none">' +
        '<input type="checkbox" class="pePiattaformaCheck" value="' + p.key + '"' + checked + '> ' + p.label +
        '</label>';
    }).join('');
  }

  function _renderPeArticoloSelect(selectedId) {
    var articles = VV.getArticles().slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var sel = document.getElementById('peArticolo');
    sel.innerHTML = '<option value="">— Nessuno —</option>' +
      articles.map(function (a) { return '<option value="' + a.id + '">' + esc(a.title) + '</option>'; }).join('');
    sel.value = selectedId != null ? String(selectedId) : '';
  }

  function _renderPeResponsabileSelect(selected) {
    var sel = document.getElementById('peResponsabile');
    sel.innerHTML = '<option value="">— Nessuno —</option>' +
      _peDirigenti.map(function (d) {
        var nome = ((d.nome || '') + ' ' + (d.cognome || '')).trim() || d.email || d.uid;
        return '<option value="' + esc(nome) + '">' + esc(nome) + '</option>';
      }).join('');
    sel.value = selected || '';
  }

  function _openPeForm(item, presetDate) {
    _peEditing = item;
    showSubview('pianoEditoriale', 'form');
    document.getElementById('topbarActions').innerHTML = '';

    _renderPeArticoloSelect(item ? item.articoloId : null);
    _renderPePiattaformeCheckboxes(item ? (item.piattaforme || []) : []);
    _loadPeDirigenti(function () { _renderPeResponsabileSelect(item ? item.responsabile : ''); });

    document.getElementById('peTitolo').value = item ? (item.titolo || '') : '';
    document.getElementById('peData').value   = item ? (item.data || '') : (presetDate || '');
    document.getElementById('peOra').value    = item ? (item.ora || '') : '';
    document.getElementById('peStato').value  = item ? (item.stato || 'daFare') : 'daFare';
    document.getElementById('peNote').value   = item ? (item.note || '') : '';
    document.getElementById('peDelete').classList.toggle('is-hidden', !item);
  }

  window.AdminActions.editPianoEditoriale = function (id) {
    var item = _peItems.find(function (x) { return x.id === id; });
    if (item) _openPeForm(item, null);
  };
  window.AdminActions.newPianoEditoriale = function (ymd) {
    _openPeForm(null, ymd);
  };

  document.getElementById('peArticolo').addEventListener('change', function () {
    if (!this.value) return;
    var titleEl = document.getElementById('peTitolo');
    if (titleEl.value.trim()) return;
    var article = VV.getArticle(+this.value);
    if (article) titleEl.value = article.title;
  });

  document.getElementById('peCancel').addEventListener('click', renderPianoEditoriale);

  document.getElementById('peSave').addEventListener('click', function () {
    var titolo = document.getElementById('peTitolo').value.trim();
    if (!titolo) { alert('Il titolo è obbligatorio.'); return; }
    var data = document.getElementById('peData').value;
    if (!data) { alert('La data è obbligatoria.'); return; }
    var piattaforme = Array.prototype.map.call(
      document.querySelectorAll('#pePiattaformeBox .pePiattaformaCheck:checked'),
      function (cb) { return cb.value; }
    );
    if (!piattaforme.length) { alert('Seleziona almeno una piattaforma.'); return; }
    var articoloRaw = document.getElementById('peArticolo').value;

    var item = {
      titolo:       titolo,
      data:         data,
      ora:          document.getElementById('peOra').value,
      piattaforme:  piattaforme,
      stato:        document.getElementById('peStato').value,
      articoloId:   articoloRaw ? +articoloRaw : null,
      responsabile: document.getElementById('peResponsabile').value,
      note:         document.getElementById('peNote').value.trim()
    };

    var before = _peEditing;
    var ref = before ? db.collection('pianoEditoriale').doc(before.id) : db.collection('pianoEditoriale').doc();
    ref.set(item).then(function () {
      var saved = Object.assign({ id: ref.id }, item);
      if (before) _peItems = _peItems.map(function (x) { return x.id === ref.id ? saved : x; });
      else        _peItems.push(saved);
      return _logWrite('pianoEditoriale', ref.id, 'Piano editoriale — ' + titolo,
        before ? 'update' : 'create', _diff(before, saved, Object.keys(item)));
    }).then(function () {
      renderPianoEditoriale();
    }).catch(function (e) {
      console.error('[pianoEditoriale] save', e);
      alert('Errore nel salvataggio. Riprova.');
    });
  });

  document.getElementById('peDelete').addEventListener('click', function () {
    if (!_peEditing) return;
    var id = _peEditing.id, titolo = _peEditing.titolo;
    confirm('Eliminare "' + titolo + '" dal piano editoriale?', function () {
      db.collection('pianoEditoriale').doc(id).delete().then(function () {
        _peItems = _peItems.filter(function (x) { return x.id !== id; });
        return _logWrite('pianoEditoriale', id, 'Piano editoriale — ' + titolo, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).then(function () {
        renderPianoEditoriale();
      }).catch(function (e) {
        console.error('[pianoEditoriale] delete', e);
        alert('Errore durante l\'eliminazione. Riprova.');
      });
    });
  });

  /* ================================================
     BACHECA — kanban (Da fare · In corso · Fatta)
     Dati privati dell'Area Dirigenti, stesso pattern di pianoEditoriale:
     caricamento lazy on-demand, scrittura diretta su Firestore.
  ================================================ */
  var _kbItems     = [];
  var _kbLoaded    = false;
  var _kbEditing   = null;
  var _kbDirigenti = null;
  var _kbDragId    = null;

  var KB_COLUMNS = [
    { key: 'daFare',  label: 'Da fare' },
    { key: 'inCorso', label: 'In corso' },
    { key: 'fatta',   label: 'Fatta' }
  ];

  var KB_PRIORITA_ORDER = { alta: 0, media: 1, bassa: 2 };
  var KB_PRIORITA_LABEL = { alta: 'Alta', media: 'Media', bassa: 'Bassa' };

  function _loadBacheca(cb) {
    if (_kbLoaded) { cb(); return; }
    db.collection('bacheca').get().then(function (snap) {
      _kbItems = snap.docs.map(_mapDoc);
      _kbLoaded = true;
      cb();
    }).catch(function (e) {
      console.error('[bacheca] load', e);
      _kbLoaded = true;
      cb();
    });
  }

  function _loadKbDirigenti(cb) {
    if (_kbDirigenti) { cb(); return; }
    db.collection('dirigenti').get().then(function (snap) {
      _kbDirigenti = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
      cb();
    }).catch(function (e) {
      console.error('[bacheca] dirigenti', e);
      _kbDirigenti = [];
      cb();
    });
  }

  function renderBacheca() {
    _loadBacheca(function () {
      setTopbarBtn('Nuova attività', function () { _openKbModal(null, 'daFare'); });
      _renderKbBoard();
    });
  }

  function _kbFmtDate(ymd) {
    if (!ymd) return '';
    var p = ymd.split('-');
    return p[2] + '/' + p[1];
  }

  function _renderKbBoard() {
    var todayYmd = new Date().toISOString().slice(0, 10);
    var html = KB_COLUMNS.map(function (col, colIdx) {
      var items = _kbItems.filter(function (it) { return (it.stato || 'daFare') === col.key; })
        .sort(function (a, b) {
          var pa = KB_PRIORITA_ORDER[a.priorita] != null ? KB_PRIORITA_ORDER[a.priorita] : 1;
          var pb = KB_PRIORITA_ORDER[b.priorita] != null ? KB_PRIORITA_ORDER[b.priorita] : 1;
          if (pa !== pb) return pa - pb;
          if (a.scadenza && b.scadenza) return a.scadenza < b.scadenza ? -1 : 1;
          if (a.scadenza) return -1;
          if (b.scadenza) return 1;
          return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
        });

      var cards = items.map(function (it) {
        var late = it.scadenza && it.scadenza < todayYmd && col.key !== 'fatta';
        var priorita = it.priorita || 'media';
        return '<div class="kb-card kb-card--' + priorita + '" draggable="true" data-id="' + esc(it.id) + '">' +
          '<div class="kb-card-title">' + esc(it.titolo) + '</div>' +
          (it.creatoDa ? '<div class="kb-card-creator">Creata da ' + esc(it.creatoDa) + '</div>' : '') +
          '<div class="kb-card-meta">' +
            '<span class="kb-card-priorita kb-card-priorita--' + priorita + '">' + KB_PRIORITA_LABEL[priorita] + '</span>' +
            (it.responsabile ? '<span class="kb-card-resp">Assegnata a ' + esc(it.responsabile) + '</span>' : '') +
            (it.scadenza ? '<span class="kb-card-due' + (late ? ' kb-card-due--late' : '') + '">' + _kbFmtDate(it.scadenza) + '</span>' : '') +
          '</div>' +
          '<div class="kb-card-actions">' +
            '<button type="button" class="kb-card-move" data-id="' + esc(it.id) + '" data-dir="-1"' + (colIdx === 0 ? ' disabled' : '') + ' title="Sposta indietro">&lsaquo;</button>' +
            '<button type="button" class="kb-card-move" data-id="' + esc(it.id) + '" data-dir="1"' + (colIdx === KB_COLUMNS.length - 1 ? ' disabled' : '') + ' title="Sposta avanti">&rsaquo;</button>' +
          '</div>' +
        '</div>';
      }).join('') || '<div class="kb-col-empty">Nessuna attività</div>';

      return '<div class="kb-col" data-stato="' + col.key + '">' +
        '<div class="kb-col-head">' +
          '<span class="kb-col-dot"></span>' +
          '<span class="kb-col-title">' + col.label + '</span>' +
          '<span class="kb-col-count">' + items.length + '</span>' +
          '<button type="button" class="kb-col-add" data-stato="' + col.key + '" title="Nuova attività">+</button>' +
        '</div>' +
        '<div class="kb-col-body" data-stato="' + col.key + '">' + cards + '</div>' +
      '</div>';
    }).join('');

    document.getElementById('kbBoard').innerHTML = html;
    _wireKbBoard();
  }

  function _wireKbBoard() {
    var board = document.getElementById('kbBoard');

    board.querySelectorAll('.kb-col-add').forEach(function (btn) {
      btn.addEventListener('click', function () { _openKbModal(null, btn.dataset.stato); });
    });

    board.querySelectorAll('.kb-card-move').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (btn.disabled) return;
        _kbMove(btn.dataset.id, +btn.dataset.dir);
      });
    });

    board.querySelectorAll('.kb-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var item = _kbItems.find(function (x) { return x.id === card.dataset.id; });
        if (item) _openKbModal(item, null);
      });
      card.addEventListener('dragstart', function (e) {
        _kbDragId = card.dataset.id;
        card.classList.add('kb-card--dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function () {
        card.classList.remove('kb-card--dragging');
        _kbDragId = null;
      });
    });

    board.querySelectorAll('.kb-col-body').forEach(function (body) {
      body.addEventListener('dragover', function (e) {
        if (!_kbDragId) return;
        e.preventDefault();
        body.classList.add('kb-col-body--over');
      });
      body.addEventListener('dragleave', function () {
        body.classList.remove('kb-col-body--over');
      });
      body.addEventListener('drop', function (e) {
        e.preventDefault();
        body.classList.remove('kb-col-body--over');
        if (!_kbDragId) return;
        _kbSetStato(_kbDragId, body.dataset.stato);
        _kbDragId = null;
      });
    });
  }

  function _kbMove(id, dir) {
    var item = _kbItems.find(function (x) { return x.id === id; });
    if (!item) return;
    var idx  = KB_COLUMNS.findIndex(function (c) { return c.key === (item.stato || 'daFare'); });
    var next = KB_COLUMNS[idx + dir];
    if (!next) return;
    _kbSetStato(id, next.key);
  }

  function _kbSetStato(id, stato) {
    var item = _kbItems.find(function (x) { return x.id === id; });
    if (!item || item.stato === stato) return;
    var beforeStato = item.stato;
    item.stato = stato;
    _renderKbBoard();
    db.collection('bacheca').doc(id).update({ stato: stato }).then(function () {
      return _logWrite('bacheca', id, 'Bacheca — ' + item.titolo, 'update', [{ campo: 'stato', prima: beforeStato || null, dopo: stato }]);
    }).catch(function (e) {
      console.error('[bacheca] move', e);
      alert('Errore nello spostamento. Riprova.');
      item.stato = beforeStato;
      _renderKbBoard();
    });
  }

  function _renderKbResponsabileSelect(selected) {
    var sel = document.getElementById('kbResponsabile');
    sel.innerHTML = '<option value="">— Nessuno —</option>' +
      _kbDirigenti.map(function (d) {
        var nome = ((d.nome || '') + ' ' + (d.cognome || '')).trim() || d.email || d.uid;
        return '<option value="' + esc(nome) + '">' + esc(nome) + '</option>';
      }).join('');
    sel.value = selected || '';
  }

  function _openKbModal(item, presetStato) {
    _kbEditing = item;
    document.getElementById('kbModalTitle').textContent = item ? 'Modifica attività' : 'Nuova attività';
    document.getElementById('kbTitolo').value       = item ? (item.titolo || '') : '';
    document.getElementById('kbDescrizione').value  = item ? (item.descrizione || '') : '';
    document.getElementById('kbStato').value        = item ? (item.stato || 'daFare') : (presetStato || 'daFare');
    document.getElementById('kbPriorita').value      = item ? (item.priorita || 'media') : 'media';
    document.getElementById('kbScadenza').value     = item ? (item.scadenza || '') : '';
    document.getElementById('kbDelete').classList.toggle('is-hidden', !item);
    var creatoInfo = document.getElementById('kbCreatoInfo');
    if (item && item.creatoDa) {
      creatoInfo.textContent = 'Creata da ' + item.creatoDa + (item.createdAt ? ' il ' + new Date(item.createdAt).toLocaleDateString('it-IT') : '');
      creatoInfo.classList.remove('is-hidden');
    } else {
      creatoInfo.classList.add('is-hidden');
    }
    _loadKbDirigenti(function () { _renderKbResponsabileSelect(item ? item.responsabile : ''); });
    _openBudgetModal('kbModal');
  }

  document.getElementById('kbModalClose').addEventListener('click', function () { _closeBudgetModal('kbModal'); });
  document.getElementById('kbCancel').addEventListener('click', function () { _closeBudgetModal('kbModal'); });

  document.getElementById('kbSave').addEventListener('click', function () {
    var titolo = document.getElementById('kbTitolo').value.trim();
    if (!titolo) { alert('Il titolo è obbligatorio.'); return; }

    var before = _kbEditing;
    var item = {
      titolo:       titolo,
      descrizione:  document.getElementById('kbDescrizione').value.trim(),
      stato:        document.getElementById('kbStato').value,
      priorita:     document.getElementById('kbPriorita').value,
      responsabile: document.getElementById('kbResponsabile').value,
      scadenza:     document.getElementById('kbScadenza').value,
      createdAt:    before ? (before.createdAt || new Date().toISOString()) : new Date().toISOString(),
      creatoDa:     before ? (before.creatoDa || _dirigenteNome) : _dirigenteNome,
      creatoDaUid:  before ? (before.creatoDaUid || _uid) : _uid
    };

    var ref = before ? db.collection('bacheca').doc(before.id) : db.collection('bacheca').doc();
    ref.set(item).then(function () {
      var saved = Object.assign({ id: ref.id }, item);
      if (before) _kbItems = _kbItems.map(function (x) { return x.id === ref.id ? saved : x; });
      else        _kbItems.push(saved);
      return _logWrite('bacheca', ref.id, 'Bacheca — ' + titolo,
        before ? 'update' : 'create', _diff(before, saved, Object.keys(item)));
    }).then(function () {
      _closeBudgetModal('kbModal');
      _renderKbBoard();
    }).catch(function (e) {
      console.error('[bacheca] save', e);
      alert('Errore nel salvataggio. Riprova.');
    });
  });

  document.getElementById('kbDelete').addEventListener('click', function () {
    if (!_kbEditing) return;
    var id = _kbEditing.id, titolo = _kbEditing.titolo;
    confirm('Eliminare "' + titolo + '" dalla bacheca?', function () {
      db.collection('bacheca').doc(id).delete().then(function () {
        _kbItems = _kbItems.filter(function (x) { return x.id !== id; });
        return _logWrite('bacheca', id, 'Bacheca — ' + titolo, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).then(function () {
        _closeBudgetModal('kbModal');
        _renderKbBoard();
      }).catch(function (e) {
        console.error('[bacheca] delete', e);
        alert('Errore durante l\'eliminazione. Riprova.');
      });
    });
  });

  /* ================================================
     FILE JSON
  ================================================ */
  var JSON_FILES = {
    girone:  { label: 'data/girone.json',  staticPath: '/data/girone.json'  }
  };

  function renderDatiJson() {
    Object.keys(JSON_FILES).forEach(function (key) {
      var statusEl  = document.getElementById(key + 'JsonStatus');
      var updatedEl = document.getElementById(key + 'JsonUpdated');
      var editorEl  = document.getElementById(key + 'JsonEditor');
      if (!editorEl) return;

      statusEl.textContent = 'Caricamento…';
      statusEl.style.color = '';

      db.collection('siteData').doc(key).get()
        .then(function (doc) {
          if (doc.exists && doc.data() && doc.data().json) {
            editorEl.value = JSON.stringify(JSON.parse(doc.data().json), null, 2);
            var ts = doc.data().updatedAt;
            if (ts) updatedEl.textContent = 'Salvato ' + _fmtDate(ts.toDate().toISOString().slice(0, 10));
            statusEl.textContent = '';
          } else {
            return fetch(JSON_FILES[key].staticPath)
              .then(function (r) { return r.json(); })
              .then(function (data) {
                editorEl.value = JSON.stringify(data, null, 2);
                updatedEl.textContent = 'File locale (non ancora su Firestore)';
                statusEl.textContent = '';
              });
          }
        })
        .catch(function () {
          fetch(JSON_FILES[key].staticPath)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              editorEl.value = JSON.stringify(data, null, 2);
              updatedEl.textContent = 'File locale';
              statusEl.textContent = '';
            });
        });
    });
  }

  window.AdminActions.formatJson = function (key) {
    var editorEl = document.getElementById(key + 'JsonEditor');
    var statusEl = document.getElementById(key + 'JsonStatus');
    try {
      editorEl.value = JSON.stringify(JSON.parse(editorEl.value), null, 2);
      statusEl.textContent = '';
    } catch (e) {
      statusEl.textContent = 'JSON non valido: ' + e.message;
      statusEl.style.color = 'var(--a-red)';
    }
  };

  window.AdminActions.saveJson = function (key) {
    var editorEl  = document.getElementById(key + 'JsonEditor');
    var statusEl  = document.getElementById(key + 'JsonStatus');
    var updatedEl = document.getElementById(key + 'JsonUpdated');

    var parsed;
    try {
      parsed = JSON.parse(editorEl.value);
    } catch (e) {
      statusEl.textContent = 'JSON non valido: ' + e.message;
      statusEl.style.color = 'var(--a-red)';
      return;
    }

    editorEl.value = JSON.stringify(parsed, null, 2);
    statusEl.textContent = 'Salvataggio…';
    statusEl.style.color = '';

    db.collection('siteData').doc(key).set({
      json:      JSON.stringify(parsed),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      statusEl.textContent = '✓ Salvato con successo';
      statusEl.style.color = 'var(--a-green)';
      updatedEl.textContent = 'Salvato ora';
      setTimeout(function () { statusEl.textContent = ''; }, 3000);
    }).catch(function (e) {
      statusEl.textContent = 'Errore: ' + e.message;
      statusEl.style.color = 'var(--a-red)';
    });
  };

  /* ---- Migrazione immagini base64 → Cloudinary ----
     Da attivare manualmente (pulsante in "File JSON"). Scorre articoli,
     giocatori, staff, partite (loghi squadra) e sponsor: ogni campo
     immagine ancora in base64 viene caricato su Cloudinary e il documento
     riscritto con il solo URL. Idempotente — i record già migrati vengono
     saltati, quindi è sicura da rilanciare più volte (es. se interrotta a
     metà). */
  window.AdminActions.migrateImagesToCloudinary = function () {
    var btn      = document.getElementById('imgMigrationBtn');
    var statusEl = document.getElementById('imgMigrationStatus');
    var logEl    = document.getElementById('imgMigrationLog');
    if (btn) btn.disabled = true;
    statusEl.textContent = 'Analisi in corso…';
    statusEl.style.color = '';
    logEl.style.display = '';
    logEl.textContent = '';

    function log(msg) {
      logEl.textContent += msg + '\n';
      logEl.scrollTop = logEl.scrollHeight;
    }

    var jobs = [];

    VV.getArticles().forEach(function (a) {
      jobs.push({ label: 'Articolo — ' + a.title, run: function () {
        return Admin.cms.migrateFieldIfBase64(a.image, 'articles').then(function (url) {
          if (url === a.image) return false;
          a.image = url;
          return new Promise(function (resolve) { DB.saveArticle(a, function () { resolve(true); }); });
        });
      }});
    });

    VV.getPlayers().forEach(function (p) {
      jobs.push({ label: 'Giocatore — ' + p.name, run: function () {
        return Admin.cms.migrateFieldIfBase64(p.photo, 'players').then(function (url) {
          if (url === p.photo) return false;
          p.photo = url;
          return new Promise(function (resolve) { DB.savePlayer(p, function () { resolve(true); }); });
        });
      }});
    });

    VV.getStaff().forEach(function (s) {
      jobs.push({ label: 'Staff — ' + s.name, run: function () {
        return Admin.cms.migrateFieldIfBase64(s.photo, 'staff').then(function (url) {
          if (url === s.photo) return false;
          s.photo = url;
          return new Promise(function (resolve) { DB.saveStaffMember(s, function () { resolve(true); }); });
        });
      }});
    });

    VV.getPartite().forEach(function (m) {
      var label = 'Partita — ' + (m.squadra_casa || '?') + ' vs ' + (m.squadra_ospite || '?');
      jobs.push({ label: label + ' (logo casa)', run: function () {
        return Admin.cms.migrateFieldIfBase64(m.logo_casa, 'matches').then(function (url) {
          if (url === m.logo_casa) return false;
          m.logo_casa = url;
          return new Promise(function (resolve) { DB.savePartita(m, function () { resolve(true); }); });
        });
      }});
      jobs.push({ label: label + ' (logo ospite)', run: function () {
        return Admin.cms.migrateFieldIfBase64(m.logo_ospite, 'matches').then(function (url) {
          if (url === m.logo_ospite) return false;
          m.logo_ospite = url;
          return new Promise(function (resolve) { DB.savePartita(m, function () { resolve(true); }); });
        });
      }});
    });

    /* Sponsor: un unico documento con tutti i loghi in items[] — un solo
       salvataggio in coda dopo aver migrato ogni logo della lista. */
    var sponsorList = VV.getSponsors();
    jobs.push({ label: 'Sponsor (loghi)', run: function () {
      var changed = false;
      var chain = Promise.resolve();
      sponsorList.forEach(function (s) {
        chain = chain.then(function () {
          return Admin.cms.migrateFieldIfBase64(s.logo, 'sponsors').then(function (url) {
            if (url !== s.logo) { s.logo = url; changed = true; }
          });
        });
      });
      return chain.then(function () {
        if (!changed) return false;
        DB.saveSponsors(sponsorList);
        return true;
      });
    }});

    log('Trovati ' + jobs.length + ' elementi da controllare…');

    var migrated = 0, skipped = 0, failed = 0;

    jobs.reduce(function (chain, job) {
      return chain.then(function () {
        return job.run().then(function (didMigrate) {
          if (didMigrate) { migrated++; log('✓ migrato: ' + job.label); }
          else { skipped++; }
        }).catch(function (err) {
          failed++;
          log('✗ errore su ' + job.label + ': ' + (err && err.message || err));
        });
      });
    }, Promise.resolve()).then(function () {
      log('Fatto. Migrati: ' + migrated + ' · già a posto: ' + skipped + ' · errori: ' + failed);
      statusEl.textContent = migrated + ' migrati, ' + skipped + ' già ok, ' + failed + ' errori';
      statusEl.style.color = failed ? 'var(--a-red)' : 'var(--a-green)';
      if (btn) btn.disabled = false;
    });
  };


  /* ================================================
     INTERFACCIA CONDIVISA — window.Admin
     Helper usati anche dai file in js/admin/ (budget.js). Qui restano gli helper
     generici (audit log, modali, valore dei campi); lo stato del Budget si legge
     tramite Admin.budget.state, definito in js/admin/budget.js.
  ================================================ */
  var _auditLog = [];
  var _openModalId = null;
  function _mapDoc(d) { return Object.assign({ id: d.id }, d.data()); }

  /* ---- AUDIT LOG — usato anche da db.js (DB.setAuditHook) ---- */
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

  /* Campi di testo libero: nel log si traccia solo CHE sono stati modificati,
     mai il contenuto (prima/dopo non vengono nemmeno salvati). */
  var OPEN_FIELDS = ['note', 'contropartite', 'descrizione'];

  function _logWrite(entita, entitaId, entitaLabel, azione, changes) {
    if (!changes || !changes.length) return Promise.resolve();
    var ref = db.collection('auditLog').doc();
    var entry = {
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      dirigenteId: _uid,
      dirigenteNome: _dirigenteNome,
      entita: entita,
      entitaId: entitaId,
      entitaLabel: entitaLabel,
      azione: azione,
      campi: changes.map(function (ch) {
        if (OPEN_FIELDS.indexOf(ch.campo) !== -1 || (entita === 'atleta' && ((Admin.atleti && Admin.atleti.SENSIBILI) || []).indexOf(ch.campo) !== -1)) return { campo: ch.campo, aperto: true };
        return { campo: ch.campo, prima: ch.prima, dopo: ch.dopo };
      })
    };
    return ref.set(entry).then(function () {
      _auditLog.unshift(Object.assign({ id: ref.id }, entry, { timestamp: new Date() }));
      if (document.getElementById('sectionLog') && !document.getElementById('sectionLog').classList.contains('is-hidden')) Admin.budget.renderLog();
    }).catch(function (e) {
      /* il log non deve mai bloccare l'operazione principale, già salvata */
      console.error('[audit log]', e);
    });
  }

  /* ---- MODALI ---- */
  function _openBudgetModal(id) {
    _openModalId = id;
    document.getElementById('modalOverlay').classList.remove('is-hidden');
    document.getElementById(id).classList.remove('is-hidden');
  }
  function _closeBudgetModal(id) {
    _openModalId = null;
    document.getElementById('modalOverlay').classList.add('is-hidden');
    document.getElementById(id).classList.add('is-hidden');
  }

  function val(id) { return document.getElementById(id).value; }

  window.Admin = {
    uid: function () { return _uid; },
    dirigenteNome: function () { return _dirigenteNome; },
    esc: esc, cap: cap, confirm: confirm, goTo: goTo, val: val,
    mapDoc: _mapDoc, diff: _diff, logWrite: _logWrite,
    openModal: _openBudgetModal, closeModal: _closeBudgetModal,
    openModalId: function () { return _openModalId; },
    getAuditLog: function () { return _auditLog; },
    setAuditLog: function (v) { _auditLog = v; },
    daysDiff: _daysDiff, fmtDate: _fmtDate, fmtDateLong: _fmtDateLong,
    /* gli helper di Atleti sono definiti in js/admin/atleti.js: chiamata ritardata, perché il file si carica dopo */
    renderAtletiRows: function () { return Admin.atleti.renderRows.apply(null, arguments); },
    renderRateAdmin: function () { return Admin.atleti.renderRateAdmin.apply(null, arguments); },
    stagioneCorrenteNome: function () { return Admin.atleti.stagioneCorrenteNome.apply(null, arguments); },
    showSubview: showSubview, setTopbarBtn: setTopbarBtn,
    EDIT_ICON_SM: EDIT_ICON_SM, DEL_ICON_SM: DEL_ICON_SM
  };

})();
