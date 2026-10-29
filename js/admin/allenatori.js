/* Victor Volley — Admin: Allenatori (accesso alla pagina /allenatore, sola lettura).
   Dipende da window.Admin; espone window.Admin.allenatori.
   Ogni allenatore è un documento allenatori/{uid} con le categorie che allena. L'account (email e password) lo
   crea il dirigente qui, come per i dirigenti. L'allenatore vede soltanto l'elenco degli atleti delle sue categorie
   (cognome, nome, data di nascita, telefono dei genitori): lo serve api/allenatore-atleti.js. */
(function () {
  'use strict';
  var A = window.Admin;
  var esc = A.esc, confirm = A.confirm, setTopbarBtn = A.setTopbarBtn;
  var _diff = A.diff, _logWrite = A.logWrite;

  var _cache = [];
  var _editingUid = null;   /* uid dell'allenatore le cui categorie si stanno cambiando; null = nuovo */

  function _byId(id) { return document.getElementById(id); }

  function _showView(view) {
    _byId('allenatoriList').classList.toggle('is-hidden', view !== 'list');
    _byId('allenatoriForm').classList.toggle('is-hidden', view !== 'form');
  }

  function render() {
    _showView('list');
    setTopbarBtn('Nuovo allenatore', function () { _openForm(null); });
    _load();
  }

  function _load() {
    _byId('allenatoriBody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--a-muted);padding:20px">Caricamento…</td></tr>';
    db.collection('allenatori').get().then(function (snap) {
      _cache = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
      _cache.sort(function (a, b) { return ((a.cognome || '') + (a.nome || '')).localeCompare((b.cognome || '') + (b.nome || ''), 'it'); });
      _renderRows();
    }).catch(function (err) {
      console.error('[Allenatori]', err);
      _byId('allenatoriBody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  function _renderRows() {
    if (!_cache.length) {
      _byId('allenatoriBody').innerHTML = '<tr><td colspan="4"><div class="empty-state"><p>Nessun allenatore con accesso.</p></div></td></tr>';
      return;
    }
    _byId('allenatoriBody').innerHTML = _cache.map(function (a) {
      var cats = (a.categorie || []).map(esc).join(', ') || '<span style="color:var(--a-muted)">Nessuna: non vede atleti</span>';
      return '<tr>' +
        '<td>' + esc(((a.nome || '') + ' ' + (a.cognome || '')).trim()) + '</td>' +
        '<td>' + esc(a.email || '') + '</td>' +
        '<td>' + cats + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          '<button class="btn-icon" onclick="AdminActions.editAllenatore(\'' + esc(a.uid) + '\')" title="Cambia le categorie">' + A.EDIT_ICON_SM + '</button> ' +
          '<button class="btn-icon btn-icon--danger" onclick="AdminActions.deleteAllenatore(\'' + esc(a.uid) + '\')" title="Revoca accesso">' + A.DEL_ICON_SM + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function _categoryBoxes(selected) {
    var names = VV.getCategories().map(function (c) { return c.name; });
    (selected || []).forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); });
    if (!names.length) return '<p class="form-hint">Non ci sono categorie: creale prima dalla sezione Squadre.</p>';
    return names.map(function (n, i) {
      return '<label style="display:flex;align-items:center;gap:8px;margin:4px 0">' +
        '<input type="checkbox" class="allenCat" id="allenCat' + i + '" value="' + esc(n) + '"' + ((selected || []).indexOf(n) !== -1 ? ' checked' : '') + '> ' + esc(n) + '</label>';
    }).join('');
  }

  function _chosenCategories() {
    return [].map.call(document.querySelectorAll('#allenatoriForm .allenCat:checked'), function (b) { return b.value; });
  }

  function _openForm(uid) {
    _editingUid = uid;
    var current = uid ? _cache.find(function (a) { return a.uid === uid; }) : null;
    _showView('form');
    _byId('topbarActions').innerHTML = '';
    ['allenatoreNome', 'allenatoreCognome', 'allenatoreEmail', 'allenatorePassword'].forEach(function (id) {
      _byId(id).value = current ? ({ allenatoreNome: current.nome, allenatoreCognome: current.cognome, allenatoreEmail: current.email }[id] || '') : '';
      /* Per un allenatore già creato si cambiano solo le categorie: nome e account non si toccano da qui. */
      _byId(id).disabled = !!current;
    });
    _byId('allenatoreAccount').classList.toggle('is-hidden', !!current);
    _byId('allenatoreCategorie').innerHTML = _categoryBoxes(current ? current.categorie : []);
    var btn = _byId('allenatoreFormSave');
    btn.textContent = current ? 'Salva le categorie' : 'Crea allenatore';
    btn.disabled = false;
  }

  window.AdminActions = window.AdminActions || {};
  window.AdminActions.editAllenatore = function (uid) { _openForm(uid); };

  window.AdminActions.deleteAllenatore = function (uid) {
    var target = _cache.find(function (a) { return a.uid === uid; });
    confirm('Revocare l\'accesso a questo allenatore? Non vedrà più nessun atleta. Le credenziali Firebase resteranno attive ma non servono a nulla.', function () {
      db.collection('allenatori').doc(uid).delete()
        .then(function () {
          return _logWrite('allenatore', uid, 'Allenatore — ' + (target ? (target.cognome || '') + ' ' + (target.nome || '') : uid), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
        })
        .then(function () { _cache = _cache.filter(function (a) { return a.uid !== uid; }); _renderRows(); })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  _byId('allenatoreFormCancel').addEventListener('click', render);

  _byId('allenatoreFormSave').addEventListener('click', function () {
    var categorie = _chosenCategories();
    var btn = this;

    /* Allenatore già creato: si cambiano solo le categorie. */
    if (_editingUid) {
      var uid = _editingUid;
      var before = _cache.find(function (a) { return a.uid === uid; }) || {};
      btn.textContent = 'Salvataggio…'; btn.disabled = true;
      db.collection('allenatori').doc(uid).update({ categorie: categorie })
        .then(function () { return _logWrite('allenatore', uid, 'Allenatore — ' + (before.cognome || '') + ' ' + (before.nome || ''), 'update', _diff(before, { categorie: categorie }, ['categorie'])); })
        .then(render)
        .catch(function (err) { alert('Errore: ' + err.message); btn.textContent = 'Salva le categorie'; btn.disabled = false; });
      return;
    }

    var nome = _byId('allenatoreNome').value.trim();
    var cognome = _byId('allenatoreCognome').value.trim();
    var email = _byId('allenatoreEmail').value.trim();
    var pwd = _byId('allenatorePassword').value;
    if (!nome || !cognome) { alert('Nome e cognome sono obbligatori.'); return; }
    if (!email || !pwd) { alert('Servono sia l\'email sia la password per il login.'); return; }
    if (pwd.length < 10) { alert('La password deve avere almeno 10 caratteri.'); return; }
    if (!categorie.length) { alert('Scegli almeno una categoria: senza, l\'allenatore non vedrebbe nessun atleta.'); return; }

    btn.textContent = 'Creazione…'; btn.disabled = true;
    /* secondary app per non disconnettere chi sta usando il pannello */
    var existing = firebase.apps.find(function (a) { return a.name === 'allenatore-creator'; });
    var secondary = existing || firebase.initializeApp(firebase.app().options, 'allenatore-creator');
    var secAuth = secondary.auth();

    secAuth.createUserWithEmailAndPassword(email, pwd)
      .then(function (cred) {
        var uid = cred.user.uid;
        return secAuth.signOut().then(function () {
          var data = { uid: uid, nome: nome, cognome: cognome, email: email, categorie: categorie, createdAt: new Date().toISOString() };
          return db.collection('allenatori').doc(uid).set(data).then(function () {
            return _logWrite('allenatore', uid, 'Allenatore — ' + cognome + ' ' + nome, 'create', _diff({}, data, ['nome', 'cognome', 'email', 'categorie']));
          });
        });
      })
      .then(render)
      .catch(function (err) {
        alert('Errore: ' + (err.code === 'auth/email-already-in-use' ? 'Email già registrata.' : err.message));
        btn.textContent = 'Crea allenatore'; btn.disabled = false;
      });
  });

  A.allenatori = { render: render };
})();
