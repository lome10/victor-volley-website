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
    if (section === 'articoli')   renderArticoli();
    if (section === 'calendario') renderCalendario();
    if (section === 'allenamenti') renderAllenamenti();
    if (section === 'presenze')   renderPresenze();
    if (section === 'comunicazioni') renderComunicazioni();
    if (section === 'pianoEditoriale') renderPianoEditoriale();
    if (section === 'bacheca')    renderBacheca();
    if (section === 'galleria')   renderGalleria();
    if (section === 'squadre')    renderSquadre();
    if (section === 'sponsor')    renderSponsor();
    if (section === 'atleti')     renderAtleti();
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
    renderStagioni();
    renderMaglia();
  }

  function _statCard(icon, val, label, mod) {
    return '<div class="stat-card">' +
      '<div class="stat-icon stat-icon' + mod + '" style="font-size:22px">' + icon + '</div>' +
      '<div><div class="stat-value">' + val + '</div><div class="stat-label">' + label + '</div></div>' +
      '</div>';
  }

  /* ================================================
     ARTICOLI
  ================================================ */
  var _artEditing = null;

  function renderArticoli() {
    showSubview('articoli', 'list');
    setTopbarBtn('Nuovo articolo', function () { openArtForm(null); });
    var catsBtn = document.createElement('button');
    catsBtn.className = 'btn-ghost';
    catsBtn.textContent = 'Categorie articoli';
    catsBtn.addEventListener('click', _openArtCategoriesModal);
    document.getElementById('topbarActions').insertBefore(catsBtn, document.getElementById('topbarActions').firstChild);
    refreshArtTable();
  }

  function refreshArtTable() {
    var articles    = VV.getArticles().slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });
    var featCount   = articles.filter(function (a) { return a.featured; }).length;

    var hint = document.getElementById('artSliderHint');
    if (!hint) {
      hint = document.createElement('p');
      hint.id = 'artSliderHint';
      hint.style.cssText = 'font-size:12px;color:var(--a-muted);margin-bottom:12px';
      var list = document.getElementById('articoliList');
      list.insertBefore(hint, list.firstChild);
    }
    hint.textContent = 'Slider homepage: assegna la posizione 1, 2 o 3 agli articoli da mostrare. I conflitti vengono risolti automaticamente.';

    var rows = articles.map(function (a) {
      var starTitle = a.featured ? 'Rimuovi dallo slider' : (featCount >= 3 ? 'Limite raggiunto (max 3)' : 'Aggiungi allo slider');
      var cats = VV.getArticleCategories(a);
      var catsChips = cats.map(function (c) { return '<span class="chip chip--blue">' + esc(c) + '</span>'; }).join(' ');
      return '<tr>' +
        '<td><div class="table-title">' + esc(a.title) + '</div><div class="table-sub">' + esc(cats.join(', ')) + '</div></td>' +
        '<td>' + catsChips + '</td>' +
        '<td>' + VV.formatDateShort(a.date) + '</td>' +
        '<td>' + (a.published ? '<span class="chip chip--green">Pubblicato</span>' : '<span class="chip chip--gray">Bozza</span>') + '</td>' +
        '<td style="text-align:center">' +
          '<select onchange="AdminActions.setHeroOrder(' + a.id + ', +this.value)" title="Posizione nello slider homepage" style="font-size:12px;padding:3px 6px;border-radius:4px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;color:#0f172a">' +
            '<option value="0"' + (!a.heroOrder ? ' selected' : '') + '>&mdash;</option>' +
            [1,2,3].map(function(n){ return '<option value="' + n + '"' + (a.heroOrder === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
          '</select>' +
        '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.editArt(' + a.id + ')" title="Modifica"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteArt(' + a.id + ')" title="Elimina"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    document.getElementById('articoliBody').innerHTML = rows ||
      '<tr><td colspan="6"><div class="empty-state"><p>Nessun articolo ancora. Crea il primo!</p></div></td></tr>';
  }

  function _renderArtCategoriesCheckboxes(selected) {
    var box = document.getElementById('artCategoriesBox');
    var cats = VV.getCategorieArticoli();
    /* Categorie assegnate all'articolo ma non più nell'elenco gestito: le mostriamo comunque per non perderle al salvataggio */
    selected.forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
    box.innerHTML = cats.map(function (c, i) {
      var checked = selected.indexOf(c) >= 0;
      return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 12px;border:1px solid #e2e8f0;border-radius:20px;cursor:pointer;user-select:none">' +
        '<input type="checkbox" class="artCategoryCheck" value="' + esc(c) + '"' + (checked ? ' checked' : '') + '>' +
        esc(c) +
      '</label>';
    }).join('') || '<p style="font-size:13px;color:#94a3b8">Nessuna categoria disponibile. Creane una da "Categorie articoli".</p>';

    box.querySelectorAll('.artCategoryCheck').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var checked = box.querySelectorAll('.artCategoryCheck:checked');
        if (checked.length > 2) { cb.checked = false; alert('Puoi selezionare al massimo 2 categorie per articolo.'); }
      });
    });
  }

  function _renderArtSponsorSelects(selected) {
    var sponsors = VV.getSponsors().filter(function (s) { return !!s.logo; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var options = '<option value="">— Nessuno —</option>' +
      sponsors.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nome) + '</option>'; }).join('');
    ['artSponsor1', 'artSponsor2', 'artSponsor3'].forEach(function (selId, i) {
      var sel = document.getElementById(selId);
      sel.innerHTML = options;
      sel.value = selected[i] != null ? String(selected[i]) : '';
    });
  }

  function openArtForm(article) {
    _artEditing = article;
    showSubview('articoli', 'form');
    document.getElementById('topbarActions').innerHTML = '';
    _initArtFocusInputs();
    _initArtRTE();

    _renderArtCategoriesCheckboxes(article ? VV.getArticleCategories(article) : []);
    _renderArtSponsorSelects(article && Array.isArray(article.sponsor_ids) ? article.sponsor_ids : []);

    if (article) {
      document.getElementById('artTitle').value      = article.title || '';
      document.getElementById('artDate').value        = article.date || '';
      document.getElementById('artImage').value       = article.image || '';
      document.getElementById('artPhotoFocus').value  = article.imageFocus || '';
      _setArtCoverRatio(article.coverRatio || '4:5');
      document.getElementById('artExcerpt').value     = article.excerpt || '';
      _setArtContent(article.content || '');
      document.getElementById('artPublished').checked = !!article.published;
      _setArtPreview(article.image || null, article.image ? 'Immagine salvata' : '');
      if (article.image) _showArtFocusPicker(article.image, article.imageFocus || '');
      else                _hideArtFocusPicker();
    } else {
      document.getElementById('artTitle').value      = '';
      document.getElementById('artDate').value        = new Date().toISOString().slice(0, 10);
      document.getElementById('artImage').value       = '';
      document.getElementById('artPhotoFocus').value  = '';
      _setArtCoverRatio('4:5');
      document.getElementById('artExcerpt').value     = '';
      _setArtContent('');
      document.getElementById('artPublished').checked = true;
      _setArtPreview(null);
      _hideArtFocusPicker();
    }
  }

  document.getElementById('artSave').addEventListener('click', function () {
    var title = document.getElementById('artTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var categories = Array.prototype.map.call(
      document.querySelectorAll('#artCategoriesBox .artCategoryCheck:checked'),
      function (cb) { return cb.value; }
    );
    if (!categories.length) { alert('Seleziona almeno una categoria.'); return; }
    var sponsorIds = ['artSponsor1', 'artSponsor2', 'artSponsor3']
      .map(function (selId) { return document.getElementById(selId).value; })
      .filter(function (v) { return v !== ''; })
      .map(function (v) { return +v; })
      .filter(function (id, i, arr) { return arr.indexOf(id) === i; }); /* niente duplicati */
    var article = Object.assign({}, _artEditing || {}, {
      title:       title,
      categories:  categories,
      category:    categories[0],
      sponsor_ids: sponsorIds,
      date:       document.getElementById('artDate').value,
      image:      document.getElementById('artImage').value.trim(),
      imageFocus: document.getElementById('artPhotoFocus').value.trim() || null,
      coverRatio: (document.querySelector('input[name="artCoverRatio"]:checked') || {}).value || '4:5',
      excerpt:    document.getElementById('artExcerpt').value.trim(),
      content:    document.getElementById('artContent').value.trim(),
      published:  document.getElementById('artPublished').checked
    });
    DB.saveArticle(article, renderArticoli);
  });

  /* ---- Categorie articoli (gestione) ---- */
  function _renderArtCategoriesModalList() {
    var cats = VV.getCategorieArticoli();
    var list = document.getElementById('artCategoriesModalList');
    list.innerHTML = cats.length ? cats.map(function (c, i) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<span>' + esc(c) + '</span>' +
        '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteCategoriaArticolo(' + i + ')" title="Elimina">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
        '</button>' +
      '</div>';
    }).join('') : '<p style="font-size:13px;color:#94a3b8">Nessuna categoria ancora.</p>';
  }

  function _openArtCategoriesModal() {
    _renderArtCategoriesModalList();
    document.getElementById('artCategoriesNewInput').value = '';
    _openBudgetModal('artCategoriesModal');
  }

  document.getElementById('artCategoriesAddBtn').addEventListener('click', function () {
    var input = document.getElementById('artCategoriesNewInput');
    var name  = input.value.trim();
    if (!name) return;
    var cats = VV.getCategorieArticoli();
    if (cats.indexOf(name) >= 0) { alert('Categoria già esistente.'); return; }
    cats = cats.concat([name]);
    DB.saveCategorieArticoli(cats, function () {
      input.value = '';
      _renderArtCategoriesModalList();
    });
  });
  document.getElementById('artCategoriesModalClose').addEventListener('click', function () { _closeBudgetModal('artCategoriesModal'); });
  document.getElementById('artCategoriesModalDone').addEventListener('click', function () { _closeBudgetModal('artCategoriesModal'); });

  document.getElementById('artCancel').addEventListener('click', renderArticoli);

  /* ================================================
     CALENDARIO — collection Firestore "partite" (via DB/VV)
  ================================================ */
  var _matchEditing = null;

  function renderCalendario() {
    showSubview('calendario', 'list');
    setTopbarBtn('Aggiungi partita', function () { openMatchForm(null); });
    refreshMatchTable();
  }

  var EDIT_ICON_SM  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var DEL_ICON_SM   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';

  function _matchRow(p) {
    var hasScore  = p.stato === 'conclusa' && p.set_casa != null && p.set_ospite != null;
    var casaWins  = hasScore && +p.set_casa > +p.set_ospite;
    var result    = hasScore
      ? '<strong>' + p.set_casa + '&ndash;' + p.set_ospite + '</strong>'
      : '<span style="color:var(--a-muted)">—</span>';
    var nomeCasa   = esc(p.squadra_casa || '');
    var nomeOspite = esc(p.squadra_ospite || '');
    return '<tr>' +
      '<td style="white-space:nowrap">' + _fmtDate(p.data) + '</td>' +
      '<td>' + esc(p.ora || '—') + '</td>' +
      '<td><span class="chip chip--blue">' + esc(p.categoria || '') + '</span></td>' +
      '<td>' +
        (p.logo_casa ? '<img src="' + esc(p.logo_casa) + '" style="height:20px;display:inline;vertical-align:middle;margin-right:4px">' : '') +
        (hasScore && casaWins ? '<strong>' + nomeCasa + '</strong>' : nomeCasa) + ' vs ' +
        (p.logo_ospite ? '<img src="' + esc(p.logo_ospite) + '" style="height:20px;display:inline;vertical-align:middle;margin-right:4px">' : '') +
        (hasScore && !casaWins ? '<strong>' + nomeOspite + '</strong>' : nomeOspite) +
      '</td>' +
      '<td style="font-size:12px;color:var(--a-muted)">' + esc(p.palazzetto || '—') + '</td>' +
      '<td>' + result + '</td>' +
      '<td><div class="table-actions">' +
        '<button class="btn-icon" onclick="AdminActions.editMatch(\'' + esc(p.id) + '\')" title="Modifica">' + EDIT_ICON_SM + '</button>' +
        '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteMatch(\'' + esc(p.id) + '\')" title="Elimina">' + DEL_ICON_SM + '</button>' +
      '</div></td>' +
    '</tr>';
  }

  function refreshMatchTable() {
    var sorted        = VV.getPartite().sort(function (a, b) { return a.data > b.data ? 1 : -1; });
    var currentSeason  = VV.getCurrentSeason();
    var currentId      = currentSeason && currentSeason.id;
    var seasonName     = {};
    VV.getSeasons().forEach(function (s) { seasonName[s.id] = s.name || s.id; });

    var groups = {};
    var order  = [];
    sorted.forEach(function (p) {
      var sid = p.stagione || currentId || '2025/2026';
      if (!groups[sid]) { groups[sid] = []; order.push(sid); }
      groups[sid].push(p);
    });

    /* La stagione corrente viene mostrata per prima, le altre a seguire in ordine decrescente. */
    order.sort(function (a, b) {
      if (a === currentId) return -1;
      if (b === currentId) return 1;
      return a < b ? 1 : (a > b ? -1 : 0);
    });

    var rows = order.map(function (sid) {
      var isCurrent = sid === currentId;
      var label     = seasonName[sid] || sid;
      var header    = '<tr class="admin-table-group-row"><td colspan="7">' +
        '<span class="admin-table-group-label">' + esc(label) + '</span>' +
        (isCurrent ? '<span class="chip chip--green" style="font-size:11px;margin-left:8px">Corrente</span>' : '') +
      '</td></tr>';
      return header + groups[sid].map(_matchRow).join('');
    }).join('');

    document.getElementById('calendarioBody').innerHTML = rows ||
      '<tr><td colspan="7"><div class="empty-state"><p>Nessuna partita. Aggiungine una!</p></div></td></tr>';
  }

  function openMatchForm(p) {
    _initLogoInputs();
    _matchEditing = p || null;
    showSubview('calendario', 'form');
    document.getElementById('topbarActions').innerHTML = '';

    var catSel = document.getElementById('matchCategory');
    catSel.innerHTML = VV.CATEGORIES.filter(function (c) { return c !== 'Società'; }).map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    if (p) {
      document.getElementById('matchDate').value     = p.data || '';
      document.getElementById('matchTime').value     = p.ora  || '18:30';
      catSel.value                                   = p.categoria || 'Prima Divisione';
      document.getElementById('matchHomeTeam').value = p.squadra_casa   || '';
      document.getElementById('matchHomeLogo').value = p.logo_casa     || '';
      document.getElementById('matchAwayTeam').value = p.squadra_ospite || '';
      document.getElementById('matchAwayLogo').value = p.logo_ospite   || '';
      _syncLogoPreview('matchHomeLogo', 'homeLogoPreview');
      _syncLogoPreview('matchAwayLogo', 'awayLogoPreview');
      document.getElementById('matchVenue').value    = p.palazzetto || '';
      document.getElementById('matchStato').value    = p.stato || 'programmata';
      document.getElementById('matchSetCasa').value    = (p.set_casa   != null) ? p.set_casa   : '';
      document.getElementById('matchSetOspite').value  = (p.set_ospite != null) ? p.set_ospite : '';
      document.getElementById('matchSppCode').value    = p.spp_code || '';
    } else {
      document.getElementById('matchDate').value     = '';
      document.getElementById('matchTime').value     = '18:30';
      catSel.value                                   = 'Prima Divisione';
      document.getElementById('matchHomeTeam').value = '';
      document.getElementById('matchHomeLogo').value = '';
      document.getElementById('matchAwayTeam').value = '';
      document.getElementById('matchAwayLogo').value = '';
      _syncLogoPreview('matchHomeLogo', 'homeLogoPreview');
      _syncLogoPreview('matchAwayLogo', 'awayLogoPreview');
      document.getElementById('matchVenue').value      = 'Palazzetto ARKÉ — Melissano';
      document.getElementById('matchStato').value      = 'programmata';
      document.getElementById('matchSetCasa').value    = '';
      document.getElementById('matchSetOspite').value  = '';
      document.getElementById('matchSppCode').value    = '';
    }
    AdminActions.toggleResultFields();
  }

  document.getElementById('matchSave').addEventListener('click', function () {
    var data = document.getElementById('matchDate').value;
    if (!data) { alert('La data è obbligatoria.'); return; }
    var squadraCasa   = document.getElementById('matchHomeTeam').value.trim();
    var squadraOspite = document.getElementById('matchAwayTeam').value.trim();
    if (!squadraCasa)   { alert('La squadra di casa è obbligatoria.'); return; }
    if (!squadraOspite) { alert('La squadra ospite è obbligatoria.'); return; }
    var logoCasa   = document.getElementById('matchHomeLogo').value.trim();
    var logoOspite = document.getElementById('matchAwayLogo').value.trim();
    var stato     = document.getElementById('matchStato').value;
    var setC      = document.getElementById('matchSetCasa').value;
    var setO      = document.getElementById('matchSetOspite').value;
    var sppCode   = document.getElementById('matchSppCode').value.trim();

    var partita = {
      id:            (_matchEditing && _matchEditing.id) || ('m' + Date.now()),
      stagione:      (_matchEditing && _matchEditing.stagione) || (VV.getCurrentSeason() || {}).id || '2025/2026',
      categoria:     document.getElementById('matchCategory').value,
      squadra_casa:   squadraCasa,
      squadra_ospite: squadraOspite,
      logo_casa:      logoCasa,
      logo_ospite:    logoOspite,
      data:          data,
      ora:           document.getElementById('matchTime').value,
      palazzetto:    document.getElementById('matchVenue').value.trim(),
      stato:         stato,
      set_casa:      (stato === 'conclusa' && setC !== '') ? +setC : null,
      set_ospite:    (stato === 'conclusa' && setO !== '') ? +setO : null,
      spp_code:      sppCode || null
    };

    /* Mantieni campi live (codice_tabellone ecc.) se esistenti */
    if (_matchEditing) {
      ['codice_tabellone', 'tabellone_squadra_casa'].forEach(function (k) {
        if (_matchEditing[k] != null) partita[k] = _matchEditing[k];
      });
    }

    DB.savePartita(partita, renderCalendario);
  });

  document.getElementById('matchCancel').addEventListener('click', renderCalendario);

  /* ================================================
     GALLERIA
  ================================================ */
  var _currentAlbumId = null;
  var _albumEditingId = null;   /* id dell'album in modifica; null = nuovo album */
  var _albumSlugTouched = false; /* true se lo slug è stato scritto/modificato a mano */

  /* Eliminare una foto/album qui toglie solo il collegamento (Firestore): il file
     resta su Cloudinary, perché cancellarlo davvero richiede la API Secret, che non
     può stare nel codice del browser. Un aiuto manuale: copia gli id negli appunti
     e apre la Media Library, dove si cancellano in due click cercandoli per nome. */
  function _notifyCloudinaryOrphans(ids) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;
    var list = ids.join(', ');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(list).catch(function () {});
    }
    var shown = ids.slice(0, 15).join('\n') + (ids.length > 15 ? '\n… e altre ' + (ids.length - 15) : '');
    alert(
      (ids.length === 1 ? 'Il file è rimasto su Cloudinary.' : 'I ' + ids.length + ' file sono rimasti su Cloudinary.') +
      ' Per cancellarli: apri la Media Library (si sta aprendo in una nuova scheda), incolla ' +
      (ids.length === 1 ? 'l\'id' : 'gli id (già copiati negli appunti)') + ' nella ricerca ed elimina.\n\n' + shown
    );
    window.open('https://console.cloudinary.com/console/media_library', '_blank', 'noopener');
  }

  function updateAlbumSlugHint() {
    var slug = document.getElementById('albumSlug').value.trim();
    document.getElementById('albumSlugHint').textContent =
      'Pagina pubblica: /galleria/' + (slug || '…') + (_albumEditingId !== null ? ' — cambiarlo dopo la pubblicazione rompe i link già condivisi.' : '');
  }
  document.getElementById('albumTitle').addEventListener('input', function () {
    if (_albumSlugTouched) return;
    document.getElementById('albumSlug').value = this.value.trim() ? VV.slugify(this.value) : '';
    updateAlbumSlugHint();
  });
  document.getElementById('albumSlug').addEventListener('input', function () {
    _albumSlugTouched = true;
    /* Solo minuscole, numeri e trattini: gli spazi diventano trattini mentre scrivi. */
    var pos = this.selectionStart;
    var clean = this.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (clean !== this.value) { this.value = clean; try { this.setSelectionRange(pos, pos); } catch (e) {} }
    updateAlbumSlugHint();
  });

  /* Apre il modulo album: vuoto per un nuovo album, precompilato per modificarne uno esistente. */
  function openAlbumForm(album) {
    _albumEditingId = album ? album.id : null;
    var catSel = document.getElementById('albumCategory');
    /* Se la categoria dell'album non è più nell'elenco, la mantengo comunque selezionabile. */
    if (album && album.category && !Array.prototype.some.call(catSel.options, function (o) { return o.value === album.category; })) {
      catSel.insertAdjacentHTML('beforeend', '<option value="' + esc(album.category) + '">' + esc(album.category) + '</option>');
    }
    document.getElementById('albumTitle').value = album ? album.title || '' : '';
    /* Slug: nuovo album → si genera dal titolo finché non lo tocchi; album esistente → resta quello (anche se ricavato). */
    _albumSlugTouched = !!album;
    document.getElementById('albumSlug').value = album ? VV.getAlbumSlug(album) : '';
    updateAlbumSlugHint();
    document.getElementById('albumDate').value  = album ? album.date  || '' : '';
    if (album && album.category) catSel.value = album.category; else catSel.selectedIndex = 0;
    document.getElementById('albumSave').textContent = album ? 'Salva modifiche' : 'Crea album';
    showSubview('galleria', 'form');
    document.getElementById('topbarActions').innerHTML = '';
  }

  function renderGalleria() {
    showSubview('galleria', 'list');
    setTopbarBtn('Nuovo album', function () { openAlbumForm(null); });

    /* Aggiorna la select categorie con i dati Firestore attuali */
    var catSel = document.getElementById('albumCategory');
    catSel.innerHTML = VV.CATEGORIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    refreshAlbumsGrid();
  }

  function refreshAlbumsGrid() {
    var albums = VV.getAlbums();
    var grid   = document.getElementById('albumsGrid');

    if (!albums.length) {
      grid.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg><p>Nessun album ancora. Crea il primo!</p></div>';
      return;
    }

    var albumIds = albums.map(function (a) { return a.id; });
    PhotoDB.getCovers(albumIds, function (covers) {
      grid.innerHTML = albums.map(function (album) {
        var thumb = covers[album.id]
          ? '<img src="' + covers[album.id] + '" alt="">'
          : '<div class="album-thumb-placeholder">🖼️</div>';
        return '<div class="album-card" data-id="' + album.id + '">' +
          '<div class="album-thumb">' + thumb + '</div>' +
          '<div class="album-info">' +
            '<div class="album-title">' + esc(album.title) + '</div>' +
            '<div class="album-meta">' + VV.formatDateShort(album.date) + ' · ' + esc(album.category) + '</div>' +
            '<div class="album-footer">' +
              '<span class="chip chip--blue">' + (album.photoCount || 0) + ' foto</span>' +
              '<button class="btn-icon btn-icon--danger" onclick="event.stopPropagation();AdminActions.deleteAlbum(' + album.id + ')" title="Elimina album">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      grid.querySelectorAll('.album-card').forEach(function (card) {
        card.addEventListener('click', function () {
          openAlbum(+card.dataset.id);
        });
      });
    });
  }

  function openAlbum(albumId) {
    _currentAlbumId = albumId;
    var album = VV.getAlbum(albumId);
    showSubview('galleria', 'photos');

    document.getElementById('photosAlbumTitle').textContent = album ? album.title : '';

    var backBtn = document.createElement('button');
    backBtn.className = 'btn-ghost';
    backBtn.textContent = '← Tutti gli album';
    backBtn.addEventListener('click', renderGalleria);
    var editBtn = document.createElement('button');
    editBtn.className = 'btn-ghost';
    editBtn.textContent = 'Modifica album';
    editBtn.addEventListener('click', function () { openAlbumForm(VV.getAlbum(albumId)); });
    var actions = document.getElementById('topbarActions');
    actions.innerHTML = '';
    actions.appendChild(backBtn);
    actions.appendChild(editBtn);

    loadPhotos(albumId);
  }

  function loadPhotos(albumId) {
    PhotoDB.getPhotos(albumId, function (photos) {
      var grid = document.getElementById('photosGrid');
      if (!photos.length) {
        grid.innerHTML = '<div class="empty-state"><p>Nessuna foto ancora. Carica le prime!</p></div>';
        return;
      }
      grid.innerHTML = photos.map(function (p) {
        return '<div class="photo-item">' +
          '<img src="' + p.thumb + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' +
          '<div class="photo-item-overlay">' +
            '<button class="photo-delete" data-pid="' + esc(p.id) + '" onclick="AdminActions.deletePhoto(this.dataset.pid)">Elimina</button>' +
          '</div>' +
        '</div>';
      }).join('');
    });
  }

  document.getElementById('photoUpload').addEventListener('change', function () {
    var files = this.files;
    if (!files || !files.length || _currentAlbumId === null) return;

    var progress  = document.getElementById('uploadProgress');
    var bar       = document.getElementById('uploadBarFill');
    var text      = document.getElementById('uploadProgressText');
    progress.classList.remove('is-hidden');
    bar.style.transform = 'scaleX(0)';

    if (!PhotoDB.isConfigured()) {
      progress.classList.add('is-hidden');
      alert('Cloudinary non è ancora configurato: imposta CLOUDINARY_CLOUD in js/config.js.');
      this.value = '';
      return;
    }

    var input = this;
    PhotoDB.addPhotos(_currentAlbumId, files,
      function (done, total) {
        var pct = Math.round(done / total * 100);
        bar.style.transform = 'scaleX(' + (pct / 100) + ')';
        text.textContent = done + ' / ' + total + ' foto caricate';
      },
      function (count, failed) {
        setTimeout(function () { progress.classList.add('is-hidden'); }, 800);
        loadPhotos(_currentAlbumId);
        input.value = '';
        if (failed && failed.length) {
          alert(failed.length + ' foto non caricate (' + count + ' ok):\n' + failed.slice(0, 15).join('\n') +
            (failed.length > 15 ? '\n…' : '') + '\n\nRiprova a caricare solo queste.');
        }
      }
    );
  });

  document.getElementById('albumSave').addEventListener('click', function () {
    var title = document.getElementById('albumTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var slug = document.getElementById('albumSlug').value.trim().replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') || VV.slugify(title);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { alert('Lo slug può contenere solo lettere minuscole, numeri e trattini.'); return; }
    var clash = VV.getAlbums().some(function (o) { return o.id !== _albumEditingId && VV.getAlbumSlug(o) === slug; });
    if (clash) { alert('Esiste già un album con questo indirizzo: "' + slug + '". Scegline un altro.'); return; }
    var fields = {
      title:    title,
      slug:     slug,
      date:     document.getElementById('albumDate').value,
      category: document.getElementById('albumCategory').value
    };
    /* In modifica si aggiornano solo questi campi: id, foto e conteggio restano quelli dell'album. */
    var existing = _albumEditingId !== null ? VV.getAlbum(_albumEditingId) : null;
    var album = existing ? Object.assign({}, existing, fields) : Object.assign({ photoCount: 0 }, fields);
    var saved = DB.saveAlbum(album);
    _albumEditingId = null;
    openAlbum(saved.id);
  });

  document.getElementById('albumCancel').addEventListener('click', function () {
    var editing = _albumEditingId;
    _albumEditingId = null;
    if (editing !== null && VV.getAlbum(editing)) openAlbum(editing); else renderGalleria();
  });

  /* ================================================
     UPLOAD IMMAGINI SU CLOUDINARY — copertine articoli, foto
     giocatori/staff, loghi sponsor e squadre. Stesso account/preset
     unsigned già usato dalla galleria (js/photodb.js): il campo salvato
     su Firestore resta un URL, mai più una stringa base64 inline.
  ================================================ */
  var IMG_UPLOAD_RETRIES = 2;

  function _uploadImage(blob, folder, ext, cb) {
    var fileName = folder + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9) + '.' + ext;
    function attempt(n) {
      var fd = new FormData();
      fd.append('file', blob, fileName);
      fd.append('upload_preset', window.CLOUDINARY_PRESET);
      fetch('https://api.cloudinary.com/v1_1/' + window.CLOUDINARY_CLOUD + '/image/upload', { method: 'POST', body: fd })
        .then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + res.status));
            return j;
          });
        })
        .then(function (j) { cb(null, j.secure_url); })
        .catch(function (err) {
          if (n >= IMG_UPLOAD_RETRIES) { cb(err); return; }
          setTimeout(function () { attempt(n + 1); }, 800 * (n + 1));
        });
    }
    attempt(0);
  }

  /* Migra un singolo campo immagine se contiene ancora una data URL base64:
     lo carica su Cloudinary e risolve con il nuovo URL. Se il campo è già un
     URL vero (o vuoto) lo restituisce invariato — rende la migrazione
     idempotente, sicura da rilanciare più volte. */
  function _migrateFieldIfBase64(value, folder) {
    if (!value || value.indexOf('data:') !== 0) return Promise.resolve(value);
    return fetch(value).then(function (r) { return r.blob(); }).then(function (blob) {
      var ext = blob.type === 'image/png' ? 'png' : 'jpg';
      return new Promise(function (resolve, reject) {
        _uploadImage(blob, folder, ext, function (err, url) {
          if (err) reject(err); else resolve(url);
        });
      });
    });
  }

  /* ================================================
     IMMAGINE COPERTINA ARTICOLO — resize
     Mostrata come card (home) o dentro una colonna da
     ~500-600px (dettaglio articolo): mai a piena pagina,
     quindi non serve conservarla a risoluzione Full HD.
  ================================================ */

  function resizeToFullHD(file, cb) {
    var MAX_W = 1200, MAX_H = 675;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_W / w, MAX_H / h);
        var outW = Math.round(w * scale), outH = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        canvas.getContext('2d').drawImage(img, 0, 0, outW, outH);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        canvas.toBlob(function (blob) { cb(dataUrl, outW, outH, blob); }, 'image/jpeg', 0.78);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function _setArtPreview(src, info) {
    var wrap   = document.getElementById('artImagePreview');
    var imgEl  = document.getElementById('artImagePreviewImg');
    var infoEl = document.getElementById('artImagePreviewInfo');
    if (src) {
      imgEl.src = src;
      wrap.style.display = '';
    } else {
      wrap.style.display = 'none';
      imgEl.src = '';
    }
    if (infoEl) infoEl.textContent = info || '';
  }

  function _setArtCoverRatio(ratio) {
    document.querySelectorAll('input[name="artCoverRatio"]').forEach(function (r) {
      r.checked = (r.value === ratio);
    });
  }

  /* ---- Editor HTML per il contenuto articolo ---- */
  function _setArtContent(html) {
    document.getElementById('artContent').value = html || '';
    document.getElementById('artContentEditor').innerHTML = html || '';
    document.getElementById('artContentEditor').style.display = '';
    document.getElementById('artContent').style.display = 'none';
  }

  var _artRTEReady = false;
  function _initArtRTE() {
    if (_artRTEReady) return;
    _artRTEReady = true;
    var editor   = document.getElementById('artContentEditor');
    var textarea = document.getElementById('artContent');
    editor.setAttribute('data-placeholder', "Scrivi il testo dell'articolo…");

    document.querySelectorAll('#artContentToolbar .rte-btn[data-cmd]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editor.focus();
        document.execCommand(btn.getAttribute('data-cmd'), false, null);
        textarea.value = editor.innerHTML;
      });
    });
    document.querySelectorAll('#artContentToolbar .rte-btn[data-block]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editor.focus();
        document.execCommand('formatBlock', false, btn.getAttribute('data-block'));
        textarea.value = editor.innerHTML;
      });
    });
    document.getElementById('artContentLinkBtn').addEventListener('click', function () {
      var url = prompt('URL del link:', 'https://');
      if (!url) return;
      editor.focus();
      document.execCommand('createLink', false, url);
      textarea.value = editor.innerHTML;
    });
    editor.addEventListener('input', function () { textarea.value = editor.innerHTML; });

    document.getElementById('artContentSourceToggle').addEventListener('click', function () {
      var isSource = textarea.style.display !== 'none';
      if (isSource) {
        editor.innerHTML = textarea.value;
        editor.style.display   = '';
        textarea.style.display = 'none';
      } else {
        textarea.value = editor.innerHTML;
        textarea.style.display = '';
        editor.style.display   = 'none';
      }
    });
  }

  /* ---- Focal point picker per l'immagine di copertina articolo ---- */
  function _artApplyFocus(focus) {
    var pos = focus || '';
    var previewImg = document.getElementById('artImagePreviewImg');
    var focusImg   = document.getElementById('artFocusImg');
    if (previewImg) previewImg.style.objectPosition = pos;
    if (focusImg)   focusImg.style.objectPosition    = pos;
  }

  function _showArtFocusPicker(src, focus) {
    document.getElementById('artFocusPicker').style.display = '';
    document.getElementById('artFocusImg').src = src;
    var parts = (focus || '').match(/(\d+(?:\.\d+)?)%\s*(\d+(?:\.\d+)?)%/);
    var x = parts ? +parts[1] : 50;
    var y = parts ? +parts[2] : 50;
    _artApplyFocus(focus || '');
    _updateFocusDot('art', x, y);
  }

  function _hideArtFocusPicker() {
    document.getElementById('artFocusPicker').style.display = 'none';
  }

  var _artFocusInputsReady = false;
  function _initArtFocusInputs() {
    if (_artFocusInputsReady) return;
    _artFocusInputsReady = true;
    document.getElementById('artFocusWrap').addEventListener('click', function (e) {
      var rect = this.getBoundingClientRect();
      var x = Math.max(0, Math.min(100, Math.round((e.clientX - rect.left) / rect.width  * 100)));
      var y = Math.max(0, Math.min(100, Math.round((e.clientY - rect.top)  / rect.height * 100)));
      var focus = x + '% ' + y + '%';
      document.getElementById('artPhotoFocus').value = focus;
      _artApplyFocus(focus);
      _updateFocusDot('art', x, y);
    });
    document.getElementById('artImage').addEventListener('input', function () {
      var val = this.value.trim();
      if (val) _showArtFocusPicker(val, document.getElementById('artPhotoFocus').value);
      else      _hideArtFocusPicker();
    });
  }

  document.getElementById('artImageFile').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    document.getElementById('artImagePreviewInfo').textContent = 'Ridimensionamento in corso…';
    document.getElementById('artImagePreview').style.display = '';
    resizeToFullHD(file, function (dataUrl, w, h, blob) {
      document.getElementById('artImage').value = '';
      document.getElementById('artPhotoFocus').value = '';
      _setArtPreview(dataUrl, w + ' × ' + h + ' px · caricamento…');
      _showArtFocusPicker(dataUrl, '');
      var saveBtn = document.getElementById('artSave');
      saveBtn.disabled = true;
      _uploadImage(blob, 'articles', 'jpg', function (err, url) {
        saveBtn.disabled = false;
        if (err) {
          console.error('[admin] upload copertina articolo', err);
          _setArtPreview(dataUrl, w + ' × ' + h + ' px · ⚠ errore caricamento, riprova');
          return;
        }
        document.getElementById('artImage').value = url;
        var kb = Math.round(blob.size / 1024);
        var info = w + ' × ' + h + ' px · ~' + kb + ' KB';
        if (kb > 750) info += '  ⚠ file grande';
        _setArtPreview(dataUrl, info);
      });
    });
    this.value = '';
  });

  document.getElementById('artImageClear').addEventListener('click', function () {
    document.getElementById('artImage').value = '';
    document.getElementById('artPhotoFocus').value = '';
    _setArtPreview(null);
    _hideArtFocusPicker();
  });

  /* ================================================
     LOGO UPLOAD INTEGRATO NEL FORM PARTITA
  ================================================ */

  /* Flood fill dai bordi: rimuove solo il bianco esterno al logo */
  function _removeWhiteBg(ctx, w, h) {
    var data    = ctx.getImageData(0, 0, w, h);
    var px      = data.data;
    var visited = new Uint8Array(w * h);
    var queue   = [];
    var THR     = 225; /* luminosità minima */
    var MAXDIFF = 20;  /* differenza massima tra canali: cattura anche bianchi "sporchi"/leggermente colorati */

    for (var x = 0; x < w; x++) { queue.push(x, 0); queue.push(x, h - 1); }
    for (var y = 1; y < h - 1; y++) { queue.push(0, y); queue.push(w - 1, y); }

    var i = 0;
    while (i < queue.length) {
      var qx = queue[i++], qy = queue[i++];
      if (qx < 0 || qx >= w || qy < 0 || qy >= h) continue;
      var idx = qy * w + qx;
      if (visited[idx]) continue;
      visited[idx] = 1;
      var pi = idx * 4;
      var r = px[pi], g = px[pi + 1], b = px[pi + 2];
      var minC = Math.min(r, g, b), maxC = Math.max(r, g, b);
      var isWhitish = minC >= THR && (maxC - minC) <= MAXDIFF;
      var isTransparent = px[pi + 3] < 10;
      if (isWhitish || isTransparent) {
        px[pi + 3] = 0;
        queue.push(qx - 1, qy); queue.push(qx + 1, qy);
        queue.push(qx, qy - 1); queue.push(qx, qy + 1);
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  /* Trova il bounding box del contenuto non-trasparente e riscala a size×size */
  function _trimAndScale(srcCanvas, size) {
    var ctx  = srcCanvas.getContext('2d');
    var data = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    var px   = data.data;
    var w    = srcCanvas.width, h = srcCanvas.height;
    var minX = w, minY = h, maxX = 0, maxY = 0;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX > maxX || minY > maxY) return srcCanvas;

    var cropW   = maxX - minX + 1;
    var cropH   = maxY - minY + 1;
    var padding = Math.round(size * 0.05);
    var avail   = size - padding * 2;
    var scale   = Math.min(avail / cropW, avail / cropH);
    var drawW   = Math.round(cropW * scale);
    var drawH   = Math.round(cropH * scale);
    var offX    = Math.round((size - drawW) / 2);
    var offY    = Math.round((size - drawH) / 2);

    /* Step-wise upscale: raddoppia al massimo 2x per step per preservare i dettagli */
    var tmp = document.createElement('canvas');
    tmp.width = cropW; tmp.height = cropH;
    tmp.getContext('2d').drawImage(srcCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    while (tmp.width < drawW * 0.75 || tmp.height < drawH * 0.75) {
      var nextW = Math.min(tmp.width * 2, drawW);
      var nextH = Math.min(tmp.height * 2, drawH);
      var step  = document.createElement('canvas');
      step.width = nextW; step.height = nextH;
      var sCtx  = step.getContext('2d');
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';
      sCtx.drawImage(tmp, 0, 0, nextW, nextH);
      tmp = step;
    }

    var out    = document.createElement('canvas');
    out.width  = out.height = size;
    var outCtx = out.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(tmp, 0, 0, tmp.width, tmp.height, offX, offY, drawW, drawH);
    return out;
  }

  function convertLogoToPng(file, size, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth  || 0;
        var h = img.naturalHeight || 0;

        if ((w === 0 || h === 0) && file.type === 'image/svg+xml') {
          try {
            var str = dataUrl.indexOf('base64,') > -1
              ? atob(dataUrl.split('base64,')[1])
              : decodeURIComponent(dataUrl.split(',')[1]);
            var vb = str.match(/viewBox\s*=\s*["']?\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
            if (vb) { w = Math.round(+vb[1]); h = Math.round(+vb[2]); }
          } catch (_) {}
        }
        if (w === 0) w = 128;
        if (h === 0) h = 128;

        var canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0);
        _removeWhiteBg(ctx, w, h);
        var finalCanvas = _trimAndScale(canvas, size);
        var outDataUrl = finalCanvas.toDataURL('image/png');
        finalCanvas.toBlob(function (blob) { cb(outDataUrl, blob); }, 'image/png');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function _syncLogoPreview(inputId, previewId) {
    var val     = document.getElementById(inputId).value;
    var preview = document.getElementById(previewId);
    if (val) { preview.src = val; preview.style.display = ''; }
    else       preview.style.display = 'none';
  }

  var _logoInputsReady = false;
  function _initLogoInputs() {
    if (_logoInputsReady) return;
    _logoInputsReady = true;

    [
      { file: 'homeLogoFile', url: 'matchHomeLogo', preview: 'homeLogoPreview' },
      { file: 'awayLogoFile', url: 'matchAwayLogo', preview: 'awayLogoPreview' }
    ].forEach(function (cfg) {
      document.getElementById(cfg.file).addEventListener('change', function () {
        if (!this.files.length) return;
        var fileEl = this;
        convertLogoToPng(this.files[0], 256, function (dataUrl, blob) {
          document.getElementById(cfg.url).value = '';
          var preview = document.getElementById(cfg.preview);
          preview.src = dataUrl;
          preview.style.display = '';
          fileEl.value = '';
          var saveBtn = document.getElementById('matchSave');
          saveBtn.disabled = true;
          _uploadImage(blob, 'matches', 'png', function (err, url) {
            saveBtn.disabled = false;
            if (err) { console.error('[admin] upload logo squadra', err); alert('Errore caricamento logo, riprova.'); return; }
            document.getElementById(cfg.url).value = url;
          });
        });
      });

      document.getElementById(cfg.url).addEventListener('input', function () {
        _syncLogoPreview(cfg.url, cfg.preview);
      });
    });
  }

  /* ================================================
     SQUADRE
  ================================================ */
  var _catEditing          = null;
  var _playerEditing       = null;
  var _staffEditing        = null;
  var _currentCatId        = null;
  var _currentAdminSeason  = null;

  var _SQUAD_PANELS = ['squadreList', 'squadreCatForm', 'squadrePlayerForm', 'squadreStaffForm'];

  function _showSquadrePanel(id) {
    _SQUAD_PANELS.forEach(function (p) {
      document.getElementById(p).classList.toggle('is-hidden', p !== id);
    });
  }

  function renderSquadre() {
    _showSquadrePanel('squadreList');
    setTopbarBtn('Nuova categoria', function () { openCategoryForm(null); });

    /* Popola select stagioni */
    var seasons = VV.getSeasons();
    if (!_currentAdminSeason) {
      _currentAdminSeason = (VV.getCurrentSeason() || seasons[0] || { id: '2025/2026' }).id;
    }
    var sel = document.getElementById('squadreStagioneSelect');
    sel.innerHTML = seasons.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === _currentAdminSeason ? ' selected' : '') + '>' +
        s.name + (s.current ? ' (corrente)' : '') + '</option>';
    }).join('');
    sel.onchange = function () {
      _currentAdminSeason = this.value;
      refreshSquadreAccordion();
    };

    refreshSquadreAccordion();
  }

  function refreshSquadreAccordion() {
    var categories = VV.getCategories();
    var accordion  = document.getElementById('squadreAccordion');

    if (!categories.length) {
      accordion.innerHTML = '<div class="empty-state"><p>Nessuna categoria. Creane una!</p></div>';
      return;
    }

    var EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var DEL_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';

    var DRAG_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>';

    function rosterOrderKey(p, isPlayer) {
      if (p.order != null) return p.order;
      return isPlayer && p.number != null ? p.number : 999;
    }

    accordion.innerHTML = categories.map(function (cat) {
      var players = VV.getPlayers(cat.id)
        .filter(function (p) { return !p.stagione || p.stagione === _currentAdminSeason; })
        .sort(function (a, b) { return rosterOrderKey(a, true) - rosterOrderKey(b, true); });
      var staff = VV.getStaff(cat.id)
        .filter(function (s) { return !s.stagione || s.stagione === _currentAdminSeason; })
        .sort(function (a, b) { return rosterOrderKey(a, false) - rosterOrderKey(b, false); });

      function personRow(p, isPlayer) {
        var avatar = p.photo
          ? '<img src="' + esc(p.photo) + '" class="roster-avatar">'
          : '<div class="roster-avatar roster-avatar--placeholder">&#128100;</div>';
        var numBadge = isPlayer
          ? '<span class="roster-number">' + (p.number ? '#' + p.number : '—') + '</span>'
          : '';
        var editCb = isPlayer
          ? 'AdminActions.editPlayer(' + p.id + ',' + cat.id + ')'
          : 'AdminActions.editStaff(' + p.id + ',' + cat.id + ')';
        var delCb = isPlayer
          ? 'AdminActions.deletePlayer(' + p.id + ')'
          : 'AdminActions.deleteStaff(' + p.id + ')';
        return '<div class="roster-person" draggable="true" data-id="' + p.id + '">' +
          '<span class="roster-drag" title="Trascina per riordinare">' + DRAG_ICON + '</span>' +
          avatar + numBadge +
          '<div class="roster-info"><div class="roster-name">' + esc(p.name) + '</div><div class="roster-role">' + esc(p.role) + '</div></div>' +
          '<div class="table-actions">' +
            '<button class="btn-icon" onclick="' + editCb + '" title="Modifica">' + EDIT_ICON + '</button>' +
            '<button class="btn-icon btn-icon--danger" onclick="' + delCb + '" title="Elimina">' + DEL_ICON + '</button>' +
          '</div>' +
        '</div>';
      }

      var staffRows   = staff.length   ? staff.map(function (s) { return personRow(s, false); }).join('') : '<div class="roster-empty">Nessun membro dello staff.</div>';
      var playerRows  = players.length ? players.map(function (p) { return personRow(p, true);  }).join('') : '<div class="roster-empty">Nessuna giocatrice / giocatore.</div>';
      var inactiveBadge = cat.active ? '' : ' <span class="chip chip--gray" style="font-size:10px">Inattiva</span>';

      return '<div class="squad-category-block">' +
        '<div class="squad-cat-header">' +
          '<div class="squad-cat-icon" style="background:' + esc(cat.color) + '">' + esc(cat.abbr) + '</div>' +
          '<div class="squad-cat-info">' +
            '<div class="squad-cat-name">' + esc(cat.name) + inactiveBadge + '</div>' +
            (cat.description ? '<div class="squad-cat-desc">' + esc(cat.description) + (cat.schedule ? ' · ' + esc(cat.schedule) : '') + '</div>' : '') +
          '</div>' +
          '<div class="table-actions" style="margin-left:auto;flex-shrink:0">' +
            '<button class="btn-icon" onclick="AdminActions.editCategory(' + cat.id + ')" title="Modifica">' + EDIT_ICON + '</button>' +
            '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteCategory(' + cat.id + ')" title="Elimina">' + DEL_ICON + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="squad-subsection">' +
          '<div class="squad-subsection-hd"><span>Staff tecnico</span><button class="btn-sm" onclick="AdminActions.addStaff(' + cat.id + ')">+ Aggiungi</button></div>' +
          '<div class="roster-list" id="rosterStaff-' + cat.id + '" data-type="staff">' + staffRows + '</div>' +
        '</div>' +
        '<div class="squad-subsection">' +
          '<div class="squad-subsection-hd"><span>Roster</span><button class="btn-sm" onclick="AdminActions.addPlayer(' + cat.id + ')">+ Aggiungi</button></div>' +
          '<div class="roster-list" id="rosterPlayers-' + cat.id + '" data-type="player">' + playerRows + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    accordion.querySelectorAll('.roster-list').forEach(function (list) {
      _initRosterDnD(list, list.getAttribute('data-type'));
    });
  }

  /* ---- Drag & drop riordino roster (staff/giocatori) ---- */
  var _rosterDragEl = null;

  function _initRosterDnD(container, listType) {
    container.querySelectorAll('.roster-person').forEach(function (row) {
      row.addEventListener('dragstart', function () {
        _rosterDragEl = row;
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('is-dragging');
        _rosterDragEl = null;
      });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (!_rosterDragEl || _rosterDragEl === row || _rosterDragEl.parentElement !== container) return;
        var rect  = row.getBoundingClientRect();
        var after = (e.clientY - rect.top) > rect.height / 2;
        container.insertBefore(_rosterDragEl, after ? row.nextSibling : row);
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        _persistRosterOrder(container, listType);
      });
    });
  }

  function _persistRosterOrder(container, listType) {
    var isPlayer = listType === 'player';
    var all = isPlayer ? VV.getPlayers() : VV.getStaff();
    Array.prototype.forEach.call(container.querySelectorAll('.roster-person'), function (row, idx) {
      var id   = +row.getAttribute('data-id');
      var item = all.find(function (x) { return x.id === id; });
      if (item && item.order !== idx + 1) {
        item.order = idx + 1;
        if (isPlayer) DB.savePlayer(item); else DB.saveStaffMember(item);
      }
    });
  }

  /* ---- Category form ---- */
  function openCategoryForm(cat) {
    _catEditing = cat;
    _showSquadrePanel('squadreCatForm');
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('catName').value             = cat ? (cat.name        || '') : '';
    document.getElementById('catAbbr').value             = cat ? (cat.abbr        || '') : '';
    document.getElementById('catColor').value            = cat ? (cat.color       || '#008CFD') : '#008CFD';
    document.getElementById('catDescription').value      = cat ? (cat.description || '') : '';
    document.getElementById('catSchedule').value         = cat ? (cat.schedule    || '') : '';
    document.getElementById('catShowInSquadre').checked  = cat ? (cat.showInSquadre !== false) : true;
    document.getElementById('catActive').checked         = cat ? (cat.active !== false) : true;
  }

  document.getElementById('catSave').addEventListener('click', function () {
    var name = document.getElementById('catName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var abbr = document.getElementById('catAbbr').value.trim().toUpperCase() || name.slice(0, 3).toUpperCase();
    var cat = Object.assign({}, _catEditing || {}, {
      name:          name,
      abbr:          abbr,
      color:         document.getElementById('catColor').value,
      description:   document.getElementById('catDescription').value.trim(),
      schedule:      document.getElementById('catSchedule').value.trim(),
      showInSquadre: document.getElementById('catShowInSquadre').checked,
      active:        document.getElementById('catActive').checked
    });
    DB.saveCategory(cat, renderSquadre);
  });

  document.getElementById('catCancel').addEventListener('click', renderSquadre);

  /* ---- Player form ---- */
  function openPlayerForm(player, categoryId) {
    _playerEditing = player;
    _currentCatId  = categoryId;
    _initPersonPhotoInputs();
    _showSquadrePanel('squadrePlayerForm');
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('playerName').value    = player ? (player.name   || '') : '';
    document.getElementById('playerNumber').value  = player ? (player.number || '') : '';
    document.getElementById('playerRole').value    = player ? (player.role   || 'Laterale') : 'Laterale';
    document.getElementById('playerGender').value  = player ? (player.gender || 'M') : 'M';
    document.getElementById('playerYear').value    = player ? (player.year   || '') : '';
    document.getElementById('playerPhoto').value   = player ? (player.photo  || '') : '';
    document.getElementById('playerPhotoFocus').value = player ? (player.photoFocus || '50% 25%') : '50% 25%';
    if (player && player.photo) {
      _showFocusPicker('player', player.photo, player.photoFocus || '50% 25%');
    } else {
      _hideFocusPicker('player');
    }
  }

  document.getElementById('playerSave').addEventListener('click', function () {
    var name = document.getElementById('playerName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var numVal  = document.getElementById('playerNumber').value;
    var yearVal = document.getElementById('playerYear').value;
    var player = Object.assign({}, _playerEditing || {}, {
      categoryId:  _currentCatId,
      name:        name,
      number:      numVal  ? +numVal  : null,
      role:        document.getElementById('playerRole').value,
      gender:      document.getElementById('playerGender').value || 'M',
      year:        yearVal ? +yearVal : null,
      photo:       document.getElementById('playerPhoto').value.trim(),
      photoFocus:  document.getElementById('playerPhotoFocus').value || '50% 25%'
    });
    if (!player.stagione) player.stagione = _currentAdminSeason || (VV.getCurrentSeason() || {}).id || '2025/2026';
    DB.savePlayer(player, renderSquadre);
  });

  document.getElementById('playerCancel').addEventListener('click', renderSquadre);

  /* ---- Staff form ---- */
  function openStaffForm(person, categoryId) {
    _staffEditing = person;
    _currentCatId = categoryId;
    _initPersonPhotoInputs();
    _showSquadrePanel('squadreStaffForm');
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('staffName').value  = person ? (person.name  || '') : '';
    document.getElementById('staffRole').value  = person ? (person.role  || 'Allenatore') : 'Allenatore';
    document.getElementById('staffPhoto').value = person ? (person.photo || '') : '';
    document.getElementById('staffPhotoFocus').value = person ? (person.photoFocus || '50% 25%') : '50% 25%';
    if (person && person.photo) {
      _showFocusPicker('staff', person.photo, person.photoFocus || '50% 25%');
    } else {
      _hideFocusPicker('staff');
    }
  }

  document.getElementById('staffSave').addEventListener('click', function () {
    var name = document.getElementById('staffName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var person = Object.assign({}, _staffEditing || {}, {
      categoryId: _currentCatId,
      name:       name,
      role:       document.getElementById('staffRole').value,
      photo:      document.getElementById('staffPhoto').value.trim(),
      photoFocus: document.getElementById('staffPhotoFocus').value || '50% 25%'
    });
    if (!person.stagione) person.stagione = _currentAdminSeason || (VV.getCurrentSeason() || {}).id || '2025/2026';
    DB.saveStaffMember(person, renderSquadre);
  });

  document.getElementById('staffCancel').addEventListener('click', renderSquadre);

  function resizePlayerPhoto(file, cb) {
    var MAX = 800;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX / w, MAX / h);
        var outW = Math.round(w * scale), outH = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        canvas.toBlob(function (blob) { cb(dataUrl, blob); }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function _showFocusPicker(prefix, src, focus) {
    var picker = document.getElementById(prefix + 'FocusPicker');
    picker.style.display = '';
    document.getElementById(prefix + 'FocusImg').src  = src;
    document.getElementById(prefix + 'FocusCard').src = src;
    var parts = (focus || '50% 25%').match(/(\d+(?:\.\d+)?)%\s*(\d+(?:\.\d+)?)%/);
    var x = parts ? +parts[1] : 50;
    var y = parts ? +parts[2] : 25;
    var pos = x + '% ' + y + '%';
    document.getElementById(prefix + 'FocusImg').style.objectPosition  = pos;
    document.getElementById(prefix + 'FocusCard').style.objectPosition = pos;
    _updateFocusDot(prefix, x, y);
  }

  function _hideFocusPicker(prefix) {
    document.getElementById(prefix + 'FocusPicker').style.display = 'none';
  }

  function _updateFocusDot(prefix, x, y) {
    var dot = document.getElementById(prefix + 'FocusDot');
    dot.style.left = x + '%';
    dot.style.top  = y + '%';
  }

  function _initFocusWrap(prefix) {
    document.getElementById(prefix + 'FocusWrap').addEventListener('click', function (e) {
      var rect = this.getBoundingClientRect();
      var x = Math.round((e.clientX - rect.left) / rect.width  * 100);
      var y = Math.round((e.clientY - rect.top)  / rect.height * 100);
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
      var focus = x + '% ' + y + '%';
      document.getElementById(prefix + 'PhotoFocus').value = focus;
      document.getElementById(prefix + 'FocusImg').style.objectPosition  = focus;
      document.getElementById(prefix + 'FocusCard').style.objectPosition = focus;
      _updateFocusDot(prefix, x, y);
    });
  }

  var _personPhotoInputsReady = false;
  function _initPersonPhotoInputs() {
    if (_personPhotoInputsReady) return;
    _personPhotoInputsReady = true;

    /* Player: resize JPEG + focal point picker */
    document.getElementById('playerPhotoFile').addEventListener('change', function () {
      if (!this.files.length) return;
      var fileEl = this;
      resizePlayerPhoto(this.files[0], function (dataUrl, blob) {
        var focus = document.getElementById('playerPhotoFocus').value || '50% 25%';
        document.getElementById('playerPhoto').value = '';
        _showFocusPicker('player', dataUrl, focus);
        fileEl.value = '';
        var saveBtn = document.getElementById('playerSave');
        saveBtn.disabled = true;
        _uploadImage(blob, 'players', 'jpg', function (err, url) {
          saveBtn.disabled = false;
          if (err) { console.error('[admin] upload foto giocatore', err); alert('Errore caricamento foto, riprova.'); return; }
          document.getElementById('playerPhoto').value = url;
        });
      });
    });
    document.getElementById('playerPhoto').addEventListener('input', function () {
      var val = this.value.trim();
      if (val) _showFocusPicker('player', val, document.getElementById('playerPhotoFocus').value || '50% 25%');
      else     _hideFocusPicker('player');
    });
    _initFocusWrap('player');

    /* Staff: resize JPEG + focal point picker */
    document.getElementById('staffPhotoFile').addEventListener('change', function () {
      if (!this.files.length) return;
      var fileEl = this;
      resizePlayerPhoto(this.files[0], function (dataUrl, blob) {
        var focus = document.getElementById('staffPhotoFocus').value || '50% 25%';
        document.getElementById('staffPhoto').value = '';
        _showFocusPicker('staff', dataUrl, focus);
        fileEl.value = '';
        var saveBtn = document.getElementById('staffSave');
        saveBtn.disabled = true;
        _uploadImage(blob, 'staff', 'jpg', function (err, url) {
          saveBtn.disabled = false;
          if (err) { console.error('[admin] upload foto staff', err); alert('Errore caricamento foto, riprova.'); return; }
          document.getElementById('staffPhoto').value = url;
        });
      });
    });
    document.getElementById('staffPhoto').addEventListener('input', function () {
      var val = this.value.trim();
      if (val) _showFocusPicker('staff', val, document.getElementById('staffPhotoFocus').value || '50% 25%');
      else     _hideFocusPicker('staff');
    });
    _initFocusWrap('staff');
  }

  /* ================================================
     STAGIONI
  ================================================ */
  function renderStagioni() {
    document.getElementById('stagioneAddBtn').onclick = function () {
      document.getElementById('stagioneName').value = '';
      document.getElementById('stagioneCurrent').checked = false;
      document.getElementById('stagionForm').classList.remove('is-hidden');
      document.getElementById('stagioneName').focus();
    };
    refreshStagionList();
  }

  function refreshStagionList() {
    var seasons = VV.getSeasons();
    var list    = document.getElementById('stagionList');

    list.innerHTML = seasons.map(function (s) {
      var isCurrent = !!s.current;
      return '<div class="sp-item" style="align-items:center">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="sp-item-nome" style="font-size:15px">' + esc(s.name || s.id) + '</div>' +
          (isCurrent
            ? '<span class="chip chip--green" style="font-size:11px;margin-top:4px">Corrente</span>'
            : '') +
        '</div>' +
        (!isCurrent
          ? '<button class="btn-ghost" style="font-size:12px;padding:5px 12px" onclick="AdminActions.setCurrentSeason(\'' + esc(s.id) + '\')">Imposta come corrente</button>'
          : '') +
        (!isCurrent
          ? '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteSeason(\'' + esc(s.id) + '\')" title="Elimina stagione" style="margin-left:8px">' + DEL_ICON_SM + '</button>'
          : '') +
      '</div>';
    }).join('') || '<p style="color:var(--a-muted);padding:24px 0">Nessuna stagione. Crea la prima!</p>';
  }

  document.getElementById('stagioneSave').addEventListener('click', function () {
    var name = document.getElementById('stagioneName').value.trim();
    if (!name) { alert('Il nome è obbligatorio.'); return; }
    var setCurrent = document.getElementById('stagioneCurrent').checked;
    if (setCurrent) VV.setCurrentSeason(null); /* deseleziona tutte */
    var season = { id: name, name: name, current: setCurrent };
    DB.saveSeason(season, function () {
      document.getElementById('stagionForm').classList.add('is-hidden');
      refreshStagionList();
    });
  });

  document.getElementById('stagioneCancel').addEventListener('click', function () {
    document.getElementById('stagionForm').classList.add('is-hidden');
  });

  /* ================================================
     MAGLIA (teaser homepage)
  ================================================ */
  function renderMaglia() {
    var m = VV.getMaglia();
    document.getElementById('magliaEnabled').checked = m.enabled !== false;
    document.getElementById('magliaTitle').value = m.title || '';
    document.getElementById('magliaSubtitle').value = m.subtitle || '';
    document.getElementById('magliaRevealDate').value = (m.revealDate || '').slice(0, 16);
    document.getElementById('magliaVideoUrl').value = m.videoUrl || '';
  }

  document.getElementById('magliaSave').addEventListener('click', function () {
    var revealRaw = document.getElementById('magliaRevealDate').value;
    var title = document.getElementById('magliaTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var videoUrl = document.getElementById('magliaVideoUrl').value.trim();
    if (videoUrl && !/(youtu\.be\/|youtube(-nocookie)?\.com\/)/.test(videoUrl)) {
      alert('Il link deve essere un video YouTube (youtube.com o youtu.be).'); return;
    }
    var obj = {
      enabled:    document.getElementById('magliaEnabled').checked,
      title:      title,
      subtitle:   document.getElementById('magliaSubtitle').value.trim(),
      revealDate: revealRaw ? revealRaw + ':00' : '',
      videoUrl:   videoUrl
    };
    DB.saveMaglia(obj, function () { renderMaglia(); });
  });

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
     SPONSOR
  ================================================ */
  var _spEditing = null;
  var SP_REPS_DEFAULT = { gold: 1, silver: 3, bronze: 1 };

  function renderSponsor() {
    refreshSpList();

    var levelsSub = VV.getLivelliSponsorSub();
    document.getElementById('spSubGold').value   = levelsSub.gold;
    document.getElementById('spSubSilver').value = levelsSub.silver;
    document.getElementById('spSubBronze').value = levelsSub.bronze;

    document.getElementById('spLevelsTextSave').onclick = function () {
      var obj = {
        gold:   document.getElementById('spSubGold').value.trim(),
        silver: document.getElementById('spSubSilver').value.trim(),
        bronze: document.getElementById('spSubBronze').value.trim()
      };
      var statusEl = document.getElementById('spLevelsTextStatus');
      DB.saveLivelliSponsorSub(obj, function () {
        statusEl.textContent = '✓ Salvato';
        statusEl.style.color = 'var(--a-green)';
        setTimeout(function () { statusEl.textContent = ''; }, 2500);
      });
    };

    document.getElementById('spAddBtn').onclick = function () {
      _spEditing = null;
      document.getElementById('spFormTitle').textContent = 'Nuovo sponsor';
      document.getElementById('spLogoUrl').value  = '';
      document.getElementById('spNome').value      = '';
      document.getElementById('spUrl').value       = '';
      document.getElementById('spOrder').value     = String(VV.getSponsors().length + 1);
      document.getElementById('spLivello').value   = 'silver';
      document.getElementById('spRipetizioni').value = String(SP_REPS_DEFAULT.silver);
      document.getElementById('spLogoPreview').style.display = 'none';
      document.getElementById('spLogoEditor').style.display = 'none';
      document.getElementById('spForm').classList.remove('is-hidden');
      document.getElementById('spNome').focus();
    };

    document.getElementById('spFormCancel').onclick = function () {
      document.getElementById('spForm').classList.add('is-hidden');
      document.getElementById('spLogoEditor').style.display = 'none';
    };

    document.getElementById('spLivello').onchange = function () {
      document.getElementById('spRipetizioni').value = String(SP_REPS_DEFAULT[this.value] || 1);
    };

    document.getElementById('spLogoUrl').addEventListener('input', _syncSpPreview);

    document.getElementById('spLogoFile').onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var removeBg = document.getElementById('spLogoRemoveBg').checked;
      _prepareSpLogoSource(file, removeBg, function (dataUrl, w, h) {
        _initSpLogoEditor();
        document.getElementById('spLogoEditorHint').textContent = removeBg
          ? 'Lo sfondo quasi bianco è già stato rimosso in automatico. Trascina per posizionare e usa lo slider per zoomare, così ritagli esattamente la parte che ti serve:'
          : 'Trascina per posizionare e usa lo slider per zoomare, così ritagli esattamente la parte che ti serve:';
        _openSpLogoEditor(dataUrl, w, h);
      });
      e.target.value = '';
    };

    document.getElementById('spFormSave').onclick = function () {
      var nome = document.getElementById('spNome').value.trim();
      var logo = document.getElementById('spLogoUrl').value.trim();
      if (!nome) { alert('Il nome è obbligatorio.'); return; }
      if (!logo) { alert('Il logo è obbligatorio: carica un\'immagine per questo sponsor.'); return; }
      var item = {
        id:          _spEditing ? _spEditing.id : Date.now(),
        nome:        nome,
        logo:        logo,
        url:         document.getElementById('spUrl').value.trim(),
        order:       parseInt(document.getElementById('spOrder').value, 10) || 1,
        livello:     document.getElementById('spLivello').value || 'silver',
        ripetizioni: Math.max(1, parseInt(document.getElementById('spRipetizioni').value, 10) || 1)
      };
      var list = VV.getSponsors().filter(function (s) { return s.id !== item.id; });
      list.push(item);
      list.sort(function (a, b) { return a.order - b.order; });
      DB.saveSponsors(list);
      document.getElementById('spForm').classList.add('is-hidden');
      refreshSpList();
    };
  }

  function _syncSpPreview() {
    var val  = document.getElementById('spLogoUrl').value.trim();
    var prev = document.getElementById('spLogoPreview');
    if (val) { prev.src = val; prev.style.display = ''; }
    else      { prev.style.display = 'none'; }
  }

  /* ---- Editor logo sponsor: rimozione sfondo automatica + ritaglio/zoom manuale ---- */
  var SP_LOGO_OUT_SIZE   = 320; /* lato del PNG quadrato finale */
  var SP_LOGO_MAX_SRC    = 800; /* lato massimo dell'immagine sorgente caricata nell'editor */
  var _spLogoEditorReady = false;
  var _spLogoEditor = {
    naturalW: 0, naturalH: 0, baseScale: 1, zoom: 1, offX: 0, offY: 0,
    dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0
  };

  /* Carica il file e, se richiesto, rimuove lo sfondo quasi-bianco (NON ritaglia/centra:
     l'inquadratura finale la sceglie l'admin nell'editor). */
  function _prepareSpLogoSource(file, removeBg, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth  || 0;
        var h = img.naturalHeight || 0;

        if ((w === 0 || h === 0) && file.type === 'image/svg+xml') {
          try {
            var str = dataUrl.indexOf('base64,') > -1
              ? atob(dataUrl.split('base64,')[1])
              : decodeURIComponent(dataUrl.split(',')[1]);
            var vb = str.match(/viewBox\s*=\s*["']?\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
            if (vb) { w = Math.round(+vb[1]); h = Math.round(+vb[2]); }
          } catch (_) {}
        }
        if (w === 0) w = 128;
        if (h === 0) h = 128;

        var scale = Math.min(1, SP_LOGO_MAX_SRC / w, SP_LOGO_MAX_SRC / h);
        var outW  = Math.max(1, Math.round(w * scale));
        var outH  = Math.max(1, Math.round(h * scale));

        var canvas = document.createElement('canvas');
        canvas.width  = outW;
        canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        if (removeBg) _removeWhiteBg(ctx, outW, outH);
        cb(canvas.toDataURL('image/png'), outW, outH);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function _spLogoEditorApplyTransform() {
    var img   = document.getElementById('spLogoEditorImg');
    var scale = _spLogoEditor.baseScale * _spLogoEditor.zoom;
    var w = _spLogoEditor.naturalW * scale;
    var h = _spLogoEditor.naturalH * scale;
    img.style.width       = w + 'px';
    img.style.height      = h + 'px';
    img.style.marginLeft  = (-w / 2 + _spLogoEditor.offX) + 'px';
    img.style.marginTop   = (-h / 2 + _spLogoEditor.offY) + 'px';
  }

  function _openSpLogoEditor(dataUrl, naturalW, naturalH) {
    document.getElementById('spLogoEditor').style.display = '';
    var viewport = document.getElementById('spLogoEditorViewport');
    var size = viewport.clientWidth || 180;
    _spLogoEditor.naturalW  = naturalW;
    _spLogoEditor.naturalH  = naturalH;
    _spLogoEditor.baseScale = Math.min(size / naturalW, size / naturalH); /* contain: si vede tutta l'immagine */
    _spLogoEditor.zoom = 1;
    _spLogoEditor.offX = 0;
    _spLogoEditor.offY = 0;
    document.getElementById('spLogoEditorZoom').value = 100;
    document.getElementById('spLogoEditorImg').src = dataUrl;
    _spLogoEditorApplyTransform();
  }

  function _initSpLogoEditor() {
    if (_spLogoEditorReady) return;
    _spLogoEditorReady = true;

    var viewport = document.getElementById('spLogoEditorViewport');

    function dragStart(x, y) {
      _spLogoEditor.dragging  = true;
      _spLogoEditor.startX    = x;
      _spLogoEditor.startY    = y;
      _spLogoEditor.startOffX = _spLogoEditor.offX;
      _spLogoEditor.startOffY = _spLogoEditor.offY;
      viewport.style.cursor = 'grabbing';
    }
    function dragMove(x, y) {
      if (!_spLogoEditor.dragging) return;
      _spLogoEditor.offX = _spLogoEditor.startOffX + (x - _spLogoEditor.startX);
      _spLogoEditor.offY = _spLogoEditor.startOffY + (y - _spLogoEditor.startY);
      _spLogoEditorApplyTransform();
    }
    function dragEnd() {
      _spLogoEditor.dragging = false;
      viewport.style.cursor = 'grab';
    }

    viewport.addEventListener('mousedown', function (e) { dragStart(e.clientX, e.clientY); });
    window.addEventListener('mousemove', function (e) { dragMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', dragEnd);

    viewport.addEventListener('touchstart', function (e) { var t = e.touches[0]; dragStart(t.clientX, t.clientY); }, { passive: true });
    viewport.addEventListener('touchmove',  function (e) { var t = e.touches[0]; dragMove(t.clientX, t.clientY); },  { passive: true });
    viewport.addEventListener('touchend', dragEnd);

    document.getElementById('spLogoEditorZoom').addEventListener('input', function () {
      _spLogoEditor.zoom = +this.value / 100;
      _spLogoEditorApplyTransform();
    });

    document.getElementById('spLogoEditorCancel').addEventListener('click', function () {
      document.getElementById('spLogoEditor').style.display = 'none';
    });

    document.getElementById('spLogoEditorApply').addEventListener('click', function () {
      var OUT  = SP_LOGO_OUT_SIZE;
      var size = viewport.clientWidth || 180;
      var k     = OUT / size;
      var scale = _spLogoEditor.baseScale * _spLogoEditor.zoom * k;
      var w = _spLogoEditor.naturalW * scale;
      var h = _spLogoEditor.naturalH * scale;
      var dx = OUT / 2 - w / 2 + _spLogoEditor.offX * k;
      var dy = OUT / 2 - h / 2 + _spLogoEditor.offY * k;

      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = OUT;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(document.getElementById('spLogoEditorImg'), dx, dy, w, h);

      var prev = document.getElementById('spLogoPreview');
      prev.src = canvas.toDataURL('image/png');
      prev.style.display = '';
      document.getElementById('spLogoUrl').value = '';
      document.getElementById('spLogoEditor').style.display = 'none';

      var saveBtn = document.getElementById('spFormSave');
      saveBtn.disabled = true;
      canvas.toBlob(function (blob) {
        _uploadImage(blob, 'sponsors', 'png', function (err, url) {
          saveBtn.disabled = false;
          if (err) { console.error('[admin] upload logo sponsor', err); alert('Errore caricamento logo, riprova.'); return; }
          document.getElementById('spLogoUrl').value = url;
        });
      }, 'image/png');
    });
  }

  var SP_TIER_RANK = { gold: 0, silver: 1, bronze: 2 };

  function refreshSpList() {
    var list     = document.getElementById('spList');
    var sponsors = VV.getSponsors().sort(function (a, b) {
      var ta = SP_TIER_RANK[a.livello || 'silver'];
      var tb = SP_TIER_RANK[b.livello || 'silver'];
      if (ta !== tb) return ta - tb;
      return (a.order||0) - (b.order||0);
    });
    if (!sponsors.length) {
      list.innerHTML = '<p style="color:var(--a-muted);padding:24px 0">Nessuno sponsor aggiunto.</p>';
      return;
    }
    var EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var DEL_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
    var TIER_LABEL = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
    list.innerHTML = sponsors.map(function (s) {
      var logoHtml = s.logo
        ? '<img src="' + esc(s.logo) + '" class="sp-item-logo" alt="">'
        : '<div class="sp-item-no-logo">' + esc((s.nome||'?').charAt(0)) + '</div>';
      var livello = s.livello || 'silver';
      return '<div class="sp-item">' +
        '<div class="sp-item-pos">' + (s.order||'—') + '</div>' +
        '<div class="sp-item-thumb">' + logoHtml + '</div>' +
        '<div class="sp-item-info">' +
          '<div class="sp-item-nome">' + esc(s.nome) + '</div>' +
          (s.url ? '<div class="sp-item-url">' + esc(s.url) + '</div>' : '') +
        '</div>' +
        '<span class="sp-item-tier sp-item-tier--' + livello + '">' + TIER_LABEL[livello] + '</span>' +
        (livello !== 'gold' ? '<span class="sp-item-reps" title="Ripetizioni nel ticker">&times;' + (s.ripetizioni || 1) + '</span>' : '') +
        '<input type="number" class="form-input sp-item-order" value="' + (s.order||1) + '" min="1" ' +
          'onchange="AdminActions.setSponsorOrder(' + s.id + ',+this.value)" title="Posizione">' +
        '<button class="btn-icon" onclick="AdminActions.editSponsor(' + s.id + ')" title="Modifica">' + EDIT_ICON + '</button>' +
        '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteSponsor(' + s.id + ')" title="Elimina">' + DEL_ICON + '</button>' +
      '</div>';
    }).join('');
  }

  window.AdminActions = {
    toggleResultFields: function () {
      var stato = document.getElementById('matchStato').value;
      document.getElementById('matchResultGroup').style.display = stato === 'conclusa' ? '' : 'none';
    },
    editArt: function (id) { openArtForm(VV.getArticle(id)); },
    setHeroOrder: function (id, order) {
      order = +order;
      var articles = VV.getArticles();
      var toSave   = [];
      articles.forEach(function (a) {
        var changed = false;
        if (a.id === +id) {
          var newOrder = order > 0 ? order : null;
          if ((a.heroOrder || null) !== newOrder) { a.heroOrder = newOrder; changed = true; }
        } else if (order > 0 && a.heroOrder === order) {
          a.heroOrder = null; changed = true;
        }
        if (changed) toSave.push(a);
      });
      toSave.forEach(function (a) { DB.saveArticle(a); });
      refreshArtTable();
    },
    deleteArt: function (id) {
      confirm('Eliminare questo articolo? L\'azione è irreversibile.', function () {
        DB.deleteArticle(id, refreshArtTable);
      });
    },
    deleteCategoriaArticolo: function (index) {
      var cats = VV.getCategorieArticoli();
      var name = cats[index];
      if (name === undefined) return;
      confirm('Eliminare la categoria "' + name + '"? Gli articoli che la usano non verranno modificati.', function () {
        cats = cats.slice();
        cats.splice(index, 1);
        DB.saveCategorieArticoli(cats, function () {
          _renderArtCategoriesModalList();
          if (!document.getElementById('sectionArticoli').classList.contains('is-hidden')) refreshArtTable();
        });
      });
    },
    editMatch: function (id) {
      var p = VV.getPartite().find(function (x) { return x.id === id; });
      if (p) openMatchForm(p);
    },
    deleteMatch: function (id) {
      confirm('Eliminare questa partita?', function () {
        DB.deletePartita(id, refreshMatchTable);
      });
    },
    deleteAlbum: function (id) {
      var album = VV.getAlbum(id);
      var ids = album && album.photos ? album.photos.map(function (p) { return p.id; }) : [];
      confirm('Eliminare l\'album e tutte le sue foto?', function () {
        PhotoDB.deleteAlbumPhotos(id, function () {
          DB.deleteAlbum(id, function () {
            refreshAlbumsGrid();
            _notifyCloudinaryOrphans(ids);
          });
        });
      });
    },
    deletePhoto: function (photoId) {
      var album = VV.getAlbum(_currentAlbumId);
      var photo = album && album.photos ? album.photos.find(function (p) { return p.id === photoId; }) : null;
      confirm('Eliminare questa foto?', function () {
        PhotoDB.deletePhoto(_currentAlbumId, photoId, function () {
          loadPhotos(_currentAlbumId);
          _notifyCloudinaryOrphans(photo ? [photo.id] : []);
        });
      });
    },

    /* ---- Squadre ---- */
    editCategory:   function (id) { openCategoryForm(VV.getCategory(id)); },
    deleteCategory: function (id) {
      confirm('Eliminare la categoria con tutto lo staff e il roster?', function () {
        DB.deleteCategory(id, refreshSquadreAccordion);
      });
    },
    addStaff:  function (catId)     { openStaffForm(null, catId); },
    editStaff: function (id, catId) {
      var s = VV.getStaff().find(function (x) { return x.id === +id; });
      openStaffForm(s || null, catId);
    },
    deleteStaff: function (id) {
      confirm('Eliminare questo membro dello staff?', function () {
        DB.deleteStaffMember(id, refreshSquadreAccordion);
      });
    },
    /* ---- Stagioni ---- */
    setCurrentSeason: function (id) {
      DB.setCurrentSeason(id, refreshStagionList);
    },
    deleteSeason: function (id) {
      confirm('Eliminare la stagione "' + id + '"? I dati associati non vengono eliminati.', function () {
        DB.deleteSeason(id, refreshStagionList);
      });
    },

    addPlayer:  function (catId)     { openPlayerForm(null, catId); },
    editPlayer: function (id, catId) {
      var p = VV.getPlayers().find(function (x) { return x.id === +id; });
      openPlayerForm(p || null, catId);
    },
    deletePlayer: function (id) {
      confirm('Eliminare questo giocatore/questa giocatrice?', function () {
        DB.deletePlayer(id, refreshSquadreAccordion);
      });
    }
  };

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


  /* ================================================
     ATLETI
  ================================================ */
  var _atletiCache   = [];
  var _editingAtleta = null;

  function renderAtleti() {
    _showAtletiView('list');
    setTopbarBtn('Nuovo atleta', function () { _openAtletaForm(); });
    _loadAtleti();
  }

  function _showAtletiView(view) {
    document.getElementById('atletiList').classList.toggle('is-hidden', view !== 'list');
    document.getElementById('atletiForm').classList.toggle('is-hidden', view !== 'form');
    document.getElementById('atletiDetail').classList.toggle('is-hidden', view !== 'detail');
  }

  function _loadAtleti() {
    document.getElementById('atletiBody').innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--a-muted);padding:20px">Caricamento…</td></tr>';

    Promise.all([db.collection('atleti').get(), db.collection('atletiDati').get()]).then(function (res) {
      var dati = {};
      res[1].forEach(function (d) { dati[d.id] = d.data(); });
      _atletiCache = [];
      res[0].forEach(function (doc) {
        _atletiCache.push(Object.assign({}, dati[doc.id] || {}, doc.data(), { uid: doc.id }));
      });
      _renderAtletiRows();
      if (_pendingOpenAtleta) { var daAprire = _pendingOpenAtleta; _pendingOpenAtleta = null; _openAtletaDetail(daAprire); }
      _migrateAccessiAtleti();
      _loadAccessiDocs();
    }).catch(function (err) {
      console.error('[Atleti]', err);
      document.getElementById('atletiBody').innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  /* ---- Accessi: atleta e/o genitori che vedono la scheda ----
     Ogni atleta ha `accessi` [{uid,email,ruolo:'atleta'|'genitore',nome}] e
     `accessUids` (solo gli uid, serve alle regole Firestore e alla query lato
     atleta). I documenti creati prima di questa funzione hanno solo email + id=uid:
     _accessiOf() li legge comunque, _migrateAccessiAtleti() li aggiorna. */
  function _accessiOf(a) {
    if (Array.isArray(a.accessi)) return a.accessi;
    return a.email ? [{ uid: a.uid, email: a.email, ruolo: 'atleta', nome: '' }] : [];
  }

  function _hasOwnLogin(a) {
    return _accessiOf(a).some(function (x) { return x.ruolo === 'atleta'; });
  }

  function _accessiSummary(a) {
    var acc  = _accessiOf(a);
    var gen  = acc.filter(function (x) { return x.ruolo === 'genitore'; }).length;
    var parts = [];
    if (_hasOwnLogin(a)) parts.push('atleta');
    if (gen) parts.push(gen === 1 ? '1 genitore' : gen + ' genitori');
    return parts.length ? 'Accessi: ' + parts.join(' + ') : 'Nessun accesso';
  }

  function _migrateAccessiAtleti() {
    var legacy = _atletiCache.filter(function (a) { return !Array.isArray(a.accessUids) && a.email; });
    if (!legacy.length) return;
    var batch = db.batch();
    legacy.forEach(function (a) {
      var accessi = _accessiOf(a);
      var upd = { accessi: accessi, accessUids: accessi.map(function (x) { return x.uid; }) };
      batch.update(db.collection('atleti').doc(a.uid), upd);
      Object.assign(a, upd);
    });
    batch.commit().catch(function (e) { console.error('[Atleti] migrazione accessi', e); });
  }

  /* ---- Documenti /accessi: categorie visibili a ogni account ----
     Un documento per uid (atleta o genitore) con le categorie dei suoi atleti.
     Le regole Firestore lo usano per decidere chi legge gli avvisi di una squadra.
     _reconcileAccessi() ricalcola tutto da _atletiCache e scrive solo le differenze,
     quindi si può chiamare dopo qualunque modifica (e a ogni caricamento dell'elenco). */
  var _accessiDocs = null;   /* { uid: [categorie] } come sono ora su Firestore */

  function _loadAccessiDocs() {
    db.collection('accessi').get().then(function (snap) {
      _accessiDocs = {};
      snap.forEach(function (d) { _accessiDocs[d.id] = (d.data().categorie || []).slice().sort(); });
      return _reconcileAccessi();
    }).catch(function (e) { console.error('[Atleti] accessi', e); });
  }

  function _reconcileAccessi() {
    if (!_accessiDocs) return Promise.resolve();
    var want = {};
    _atletiCache.forEach(function (a) {
      _accessiOf(a).forEach(function (x) {
        var set = want[x.uid] || (want[x.uid] = {});
        if (a.categoria) set[a.categoria] = true;
      });
    });

    var ops = [];
    Object.keys(want).forEach(function (uid) {
      var cats = Object.keys(want[uid]).sort();
      if (!_accessiDocs[uid] || JSON.stringify(_accessiDocs[uid]) !== JSON.stringify(cats)) {
        ops.push({ uid: uid, cats: cats });
      }
    });
    Object.keys(_accessiDocs).forEach(function (uid) {
      if (!want[uid]) ops.push({ uid: uid, cats: null });
    });
    if (!ops.length) return Promise.resolve();

    var chunks = [];
    for (var i = 0; i < ops.length; i += 400) chunks.push(ops.slice(i, i + 400));
    return chunks.reduce(function (chain, chunk) {
      return chain.then(function () {
        var batch = db.batch();
        chunk.forEach(function (op) {
          var ref = db.collection('accessi').doc(op.uid);
          if (op.cats) batch.set(ref, { categorie: op.cats }); else batch.delete(ref);
        });
        return batch.commit().then(function () {
          chunk.forEach(function (op) { if (op.cats) _accessiDocs[op.uid] = op.cats; else delete _accessiDocs[op.uid]; });
        });
      });
    }, Promise.resolve()).catch(function (e) { console.error('[Atleti] sync accessi', e); });
  }

  /* Crea un account Firebase Auth senza disconnettere l'admin (app secondaria). */
  function _createAuthAccount(email, pwd) {
    var existing  = firebase.apps.find(function (a) { return a.name === 'atleta-creator'; });
    var secondary = existing || firebase.initializeApp(firebase.app().options, 'atleta-creator');
    var secAuth   = secondary.auth();
    return secAuth.createUserWithEmailAndPassword(email, pwd).then(function (cred) {
      var uid = cred.user.uid;
      return secAuth.signOut().then(function () { return uid; });
    });
  }

  /* uid di un genitore già collegato a un altro atleta (stessa email), o null. */
  function _findParentUid(email) {
    var e = email.toLowerCase();
    for (var i = 0; i < _atletiCache.length; i++) {
      var acc = _accessiOf(_atletiCache[i]);
      for (var j = 0; j < acc.length; j++) {
        if (acc[j].ruolo === 'genitore' && String(acc[j].email).toLowerCase() === e) return acc[j].uid;
      }
    }
    return null;
  }

  function _authErrorText(err) {
    return err && err.code === 'auth/email-already-in-use'
      ? 'Email già registrata su Firebase e non collegata a un genitore esistente: usane un\'altra.'
      : (err && err.message) || 'errore sconosciuto';
  }

  function _atletaLabel(a) { return 'Atleta — ' + (a.cognome || '') + ' ' + (a.nome || ''); }

  /* Collega un genitore all'atleta: riusa l'account se l'email è già di un genitore. */
  function _linkParent(atleta, nome, email, pwd) {
    email = email.trim().toLowerCase();
    var current = _accessiOf(atleta);
    if (current.some(function (x) { return String(x.email).toLowerCase() === email; })) {
      return Promise.reject(new Error('Questa email è già collegata all\'atleta.'));
    }
    var known = _findParentUid(email);
    var getUid;
    if (known) {
      getUid = Promise.resolve(known);
    } else if (!pwd || pwd.length < 6) {
      return Promise.reject(new Error('Nuovo account: la password deve avere almeno 6 caratteri.'));
    } else {
      getUid = _createAuthAccount(email, pwd);
    }
    return getUid.then(function (uid) {
      var before  = current.map(function (x) { return Object.assign({}, x); });
      var accessi = current.concat([{ uid: uid, email: email, ruolo: 'genitore', nome: nome || '' }]);
      var upd = { accessi: accessi, accessUids: accessi.map(function (x) { return x.uid; }) };
      return db.collection('atleti').doc(atleta.uid).update(upd).then(function () {
        Object.assign(atleta, upd);
        _reconcileAccessi();
        return _logWrite('atleta', atleta.uid, _atletaLabel(atleta), 'update', _diff({ accessi: before }, upd, ['accessi']));
      });
    });
  }

  function _certChip(scadenza) {
    if (!scadenza) return '<span class="chip chip--gray">Non inserita</span>';
    var days  = _daysDiff(scadenza);
    var label = _fmtDate(scadenza);
    if (days < 0)   return '<span class="chip chip--red">Scaduto · ' + label + '</span>';
    if (days <= 30) return '<span class="chip" style="background:rgba(245,158,11,.12);color:#B45309">In scadenza · ' + label + '</span>';
    return '<span class="chip chip--green">' + label + '</span>';
  }

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
     SCHEDA ATLETA — schema dei campi, lista per categoria, esportazione
     Due documenti per atleta:
       atleti/{id}      → ciò che vedono le famiglie nell'area atleti (nome, categoria,
                          certificato, quote, accessi, data privacy);
       atletiDati/{id}  → anagrafica completa, contatti, tutori, consensi, note:
                          leggibile SOLO dai dirigenti (dati personali di minori).
     Per aggiungere un campo basta una riga in ATLETA_SEZIONI: pub:true lo salva nella
     scheda delle famiglie, altrimenti resta riservato; sens:true lo esclude dal log
     delle modifiche (si traccia solo che è cambiato, non il valore).
  ================================================ */
  var RUOLI_ATLETA  = [['', '—'], ['Palleggiatore', 'Palleggiatore/trice'], ['Laterale', 'Laterale'], ['Opposto', 'Opposto'],
                       ['Centrale', 'Centrale'], ['Libero', 'Libero'], ['Universale', 'Universale']];
  var TAGLIE_ATLETA = ['', '6 anni', '8 anni', '10 anni', '12 anni', '14 anni', 'XS', 'S', 'M', 'L', 'XL', 'XXL']
                        .map(function (t) { return [t, t || '—']; });
  var PARENTELE     = [['', '—'], ['Madre', 'Madre'], ['Padre', 'Padre'], ['Tutore', 'Tutore/trice'], ['Altro', 'Altro']];

  var ATLETA_SEZIONI = [
    { titolo: 'Dati anagrafici', campi: [
      { k: 'nome',          l: 'Nome *',            t: 'text', pub: true },
      { k: 'cognome',       l: 'Cognome *',         t: 'text', pub: true },
      { k: 'sesso',         l: 'Sesso',             t: 'select', o: [['', '—'], ['F', 'Femmina'], ['M', 'Maschio']] },
      { k: 'dataNascita',   l: 'Data di nascita',   t: 'date', sens: true },
      { k: 'luogoNascita',  l: 'Luogo di nascita',  t: 'text', sens: true },
      { k: 'codiceFiscale', l: 'Codice fiscale',    t: 'text', upper: true, max: 16, sens: true }
    ] },
    { titolo: 'Residenza', campi: [
      { k: 'indirizzo',     l: 'Indirizzo',         t: 'text', full: true, sens: true },
      { k: 'cap',           l: 'CAP',               t: 'text', max: 5, sens: true },
      { k: 'citta',         l: 'Città',             t: 'text', sens: true },
      { k: 'provincia',     l: 'Provincia (sigla)', t: 'text', upper: true, max: 2, sens: true }
    ] },
    { titolo: 'Contatti dell\'atleta', campi: [
      { k: 'telefono',      l: 'Telefono',          t: 'tel', sens: true },
      { k: 'emailContatto', l: 'Email di contatto', t: 'email', sens: true }
    ] },
    { titolo: 'Sport e tesseramento', campi: [
      { k: 'categoria',     l: 'Categoria',         t: 'categoria', pub: true },
      { k: 'ruolo',         l: 'Ruolo',             t: 'select', o: RUOLI_ATLETA },
      { k: 'numeroMaglia',  l: 'Numero di maglia',  t: 'number' },
      { k: 'tagliaDivisa',  l: 'Taglia divisa',     t: 'select', o: TAGLIE_ATLETA },
      { k: 'tesseraFipav',  l: 'N. tessera FIPAV',  t: 'text' },
      { k: 'dataIscrizione', l: 'Data di iscrizione', t: 'date' }
    ] },
    { titolo: 'Genitore / tutore 1', campi: [
      { k: 'tutore1Nome',     l: 'Cognome e nome',  t: 'text', sens: true },
      { k: 'tutore1Parentela', l: 'Parentela',      t: 'select', o: PARENTELE },
      { k: 'tutore1Telefono', l: 'Telefono',        t: 'tel', sens: true },
      { k: 'tutore1Email',    l: 'Email',           t: 'email', sens: true },
      { k: 'tutore1CodiceFiscale', l: 'Codice fiscale', t: 'text', upper: true, max: 16, sens: true }
    ] },
    { titolo: 'Genitore / tutore 2', campi: [
      { k: 'tutore2Nome',     l: 'Cognome e nome',  t: 'text', sens: true },
      { k: 'tutore2Parentela', l: 'Parentela',      t: 'select', o: PARENTELE },
      { k: 'tutore2Telefono', l: 'Telefono',        t: 'tel', sens: true },
      { k: 'tutore2Email',    l: 'Email',           t: 'email', sens: true }
    ] },
    { titolo: 'Contatto di emergenza', campi: [
      { k: 'emergenzaNome',     l: 'Nome e parentela', t: 'text', sens: true },
      { k: 'emergenzaTelefono', l: 'Telefono',         t: 'tel', sens: true }
    ] },
    { titolo: 'Consensi', campi: [
      { k: 'privacyFirmataIl', l: 'Informativa privacy firmata il', t: 'date', pub: true },
      { k: 'consensoFotoIl',   l: 'Liberatoria foto/video firmata il', t: 'date' }
    ] },
    { titolo: 'Riservato ai dirigenti (le famiglie non lo vedono)', campi: [
      { k: 'infoMediche', l: 'Info utili in emergenza (allergie, intolleranze…)', t: 'textarea', full: true, sens: true },
      { k: 'note',        l: 'Note interne', t: 'textarea', full: true, sens: true }
    ] }
  ];

  var ATLETA_CAMPI = [];
  ATLETA_SEZIONI.forEach(function (s) { s.campi.forEach(function (f) { ATLETA_CAMPI.push(f); }); });
  var ATLETA_SENSIBILI = ATLETA_CAMPI.filter(function (f) { return f.sens; }).map(function (f) { return f.k; });

  function _campoHtml(f, v) {
    var id = 'af_' + f.k;
    var input;
    if (f.t === 'select' || f.t === 'categoria') {
      var opts = f.t === 'categoria'
        ? [['', 'Nessuna']].concat(VV.getCategories().map(function (c) { return [c.name, c.name]; }))
        : f.o;
      if (v && !opts.some(function (o) { return o[0] === v; })) opts = opts.concat([[v, v]]);
      input = '<select id="' + id + '" class="form-input">' + opts.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
    } else if (f.t === 'textarea') {
      input = '<textarea id="' + id + '" class="form-input form-textarea" rows="3">' + esc(v) + '</textarea>';
    } else {
      input = '<input type="' + f.t + '" id="' + id + '" class="form-input" value="' + esc(v == null ? '' : String(v)) + '"' +
        (f.max ? ' maxlength="' + f.max + '"' : '') +
        (f.t === 'number' ? ' min="0" max="999"' : '') +
        (f.upper ? ' style="text-transform:uppercase"' : '') + '>';
    }
    return '<div class="form-group' + (f.full ? ' form-full' : '') + '"><label class="form-label" for="' + id + '">' + esc(f.l) + '</label>' + input + '</div>';
  }

  function _atletaFormHtml(a) {
    return ATLETA_SEZIONI.map(function (s) {
      return '<div class="form-group form-full"><h4 class="af-section">' + esc(s.titolo) + '</h4></div>' +
        s.campi.map(function (f) { return _campoHtml(f, a[f.k]); }).join('');
    }).join('');
  }

  function _leggiCampo(f) {
    var v = document.getElementById('af_' + f.k).value;
    if (f.t === 'number') return v === '' ? '' : Number(v);
    v = v.trim();
    return f.upper ? v.toUpperCase() : v;
  }

  function _validaAtleta(v) {
    var oggi = new Date().toISOString().slice(0, 10);
    var cf = /^[A-Z0-9]{16}$/;
    var email = /^\S+@\S+\.\S+$/;
    if (!v.nome || !v.cognome) return 'Nome e cognome sono obbligatori.';
    if (v.dataNascita && (v.dataNascita > oggi || v.dataNascita < '1920-01-01')) return 'La data di nascita non è valida.';
    if (v.codiceFiscale && !cf.test(v.codiceFiscale)) return 'Il codice fiscale dell\'atleta deve avere 16 caratteri.';
    if (v.tutore1CodiceFiscale && !cf.test(v.tutore1CodiceFiscale)) return 'Il codice fiscale del tutore 1 deve avere 16 caratteri.';
    if (v.cap && !/^\d{5}$/.test(v.cap)) return 'Il CAP deve avere 5 cifre.';
    if (v.provincia && !/^[A-Z]{2}$/.test(v.provincia)) return 'La provincia va indicata con la sigla (2 lettere).';
    var mail = ['emailContatto', 'tutore1Email', 'tutore2Email'].filter(function (k) { return v[k] && !email.test(v[k]); })[0];
    if (mail) return 'L\'indirizzo email non è valido: ' + v[mail];
    return '';
  }

  function _atletaEta(a) {
    if (!a.dataNascita) return null;
    var n = new Date(a.dataNascita + 'T00:00:00'), t = new Date();
    var e = t.getFullYear() - n.getFullYear();
    if (t.getMonth() < n.getMonth() || (t.getMonth() === n.getMonth() && t.getDate() < n.getDate())) e--;
    return e;
  }

  /* ---- Salva scheda: la parte "famiglie" su atleti, il resto su atletiDati ---- */
  document.getElementById('detAnagraficaSave').addEventListener('click', function () {
    var a = _editingAtleta;
    if (!a) return;
    var vals = {};
    ATLETA_CAMPI.forEach(function (f) { vals[f.k] = _leggiCampo(f); });
    var err = _validaAtleta(vals);
    var msg = document.getElementById('detAnagraficaMsg');
    if (err) { msg.textContent = err; msg.className = 'af-msg is-err'; return; }

    var pub = {}, riservati = {};
    ATLETA_CAMPI.forEach(function (f) { (f.pub ? pub : riservati)[f.k] = vals[f.k]; });

    var before = Object.assign({}, a);
    var btn = this;
    btn.disabled = true;
    msg.textContent = '';

    Promise.all([
      db.collection('atleti').doc(a.uid).update(pub),
      db.collection('atletiDati').doc(a.uid).set(riservati, { merge: true })
    ]).then(function () {
      Object.assign(a, pub, riservati);
      document.getElementById('atletaDetailNome').textContent = (a.cognome || '') + ' ' + (a.nome || '');
      _reconcileAccessi();
      (a.categoria ? _ensureIscrizione(a) : _syncIscrizione(a)).catch(function (e) { console.error('[Atleti] iscrizione', e); });
      msg.textContent = 'Salvato.'; msg.className = 'af-msg is-ok';
      var dopo   = Object.assign({}, pub, riservati);
      var campi  = Object.keys(dopo).filter(function (k) {
        return String(before[k] == null ? '' : before[k]) !== String(dopo[k] == null ? '' : dopo[k]);
      });
      return _logWrite('atleta', a.uid, _atletaLabel(a), 'update', _diff(before, dopo, campi));
    }).catch(function (e) {
      msg.textContent = 'Errore: ' + e.message; msg.className = 'af-msg is-err';
    }).then(function () { btn.disabled = false; });
  });

  /* ---- Lista per categoria ---- */
  var _atletiCat   = '';   /* '' = tutte, '__none__' = senza categoria, altrimenti il nome */
  var _atletiQuery = '';

  function _categorieElenco() {
    var names = VV.getCategories(true).map(function (c) { return c.name; });
    _atletiCache.forEach(function (a) {
      if (a.categoria && names.indexOf(a.categoria) === -1) names.push(a.categoria);
    });
    return names;
  }

  function _atletiFiltrati() {
    var q = _atletiQuery.trim().toLowerCase();
    return _atletiCache.filter(function (a) {
      if (_atletiCat === '__none__') { if (a.categoria) return false; }
      else if (_atletiCat && a.categoria !== _atletiCat) return false;
      if (!q) return true;
      return ((a.cognome || '') + ' ' + (a.nome || '') + ' ' + (a.codiceFiscale || '')).toLowerCase().indexOf(q) !== -1;
    }).sort(function (x, y) {
      return ((x.cognome || '') + ' ' + (x.nome || '')).localeCompare((y.cognome || '') + ' ' + (y.nome || ''), 'it');
    });
  }

  function _renderAtletiCats() {
    var counts = {}, none = 0;
    _atletiCache.forEach(function (a) { if (a.categoria) counts[a.categoria] = (counts[a.categoria] || 0) + 1; else none++; });
    function pill(cat, label, n) {
      return '<button type="button" class="atleti-pill' + (_atletiCat === cat ? ' is-active' : '') + '" data-cat="' + esc(cat) + '">' +
        esc(label) + ' <span>' + n + '</span></button>';
    }
    document.getElementById('atletiCatBar').innerHTML =
      pill('', 'Tutte', _atletiCache.length) +
      _categorieElenco().map(function (n) { return pill(n, n, counts[n] || 0); }).join('') +
      (none ? pill('__none__', 'Senza categoria', none) : '');
  }

  function _atletiAvvisi(list) {
    var certKo = list.filter(function (a) { return !a.certMedicoScadenza || _daysDiff(a.certMedicoScadenza) < 0; }).length;
    var privKo = list.filter(function (a) { return !a.privacyFirmataIl; }).length;
    var senzaAccessi = list.filter(function (a) { return !_accessiOf(a).length; }).length;
    var parts = [list.length + (list.length === 1 ? ' atleta' : ' atleti')];
    if (certKo)       parts.push(certKo + ' con certificato scaduto o mancante');
    if (privKo)       parts.push(privKo + ' con privacy da ritirare');
    if (senzaAccessi) parts.push(senzaAccessi + ' senza accessi');
    return parts.join(' · ');
  }

  function _atletaRowHtml(a) {
    var tt      = _totaliRateAdmin(a.uid);
    var totale  = tt.totale;
    var saldato = tt.saldato;
    var eta     = _atletaEta(a);
    var ruoloNum = [a.ruolo, a.numeroMaglia !== '' && a.numeroMaglia != null ? '#' + a.numeroMaglia : ''].filter(Boolean).join(' · ');
    return '<tr>' +
      '<td><div class="table-title">' + esc(a.cognome) + ' ' + esc(a.nome) + '</div>' +
        '<div class="table-sub">' + esc(_accessiSummary(a)) +
          (a.privacyFirmataIl ? '' : ' &nbsp;·&nbsp; <span style="color:#B45309">privacy da ritirare</span>') + '</div></td>' +
      '<td>' + (a.dataNascita ? esc(_fmtDate(a.dataNascita)) + '<div class="table-sub">' + eta + ' anni</div>' : '<span class="chip chip--gray">—</span>') + '</td>' +
      '<td>' + (ruoloNum ? esc(ruoloNum) : '—') + '</td>' +
      '<td>' + _certChip(a.certMedicoScadenza) + '</td>' +
      '<td>' + (totale > 0
        ? '<span style="font-weight:600">€' + saldato.toFixed(0) + '</span><span style="color:var(--a-muted)"> / €' + totale.toFixed(0) + '</span>'
        : '—') + '</td>' +
      '<td><div class="table-actions">' +
        '<button class="btn-icon" onclick="AdminActions.editAtleta(\'' + esc(a.uid) + '\')" title="Apri scheda">' + EDIT_ICON_SM + '</button>' +
        '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteAtleta(\'' + esc(a.uid) + '\')" title="Elimina">' + DEL_ICON_SM + '</button>' +
      '</div></td>' +
    '</tr>';
  }

  function _renderAtletiRows() {
    var body = document.getElementById('atletiBody');
    _renderAtletiCats();
    if (!_atletiCache.length) {
      document.getElementById('atletiSummary').textContent = '';
      body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>Nessun atleta registrato.</p></div></td></tr>';
      return;
    }
    var list = _atletiFiltrati();
    document.getElementById('atletiSummary').textContent = _atletiAvvisi(list);
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>Nessun atleta corrisponde ai filtri.</p></div></td></tr>';
      return;
    }

    if (_atletiCat) {
      body.innerHTML = list.map(_atletaRowHtml).join('');
      return;
    }
    /* "Tutte": elenco diviso per categoria, ciascuna con il proprio riepilogo */
    var gruppi = _categorieElenco().concat(['__none__']);
    body.innerHTML = gruppi.map(function (cat) {
      var membri = list.filter(function (a) { return cat === '__none__' ? !a.categoria : a.categoria === cat; });
      if (!membri.length) return '';
      return '<tr class="atleti-group"><td colspan="6"><strong>' + esc(cat === '__none__' ? 'Senza categoria' : cat) + '</strong>' +
        '<span>' + esc(_atletiAvvisi(membri)) + '</span></td></tr>' + membri.map(_atletaRowHtml).join('');
    }).join('');
  }

  document.getElementById('atletiSearch').addEventListener('input', function () {
    _atletiQuery = this.value;
    _renderAtletiRows();
  });
  document.getElementById('atletiCatBar').addEventListener('click', function (e) {
    var b = e.target.closest('.atleti-pill');
    if (!b) return;
    _atletiCat = b.dataset.cat;
    _renderAtletiRows();
  });

  /* ---- Esporta l'elenco filtrato in CSV (apribile con Excel) ---- */
  function _csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function _esportaAtletiCsv() {
    var list = _atletiFiltrati();
    if (!list.length) { alert('Nessun atleta da esportare.'); return; }
    confirm('Il file contiene dati personali di minori (codice fiscale, indirizzo, telefoni). Conservalo in un posto sicuro e cancellalo quando non serve più. Scaricare?', function () {
      var cols = [{ k: 'cognome', l: 'Cognome' }, { k: 'nome', l: 'Nome' }];
      ATLETA_CAMPI.forEach(function (f) {
        if (['nome', 'cognome', 'note', 'infoMediche'].indexOf(f.k) === -1) cols.push({ k: f.k, l: f.l.replace(' *', '') });
      });
      cols.push({ k: 'certMedicoScadenza', l: 'Scadenza certificato medico' });
      var righe = [cols.map(function (c) { return _csvCell(c.l); }).join(';')].concat(list.map(function (a) {
        return cols.map(function (c) { return _csvCell(a[c.k]); }).join(';');
      }));
      var blob = new Blob(['﻿' + righe.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var url  = URL.createObjectURL(blob);
      var link = document.createElement('a');
      var slug = (_atletiCat && _atletiCat !== '__none__' ? _atletiCat : 'tutti').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      link.href = url;
      link.download = 'atleti-' + slug + '-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }
  document.getElementById('atletiExport').addEventListener('click', _esportaAtletiCsv);

  /* ================================================
     ISCRIZIONE ALLA STAGIONE E RATE — una sola fonte, il budget
     La scheda atleta (atleti) è l'anagrafica; per ogni stagione il budget ha una riga
     "iscrizione" (atletiRette, collegata via atletaId) e le rate (rateAtleti, con
     atletaId/seasonId/stagione ripetuti per permettere alla famiglia di leggere solo le
     proprie). Le rate si inseriscono dalla scheda o dal Budget: sono le stesse e
     alimentano il bilancio; le famiglie le vedono nell'area atleti.
  ================================================ */
  function _stagioneCorrenteNome() {
    var s = _bs().seasons.find(function (x) { return x.id === _bs().currentSeasonId; });
    return s ? (s.nome || '') : '';
  }

  function _iscrizioneOf(atletaId) {
    return _bs().atletiRette.find(function (x) { return x.atletaId === atletaId; }) || null;
  }

  function _rateOfAtleta(atletaId) {
    return _bs().rateAtleti.filter(function (r) { return r.atletaId === atletaId; });
  }

  function _totaliRateAdmin(atletaId) {
    var rate = _rateOfAtleta(atletaId).filter(function (r) { return r.seasonId === _bs().currentSeasonId; });
    var totale  = rate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
    var saldato = rate.filter(function (r) { return r.pagata; }).reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
    return { totale: totale, saldato: saldato };
  }

  function _refreshBudgetViews() {
    Admin.budget.refreshRette();
  }

  /* Categoria del budget con lo stesso nome di quella dell'atleta; se manca in questa stagione la crea. */
  function _ensureCategoriaAtleti(nome) {
    nome = (nome || '').trim();
    if (!nome) return Promise.resolve('');
    var key = nome.toLowerCase();
    var found = _bs().categorieAtleti.find(function (c) { return (c.nome || '').trim().toLowerCase() === key; });
    if (found) return Promise.resolve(found.id);
    var data = { seasonId: _bs().currentSeasonId, nome: nome, rettaUnitaria: 0 };
    var ref  = db.collection('categorieAtleti').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _bs().categorieAtleti.push(data);
      return _logWrite('categoriaAtleti', ref.id, 'Categoria — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { return ref.id; });
  }

  /* Allinea nome, cognome e categoria dell'iscrizione a quelli della scheda. */
  function _syncIscrizione(a, quiet) {
    var isc = _iscrizioneOf(a.uid);
    if (!isc) return Promise.resolve();
    return _ensureCategoriaAtleti(a.categoria).then(function (catId) {
      var patch = {};
      if ((isc.nome || '') !== (a.nome || ''))         patch.nome = a.nome || '';
      if ((isc.cognome || '') !== (a.cognome || ''))   patch.cognome = a.cognome || '';
      if ((isc.categoriaAtletiId || '') !== (catId || '')) patch.categoriaAtletiId = catId || '';
      var chiavi = Object.keys(patch);
      if (!chiavi.length) return;
      var old = {};
      chiavi.forEach(function (k) { old[k] = isc[k] || ''; });
      Object.assign(isc, patch);
      return db.collection('atletiRette').doc(isc.id).update(patch)
        .then(function () { return _logWrite('atletaRetta', isc.id, 'Atleta — ' + (a.cognome || '') + ' ' + (a.nome || ''), 'update', _diff(old, patch, chiavi)); })
        .then(function () { if (!quiet) _refreshBudgetViews(); });
    });
  }

  /* Iscrive l'atleta alla stagione corrente (se non lo è già) e ne restituisce la riga. */
  function _ensureIscrizione(a, quiet) {
    var esistente = _iscrizioneOf(a.uid);
    if (esistente) return _syncIscrizione(a, quiet).then(function () { return esistente; });
    return _ensureCategoriaAtleti(a.categoria).then(function (catId) {
      var data = {
        seasonId: _bs().currentSeasonId, nome: a.nome || '', cognome: a.cognome || '',
        categoriaAtletiId: catId || '', atletaId: a.uid, createdAt: new Date().toISOString()
      };
      var ref = db.collection('atletiRette').doc();
      return ref.set(data).then(function () {
        data.id = ref.id;
        _bs().atletiRette.push(data);
        return _logWrite('atletaRetta', ref.id, 'Atleta — ' + data.cognome + ' ' + data.nome, 'create', _diff({}, data, Object.keys(data)));
      }).then(function () {
        if (!quiet) _refreshBudgetViews();
        return data;
      });
    });
  }

  /* ---- Tab "Rate & Quote" della scheda ---- */
  function _renderRateAdmin() {
    var el = document.getElementById('rateAdminList');
    var a  = _editingAtleta;
    var rate = a ? _rateOfAtleta(a.uid).slice().sort(function (x, y) {
      return (x.scadenza || '9999-12-31').localeCompare(y.scadenza || '9999-12-31');
    }) : [];

    if (!rate.length) {
      el.innerHTML = '<p style="color:var(--a-muted);font-size:13px">Nessuna quota inserita per ' + esc(_stagioneCorrenteNome() || 'questa stagione') + '.</p>';
      return;
    }
    el.innerHTML = rate.map(function (r) {
      return '<div class="atleta-rate-item">' +
        '<div class="atleta-rate-info">' +
          '<div class="atleta-rate-desc">' + esc(r.note || 'Quota') + '</div>' +
          '<div class="atleta-rate-meta">Scadenza: ' + _fmtDate(r.scadenza) +
            ' &nbsp;·&nbsp; €' + (+r.importo || 0).toFixed(2) +
            (r.stagione ? ' &nbsp;·&nbsp; ' + esc(r.stagione) : '') +
            (r.pagata && r.dataPagamento ? ' &nbsp;·&nbsp; pagata il ' + _fmtDate(r.dataPagamento) : '') + '</div>' +
        '</div>' +
        '<div class="atleta-rate-actions">' +
          '<button class="btn-ghost" style="font-size:12px;padding:5px 10px;color:' +
            (r.pagata ? 'var(--a-green)' : 'var(--a-text)') +
            '" onclick="AdminActions.toggleRataScheda(\'' + esc(r.id) + '\')">' +
            (r.pagata ? '✓ Pagata' : 'Segna pagata') +
          '</button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteRataScheda(\'' + esc(r.id) + '\')" title="Rimuovi">' + DEL_ICON_SM + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  document.getElementById('rataAdd').addEventListener('click', function () {
    var a = _editingAtleta;
    if (!a) return;
    var desc    = document.getElementById('rataDesc').value.trim();
    var importo = parseFloat(document.getElementById('rataImporto').value) || 0;
    var scad    = document.getElementById('rataScadenza').value;
    if (!desc)    { alert('Inserisci una descrizione.'); return; }
    if (!importo) { alert('Inserisci un importo.'); return; }

    var btn = this;
    btn.disabled = true;
    _ensureIscrizione(a, true).then(function (isc) {
      var data = {
        atletaRettaId: isc.id, atletaId: a.uid, seasonId: _bs().currentSeasonId, stagione: _stagioneCorrenteNome(),
        importo: importo, scadenza: scad, note: desc, pagata: false, dataPagamento: null,
        createdAt: new Date().toISOString()
      };
      var ref = db.collection('rateAtleti').doc();
      return ref.set(data).then(function () {
        data.id = ref.id;
        _bs().rateAtleti.push(data);
        return _logWrite('rataAtleti', ref.id, 'Rata — ' + (a.cognome || '') + ' ' + (a.nome || ''), 'create', _diff({}, data, Object.keys(data)));
      });
    }).then(function () {
      ['rataDesc', 'rataImporto', 'rataScadenza'].forEach(function (id) { document.getElementById(id).value = ''; });
      _renderRateAdmin();
      _renderAtletiRows();
      _refreshBudgetViews();
    }).catch(function (e) { alert('Errore: ' + e.message); })
      .then(function () { btn.disabled = false; });
  });

  window.AdminActions.toggleRataScheda = function (id) {
    var r = _bs().rateAtleti.find(function (x) { return x.id === id; });
    if (r) window.AdminActions.toggleRataAtleta(id, !r.pagata);
  };
  window.AdminActions.deleteRataScheda = function (id) { window.AdminActions.deleteRataAtleta(id); };

  /* ---- Eliminazione atleta: scheda, anagrafica riservata, iscrizioni e rate di ogni stagione ---- */
  window.AdminActions.deleteAtleta = function (uid) {
    var target = _atletiCache.find(function (a) { return a.uid === uid; });
    var rate   = _rateOfAtleta(uid);
    var pagato = rate.filter(function (r) { return r.pagata; }).reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
    var testo  = 'Eliminare l\'atleta dal gestionale? Le credenziali Firebase resteranno attive.';
    if (rate.length) {
      testo += ' Verranno eliminate anche ' + rate.length + (rate.length === 1 ? ' rata' : ' rate') +
        (pagato ? ' (già incassati €' + pagato.toFixed(2) + ': spariranno dal bilancio)' : '') + '.';
    }
    confirm(testo, function () {
      Promise.all([
        db.collection('atletiRette').where('atletaId', '==', uid).get(),
        db.collection('rateAtleti').where('atletaId', '==', uid).get()
      ]).then(function (res) {
        var batch = db.batch();
        batch.delete(db.collection('atleti').doc(uid));
        batch.delete(db.collection('atletiDati').doc(uid));
        res[0].forEach(function (d) { batch.delete(d.ref); });
        res[1].forEach(function (d) { batch.delete(d.ref); });
        return batch.commit();
      }).then(function () {
        return _logWrite('atleta', uid, 'Atleta — ' + (target ? target.cognome + ' ' + target.nome : uid), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).then(function () {
        _atletiCache = _atletiCache.filter(function (a) { return a.uid !== uid; });
        _bs().atletiRette = _bs().atletiRette.filter(function (x) { return x.atletaId !== uid; });
        _bs().rateAtleti  = _bs().rateAtleti.filter(function (r) { return r.atletaId !== uid; });
        _reconcileAccessi();
        _renderAtletiRows();
        _refreshBudgetViews();
      }).catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- Dal Budget: apri la scheda, nuovo atleta, iscrizione di massa ---- */
  var _pendingOpenAtleta = null;

  window.AdminActions.apriSchedaAtleta = function (atletaId) {
    _pendingOpenAtleta = atletaId;
    goTo('atleti');
  };

  window.AdminActions.nuovoAtletaDaBudget = function () {
    goTo('atleti');
    _openAtletaForm();
  };

  document.getElementById('iscriviAtletiBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    Promise.all([db.collection('atleti').get(), db.collection('atletiDati').get()]).then(function (res) {
      var dati = {};
      res[1].forEach(function (d) { dati[d.id] = d.data(); });
      var tutti = [];
      res[0].forEach(function (d) { tutti.push(Object.assign({}, dati[d.id] || {}, d.data(), { uid: d.id })); });
      var daIscrivere = tutti.filter(function (a) { return a.categoria && !_iscrizioneOf(a.uid); });
      if (!daIscrivere.length) { alert('Tutti gli atleti con una categoria sono già iscritti a questa stagione.'); return; }

      confirm('Iscrivere ' + daIscrivere.length + (daIscrivere.length === 1 ? ' atleta' : ' atleti') + ' alla stagione ' +
              (_stagioneCorrenteNome() || 'corrente') + '? Le categorie mancanti verranno create con retta 0.', function () {
        daIscrivere.reduce(function (chain, a) {
          return chain.then(function () { return _ensureIscrizione(a, true); });
        }, Promise.resolve()).then(_refreshBudgetViews)
          .catch(function (e) { alert('Errore: ' + e.message); });
      });
    }).catch(function (e) { alert('Errore: ' + e.message); })
      .then(function () { btn.disabled = false; });
  });

  /* ---- Nuovo atleta form ---- */

  function _openAtletaForm() {
    _showAtletiView('form');
    document.getElementById('topbarActions').innerHTML = '';
    var sel = document.getElementById('atletaCategoria');
    sel.innerHTML = '<option value="">Nessuna</option>' +
      VV.getCategories().map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
      }).join('');
    ['atletaNome', 'atletaCognome', 'atletaEmail', 'atletaPassword',
     'genitoreNome', 'genitoreEmail', 'genitorePassword'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('atletaCertScadenza').value = '';
  }

  document.getElementById('atletaFormCancel').addEventListener('click', renderAtleti);

  document.getElementById('atletaFormSave').addEventListener('click', function () {
    var nome    = document.getElementById('atletaNome').value.trim();
    var cognome = document.getElementById('atletaCognome').value.trim();
    var email   = document.getElementById('atletaEmail').value.trim().toLowerCase();
    var pwd     = document.getElementById('atletaPassword').value;
    var gNome   = document.getElementById('genitoreNome').value.trim();
    var gEmail  = document.getElementById('genitoreEmail').value.trim().toLowerCase();
    var gPwd    = document.getElementById('genitorePassword').value;
    var categ   = document.getElementById('atletaCategoria').value;
    var certSc  = document.getElementById('atletaCertScadenza').value;

    if (!nome || !cognome) { alert('Nome e cognome sono obbligatori.'); return; }
    if (!email && !gEmail) { alert('Serve almeno un accesso: atleta o genitore.'); return; }
    if (email && pwd.length < 6) { alert('Accesso atleta: la password deve avere almeno 6 caratteri.'); return; }
    if (gEmail && !_findParentUid(gEmail) && gPwd.length < 6) {
      alert('Accesso genitore: è un nuovo account, la password deve avere almeno 6 caratteri.'); return;
    }

    var btn = document.getElementById('atletaFormSave');
    btn.textContent = 'Creazione…'; btn.disabled = true;

    var atleta = null;

    /* 1) account atleta (facoltativo) */
    (email ? _createAuthAccount(email, pwd) : Promise.resolve(null))
      .then(function (athleteUid) {
        /* 2) scheda: con login proprio l'id è il suo uid, altrimenti è automatico */
        var ref = athleteUid ? db.collection('atleti').doc(athleteUid) : db.collection('atleti').doc();
        var accessi = athleteUid ? [{ uid: athleteUid, email: email, ruolo: 'atleta', nome: '' }] : [];
        var data = {
          uid: ref.id, nome: nome, cognome: cognome, email: email,
          categoria: categ, certMedicoScadenza: certSc,
          certMedicoUrl: '', moduloIscrizioneUrl: '',
          accessi: accessi, accessUids: accessi.map(function (x) { return x.uid; }),
          privacyFirmataIl: '',
          rate: [], createdAt: new Date().toISOString()
        };
        return ref.set(data).then(function () {
          atleta = data;
          _atletiCache.push(data);
          return _logWrite('atleta', ref.id, _atletaLabel(data), 'create', _diff({}, data, Object.keys(data)));
        }).then(function () {
          /* l'atleta è già salvato: un problema sul budget non deve far fallire la creazione */
          return data.categoria ? _ensureIscrizione(data).catch(function (e) { console.error('[Atleti] iscrizione', e); }) : null;
        });
      })
      .then(function () {
        /* 3) accesso genitore (facoltativo): se fallisce, la scheda esiste già */
        if (!gEmail) return null;
        return _linkParent(atleta, gNome, gEmail, gPwd).catch(function (err) {
          alert('Atleta creato, ma l\'accesso genitore non è stato aggiunto: ' + _authErrorText(err) +
                '\nPuoi riprovare dalla scheda dell\'atleta, tab "Accessi".');
        });
      })
      .then(function () {
        _reconcileAccessi();
        btn.textContent = 'Crea atleta'; btn.disabled = false;
        renderAtleti();
      })
      .catch(function (err) {
        alert('Errore: ' + _authErrorText(err));
        btn.textContent = 'Crea atleta'; btn.disabled = false;
      });
  });

  /* ---- Detail view ---- */

  function _openAtletaDetail(uid) {
    _editingAtleta = _atletiCache.find(function (a) { return a.uid === uid; }) || null;
    if (!_editingAtleta) return;

    _showAtletiView('detail');
    document.getElementById('topbarActions').innerHTML = '';
    document.getElementById('atletaDetailNome').textContent =
      (_editingAtleta.cognome || '') + ' ' + (_editingAtleta.nome || '');

    document.getElementById('detAnagraficaFields').innerHTML = _atletaFormHtml(_editingAtleta);
    document.getElementById('detAnagraficaMsg').textContent = '';

    document.getElementById('detCertScadenza').value = _editingAtleta.certMedicoScadenza || '';
    var certUrl = _editingAtleta.certMedicoUrl || '';
    document.getElementById('certPdfUrl').value = certUrl;
    document.getElementById('certPdfLinkWrap').classList.toggle('is-hidden', !certUrl);
    if (certUrl) document.getElementById('certPdfLink').href = _driveViewUrl(certUrl);

    var modUrl = _editingAtleta.moduloIscrizioneUrl || '';
    document.getElementById('moduloPdfUrl').value = modUrl;
    document.getElementById('moduloPdfLinkWrap').classList.toggle('is-hidden', !modUrl);
    if (modUrl) document.getElementById('moduloPdfLink').href = _driveViewUrl(modUrl);

    document.getElementById('sicurezzaEmail').textContent = _editingAtleta.email || '';
    /* la scheda Sicurezza vale solo per un login atleta proprio; per i genitori c'è il reset email nella tab Accessi */
    document.querySelector('.atleta-tab[data-tab="sicurezza"]').classList.toggle('is-hidden', !_hasOwnLogin(_editingAtleta));
    document.getElementById('sicurezzaMsg').classList.add('is-hidden');
    document.getElementById('sicurezzaMsg').textContent = '';
    document.getElementById('newPassword').value     = '';
    document.getElementById('confirmPassword').value = '';

    _switchAtletaTab('anagrafica');
    _renderRateAdmin();
    _renderAccessiAdmin();
  }

  function _switchAtletaTab(tab) {
    document.querySelectorAll('.atleta-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.tab === tab);
    });
    ['tabAnagrafica', 'tabCertmedico', 'tabRate', 'tabModulo', 'tabAccessi', 'tabSicurezza'].forEach(function (id) {
      document.getElementById(id).classList.add('is-hidden');
    });
    document.getElementById('tab' + cap(tab)).classList.remove('is-hidden');
  }

  document.querySelectorAll('.atleta-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { _switchAtletaTab(btn.dataset.tab); });
  });

  document.getElementById('atletaBackBtn').addEventListener('click', renderAtleti);

  /* ---- Salva cert. medico ---- */
  document.getElementById('detCertSave').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var before   = Object.assign({}, _editingAtleta);
    var scadenza = document.getElementById('detCertScadenza').value;
    var url      = document.getElementById('certPdfUrl').value.trim();
    _editingAtleta.certMedicoScadenza = scadenza;
    _editingAtleta.certMedicoUrl      = url;
    document.getElementById('certPdfLinkWrap').classList.toggle('is-hidden', !url);
    if (url) document.getElementById('certPdfLink').href = _driveViewUrl(url);
    db.collection('atleti').doc(_editingAtleta.uid)
      .update({ certMedicoScadenza: scadenza, certMedicoUrl: url })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff(before, { certMedicoScadenza: scadenza, certMedicoUrl: url }, ['certMedicoScadenza', 'certMedicoUrl'])); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

  /* ---- Salva modulo iscrizione ---- */
  document.getElementById('detModuloSave').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var before = Object.assign({}, _editingAtleta);
    var url = document.getElementById('moduloPdfUrl').value.trim();
    _editingAtleta.moduloIscrizioneUrl = url;
    document.getElementById('moduloPdfLinkWrap').classList.toggle('is-hidden', !url);
    if (url) document.getElementById('moduloPdfLink').href = _driveViewUrl(url);
    db.collection('atleti').doc(_editingAtleta.uid)
      .update({ moduloIscrizioneUrl: url })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff(before, { moduloIscrizioneUrl: url }, ['moduloIscrizioneUrl'])); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

  /* ---- Password atleta ----
     1) Email di reset (consigliata): Firebase manda il link, l'utente sceglie la password.
     2) Password a mano: chiama la funzione serverless /api/set-athlete-password
        (Vercel + Admin SDK), che verifica che chi chiama sia un dirigente. */
  function _sicurezzaMsg(text, ok) {
    var msg = document.getElementById('sicurezzaMsg');
    msg.textContent = text;
    msg.style.color = ok ? 'var(--a-green)' : 'var(--a-red)';
    msg.classList.remove('is-hidden');
  }

  function _resetErrorText(e) {
    if (e && e.code === 'auth/user-not-found') return 'Nessun account Firebase con questa email.';
    if (e && e.code === 'auth/invalid-email') return 'Indirizzo email non valido.';
    if (e && e.code === 'auth/too-many-requests') return 'Troppi tentativi: riprova tra qualche minuto.';
    return (e && e.message) || 'riprova più tardi.';
  }

  /* Invia l'email di reset a un account; restituisce una Promise. */
  function _sendResetEmail(email, entitaId, entitaLabel) {
    return auth.sendPasswordResetEmail(email).then(function () {
      return _logWrite('atleta', entitaId, entitaLabel, 'update', [{ campo: 'password', prima: null, dopo: 'email di reset inviata' }]);
    });
  }

  document.getElementById('btnResetEmail').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var btn   = this;
    var email = (_editingAtleta.email || '').trim();
    document.getElementById('sicurezzaMsg').classList.add('is-hidden');
    if (!email) { _sicurezzaMsg('Questo atleta non ha un\x27email.', false); return; }
    btn.disabled = true;
    btn.textContent = 'Invio…';
    _sendResetEmail(email, _editingAtleta.uid, _atletaLabel(_editingAtleta))
      .then(function () { _sicurezzaMsg('Email di reset inviata a ' + email + '. Se non arriva, controlla lo spam.', true); })
      .catch(function (e) { _sicurezzaMsg('Errore: ' + _resetErrorText(e), false); })
      .then(function () { btn.disabled = false; btn.textContent = 'Invia email di reset'; });
  });

  document.getElementById('btnCambiaPassword').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var btn     = this;
    var pwd     = document.getElementById('newPassword').value;
    var confirm = document.getElementById('confirmPassword').value;

    document.getElementById('sicurezzaMsg').classList.add('is-hidden');

    if (pwd.length < 6) { _sicurezzaMsg('La password deve avere almeno 6 caratteri.', false); return; }
    if (pwd !== confirm) { _sicurezzaMsg('Le due password non coincidono.', false); return; }

    btn.disabled = true;
    btn.textContent = 'Salvataggio…';

    var atleta = _editingAtleta;
    auth.currentUser.getIdToken()
      .then(function (token) {
        return fetch('/api/set-athlete-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ uid: atleta.uid, password: pwd })
        });
      })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || ('Errore ' + res.status));
        });
      })
      .then(function () {
        document.getElementById('newPassword').value     = '';
        document.getElementById('confirmPassword').value = '';
        _sicurezzaMsg('Password aggiornata con successo.', true);
        return _logWrite('atleta', atleta.uid, _atletaLabel(atleta), 'update', [{ campo: 'password', prima: null, dopo: 'impostata da un dirigente' }]);
      })
      .catch(function (e) { _sicurezzaMsg('Errore: ' + (e.message || 'riprova più tardi.'), false); })
      .then(function () { btn.disabled = false; btn.textContent = 'Salva password'; });
  });

  /* ---- Accessi (atleta + genitori) ---- */
  function _renderAccessiAdmin() {
    var el  = document.getElementById('accessiList');
    var acc = _accessiOf(_editingAtleta);
    if (!acc.length) {
      el.innerHTML = '<p style="color:var(--a-muted);font-size:13px">Nessun accesso: nessuno può vedere questa scheda dall\'area atleti.</p>';
      return;
    }
    el.innerHTML = acc.map(function (x) {
      var isOwn = x.ruolo === 'atleta';
      return '<div class="atleta-rate-item">' +
        '<div class="atleta-rate-info">' +
          '<div class="atleta-rate-desc">' + esc(isOwn ? 'Atleta' : ('Genitore' + (x.nome ? ' — ' + x.nome : ''))) + '</div>' +
          '<div class="atleta-rate-meta">' + esc(x.email) + '</div>' +
        '</div>' +
        (isOwn ? '' :
          '<div class="atleta-rate-actions">' +
            '<button class="btn-icon" onclick="AdminActions.resetAccesso(\'' + esc(x.uid) + '\')" title="Invia email di reset password">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>' +
            '</button>' +
            '<button class="btn-icon btn-icon--danger" onclick="AdminActions.removeAccesso(\'' + esc(x.uid) + '\')" title="Scollega">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>' +
            '</button>' +
          '</div>') +
      '</div>';
    }).join('');
  }

  document.getElementById('accAdd').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var nome  = document.getElementById('accNome').value.trim();
    var email = document.getElementById('accEmail').value.trim();
    var pwd   = document.getElementById('accPassword').value;
    if (!email) { alert('Inserisci l\'email del genitore.'); return; }
    var btn = this;
    btn.disabled = true; btn.textContent = 'Aggiunta…';
    _linkParent(_editingAtleta, nome, email, pwd)
      .then(function () {
        ['accNome', 'accEmail', 'accPassword'].forEach(function (id) { document.getElementById(id).value = ''; });
        _renderAccessiAdmin();
      })
      .catch(function (e) { alert('Errore: ' + _authErrorText(e)); })
      .then(function () { btn.disabled = false; btn.textContent = 'Aggiungi'; });
  });

  window.AdminActions.resetAccesso = function (uid) {
    if (!_editingAtleta) return;
    var x = _accessiOf(_editingAtleta).filter(function (a) { return a.uid === uid; })[0];
    if (!x || !x.email) return;
    _sendResetEmail(x.email, _editingAtleta.uid, _atletaLabel(_editingAtleta))
      .then(function () { alert('Email di reset inviata a ' + x.email + '. Se non arriva, controlla lo spam.'); })
      .catch(function (e) { alert('Errore: ' + _resetErrorText(e)); });
  };

  window.AdminActions.removeAccesso = function (uid) {
    if (!_editingAtleta) return;
    confirm(
      'Scollegare questo genitore dall\'atleta? Non vedrà più la sua scheda. L\'account resta su Firebase e le altre schede collegate non cambiano.',
      function () {
        var before  = _accessiOf(_editingAtleta).map(function (x) { return Object.assign({}, x); });
        var accessi = before.filter(function (x) { return x.uid !== uid; });
        var upd = { accessi: accessi, accessUids: accessi.map(function (x) { return x.uid; }) };
        db.collection('atleti').doc(_editingAtleta.uid).update(upd)
          .then(function () {
            Object.assign(_editingAtleta, upd);
            _reconcileAccessi();
            return _logWrite('atleta', _editingAtleta.uid, _atletaLabel(_editingAtleta), 'update', _diff({ accessi: before }, upd, ['accessi']));
          })
          .then(_renderAccessiAdmin)
          .catch(function (e) { alert('Errore: ' + e.message); });
      }
    );
  };

  /* ---- Google Drive URL helper ---- */
  function _driveViewUrl(url) {
    /* converte link di condivisione Drive in link di visualizzazione diretto */
    if (!url) return '#';
    var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/view';
    return url;
  }

  /* ---- AdminActions: atleti ---- */
  window.AdminActions.editAtleta = function (uid) { _openAtletaDetail(uid); };

  /* ================================================
     AVVISI (collezione `comunicazioni`, letta dall'area atleti)
     { categoria: nome squadra | 'tutte', titolo, testo, importante, allegatoUrl,
       createdAt (ISO), autore }
  ================================================ */
  var _comunicazioniCache = [];
  var _editingComunicazione = null;

  function renderComunicazioni() {
    showSubview('comunicazioni', 'list');
    setTopbarBtn('Nuovo avviso', function () { _openComunicazioneForm(null); });
    document.getElementById('comunicazioniBody').innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:var(--a-muted);padding:20px">Caricamento…</td></tr>';

    db.collection('comunicazioni').get().then(function (snap) {
      _comunicazioniCache = [];
      snap.forEach(function (d) { _comunicazioniCache.push(Object.assign({}, d.data(), { id: d.id })); });
      _comunicazioniCache.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      _renderComunicazioniRows();
    }).catch(function (err) {
      console.error('[Avvisi]', err);
      document.getElementById('comunicazioniBody').innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  function _destLabel(c) { return c === 'tutte' ? 'Tutta la società' : c; }

  function _renderComunicazioniRows() {
    if (!_comunicazioniCache.length) {
      document.getElementById('comunicazioniBody').innerHTML =
        '<tr><td colspan="4"><div class="empty-state"><p>Nessun avviso pubblicato.</p></div></td></tr>';
      return;
    }
    document.getElementById('comunicazioniBody').innerHTML = _comunicazioniCache.map(function (c) {
      return '<tr>' +
        '<td style="white-space:nowrap">' + _fmtDate((c.createdAt || '').slice(0, 10)) + '</td>' +
        '<td><span class="chip ' + (c.categoria === 'tutte' ? 'chip--gray' : 'chip--blue') + '">' + esc(_destLabel(c.categoria)) + '</span></td>' +
        '<td><div class="table-title">' + (c.importante ? '<span style="color:var(--a-red)">● </span>' : '') + esc(c.titolo) + '</div></td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.editComunicazione(\'' + esc(c.id) + '\')" title="Modifica">' + EDIT_ICON_SM + '</button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteComunicazione(\'' + esc(c.id) + '\')" title="Elimina">' + DEL_ICON_SM + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function _openComunicazioneForm(id) {
    _editingComunicazione = id ? (_comunicazioniCache.find(function (c) { return c.id === id; }) || null) : null;
    var c = _editingComunicazione || {};
    showSubview('comunicazioni', 'form');
    document.getElementById('topbarActions').innerHTML = '';

    document.getElementById('comDest').innerHTML = '<option value="">Seleziona…</option><option value="tutte">Tutta la società</option>' +
      VV.getCategories().map(function (cat) {
        return '<option value="' + esc(cat.name) + '">' + esc(cat.name) + '</option>';
      }).join('');
    document.getElementById('comDest').value         = c.categoria || '';
    document.getElementById('comImportante').checked = !!c.importante;
    document.getElementById('comTitolo').value       = c.titolo || '';
    document.getElementById('comTesto').value        = c.testo || '';
    document.getElementById('comAllegato').value     = c.allegatoUrl || '';
    document.getElementById('comSave').textContent   = _editingComunicazione ? 'Salva modifiche' : 'Pubblica';
  }

  document.getElementById('comCancel').addEventListener('click', renderComunicazioni);

  document.getElementById('comSave').addEventListener('click', function () {
    var before = _editingComunicazione;
    var data = {
      categoria:   document.getElementById('comDest').value,
      titolo:      document.getElementById('comTitolo').value.trim(),
      testo:       document.getElementById('comTesto').value.trim(),
      importante:  document.getElementById('comImportante').checked,
      allegatoUrl: document.getElementById('comAllegato').value.trim(),
      createdAt:   before ? before.createdAt : new Date().toISOString(),
      autore:      before ? (before.autore || '') : (_dirigenteNome || '')
    };
    if (!data.categoria || !data.titolo || !data.testo) {
      alert('Destinatari, titolo e testo sono obbligatori.'); return;
    }
    if (data.allegatoUrl && !/^https:\/\//i.test(data.allegatoUrl)) {
      alert('Il link allegato deve iniziare con https://'); return;
    }

    var ref   = before ? db.collection('comunicazioni').doc(before.id) : db.collection('comunicazioni').doc();
    var label = 'Avviso — ' + data.titolo;
    var btn   = this;
    btn.disabled = true;

    ref.set(data)
      .then(function () {
        return _logWrite('avviso', ref.id, label, before ? 'update' : 'create',
          _diff(before || {}, data, ['categoria', 'titolo', 'testo', 'importante', 'allegatoUrl']));
      })
      .then(function () { btn.disabled = false; renderComunicazioni(); })
      .catch(function (e) { btn.disabled = false; alert('Errore: ' + e.message); });
  });

  window.AdminActions.editComunicazione = function (id) { _openComunicazioneForm(id); };

  window.AdminActions.deleteComunicazione = function (id) {
    var target = _comunicazioniCache.find(function (c) { return c.id === id; });
    confirm('Eliminare questo avviso? Sparirà dall\'area atleti di tutti i destinatari.', function () {
      db.collection('comunicazioni').doc(id).delete()
        .then(function () {
          return _logWrite('avviso', id, 'Avviso — ' + (target ? target.titolo : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
        })
        .then(renderComunicazioni)
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ================================================
     PRESENZE (riepilogo per l'allenatore: chi ha risposto "ci sarò / non ci sarò")
     Le risposte stanno in `presenze`, scritte da atleti e genitori dall'area atleti.
     Gli eventi (partite + allenamenti ricorrenti) si ricostruiscono qui con le
     stesse chiavi dell'area atleti: p-<idPartita> e a-<idAllenamento>-<data>.
  ================================================ */
  var PRES_PASSATI_GIORNI     = 7;
  var PRES_ALLENAMENTI_GIORNI = 14;
  var PRES_PARTITE_GIORNI     = 60;
  var _presToken = 0;

  function _presIso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function _presAddDays(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return _presIso(d); }
  function _presWeekday(iso) { return (new Date(iso + 'T00:00:00').getDay() + 6) % 7 + 1; } /* 1=lun … 7=dom */
  function _presSafeId(s) { return String(s).replace(/\//g, '_'); }

  function renderPresenze() {
    var sel  = document.getElementById('presCat');
    var prev = sel.value;
    sel.innerHTML = '<option value="">Seleziona…</option>' +
      VV.getCategories().map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
      }).join('');
    sel.value = prev;
    _loadPresenzeAdmin();
  }

  document.getElementById('presCat').addEventListener('change', _loadPresenzeAdmin);

  function _presEvents(cat, trainings) {
    var today = _presIso(new Date());
    var from  = _presAddDays(today, -PRES_PASSATI_GIORNI);
    var evs   = [];

    VV.getPartite()
      .filter(function (p) { return p.categoria === cat && p.data >= from && p.data <= _presAddDays(today, PRES_PARTITE_GIORNI); })
      .forEach(function (p) {
        evs.push({ key: _presSafeId('p-' + p.id), tipo: 'partita', date: p.data, start: p.ora || '',
                   title: (p.squadra_casa || '') + ' – ' + (p.squadra_ospite || '') });
      });

    trainings.forEach(function (t) {
      for (var i = -PRES_PASSATI_GIORNI; i <= PRES_ALLENAMENTI_GIORNI; i++) {
        var day = _presAddDays(today, i);
        if (_presWeekday(day) !== +t.giorno) continue;
        if (t.validoFino && day > t.validoFino) continue;
        evs.push({ key: _presSafeId('a-' + t.id + '-' + day), tipo: 'allenamento', date: day, start: t.oraInizio || '',
                   title: 'Allenamento' });
      }
    });

    function cmp(a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }
    return {
      future: evs.filter(function (e) { return e.date >= today; }).sort(cmp),
      past:   evs.filter(function (e) { return e.date <  today; }).sort(function (a, b) { return cmp(b, a); })
    };
  }

  function _loadPresenzeAdmin() {
    var cat = document.getElementById('presCat').value;
    var box = document.getElementById('presenzeBody');
    if (!cat) { box.innerHTML = '<p class="pres-empty">Scegli una categoria per vedere le risposte.</p>'; return; }
    box.innerHTML = '<p class="pres-empty">Caricamento…</p>';

    var token = ++_presToken;
    Promise.all([
      db.collection('atleti').where('categoria', '==', cat).get(),
      db.collection('presenze').where('categoria', '==', cat).get(),
      db.collection('allenamenti').where('categoria', '==', cat).get()
    ]).then(function (res) {
      if (token !== _presToken) return;

      var roster = [];
      res[0].forEach(function (d) {
        var x = d.data();
        roster.push({ id: d.id, nome: ((x.cognome || '') + ' ' + (x.nome || '')).trim() });
      });
      roster.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it'); });

      var risp = {};   /* eventKey → { atletaId: 'si' | 'no' } */
      res[1].forEach(function (d) {
        var x = d.data();
        (risp[x.eventKey] = risp[x.eventKey] || {})[x.atletaId] = x.risposta;
      });

      var trainings = [];
      res[2].forEach(function (d) { trainings.push(Object.assign({ id: d.id }, d.data())); });

      box.innerHTML = _presenzeHtml(roster, risp, _presEvents(cat, trainings));
    }).catch(function (err) {
      if (token !== _presToken) return;
      console.error('[Presenze]', err);
      box.innerHTML = '<p class="pres-empty" style="color:var(--a-red)">Errore nel caricamento.</p>';
    });
  }

  function _presenzeHtml(roster, risp, evs) {
    if (!roster.length) return '<p class="pres-empty">Nessun atleta in questa categoria.</p>';

    function names(list) {
      return list.length
        ? '<ul>' + list.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
        : '<p class="pres-none">—</p>';
    }

    function eventHtml(ev, isPast) {
      var r  = risp[ev.key] || {};
      var si = [], no = [], nr = [];
      roster.forEach(function (a) {
        var v = r[a.id];
        (v === 'si' ? si : v === 'no' ? no : nr).push(a.nome);
      });
      var day = new Date(ev.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
      return '<details class="pres-event' + (isPast ? ' is-past' : '') + '">' +
        '<summary>' +
          '<span class="pres-when">' + esc(day) + (ev.start ? ' · ' + esc(ev.start) : '') + '</span>' +
          '<span class="pres-title">' + esc(ev.title) + '</span>' +
          '<span class="chip ' + (ev.tipo === 'partita' ? 'chip--blue' : 'chip--gray') + '">' + (ev.tipo === 'partita' ? 'Partita' : 'Allenamento') + '</span>' +
          '<span class="pres-counts">' +
            '<b class="pres-si">' + si.length + ' sì</b>' +
            '<b class="pres-no">' + no.length + ' no</b>' +
            '<b class="pres-nr">' + nr.length + ' senza risposta</b>' +
          '</span>' +
        '</summary>' +
        '<div class="pres-cols">' +
          '<div><h4>Ci sono (' + si.length + ')</h4>' + names(si) + '</div>' +
          '<div><h4>Non ci sono (' + no.length + ')</h4>' + names(no) + '</div>' +
          '<div><h4>Senza risposta (' + nr.length + ')</h4>' + names(nr) + '</div>' +
        '</div></details>';
    }

    return '<h3 class="pres-h">Prossimi impegni</h3>' +
      (evs.future.length ? evs.future.map(function (e) { return eventHtml(e, false); }).join('') : '<p class="pres-empty">Nessun impegno in programma.</p>') +
      (evs.past.length
        ? '<h3 class="pres-h">Ultimi ' + PRES_PASSATI_GIORNI + ' giorni</h3>' + evs.past.map(function (e) { return eventHtml(e, true); }).join('')
        : '');
  }

  /* ================================================
     ALLENAMENTI (orari settimanali per categoria, letti dall'area atleti)
     collezione `allenamenti`: { categoria (nome), giorno 1=lun…7=dom,
     oraInizio, oraFine, luogo, validoFino (data, facoltativa), note }
  ================================================ */
  var GIORNI_SETTIMANA = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  var _allenamentiCache   = [];
  var _editingAllenamento = null;

  function renderAllenamenti() {
    showSubview('allenamenti', 'list');
    setTopbarBtn('Nuovo allenamento', function () { _openAllenamentoForm(null); });
    document.getElementById('allenamentiBody').innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--a-muted);padding:20px">Caricamento…</td></tr>';

    db.collection('allenamenti').get().then(function (snap) {
      _allenamentiCache = [];
      snap.forEach(function (d) { _allenamentiCache.push(Object.assign({}, d.data(), { id: d.id })); });
      _allenamentiCache.sort(function (a, b) {
        return (a.categoria || '').localeCompare(b.categoria || '', 'it') ||
               (a.giorno - b.giorno) ||
               (a.oraInizio || '').localeCompare(b.oraInizio || '');
      });
      _renderAllenamentiRows();
    }).catch(function (err) {
      console.error('[Allenamenti]', err);
      document.getElementById('allenamentiBody').innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  function _renderAllenamentiRows() {
    if (!_allenamentiCache.length) {
      document.getElementById('allenamentiBody').innerHTML =
        '<tr><td colspan="6"><div class="empty-state"><p>Nessun allenamento inserito.</p></div></td></tr>';
      return;
    }
    document.getElementById('allenamentiBody').innerHTML = _allenamentiCache.map(function (a) {
      var scaduto = a.validoFino && _daysDiff(a.validoFino) < 0;
      return '<tr' + (scaduto ? ' style="opacity:.55"' : '') + '>' +
        '<td><span class="chip chip--blue">' + esc(a.categoria || '') + '</span></td>' +
        '<td>' + esc(GIORNI_SETTIMANA[a.giorno] || '—') + '</td>' +
        '<td style="white-space:nowrap">' + esc(a.oraInizio || '') + (a.oraFine ? ' &ndash; ' + esc(a.oraFine) : '') + '</td>' +
        '<td style="font-size:12px;color:var(--a-muted)">' + esc(a.luogo || '—') + '</td>' +
        '<td>' + (a.validoFino ? _fmtDate(a.validoFino) + (scaduto ? ' (concluso)' : '') : '—') + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.editAllenamento(\'' + esc(a.id) + '\')" title="Modifica">' + EDIT_ICON_SM + '</button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteAllenamento(\'' + esc(a.id) + '\')" title="Elimina">' + DEL_ICON_SM + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function _openAllenamentoForm(id) {
    _editingAllenamento = id ? (_allenamentiCache.find(function (a) { return a.id === id; }) || null) : null;
    var a = _editingAllenamento || {};
    showSubview('allenamenti', 'form');
    document.getElementById('topbarActions').innerHTML = '';

    document.getElementById('allenCat').innerHTML = '<option value="">Seleziona…</option>' +
      VV.getCategories().map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
      }).join('');
    document.getElementById('allenGiorno').innerHTML = '<option value="">Seleziona…</option>' +
      GIORNI_SETTIMANA.slice(1).map(function (g, i) {
        return '<option value="' + (i + 1) + '">' + g + '</option>';
      }).join('');

    document.getElementById('allenCat').value    = a.categoria  || '';
    document.getElementById('allenGiorno').value = a.giorno ? String(a.giorno) : '';
    document.getElementById('allenInizio').value = a.oraInizio  || '';
    document.getElementById('allenFine').value   = a.oraFine    || '';
    document.getElementById('allenLuogo').value  = a.luogo      || '';
    document.getElementById('allenFino').value   = a.validoFino || '';
    document.getElementById('allenNote').value   = a.note       || '';
  }

  document.getElementById('allenCancel').addEventListener('click', renderAllenamenti);

  document.getElementById('allenSave').addEventListener('click', function () {
    var data = {
      categoria:  document.getElementById('allenCat').value,
      giorno:     +document.getElementById('allenGiorno').value || 0,
      oraInizio:  document.getElementById('allenInizio').value,
      oraFine:    document.getElementById('allenFine').value,
      luogo:      document.getElementById('allenLuogo').value.trim(),
      validoFino: document.getElementById('allenFino').value,
      note:       document.getElementById('allenNote').value.trim()
    };
    if (!data.categoria || !data.giorno || !data.oraInizio) {
      alert('Categoria, giorno e ora di inizio sono obbligatori.'); return;
    }
    if (data.oraFine && data.oraFine <= data.oraInizio) {
      alert('L\'ora di fine deve essere dopo quella di inizio.'); return;
    }

    var before = _editingAllenamento;
    var ref    = before ? db.collection('allenamenti').doc(before.id) : db.collection('allenamenti').doc();
    var label  = 'Allenamento — ' + data.categoria + ' ' + GIORNI_SETTIMANA[data.giorno] + ' ' + data.oraInizio;
    var btn    = this;
    btn.disabled = true;

    ref.set(data)
      .then(function () {
        return _logWrite('allenamento', ref.id, label, before ? 'update' : 'create',
          _diff(before || {}, data, Object.keys(data)));
      })
      .then(function () { btn.disabled = false; renderAllenamenti(); })
      .catch(function (e) { btn.disabled = false; alert('Errore: ' + e.message); });
  });

  window.AdminActions.editAllenamento = function (id) { _openAllenamentoForm(id); };

  window.AdminActions.deleteAllenamento = function (id) {
    var target = _allenamentiCache.find(function (a) { return a.id === id; });
    confirm('Eliminare questo allenamento? Sparirà dal calendario di atleti e genitori.', function () {
      db.collection('allenamenti').doc(id).delete()
        .then(function () {
          return _logWrite('allenamento', id,
            'Allenamento — ' + (target ? target.categoria + ' ' + GIORNI_SETTIMANA[target.giorno] + ' ' + target.oraInizio : id),
            'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
        })
        .then(renderAllenamenti)
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

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
        return _migrateFieldIfBase64(a.image, 'articles').then(function (url) {
          if (url === a.image) return false;
          a.image = url;
          return new Promise(function (resolve) { DB.saveArticle(a, function () { resolve(true); }); });
        });
      }});
    });

    VV.getPlayers().forEach(function (p) {
      jobs.push({ label: 'Giocatore — ' + p.name, run: function () {
        return _migrateFieldIfBase64(p.photo, 'players').then(function (url) {
          if (url === p.photo) return false;
          p.photo = url;
          return new Promise(function (resolve) { DB.savePlayer(p, function () { resolve(true); }); });
        });
      }});
    });

    VV.getStaff().forEach(function (s) {
      jobs.push({ label: 'Staff — ' + s.name, run: function () {
        return _migrateFieldIfBase64(s.photo, 'staff').then(function (url) {
          if (url === s.photo) return false;
          s.photo = url;
          return new Promise(function (resolve) { DB.saveStaffMember(s, function () { resolve(true); }); });
        });
      }});
    });

    VV.getPartite().forEach(function (m) {
      var label = 'Partita — ' + (m.squadra_casa || '?') + ' vs ' + (m.squadra_ospite || '?');
      jobs.push({ label: label + ' (logo casa)', run: function () {
        return _migrateFieldIfBase64(m.logo_casa, 'matches').then(function (url) {
          if (url === m.logo_casa) return false;
          m.logo_casa = url;
          return new Promise(function (resolve) { DB.savePartita(m, function () { resolve(true); }); });
        });
      }});
      jobs.push({ label: label + ' (logo ospite)', run: function () {
        return _migrateFieldIfBase64(m.logo_ospite, 'matches').then(function (url) {
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
          return _migrateFieldIfBase64(s.logo, 'sponsors').then(function (url) {
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

  /* ---- AdminActions: sponsor ---- */
  window.AdminActions.editSponsor = function (id) {
    var s = VV.getSponsors().find(function (x) { return x.id === id; });
    if (!s) return;
    _spEditing = s;
    document.getElementById('spFormTitle').textContent = 'Modifica sponsor';
    document.getElementById('spLogoUrl').value  = s.logo  || '';
    document.getElementById('spNome').value      = s.nome  || '';
    document.getElementById('spUrl').value       = s.url   || '';
    document.getElementById('spOrder').value     = String(s.order || 1);
    document.getElementById('spLivello').value   = s.livello || 'silver';
    document.getElementById('spRipetizioni').value = String(s.ripetizioni || 1);
    _syncSpPreview();
    document.getElementById('spLogoEditor').style.display = 'none';
    document.getElementById('spForm').classList.remove('is-hidden');
    document.getElementById('spNome').focus();
  };

  window.AdminActions.deleteSponsor = function (id) {
    confirm('Eliminare questo sponsor?', function () {
      var list = VV.getSponsors().filter(function (s) { return s.id !== id; });
      DB.saveSponsors(list);
      refreshSpList();
    });
  };

  window.AdminActions.setSponsorOrder = function (id, order) {
    var list = VV.getSponsors().map(function (s) {
      return s.id === id ? Object.assign({}, s, { order: order }) : s;
    });
    list.sort(function (a, b) { return (a.order||0) - (b.order||0); });
    DB.saveSponsors(list);
    refreshSpList();
  };

  /* ================================================
     INTERFACCIA CONDIVISA — window.Admin
     Helper usati anche dai file in js/admin/ (budget.js). Qui restano gli helper
     generici (audit log, modali, valore dei campi); lo stato del Budget si legge
     tramite Admin.budget.state, definito in js/admin/budget.js.
  ================================================ */
  function _bs() { return Admin.budget.state; }
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
        if (OPEN_FIELDS.indexOf(ch.campo) !== -1 || (entita === 'atleta' && (ATLETA_SENSIBILI || []).indexOf(ch.campo) !== -1)) return { campo: ch.campo, aperto: true };
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
    renderAtletiRows: _renderAtletiRows, renderRateAdmin: _renderRateAdmin,
    stagioneCorrenteNome: _stagioneCorrenteNome,
    EDIT_ICON_SM: EDIT_ICON_SM
  };

})();
