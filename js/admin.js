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
        _loadBudgetData(function () {
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
    dashboard: 'Dashboard', articoli: 'Articoli', calendario: 'Calendario', pianoEditoriale: 'Piano Editoriale',
    bacheca: 'Bacheca', galleria: 'Galleria', squadre: 'Squadre',
    sponsor: 'Sponsor', atleti: 'Atleti', dirigenti: 'Dirigenti', girone: 'Girone Prima Divisione', datiJson: 'File JSON',
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
    _initSidebarToggle();
    window.addEventListener('popstate', function (e) {
      var section = (e.state && e.state.section) || _sectionFromPath();
      _suppressPush = true;
      goTo(section);
      _suppressPush = false;
    });
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
    if (section === 'pianoEditoriale') renderPianoEditoriale();
    if (section === 'bacheca')    renderBacheca();
    if (section === 'galleria')   renderGalleria();
    if (section === 'squadre')    renderSquadre();
    if (section === 'sponsor')    renderSponsor();
    if (section === 'atleti')     renderAtleti();
    if (section === 'dirigenti')  renderDirigenti();
    if (section === 'datiJson')   renderDatiJson();
    if (section === 'log')        _renderLog();
    if (section === 'budget')     _renderActiveBudgetTab();

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

    _renderDashBudgetWidget();
    _renderDashCashflowWidget();
    _renderDashSpeseWidget();
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

  function renderGalleria() {
    showSubview('galleria', 'list');
    setTopbarBtn('Nuovo album', function () {
      showSubview('galleria', 'form');
      document.getElementById('topbarActions').innerHTML = '';
    });

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
    var actions = document.getElementById('topbarActions');
    actions.innerHTML = '';
    actions.appendChild(backBtn);

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
          '<img src="' + p.dataUrl + '" alt="' + esc(p.name) + '" loading="lazy">' +
          '<div class="photo-item-overlay">' +
            '<button class="photo-delete" onclick="AdminActions.deletePhoto(' + p.id + ')">Elimina</button>' +
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

    PhotoDB.addPhotos(_currentAlbumId, files,
      function (done, total) {
        var pct = Math.round(done / total * 100);
        bar.style.transform = 'scaleX(' + (pct / 100) + ')';
        text.textContent = done + ' / ' + total + ' foto caricate';
      },
      function (count) {
        var album = VV.getAlbum(_currentAlbumId);
        if (album) { album.photoCount = (album.photoCount || 0) + count; DB.saveAlbum(album); }
        setTimeout(function () { progress.classList.add('is-hidden'); }, 800);
        loadPhotos(_currentAlbumId);
        this.value = '';
      }.bind(this)
    );
  });

  document.getElementById('albumSave').addEventListener('click', function () {
    var title = document.getElementById('albumTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var album = {
      title:      title,
      date:       document.getElementById('albumDate').value,
      category:   document.getElementById('albumCategory').value,
      photoCount: 0
    };
    var saved = DB.saveAlbum(album);
    openAlbum(saved.id);
  });

  document.getElementById('albumCancel').addEventListener('click', renderGalleria);

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
        cb(dataUrl, outW, outH);
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
    resizeToFullHD(file, function (dataUrl, w, h) {
      document.getElementById('artImage').value = dataUrl;
      document.getElementById('artPhotoFocus').value = '';
      var kb = Math.round(dataUrl.length * 0.75 / 1024);
      var info = w + ' × ' + h + ' px · ~' + kb + ' KB';
      if (kb > 750) info += '  ⚠ file grande';
      _setArtPreview(dataUrl, info);
      _showArtFocusPicker(dataUrl, '');
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
        cb(_trimAndScale(canvas, size).toDataURL('image/png'));
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
        convertLogoToPng(this.files[0], 256, function (dataUrl) {
          document.getElementById(cfg.url).value = dataUrl;
          _syncLogoPreview(cfg.url, cfg.preview);
          fileEl.value = '';
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
        cb(canvas.toDataURL('image/jpeg', 0.85));
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
      resizePlayerPhoto(this.files[0], function (dataUrl) {
        document.getElementById('playerPhoto').value = dataUrl;
        var focus = document.getElementById('playerPhotoFocus').value || '50% 25%';
        _showFocusPicker('player', dataUrl, focus);
        fileEl.value = '';
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
      resizePlayerPhoto(this.files[0], function (dataUrl) {
        document.getElementById('staffPhoto').value = dataUrl;
        var focus = document.getElementById('staffPhotoFocus').value || '50% 25%';
        _showFocusPicker('staff', dataUrl, focus);
        fileEl.value = '';
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
  }

  document.getElementById('magliaSave').addEventListener('click', function () {
    var revealRaw = document.getElementById('magliaRevealDate').value;
    var title = document.getElementById('magliaTitle').value.trim();
    if (!title) { alert('Il titolo è obbligatorio.'); return; }
    var obj = {
      enabled:    document.getElementById('magliaEnabled').checked,
      title:      title,
      subtitle:   document.getElementById('magliaSubtitle').value.trim(),
      revealDate: revealRaw ? revealRaw + ':00' : ''
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
      _prepareSpLogoSource(file, function (dataUrl, w, h) {
        _initSpLogoEditor();
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

  /* Carica il file, rimuove lo sfondo quasi-bianco ma NON ritaglia/centra:
     l'inquadratura finale la sceglie l'admin nell'editor. */
  function _prepareSpLogoSource(file, cb) {
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
        _removeWhiteBg(ctx, outW, outH);
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

      document.getElementById('spLogoUrl').value = canvas.toDataURL('image/png');
      _syncSpPreview();
      document.getElementById('spLogoEditor').style.display = 'none';
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
      confirm('Eliminare l\'album e tutte le sue foto?', function () {
        PhotoDB.deleteAlbumPhotos(id, function () {
          DB.deleteAlbum(id, refreshAlbumsGrid);
        });
      });
    },
    deletePhoto: function (id) {
      confirm('Eliminare questa foto?', function () {
        PhotoDB.deletePhoto(id, function () {
          var album = VV.getAlbum(_currentAlbumId);
          if (album && album.photoCount > 0) { album.photoCount--; DB.saveAlbum(album); }
          loadPhotos(_currentAlbumId);
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

    db.collection('atleti').get().then(function (snap) {
      _atletiCache = [];
      snap.forEach(function (doc) {
        _atletiCache.push(Object.assign({ uid: doc.id }, doc.data()));
      });
      /* ordina per scadenza cert. medico più imminente */
      _atletiCache.sort(function (a, b) {
        var da = a.certMedicoScadenza || '9999-12-31';
        var db_ = b.certMedicoScadenza || '9999-12-31';
        return da < db_ ? -1 : da > db_ ? 1 : 0;
      });
      _renderAtletiRows();
    }).catch(function (err) {
      console.error('[Atleti]', err);
      document.getElementById('atletiBody').innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  function _renderAtletiRows() {
    if (!_atletiCache.length) {
      document.getElementById('atletiBody').innerHTML =
        '<tr><td colspan="6"><div class="empty-state"><p>Nessun atleta registrato.</p></div></td></tr>';
      return;
    }
    document.getElementById('atletiBody').innerHTML = _atletiCache.map(function (a) {
      var rate    = a.rate || [];
      var totale  = rate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      var saldato = rate.filter(function (r) { return r.pagata; })
                        .reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      return '<tr>' +
        '<td><div class="table-title">' + esc(a.cognome) + ' ' + esc(a.nome) + '</div>' +
          '<div class="table-sub">' + esc(a.email) + '</div></td>' +
        '<td>' + (a.categoria
          ? '<span class="chip chip--blue">' + esc(a.categoria) + '</span>'
          : '<span class="chip chip--gray">—</span>') + '</td>' +
        '<td>' + _certChip(a.certMedicoScadenza) + '</td>' +
        '<td style="font-weight:600">€' + totale.toFixed(2) + '</td>' +
        '<td>' + (saldato > 0
          ? '<span style="color:var(--a-green);font-weight:600">€' + saldato.toFixed(2) + '</span>'
          : '—') + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.editAtleta(\'' + a.uid + '\')" title="Gestisci">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteAtleta(\'' + a.uid + '\')" title="Elimina">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
          '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
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

  /* ---- Nuovo atleta form ---- */

  function _openAtletaForm() {
    _showAtletiView('form');
    document.getElementById('topbarActions').innerHTML = '';
    var sel = document.getElementById('atletaCategoria');
    sel.innerHTML = '<option value="">Nessuna</option>' +
      VV.getCategories().map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
      }).join('');
    ['atletaNome', 'atletaCognome', 'atletaEmail', 'atletaPassword'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('atletaCertScadenza').value = '';
  }

  document.getElementById('atletaFormCancel').addEventListener('click', renderAtleti);

  document.getElementById('atletaFormSave').addEventListener('click', function () {
    var nome    = document.getElementById('atletaNome').value.trim();
    var cognome = document.getElementById('atletaCognome').value.trim();
    var email   = document.getElementById('atletaEmail').value.trim();
    var pwd     = document.getElementById('atletaPassword').value;
    var categ   = document.getElementById('atletaCategoria').value;
    var certSc  = document.getElementById('atletaCertScadenza').value;

    if (!nome || !cognome || !email || !pwd) {
      alert('Nome, cognome, email e password sono obbligatori.'); return;
    }
    if (pwd.length < 6) { alert('La password deve avere almeno 6 caratteri.'); return; }

    var btn = document.getElementById('atletaFormSave');
    btn.textContent = 'Creazione…'; btn.disabled = true;

    /* secondary app per non disconnettere l'admin */
    var existing  = firebase.apps.find(function (a) { return a.name === 'atleta-creator'; });
    var secondary = existing || firebase.initializeApp(firebase.app().options, 'atleta-creator');
    var secAuth   = secondary.auth();

    secAuth.createUserWithEmailAndPassword(email, pwd)
      .then(function (cred) {
        var uid = cred.user.uid;
        return secAuth.signOut().then(function () {
          var data = {
            uid: uid, nome: nome, cognome: cognome, email: email,
            categoria: categ, certMedicoScadenza: certSc,
            certMedicoUrl: '', moduloIscrizioneUrl: '',
            rate: [], note: '', createdAt: new Date().toISOString()
          };
          return db.collection('atleti').doc(uid).set(data).then(function () {
            return _logWrite('atleta', uid, 'Atleta — ' + cognome + ' ' + nome, 'create', _diff({}, data, Object.keys(data)));
          });
        });
      })
      .then(renderAtleti)
      .catch(function (err) {
        var msg = err.code === 'auth/email-already-in-use'
          ? 'Email già registrata.' : err.message;
        alert('Errore: ' + msg);
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

    var catSel = document.getElementById('detCategoria');
    catSel.innerHTML = '<option value="">Nessuna</option>' +
      VV.getCategories().map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
      }).join('');

    document.getElementById('detNome').value      = _editingAtleta.nome     || '';
    document.getElementById('detCognome').value   = _editingAtleta.cognome  || '';
    document.getElementById('detEmail').value     = _editingAtleta.email    || '';
    document.getElementById('detCategoria').value = _editingAtleta.categoria || '';
    document.getElementById('detNote').value      = _editingAtleta.note     || '';

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
    document.getElementById('sicurezzaMsg').classList.add('is-hidden');
    document.getElementById('sicurezzaMsg').textContent = '';
    document.getElementById('newPassword').value     = '';
    document.getElementById('confirmPassword').value = '';

    _switchAtletaTab('anagrafica');
    _renderRateAdmin();
  }

  function _switchAtletaTab(tab) {
    document.querySelectorAll('.atleta-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.tab === tab);
    });
    ['tabAnagrafica', 'tabCertmedico', 'tabRate', 'tabModulo', 'tabSicurezza'].forEach(function (id) {
      document.getElementById(id).classList.add('is-hidden');
    });
    document.getElementById('tab' + cap(tab)).classList.remove('is-hidden');
  }

  document.querySelectorAll('.atleta-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { _switchAtletaTab(btn.dataset.tab); });
  });

  document.getElementById('atletaBackBtn').addEventListener('click', renderAtleti);

  /* ---- Salva anagrafica ---- */
  document.getElementById('detAnagraficaSave').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var before = Object.assign({}, _editingAtleta);
    var upd = {
      nome:      document.getElementById('detNome').value.trim(),
      cognome:   document.getElementById('detCognome').value.trim(),
      categoria: document.getElementById('detCategoria').value,
      note:      document.getElementById('detNote').value.trim()
    };
    Object.assign(_editingAtleta, upd);
    document.getElementById('atletaDetailNome').textContent =
      _editingAtleta.cognome + ' ' + _editingAtleta.nome;
    db.collection('atleti').doc(_editingAtleta.uid).update(upd)
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff(before, upd, Object.keys(upd))); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

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

  /* ---- Cambia password atleta (via Cloud Function) ---- */
  document.getElementById('btnCambiaPassword').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var btn     = this;
    var msg     = document.getElementById('sicurezzaMsg');
    var pwd     = document.getElementById('newPassword').value;
    var confirm = document.getElementById('confirmPassword').value;

    msg.classList.add('is-hidden');

    if (pwd.length < 6) {
      msg.textContent = 'La password deve avere almeno 6 caratteri.';
      msg.style.color = 'var(--a-red)';
      msg.classList.remove('is-hidden');
      return;
    }
    if (pwd !== confirm) {
      msg.textContent = 'Le due password non coincidono.';
      msg.style.color = 'var(--a-red)';
      msg.classList.remove('is-hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Salvataggio…';

    var setPassword = firebase.functions().httpsCallable('setAthletePassword');
    setPassword({ uid: _editingAtleta.uid, password: pwd })
      .then(function () {
        msg.textContent = 'Password aggiornata con successo.';
        msg.style.color = 'var(--a-green)';
        msg.classList.remove('is-hidden');
        document.getElementById('newPassword').value    = '';
        document.getElementById('confirmPassword').value = '';
        btn.disabled = false;
        btn.textContent = 'Salva password';
      })
      .catch(function (e) {
        msg.textContent = 'Errore: ' + (e.message || 'riprova più tardi.');
        msg.style.color = 'var(--a-red)';
        msg.classList.remove('is-hidden');
        btn.disabled = false;
        btn.textContent = 'Salva password';
      });
  });

  /* ---- Rate / Quote ---- */
  function _renderRateAdmin() {
    var rate = (_editingAtleta && _editingAtleta.rate) || [];
    var el   = document.getElementById('rateAdminList');

    if (!rate.length) {
      el.innerHTML = '<p style="color:var(--a-muted);font-size:13px">Nessuna quota inserita.</p>';
      return;
    }

    el.innerHTML = rate.map(function (r, i) {
      return '<div class="atleta-rate-item">' +
        '<div class="atleta-rate-info">' +
          '<div class="atleta-rate-desc">' + esc(r.descrizione || 'Quota') + '</div>' +
          '<div class="atleta-rate-meta">Scadenza: ' + _fmtDate(r.scadenza) +
            ' &nbsp;·&nbsp; €' + (+r.importo || 0).toFixed(2) + '</div>' +
        '</div>' +
        '<div class="atleta-rate-actions">' +
          '<button class="btn-ghost" style="font-size:12px;padding:5px 10px;color:' +
            (r.pagata ? 'var(--a-green)' : 'var(--a-text)') +
            '" onclick="AdminActions.toggleRata(' + i + ')">' +
            (r.pagata ? '✓ Pagata' : 'Segna pagata') +
          '</button>' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteRata(' + i + ')" title="Rimuovi">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  document.getElementById('rataAdd').addEventListener('click', function () {
    if (!_editingAtleta) return;
    var desc    = document.getElementById('rataDesc').value.trim();
    var importo = parseFloat(document.getElementById('rataImporto').value) || 0;
    var scad    = document.getElementById('rataScadenza').value;
    if (!desc) { alert('Inserisci una descrizione.'); return; }

    if (!_editingAtleta.rate) _editingAtleta.rate = [];
    var before = _editingAtleta.rate.map(function (r) { return Object.assign({}, r); });
    _editingAtleta.rate.push({
      id: Date.now().toString(), descrizione: desc,
      importo: importo, scadenza: scad, pagata: false, dataPagamento: null
    });

    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff({ rate: before }, { rate: _editingAtleta.rate }, ['rate'])); })
      .then(function () {
        document.getElementById('rataDesc').value    = '';
        document.getElementById('rataImporto').value = '';
        document.getElementById('rataScadenza').value = '';
        _renderRateAdmin();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  });

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

  window.AdminActions.deleteAtleta = function (uid) {
    var target = _atletiCache.find(function (a) { return a.uid === uid; });
    confirm(
      'Eliminare l\'atleta dal gestionale? Le credenziali Firebase resteranno attive.',
      function () {
        db.collection('atleti').doc(uid).delete()
          .then(function () {
            return _logWrite('atleta', uid, 'Atleta — ' + (target ? target.cognome + ' ' + target.nome : uid), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
          })
          .then(function () {
            _atletiCache = _atletiCache.filter(function (a) { return a.uid !== uid; });
            _renderAtletiRows();
          })
          .catch(function (e) { alert('Errore: ' + e.message); });
      }
    );
  };

  window.AdminActions.toggleRata = function (idx) {
    if (!_editingAtleta || !_editingAtleta.rate) return;
    var before = _editingAtleta.rate.map(function (r) { return Object.assign({}, r); });
    var r = _editingAtleta.rate[idx];
    r.pagata = !r.pagata;
    r.dataPagamento = r.pagata ? new Date().toISOString().slice(0, 10) : null;
    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff({ rate: before }, { rate: _editingAtleta.rate }, ['rate'])); })
      .then(_renderRateAdmin)
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  window.AdminActions.deleteRata = function (idx) {
    if (!_editingAtleta || !_editingAtleta.rate) return;
    var before = _editingAtleta.rate.map(function (r) { return Object.assign({}, r); });
    _editingAtleta.rate.splice(idx, 1);
    db.collection('atleti').doc(_editingAtleta.uid).update({ rate: _editingAtleta.rate })
      .then(function () { return _logWrite('atleta', _editingAtleta.uid, 'Atleta — ' + _editingAtleta.cognome + ' ' + _editingAtleta.nome, 'update', _diff({ rate: before }, { rate: _editingAtleta.rate }, ['rate'])); })
      .then(_renderRateAdmin)
      .catch(function (e) { alert('Errore: ' + e.message); });
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

  function _renderPeGrid() {
    document.getElementById('peMonthLabel').textContent =
      cap(_peMonthCursor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));

    var year  = _peMonthCursor.getFullYear();
    var month = _peMonthCursor.getMonth();
    var firstOfMonth  = new Date(year, month, 1);
    var startOffset   = (firstOfMonth.getDay() + 6) % 7; /* lun = 0 */
    var gridStart     = new Date(year, month, 1 - startOffset);
    var todayYmd      = _peYmd(new Date());

    var itemsByDate = {};
    _peItems.forEach(function (item) {
      if (!item.data) return;
      (itemsByDate[item.data] = itemsByDate[item.data] || []).push(item);
    });

    var html = PE_WEEKDAYS.map(function (w) { return '<div class="pe-cal-weekday">' + w + '</div>'; }).join('');

    for (var i = 0; i < 42; i++) {
      var cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      var ymd      = _peYmd(cellDate);
      var inMonth  = cellDate.getMonth() === month;
      var dayItems = (itemsByDate[ymd] || []).filter(function (it) {
        return (it.piattaforme || []).some(function (p) { return _pePlatformFilter[p]; });
      }).sort(function (a, b) { return (a.ora || '').localeCompare(b.ora || ''); });

      var chipsHtml = dayItems.map(function (it) {
        var platKey = (it.piattaforme || [])[0];
        var plat = PE_PLATFORMS.find(function (p) { return p.key === platKey; }) || PE_PLATFORMS[0];
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

    document.getElementById('peCalGrid').innerHTML = html;
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

  /* ================================================================
     BUDGET & FORECAST — CRM sponsor, rette, spese, log (Area Dirigenti)

     Fuso nel pannello unico: stesso login, stesso ruolo "dirigente"
     verificato in _checkRole(), stesso log (auditLog) usato anche da
     db.js per il resto del CMS. DG è un alias di AdminActions, ma va
     esposto anche su window: tutto admin.js vive in un'unica IIFE,
     quindi un "var DG" locale non basta — gli onclick="DG.xxx()"
     iniettati via innerHTML girano nello scope globale della pagina,
     non nella closure dello script, e senza window.DG risolvono a
     "DG is not defined" ad ogni click.
  ================================================================ */
  var DG = window.AdminActions;
  window.DG = DG;

  var _seasons = [];
  var _currentSeasonId = null;
  var _aziende = [];
  var _sponsorizzazioni = [];
  var _attivita = [];
  var _promemoria = [];
  var _tranche = [];
  var _trancheEditingId = null;
  var _categorieAtleti = [];
  var _atletiRette = [];
  var _rateAtleti = [];
  var _curAtletaRettaId = null;
  var _vociSpesa = [];
  var _categorieSpesa = [];
  var _auditLog = [];
  var _dirigentiList = [];
  var _curSponsorId = null, _curAziendaId = null;
  var _openModalId = null;
  var _activeBudgetTab = 'riepilogo';
  var STATI = ['prospect', 'contattato', 'in_trattativa', 'chiuso', 'rifiutato'];

  /* ---- Sotto-tab interne alla sezione "Budget & Forecast" ---- */
  function _switchBudgetTab(tab) {
    _activeBudgetTab = tab;
    document.querySelectorAll('.budget-subtab').forEach(function (btn) { btn.classList.toggle('is-active', btn.dataset.btab === tab); });
    document.querySelectorAll('#sectionBudget > .dg-section').forEach(function (pane) { pane.classList.add('is-hidden'); });
    document.getElementById('budgetPane' + cap(tab)).classList.remove('is-hidden');
    _renderActiveBudgetTab();
  }

  function _renderActiveBudgetTab() {
    if (_activeBudgetTab === 'riepilogo') { _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards(); _renderCharts(); _renderCashflow(); }
    if (_activeBudgetTab === 'sponsor')   _renderKanban();
    if (_activeBudgetTab === 'rette')     _renderRette();
    if (_activeBudgetTab === 'spese')     _renderSpese();
    if (_activeBudgetTab === 'bilancio')  { _renderBilancio(); _renderSpeseForecast(); }
  }

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
        if (OPEN_FIELDS.indexOf(ch.campo) !== -1) return { campo: ch.campo, aperto: true };
        return { campo: ch.campo, prima: ch.prima, dopo: ch.dopo };
      })
    };
    return ref.set(entry).then(function () {
      _auditLog.unshift(Object.assign({ id: ref.id }, entry, { timestamp: new Date() }));
      if (document.getElementById('sectionLog') && !document.getElementById('sectionLog').classList.contains('is-hidden')) _renderLog();
    }).catch(function (e) {
      /* il log non deve mai bloccare l'operazione principale, già salvata */
      console.error('[audit log]', e);
    });
  }

  /* ---- CARICAMENTO DATI ---- */
  function _loadBudgetData(cb) {
    Promise.all([
      db.collection('dirigenti').get(),
      db.collection('budgetSeasons').get(),
      db.collection('aziende').get(),
      db.collection('sponsorizzazioni').get(),
      db.collection('attivita').get(),
      db.collection('promemoria').get(),
      /* Non deve mai far fallire l'intero Promise.all: finché le regole non
         sono deployate (o per qualsiasi altro errore su questa collezione da
         sola), il resto del budget/CRM deve continuare a caricarsi normalmente. */
      db.collection('tranchePagamento').get().catch(function (e) {
        console.error('[budget] tranchePagamento', e);
        return { docs: [] };
      }),
      /* Collezione globale (non per stagione): stesso trattamento difensivo. */
      db.collection('categorieSpesa').get().catch(function (e) {
        console.error('[budget] categorieSpesa', e);
        return { docs: [] };
      }),
      /* Rate atleti: come tranchePagamento, collegate via atletaRettaId (non seasonId diretto). */
      db.collection('rateAtleti').get().catch(function (e) {
        console.error('[budget] rateAtleti', e);
        return { docs: [] };
      })
    ]).then(function (res) {
      _dirigentiList    = res[0].docs.map(_mapDoc);
      _seasons          = res[1].docs.map(_mapDoc).sort(function (a, b) { return (a.nome || '') < (b.nome || '') ? 1 : -1; });
      _aziende          = res[2].docs.map(_mapDoc);
      _sponsorizzazioni = res[3].docs.map(_mapDoc);
      _attivita         = res[4].docs.map(_mapDoc);
      _promemoria       = res[5].docs.map(_mapDoc);
      _tranche          = res[6].docs.map(_mapDoc);
      _categorieSpesa   = res[7].docs.map(_mapDoc).sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
      _rateAtleti       = res[8].docs.map(_mapDoc);

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
    }).then(function () { if (cb) cb(); })
      .catch(function (err) {
        console.error('[budget] loadAll', err);
        if (cb) cb();
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
      db.collection('vociSpesa').where('seasonId', '==', _currentSeasonId).get(),
      db.collection('atletiRette').where('seasonId', '==', _currentSeasonId).get()
    ]).then(function (res) {
      _categorieAtleti = res[0].docs.map(_mapDoc);
      _vociSpesa       = res[1].docs.map(_mapDoc);
      _atletiRette     = res[2].docs.map(_mapDoc);
    });
  }

  function _loadAuditLog() {
    return db.collection('auditLog').orderBy('timestamp', 'desc').limit(300).get().then(function (snap) {
      _auditLog = snap.docs.map(_mapDoc);
    }).catch(function (err) {
      console.error('[budget] log', err);
    });
  }

  /* ---- TRANCHE DI PAGAMENTO — incasso reale vs contrattuale ---- */
  function _trancheOf(sponsorId) {
    return _tranche.filter(function (t) { return t.sponsorizzazioneId === sponsorId; });
  }
  /* Se non sono state definite tranche, l'importo confermato conta per intero
     (comportamento storico, per non "azzerare" gli sponsor già chiusi in passato). */
  function _sponsorIncassato(s) {
    var t = _trancheOf(s.id);
    if (!t.length) return +s.importoConfermato || 0;
    return t.reduce(function (sum, x) { return sum + (x.pagato ? (+x.importo || 0) : 0); }, 0);
  }
  function _sponsorDaIncassare(s) {
    var t = _trancheOf(s.id);
    if (!t.length) return 0;
    return t.reduce(function (sum, x) { return sum + (x.pagato ? 0 : (+x.importo || 0)); }, 0);
  }

  /* ---- RETTE ATLETI — per categoria, calcolate dagli atleti/rate assegnati ----
     N. atleti e Incassato non sono più campi salvati a mano su categorieAtleti:
     si derivano da _atletiRette (chi) + _rateAtleti (le singole rate, pagate o no). */
  function _atletaRettaById(id) { return _atletiRette.find(function (a) { return a.id === id; }); }
  function _rateByAtleta(atletaId) { return _rateAtleti.filter(function (r) { return r.atletaRettaId === atletaId; }); }

  function _calcRetteAtleti() {
    var perCategoria = {};
    _atletiRette.forEach(function (a) {
      var key = a.categoriaAtletiId || '__none__';
      var rate = _rateByAtleta(a.id);
      var incassato = rate.filter(function (r) { return r.pagata; }).reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      perCategoria[key] = perCategoria[key] || { nAtleti: 0, incassato: 0 };
      perCategoria[key].nAtleti++;
      perCategoria[key].incassato += incassato;
    });
    var totIncassato = 0, totPrevisto = 0;
    var righe = _categorieAtleti.map(function (c) {
      var p = perCategoria[c.id] || { nAtleti: 0, incassato: 0 };
      delete perCategoria[c.id];
      var previsto = p.nAtleti * (+c.rettaUnitaria || 0);
      totIncassato += p.incassato; totPrevisto += previsto;
      return {
        id: c.id, nome: c.nome, rettaUnitaria: +c.rettaUnitaria || 0,
        nAtleti: p.nAtleti, previsto: previsto, incassato: p.incassato, diff: p.incassato - previsto
      };
    });
    /* Atleti senza categoria assegnata: mai persi dal totale, raggruppati a parte
       (stesso trattamento di "Senza categoria" già usato per le voci di spesa). */
    if (perCategoria.__none__) {
      var pn = perCategoria.__none__;
      totIncassato += pn.incassato;
      righe.push({ id: null, nome: 'Senza categoria', rettaUnitaria: 0, nAtleti: pn.nAtleti, previsto: 0, incassato: pn.incassato, diff: pn.incassato });
    }
    righe.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    return { righe: righe, totIncassato: totIncassato, totPrevisto: totPrevisto };
  }

  /* ---- OBIETTIVO / RIEPILOGO ---- */
  function _calcRiepilogo() {
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; });
    var chiusi = cur.filter(function (s) { return s.stato === 'chiuso'; });
    var sponsorChiusi = chiusi.reduce(function (s, x) { return s + _sponsorIncassato(x); }, 0);
    var sponsorDaIncassare = chiusi.reduce(function (s, x) { return s + _sponsorDaIncassare(x); }, 0);
    var sponsorPotenziali = cur.filter(function (s) { return s.stato !== 'chiuso' && s.stato !== 'rifiutato'; })
      .reduce(function (s, x) { return s + (+x.importoStimato || 0) * (+x.probabilitaChiusura || 0); }, 0);
    var rette = _calcRetteAtleti().totIncassato;
    var uscite = _vociSpesa.reduce(function (s, v) { return s + (+v.importoSostenuto || 0); }, 0);
    var entrateConfermate = sponsorChiusi + rette;
    var saldo = entrateConfermate - uscite;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var obiettivo = +season.obiettivoSaldo || 0;
    var differenza = saldo - obiettivo;
    var pct = obiettivo > 0 ? Math.round(saldo / obiettivo * 100) : 0;
    return {
      sponsorChiusi: sponsorChiusi, sponsorDaIncassare: sponsorDaIncassare, sponsorPotenziali: sponsorPotenziali, rette: rette, uscite: uscite,
      entrateConfermate: entrateConfermate, saldo: saldo, obiettivo: obiettivo, differenza: differenza, pct: pct
    };
  }

  /* Scompone "entrate confermate" nelle singole fonti (sponsor chiusi + categorie rette), condiviso da UI e export PDF. */
  function _calcEntrateConfermateDettaglio() {
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && s.stato === 'chiuso'; });
    var righe = cur.map(function (s) {
      var az = _aziendaById(s.aziendaId);
      return { tipo: 'Sponsor', nome: az ? az.ragioneSociale : '—', importo: _sponsorIncassato(s) };
    }).concat(_calcRetteAtleti().righe.map(function (r) {
      return { tipo: 'Retta atleti', nome: r.nome, importo: r.incassato };
    })).filter(function (r) { return r.importo > 0; });
    righe.sort(function (a, b) { return b.importo - a.importo; });
    var totale = righe.reduce(function (s, r) { return s + r.importo; }, 0);
    return { righe: righe, totale: totale };
  }

  function _renderEntrateConfermateDettaglio() {
    var body = document.getElementById('entrateConfermateDettaglioBody');
    if (!body) return;
    var d = _calcEntrateConfermateDettaglio();
    if (!d.righe.length) { body.innerHTML = '<tr><td colspan="3" class="dg-empty">Nessuna entrata confermata per questa stagione.</td></tr>'; return; }
    var rows = d.righe.map(function (r) {
      return '<tr>' +
        '<td>' + esc(r.tipo) + '</td>' +
        '<td>' + esc(r.nome) + '</td>' +
        '<td>' + _eur(r.importo) + '</td>' +
        '</tr>';
    });
    rows.push('<tr style="font-weight:700"><td>Totale</td><td></td><td>' + _eur(d.totale) + '</td></tr>');
    body.innerHTML = rows.join('');
  }

  function _renderObiettivo() {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    document.getElementById('obiettivoSeasonNome').textContent = 'Stagione ' + (season.nome || '—');
    document.getElementById('obiettivoInput').value = season.obiettivoSaldo || 0;
    var r = _calcRiepilogo();
    var pct = Math.max(0, Math.min(100, r.pct));
    document.getElementById('obiettivoBarFill').style.transform = 'scaleX(' + (pct / 100) + ')';
    document.getElementById('obiettivoPct').textContent = r.pct + '%';

    var saldoEl = document.getElementById('heroSaldo');
    saldoEl.textContent = (r.saldo < 0 ? '-' : '') + '€' + Math.abs(Math.round(r.saldo)).toLocaleString('it-IT');
    saldoEl.className = 'dg-hero-saldo ' + (r.saldo >= 0 ? 'dg-hero-saldo--pos' : 'dg-hero-saldo--neg');

    var diffEl = document.getElementById('heroDifferenza');
    if (r.obiettivo > 0) {
      diffEl.textContent = r.differenza >= 0
        ? '+€' + Math.round(r.differenza).toLocaleString('it-IT') + ' oltre l\'obiettivo di €' + Math.round(r.obiettivo).toLocaleString('it-IT')
        : 'Mancano €' + Math.round(Math.abs(r.differenza)).toLocaleString('it-IT') + ' per raggiungere l\'obiettivo di €' + Math.round(r.obiettivo).toLocaleString('it-IT');
      diffEl.className = 'dg-hero-differenza ' + (r.differenza >= 0 ? 'dg-hero-differenza--pos' : 'dg-hero-differenza--neg');
    } else {
      diffEl.textContent = 'Nessun obiettivo impostato per questa stagione';
      diffEl.className = 'dg-hero-differenza';
    }
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

  function _renderPromemoriaList(widgetId, listId, limit) {
    var curIds = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; }).map(function (s) { return s.id; });
    var upcoming = _promemoria.filter(function (p) {
      return !p.completato && curIds.indexOf(p.sponsorizzazioneId) !== -1 && _daysDiff(p.dataScadenza) <= 7;
    }).sort(function (a, b) { return a.dataScadenza < b.dataScadenza ? -1 : 1; });
    if (limit) upcoming = upcoming.slice(0, limit);

    var widget = document.getElementById(widgetId);
    if (!upcoming.length) { widget.classList.add('is-hidden'); return; }
    widget.classList.remove('is-hidden');
    document.getElementById(listId).innerHTML = upcoming.map(function (p) {
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

  function _renderPromemoriaWidget() {
    _renderPromemoriaList('promemoriaWidget', 'promemoriaWidgetList');
  }

  /* ---- Widget "Budget stagione" sulla Dashboard principale ---- */
  function _renderDashBudgetWidget() {
    var r = _calcRiepilogo();
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var pct = Math.max(0, Math.min(100, r.pct));

    document.getElementById('dashBudgetSeasonName').textContent = season.nome ? '· ' + season.nome : '';
    var saldoEl = document.getElementById('dashBudgetSaldo');
    saldoEl.textContent = (r.saldo < 0 ? '-' : '') + '€' + Math.abs(Math.round(r.saldo)).toLocaleString('it-IT');
    saldoEl.className = 'dash-budget-saldo ' + (r.saldo >= 0 ? 'dash-budget-saldo--pos' : 'dash-budget-saldo--neg');
    document.getElementById('dashBudgetPct').textContent = r.pct + '%';
    document.getElementById('dashBudgetBarFill').style.width = pct + '%';
    document.getElementById('dashBudgetObiettivo').textContent = 'Obiettivo €' + Math.round(r.obiettivo).toLocaleString('it-IT');

    _renderPromemoriaList('dashPromemoriaWidget', 'dashPromemoriaList', 4);
  }

  function _renderDashCashflowWidget() {
    var c = _cashflowStats();
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var pct = c.promesso > 0 ? Math.round(c.incassato / c.promesso * 100) : 0;

    document.getElementById('dashCashflowSeasonName').textContent = season.nome ? '· ' + season.nome : '';
    document.getElementById('dashCashflowIncassato').textContent =
      '€' + Math.round(c.incassato).toLocaleString('it-IT') + ' / €' + Math.round(c.promesso).toLocaleString('it-IT');
    document.getElementById('dashCashflowPct').textContent = pct + '%';
    document.getElementById('dashCashflowBarFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
    document.getElementById('dashCashflowTranche').textContent =
      c.totale ? (c.totale + ' tranche pianificate — ' + c.pagate + ' pagate, ' + c.daPagare + ' da pagare') : 'Nessuna tranche pianificata';
  }

  DG.openFromReminder = function (sponsorId) {
    goTo('budget');
    _switchBudgetTab('sponsor');
    _openDrawer(sponsorId);
  };

  function _budgetStatCard(label, val2, cls) {
    var sign = val2 < 0 ? '-' : '';
    return '<div class="dg-stat-card' + (cls ? ' dg-stat-card' + cls : '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + sign + '€' + Math.abs(Math.round(val2)).toLocaleString('it-IT') + '</div></div>';
  }

  /* Saldo e Differenza da obiettivo sono ora nella hero card (_renderObiettivo);
     qui restano solo i numeri di supporto, senza ripetere quanto già in vista. */
  function _renderStatCards() {
    var r = _calcRiepilogo();
    document.getElementById('dgStatRow').innerHTML =
      _budgetStatCard('Entrate confermate', r.entrateConfermate, '') +
      _budgetStatCard('Da incassare (sponsor)', r.sponsorDaIncassare, '--orange') +
      _budgetStatCard('Uscite', r.uscite, '--red');
    _renderEntrateConfermateDettaglio();
  }

  /* ---- CHARTS — SVG inline, nessuna libreria esterna ---- */
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

  function _svgDonut(parts, ariaLabel) {
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
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="100%" height="200" role="img" aria-label="' + esc(ariaLabel || 'Composizione') + '">' + segs +
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

  var DONUT_PALETTE = ['#008CFD', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444', '#64748B'];

  function _renderCharts() {
    var r = _calcRiepilogo();
    document.getElementById('chartBar').innerHTML = _svgBarChart(r.entrateConfermate, r.uscite, r.obiettivo);

    /* Solo incassi reali (rette + sponsor chiusi): il potenziale pesato è una
       stima di forecast, mescolarlo qui confondeva "quanto ho" con "quanto spero". */
    document.getElementById('chartDonutEntrate').innerHTML = _svgDonut([
      { label: 'Rette atleti', value: r.rette, color: '#008CFD' },
      { label: 'Sponsor chiusi', value: r.sponsorChiusi, color: '#10B981' }
    ], 'Composizione entrate confermate');

    var speseBox = document.getElementById('chartDonutUscite');
    var usciteParts = _calcSpeseForecast().righe
      .filter(function (x) { return x.sostenuto > 0; })
      .sort(function (a, b) { return b.sostenuto - a.sostenuto; })
      .map(function (x, i) { return { label: x.nome, value: x.sostenuto, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }; });
    speseBox.innerHTML = usciteParts.length ? _svgDonut(usciteParts, 'Composizione uscite per categoria') : '<p class="dg-muted">Nessuna uscita registrata per questa stagione.</p>';
  }

  /* ---- CASHFLOW — quante tranche, quanto incassato vs promesso ---- */
  function _countStatCard(label, val2, cls) {
    return '<div class="dg-stat-card' + (cls ? ' dg-stat-card' + cls : '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + val2.toLocaleString('it-IT') + '</div></div>';
  }

  function _cashflowStats() {
    var curIds = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; }).map(function (s) { return s.id; });
    var list = _tranche.filter(function (t) { return curIds.indexOf(t.sponsorizzazioneId) !== -1; });
    var pagate = list.filter(function (t) { return t.pagato; });
    var daPagare = list.filter(function (t) { return !t.pagato; });
    var incassato = pagate.reduce(function (s, t) { return s + (+t.importo || 0); }, 0);
    var daIncassare = daPagare.reduce(function (s, t) { return s + (+t.importo || 0); }, 0);
    return {
      totale: list.length, pagate: pagate.length, daPagare: daPagare.length,
      incassato: incassato, daIncassare: daIncassare, promesso: incassato + daIncassare
    };
  }

  function _renderCashflow() {
    var c = _cashflowStats();
    document.getElementById('cashflowStats').innerHTML =
      _countStatCard('Tranche totali', c.totale, '') +
      _countStatCard('Tranche pagate', c.pagate, '--green') +
      _countStatCard('Tranche da pagare', c.daPagare, '--orange') +
      _budgetStatCard('Promesso (totale tranche)', c.promesso, '');

    var box = document.getElementById('cashflowDonut');
    if (!c.totale) {
      box.innerHTML = '<p class="dg-muted">Nessuna tranche pianificata per questa stagione — le tranche si aggiungono dalla scheda azienda, tab "Pagamenti".</p>';
      return;
    }
    box.innerHTML = _svgDonut([
      { label: 'Incassato', value: c.incassato, color: '#10B981' },
      { label: 'Da incassare', value: c.daIncassare, color: '#F59E0B' }
    ]);
  }

  /* ---- KANBAN SPONSOR ---- */
  function _renderKanban() {
    var onlyMine = document.getElementById('filterMieiSponsor').checked;
    var cur = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; });

    STATI.forEach(function (stato) {
      var items = cur.filter(function (s) { return s.stato === stato && (!onlyMine || s.dirigenteResponsabileId === _uid); });
      document.getElementById('count' + cap(stato)).textContent = items.length;
      var col = document.getElementById('col' + cap(stato));
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
          '</span>' +
          (s.note ? '<svg class="dg-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" title="' + esc(s.note) + '"><path d="M4 4h16v13l-4 4H4z"/><path d="M8 9h8M8 13h5"/></svg>' : '') +
          '</div>' +
          '<div class="dg-kanban-card-importo">€' + Number(importo || 0).toLocaleString('it-IT') + '</div>' +
          '<div class="dg-kanban-card-bottom">' +
          '<span class="dg-avatar" title="' + esc(resp ? (resp.nome + ' ' + resp.cognome) : 'Non assegnato') + '">' + (resp ? _initials(resp.nome, resp.cognome) : '?') + '</span>' +
          chip +
          '</div></div>';
      }).join('');
    });

    _attachKanbanEvents();
    _renderPezziSponsor();
  }

  /* ---- Materiali sponsor — tabella pezzi da realizzare per sponsor chiuso ----
     Ogni cella assegna una dimensione (dal listino catalogoDimensioni della stagione),
     il cui prezzo viene "fotografato" sulla cella (sponsorizzazione.pezzi[pezzo] = {dimensione, prezzo})
     così un ritocco successivo del listino non altera le stampe già assegnate.
     Il totale imponibile confluisce in automatico in una voce di spesa "Materiali sponsor"
     con IVA 22% figlia, tramite _syncMaterialiSpesa() — stesso meccanismo IVA già usato per gli sponsor. */
  /* ---- Prezzo del pezzo con due fasce (es. 30 pz a €11 + 20 pz a €13): se è impostata una
     quantità sulla prima fascia il totale è quello fisso delle due fasce (p1*q1 + p2*q2),
     altrimenti (voci "vecchie", un solo prezzo senza quantità) resta il prezzo unitario
     moltiplicato per i pezzi effettivamente assegnati nelle celle. ---- */
  function _pezzoPrezzoTiers(entry) {
    if (entry && typeof entry === 'object') {
      return { p1: +entry.p1 || 0, q1: +entry.q1 || 0, p2: +entry.p2 || 0, q2: +entry.q2 || 0 };
    }
    return { p1: +entry || 0, q1: 0, p2: 0, q2: 0 };
  }

  function _totalePezzoColonna(entry, demand) {
    var t = _pezzoPrezzoTiers(entry);
    if (t.q1 > 0) return Math.round((t.p1 * t.q1 + t.p2 * t.q2) * 100) / 100;
    return Math.round(t.p1 * (demand || 0) * 100) / 100;
  }

  function _renderPezziSponsor() {
    var wrap = document.getElementById('pezziSponsorWrap');
    var riepilogoEl = document.getElementById('pezziSponsorRiepilogo');
    var esclusiEl = document.getElementById('pezziSponsorEsclusi');
    if (!wrap) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var pezzi = season.pezziSponsor || [];
    var catalogo = season.catalogoDimensioni || [];

    var sponsorRows = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && (s.stato === 'chiuso' || s.includiMateriali); })
      .map(function (s) {
        var az = _aziendaById(s.aziendaId);
        return { kind: 'sponsor', id: s.id, nome: az ? az.ragioneSociale : '—', pezzi: s.pezzi || {}, stato: s.stato, escluso: !!s.escludiMateriali };
      });
    var extraRows = (season.vociExtra || []).map(function (v) {
      return { kind: 'extra', id: v.id, nome: v.nome, pezzi: v.pezzi || {}, stato: null, escluso: !!v.escluso };
    });
    var tutte = sponsorRows.concat(extraRows);
    var byNome = function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); };
    var rows = tutte.filter(function (r) { return !r.escluso; }).sort(byNome);
    var esclusi = tutte.filter(function (r) { return r.escluso; }).sort(byNome);

    _renderPezziEsclusi(esclusi, esclusiEl);

    if (!rows.length) {
      wrap.innerHTML = '<div class="dg-empty">' + (esclusi.length ? 'Tutte le voci sono state escluse da questa tabella.' : 'Nessuna voce in questa tabella — aggiungine una con "+ Aggiungi".') + '</div>';
      if (riepilogoEl) riepilogoEl.innerHTML = '';
      return;
    }

    var prezziPezzi = season.pezziPrezzi || {};
    var countPerPezzo = {};
    rows.forEach(function (r) {
      if (!r.pezzi) return;
      Object.keys(r.pezzi).forEach(function (k) {
        var cell = r.pezzi[k];
        if (!cell || !cell.dimensione) return;
        var q = cell.quantita ? (+cell.quantita || 1) : 1;
        countPerPezzo[k] = Math.max(countPerPezzo[k] || 0, q);
      });
    });
    var fmtPzz = function (n) { return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2 }); };
    var head = '<tr><th>Sponsor</th>' +
      pezzi.map(function (p) {
        var tiers = _pezzoPrezzoTiers(prezziPezzi[p]);
        var demand = countPerPezzo[p] || 0;
        var totaleCol = _totalePezzoColonna(prezziPezzi[p], demand);
        var pezziTotali = tiers.q1 > 0 ? (tiers.q1 + tiers.q2) : demand;

        var badgeHtml, badgeTitle, badgeClass;
        if (totaleCol > 0) {
          badgeHtml = '€' + fmtPzz(totaleCol) + '<span class="dg-pezzi-th-price-qty"> · ' + pezziTotali + ' pz</span>';
          badgeTitle = tiers.q1 > 0
            ? (tiers.p2
              ? (tiers.q1 + ' pz × €' + fmtPzz(tiers.p1) + ' + ' + tiers.q2 + ' pz × €' + fmtPzz(tiers.p2) + ' (IVA 22% esclusa)')
              : (tiers.q1 + ' pz × €' + fmtPzz(tiers.p1) + ' (IVA 22% esclusa)'))
            : ('€' + fmtPzz(tiers.p1) + ' a pezzo, IVA 22% esclusa — clicca per modificare');
          badgeClass = ' has-price';
        } else if (tiers.p1) {
          badgeHtml = '€' + fmtPzz(tiers.p1) + '/pz';
          badgeTitle = 'Prezzo impostato, nessun pezzo ancora assegnato — clicca per modificare';
          badgeClass = ' has-price';
        } else {
          badgeHtml = '+ prezzo';
          badgeTitle = 'Imposta il prezzo del pezzo (IVA 22% esclusa), anche su due fasce di quantità';
          badgeClass = '';
        }
        return '<th class="dg-pezzi-th-col">' +
          '<div class="dg-pezzi-th-name">' + esc(p) +
          '<button type="button" class="dg-pezzi-th-remove" data-pezzo="' + esc(p) + '" title="Rimuovi colonna">✕</button></div>' +
          '<button type="button" class="dg-pezzi-th-price' + badgeClass + '" data-pezzo="' + esc(p) + '" title="' + esc(badgeTitle) + '">' +
          badgeHtml + '</button></th>';
      }).join('') +
      '<th><button type="button" class="dg-pezzi-addcol">+ Pezzo</button></th></tr>';

    var body = rows.map(function (r) {
      var badge = r.kind === 'sponsor' && r.stato !== 'chiuso' ? ' <span class="dg-badge dg-badge--' + r.stato + '" style="margin-left:6px">' + esc(_statoLabel(r.stato)) + '</span>' : '';
      var extraTag = r.kind === 'extra' ? ' <span class="dg-pezzi-extra-tag" title="Voce libera aggiunta manualmente, non collegata a uno sponsor">voce libera</span>' : '';
      var cells = pezzi.map(function (p) {
        var cell = r.pezzi && r.pezzi[p];
        var q = cell && cell.quantita ? (+cell.quantita || 1) : 1;
        var filled = cell && cell.dimensione;
        var chip;
        if (filled) {
          var unitario = +cell.prezzo || 0;
          var tooltip = esc(cell.dimensione) + ' — ' + q + ' pz × €' + unitario.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' cad.';
          chip = '<span class="dg-pezzi-chip" title="' + tooltip + '">€' + (unitario * q).toLocaleString('it-IT', { minimumFractionDigits: 2 }) +
            (q > 1 ? '<sup class="dg-pezzi-qty">×' + q + '</sup>' : '') + '</span>';
        } else {
          chip = '<span class="dg-pezzi-chip dg-pezzi-chip--empty">+</span>';
        }
        return '<td class="dg-pezzi-cell' + (!catalogo.length ? ' is-disabled' : '') + (filled ? ' dg-pezzi-cell--filled' : '') + '" data-kind="' + r.kind + '" data-id="' + r.id + '" data-pezzo="' + esc(p) + '">' + chip + '</td>';
      }).join('');
      return '<tr data-kind="' + r.kind + '"><td>' + esc(r.nome) + badge + extraTag + '</td>' + cells +
        '<td><button type="button" class="dg-pezzi-row-remove" data-kind="' + r.kind + '" data-id="' + r.id + '" title="Rimuovi dalla tabella">✕</button></td></tr>';
    }).join('');

    wrap.innerHTML = '<table class="dg-table dg-pezzi-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    _attachPezziSponsorEvents(wrap);
    _renderPezziRiepilogo(rows, riepilogoEl);
    _syncMaterialiSpesa();
  }

  function _renderPezziEsclusi(esclusi, el) {
    if (!el) return;
    if (!esclusi.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="dg-pezzi-esclusi">' +
      '<span class="dg-pezzi-esclusi-label">Esclusi da questa tabella:</span>' +
      esclusi.map(function (r) {
        return '<span class="dg-pezzi-esclusi-chip">' + esc(r.nome) +
          '<button type="button" class="dg-pezzi-esclusi-restore" data-kind="' + r.kind + '" data-id="' + r.id + '" title="Rimetti in tabella">↺</button></span>';
      }).join('') + '</div>';
    el.querySelectorAll('.dg-pezzi-esclusi-restore').forEach(function (btn) {
      btn.addEventListener('click', function () { _restoreRowPezzi(btn.dataset.kind, btn.dataset.id); });
    });
  }

  function _removeRowFromPezzi(kind, id) {
    if (kind === 'sponsor') return _removeSponsorFromPezzi(id);
    return _removeExtraVoce(id);
  }

  function _restoreRowPezzi(kind, id) {
    if (kind === 'sponsor') return _restoreSponsorPezzi(id);
    return _restoreExtraVoce(id);
  }

  function _removeSponsorFromPezzi(id) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var nome = az ? az.ragioneSociale : id;
    var haCosti = s.pezzi && Object.keys(s.pezzi).some(function (k) { return s.pezzi[k] && s.pezzi[k].dimensione; });
    confirm('Rimuovere "' + nome + '" dalla tabella materiali sponsor?' + (haCosti ? ' Le dimensioni già assegnate restano salvate e continuano a essere conteggiate nella voce di spesa; puoi rimetterlo in tabella in qualsiasi momento.' : ''), function () {
      s.escludiMateriali = true;
      _renderPezziSponsor();
      var label = 'Sponsorizzazione — ' + nome;
      db.collection('sponsorizzazioni').doc(id).update({ escludiMateriali: true })
        .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', [{ campo: 'escludiMateriali', prima: false, dopo: true }]); })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  }

  function _restoreSponsorPezzi(id) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    s.escludiMateriali = false;
    _renderPezziSponsor();
    db.collection('sponsorizzazioni').doc(id).update({ escludiMateriali: false })
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', [{ campo: 'escludiMateriali', prima: true, dopo: false }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _removeExtraVoce(id) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var arr = (season.vociExtra || []).slice();
    var idx = arr.findIndex(function (v) { return v.id === id; });
    if (idx === -1) return;
    var nome = arr[idx].nome;
    var haCosti = arr[idx].pezzi && Object.keys(arr[idx].pezzi).some(function (k) { return arr[idx].pezzi[k] && arr[idx].pezzi[k].dimensione; });
    confirm('Rimuovere "' + nome + '" dalla tabella materiali sponsor?' + (haCosti ? ' Le dimensioni già assegnate restano salvate e continuano a essere conteggiate nella voce di spesa; puoi rimetterla in tabella in qualsiasi momento.' : ''), function () {
      arr[idx] = Object.assign({}, arr[idx], { escluso: true });
      season.vociExtra = arr;
      _renderPezziSponsor();
      db.collection('budgetSeasons').doc(season.id).update({ vociExtra: arr })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  }

  function _restoreExtraVoce(id) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var arr = (season.vociExtra || []).slice();
    var idx = arr.findIndex(function (v) { return v.id === id; });
    if (idx === -1) return;
    arr[idx] = Object.assign({}, arr[idx], { escluso: false });
    season.vociExtra = arr;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ vociExtra: arr })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- "+ Aggiungi" — inserisce manualmente in tabella uno sponsor non ancora chiuso
     (prospect/contattato/in trattativa/rifiutato) oppure una voce libera non legata a
     nessuno sponsor (es. "Magazzino", "Materiale extra"), per pianificare i materiali. ---- */
  function _sponsorPezziCandidati() {
    return _sponsorizzazioni.filter(function (s) {
      return s.seasonId === _currentSeasonId && s.stato !== 'chiuso' && !s.includiMateriali;
    }).map(function (s) { return { s: s, azienda: _aziendaById(s.aziendaId) }; })
      .sort(function (a, b) { return (a.azienda ? a.azienda.ragioneSociale : '').localeCompare(b.azienda ? b.azienda.ragioneSociale : ''); });
  }

  function _openAggiungiSponsorPopover(btn) {
    var candidati = _sponsorPezziCandidati();
    var pop = document.getElementById('dgPezziPopover');
    var html = '<div class="dg-pezzi-popover-item dg-pezzi-popover-item--new" data-action="new">+ Voce personalizzata…</div>';
    html += candidati.length ? candidati.map(function (r) {
      var nome = r.azienda ? r.azienda.ragioneSociale : '—';
      return '<div class="dg-pezzi-popover-item" data-id="' + r.s.id + '"><span>' + esc(nome) + '</span><span class="dg-muted" style="font-size:11px">' + esc(_statoLabel(r.s.stato)) + '</span></div>';
    }).join('') : '<div class="dg-pezzi-popover-empty">Nessun altro sponsor disponibile per questa stagione.</div>';
    pop.innerHTML = html;

    var rect = btn.getBoundingClientRect();
    pop.classList.remove('is-hidden');
    var popW = pop.offsetWidth || 170;
    var spazioSotto = window.innerHeight - rect.bottom;
    pop.style.left = Math.max(4, Math.min(rect.right - popW, window.innerWidth - popW - 4)) + 'px';
    pop.style.top = (spazioSotto > pop.offsetHeight + 8 ? rect.bottom + 4 : rect.top - pop.offsetHeight - 4) + 'px';

    pop.querySelector('[data-action="new"]').addEventListener('click', function () {
      _closePezzoPopover();
      _addVoceExtra();
    });
    pop.querySelectorAll('.dg-pezzi-popover-item[data-id]').forEach(function (it) {
      it.addEventListener('click', function () {
        _addSponsorToPezzi(it.dataset.id);
        _closePezzoPopover();
      });
    });
    setTimeout(function () { document.addEventListener('click', _pezzoPopoverOutsideClick, true); }, 0);
  }

  function _addSponsorToPezzi(id) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
    s.includiMateriali = true;
    s.escludiMateriali = false;
    _renderPezziSponsor();
    db.collection('sponsorizzazioni').doc(id).update({ includiMateriali: true, escludiMateriali: false })
      .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', [{ campo: 'includiMateriali', prima: false, dopo: true }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _addVoceExtra() {
    var nome = prompt('Nome della voce (es. Magazzino, Materiale extra, Striscione ingresso):');
    if (!nome) return;
    nome = nome.trim();
    if (!nome) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var arr = (season.vociExtra || []).slice();
    var id = 'extra_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    var entry = { id: id, nome: nome, pezzi: {}, escluso: false };
    arr.push(entry);
    season.vociExtra = arr;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ vociExtra: arr })
      .then(function () { return _logWrite('voceMateriali', id, 'Voce materiali — ' + nome, 'create', _diff({}, entry, Object.keys(entry))); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _renderPezziRiepilogo(rows, el) {
    if (!el) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var prezziPezzi = season.pezziPrezzi || {};

    var perDimensione = {};
    var perPezzo = {};
    var imponibileStampe = 0;
    rows.forEach(function (r) {
      if (!r.pezzi) return;
      Object.keys(r.pezzi).forEach(function (k) {
        var cell = r.pezzi[k];
        if (!cell || !cell.dimensione) return;
        var q = cell.quantita ? (+cell.quantita || 1) : 1;
        var subtot = (+cell.prezzo || 0) * q;
        imponibileStampe += subtot;
        var d = perDimensione[cell.dimensione] || (perDimensione[cell.dimensione] = { count: 0, subtotale: 0 });
        d.count += q; d.subtotale += subtot;
        perPezzo[k] = Math.max(perPezzo[k] || 0, q);
      });
    });

    var imponibileMerce = 0;
    var fmt = function (n) { return '€' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2 }); };
    var righePezzi = Object.keys(perPezzo).sort().map(function (nome) {
      var count = perPezzo[nome];
      var subtot = _totalePezzoColonna(prezziPezzi[nome], count);
      imponibileMerce += subtot;
      var right = subtot ? fmt(subtot) : '<span class="dg-muted" style="font-weight:400">prezzo non impostato</span>';
      var ivaLine = subtot ? '<div class="dg-pezzi-riepilogo-subline">' + fmt(Math.round((subtot / count) * 1.22 * 100) / 100) + '/pz IVA compr.</div>' : '';
      return '<div class="dg-pezzi-riepilogo-row"><span>' + esc(nome) + ' × ' + count + '</span><span>' + right + '</span></div>' + ivaLine;
    }).join('');

    var imponibile = imponibileStampe + imponibileMerce;
    if (!imponibile) { el.innerHTML = ''; return; }

    var ivaStampe = Math.round(imponibileStampe * 22) / 100;
    var totaleStampe = Math.round((imponibileStampe + ivaStampe) * 100) / 100;
    var ivaMerce = Math.round(imponibileMerce * 22) / 100;
    var totaleMerce = Math.round((imponibileMerce + ivaMerce) * 100) / 100;
    var iva = Math.round(imponibile * 22) / 100;
    var totale = Math.round((imponibile + iva) * 100) / 100;

    var righeStampe = Object.keys(perDimensione).sort().map(function (nome) {
      var d = perDimensione[nome];
      return '<div class="dg-pezzi-riepilogo-row"><span>' + esc(nome) + ' × ' + d.count + '</span><span>' + fmt(d.subtotale) + '</span></div>';
    }).join('');

    el.innerHTML = '<div class="dg-pezzi-riepilogo-group">' +
      '<div class="dg-pezzi-riepilogo">' +
      '<div class="dg-pezzi-riepilogo-title">Stampe</div>' + (righeStampe || '<div class="dg-muted" style="font-size:12px">Nessuna stampa assegnata.</div>') +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-subtotal" style="margin-top:8px"><span>Imponibile</span><span>' + fmt(imponibileStampe) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row"><span>IVA 22%</span><span>' + fmt(ivaStampe) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-total"><span>Totale stampe</span><span>' + fmt(totaleStampe) + '</span></div>' +
      '</div>' +
      '<div class="dg-pezzi-riepilogo">' +
      '<div class="dg-pezzi-riepilogo-title">Pezzi da produrre</div>' + (righePezzi || '<div class="dg-muted" style="font-size:12px">Nessun pezzo assegnato.</div>') +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-subtotal" style="margin-top:8px"><span>Imponibile</span><span>' + fmt(imponibileMerce) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row"><span>IVA 22%</span><span>' + fmt(ivaMerce) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-total"><span>Totale pezzi</span><span>' + fmt(totaleMerce) + '</span></div>' +
      '</div>' +
      '</div>' +
      '<div class="dg-pezzi-riepilogo dg-pezzi-riepilogo--grand">' +
      '<div class="dg-pezzi-riepilogo-title">Totale complessivo</div>' +
      '<div class="dg-pezzi-riepilogo-value">' + fmt(totale) + '</div>' +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-grand-detail"><span>Imponibile</span><span>' + fmt(imponibile) + '</span></div>' +
      '<div class="dg-pezzi-riepilogo-row dg-pezzi-riepilogo-grand-detail"><span>IVA 22%</span><span>' + fmt(iva) + '</span></div>' +
      '</div>';
  }

  function _attachPezziSponsorEvents(wrap) {
    wrap.querySelectorAll('.dg-pezzi-cell').forEach(function (td) {
      td.addEventListener('click', function () { _openPezzoPopover(td); });
    });
    wrap.querySelectorAll('.dg-pezzi-th-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); _removePezzoSponsor(btn.dataset.pezzo); });
    });
    wrap.querySelectorAll('.dg-pezzi-th-price').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); _setPrezzoPezzo(btn.dataset.pezzo); });
    });
    wrap.querySelectorAll('.dg-pezzi-row-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); _removeRowFromPezzi(btn.dataset.kind, btn.dataset.id); });
    });
    var addBtn = wrap.querySelector('.dg-pezzi-addcol');
    if (addBtn) addBtn.addEventListener('click', _addPezzoSponsor);
  }

  /* ---- Lettura/scrittura pezzi di una riga a prescindere dal tipo (sponsor o voce libera) ---- */
  function _pezziRowGetPezzi(kind, id) {
    if (kind === 'sponsor') {
      var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
      return s ? (s.pezzi || {}) : {};
    }
    var season = _seasons.find(function (x) { return x.id === _currentSeasonId; }) || {};
    var v = (season.vociExtra || []).find(function (x) { return x.id === id; });
    return v ? (v.pezzi || {}) : {};
  }

  function _pezziRowApplyMutation(kind, id, newPezzi) {
    if (kind === 'sponsor') {
      var s = _sponsorizzazioni.find(function (x) { return x.id === id; });
      if (!s) return;
      var before = s.pezzi || {};
      s.pezzi = newPezzi;
      _renderPezziSponsor();
      var az = _aziendaById(s.aziendaId);
      var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : id);
      db.collection('sponsorizzazioni').doc(id).update({ pezzi: newPezzi })
        .then(function () { return _logWrite('sponsorizzazione', id, label, 'update', _diff({ pezzi: before }, { pezzi: newPezzi }, ['pezzi'])); })
        .catch(function (e) { alert('Errore: ' + e.message); });
      return;
    }
    var season = _seasons.find(function (x) { return x.id === _currentSeasonId; });
    if (!season) return;
    var arr = (season.vociExtra || []).slice();
    var idx = arr.findIndex(function (v) { return v.id === id; });
    if (idx === -1) return;
    var before2 = arr[idx].pezzi || {};
    var nome = arr[idx].nome;
    arr[idx] = Object.assign({}, arr[idx], { pezzi: newPezzi });
    season.vociExtra = arr;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ vociExtra: arr })
      .then(function () { return _logWrite('voceMateriali', id, 'Voce materiali — ' + nome, 'update', _diff({ pezzi: before2 }, { pezzi: newPezzi }, ['pezzi'])); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- Popover leggero per assegnare dimensione/quantità a una cella (al posto di controlli fissi in ogni cella) ---- */
  function _closePezzoPopover() {
    var pop = document.getElementById('dgPezziPopover');
    if (pop) { pop.classList.add('is-hidden'); pop.innerHTML = ''; }
    document.removeEventListener('click', _pezzoPopoverOutsideClick, true);
  }

  function _pezzoPopoverOutsideClick(e) {
    var pop = document.getElementById('dgPezziPopover');
    if (pop && !pop.contains(e.target)) _closePezzoPopover();
  }

  function _openPezzoPopover(td) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var catalogo = season.catalogoDimensioni || [];
    if (!catalogo.length) { alert('Crea prima il listino dimensioni (pulsante "Listino dimensioni" in alto a destra).'); return; }

    var kind = td.dataset.kind, id = td.dataset.id, pezzo = td.dataset.pezzo;
    var pezziCorrenti = _pezziRowGetPezzi(kind, id);
    var curCell = pezziCorrenti[pezzo];
    var cur = curCell && curCell.dimensione ? curCell.dimensione : '';

    var pop = document.getElementById('dgPezziPopover');
    var qtyHtml = '';
    if (cur) {
      var q = curCell.quantita ? (+curCell.quantita || 1) : 1;
      qtyHtml = '<div class="dg-pezzi-popover-qty">' +
        '<label>Quantità (pezzi da realizzare)</label>' +
        '<div class="dg-pezzi-popover-qty-row">' +
        '<input type="number" min="1" step="1" value="' + q + '" class="dg-pezzi-qty-input">' +
        '<button type="button" class="dg-pezzi-qty-apply">Applica</button>' +
        '</div></div>';
    }
    var items = catalogo.map(function (d) {
      return '<div class="dg-pezzi-popover-item' + (d.nome === cur ? ' is-active' : '') + '" data-nome="' + esc(d.nome) + '"><span>' + esc(d.nome) + '</span><span>€' + Number(d.prezzo || 0).toLocaleString('it-IT') + '</span></div>';
    }).join('');
    if (cur) items += '<div class="dg-pezzi-popover-item dg-pezzi-popover-item--clear" data-nome="">Rimuovi assegnazione</div>';
    pop.innerHTML = qtyHtml + items;

    var rect = td.getBoundingClientRect();
    pop.classList.remove('is-hidden');
    var popW = pop.offsetWidth || 170;
    var spazioSotto = window.innerHeight - rect.bottom;
    pop.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - popW - 4)) + 'px';
    pop.style.top = (spazioSotto > pop.offsetHeight + 8 ? rect.bottom + 4 : rect.top - pop.offsetHeight - 4) + 'px';

    if (cur) {
      var qtyInput = pop.querySelector('.dg-pezzi-qty-input');
      var applyBtn = pop.querySelector('.dg-pezzi-qty-apply');
      var applyQty = function () { _setPezzoQuantita(kind, id, pezzo, qtyInput.value); _closePezzoPopover(); };
      applyBtn.addEventListener('click', applyQty);
      qtyInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyQty(); });
    }

    pop.querySelectorAll('.dg-pezzi-popover-item[data-nome]').forEach(function (it) {
      it.addEventListener('click', function () {
        _setPezzoDimensione(kind, id, pezzo, it.dataset.nome);
        _closePezzoPopover();
      });
    });

    setTimeout(function () { document.addEventListener('click', _pezzoPopoverOutsideClick, true); }, 0);
  }

  function _setPezzoDimensione(kind, id, pezzo, nome) {
    var season = _seasons.find(function (x) { return x.id === _currentSeasonId; }) || {};
    var before = _pezziRowGetPezzi(kind, id);
    var after = Object.assign({}, before);
    if (!nome) {
      delete after[pezzo];
    } else {
      var dim = (season.catalogoDimensioni || []).find(function (d) { return d.nome === nome; });
      var quantitaPrec = before[pezzo] && before[pezzo].quantita ? before[pezzo].quantita : 1;
      after[pezzo] = { dimensione: nome, prezzo: dim ? (+dim.prezzo || 0) : 0, quantita: quantitaPrec };
    }
    _pezziRowApplyMutation(kind, id, after);
  }

  function _setPezzoQuantita(kind, id, pezzo, quantita) {
    var before = _pezziRowGetPezzi(kind, id);
    if (!before[pezzo]) return;
    var q = Math.max(1, Math.round(+quantita) || 1);
    var after = Object.assign({}, before);
    after[pezzo] = Object.assign({}, after[pezzo], { quantita: q });
    _pezziRowApplyMutation(kind, id, after);
  }

  function _addPezzoSponsor() {
    var nome = prompt('Nome del pezzo da realizzare (es. Cartellone, Maglia, Banner sito):');
    if (!nome) return;
    nome = nome.trim();
    if (!nome) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var pezzi = (season.pezziSponsor || []).slice();
    if (pezzi.some(function (p) { return p.toLowerCase() === nome.toLowerCase(); })) { alert('Esiste già un pezzo con questo nome.'); return; }
    pezzi.push(nome);
    season.pezziSponsor = pezzi;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ pezziSponsor: pezzi })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- Prezzo del pezzo (merce/gadget prima della stampa), impostato sull'intestazione della
     colonna — si somma al prezzo di stampa scelto per singola cella, non lo sostituisce.
     Supporta due fasce di prezzo/quantità (es. 30 pezzi a €11 + 20 pezzi a €13): se si indica
     una quantità sulla prima fascia il totale colonna diventa fisso (p1*q1 + p2*q2), altrimenti
     resta un prezzo unitario moltiplicato per i pezzi assegnati nelle celle (comportamento
     precedente, per compatibilità con i prezzi già impostati senza fasce). ---- */
  function _setPrezzoPezzo(pezzo) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var attuale = _pezzoPrezzoTiers((season.pezziPrezzi || {})[pezzo]);

    var p1in = prompt('Prezzo del pezzo "' + pezzo + '" (IVA 22% esclusa — costo del gadget/supporto, non della stampa):', attuale.p1 || '');
    if (p1in === null) return;
    var p1 = +String(p1in).replace(',', '.');
    if (isNaN(p1) || p1 < 0) { alert('Inserisci un numero valido.'); return; }

    var q1in = prompt('Quantità a questo prezzo (lascia vuoto o 0 se è un prezzo unico, senza fasce):', attuale.q1 || '');
    if (q1in === null) return;
    var q1 = +String(q1in).replace(',', '.') || 0;
    if (isNaN(q1) || q1 < 0) { alert('Inserisci una quantità valida.'); return; }

    var p2 = 0, q2 = 0;
    if (q1 > 0) {
      var p2in = prompt('Prezzo per i pezzi successivi, oltre i primi ' + q1 + ' (lascia vuoto se non serve una seconda fascia):', attuale.p2 || '');
      if (p2in === null) return;
      if (String(p2in).trim() !== '') {
        p2 = +String(p2in).replace(',', '.');
        if (isNaN(p2) || p2 < 0) { alert('Inserisci un numero valido per il secondo prezzo.'); return; }
        var q2in = prompt('Quantità a questo secondo prezzo:', attuale.q2 || '');
        if (q2in === null) return;
        q2 = +String(q2in).replace(',', '.') || 0;
        if (isNaN(q2) || q2 < 0) { alert('Inserisci una quantità valida.'); return; }
      }
    }

    var prezziPezzi = Object.assign({}, season.pezziPrezzi || {});
    if (!p1 && !q1 && !p2 && !q2) delete prezziPezzi[pezzo];
    else prezziPezzi[pezzo] = { p1: p1, q1: q1, p2: p2, q2: q2 };
    season.pezziPrezzi = prezziPezzi;
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ pezziPrezzi: prezziPezzi })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _removePezzoSponsor(pezzo) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    confirm('Rimuovere la colonna "' + pezzo + '"? Le eventuali dimensioni assegnate per questo pezzo andranno perse.', function () {
      var pezzi = (season.pezziSponsor || []).filter(function (p) { return p !== pezzo; });
      var vociExtra = (season.vociExtra || []).map(function (v) {
        if (!v.pezzi || !v.pezzi[pezzo]) return v;
        var np = Object.assign({}, v.pezzi);
        delete np[pezzo];
        return Object.assign({}, v, { pezzi: np });
      });
      var prezziPezzi = Object.assign({}, season.pezziPrezzi || {});
      delete prezziPezzi[pezzo];
      season.pezziSponsor = pezzi;
      season.vociExtra = vociExtra;
      season.pezziPrezzi = prezziPezzi;
      var interessati = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && s.pezzi && s.pezzi[pezzo]; });
      var batch = db.batch();
      batch.update(db.collection('budgetSeasons').doc(season.id), { pezziSponsor: pezzi, vociExtra: vociExtra, pezziPrezzi: prezziPezzi });
      interessati.forEach(function (s) {
        var after = Object.assign({}, s.pezzi);
        delete after[pezzo];
        s.pezzi = after;
        batch.update(db.collection('sponsorizzazioni').doc(s.id), { pezzi: after });
      });
      _renderPezziSponsor();
      batch.commit().catch(function (e) { alert('Errore: ' + e.message); });
    });
  }

  /* ---- Listino dimensioni stampe (catalogoDimensioni della stagione) ---- */
  function _renderDimensioniModalList() {
    var list = document.getElementById('dimensioniModalList');
    if (!list) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var cat = season.catalogoDimensioni || [];
    list.innerHTML = cat.length ? cat.map(function (d, i) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<span>' + esc(d.nome) + ' — €' + Number(d.prezzo || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + '</span>' +
        '<button class="dg-btn-icon-only dg-dimensione-del" title="Elimina" data-idx="' + i + '">' + _delIconSm() + '</button>' +
        '</div>';
    }).join('') : '<p class="dg-muted">Nessuna dimensione ancora.</p>';
    list.querySelectorAll('.dg-dimensione-del').forEach(function (btn) {
      btn.addEventListener('click', function () { _deleteDimensione(+btn.dataset.idx); });
    });
  }

  function _addDimensione() {
    var nomeInput = document.getElementById('dimensioneNewNomeInput');
    var prezzoInput = document.getElementById('dimensioneNewPrezzoInput');
    var nome = nomeInput.value.trim();
    var prezzo = +prezzoInput.value || 0;
    if (!nome) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var cat = (season.catalogoDimensioni || []).slice();
    if (cat.some(function (d) { return d.nome.toLowerCase() === nome.toLowerCase(); })) { alert('Esiste già una dimensione con questo nome.'); return; }
    cat.push({ nome: nome, prezzo: prezzo });
    season.catalogoDimensioni = cat;
    nomeInput.value = ''; prezzoInput.value = '';
    _renderDimensioniModalList();
    _renderPezziSponsor();
    db.collection('budgetSeasons').doc(season.id).update({ catalogoDimensioni: cat })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _deleteDimensione(idx) {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var cat = (season.catalogoDimensioni || []).slice();
    var d = cat[idx];
    if (!d) return;
    confirm('Rimuovere la dimensione "' + d.nome + '" dal listino? Le stampe già assegnate con questa dimensione mantengono comunque il prezzo già impostato.', function () {
      cat.splice(idx, 1);
      season.catalogoDimensioni = cat;
      _renderDimensioniModalList();
      _renderPezziSponsor();
      db.collection('budgetSeasons').doc(season.id).update({ catalogoDimensioni: cat })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  }

  /* ---- Voci di spesa "Materiali sponsor" — il totale delle stampe e quello dei pezzi
     assegnati (stato chiuso, stagione corrente) confluiscono in DUE voci separate come
     PREVENTIVATO (proiezione dalla tabella), ciascuna con la propria IVA 22% figlia via
     _syncSpesaIva (stesso meccanismo generico usato per ogni voce). Il Sostenuto (la spesa
     realmente effettuata) resta interamente a mano nella tabella Spese — vedi il commento
     su _syncVoceAutomatica per il motivo. ---- */
  var _materialiSyncBusy = false;
  function _totaliMaterialiSponsor() {
    var totStampe = 0, totPezzi = 0;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var prezziPezzi = season.pezziPrezzi || {};
    var perPezzo = {};

    var accumula = function (pezziObj) {
      if (!pezziObj) return;
      Object.keys(pezziObj).forEach(function (k) {
        var cell = pezziObj[k];
        if (!cell || !cell.dimensione) return;
        var q = cell.quantita ? (+cell.quantita || 1) : 1;
        totStampe += (+cell.prezzo || 0) * q;
        perPezzo[k] = Math.max(perPezzo[k] || 0, q);
      });
    };

    _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && (s.stato === 'chiuso' || s.includiMateriali); })
      .forEach(function (s) { accumula(s.pezzi); });
    (season.vociExtra || []).forEach(function (v) { accumula(v.pezzi); });

    Object.keys(perPezzo).forEach(function (nome) { totPezzi += _totalePezzoColonna(prezziPezzi[nome], perPezzo[nome]); });

    return { stampe: Math.round(totStampe * 100) / 100, pezzi: Math.round(totPezzi * 100) / 100 };
  }

  /* Crea/aggiorna/rimuove una singola voce di spesa auto-gestita (identificata dal campo
     season[fieldId]) e la sua IVA 22% figlia, allineandola al totale corrente.
     Il totale calcolato dalla tabella confluisce SEMPRE e SOLO in "Preventivato": "Sostenuto"
     (la spesa realmente effettuata) resta interamente a mano dell'utente e il sync non lo
     tocca mai più dopo la creazione — altrimenti ogni ricalcolo della tabella cancellerebbe
     un valore inserito manualmente (es. portato a 0 perché non ancora pagato). Per lo stesso
     motivo la voce viene rimossa in automatico solo se anche il sostenuto è a zero: se l'utente
     ha già registrato una spesa reale, la voce resta anche a preventivato azzerato. */
  function _syncVoceAutomatica(season, fieldId, preventivato, categoria, note) {
    var v = season[fieldId] ? _vociSpesa.find(function (x) { return x.id === season[fieldId]; }) : null;
    if (!preventivato && !v) return Promise.resolve();
    if (v && (+v.importoPreventivato || 0) === preventivato) return Promise.resolve();

    if (!preventivato && v && !(+v.importoSostenuto || 0)) {
      var figlia = v.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;
      return db.collection('vociSpesa').doc(v.id).delete()
        .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== v.id && (!figlia || x.id !== figlia.id); });
          season[fieldId] = '';
          var patch = {}; patch[fieldId] = '';
          return db.collection('budgetSeasons').doc(season.id).update(patch);
        });
    }
    if (v) {
      var old = { importoPreventivato: v.importoPreventivato || 0 };
      v.importoPreventivato = preventivato;
      return db.collection('vociSpesa').doc(v.id).update({ importoPreventivato: preventivato })
        .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'update', _diff(old, { importoPreventivato: preventivato }, ['importoPreventivato'])); })
        .then(function () { return _syncSpesaIva(v); });
    }
    var data = {
      seasonId: _currentSeasonId, categoria: categoria, categoriaSpesaId: '',
      importoPreventivato: preventivato, importoSostenuto: 0, ivaAliquota: 22, dataSpesa: '',
      note: note
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      season[fieldId] = ref.id;
      var patch = {}; patch[fieldId] = ref.id;
      return db.collection('budgetSeasons').doc(season.id).update(patch);
    }).then(function () {
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + categoria, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      return _syncSpesaIva(data);
    });
  }

  function _syncMaterialiSpesa() {
    if (_materialiSyncBusy) return;
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; });
    if (!season) return;
    var totali = _totaliMaterialiSponsor();

    _materialiSyncBusy = true;
    var release = function () { _materialiSyncBusy = false; _renderSpese(); _renderStatCards(); _renderBilancio(); };

    /* Migrazione una tantum: le stagioni create prima dello split avevano un'unica voce
       combinata "Materiali sponsor" — la rimuove (con la sua IVA figlia) così il sync sotto
       ricrea le due voci separate. */
    var migrazione = Promise.resolve();
    if (season.materialiVoceSpesaId) {
      var vecchia = _vociSpesa.find(function (x) { return x.id === season.materialiVoceSpesaId; });
      if (vecchia) {
        var figliaVecchia = vecchia.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === vecchia.ivaVoceSpesaId; }) : null;
        migrazione = db.collection('vociSpesa').doc(vecchia.id).delete()
          .then(function () { return _logWrite('voceSpesa', vecchia.id, 'Spesa — ' + vecchia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
          .then(function () { return figliaVecchia ? db.collection('vociSpesa').doc(figliaVecchia.id).delete()
            .then(function () { return _logWrite('voceSpesa', figliaVecchia.id, 'Spesa — ' + figliaVecchia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
          .then(function () {
            _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== vecchia.id && (!figliaVecchia || x.id !== figliaVecchia.id); });
            season.materialiVoceSpesaId = '';
            return db.collection('budgetSeasons').doc(season.id).update({ materialiVoceSpesaId: '' });
          });
      } else {
        season.materialiVoceSpesaId = '';
        migrazione = db.collection('budgetSeasons').doc(season.id).update({ materialiVoceSpesaId: '' });
      }
    }

    var p = migrazione
      .then(function () {
        return _syncVoceAutomatica(season, 'materialiStampeVoceSpesaId', totali.stampe, 'Materiali sponsor — Stampe',
          'Preventivato automatico dalle stampe assegnate agli sponsor chiusi (tabella "Materiali sponsor") — il Sostenuto va aggiornato a mano qui sotto quando la spesa è effettiva');
      })
      .then(function () {
        return _syncVoceAutomatica(season, 'materialiPezziVoceSpesaId', totali.pezzi, 'Materiali sponsor — Pezzi',
          'Preventivato automatico dai pezzi/gadget assegnati agli sponsor chiusi (tabella "Materiali sponsor") — il Sostenuto va aggiornato a mano qui sotto quando la spesa è effettiva');
      });

    p.then(release, function (e) { release(); alert('Errore aggiornamento spesa materiali: ' + e.message); });
  }

  function _attachKanbanEvents() {
    document.querySelectorAll('.dg-kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); });
      card.addEventListener('click', function () { if (!_kanbanTouch.moved) _openDrawer(card.dataset.id); });
      _bindKanbanCardTouch(card);
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

  /* ---- Drag & drop touch per Kanban sponsor (mobile) ---- */
  var _kanbanTouch = {
    timer: null, active: false, moved: false, card: null, id: null,
    clone: null, offX: 0, offY: 0, startX: 0, startY: 0, lastX: 0, lastY: 0,
    curCol: null, boardEl: null, rafId: null
  };
  var KANBAN_SCROLL_EDGE = 70;
  var KANBAN_SCROLL_SPEED = 14;

  function _kanbanTouchCleanup() {
    if (_kanbanTouch.timer) { clearTimeout(_kanbanTouch.timer); }
    if (_kanbanTouch.rafId) { cancelAnimationFrame(_kanbanTouch.rafId); }
    if (_kanbanTouch.clone) { _kanbanTouch.clone.remove(); }
    if (_kanbanTouch.card) { _kanbanTouch.card.classList.remove('is-dragging'); }
    if (_kanbanTouch.curCol) { _kanbanTouch.curCol.classList.remove('dg-drop-hover'); }
    _kanbanTouch.timer = null;
    _kanbanTouch.rafId = null;
    _kanbanTouch.active = false;
    _kanbanTouch.card = null;
    _kanbanTouch.id = null;
    _kanbanTouch.clone = null;
    _kanbanTouch.curCol = null;
    _kanbanTouch.boardEl = null;
  }

  function _kanbanUpdateDropTarget() {
    var el = document.elementFromPoint(_kanbanTouch.lastX, _kanbanTouch.lastY);
    var col = el ? el.closest('.dg-kanban-col-body') : null;
    if (col !== _kanbanTouch.curCol) {
      if (_kanbanTouch.curCol) _kanbanTouch.curCol.classList.remove('dg-drop-hover');
      if (col) col.classList.add('dg-drop-hover');
      _kanbanTouch.curCol = col;
    }
  }

  function _kanbanAutoScrollTick() {
    if (!_kanbanTouch.active) { _kanbanTouch.rafId = null; return; }
    if (_kanbanTouch.clone) {
      _kanbanTouch.clone.style.left = (_kanbanTouch.lastX - _kanbanTouch.offX) + 'px';
      _kanbanTouch.clone.style.top = (_kanbanTouch.lastY - _kanbanTouch.offY) + 'px';
    }
    var board = _kanbanTouch.boardEl;
    if (board) {
      var rect = board.getBoundingClientRect();
      var x = _kanbanTouch.lastX;
      if (x < rect.left + KANBAN_SCROLL_EDGE) {
        var distL = (rect.left + KANBAN_SCROLL_EDGE - x) / KANBAN_SCROLL_EDGE;
        board.scrollLeft -= KANBAN_SCROLL_SPEED * Math.min(1, distL);
      } else if (x > rect.right - KANBAN_SCROLL_EDGE) {
        var distR = (x - (rect.right - KANBAN_SCROLL_EDGE)) / KANBAN_SCROLL_EDGE;
        board.scrollLeft += KANBAN_SCROLL_SPEED * Math.min(1, distR);
      }
    }
    _kanbanUpdateDropTarget();
    _kanbanTouch.rafId = requestAnimationFrame(_kanbanAutoScrollTick);
  }

  function _bindKanbanCardTouch(card) {
    card.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      _kanbanTouch.startX = t.clientX;
      _kanbanTouch.startY = t.clientY;
      _kanbanTouch.lastX = t.clientX;
      _kanbanTouch.lastY = t.clientY;
      _kanbanTouch.card = card;
      _kanbanTouch.id = card.dataset.id;
      _kanbanTouch.active = false;
      _kanbanTouch.moved = false;
      _kanbanTouch.timer = setTimeout(function () {
        _kanbanTouch.active = true;
        card.classList.add('is-dragging');
        _kanbanTouch.boardEl = card.closest('.dg-kanban');
        var rect = card.getBoundingClientRect();
        var clone = card.cloneNode(true);
        clone.classList.remove('is-dragging');
        clone.classList.add('dg-kanban-card--ghost');
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.margin = '0';
        clone.style.zIndex = '9999';
        clone.style.pointerEvents = 'none';
        document.body.appendChild(clone);
        _kanbanTouch.clone = clone;
        _kanbanTouch.offX = t.clientX - rect.left;
        _kanbanTouch.offY = t.clientY - rect.top;
        if (navigator.vibrate) navigator.vibrate(10);
        _kanbanTouch.rafId = requestAnimationFrame(_kanbanAutoScrollTick);
      }, 300);
    }, { passive: true });

    card.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!_kanbanTouch.active) {
        var dx = Math.abs(t.clientX - _kanbanTouch.startX);
        var dy = Math.abs(t.clientY - _kanbanTouch.startY);
        if (dx > 10 || dy > 10) { clearTimeout(_kanbanTouch.timer); _kanbanTouch.timer = null; }
        return;
      }
      e.preventDefault();
      _kanbanTouch.moved = true;
      _kanbanTouch.lastX = t.clientX;
      _kanbanTouch.lastY = t.clientY;
    }, { passive: false });

    card.addEventListener('touchend', function () {
      clearTimeout(_kanbanTouch.timer);
      _kanbanTouch.timer = null;
      var wasActive = _kanbanTouch.active;
      var id = _kanbanTouch.id;
      var col = _kanbanTouch.curCol;
      _kanbanTouchCleanup();
      if (wasActive && col) {
        var stato = col.closest('.dg-kanban-col').dataset.stato;
        _changeStato(id, stato);
      }
    });

    card.addEventListener('touchcancel', function () { _kanbanTouchCleanup(); });
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
      .then(function () { return _syncSponsorIva(s); })
      .then(function () { _renderSpese(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- DRAWER — Scheda Azienda (accordion: tutto chiuso, una sezione alla volta) ---- */
  var DRAWER_SECTIONS = [
    { key: 'anagrafica', label: 'Anagrafica',       fn: function () { return _tabAnagrafica(); } },
    { key: 'deal',       label: 'Sponsorizzazione', fn: function () { return _tabDeal(); } },
    { key: 'note',       label: 'Note',             fn: function () { return _tabNote(); } },
    { key: 'pagamenti',  label: 'Pagamenti',        fn: function () { return _tabPagamenti(); } },
    { key: 'timeline',   label: 'Timeline',         fn: function () { return _tabTimeline(); } },
    { key: 'promemoria', label: 'Promemoria',       fn: function () { return _tabPromemoria(); } },
    { key: 'storico',    label: 'Storico',          fn: function () { return _tabStorico(); } }
  ];
  var _openAccordionSection = null;

  function _openDrawer(sponsorId) {
    var s = _sponsorizzazioni.find(function (x) { return x.id === sponsorId; });
    if (!s) return;
    _curSponsorId = sponsorId;
    _curAziendaId = s.aziendaId;
    _trancheEditingId = null;
    var az = _aziendaById(_curAziendaId);
    document.getElementById('drawerAziendaNome').textContent = az ? az.ragioneSociale : '—';
    document.getElementById('drawerStoricoBadge').classList.toggle('is-hidden', !_isStorico(_curAziendaId));
    document.getElementById('drawerOverlay').classList.remove('is-hidden');
    document.getElementById('aziendaDrawer').classList.remove('is-hidden');
    requestAnimationFrame(function () { document.getElementById('aziendaDrawer').classList.add('is-open'); });
    _renderDrawerAccordion();
  }

  function _closeDrawer() {
    document.getElementById('aziendaDrawer').classList.remove('is-open');
    setTimeout(function () {
      document.getElementById('aziendaDrawer').classList.add('is-hidden');
      document.getElementById('drawerOverlay').classList.add('is-hidden');
    }, 250);
  }

  function _renderDrawerAccordion() {
    _openAccordionSection = null;
    document.getElementById('drawerBody').innerHTML = DRAWER_SECTIONS.map(function (sec) {
      return '<div class="dg-accordion-item">' +
        '<button type="button" class="dg-accordion-head" data-dsec="' + sec.key + '" aria-expanded="false">' +
          '<span>' + sec.label + '</span>' +
          '<svg class="dg-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6,9 12,15 18,9"/></svg>' +
        '</button>' +
        '<div class="dg-accordion-body is-hidden" id="dgAccBody-' + sec.key + '">' + sec.fn() + '</div>' +
      '</div>';
    }).join('');
    document.querySelectorAll('.dg-accordion-head').forEach(function (btn) {
      btn.addEventListener('click', function () { _toggleAccordionSection(btn.dataset.dsec); });
    });
  }

  function _toggleAccordionSection(key) {
    _openAccordionSection = (_openAccordionSection === key) ? null : key;
    document.querySelectorAll('.dg-accordion-head').forEach(function (btn) {
      var active = btn.dataset.dsec === _openAccordionSection;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-expanded', active ? 'true' : 'false');
    });
    document.querySelectorAll('.dg-accordion-body').forEach(function (body) {
      body.classList.toggle('is-hidden', body.id !== 'dgAccBody-' + _openAccordionSection);
    });
  }

  /* Rigenera il contenuto di una sezione dopo un salvataggio, senza toccare
     quale sezione è aperta (l'utente stava già scrivendo lì dentro). */
  function _refreshAccordionSection(key) {
    var sec = DRAWER_SECTIONS.find(function (s) { return s.key === key; });
    var body = document.getElementById('dgAccBody-' + key);
    if (!sec || !body) return;
    body.innerHTML = sec.fn();
  }

  function _field(id, label, value) {
    return '<div class="dg-form-group"><label class="dg-form-label">' + label + '</label>' +
      '<input class="dg-form-input" id="' + id + '" value="' + esc(value) + '"></div>';
  }

  function _tabAnagrafica() {
    var a = _aziendaById(_curAziendaId) || {};
    return '<div class="dg-form-group"><label class="dg-form-label">Ragione sociale</label><input class="dg-form-input" id="dgAzNome" value="' + esc(a.ragioneSociale) + '"></div>' +
      '<div class="dg-form-grid">' +
      _field('dgAzSettore', 'Settore', a.settore) +
      _field('dgAzReferente', 'Referente', a.referente) +
      _field('dgAzTelefono', 'Telefono', a.telefono) +
      _field('dgAzEmail', 'Email', a.email) +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Sito web</label><input class="dg-form-input" id="dgAzSito" value="' + esc(a.sitoWeb) + '"></div>' +
      '<div class="dg-form-actions" style="justify-content:space-between">' +
        '<button class="dg-btn-ghost dg-btn-ghost--danger dg-btn-sm" onclick="DG.deleteAzienda()">Elimina azienda</button>' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveAzienda()">Salva anagrafica</button>' +
      '</div>';
  }

  DG.saveAzienda = function () {
    var a = _aziendaById(_curAziendaId);
    if (!a) return;
    var old = Object.assign({}, a);
    var patch = {
      ragioneSociale: val('dgAzNome'), settore: val('dgAzSettore'), referente: val('dgAzReferente'),
      telefono: val('dgAzTelefono'), email: val('dgAzEmail'), sitoWeb: val('dgAzSito')
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

  DG.deleteAzienda = function () {
    var a = _aziendaById(_curAziendaId);
    if (!a) return;
    var hasSponsorizzazioni = _sponsorizzazioni.some(function (x) { return x.aziendaId === a.id; });
    if (hasSponsorizzazioni) {
      alert('Questa azienda ha ancora sponsorizzazioni collegate (anche di stagioni passate). Elimina prima quelle dal tab "Sponsorizzazione", poi l\'azienda.');
      return;
    }
    confirm('Eliminare definitivamente l\'azienda "' + a.ragioneSociale + '"? L\'operazione non è reversibile.', function () {
      db.collection('aziende').doc(a.id).delete()
        .then(function () { return _logWrite('azienda', a.id, 'Azienda — ' + a.ragioneSociale, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _aziende = _aziende.filter(function (x) { return x.id !== a.id; });
          _closeDrawer();
          _renderKanban();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
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
      '<div class="dg-form-group"><label class="dg-form-label">Modalità pagamento</label><input type="text" id="dgDealPagamento" class="dg-form-input" value="' + esc(s.modalitaPagamento) + '"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Responsabile</label><select id="dgDealResponsabile" class="dg-form-input">' + respOptions + '</select></div>' +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Contropartite</label><textarea id="dgDealContropartite" class="dg-form-input dg-form-textarea" rows="2">' + esc(s.contropartite || '') + '</textarea></div>' +
      '<div class="dg-form-actions" style="justify-content:space-between">' +
        '<button class="dg-btn-ghost dg-btn-ghost--danger dg-btn-sm" onclick="DG.deleteDeal()">Elimina sponsorizzazione</button>' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveDeal()">Salva</button>' +
      '</div>';
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
      contropartite: val('dgDealContropartite')
    };
    Object.assign(s, patch);
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    db.collection('sponsorizzazioni').doc(s.id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { return _syncSponsorIva(s); })
      .then(function () { _renderKanban(); _renderStatCards(); _renderCharts(); _refreshAccordionSection('deal'); _renderSpese(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _tabNote() {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return '';
    return '<div class="dg-form-group"><textarea id="dgNoteText" class="dg-form-input dg-form-textarea" rows="5" placeholder="Nota su questa sponsorizzazione...">' + esc(s.note || '') + '</textarea></div>' +
      '<div class="dg-form-actions" style="justify-content:flex-end">' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveNote()">Salva nota</button>' +
      '</div>';
  }

  DG.saveNote = function () {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return;
    var old = Object.assign({}, s);
    var patch = { note: val('dgNoteText') };
    Object.assign(s, patch);
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    db.collection('sponsorizzazioni').doc(s.id).update(patch)
      .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { _renderKanban(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteDeal = function () {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return;
    var az = _aziendaById(s.aziendaId);
    var label = 'Sponsorizzazione — ' + (az ? az.ragioneSociale : s.id);
    confirm('Eliminare definitivamente "' + label + '"? L\'operazione non è reversibile.', function () {
      var figlia = s.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; }) : null;
      db.collection('sponsorizzazioni').doc(s.id).delete()
        .then(function () { return _logWrite('sponsorizzazione', s.id, label, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () {
          _sponsorizzazioni = _sponsorizzazioni.filter(function (x) { return x.id !== s.id; });
          if (figlia) _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== figlia.id; });
          _closeDrawer();
          _renderKanban(); _renderStatCards(); _renderCharts(); _renderSpese(); _renderBilancio();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- TRANCHE DI PAGAMENTO — tracciamento incassi reali di uno sponsor chiuso ---- */
  function _tabPagamenti() {
    var s = _sponsorizzazioni.find(function (x) { return x.id === _curSponsorId; });
    if (!s) return '';
    var items = _trancheOf(_curSponsorId).sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; });

    var totale = +s.importoConfermato || 0;
    var pianificato = items.reduce(function (sum, t) { return sum + (+t.importo || 0); }, 0);
    var incassato = items.reduce(function (sum, t) { return sum + (t.pagato ? (+t.importo || 0) : 0); }, 0);
    var residuo = totale - pianificato;

    var intro = s.stato !== 'chiuso'
      ? '<p class="dg-muted" style="margin-bottom:14px">Lo sponsor non è ancora "Chiuso": le tranche restano comunque salvate, ma contano nel Saldo/Entrate confermate solo quando lo stato passa a Chiuso.</p>'
      : '';

    var summary = '<div class="dg-card" style="margin-bottom:14px;padding:14px 16px">' +
      '<div class="dg-toolbar" style="gap:16px">' +
      '<div><div class="dg-stat-label">Importo confermato</div><div class="dg-card-title">€' + totale.toLocaleString('it-IT') + '</div></div>' +
      '<div><div class="dg-stat-label">Incassato</div><div class="dg-card-title" style="color:var(--dg-green)">€' + incassato.toLocaleString('it-IT') + '</div></div>' +
      '<div><div class="dg-stat-label">Da incassare</div><div class="dg-card-title" style="color:var(--dg-orange)">€' + (pianificato - incassato).toLocaleString('it-IT') + '</div></div>' +
      '</div>' +
      (items.length && residuo !== 0
        ? '<p class="dg-muted" style="margin-top:8px">' + (residuo > 0
            ? 'Mancano €' + residuo.toLocaleString('it-IT') + ' di tranche per coprire l\'intero importo confermato.'
            : 'Le tranche superano l\'importo confermato di €' + Math.abs(residuo).toLocaleString('it-IT') + '.') + '</p>'
        : '') +
      '</div>';

    var list = items.length ? items.map(function (t) {
      if (t.id === _trancheEditingId) {
        return '<div class="dg-reminder-item" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px">' +
          '<div class="dg-form-grid">' +
          '<div class="dg-form-group"><label class="dg-form-label">Importo (€)</label><input type="number" id="dgTrancheEditImporto" class="dg-form-input" min="0" step="50" value="' + Number(t.importo || 0) + '"></div>' +
          '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgTrancheEditScadenza" class="dg-form-input" value="' + esc(t.scadenza || '') + '"></div>' +
          '</div>' +
          '<div class="dg-form-group"><label class="dg-form-label">Note</label><input type="text" id="dgTrancheEditNote" class="dg-form-input" value="' + esc(t.note || '') + '"></div>' +
          '<div class="dg-form-actions" style="margin-top:0">' +
          '<button class="dg-btn-ghost dg-btn-sm" onclick="DG.editTrancheCancel()">Annulla</button>' +
          '<button class="dg-btn-primary dg-btn-sm" onclick="DG.saveTranche(\'' + t.id + '\')">Salva</button>' +
          '</div></div>';
      }
      return '<div class="dg-reminder-item" style="cursor:default">' +
        '<label class="dg-check"><input type="checkbox" ' + (t.pagato ? 'checked' : '') + ' onchange="DG.toggleTranchePagata(\'' + t.id + '\', this.checked)">' +
        '<span><div class="dg-reminder-azienda">€' + Number(t.importo || 0).toLocaleString('it-IT') + (t.pagato ? ' — pagata' : ' — da pagare') + '</div>' +
        '<div class="dg-reminder-desc">Scadenza: ' + _fmtDate(t.scadenza) + (t.note ? ' · ' + esc(t.note) : '') + '</div></span></label>' +
        '<div style="display:flex;gap:4px;flex-shrink:0">' +
        '<button class="dg-btn-icon-only" title="Modifica" onclick="DG.editTrancheStart(\'' + t.id + '\')">' + EDIT_ICON_SM + '</button>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteTranche(\'' + t.id + '\')">' + _delIconSm() + '</button>' +
        '</div></div>';
    }).join('') : '<p class="dg-muted">Nessuna tranche pianificata: l\'importo confermato conta per intero nel saldo.</p>';

    return intro + summary +
      '<div style="display:flex;flex-direction:column;gap:8px">' + list + '</div>' +
      '<div class="dg-form-grid" style="margin-top:18px">' +
      '<div class="dg-form-group"><label class="dg-form-label">Importo (€)</label><input type="number" id="dgTrancheImporto" class="dg-form-input" min="0" step="50"></div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Scadenza</label><input type="date" id="dgTrancheScadenza" class="dg-form-input" value="' + _todayISO() + '"></div>' +
      '</div>' +
      '<div class="dg-form-group"><label class="dg-form-label">Note</label><input type="text" id="dgTrancheNote" class="dg-form-input" placeholder="es. Acconto alla firma"></div>' +
      '<div class="dg-form-actions"><button class="dg-btn-primary dg-btn-sm" onclick="DG.addTranche()">Aggiungi tranche</button></div>';
  }

  DG.addTranche = function () {
    var importo = +val('dgTrancheImporto') || 0;
    var scadenza = val('dgTrancheScadenza');
    if (!importo || !scadenza) { alert('Importo e scadenza sono obbligatori.'); return; }
    var data = {
      sponsorizzazioneId: _curSponsorId, importo: importo, scadenza: scadenza,
      note: val('dgTrancheNote').trim(), pagato: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('tranchePagamento').doc();
    var az = _aziendaById(_curAziendaId);
    ref.set(data).then(function () {
      data.id = ref.id;
      _tranche.push(data);
      return _logWrite('tranchePagamento', ref.id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.editTrancheStart = function (id) {
    _trancheEditingId = id;
    _refreshAccordionSection('pagamenti');
  };

  DG.editTrancheCancel = function () {
    _trancheEditingId = null;
    _refreshAccordionSection('pagamenti');
  };

  DG.saveTranche = function (id) {
    var t = _tranche.find(function (x) { return x.id === id; });
    if (!t) return;
    var importo = +val('dgTrancheEditImporto') || 0;
    var scadenza = val('dgTrancheEditScadenza');
    if (!importo || !scadenza) { alert('Importo e scadenza sono obbligatori.'); return; }
    var patch = { importo: importo, scadenza: scadenza, note: val('dgTrancheEditNote').trim() };
    var old = { importo: t.importo, scadenza: t.scadenza, note: t.note };
    var az = _aziendaById(_curAziendaId);
    var s = _sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
    Object.assign(t, patch);
    db.collection('tranchePagamento').doc(id).update(patch)
      .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () { return (t.pagato && s) ? _syncSponsorIva(s) : null; })
      .then(function () {
        _trancheEditingId = null;
        _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderBilancio(); _renderSpese();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* Voce di spesa "IVA <azienda>" collegata a uno sponsor (s.ivaVoceSpesaId): il preventivato
     scatta all'11% dell'importoConfermato appena lo stato passa a "chiuso" (anche prima di
     incassare), il sostenuto è l'11% delle sole tranche già segnate pagate. Si aggiorna ad ogni
     cambio di stato/importo/tranche invece di generare righe nuove, e si rimuove da sola se
     preventivato e sostenuto tornano entrambi a zero (es. lo stato torna indietro da "chiuso"). */
  function _syncSponsorIva(s) {
    var preventivato = s.stato === 'chiuso' ? Math.round((+s.importoConfermato || 0) * 0.11 * 100) / 100 : 0;
    var pagate = _trancheOf(s.id).filter(function (t) { return t.pagato; });
    var incassato = pagate.reduce(function (sum, t) { return sum + (+t.importo || 0); }, 0);
    var sostenuto = Math.round(incassato * 0.11 * 100) / 100;
    var figlia = s.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; }) : null;
    var az = _aziendaById(s.aziendaId);
    var nome = ('IVA ' + (az ? az.ragioneSociale : '')).trim();

    if (preventivato <= 0 && sostenuto <= 0) {
      if (!figlia) return Promise.resolve();
      return db.collection('vociSpesa').doc(figlia.id).delete()
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return db.collection('sponsorizzazioni').doc(s.id).update({ ivaVoceSpesaId: '' }); })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== figlia.id; });
          s.ivaVoceSpesaId = '';
        });
    }

    if (figlia) {
      var old = { categoria: figlia.categoria, importoPreventivato: figlia.importoPreventivato, importoSostenuto: figlia.importoSostenuto, ivaAliquota: figlia.ivaAliquota };
      var patch = { categoria: nome, importoPreventivato: preventivato, importoSostenuto: sostenuto, ivaAliquota: 11 };
      return db.collection('vociSpesa').doc(figlia.id).update(patch)
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + nome, 'update', _diff(old, patch, Object.keys(patch))); })
        .then(function () { Object.assign(figlia, patch); });
    }

    var data = {
      seasonId: s.seasonId, categoria: nome, categoriaSpesaId: '',
      importoPreventivato: preventivato, importoSostenuto: sostenuto, ivaAliquota: 11, dataSpesa: '',
      note: 'IVA 11% generata automaticamente sullo sponsor "' + nome.replace(/^IVA /, '') + '" (preventivo alla chiusura, saldo sulle tranche incassate)',
      isIva: true, pagata: false, ivaEscluso: false, ivaTrimestre: '', ivaScadenza: '', ivaScadenzaManuale: false
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      s.ivaVoceSpesaId = ref.id;
      return db.collection('sponsorizzazioni').doc(s.id).update({ ivaVoceSpesaId: ref.id });
    }).then(function () {
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    });
  }

  /* Migrazione una tantum (da lanciare col bottone "Ricalcola IVA sponsor" in Riepilogo IVA):
     applica _syncSponsorIva agli sponsor già "chiusi" prima che esistesse questo calcolo. Ripulisce
     anche le vecchie voci "IVA <azienda>" generate dal meccanismo precedente (una per tranche pagata,
     solo sostenuto, mai preventivato — riconoscibili dal campo ivaVoceSpesaId rimasto sulla tranche),
     così non restano duplicate rispetto all'unica voce consolidata per sponsor. Agisce solo sulla
     stagione correntemente selezionata (i dati di spesa sono caricati per stagione). */
  DG.migraIvaSponsor = function () {
    var candidati = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId && s.stato === 'chiuso'; });
    if (!candidati.length) { alert('Nessuno sponsor "chiuso" in questa stagione: niente da ricalcolare.'); return; }
    confirm('Ricalcolare l\'IVA per ' + candidati.length + ' sponsor "chiusi" di questa stagione? Le eventuali vecchie voci IVA generate per singola tranche pagata verranno unificate in una sola voce per sponsor (preventivato all\'11% dell\'importo confermato, sostenuto sulle tranche già incassate).', function () {
      var orfane = [];
      candidati.forEach(function (s) {
        _trancheOf(s.id).forEach(function (t) {
          if (t.ivaVoceSpesaId && orfane.indexOf(t.ivaVoceSpesaId) === -1) orfane.push(t.ivaVoceSpesaId);
        });
      });
      var chain = Promise.resolve();
      orfane.forEach(function (voceId) {
        chain = chain.then(function () {
          var v = _vociSpesa.find(function (x) { return x.id === voceId; });
          if (!v) return null;
          return db.collection('vociSpesa').doc(v.id).delete()
            .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
            .then(function () { _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== v.id; }); });
        });
      });
      candidati.forEach(function (s) {
        _trancheOf(s.id).forEach(function (t) {
          if (t.ivaVoceSpesaId) {
            chain = chain.then(function () { return db.collection('tranchePagamento').doc(t.id).update({ ivaVoceSpesaId: '' }); })
              .then(function () { t.ivaVoceSpesaId = ''; });
          }
        });
        chain = chain.then(function () { return _syncSponsorIva(s); });
      });
      chain.then(function () {
        _renderSpese(); _renderBilancio(); _renderKanban();
        alert('IVA ricalcolata per ' + candidati.length + ' sponsor.');
      }).catch(function (e) { alert('Errore durante il ricalcolo: ' + e.message); });
    });
  };

  DG.toggleTranchePagata = function (id, checked) {
    var t = _tranche.find(function (x) { return x.id === id; });
    if (!t) return;
    var old = { pagato: !!t.pagato };
    t.pagato = checked;
    var az = _aziendaById(_curAziendaId);
    var s = _sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
    db.collection('tranchePagamento').doc(id).update({ pagato: checked })
      .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'update', _diff(old, { pagato: checked }, ['pagato'])); })
      .then(function () { return s ? _syncSponsorIva(s) : null; })
      .then(function () { _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderBilancio(); _renderSpese(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteTranche = function (id) {
    confirm('Eliminare questa tranche?', function () {
      var t = _tranche.find(function (x) { return x.id === id; });
      var s = t ? _sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; }) : null;
      var az = _aziendaById(_curAziendaId);
      db.collection('tranchePagamento').doc(id).delete()
        .then(function () { return _logWrite('tranchePagamento', id, 'Tranche — ' + (az ? az.ragioneSociale : ''), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _tranche = _tranche.filter(function (x) { return x.id !== id; });
          return (t && t.pagato && s) ? _syncSponsorIva(s) : null;
        })
        .then(function () {
          _refreshAccordionSection('pagamenti'); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderBilancio(); _renderSpese();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
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
    }).then(function () { _refreshAccordionSection('timeline'); })
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
    }).then(function () { _refreshAccordionSection('promemoria'); _renderPromemoriaWidget(); })
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
    confirm('Eliminare questo promemoria?', function () {
      db.collection('promemoria').doc(id).delete()
        .then(function () { return _logWrite('promemoria', id, 'Promemoria', 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _promemoria = _promemoria.filter(function (x) { return x.id !== id; });
          _refreshAccordionSection('promemoria'); _renderPromemoriaWidget();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
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

  /* ---- RETTE ATLETI ---- */
  function _renderRette() {
    var body = document.getElementById('retteBody');
    var r = _calcRetteAtleti();
    body.innerHTML = r.righe.length ? r.righe.map(function (c) {
      var rettaCell = c.id
        ? '<input type="number" class="dg-table-input" value="' + c.rettaUnitaria + '" data-id="' + c.id + '" onchange="DG.saveRettaUnitaria(this)">'
        : '—';
      var azioniCell = c.id
        ? '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteCategoria(\'' + c.id + '\')">' + _delIconSm() + '</button>'
        : '';
      return '<tr>' +
        '<td>' + esc(c.nome) + '</td>' +
        '<td>' + c.nAtleti + '</td>' +
        '<td>' + rettaCell + '</td>' +
        '<td>€' + Math.round(c.previsto).toLocaleString('it-IT') + '</td>' +
        '<td>€' + Math.round(c.incassato).toLocaleString('it-IT') + '</td>' +
        '<td class="' + (c.diff >= 0 ? 'dg-diff-pos' : 'dg-diff-neg') + '">' + (c.diff >= 0 ? '+' : '') + Math.round(c.diff).toLocaleString('it-IT') + ' €</td>' +
        '<td>' + azioniCell + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7" class="dg-empty">Nessuna categoria per questa stagione.</td></tr>';

    _renderAtletiRette();
  }

  DG.saveRettaUnitaria = function (el) {
    var id = el.dataset.id;
    var c = _categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    var old = { rettaUnitaria: c.rettaUnitaria || 0 };
    var v = +el.value || 0;
    c.rettaUnitaria = v;
    db.collection('categorieAtleti').doc(id).update({ rettaUnitaria: v })
      .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'update', _diff(old, { rettaUnitaria: v }, ['rettaUnitaria'])); })
      .then(function () { _renderRette(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteCategoria = function (id) {
    var c = _categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    if (_atletiRette.some(function (a) { return a.categoriaAtletiId === id; })) {
      alert('Questa categoria ha ancora atleti assegnati. Sposta o elimina prima gli atleti dalla tabella qui sotto.');
      return;
    }
    confirm('Eliminare la categoria "' + c.nome + '"?', function () {
      db.collection('categorieAtleti').doc(id).delete()
        .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _categorieAtleti = _categorieAtleti.filter(function (x) { return x.id !== id; });
          _renderRette(); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _categoriaAtletiOptionsHtml(selectedId) {
    return '<option value="">— Nessuna —</option>' + _categorieAtleti.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
    }).join('');
  }

  function _renderAtletiRette() {
    var body = document.getElementById('atletiRetteBody');
    if (!body) return;
    if (!_atletiRette.length) { body.innerHTML = '<tr><td colspan="6" class="dg-empty">Nessun atleta per questa stagione.</td></tr>'; return; }
    var list = _atletiRette.slice().sort(function (a, b) { return (a.cognome || '').localeCompare(b.cognome || ''); });
    body.innerHTML = list.map(function (a) {
      var cat = _categorieAtleti.find(function (c) { return c.id === a.categoriaAtletiId; });
      var rate = _rateByAtleta(a.id);
      var pagate = rate.filter(function (r) { return r.pagata; });
      var incassato = pagate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      var totale = rate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      return '<tr>' +
        '<td><input type="text" class="dg-table-input" value="' + esc(a.nome) + '" data-id="' + a.id + '" data-field="nome" onchange="DG.saveAtletaRettaField(this)"></td>' +
        '<td><input type="text" class="dg-table-input" value="' + esc(a.cognome) + '" data-id="' + a.id + '" data-field="cognome" onchange="DG.saveAtletaRettaField(this)"></td>' +
        '<td><select class="dg-table-input" data-id="' + a.id + '" data-field="categoriaAtletiId" onchange="DG.saveAtletaRettaField(this)">' + _categoriaAtletiOptionsHtml(a.categoriaAtletiId) + '</select></td>' +
        '<td>' + pagate.length + '/' + rate.length + ' pagate' + (rate.length ? ' — €' + Math.round(totale).toLocaleString('it-IT') : '') + '</td>' +
        '<td>€' + Math.round(incassato).toLocaleString('it-IT') + '</td>' +
        '<td>' +
          '<button class="dg-btn-ghost dg-btn-sm" onclick="DG.manageRateAtleta(\'' + a.id + '\')">Gestisci rate</button> ' +
          '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteAtletaRetta(\'' + a.id + '\')">' + _delIconSm() + '</button>' +
        '</td>' +
        '</tr>';
    }).join('');
  }

  DG.saveAtletaRettaField = function (el) {
    var id = el.dataset.id, field = el.dataset.field;
    var a = _atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    if (field !== 'categoriaAtletiId' && !el.value.trim()) { alert('Il campo non può essere vuoto.'); el.value = a[field]; return; }
    var nv = field === 'categoriaAtletiId' ? el.value : el.value.trim();
    var old = {}; old[field] = a[field] || '';
    a[field] = nv;
    var patch = {}; patch[field] = nv;
    db.collection('atletiRette').doc(id).update(patch)
      .then(function () { return _logWrite('atletaRetta', id, 'Atleta — ' + a.cognome + ' ' + a.nome, 'update', _diff(old, patch, [field])); })
      .then(function () { _renderRette(); _renderStatCards(); _renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteAtletaRetta = function (id) {
    var a = _atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    confirm('Eliminare l\'atleta "' + a.nome + ' ' + a.cognome + '"? Verranno eliminate anche le sue rate.', function () {
      var rate = _rateByAtleta(id);
      var batch = db.batch();
      rate.forEach(function (r) { batch.delete(db.collection('rateAtleti').doc(r.id)); });
      batch.delete(db.collection('atletiRette').doc(id));
      batch.commit()
        .then(function () { return _logWrite('atletaRetta', id, 'Atleta — ' + a.cognome + ' ' + a.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _atletiRette = _atletiRette.filter(function (x) { return x.id !== id; });
          _rateAtleti = _rateAtleti.filter(function (x) { return x.atletaRettaId !== id; });
          _renderRette(); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _saveNewAtletaRetta() {
    var nome = val('atletaRettaNomeInput').trim();
    var cognome = val('atletaRettaCognomeInput').trim();
    if (!nome || !cognome) { alert('Inserisci nome e cognome dell\'atleta.'); return; }
    var data = {
      seasonId: _currentSeasonId, nome: nome, cognome: cognome,
      categoriaAtletiId: val('atletaRettaCategoriaSelect')
    };
    var ref = db.collection('atletiRette').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _atletiRette.push(data);
      return _logWrite('atletaRetta', ref.id, 'Atleta — ' + cognome + ' ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newAtletaRettaModal');
      _renderRette(); _renderStatCards(); _renderCharts();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- Rate atleti (modal) — stesso pattern delle tranche sponsor ---- */
  DG.manageRateAtleta = function (id) {
    var a = _atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    _curAtletaRettaId = id;
    document.getElementById('rateAtletaNome').textContent = a.nome + ' ' + a.cognome;
    document.getElementById('rataAtletaImporto').value = '';
    document.getElementById('rataAtletaScadenza').value = '';
    document.getElementById('rataAtletaNote').value = '';
    _renderRateAtletaModal();
    _openBudgetModal('rateAtletaModal');
  };

  function _renderRateAtletaModal() {
    var el = document.getElementById('rateAtletaList');
    var rate = _curAtletaRettaId ? _rateByAtleta(_curAtletaRettaId) : [];
    rate = rate.slice().sort(function (a, b) { return (a.scadenza || '') < (b.scadenza || '') ? -1 : 1; });
    el.innerHTML = rate.length ? rate.map(function (r) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<div>' +
          '<div style="font-weight:700;font-size:13px">€' + Number(r.importo || 0).toLocaleString('it-IT') + (r.note ? ' — ' + esc(r.note) : '') + '</div>' +
          '<div style="font-size:12px;color:var(--dg-muted)">Scadenza: ' + (r.scadenza ? _fmtDate(r.scadenza) : '—') + '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
          '<label class="dg-check" style="font-size:12px"><input type="checkbox"' + (r.pagata ? ' checked' : '') + ' onchange="DG.toggleRataAtleta(\'' + r.id + '\', this.checked)"> Pagata</label>' +
          '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteRataAtleta(\'' + r.id + '\')">' + _delIconSm() + '</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<p class="dg-muted">Nessuna rata inserita.</p>';
  }

  function _addRataAtleta() {
    if (!_curAtletaRettaId) return;
    var importo = +val('rataAtletaImporto') || 0;
    var scadenza = val('rataAtletaScadenza');
    if (!importo) { alert('Inserisci un importo.'); return; }
    var data = {
      atletaRettaId: _curAtletaRettaId, importo: importo, scadenza: scadenza,
      note: val('rataAtletaNote').trim(), pagata: false, createdAt: new Date().toISOString()
    };
    var ref = db.collection('rateAtleti').doc();
    var a = _atletiRette.find(function (x) { return x.id === _curAtletaRettaId; });
    ref.set(data).then(function () {
      data.id = ref.id;
      _rateAtleti.push(data);
      return _logWrite('rataAtleti', ref.id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      document.getElementById('rataAtletaImporto').value = '';
      document.getElementById('rataAtletaScadenza').value = '';
      document.getElementById('rataAtletaNote').value = '';
      _renderRateAtletaModal();
      _renderRette(); _renderStatCards(); _renderCharts();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  DG.toggleRataAtleta = function (id, checked) {
    var r = _rateAtleti.find(function (x) { return x.id === id; });
    if (!r) return;
    var old = { pagata: !!r.pagata };
    var patch = { pagata: checked };
    r.pagata = checked;
    var a = _atletiRette.find(function (x) { return x.id === r.atletaRettaId; });
    db.collection('rateAtleti').doc(id).update(patch)
      .then(function () { return _logWrite('rataAtleti', id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'update', _diff(old, patch, ['pagata'])); })
      .then(function () { _renderRateAtletaModal(); _renderRette(); _renderStatCards(); _renderCharts(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteRataAtleta = function (id) {
    var r = _rateAtleti.find(function (x) { return x.id === id; });
    if (!r) return;
    var a = _atletiRette.find(function (x) { return x.id === r.atletaRettaId; });
    confirm('Eliminare questa rata?', function () {
      db.collection('rateAtleti').doc(id).delete()
        .then(function () { return _logWrite('rataAtleti', id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _rateAtleti = _rateAtleti.filter(function (x) { return x.id !== id; });
          _renderRateAtletaModal(); _renderRette(); _renderStatCards(); _renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- SPESE ---- */
  function _categoriaSpesaById(id) { return _categorieSpesa.find(function (c) { return c.id === id; }); }

  function _categorieSpesaOptionsHtml(selectedId) {
    return '<option value="">— Nessuna —</option>' + _categorieSpesa.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
    }).join('');
  }

  /* ---- FORECASTING SPESE — preventivato vs sostenuto, per categoria ----
     Un'unica funzione di calcolo/rendering condivisa tra Spese, Bilancio e
     Dashboard: quando la sezione Budget verrà riorganizzata, questo blocco
     resta il punto unico da spostare/estendere. */
  function _calcSpeseForecast() {
    var totPreventivato = 0, totSostenuto = 0;
    var perCategoria = {};
    _vociSpesa.forEach(function (v) {
      var prev = +v.importoPreventivato || 0, sost = +v.importoSostenuto || 0;
      totPreventivato += prev; totSostenuto += sost;
      var key = v.categoriaSpesaId || '__none__';
      perCategoria[key] = perCategoria[key] || { preventivato: 0, sostenuto: 0 };
      perCategoria[key].preventivato += prev;
      perCategoria[key].sostenuto += sost;
    });
    var righe = Object.keys(perCategoria).map(function (key) {
      var c = key === '__none__' ? null : _categoriaSpesaById(key);
      var p = perCategoria[key];
      return { nome: c ? c.nome : 'Senza categoria', preventivato: p.preventivato, sostenuto: p.sostenuto, scostamento: p.sostenuto - p.preventivato };
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    var bufferPreventivato = totPreventivato * 0.1;
    return {
      totPreventivato: totPreventivato, totSostenuto: totSostenuto, scostamento: totSostenuto - totPreventivato,
      bufferPreventivato: bufferPreventivato, totPreventivatoConBuffer: totPreventivato + bufferPreventivato,
      righe: righe
    };
  }

  /* Scostamento: positivo = speso più del previsto (rosso), negativo/zero = entro il preventivo (verde) — segno opposto a un normale "saldo".
     Il preventivo + margine 10% è un margine di sicurezza consigliato, non una spesa reale: non entra nel bilancio, è solo un riferimento visivo. */
  function _speseForecastStatsHtml(r) {
    return _budgetStatCard('Preventivato', r.totPreventivato, '') +
      _budgetStatCard('Sostenuto', r.totSostenuto, '') +
      _budgetStatCard('Scostamento dal preventivo', r.scostamento, r.scostamento > 0 ? '--red' : '--green') +
      _budgetStatCard('Preventivato + margine 10%', r.totPreventivatoConBuffer, '--orange');
  }

  function _speseForecastTableHtml(r) {
    if (!r.righe.length) return '<p class="dg-muted">Nessuna voce di spesa per questa stagione.</p>';
    var rows = r.righe.map(function (x) {
      return '<tr>' +
        '<td>' + esc(x.nome) + '</td>' +
        '<td>' + _eur(x.preventivato) + '</td>' +
        '<td>' + _eur(x.sostenuto) + '</td>' +
        '<td style="color:' + (x.scostamento > 0 ? 'var(--dg-red)' : 'var(--dg-green)') + '">' + (x.scostamento > 0 ? '+' : '') + _eur(x.scostamento) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="dg-table-wrap"><table class="dg-table"><thead><tr><th>Categoria</th><th>Preventivato</th><th>Sostenuto</th><th>Scostamento</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* Riempie ogni istanza presente nel DOM (Spese e Bilancio condividono lo stesso widget). */
  function _renderSpeseForecast() {
    var r = _calcSpeseForecast();
    var statsHtml = _speseForecastStatsHtml(r);
    var tableHtml = _speseForecastTableHtml(r);
    ['speseForecastStats', 'bilancioForecastStats'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = statsHtml;
    });
    ['speseForecastTable', 'bilancioForecastTable'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = tableHtml;
    });
  }

  function _renderDashSpeseWidget() {
    var r = _calcSpeseForecast();
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var pct = r.totPreventivato > 0 ? Math.round(r.totSostenuto / r.totPreventivato * 100) : 0;

    document.getElementById('dashSpeseSeasonName').textContent = season.nome ? '· ' + season.nome : '';
    document.getElementById('dashSpeseSostenuto').textContent =
      '€' + Math.round(r.totSostenuto).toLocaleString('it-IT') + ' / €' + Math.round(r.totPreventivato).toLocaleString('it-IT');
    document.getElementById('dashSpesePct').textContent = pct + '%';
    document.getElementById('dashSpeseBarFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
    var scostEl = document.getElementById('dashSpeseScostamento');
    scostEl.textContent = (r.scostamento > 0 ? '+' : '') + '€' + Math.round(r.scostamento).toLocaleString('it-IT') + ' rispetto al preventivo';
    scostEl.className = 'dash-budget-obiettivo ' + (r.scostamento > 0 ? 'dash-budget-saldo--neg' : 'dash-budget-saldo--pos');
  }

  var _speseFilterCategoriaId = '';

  function _populateSpeseFilterCategoria() {
    var sel = document.getElementById('speseFilterCategoria');
    if (!sel) return;
    sel.innerHTML = '<option value="">Tutte le categorie</option>' +
      '<option value="__none__">Senza categoria</option>' +
      _categorieSpesa.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('');
    sel.value = _speseFilterCategoriaId;
  }

  function _renderSpese() {
    _populateSpeseFilterCategoria();
    _renderSpeseForecast();
    _renderIvaRiepilogo();
    var body = document.getElementById('speseBody');
    var items = _vociSpesa.filter(function (v) {
      if (!_speseFilterCategoriaId) return true;
      if (_speseFilterCategoriaId === '__none__') return !v.categoriaSpesaId;
      return v.categoriaSpesaId === _speseFilterCategoriaId;
    });
    /* Ogni voce IVA generata da un'altra voce di spesa viene spostata subito
       dopo la sua genitrice, così il collegamento è visibile a colpo d'occhio
       (vedi anche il connettore "↳" nella cella categoria qui sotto). */
    var byId = {};
    items.forEach(function (v) { byId[v.id] = v; });
    var isLinkedChild = {};
    items.forEach(function (p) { if (p.ivaVoceSpesaId && byId[p.ivaVoceSpesaId]) isLinkedChild[p.ivaVoceSpesaId] = true; });
    var ordered = [];
    items.forEach(function (v) {
      if (isLinkedChild[v.id]) return;
      ordered.push(v);
      if (v.ivaVoceSpesaId && byId[v.ivaVoceSpesaId]) ordered.push(byId[v.ivaVoceSpesaId]);
    });
    items = ordered;
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="8" class="dg-empty">' +
        (_vociSpesa.length ? 'Nessuna voce di spesa per questa categoria.' : 'Nessuna voce di spesa per questa stagione.') +
        '</td></tr>';
      return;
    }
    body.innerHTML = items.map(function (v) {
      var linked = v.isIva && isLinkedChild[v.id];
      return '<tr' + (v.isIva ? ' style="background:#F8FAFC"' : '') + '>' +
        '<td>' + (linked ? '<span class="dg-iva-link" title="Generata automaticamente dalla voce sopra">↳</span>' : '') +
        '<input type="text" class="dg-table-input" style="width:180px" value="' + esc(v.categoria) + '" data-id="' + v.id + '" data-field="categoria" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><select class="dg-table-input" data-id="' + v.id + '" data-field="categoriaSpesaId" onchange="DG.saveSpesaField(this)">' + _categorieSpesaOptionsHtml(v.categoriaSpesaId) + '</select></td>' +
        '<td><input type="number" class="dg-table-input" value="' + (v.importoPreventivato || 0) + '" data-id="' + v.id + '" data-field="importoPreventivato" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><input type="number" class="dg-table-input" value="' + (v.importoSostenuto || 0) + '" data-id="' + v.id + '" data-field="importoSostenuto" onchange="DG.saveSpesaField(this)"></td>' +
        '<td>' + (v.isIva ? '<span class="dg-muted" title="Le voci IVA non generano a loro volta IVA">—</span>' :
          '<input type="number" class="dg-table-input" style="width:70px" min="0" step="1" value="' + (v.ivaAliquota || '') + '" placeholder="0" data-id="' + v.id + '" data-field="ivaAliquota" onchange="DG.saveSpesaField(this)">') + '</td>' +
        '<td><input type="date" class="dg-table-input" value="' + esc(v.dataSpesa || '') + '" data-id="' + v.id + '" data-field="dataSpesa" onchange="DG.saveSpesaField(this)">' +
        (v.dataSpesa ? '<div style="font-size:11px;color:var(--dg-muted);margin-top:3px">' + esc(_fmtDateLong(v.dataSpesa)) + '</div>' : '') + '</td>' +
        '<td><input type="text" class="dg-table-input" style="width:160px" value="' + esc(v.note || '') + '" data-id="' + v.id + '" data-field="note" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteSpesa(\'' + v.id + '\')">' + _delIconSm() + '</button></td>' +
        '</tr>';
    }).join('');
  }

  DG.saveSpesaField = function (el) {
    var id = el.dataset.id, field = el.dataset.field;
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    if (field === 'categoria' && !el.value.trim()) { alert('La voce di spesa non può essere vuota.'); el.value = v.categoria; return; }
    var isText = field === 'dataSpesa' || field === 'categoriaSpesaId' || field === 'categoria' || field === 'note';
    var old = {}; old[field] = isText ? (v[field] || '') : (v[field] || 0);
    var nv = isText ? (field === 'categoria' || field === 'note' ? el.value.trim() : el.value) : (+el.value || 0);
    v[field] = nv;
    var patch = {}; patch[field] = nv;
    var fields = [field];
    /* Se è la voce IVA stessa (non la sua "genitrice") e la scadenza non è mai stata forzata a mano,
       cambiare la data ricalcola in automatico il trimestre di versamento. */
    if (v.isIva && field === 'dataSpesa' && !v.ivaScadenzaManuale) {
      var auto = _trimestreIvaDaData(nv);
      old.ivaTrimestre = v.ivaTrimestre || ''; old.ivaScadenza = v.ivaScadenza || '';
      v.ivaTrimestre = patch.ivaTrimestre = auto ? auto.trimestre : '';
      v.ivaScadenza = patch.ivaScadenza = auto ? auto.scadenza : '';
      fields.push('ivaTrimestre', 'ivaScadenza');
    }
    var needsIvaSync = field === 'importoSostenuto' || field === 'importoPreventivato' || field === 'ivaAliquota' || field === 'categoria' || field === 'dataSpesa';
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, fields)); })
      .then(function () { return needsIvaSync ? _syncSpesaIva(v) : null; })
      .then(function () { _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteSpesa = function (id) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    confirm('Eliminare la voce "' + v.categoria + '"?' + (v.ivaVoceSpesaId ? ' Verrà eliminata anche la relativa voce IVA.' : ''), function () {
      var figlia = v.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;
      var genitrice = _vociSpesa.find(function (x) { return x.ivaVoceSpesaId === id; });
      db.collection('vociSpesa').doc(id).delete()
        .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () { return genitrice ? db.collection('vociSpesa').doc(genitrice.id).update({ ivaVoceSpesaId: '' }) : null; })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== id && (!figlia || x.id !== figlia.id); });
          if (genitrice) genitrice.ivaVoceSpesaId = '';
          _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* Genera/aggiorna/rimuove la voce di spesa "IVA <nome>" figlia di una voce con IVA % impostata.
     Stesso meccanismo usato per l'IVA sulle tranche sponsor: ivaVoceSpesaId sulla voce genitrice
     punta alla voce IVA generata, per aggiornarla invece di duplicarla ad ogni modifica. */
  function _syncSpesaIva(v) {
    if (v.isIva) return Promise.resolve();
    var aliquota = +v.ivaAliquota || 0;
    var figlia = v.ivaVoceSpesaId ? _vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;

    if (aliquota <= 0) {
      if (!figlia) return Promise.resolve();
      return db.collection('vociSpesa').doc(figlia.id).delete()
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return db.collection('vociSpesa').doc(v.id).update({ ivaVoceSpesaId: '' }); })
        .then(function () {
          _vociSpesa = _vociSpesa.filter(function (x) { return x.id !== figlia.id; });
          v.ivaVoceSpesaId = '';
        });
    }

    /* Preventivato e sostenuto si proiettano entrambi sull'aliquota, così la voce IVA
       permette anche una previsione (non solo il consuntivo) — e porta con sé l'aliquota
       applicata, per distinguere a colpo d'occhio le voci all'11% (sponsor) da quelle
       al 22% (es. abbigliamento/materiali) nel Riepilogo IVA. */
    var importoIva = Math.round((+v.importoSostenuto || 0) * aliquota) / 100;
    var importoIvaPreventivato = Math.round((+v.importoPreventivato || 0) * aliquota) / 100;
    var nome = 'IVA ' + v.categoria;
    var auto = _trimestreIvaDaData(v.dataSpesa);

    if (figlia) {
      var old = { categoria: figlia.categoria, importoSostenuto: figlia.importoSostenuto, importoPreventivato: figlia.importoPreventivato, ivaAliquota: figlia.ivaAliquota, dataSpesa: figlia.dataSpesa };
      var patch = { categoria: nome, importoSostenuto: importoIva, importoPreventivato: importoIvaPreventivato, ivaAliquota: aliquota, dataSpesa: v.dataSpesa || '' };
      /* La scadenza di versamento si ricalcola solo se non è mai stata forzata a mano sulla voce IVA. */
      if (!figlia.ivaScadenzaManuale) {
        old.ivaTrimestre = figlia.ivaTrimestre || ''; old.ivaScadenza = figlia.ivaScadenza || '';
        patch.ivaTrimestre = auto ? auto.trimestre : ''; patch.ivaScadenza = auto ? auto.scadenza : '';
      }
      return db.collection('vociSpesa').doc(figlia.id).update(patch)
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + nome, 'update', _diff(old, patch, Object.keys(patch))); })
        .then(function () {
          figlia.categoria = nome; figlia.importoSostenuto = importoIva; figlia.importoPreventivato = importoIvaPreventivato; figlia.ivaAliquota = aliquota; figlia.dataSpesa = v.dataSpesa || '';
          if (patch.ivaTrimestre !== undefined) { figlia.ivaTrimestre = patch.ivaTrimestre; figlia.ivaScadenza = patch.ivaScadenza; }
        });
    }

    var data = {
      seasonId: _currentSeasonId, categoria: nome, categoriaSpesaId: v.categoriaSpesaId || '',
      importoPreventivato: importoIvaPreventivato, importoSostenuto: importoIva, ivaAliquota: aliquota, dataSpesa: v.dataSpesa || '',
      note: 'IVA ' + aliquota + '% generata automaticamente sulla voce "' + v.categoria + '"', isIva: true, pagata: false, ivaEscluso: false,
      ivaTrimestre: auto ? auto.trimestre : '', ivaScadenza: auto ? auto.scadenza : '', ivaScadenzaManuale: false
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      v.ivaVoceSpesaId = ref.id;
      return db.collection('vociSpesa').doc(v.id).update({ ivaVoceSpesaId: ref.id });
    }).then(function () {
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    });
  }

  /* ---- RIEPILOGO IVA — somma di tutte le voci IVA (sponsor + spese), per questa stagione ---- */

  /* Scadenze classiche di versamento IVA trimestrale: I trim. 16/5, II trim. 20/8, III trim. 16/11,
     IV trim. 16/3 dell'anno successivo (saldo con la dichiarazione annuale). */
  var TRIMESTRI_IVA_LABEL = { T1: 'I trimestre (gen-mar)', T2: 'II trimestre (apr-giu)', T3: 'III trimestre (lug-set)', T4: 'IV trimestre (ott-dic)' };

  function _trimestreIvaDaData(dataStr) {
    if (!dataStr) return null;
    var y = +dataStr.slice(0, 4), m = +dataStr.slice(5, 7);
    if (m <= 3) return { trimestre: 'T1', scadenza: y + '-05-16' };
    if (m <= 6) return { trimestre: 'T2', scadenza: y + '-08-20' };
    if (m <= 9) return { trimestre: 'T3', scadenza: y + '-11-16' };
    return { trimestre: 'T4', scadenza: (y + 1) + '-03-16' };
  }

  function _ivaTrimestriOptions(refYear) {
    return [
      { key: 'T1', scadenza: refYear + '-05-16' },
      { key: 'T2', scadenza: refYear + '-08-20' },
      { key: 'T3', scadenza: refYear + '-11-16' },
      { key: 'T4', scadenza: (refYear + 1) + '-03-16' }
    ];
  }

  function _calcIvaTotale() {
    var tutte = _vociSpesa.filter(function (v) { return v.isIva; })
      .slice().sort(function (a, b) { return (+b.importoSostenuto || 0) - (+a.importoSostenuto || 0); });
    var righe = tutte.filter(function (v) { return !v.ivaEscluso; });
    var esclusi = tutte.filter(function (v) { return v.ivaEscluso; });
    var totale = righe.reduce(function (s, v) { return s + (+v.importoSostenuto || 0); }, 0);
    var totalePreventivato = righe.reduce(function (s, v) { return s + (+v.importoPreventivato || 0); }, 0);
    return { righe: righe, esclusi: esclusi, totale: totale, totalePreventivato: totalePreventivato };
  }

  /* Esclude/ripristina una voce IVA dalla sola sezione "Riepilogo IVA": la voce resta salvata
     e continua ad aggiornarsi in automatico (importi, aliquota), semplicemente non compare più
     in questa lista né nei suoi totali — stesso principio del "escludi dalla tabella" già usato
     per i materiali sponsor. Non tocca Spese/Bilancio, che restano invariati. */
  DG.escludiIva = function (id) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    v.ivaEscluso = true;
    _renderIvaRiepilogo();
    db.collection('vociSpesa').doc(id).update({ ivaEscluso: true })
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', [{ campo: 'ivaEscluso', prima: false, dopo: true }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.ripristinaIva = function (id) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    v.ivaEscluso = false;
    _renderIvaRiepilogo();
    db.collection('vociSpesa').doc(id).update({ ivaEscluso: false })
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', [{ campo: 'ivaEscluso', prima: true, dopo: false }]); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.setIvaScadenza = function (sel) {
    var id = sel.dataset.id, refYear = +sel.dataset.refyear;
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var patch;
    if (!sel.value) {
      var auto = _trimestreIvaDaData(v.dataSpesa);
      patch = { ivaScadenzaManuale: false, ivaTrimestre: auto ? auto.trimestre : '', ivaScadenza: auto ? auto.scadenza : '' };
    } else {
      var opt = _ivaTrimestriOptions(refYear).find(function (o) { return o.key === sel.value; });
      patch = { ivaScadenzaManuale: true, ivaTrimestre: opt.key, ivaScadenza: opt.scadenza };
    }
    var old = { ivaScadenzaManuale: !!v.ivaScadenzaManuale, ivaTrimestre: v.ivaTrimestre || '', ivaScadenza: v.ivaScadenza || '' };
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, Object.keys(patch))); })
      .then(function () {
        v.ivaScadenzaManuale = patch.ivaScadenzaManuale; v.ivaTrimestre = patch.ivaTrimestre; v.ivaScadenza = patch.ivaScadenza;
        _renderIvaRiepilogo();
      })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  function _ivaScadenzaSelectHtml(v) {
    var refYear = v.dataSpesa ? +v.dataSpesa.slice(0, 4) : new Date().getFullYear();
    var autoLabel = 'Automatica' + (!v.ivaScadenzaManuale && v.ivaTrimestre ? ' (' + TRIMESTRI_IVA_LABEL[v.ivaTrimestre] + ')' : '');
    var opts = '<option value=""' + (!v.ivaScadenzaManuale ? ' selected' : '') + '>' + esc(autoLabel) + '</option>' +
      _ivaTrimestriOptions(refYear).map(function (o) {
        return '<option value="' + o.key + '"' + (v.ivaScadenzaManuale && v.ivaTrimestre === o.key ? ' selected' : '') + '>' +
          esc(TRIMESTRI_IVA_LABEL[o.key] + ' — scade ' + _fmtDateLong(o.scadenza)) + '</option>';
      }).join('');
    return '<select class="dg-table-input" data-id="' + v.id + '" data-refyear="' + refYear + '" onchange="DG.setIvaScadenza(this)">' + opts + '</select>';
  }

  /* Una tantum per sessione: le voci IVA create prima dell'introduzione di aliquota/preventivato
     sulla voce figlia non li avevano ancora salvati — le individua e le fa ripassare dal sync
     che già esiste (_syncSpesaIva / _syncSponsorIva), senza toccare quelle già a posto. */
  var _ivaAliquotaBackfillDone = false;
  function _backfillIvaAliquote() {
    if (_ivaAliquotaBackfillDone) return;
    _ivaAliquotaBackfillDone = true;
    var jobs = [];
    _sponsorizzazioni.forEach(function (s) {
      if (!s.ivaVoceSpesaId) return;
      var figlia = _vociSpesa.find(function (x) { return x.id === s.ivaVoceSpesaId; });
      if (figlia && !figlia.ivaAliquota) jobs.push(_syncSponsorIva(s));
    });
    _vociSpesa.forEach(function (v) {
      if (v.isIva || !v.ivaVoceSpesaId) return;
      var figlia = _vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; });
      if (figlia && !figlia.ivaAliquota) jobs.push(_syncSpesaIva(v));
    });
    if (!jobs.length) return;
    Promise.all(jobs).then(function () { _renderSpese(); _renderStatCards(); _renderBilancio(); })
      .catch(function (e) { console.error('[iva] backfill aliquota', e); });
  }

  function _renderIvaRiepilogo() {
    var statsEl = document.getElementById('ivaRiepilogoStats');
    var bodyEl = document.getElementById('ivaRiepilogoBody');
    var esclusiEl = document.getElementById('ivaRiepilogoEsclusi');
    if (!statsEl || !bodyEl) return;
    _backfillIvaAliquote();
    var d = _calcIvaTotale();
    statsEl.innerHTML = _budgetStatCard('IVA preventivata', d.totalePreventivato, '') + _budgetStatCard('IVA sostenuta', d.totale, '');
    bodyEl.innerHTML = d.righe.length ? d.righe.map(function (v) {
      return '<tr><td>' + esc(v.categoria) + '</td>' +
        '<td>' + (v.ivaAliquota ? (+v.ivaAliquota).toLocaleString('it-IT') + '%' : '—') + '</td>' +
        '<td>' + _eur(+v.importoPreventivato || 0) + '</td>' +
        '<td>' + _eur(+v.importoSostenuto || 0) + '</td>' +
        '<td>' + (v.dataSpesa ? esc(_fmtDateLong(v.dataSpesa)) : '—') + '</td>' +
        '<td>' + _ivaScadenzaSelectHtml(v) +
        (v.ivaScadenza ? '<div style="font-size:11px;color:var(--dg-muted);margin-top:3px">Scade il ' + esc(_fmtDateLong(v.ivaScadenza)) + '</div>' : '') + '</td>' +
        '<td style="text-align:center"><input type="checkbox" data-id="' + v.id + '"' + (v.pagata ? ' checked' : '') +
          ' title="Segna come versata all\'Erario — solo allora conta come uscita nel Bilancio" onchange="DG.toggleIvaPagata(this.dataset.id, this.checked)"></td>' +
        '<td><button type="button" class="dg-pezzi-row-remove" onclick="DG.escludiIva(\'' + v.id + '\')" title="Escludi dalla sezione IVA — resta salvata e continua ad aggiornarsi, la ripristini in qualsiasi momento">✕</button></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="8" class="dg-empty">Nessuna voce IVA per questa stagione.</td></tr>';
    if (esclusiEl) {
      esclusiEl.innerHTML = d.esclusi.length ? '<div class="dg-pezzi-esclusi">' +
        '<span class="dg-pezzi-esclusi-label">Escluse dal riepilogo IVA:</span>' +
        d.esclusi.map(function (v) {
          return '<span class="dg-pezzi-esclusi-chip">' + esc(v.categoria) +
            '<button type="button" class="dg-pezzi-esclusi-restore" onclick="DG.ripristinaIva(\'' + v.id + '\')" title="Rimetti nel riepilogo IVA">↺</button></span>';
        }).join('') + '</div>' : '';
    }
  }

  /* La voce IVA è "Sostenuto" (accrual, sempre conteggiata in Spese/Forecasting)
     ma diventa uscita reale nel Bilancio/flussi di cassa solo quando la si
     marca come effettivamente versata all'Erario. */
  DG.toggleIvaPagata = function (id, checked) {
    var v = _vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var old = { pagata: !!v.pagata };
    var patch = { pagata: checked };
    v.pagata = checked;
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, ['pagata'])); })
      .then(function () { _renderIvaRiepilogo(); _renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  /* ---- EXPORT PDF (bilancio + spese per categoria + singole voci), via finestra di stampa del browser ---- */
  function _pdfCss() {
    return 'body{font-family:Arial,Helvetica,sans-serif;color:#1E293B;margin:0;padding:32px}' +
      'header{border-bottom:3px solid #1E3A5F;padding-bottom:12px;margin-bottom:26px}' +
      'header h1{margin:0 0 4px;font-size:19px;color:#1E3A5F}' +
      'header p{margin:0;font-size:12px;color:#64748B}' +
      'section{margin-bottom:26px;page-break-inside:avoid}' +
      'h2{font-size:14px;color:#1E3A5F;border-bottom:1px solid #E2E8F0;padding-bottom:6px;margin:0 0 10px}' +
      'table{width:100%;border-collapse:collapse;font-size:11px}' +
      'th,td{padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:left}' +
      'th{background:#F8FAFC;font-weight:700;color:#1E3A5F}' +
      '.pdf-stat-row{display:flex;gap:10px;flex-wrap:wrap}' +
      '.pdf-stat-card{flex:1;min-width:110px;background:#F8FAFC;border-radius:8px;padding:10px 12px}' +
      '.pdf-stat-label{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.03em}' +
      '.pdf-stat-value{font-size:15px;font-weight:700;margin-top:2px}' +
      'footer{margin-top:8px;font-size:10px;color:#94A3B8;text-align:center}' +
      '@media print{body{padding:12px}}';
  }

  function _pdfStatRow(items) {
    return '<div class="pdf-stat-row">' + items.map(function (it) {
      return '<div class="pdf-stat-card"><div class="pdf-stat-label">' + esc(it[0]) + '</div><div class="pdf-stat-value">' + _eur(it[1]) + '</div></div>';
    }).join('') + '</div>';
  }

  function _pdfTableHtml(headers, rows, emptyMsg) {
    if (!rows.length) return '<p style="color:#94A3B8;font-size:12px">' + esc(emptyMsg) + '</p>';
    var thead = '<tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>';
    var tbody = rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('');
    return '<table><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
  }

  DG.exportSpesePdf = function () {
    var season = _seasons.find(function (s) { return s.id === _currentSeasonId; }) || {};
    var r = _calcRiepilogo();
    var forecast = _calcSpeseForecast();
    var bilancio = _calcBilancioMensile();
    var oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

    var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Report Spese — ' + esc(season.nome || '') + '</title>' +
      '<style>' + _pdfCss() + '</style></head><body>';

    html += '<header><h1>Victor Volley — Report Spese &amp; Bilancio</h1>' +
      '<p>Stagione: <strong>' + esc(season.nome || '—') + '</strong> &middot; Generato il ' + oggi + '</p></header>';

    html += '<section><h2>Riepilogo generale</h2>' +
      _pdfStatRow([
        ['Entrate confermate', r.entrateConfermate],
        ['Uscite', r.uscite],
        ['Saldo', r.saldo],
        ['Obiettivo', r.obiettivo],
        ['Differenza da obiettivo', r.differenza]
      ]) + '</section>';

    var entrateDett = _calcEntrateConfermateDettaglio();
    html += '<section><h2>Da chi arrivano le entrate confermate</h2>' +
      _pdfTableHtml(['Fonte', 'Nome', 'Importo'],
        entrateDett.righe.map(function (x) { return [esc(x.tipo), esc(x.nome), _eur(x.importo)]; })
          .concat(entrateDett.righe.length ? [['<strong>Totale</strong>', '', '<strong>' + _eur(entrateDett.totale) + '</strong>']] : []),
        'Nessuna entrata confermata per questa stagione.') + '</section>';

    html += '<section><h2>Bilancio mensile (entrate vs uscite realmente mosse)</h2>' +
      _pdfTableHtml(['Mese', 'Entrate', 'Uscite', 'Saldo mese', 'Saldo progressivo'],
        bilancio.righe.map(function (x) { return [esc(x.label), _eur(x.entrate), _eur(x.uscite), _eur(x.saldo), _eur(x.progressivo)]; })
          .concat(bilancio.righe.length ? [[
            '<strong>Totale</strong>', '<strong>' + _eur(bilancio.totEntrate) + '</strong>', '<strong>' + _eur(bilancio.totUscite) + '</strong>',
            '<strong>' + _eur(bilancio.totEntrate - bilancio.totUscite) + '</strong>', '—'
          ]] : []),
        'Nessuna tranche incassata o spesa datata per questa stagione.') + '</section>';

    var ivaTot = _calcIvaTotale();
    html += '<section><h2>Riepilogo IVA</h2>' +
      _pdfStatRow([['Totale IVA', ivaTot.totale]]) +
      _pdfTableHtml(['Voce', 'Importo', 'Data', 'Scadenza versamento'],
        ivaTot.righe.map(function (v) {
          var scad = v.ivaTrimestre ? (TRIMESTRI_IVA_LABEL[v.ivaTrimestre] + ' — ' + _fmtDateLong(v.ivaScadenza)) : '—';
          return [esc(v.categoria), _eur(+v.importoSostenuto || 0), v.dataSpesa ? esc(_fmtDateLong(v.dataSpesa)) : '—', esc(scad)];
        }),
        'Nessuna voce IVA per questa stagione.') + '</section>';

    html += '<section><h2>Spese per categoria — preventivato vs sostenuto</h2>' +
      _pdfTableHtml(['Categoria', 'Preventivato', 'Sostenuto', 'Scostamento'],
        forecast.righe.map(function (x) {
          return [esc(x.nome), _eur(x.preventivato), _eur(x.sostenuto),
            '<span style="color:' + (x.scostamento > 0 ? '#DC2626' : '#16A34A') + '">' + (x.scostamento > 0 ? '+' : '') + _eur(x.scostamento) + '</span>'];
        }), 'Nessuna voce di spesa per questa stagione.') + '</section>';

    html += '<section><h2>Singole voci di spesa</h2>' +
      _pdfTableHtml(['Voce', 'Categoria', 'Preventivato', 'Sostenuto', 'Data', 'Note'],
        _vociSpesa.map(function (v) {
          var cat = v.categoriaSpesaId ? _categoriaSpesaById(v.categoriaSpesaId) : null;
          return [esc(v.categoria), esc(cat ? cat.nome : '—'), _eur(v.importoPreventivato || 0), _eur(v.importoSostenuto || 0),
            v.dataSpesa ? esc(_fmtDateLong(v.dataSpesa)) : '—', esc(v.note || '')];
        }), 'Nessuna voce di spesa per questa stagione.') + '</section>';

    html += '<footer>Victor Volley — Area Dirigenti · Documento generato automaticamente</footer>';
    html += '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito e riprova.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
  };

  /* ---- CATEGORIE DI SPESA (gestione, valide per tutte le stagioni) ---- */
  function _renderCategorieSpesaModalList() {
    var list = document.getElementById('categorieSpesaModalList');
    list.innerHTML = _categorieSpesa.length ? _categorieSpesa.map(function (c) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<span>' + esc(c.nome) + '</span>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteCategoriaSpesa(\'' + c.id + '\')">' + _delIconSm() + '</button>' +
        '</div>';
    }).join('') : '<p class="dg-muted">Nessuna categoria ancora.</p>';
  }

  DG.addCategoriaSpesa = function () {
    var input = document.getElementById('categoriaSpesaNewInput');
    var nome = input.value.trim();
    if (!nome) return;
    if (_categorieSpesa.some(function (c) { return c.nome.toLowerCase() === nome.toLowerCase(); })) { alert('Categoria già esistente.'); return; }
    var data = { nome: nome, createdAt: new Date().toISOString() };
    var ref = db.collection('categorieSpesa').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _categorieSpesa.push(data);
      _categorieSpesa.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
      return _logWrite('categoriaSpesa', ref.id, 'Categoria di spesa — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      input.value = '';
      _renderCategorieSpesaModalList();
      _renderSpese();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteCategoriaSpesa = function (id) {
    var c = _categoriaSpesaById(id);
    if (!c) return;
    confirm('Eliminare la categoria "' + c.nome + '"? Le voci di spesa che la usano perderanno l\'assegnazione.', function () {
      db.collection('categorieSpesa').doc(id).delete()
        .then(function () { return _logWrite('categoriaSpesa', id, 'Categoria di spesa — ' + c.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          _categorieSpesa = _categorieSpesa.filter(function (x) { return x.id !== id; });
          _renderCategorieSpesaModalList();
          _renderSpese();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- BILANCIO — entrate (tranche sponsor pagate) vs uscite (spese sostenute), per mese ---- */
  var MESI_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  function _monthKey(dateStr) { return dateStr ? dateStr.slice(0, 7) : null; }
  function _monthLabel(key) {
    var p = key.split('-');
    return MESI_IT[(+p[1]) - 1] + ' ' + p[0];
  }
  function _eur(n) { return '€' + Math.round(n).toLocaleString('it-IT'); }

  /* Calcolo puro (nessun DOM), condiviso da _renderBilancio() e dall'export PDF. */
  function _calcBilancioMensile() {
    var curIds = _sponsorizzazioni.filter(function (s) { return s.seasonId === _currentSeasonId; }).map(function (s) { return s.id; });
    var entrateSponsor = _tranche.filter(function (t) { return t.pagato && curIds.indexOf(t.sponsorizzazioneId) !== -1; })
      .map(function (t) {
        var s = _sponsorizzazioni.find(function (x) { return x.id === t.sponsorizzazioneId; });
        var az = s ? _aziendaById(s.aziendaId) : null;
        return { scadenza: t.scadenza, importo: +t.importo || 0, tipo: 'Sponsor', nome: az ? az.ragioneSociale : '—', note: t.note || '' };
      });
    /* _atletiRette è già filtrato per la stagione corrente (vedi _loadSeasonScoped). */
    var atletiIds = _atletiRette.map(function (a) { return a.id; });
    var entrateRette = _rateAtleti.filter(function (r) { return r.pagata && atletiIds.indexOf(r.atletaRettaId) !== -1; })
      .map(function (r) {
        var a = _atletaRettaById(r.atletaRettaId);
        return { scadenza: r.scadenza, importo: +r.importo || 0, tipo: 'Retta atleti', nome: a ? (a.nome + ' ' + a.cognome) : '—', note: r.note || '' };
      });
    var entrate = entrateSponsor.concat(entrateRette);
    /* Le voci IVA sono "sostenute" ma non ancora un'uscita di cassa reale finché
       non vengono marcate come versate (v.pagata) nel Riepilogo IVA. */
    var uscite = _vociSpesa.filter(function (v) { return +v.importoSostenuto > 0 && (!v.isIva || v.pagata); });

    var months = {};
    var senzaData = 0;
    entrate.forEach(function (t) {
      var k = _monthKey(t.scadenza);
      if (!k) return;
      months[k] = months[k] || { entrate: 0, uscite: 0 };
      months[k].entrate += (+t.importo || 0);
    });
    uscite.forEach(function (v) {
      var k = _monthKey(v.dataSpesa);
      var importo = +v.importoSostenuto || 0;
      if (!k) { senzaData += importo; return; }
      months[k] = months[k] || { entrate: 0, uscite: 0 };
      months[k].uscite += importo;
    });

    var keys = Object.keys(months).sort();
    var progressivo = 0, totEntrate = 0, totUscite = 0;
    var righe = keys.map(function (k) {
      var m = months[k];
      var saldo = m.entrate - m.uscite;
      progressivo += saldo;
      totEntrate += m.entrate; totUscite += m.uscite;
      return { label: _monthLabel(k), entrate: m.entrate, uscite: m.uscite, saldo: saldo, progressivo: progressivo };
    });
    if (senzaData) {
      progressivo -= senzaData;
      totUscite += senzaData;
      righe.push({ label: 'Spese senza data', entrate: 0, uscite: senzaData, saldo: -senzaData, progressivo: progressivo });
    }

    var entrateSorted = entrate.slice().sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; });
    return { righe: righe, totEntrate: totEntrate, totUscite: totUscite, entrateList: entrateSorted };
  }

  function _renderBilancio() {
    var mesiBody = document.getElementById('bilancioMesiBody');
    var entrateBody = document.getElementById('bilancioEntrateBody');
    if (!mesiBody || !entrateBody) return;

    var b = _calcBilancioMensile();
    if (!b.righe.length) {
      mesiBody.innerHTML = '<tr><td colspan="5" class="dg-empty">Nessuna entrata incassata o spesa datata per questa stagione.</td></tr>';
    } else {
      var rows = b.righe.map(function (r) {
        return '<tr>' +
          '<td>' + esc(r.label) + '</td>' +
          '<td>' + _eur(r.entrate) + '</td>' +
          '<td>' + _eur(r.uscite) + '</td>' +
          '<td style="color:' + (r.saldo < 0 ? 'var(--dg-red)' : 'var(--dg-green)') + '">' + _eur(r.saldo) + '</td>' +
          '<td>' + _eur(r.progressivo) + '</td>' +
          '</tr>';
      });
      rows.push('<tr style="font-weight:700">' +
        '<td>Totale</td>' +
        '<td>' + _eur(b.totEntrate) + '</td>' +
        '<td>' + _eur(b.totUscite) + '</td>' +
        '<td>' + _eur(b.totEntrate - b.totUscite) + '</td>' +
        '<td>—</td>' +
        '</tr>');
      mesiBody.innerHTML = rows.join('');
    }

    entrateBody.innerHTML = b.entrateList.length ? b.entrateList.map(function (t) {
      return '<tr>' +
        '<td>' + _fmtDateLong(t.scadenza) + '</td>' +
        '<td>' + esc(t.tipo) + '</td>' +
        '<td>' + esc(t.nome) + '</td>' +
        '<td>' + _eur(t.importo) + '</td>' +
        '<td>' + esc(t.note || '') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="5" class="dg-empty">Nessuna entrata incassata per questa stagione.</td></tr>';
  }

  /* ---- LOG (sola lettura, copre tutta l'Area Dirigenti + il CMS) ---- */
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

  function _azioneLabel(a) { return { create: 'Creato', update: 'Modificato', delete: 'Eliminato' }[a] || a; }

  function _fmtCampoLabel(f) {
    if (!f || f.charAt(0) === '(') return f;
    var s = f.replace(/([A-Z])/g, ' $1');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function _fmtLogVal(v) {
    if (v === null || v === undefined || v === '') return '—';
    var s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
  }

  /* Voci scritte prima di questa modifica: l.campi era un array di soli nomi
     campo (stringhe), senza prima/dopo — restano leggibili, solo più scarne. */
  function _fmtCampoDettaglio(ch) {
    if (typeof ch === 'string') return _fmtCampoLabel(ch);
    var label = _fmtCampoLabel(ch.campo);
    if (ch.aperto) return label;
    return label + ': ' + _fmtLogVal(ch.prima) + ' → ' + _fmtLogVal(ch.dopo);
  }

  function _fmtDettagli(l) {
    if (!l.campi || !l.campi.length) return '—';
    return l.campi.map(_fmtCampoDettaglio).join(', ');
  }

  function _renderLog() {
    var entita    = document.getElementById('logFilterEntita').value;
    var dirigente = document.getElementById('logFilterDirigente').value;
    var dal       = document.getElementById('logFilterDal').value;
    var al        = document.getElementById('logFilterAl').value;

    var rows = _auditLog.filter(function (l) {
      if (entita && l.entita !== entita) return false;
      if (dirigente && l.dirigenteId !== dirigente) return false;
      var ts = _logDate(l);
      if (dal && ts && ts < new Date(dal)) return false;
      if (al && ts) { var alDate = new Date(al); alDate.setHours(23, 59, 59, 999); if (ts > alDate) return false; }
      return true;
    });

    var body = document.getElementById('logBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="dg-empty">Nessuna voce di log.</td></tr>'; return; }
    body.innerHTML = rows.map(function (l) {
      return '<tr>' +
        '<td>' + _fmtDateTime(l) + '</td>' +
        '<td>' + esc(l.dirigenteNome || '—') + '</td>' +
        '<td>' + esc(l.entitaLabel || l.entita) + '</td>' +
        '<td>' + esc(_azioneLabel(l.azione)) + '</td>' +
        '<td>' + esc(_fmtDettagli(l)) + '</td>' +
        '</tr>';
    }).join('');
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
        /* Niente log qui: l'azienda nasce come parte dell'aggiunta dello sponsor,
           che è già loggata subito sotto da createSponsorizzazione(). */
        return createSponsorizzazione(aref.id, nome);
      });
    }

    p.then(function () {
      _closeBudgetModal('newSponsorModal');
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
      _closeBudgetModal('newSeasonModal');
      _populateSeasonSelect();
      return _loadSeasonScoped();
    }).then(function () {
      _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards(); _renderCharts(); _renderCashflow(); _renderKanban(); _renderRette(); _renderSpese(); _renderBilancio();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewCategoria() {
    var nome = val('categoriaNomeInput').trim();
    if (!nome) { alert('Inserisci il nome della categoria.'); return; }
    var data = {
      seasonId: _currentSeasonId, nome: nome,
      rettaUnitaria: +val('categoriaRettaInput') || 0
    };
    var ref = db.collection('categorieAtleti').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _categorieAtleti.push(data);
      return _logWrite('categoriaAtleti', ref.id, 'Categoria — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newCategoriaModal');
      _renderRette();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  function _saveNewSpesa() {
    var categoria = val('spesaCategoriaInput').trim();
    if (!categoria) { alert('Inserisci il nome della voce di spesa.'); return; }
    var data = {
      seasonId: _currentSeasonId, categoria: categoria,
      categoriaSpesaId: val('spesaCategoriaSpesaSelect'),
      importoPreventivato: +val('spesaPreventivatoInput') || 0,
      importoSostenuto: +val('spesaSostenutoInput') || 0,
      ivaAliquota: +val('spesaIvaInput') || 0,
      dataSpesa: val('spesaDataInput'),
      note: val('spesaNoteInput').trim()
    };
    var ref = db.collection('vociSpesa').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      _vociSpesa.push(data);
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + categoria, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      return _syncSpesaIva(data);
    }).then(function () {
      _closeBudgetModal('newSpesaModal');
      _renderSpese(); _renderStatCards(); _renderCharts(); _renderBilancio();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- SELECT POPULATORS ---- */
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

  /* ---- UTILS ---- */
  function val(id) { return document.getElementById(id).value; }
  function _aziendaById(id) { return _aziende.find(function (a) { return a.id === id; }); }
  function _isStorico(aziendaId) { return _sponsorizzazioni.some(function (s) { return s.aziendaId === aziendaId && s.seasonId !== _currentSeasonId; }); }
  /* _daysDiff e _fmtDate: già definite più sopra (sezione Atleti), riusate qui */
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

  /* ---- WIRING UI (una tantum, DOM già presente a fine body) ---- */
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.budget-subtab').forEach(function (btn) {
      btn.addEventListener('click', function () { _switchBudgetTab(btn.dataset.btab); });
    });

    var dashBudgetCard = document.getElementById('dashBudgetCard');
    var _goToBudgetRiepilogo = function () { goTo('budget'); _switchBudgetTab('riepilogo'); };
    dashBudgetCard.addEventListener('click', _goToBudgetRiepilogo);
    dashBudgetCard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _goToBudgetRiepilogo(); }
    });

    var dashCashflowCard = document.getElementById('dashCashflowCard');
    dashCashflowCard.addEventListener('click', _goToBudgetRiepilogo);
    dashCashflowCard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _goToBudgetRiepilogo(); }
    });

    var dashSpeseCard = document.getElementById('dashSpeseCard');
    var _goToBudgetSpese = function () { goTo('budget'); _switchBudgetTab('spese'); };
    dashSpeseCard.addEventListener('click', _goToBudgetSpese);
    dashSpeseCard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _goToBudgetSpese(); }
    });

    document.getElementById('filterMieiSponsor').addEventListener('change', _renderKanban);

    document.getElementById('seasonSelect').addEventListener('change', function () {
      _currentSeasonId = this.value;
      _loadSeasonScoped().then(function () {
        _renderObiettivo(); _renderPromemoriaWidget(); _renderStatCards();
        _renderCharts(); _renderCashflow(); _renderKanban(); _renderRette(); _renderSpese(); _renderBilancio();
      });
    });

    document.getElementById('obiettivoSave').addEventListener('click', _saveObiettivo);

    ['logFilterEntita', 'logFilterDirigente', 'logFilterDal', 'logFilterAl'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', _renderLog);
    });

    document.getElementById('drawerCloseBtn').addEventListener('click', _closeDrawer);
    document.getElementById('drawerOverlay').addEventListener('click', _closeDrawer);

    document.getElementById('modalOverlay').addEventListener('click', function () { if (_openModalId) _closeBudgetModal(_openModalId); });

    document.getElementById('newSponsorBtn').addEventListener('click', function () {
      document.getElementById('newSponsorAziendaSelect').innerHTML = '<option value="">— Crea nuova azienda —</option>' +
        _aziende.map(function (a) { return '<option value="' + a.id + '">' + esc(a.ragioneSociale) + '</option>'; }).join('');
      document.getElementById('newAziendaFields').classList.remove('is-hidden');
      ['newAziendaNome', 'newAziendaSettore', 'newAziendaReferente', 'newAziendaTelefono', 'newAziendaEmail'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('newSponsorImporto').value = '';
      _openBudgetModal('newSponsorModal');
    });
    document.getElementById('newSponsorClose').addEventListener('click', function () { _closeBudgetModal('newSponsorModal'); });
    document.getElementById('newSponsorCancel').addEventListener('click', function () { _closeBudgetModal('newSponsorModal'); });
    document.getElementById('newSponsorAziendaSelect').addEventListener('change', function () {
      document.getElementById('newAziendaFields').classList.toggle('is-hidden', !!this.value);
    });
    document.getElementById('newSponsorSave').addEventListener('click', _saveNewSponsor);

    document.getElementById('newSeasonBtn').addEventListener('click', function () {
      ['seasonNomeInput', 'seasonInizioInput', 'seasonFineInput'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('seasonObiettivoInput').value = 0;
      _openBudgetModal('newSeasonModal');
    });
    document.getElementById('newSeasonClose').addEventListener('click', function () { _closeBudgetModal('newSeasonModal'); });
    document.getElementById('newSeasonCancel').addEventListener('click', function () { _closeBudgetModal('newSeasonModal'); });
    document.getElementById('newSeasonSave').addEventListener('click', _saveNewSeason);

    document.getElementById('newCategoriaBtn').addEventListener('click', function () {
      document.getElementById('categoriaNomeInput').value = '';
      document.getElementById('categoriaRettaInput').value = 0;
      _openBudgetModal('newCategoriaModal');
    });
    document.getElementById('newCategoriaClose').addEventListener('click', function () { _closeBudgetModal('newCategoriaModal'); });
    document.getElementById('newCategoriaCancel').addEventListener('click', function () { _closeBudgetModal('newCategoriaModal'); });
    document.getElementById('newCategoriaSave').addEventListener('click', _saveNewCategoria);

    document.getElementById('newAtletaRettaBtn').addEventListener('click', function () {
      document.getElementById('atletaRettaNomeInput').value = '';
      document.getElementById('atletaRettaCognomeInput').value = '';
      document.getElementById('atletaRettaCategoriaSelect').innerHTML = _categoriaAtletiOptionsHtml('');
      _openBudgetModal('newAtletaRettaModal');
    });
    document.getElementById('newAtletaRettaClose').addEventListener('click', function () { _closeBudgetModal('newAtletaRettaModal'); });
    document.getElementById('newAtletaRettaCancel').addEventListener('click', function () { _closeBudgetModal('newAtletaRettaModal'); });
    document.getElementById('newAtletaRettaSave').addEventListener('click', _saveNewAtletaRetta);

    document.getElementById('rateAtletaClose').addEventListener('click', function () { _closeBudgetModal('rateAtletaModal'); });
    document.getElementById('rateAtletaDone').addEventListener('click', function () { _closeBudgetModal('rateAtletaModal'); });
    document.getElementById('rataAtletaAddBtn').addEventListener('click', _addRataAtleta);

    document.getElementById('newSpesaBtn').addEventListener('click', function () {
      document.getElementById('spesaCategoriaInput').value = '';
      document.getElementById('spesaCategoriaSpesaSelect').innerHTML = _categorieSpesaOptionsHtml('');
      document.getElementById('spesaPreventivatoInput').value = 0;
      document.getElementById('spesaSostenutoInput').value = 0;
      document.getElementById('spesaIvaInput').value = '';
      document.getElementById('spesaDataInput').value = '';
      document.getElementById('spesaNoteInput').value = '';
      _openBudgetModal('newSpesaModal');
    });
    document.getElementById('newSpesaClose').addEventListener('click', function () { _closeBudgetModal('newSpesaModal'); });
    document.getElementById('newSpesaCancel').addEventListener('click', function () { _closeBudgetModal('newSpesaModal'); });
    document.getElementById('newSpesaSave').addEventListener('click', _saveNewSpesa);

    document.getElementById('manageCategorieSpesaBtn').addEventListener('click', function () {
      _renderCategorieSpesaModalList();
      document.getElementById('categoriaSpesaNewInput').value = '';
      _openBudgetModal('manageCategorieSpesaModal');
    });
    document.getElementById('categoriaSpesaAddBtn').addEventListener('click', DG.addCategoriaSpesa);
    document.getElementById('manageCategorieSpesaClose').addEventListener('click', function () { _closeBudgetModal('manageCategorieSpesaModal'); });
    document.getElementById('manageCategorieSpesaDone').addEventListener('click', function () { _closeBudgetModal('manageCategorieSpesaModal'); });

    document.getElementById('aggiungiSponsorPezziBtn').addEventListener('click', function () {
      _openAggiungiSponsorPopover(document.getElementById('aggiungiSponsorPezziBtn'));
    });

    document.getElementById('dimensioniModalBtn').addEventListener('click', function () {
      _renderDimensioniModalList();
      document.getElementById('dimensioneNewNomeInput').value = '';
      document.getElementById('dimensioneNewPrezzoInput').value = '';
      _openBudgetModal('dimensioniModal');
    });
    document.getElementById('dimensioneAddBtn').addEventListener('click', _addDimensione);
    document.getElementById('dimensioniModalClose').addEventListener('click', function () { _closeBudgetModal('dimensioniModal'); });
    document.getElementById('dimensioniModalDone').addEventListener('click', function () { _closeBudgetModal('dimensioniModal'); });

    document.getElementById('speseFilterCategoria').addEventListener('change', function () {
      _speseFilterCategoriaId = this.value;
      _renderSpese();
    });
  });

})();
