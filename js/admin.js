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
    'sponsorizzazioni', 'tranchePagamento', 'vociSpesa', 'tessere', 'altreEntrate', 'settings', 'siteData',
    'accessi', 'allenamenti', 'atletiDati', 'comunicazioni', 'presenze',
    'ricevute', 'contatoriRicevute', 'firme', 'notifiche', 'promemoriaInviati'
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
    if (pwd.length < 10) {
      msg.textContent = 'La nuova password deve avere almeno 10 caratteri.';
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
    log: 'Log', budget: 'Budget & Forecast', ricevute: 'Ricevute'
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
    if (section === 'pianoEditoriale') Admin.pianoEditoriale.render();
    if (section === 'bacheca')    Admin.bacheca.render();
    if (section === 'galleria')   Admin.cms.renderGalleria();
    if (section === 'squadre')    Admin.cms.renderSquadre();
    if (section === 'sponsor')    Admin.cms.renderSponsor();
    if (section === 'atleti')     Admin.atleti.render();
    if (section === 'dirigenti')  renderDirigenti();
    if (section === 'datiJson')   renderDatiJson();
    if (section === 'log')        Admin.budget.renderLog();
    if (section === 'budget')     Admin.budget.renderActiveTab();
    if (section === 'ricevute')   Admin.ricevute.render();

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

    /* prossime partite: dalla più vicina in poi */
    var future = partite.filter(function (p) { return p.data >= today; })
      .sort(function (a, b) { return (a.data || '').localeCompare(b.data || ''); });

    document.getElementById('dashStats').innerHTML =
      _statCard('📰', articles.length, 'Articoli', '--blue') +
      _statCard('📅', partite.length, 'Partite', '--green') +
      _statCard('🖼️', albums.length, 'Album galleria', '--yellow') +
      _statCard('⚽', future.length, 'Prossime partite', '--red');

    /* ultimi articoli: dal più recente (1°) al meno recente (5°), come nell'elenco Articoli */
    var recenti = articles.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var artHtml = recenti.slice(0, 5).map(function (a) {
      return '<div class="dash-item"><span class="dash-item-title">' + esc(a.title) + '</span>' +
        '<span class="dash-item-meta">' + VV.formatDateShort(a.date) + '</span></div>';
    }).join('') || '<div class="dash-item"><span class="dash-item-meta">Nessun articolo</span></div>';

    var matchHtml = future.slice(0, 5).map(function (m) {
      return '<div class="dash-item"><span class="dash-item-title">' + esc(m.squadra_casa || '?') + ' vs ' + esc(m.squadra_ospite || '?') + '</span>' +
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
    if (pwd.length < 10) { alert('La password deve avere almeno 10 caratteri.'); return; }

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

    /* Partite: in lettura i loghi vengono sostituiti da quelli dell'elenco squadre del girone
       (VV.applyGironeLogos); il logo scritto sul documento è in logo_casa_orig / logo_ospite_orig.
       Si migra QUELLO e si salva la partita senza i campi derivati (_orig), così il documento
       resta com'è, solo con l'URL al posto del base64. */
    VV.getPartite().forEach(function (m) {
      var label = 'Partita — ' + (m.squadra_casa || '?') + ' vs ' + (m.squadra_ospite || '?');
      var casaOrig   = m.logo_casa_orig   !== undefined ? m.logo_casa_orig   : m.logo_casa;
      var ospiteOrig = m.logo_ospite_orig !== undefined ? m.logo_ospite_orig : m.logo_ospite;
      jobs.push({ label: label + ' (loghi)', run: function () {
        return Admin.cms.migrateFieldIfBase64(casaOrig, 'matches').then(function (casaUrl) {
          return Admin.cms.migrateFieldIfBase64(ospiteOrig, 'matches').then(function (ospiteUrl) {
            if (casaUrl === casaOrig && ospiteUrl === ospiteOrig) return false;
            var doc = Object.assign({}, m);
            doc.logo_casa = casaUrl;
            doc.logo_ospite = ospiteUrl;
            delete doc.logo_casa_orig;
            delete doc.logo_ospite_orig;
            return new Promise(function (resolve) { DB.savePartita(doc, function () { resolve(true); }); });
          });
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

  /* Banner in alto al posto di alert(): tipo 'ok' (verde, 6 s), 'avviso' (ambra, 12 s, predefinito) o 'errore'
     (rosso, 12 s). Si chiude con la × o toccandolo; i banner si impilano. Il testo va in textContent (niente HTML);
     gli «a capo» (\n) sono rispettati. */
  function avviso(testo, tipo) {
    tipo = (tipo === 'ok' || tipo === 'errore') ? tipo : 'avviso';
    var box = document.getElementById('avvisiBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'avvisiBox'; box.className = 'avvisi-box';
      document.body.appendChild(box);
    }
    var el = document.createElement('div');
    el.className = 'avviso avviso--' + tipo;
    el.setAttribute('role', tipo === 'errore' ? 'alert' : 'status');
    var t = document.createElement('span'); t.className = 'avviso-testo'; t.textContent = String(testo);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'avviso-x'; x.setAttribute('aria-label', 'Chiudi'); x.textContent = '×';
    el.appendChild(t); el.appendChild(x);
    var chiudi = function () { if (el.parentNode) el.parentNode.removeChild(el); };
    el.addEventListener('click', chiudi);
    box.appendChild(el);
    setTimeout(chiudi, tipo === 'ok' ? 6000 : 12000);
  }

  /* Tabelle compatte da telefono: ogni cella prende come etichetta l'intestazione della sua colonna
     (la usa il CSS sotto 700 px per mostrare le righe come schede). La cella con .table-title fa da titolo,
     quella con i pulsanti (.table-actions, senza intestazione) va in alto a destra. Si rifà a ogni
     ridisegno della tabella; le righe con colspan (gruppi, "nessun dato") non si toccano. */
  (function () {
    function etichetta(t) {
      var ths = [].map.call(t.querySelectorAll('thead th'), function (h) { return h.textContent.trim().split(/ +/).join(' ').split(' (')[0]; });
      [].forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
        var tds = [].slice.call(tr.children);
        if (!tds.length || tds.some(function (c) { return c.colSpan > 1; })) return;
        var titolo = tr.querySelector('.table-title');
        var tdTitolo = titolo ? titolo.closest('td') : tds[0];
        tds.forEach(function (td, i) {
          if (ths[i]) td.setAttribute('data-label', ths[i]);
          td.classList.toggle('is-titolo', td === tdTitolo);
          td.classList.toggle('is-azioni', !ths[i] && !!td.querySelector('.table-actions'));
        });
      });
    }
    function tutte() { [].forEach.call(document.querySelectorAll('.admin-table'), etichetta); }
    var inAttesa = false;
    function pianifica() { if (inAttesa) return; inAttesa = true; requestAnimationFrame(function () { inAttesa = false; tutte(); }); }
    new MutationObserver(pianifica).observe(document.body, { childList: true, subtree: true });
    tutte();
  })();

  window.Admin = {
    uid: function () { return _uid; },
    dirigenteNome: function () { return _dirigenteNome; },
    esc: esc, cap: cap, confirm: confirm, goTo: goTo, val: val, avviso: avviso,
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
