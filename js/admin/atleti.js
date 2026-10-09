/* Victor Volley — Admin: Atleti (scheda atleta, iscrizione e rate, avvisi, presenze, allenamenti).
   Estratto da admin.js. Dipende da window.Admin; espone window.Admin.atleti. */
(function () {
  'use strict';
  var A = window.Admin;
  var esc = A.esc, cap = A.cap, confirm = A.confirm;
  var goTo = A.goTo, _diff = A.diff, _logWrite = A.logWrite;
  var showSubview = A.showSubview, setTopbarBtn = A.setTopbarBtn, EDIT_ICON_SM = A.EDIT_ICON_SM;
  var DEL_ICON_SM = A.DEL_ICON_SM, _daysDiff = A.daysDiff, _fmtDate = A.fmtDate;

  /* Stato del Budget (stagioni, rette, rate), definito in js/admin/budget/ */
  function _bs() { return A.budget.state; }

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
      /* Stessa categoria scritta con maiuscole/spazi diversi (es. dopo una rinomina): riallinea al nome ufficiale. */
      var ufficiali = {};
      VV.getCategories().forEach(function (c) { ufficiali[(c.name || '').trim().toLowerCase()] = c.name; });
      _atletiCache.forEach(function (a) {
        var ok = a.categoria && ufficiali[a.categoria.trim().toLowerCase()];
        if (ok && ok !== a.categoria) {
          a.categoria = ok;
          db.collection('atleti').doc(a.uid).update({ categoria: ok }).catch(function (e) { console.error('[Atleti] riallinea categoria', e); });
          db.collection('atletiDati').doc(a.uid).get().then(function (d) {
            if (d.exists && d.data().categoria !== undefined) return d.ref.update({ categoria: ok });
          }).catch(function () {});
        }
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

  /* Banner al posto di _avviso(): rosso per gli errori, ambra per i controlli sui campi, verde se passato 'ok'. */
  function _avviso(testo, tipo) {
    window.Admin.avviso(testo, tipo || (/^Errore|non è partita|non è stato aggiunto/.test(testo) ? 'errore' : 'avviso'));
  }

  function _atletaLabel(a) { return 'Atleta — ' + (a.cognome || '') + ' ' + (a.nome || ''); }

  /* Collega un genitore all'atleta: riusa l'account se l'email è già di un genitore. Senza password (nuovo account)
     ne mette una casuale che nessuno conosce, e risolve con invita = true: la famiglia sceglierà la sua dal link
     che riceve per email (vedi _invitaGenitore). Risolve con { uid, invita }. */
  function _linkParent(atleta, cognome, nome, email, pwd) {
    email = email.trim().toLowerCase();
    var current = _accessiOf(atleta);
    if (current.some(function (x) { return String(x.email).toLowerCase() === email; })) {
      return Promise.reject(new Error('Questa email è già collegata all\'atleta.'));
    }
    /* il browser a volte compila da solo il campo «password iniziale» con l'indirizzo email: non è una password scelta,
       va trattato come campo vuoto (altrimenti l'account nascerebbe con l'email come password e l'invito non partirebbe) */
    if (pwd && pwd.trim().toLowerCase() === email) pwd = '';
    var known = _findParentUid(email);
    var getUid, invita = false;
    if (known) {
      getUid = Promise.resolve(known);
    } else if (pwd && pwd.length < 10) {
      return Promise.reject(new Error('La password deve avere almeno 10 caratteri (oppure lasciala vuota: la famiglia la sceglie dal link via email).'));
    } else {
      if (!pwd) { pwd = window.Admin.password.genera(20); invita = true; }
      getUid = _createAuthAccount(email, pwd);
    }
    return getUid.then(function (uid) {
      var before  = current.map(function (x) { return Object.assign({}, x); });
      /* nome = «Cognome Nome» come prima (lo leggono elenchi e ricevuta); cognome e prenome separati servono ai saluti */
      var accessi = current.concat([{ uid: uid, email: email, ruolo: 'genitore', nome: [cognome, nome].filter(Boolean).join(' '),
        cognome: cognome || '', prenome: nome || '' }]);
      var upd = { accessi: accessi, accessUids: accessi.map(function (x) { return x.uid; }) };
      return db.collection('atleti').doc(atleta.uid).update(upd).then(function () {
        Object.assign(atleta, upd);
        _reconcileAccessi();
        return _logWrite('atleta', atleta.uid, _atletaLabel(atleta), 'update', _diff({ accessi: before }, upd, ['accessi']))
          .then(function () { return { uid: uid, invita: invita }; });
      });
    });
  }

  /* Manda al genitore l'email con il link (monouso, senza scadenza) per scegliere la password: funzione serverless
     /api/invia-invito, che verifica che chi chiama sia un dirigente. Risolve con l'indirizzo a cui è partita. */
  function _invitaGenitore(atleta, uid) {
    return auth.currentUser.getIdToken().then(function (token) {
      return fetch('/api/invia-invito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ atletaUid: atleta.uid, uid: uid })
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || ('Errore ' + res.status));
        return data.email;
      });
    }).then(function (email) {
      return _logWrite('atleta', atleta.uid, _atletaLabel(atleta), 'update', [{ campo: 'invito account', prima: null, dopo: 'email inviata a ' + email }])
        .then(function () { return email; });
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
      { k: 'tutore1Cognome',  l: 'Cognome',         t: 'text', sens: true, csv: 'Genitore 1 — cognome' },
      { k: 'tutore1Prenome',  l: 'Nome',            t: 'text', sens: true, csv: 'Genitore 1 — nome' },
      { k: 'tutore1Parentela', l: 'Parentela',      t: 'select', o: PARENTELE },
      { k: 'tutore1Telefono', l: 'Telefono',        t: 'tel', sens: true },
      { k: 'tutore1Email',    l: 'Email',           t: 'email', sens: true },
      { k: 'tutore1CodiceFiscale', l: 'Codice fiscale', t: 'text', upper: true, max: 16, sens: true }
    ] },
    { titolo: 'Genitore / tutore 2', campi: [
      { k: 'tutore2Cognome',  l: 'Cognome',         t: 'text', sens: true, csv: 'Genitore 2 — cognome' },
      { k: 'tutore2Prenome',  l: 'Nome',            t: 'text', sens: true, csv: 'Genitore 2 — nome' },
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
      { k: 'infoMediche', l: 'Info utili in emergenza (allergie, intolleranze…)', t: 'textarea', full: true, sens: true }
    ] }
  ];

  var ATLETA_CAMPI = [];
  ATLETA_SEZIONI.forEach(function (s) { s.campi.forEach(function (f) { ATLETA_CAMPI.push(f); }); });
  /* tutoreNNome resta salvato come «Cognome Nome» (lo leggono la ricevuta e le esportazioni): si ricalcola dai due campi */
  var ATLETA_DERIVATI = ['tutore1Nome', 'tutore2Nome'];
  /* `note` ha una tab sua (Note), salvata a parte su atletiDati: resta fuori dal log come gli altri dati riservati */
  var ATLETA_SENSIBILI = ATLETA_CAMPI.filter(function (f) { return f.sens; }).map(function (f) { return f.k; }).concat(ATLETA_DERIVATI, ['note']);

  /* «Palamà Ilaria Ilenia» → cognome «Palamà», nome «Ilaria Ilenia» (la prima parola è il cognome): serve solo per i nomi
     inseriti quando il campo era unico; chi compila può correggere. */
  function _dividiNome(s) {
    var p = String(s || '').trim().split(/\s+/).filter(Boolean);
    return { cognome: p[0] || '', prenome: p.slice(1).join(' ') };
  }
  function _valoreScheda(a, k) {
    var m = /^(tutore[12])(Cognome|Prenome)$/.exec(k);
    if (m && a[k] == null && a[m[1] + 'Nome']) {
      var d = _dividiNome(a[m[1] + 'Nome']);
      return m[2] === 'Cognome' ? d.cognome : d.prenome;
    }
    return a[k];
  }

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
        s.campi.map(function (f) { return _campoHtml(f, _valoreScheda(a, f.k)); }).join('');
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
    ATLETA_DERIVATI.forEach(function (k) {
      var t = k.slice(0, 7);
      vals[k] = [vals[t + 'Cognome'], vals[t + 'Prenome']].filter(Boolean).join(' ');
    });
    ATLETA_CAMPI.forEach(function (f) { (f.pub ? pub : riservati)[f.k] = vals[f.k]; });
    ATLETA_DERIVATI.forEach(function (k) { riservati[k] = vals[k]; });

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
  /* Categorie chiuse nella vista «Tutte» (si ricordano tra una visita e l'altra). */
  var _atletiChiuse = (function () {
    try { var v = JSON.parse(localStorage.getItem('vv_atleti_chiuse') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  })();
  function _salvaAtletiChiuse() {
    try { localStorage.setItem('vv_atleti_chiuse', JSON.stringify(_atletiChiuse)); } catch (e) { /* senza storage resta valido finché la pagina è aperta */ }
  }

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

  /* Pulsante «Comprimi/Espandi tutte»: solo nella vista «Tutte», senza ricerca. */
  function _aggiornaToggleTutte(gruppiVisibili) {
    var b = document.getElementById('atletiToggleAll');
    if (!b) return;
    var mostra = !_atletiCat && !(_atletiQuery || '').trim() && gruppiVisibili.length > 0;
    b.style.display = mostra ? '' : 'none';
    if (!mostra) return;
    var tuttiChiusi = gruppiVisibili.every(function (c) { return _atletiChiuse.indexOf(c) !== -1; });
    b.textContent = tuttiChiusi ? 'Espandi tutte' : 'Comprimi tutte';
    b.dataset.azione = tuttiChiusi ? 'apri' : 'chiudi';
    b.dataset.gruppi = JSON.stringify(gruppiVisibili);
  }

  /* ---- Vista «Taglie»: una colonna per ogni voce di abbigliamento del Budget (Materiali sponsor →
     colonne della stagione corrente), una riga per atleta. La taglia sta su atletiDati.taglie
     { voce: taglia }; gli atleti nuovi compaiono da soli perché la vista legge la stessa lista. ---- */
  var _atletiVista = 'elenco';

  function _stagioneBudget() {
    return _bs().seasons.find(function (x) { return x.id === _bs().currentSeasonId; }) || null;
  }

  /* Tutte le voci della stagione corrente (colonne di Materiali sponsor). */
  function _vociTutte() {
    var s = _stagioneBudget();
    return s && Array.isArray(s.pezziSponsor) ? s.pezziSponsor.slice() : [];
  }

  /* Voci che non servono in questa vista (gadget, striscioni…): si scelgono dai pulsanti sopra la tabella. */
  function _vociNascoste() {
    var s = _stagioneBudget();
    return s && Array.isArray(s.taglieNascoste) ? s.taglieNascoste : [];
  }

  function _vociAbbigliamento() {
    var nascoste = _vociNascoste();
    return _vociTutte().filter(function (v) { return nascoste.indexOf(v) === -1; });
  }

  function _vociChipsHtml() {
    var nascoste = _vociNascoste();
    return '<div class="taglie-voci" role="group" aria-label="Voci mostrate">' +
      '<span class="taglie-voci-lbl">Voci mostrate</span>' +
      _vociTutte().map(function (v) {
        var off = nascoste.indexOf(v) !== -1;
        return '<button type="button" class="taglie-voce-chip' + (off ? ' is-off' : '') + '" data-voce="' + esc(v) + '" aria-pressed="' + (off ? 'false' : 'true') + '" title="' +
          (off ? 'Nascosta: clicca per mostrarla' : 'Mostrata: clicca per nasconderla') + '">' + esc(v) + '</button>';
      }).join('') + '</div>';
  }

  /* Zaino e borsone non hanno taglia: per queste voci la cella è solo Sì / No. */
  var VOCI_SI_NO = /\b(zain[oi]|borson[ei])\b/i;
  function _isSiNo(voce) { return VOCI_SI_NO.test(String(voce)); }
  /* TAGLIE_ATLETA è fatta di coppie [valore, etichetta] per il modulo scheda: qui servono i soli valori */
  var TAGLIE_VALORI = TAGLIE_ATLETA.map(function (c) { return c[0]; });
  function _scalaVoce(voce) { return _isSiNo(voce) ? ['', 'Sì', 'No'] : TAGLIE_VALORI; }

  function _tagliaOf(a, voce) {
    var t = a.taglie && a.taglie[voce] ? String(a.taglie[voce]).trim() : '';
    /* valori salvati per errore dal menu come «M,M»: si leggono come «M» */
    var m = /^(.+),\1$/.exec(t);
    return m ? m[1] : t;
  }

  /* Voci non previste per una categoria (es. il giubbotto solo alle categorie maggiori):
     stagione.taglieEscluse = { categoria: [voce, …] }. Nella tabella la cella diventa «n/d» e non conta nel riepilogo. */
  function _esclusa(categoria, voce) {
    var s = _stagioneBudget();
    var m = s && s.taglieEscluse && categoria ? s.taglieEscluse[categoria] : null;
    return !!(m && m.indexOf(voce) !== -1);
  }

  function _riepilogoTaglie(list, voci) {
    return '<div class="taglie-riepilogo">' + voci.map(function (v) {
      var n = {}, senza = 0;
      list.forEach(function (a) {
        if (_esclusa(a.categoria, v)) return;
        var t = _tagliaOf(a, v); if (t) n[t] = (n[t] || 0) + 1; else senza++;
      });
      var ordine = _scalaVoce(v).filter(function (t) { return t && n[t]; });
      Object.keys(n).forEach(function (t) { if (ordine.indexOf(t) === -1) ordine.push(t); });
      return '<div class="taglie-riepilogo-voce"><strong>' + esc(v) + '</strong>' +
        (ordine.length ? ordine.map(function (t) { return '<span class="taglie-chip">' + esc(t) + ' <b>' + n[t] + '</b></span>'; }).join('') : '<span class="taglie-vuoto">nessuna taglia</span>') +
        (senza ? '<span class="taglie-chip taglie-chip--senza">da indicare <b>' + senza + '</b></span>' : '') + '</div>';
    }).join('') + '</div>';
  }

  /* Matrice «Voci per categoria»: una spunta per ogni categoria e voce. */
  var _taglieEsclAperto = false;
  function _matriceEsclusioniHtml(voci) {
    var cats = _categorieElenco().filter(function (c) { return _atletiCache.some(function (a) { return a.categoria === c; }); });
    if (!cats.length) return '';
    return '<details class="taglie-escl" id="taglieEscl"' + (_taglieEsclAperto ? ' open' : '') + '><summary>Voci per categoria</summary>' +
      '<p class="taglie-escl-hint">Togli la spunta dove una categoria non riceve quel capo: nella tabella diventa «n/d» e non entra nel riepilogo. Trascina le intestazioni per cambiare l’ordine delle colonne.</p>' +
      '<div class="admin-table-wrap"><table class="admin-table tab-scroll taglie-escl-table"><thead><tr><th>Categoria</th>' +
      voci.map(function (v) { return '<th class="taglie-th" draggable="true" data-voce="' + esc(v) + '" title="Trascina per spostare la colonna">' + esc(v) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      cats.map(function (c) {
        return '<tr><td><div class="table-title">' + esc(c) + '</div></td>' + voci.map(function (v) {
          return '<td><input type="checkbox" class="taglie-escl-cb" data-cat="' + esc(c) + '" data-voce="' + esc(v) + '"' + (_esclusa(c, v) ? '' : ' checked') +
            ' aria-label="' + esc(c + ' riceve ' + v) + '"></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></details>';
  }

  function _rigaTaglieHtml(a, voci) {
    return '<tr><td><div class="table-title">' + esc(a.cognome) + ' ' + esc(a.nome) + '</div></td>' +
      voci.map(function (v) {
        if (_esclusa(a.categoria, v)) return '<td class="taglia-na" title="Voce non prevista per questa categoria">n/d</td>';
        var cur = _tagliaOf(a, v);
        var opts = _scalaVoce(v).slice();
        if (cur && opts.indexOf(cur) === -1) opts.push(cur);
        return '<td><select class="form-input taglia-sel" data-uid="' + esc(a.uid) + '" data-voce="' + esc(v) + '" aria-label="' + esc(v + ' — ' + a.cognome + ' ' + a.nome) + '">' +
          opts.map(function (t) { return '<option value="' + esc(t) + '"' + (t === cur ? ' selected' : '') + '>' + (t ? esc(t) : '—') + '</option>'; }).join('') + '</select></td>';
      }).join('') + '</tr>';
  }

  function _daIndicare(membri, voci) {
    var n = 0;
    membri.forEach(function (a) { voci.forEach(function (v) { if (!_esclusa(a.categoria, v) && !_tagliaOf(a, v)) n++; }); });
    return n;
  }

  function _renderTaglie() {
    var box = document.getElementById('atletiTaglie');
    var voci = _vociAbbigliamento();
    var tutte = _vociTutte();
    var chips = tutte.length ? _vociChipsHtml() : '';
    var list = _atletiFiltrati();
    document.getElementById('atletiSummary').textContent = list.length + (list.length === 1 ? ' atleta' : ' atleti') +
      (voci.length ? ' · ' + voci.length + (voci.length === 1 ? ' voce' : ' voci') + ' di abbigliamento' : '');
    if (!tutte.length) {
      box.innerHTML = '<div class="empty-state"><p>Nessuna voce di abbigliamento per la stagione ' + esc(_stagioneCorrenteNome() || 'corrente') +
        '. Le voci sono le colonne di Budget → Materiali sponsor: aggiungile lì e compariranno qui.</p></div>';
      return;
    }
    if (!voci.length) {
      box.innerHTML = chips + '<div class="empty-state"><p>Tutte le voci sono nascoste: riattiva quelle che ti servono con i pulsanti qui sopra.</p></div>';
      return;
    }
    if (!list.length) { box.innerHTML = chips + '<div class="empty-state"><p>Nessun atleta corrisponde ai filtri.</p></div>'; return; }

    /* Colonne per categoria: una voce tolta dalla matrice «Voci per categoria» non compare per quella categoria. */
    function vociDi(cat) { return voci.filter(function (v) { return cat === '__none__' || !_esclusa(cat, v); }); }
    function intest(vc, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>Atleta</th>' + vc.map(function (v) { return '<th>' + esc(v) + '</th>'; }).join('') + '</tr>'; }
    var tabelle;
    if (_atletiCat) {
      var vc1 = vociDi(_atletiCat);
      tabelle = '<div class="admin-table-wrap"><table class="admin-table tab-scroll taglie-table"><thead>' + intest(vc1) + '</thead><tbody>' +
        list.map(function (a) { return _rigaTaglieHtml(a, vc1); }).join('') + '</tbody></table></div>';
    } else {
      /* «Tutte»: una sezione per categoria che si apre e si chiude, ognuna con le sue colonne. */
      var q = (_atletiQuery || '').trim();
      var gruppi = _categorieElenco().concat(['__none__']);
      _aggiornaToggleTutte(gruppi.filter(function (cat) {
        return list.some(function (a) { return cat === '__none__' ? !a.categoria : a.categoria === cat; });
      }));
      tabelle = gruppi.map(function (cat) {
        var membri = list.filter(function (a) { return cat === '__none__' ? !a.categoria : a.categoria === cat; });
        if (!membri.length) return '';
        var vc = vociDi(cat);
        var chiuso = !q && _atletiChiuse.indexOf(cat) !== -1;
        var mancano = _daIndicare(membri, vc);
        return '<div class="admin-table-wrap taglie-gruppo"><table class="admin-table tab-scroll taglie-table"><tbody>' +
          '<tr class="atleti-group' + (chiuso ? ' is-closed' : '') + '" data-cat="' + esc(cat) + '" tabindex="0" role="button" aria-expanded="' + (chiuso ? 'false' : 'true') + '">' +
          '<td colspan="' + (vc.length + 1) + '"><span class="atleti-group-chev" aria-hidden="true"></span><strong>' + esc(cat === '__none__' ? 'Senza categoria' : cat) + '</strong>' +
          '<span>' + membri.length + (membri.length === 1 ? ' atleta' : ' atleti') + (mancano ? ' · ' + mancano + ' da indicare' : ' · tutto indicato') + '</span></td></tr>' +
          (chiuso ? '' : intest(vc, 'taglie-head-row') + membri.map(function (a) { return _rigaTaglieHtml(a, vc); }).join('')) +
          '</tbody></table></div>';
      }).join('');
    }
    box.innerHTML = chips + _matriceEsclusioniHtml(voci) + '<div id="taglieRiepilogo">' + _riepilogoTaglie(list, voci) + '</div>' + tabelle;
  }

  function _applicaVistaAtleti() {
    var taglie = _atletiVista === 'taglie';
    document.getElementById('atletiElencoWrap').classList.toggle('is-hidden', taglie);
    document.getElementById('atletiTaglie').classList.toggle('is-hidden', !taglie);
    Array.prototype.forEach.call(document.querySelectorAll('#atletiVista .atleti-pill'), function (b) {
      b.classList.toggle('is-active', b.dataset.vista === _atletiVista);
    });
    document.getElementById('atletiExport').title = taglie ? 'Scarica le taglie mostrate in CSV' : "Scarica l'elenco mostrato in CSV";
    _renderAtletiRows();
  }

  function _renderAtletiRows() {
    var body = document.getElementById('atletiBody');
    _renderAtletiCats();
    _aggiornaToggleTutte([]);
    if (_atletiVista === 'taglie') { _renderTaglie(); return; }
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
    var q = (_atletiQuery || '').trim();
    var gruppi = _categorieElenco().concat(['__none__']);
    _aggiornaToggleTutte(gruppi.filter(function (cat) {
      return list.some(function (a) { return cat === '__none__' ? !a.categoria : a.categoria === cat; });
    }));
    body.innerHTML = gruppi.map(function (cat) {
      var membri = list.filter(function (a) { return cat === '__none__' ? !a.categoria : a.categoria === cat; });
      if (!membri.length) return '';
      /* Con una ricerca in corso i gruppi restano aperti, così i risultati si vedono. */
      var chiuso = !q && _atletiChiuse.indexOf(cat) !== -1;
      return '<tr class="atleti-group' + (chiuso ? ' is-closed' : '') + '" data-cat="' + esc(cat) + '" tabindex="0" role="button" aria-expanded="' + (chiuso ? 'false' : 'true') + '">' +
        '<td colspan="6"><span class="atleti-group-chev" aria-hidden="true"></span><strong>' + esc(cat === '__none__' ? 'Senza categoria' : cat) + '</strong>' +
        '<span>' + esc(_atletiAvvisi(membri)) + '</span></td></tr>' + (chiuso ? '' : membri.map(_atletaRowHtml).join(''));
    }).join('');
  }

  function _toggleGruppoAtleti(tr) {
    var cat = tr.dataset.cat, i = _atletiChiuse.indexOf(cat);
    if (i === -1) _atletiChiuse.push(cat); else _atletiChiuse.splice(i, 1);
    _salvaAtletiChiuse();
    _renderAtletiRows();
    var again = document.querySelector('tr.atleti-group[data-cat="' + (window.CSS && CSS.escape ? CSS.escape(cat) : cat) + '"]');
    if (again) again.focus();
  }
  document.getElementById('atletiVista').addEventListener('click', function (e) {
    var b = e.target.closest('.atleti-pill');
    if (!b || b.dataset.vista === _atletiVista) return;
    _atletiVista = b.dataset.vista;
    _applicaVistaAtleti();
  });

  document.getElementById('atletiTaglie').addEventListener('click', function (e) {
    var gr = e.target.closest('tr.atleti-group');
    if (gr) { _toggleGruppoAtleti(gr); return; }
    var chip = e.target.closest('.taglie-voce-chip');
    if (!chip) return;
    var s = _stagioneBudget();
    if (!s) return;
    var voce = chip.dataset.voce;
    var prima = _vociNascoste().slice();
    var dopo = prima.indexOf(voce) === -1 ? prima.concat([voce]) : prima.filter(function (v) { return v !== voce; });
    s.taglieNascoste = dopo;
    _renderTaglie();
    db.collection('budgetSeasons').doc(s.id).update({ taglieNascoste: dopo }).catch(function (err) {
      s.taglieNascoste = prima;
      _renderTaglie();
      _avviso('Impossibile salvare la scelta: ' + err.message);
    });
  });

  /* Trascina le intestazioni della matrice «Voci per categoria» per cambiare l'ordine delle colonne (anche nella tabella sotto). L'ordine è quello di pezziSponsor
     (stesse voci di Budget → Materiali sponsor, che seguono lo stesso ordine); i dati stanno sotto il nome, non la posizione. */
  var _trascinaVoce = null;
  function _taglieThDa(e) { return e.target && e.target.closest ? e.target.closest('th.taglie-th') : null; }
  function _taglieClearDrag() {
    Array.prototype.forEach.call(document.querySelectorAll('#atletiTaglie .is-dragging, #atletiTaglie .is-drag-over'), function (el) {
      el.classList.remove('is-dragging', 'is-drag-over');
    });
  }
  var _boxTaglie = document.getElementById('atletiTaglie');
  _boxTaglie.addEventListener('dragstart', function (e) {
    var th = _taglieThDa(e);
    if (!th) return;
    _trascinaVoce = th.dataset.voce;
    th.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', _trascinaVoce); } catch (_) {}
  });
  _boxTaglie.addEventListener('dragover', function (e) {
    var th = _taglieThDa(e);
    if (!th || _trascinaVoce == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    Array.prototype.forEach.call(document.querySelectorAll('#atletiTaglie .is-drag-over'), function (el) { el.classList.remove('is-drag-over'); });
    if (th.dataset.voce !== _trascinaVoce) th.classList.add('is-drag-over');
  });
  _boxTaglie.addEventListener('dragend', function () { _trascinaVoce = null; _taglieClearDrag(); });
  _boxTaglie.addEventListener('drop', function (e) {
    var th = _taglieThDa(e);
    if (!th || _trascinaVoce == null) return;
    e.preventDefault();
    var da = _trascinaVoce, a = th.dataset.voce;
    _trascinaVoce = null; _taglieClearDrag();
    if (da === a) return;
    var st = _stagioneBudget();
    if (!st || !Array.isArray(st.pezziSponsor)) return;
    var prima = st.pezziSponsor.slice(), dopo = prima.filter(function (v) { return v !== da; });
    var pos = dopo.indexOf(a);
    if (prima.indexOf(da) === -1 || pos === -1) return;
    dopo.splice(pos, 0, da);
    st.pezziSponsor = dopo;
    _renderTaglie();
    db.collection('budgetSeasons').doc(st.id).update({ pezziSponsor: dopo }).catch(function (err) {
      st.pezziSponsor = prima;
      _renderTaglie();
      _avviso("Impossibile salvare l'ordine delle colonne: " + err.message);
    });
  });

  document.getElementById('atletiTaglie').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var gr = e.target.closest('tr.atleti-group');
    if (gr) { e.preventDefault(); _toggleGruppoAtleti(gr); }
  });
  /* «toggle» non risale: lo si ascolta in cattura per ricordare se la matrice è aperta. */
  document.getElementById('atletiTaglie').addEventListener('toggle', function (e) {
    if (e.target && e.target.id === 'taglieEscl') _taglieEsclAperto = e.target.open;
  }, true);

  document.getElementById('atletiTaglie').addEventListener('change', function (e) {
    var cb = e.target.closest('.taglie-escl-cb');
    if (cb) {
      var st = _stagioneBudget();
      if (!st) return;
      var cat = cb.dataset.cat, voce = cb.dataset.voce;
      var prima = st.taglieEscluse || {};
      var dopo = {};
      Object.keys(prima).forEach(function (k) { dopo[k] = prima[k].slice(); });
      var arr = dopo[cat] || [];
      if (cb.checked) arr = arr.filter(function (v) { return v !== voce; });
      else if (arr.indexOf(voce) === -1) arr.push(voce);
      if (arr.length) dopo[cat] = arr; else delete dopo[cat];
      st.taglieEscluse = dopo;
      _renderTaglie();
      db.collection('budgetSeasons').doc(st.id).update({ taglieEscluse: dopo }).catch(function (err) {
        st.taglieEscluse = prima;
        _renderTaglie();
        _avviso('Impossibile salvare la scelta: ' + err.message);
      });
      return;
    }
    var sel = e.target.closest('.taglia-sel');
    if (!sel) return;
    var a = _atletiCache.find(function (x) { return x.uid === sel.dataset.uid; });
    if (!a) return;
    var voce = sel.dataset.voce, prima = _tagliaOf(a, voce), dopo = sel.value;
    var patch = { taglie: {} };
    patch.taglie[voce] = dopo;
    sel.disabled = true;
    db.collection('atletiDati').doc(a.uid).set(patch, { merge: true }).then(function () {
      a.taglie = Object.assign({}, a.taglie || {});
      a.taglie[voce] = dopo;
      var riep = document.getElementById('taglieRiepilogo');
      if (riep) riep.innerHTML = _riepilogoTaglie(_atletiFiltrati(), _vociAbbigliamento());
      return _logWrite('atleta', a.uid, _atletaLabel(a), 'update', [{ campo: 'Taglia — ' + voce, prima: prima || null, dopo: dopo || null }]);
    }).catch(function (err) {
      sel.value = prima;
      _avviso('Taglia non salvata: ' + err.message);
    }).then(function () { sel.disabled = false; });
  });

  document.getElementById('atletiToggleAll').addEventListener('click', function () {
    var gruppi = JSON.parse(this.dataset.gruppi || '[]');
    if (this.dataset.azione === 'apri') _atletiChiuse = _atletiChiuse.filter(function (c) { return gruppi.indexOf(c) === -1; });
    else gruppi.forEach(function (c) { if (_atletiChiuse.indexOf(c) === -1) _atletiChiuse.push(c); });
    _salvaAtletiChiuse();
    _renderAtletiRows();
  });
  document.getElementById('atletiBody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr.atleti-group');
    if (tr) _toggleGruppoAtleti(tr);
  });
  document.getElementById('atletiBody').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tr = e.target.closest('tr.atleti-group');
    if (tr) { e.preventDefault(); _toggleGruppoAtleti(tr); }
  });

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

  /* ---- Esporta l'elenco filtrato: CSV, Excel (.xls) e PDF ---- */
  function _csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function _slugExport() {
    return (_atletiCat && _atletiCat !== '__none__' ? _atletiCat : 'tutti').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function _scarica(contenuto, mime, nome) {
    var blob = new Blob([contenuto], { type: mime });
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = nome;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* Dati da esportare nella vista corrente: { titolo, base, head[], righe[][], sensibile } oppure null */
  function _datiExport() {
    var list = _atletiFiltrati();
    var slug = _slugExport(), cat = _atletiCat && _atletiCat !== '__none__' ? _atletiCat : 'Tutte le categorie';
    if (_atletiVista === 'taglie') {
      var voci = _vociAbbigliamento();
      if (!voci.length || !list.length) { _avviso('Nessuna taglia da esportare.'); return null; }
      return {
        titolo: 'Taglie — ' + cat, base: 'taglie-' + slug, sensibile: false,
        head: ['Cognome', 'Nome', 'Categoria'].concat(voci),
        righe: list.map(function (a) {
          return [a.cognome, a.nome, a.categoria || ''].concat(voci.map(function (v) { return _esclusa(a.categoria, v) ? 'n/d' : _tagliaOf(a, v); }));
        })
      };
    }
    if (!list.length) { _avviso('Nessun atleta da esportare.'); return null; }
    var cols = [{ k: 'cognome', l: 'Cognome' }, { k: 'nome', l: 'Nome' }];
    ATLETA_CAMPI.forEach(function (f) {
      if (['nome', 'cognome', 'note', 'infoMediche'].indexOf(f.k) === -1) cols.push({ k: f.k, l: f.csv || f.l.replace(' *', '') });
    });
    cols.push({ k: 'tutore1Nome', l: 'Genitore 1 — cognome e nome' }, { k: 'tutore2Nome', l: 'Genitore 2 — cognome e nome' });
    cols.push({ k: 'certMedicoScadenza', l: 'Scadenza certificato medico' });
    return {
      titolo: 'Atleti — ' + cat, base: 'atleti-' + slug, sensibile: true,
      head: cols.map(function (c) { return c.l; }),
      righe: list.map(function (a) { return cols.map(function (c) { return a[c.k] == null ? '' : a[c.k]; }); })
    };
  }

  function _htmlTabella(d, thStyle, tdStyle) {
    return '<table border="1"><thead><tr>' + d.head.map(function (h) { return '<th' + thStyle + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      d.righe.map(function (r) { return '<tr>' + r.map(function (c) { return '<td' + tdStyle + '>' + esc(String(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  function _esporta(formato) {
    var d = _datiExport();
    if (!d) return;
    var run = function () {
      var nome = d.base + '-' + new Date().toISOString().slice(0, 10);
      if (formato === 'csv') {
        var righe = [d.head.map(_csvCell).join(';')].concat(d.righe.map(function (r) { return r.map(_csvCell).join(';'); }));
        _scarica('﻿' + righe.join('\r\n'), 'text/csv;charset=utf-8', nome + '.csv');
      } else if (formato === 'xls') {
        /* Tabella HTML con intestazione Excel: si apre direttamente in Excel; celle come testo (CF e telefoni restano interi) */
        var foglio = d.titolo.replace(/[\\\/?*\[\]:]/g, '').slice(0, 31);
        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8">' +
          '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>' + esc(foglio) + '</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>' +
          _htmlTabella(d, ' style="background:#e6e6e6"', ' style="mso-number-format:\'@\'"') + '</body></html>';
        _scarica('﻿' + html, 'application/vnd.ms-excel;charset=utf-8', nome + '.xls');
      } else {
        var w = window.open('', '_blank');
        if (!w) { _avviso('Il browser ha bloccato la finestra: consenti i popup e riprova.'); return; }
        var wide = d.head.length > 8;
        var doc = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>' + esc(d.titolo) + ' — Victor Volley</title><style>' +
          '@page{size:A4 ' + (wide ? 'landscape' : 'portrait') + ';margin:12mm}' +
          'body{font-family:Arial,sans-serif;color:#111;margin:0}h1{font-size:16px;margin:0 0 2px}p{margin:0 0 10px;font-size:11px;color:#555}' +
          'table{width:100%;border-collapse:collapse;font-size:' + (wide ? '7' : '10') + 'px}' +
          'th,td{border:1px solid #bbb;padding:3px 4px;text-align:left;vertical-align:top;word-break:break-word}' +
          'th{background:#eee}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>' +
          '<h1>' + esc(d.titolo) + '</h1><p>Victor Volley — ' + d.righe.length + ' righe — ' + new Date().toLocaleDateString('it-IT') + '</p>' +
          _htmlTabella(d, '', '') + '</body></html>';
        w.document.open(); w.document.write(doc); w.document.close();
        setTimeout(function () { w.focus(); w.print(); }, 300);
      }
    };
    if (d.sensibile) confirm('Il file contiene dati personali di minori (codice fiscale, indirizzo, telefoni). Conservalo in un posto sicuro e cancellalo quando non serve più. Procedere?', run);
    else run();
  }
  document.getElementById('atletiExport').addEventListener('click', function () { _esporta('csv'); });
  document.getElementById('atletiExportXls').addEventListener('click', function () { _esporta('xls'); });
  document.getElementById('atletiExportPdf').addEventListener('click', function () { _esporta('pdf'); });

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

  /* Rata pagata: se ha già una ricevuta valida ne mostra il numero (apre il documento), altrimenti propone di emetterla. */
  function _ricevutaBtn(r) {
    var ric = A.ricevute.forRata(r.id);
    return ric
      ? '<button class="btn-ghost" style="font-size:12px;padding:5px 10px" title="Apri la ricevuta" onclick="AdminActions.apriRicevuta(\'' + esc(ric.id) + '\')">Ricevuta ' + esc(ric.numero) + ' · PDF</button>'
      : '<button class="btn-ghost" style="font-size:12px;padding:5px 10px" onclick="AdminActions.emettiRicevutaRata(\'' + esc(r.id) + '\')">Genera ricevuta</button>';
  }
  window.AdminActions.apriRicevuta = function (ricId) { A.ricevute.openDoc(ricId); };
  window.AdminActions.emettiRicevutaRata = function (rataId) {
    if (_editingAtleta) A.ricevute.openEmit({ atletaId: _editingAtleta.uid, rataId: rataId });
  };

  /* ---- Tab "Rate & Quote" della scheda ---- */
  function _renderRateAdmin() {
    var el = document.getElementById('rateAdminList');
    var a  = _editingAtleta;
    var rate = a ? _rateOfAtleta(a.uid).slice().sort(function (x, y) {
      return (x.scadenza || '9999-12-31').localeCompare(y.scadenza || '9999-12-31');
    }) : [];

    /* le ricevute si caricano una volta sola; a caricamento finito la lista si ridisegna */
    if (a && A.ricevute && !A.ricevute.isLoaded()) A.ricevute.ensureLoaded(_renderRateAdmin);
    var ricOk = !!(A.ricevute && A.ricevute.isLoaded());

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
          (r.pagata && ricOk ? _ricevutaBtn(r) : '') +
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
    if (!desc)    { _avviso('Inserisci una descrizione.'); return; }
    if (!importo) { _avviso('Inserisci un importo.'); return; }

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
    }).catch(function (e) { _avviso('Errore: ' + e.message); })
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
      }).catch(function (e) { _avviso('Errore: ' + e.message); });
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
      if (!daIscrivere.length) { _avviso('Tutti gli atleti con una categoria sono già iscritti a questa stagione.'); return; }

      confirm('Iscrivere ' + daIscrivere.length + (daIscrivere.length === 1 ? ' atleta' : ' atleti') + ' alla stagione ' +
              (_stagioneCorrenteNome() || 'corrente') + '? Le categorie mancanti verranno create con retta 0.', function () {
        daIscrivere.reduce(function (chain, a) {
          return chain.then(function () { return _ensureIscrizione(a, true); });
        }, Promise.resolve()).then(_refreshBudgetViews)
          .catch(function (e) { _avviso('Errore: ' + e.message); });
      });
    }).catch(function (e) { _avviso('Errore: ' + e.message); })
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
     'genitoreCognome', 'genitoreNome', 'genitoreEmail', 'genitorePassword'].forEach(function (id) {
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
    if (pwd.trim().toLowerCase() === email) pwd = '';   /* campo compilato dal browser con l'email: vale come vuoto */
    var gCognome = document.getElementById('genitoreCognome').value.trim();
    var gNome   = document.getElementById('genitoreNome').value.trim();
    var gEmail  = document.getElementById('genitoreEmail').value.trim().toLowerCase();
    var gPwd    = document.getElementById('genitorePassword').value;
    var categ   = document.getElementById('atletaCategoria').value;
    var certSc  = document.getElementById('atletaCertScadenza').value;

    if (!nome || !cognome) { _avviso('Nome e cognome sono obbligatori.'); return; }
    if (!email && !gEmail) { _avviso('Serve almeno un accesso: atleta o genitore.'); return; }
    if (email && pwd.length < 10) { _avviso('Accesso atleta: la password deve avere almeno 10 caratteri.'); return; }
    if (gEmail && gPwd && gPwd.length < 10) {
      _avviso('Accesso genitore: la password deve avere almeno 10 caratteri (oppure lasciala vuota: la famiglia la sceglie dal link via email).'); return;
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
        return _linkParent(atleta, gCognome, gNome, gEmail, gPwd).then(function (r) {
          if (!r.invita) return null;
          return _invitaGenitore(atleta, r.uid).then(function (to) {
            _avviso('Atleta creato. Ho inviato a ' + to + ' l\'email con il link per scegliere la password.', 'ok');
          }, function (err) {
            _avviso('Atleta e account creati, ma l\'email di invito non è partita: ' + ((err && err.message) || 'errore') +
                  '\nPuoi rimandarla dalla scheda dell\'atleta, tab "Accessi" (icona busta).');
          });
        }, function (err) {
          _avviso('Atleta creato, ma l\'accesso genitore non è stato aggiunto: ' + _authErrorText(err) +
                '\nPuoi riprovare dalla scheda dell\'atleta, tab "Accessi".');
        });
      })
      .then(function () {
        _reconcileAccessi();
        btn.textContent = 'Crea atleta'; btn.disabled = false;
        renderAtleti();
      })
      .catch(function (err) {
        _avviso('Errore: ' + _authErrorText(err));
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

    document.getElementById('detNote').value = _editingAtleta.note || '';
    document.getElementById('detNoteMsg').textContent = '';

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

    ['accCognome', 'accNome', 'accEmail', 'accPassword'].forEach(function (id) { document.getElementById(id).value = ''; });   /* via i riempimenti automatici del browser */
    _accEditUid = null;
    _switchAtletaTab('anagrafica');
    _renderRateAdmin();
    _renderAccessiAdmin();
  }

  function _switchAtletaTab(tab) {
    document.querySelectorAll('.atleta-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.tab === tab);
    });
    ['tabAnagrafica', 'tabCertmedico', 'tabRate', 'tabModulo', 'tabNote', 'tabAccessi', 'tabSicurezza'].forEach(function (id) {
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
      .catch(function (e) { _avviso('Errore: ' + e.message); });
  });

  /* ---- Salva note (riservate ai dirigenti: stanno solo su atletiDati) ---- */
  document.getElementById('detNoteSave').addEventListener('click', function () {
    var a = _editingAtleta;
    if (!a) return;
    var testo = document.getElementById('detNote').value.trim();
    var prima = a.note || '';
    var msg = document.getElementById('detNoteMsg');
    var btn = this;
    btn.disabled = true;
    msg.textContent = '';
    db.collection('atletiDati').doc(a.uid).set({ note: testo }, { merge: true })
      .then(function () {
        a.note = testo;
        document.getElementById('detNote').value = testo;
        msg.textContent = 'Salvato.'; msg.className = 'af-msg is-ok';
        return prima === testo ? null : _logWrite('atleta', a.uid, _atletaLabel(a), 'update', _diff({ note: prima }, { note: testo }, ['note']));
      })
      .catch(function (e) { msg.textContent = 'Errore: ' + e.message; msg.className = 'af-msg is-err'; })
      .then(function () { btn.disabled = false; });
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
      .catch(function (e) { _avviso('Errore: ' + e.message); });
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

    if (pwd.length < 10) { _sicurezzaMsg('La password deve avere almeno 10 caratteri.', false); return; }
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
  var _accEditUid = null;   /* uid del genitore di cui si sta correggendo il nome */
  function _renderAccessiAdmin() {
    var el  = document.getElementById('accessiList');
    var acc = _accessiOf(_editingAtleta);
    if (!acc.length) {
      el.innerHTML = '<p style="color:var(--a-muted);font-size:13px">Nessun accesso: nessuno può vedere questa scheda dall\'area atleti.</p>';
      return;
    }
    el.innerHTML = acc.map(function (x) {
      var isOwn = x.ruolo === 'atleta';
      if (!isOwn && x.uid === _accEditUid) {
        var d = _dividiNome(x.nome);
        var cog = x.cognome != null ? x.cognome : d.cognome, pre = x.prenome != null ? x.prenome : d.prenome;
        return '<div class="atleta-rate-item"><div class="atleta-rate-info" style="flex:1">' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
            '<input type="text" id="accEditCognome" class="form-input" placeholder="Cognome" value="' + esc(cog) + '" style="flex:1;min-width:150px">' +
            '<input type="text" id="accEditNome" class="form-input" placeholder="Nome" value="' + esc(pre) + '" style="flex:1;min-width:150px">' +
          '</div><div class="atleta-rate-meta">' + esc(x.email) + '</div></div>' +
          '<div class="atleta-rate-actions">' +
            '<button type="button" class="btn-primary btn-sm" onclick="AdminActions.salvaNomeAccesso(\'' + esc(x.uid) + '\')">Salva</button>' +
            '<button type="button" class="btn-ghost btn-sm" onclick="AdminActions.annullaNomeAccesso()">Annulla</button>' +
          '</div></div>';
      }
      return '<div class="atleta-rate-item">' +
        '<div class="atleta-rate-info">' +
          '<div class="atleta-rate-desc">' + esc(isOwn ? 'Atleta' : ('Genitore' + (x.nome ? ' — ' + x.nome : ''))) + '</div>' +
          '<div class="atleta-rate-meta">' + esc(x.email) + '</div>' +
        '</div>' +
        (isOwn ? '' :
          '<div class="atleta-rate-actions">' +
            '<button class="btn-icon" onclick="AdminActions.modificaNomeAccesso(\'' + esc(x.uid) + '\')" title="Modifica cognome e nome">' + EDIT_ICON_SM + '</button>' +
            '<button class="btn-icon" onclick="AdminActions.invitaAccesso(\'' + esc(x.uid) + '\')" title="Invia l\'email con il link per scegliere la password">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3,7 12,13 21,7"/></svg>' +
            '</button>' +
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
    var cognome = document.getElementById('accCognome').value.trim();
    var nome  = document.getElementById('accNome').value.trim();
    var email = document.getElementById('accEmail').value.trim();
    var pwd   = document.getElementById('accPassword').value;
    if (!email) { _avviso('Inserisci l\'email del genitore.'); return; }
    var btn = this;
    btn.disabled = true; btn.textContent = 'Aggiunta…';
    var atleta = _editingAtleta;
    _linkParent(atleta, cognome, nome, email, pwd)
      .then(function (r) {
        ['accCognome', 'accNome', 'accEmail', 'accPassword'].forEach(function (id) { document.getElementById(id).value = ''; });
        _renderAccessiAdmin();
        if (!r.invita) return null;
        return _invitaGenitore(atleta, r.uid).then(function (to) {
          _avviso('Genitore aggiunto. Ho inviato a ' + to + ' l\'email con il link per scegliere la password.', 'ok');
        }, function (err) {
          _avviso('Genitore aggiunto, ma l\'email di invito non è partita: ' + ((err && err.message) || 'errore') +
                '\nRimandala con l\'icona busta accanto al suo nome.');
        });
      })
      .catch(function (e) { _avviso('Errore: ' + _authErrorText(e)); })
      .then(function () { btn.disabled = false; btn.textContent = 'Aggiungi'; });
  });

  /* Correzione di cognome e nome di un genitore già collegato (l'email e l'account non cambiano). */
  window.AdminActions.modificaNomeAccesso = function (uid) { _accEditUid = uid; _renderAccessiAdmin(); };
  window.AdminActions.annullaNomeAccesso = function () { _accEditUid = null; _renderAccessiAdmin(); };
  window.AdminActions.salvaNomeAccesso = function (uid) {
    var a = _editingAtleta;
    if (!a) return;
    var cognome = document.getElementById('accEditCognome').value.trim();
    var prenome = document.getElementById('accEditNome').value.trim();
    var prima = _accessiOf(a).map(function (x) { return Object.assign({}, x); });
    var accessi = _accessiOf(a).map(function (x) {
      return x.uid === uid ? Object.assign({}, x, { cognome: cognome, prenome: prenome, nome: [cognome, prenome].filter(Boolean).join(' ') }) : x;
    });
    db.collection('atleti').doc(a.uid).update({ accessi: accessi }).then(function () {
      a.accessi = accessi;
      _accEditUid = null;
      _reconcileAccessi();
      _renderAccessiAdmin();
      return _logWrite('atleta', a.uid, _atletaLabel(a), 'update', _diff({ accessi: prima }, { accessi: accessi }, ['accessi']));
    }).catch(function (e) { _avviso('Errore: ' + e.message); });
  };

  window.AdminActions.invitaAccesso = function (uid) {
    if (!_editingAtleta) return;
    var x = _accessiOf(_editingAtleta).filter(function (a) { return a.uid === uid; })[0];
    if (!x || !x.email) return;
    if (!window.confirm('Inviare a ' + x.email + ' l\'email con il link per scegliere la password? I link inviati prima smettono di funzionare.')) return;
    _invitaGenitore(_editingAtleta, uid)
      .then(function (to) { _avviso('Email inviata a ' + to + '. Se non arriva, controlla lo spam.', 'ok'); })
      .catch(function (e) { _avviso('Errore: ' + ((e && e.message) || 'riprova più tardi.')); });
  };

  window.AdminActions.resetAccesso = function (uid) {
    if (!_editingAtleta) return;
    var x = _accessiOf(_editingAtleta).filter(function (a) { return a.uid === uid; })[0];
    if (!x || !x.email) return;
    _sendResetEmail(x.email, _editingAtleta.uid, _atletaLabel(_editingAtleta))
      .then(function () { _avviso('Email di reset inviata a ' + x.email + '. Se non arriva, controlla lo spam.', 'ok'); })
      .catch(function (e) { _avviso('Errore: ' + _resetErrorText(e)); });
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
          .catch(function (e) { _avviso('Errore: ' + e.message); });
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
       fissato (bool), fissatoFino (AAAA-MM-GG, facoltativo),
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
      _comunicazioniCache.sort(function (a, b) {
        return (_fissatoAttivo(b) - _fissatoAttivo(a)) || (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      _renderComunicazioniRows();
    }).catch(function (err) {
      console.error('[Avvisi]', err);
      document.getElementById('comunicazioniBody').innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:var(--a-red)">Errore nel caricamento.</td></tr>';
    });
  }

  function _destLabel(c) { return c === 'tutte' ? 'Tutta la società' : c; }

  /* Fissato in alto = `fissato` e, se c'è, `fissatoFino` (AAAA-MM-GG, incluso). Stessa regola di js/atleta.js. */
  function _fissatoAttivo(c) {
    if (!c.fissato) return false;
    if (!c.fissatoFino) return true;
    var d = new Date(), oggi = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return c.fissatoFino >= oggi;
  }
  var PIN_ICON_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 17v5M9 3h6l-1 7 3 3v2H7v-2l3-3-1-7z"/></svg>';

  function _renderComunicazioniRows() {
    if (!_comunicazioniCache.length) {
      document.getElementById('comunicazioniBody').innerHTML =
        '<tr><td colspan="4"><div class="empty-state"><p>Nessun avviso pubblicato.</p></div></td></tr>';
      return;
    }
    document.getElementById('comunicazioniBody').innerHTML = _comunicazioniCache.map(function (c) {
      var fissato = _fissatoAttivo(c);
      var nota = fissato ? (c.fissatoFino ? 'Fissato fino al ' + _fmtDate(c.fissatoFino) : 'Fissato in alto')
        : (c.fissato && c.fissatoFino ? 'Fissaggio scaduto il ' + _fmtDate(c.fissatoFino) : '');
      return '<tr>' +
        '<td style="white-space:nowrap">' + _fmtDate((c.createdAt || '').slice(0, 10)) + '</td>' +
        '<td><span class="chip ' + (c.categoria === 'tutte' ? 'chip--gray' : 'chip--blue') + '">' + esc(_destLabel(c.categoria)) + '</span></td>' +
        '<td><div class="table-title">' + (c.importante ? '<span style="color:var(--a-red)">● </span>' : '') + esc(c.titolo) + '</div>' +
          (nota ? '<div style="font-size:12px;color:var(--a-muted);margin-top:2px">' + (fissato ? PIN_ICON_SM + ' ' : '') + esc(nota) + '</div>' : '') + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn-icon" onclick="AdminActions.pinComunicazione(\'' + esc(c.id) + '\')" title="' + (fissato ? 'Togli dalla cima' : 'Fissa in alto') + '"' + (fissato ? ' style="color:var(--a-blue,#0070d6)"' : '') + '>' + PIN_ICON_SM + '</button>' +
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
    document.getElementById('comFissato').checked    = !!c.fissato;
    document.getElementById('comFissatoFino').value  = c.fissatoFino || '';
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
      fissato:     document.getElementById('comFissato').checked,
      fissatoFino: document.getElementById('comFissato').checked ? document.getElementById('comFissatoFino').value : '',
      allegatoUrl: document.getElementById('comAllegato').value.trim(),
      createdAt:   before ? before.createdAt : new Date().toISOString(),
      autore:      before ? (before.autore || '') : (A.dirigenteNome() || '')
    };
    if (!data.categoria || !data.titolo || !data.testo) {
      _avviso('Destinatari, titolo e testo sono obbligatori.'); return;
    }
    if (data.allegatoUrl && !/^https:\/\//i.test(data.allegatoUrl)) {
      _avviso('Il link allegato deve iniziare con https://'); return;
    }

    var ref   = before ? db.collection('comunicazioni').doc(before.id) : db.collection('comunicazioni').doc();
    var label = 'Avviso — ' + data.titolo;
    var btn   = this;
    btn.disabled = true;

    ref.set(data)
      .then(function () {
        return _logWrite('avviso', ref.id, label, before ? 'update' : 'create',
          _diff(before || {}, data, ['categoria', 'titolo', 'testo', 'importante', 'fissato', 'fissatoFino', 'allegatoUrl']));
      })
      .then(function () { btn.disabled = false; renderComunicazioni(); })
      .catch(function (e) { btn.disabled = false; _avviso('Errore: ' + e.message); });
  });

  window.AdminActions.editComunicazione = function (id) { _openComunicazioneForm(id); };

  /* Fissa o toglie dalla cima con un clic. Togliendo si azzera anche la data. */
  window.AdminActions.pinComunicazione = function (id) {
    var c = _comunicazioniCache.find(function (x) { return x.id === id; });
    if (!c) return;
    var prima = { fissato: !!c.fissato, fissatoFino: c.fissatoFino || '' };
    var dopo = _fissatoAttivo(c) ? { fissato: false, fissatoFino: '' } : { fissato: true, fissatoFino: '' };
    db.collection('comunicazioni').doc(id).update(dopo)
      .then(function () {
        return _logWrite('avviso', id, 'Avviso — ' + c.titolo, 'update', _diff(prima, dopo, ['fissato', 'fissatoFino']));
      })
      .then(renderComunicazioni)
      .catch(function (e) { _avviso('Errore: ' + e.message); });
  };

  window.AdminActions.deleteComunicazione = function (id) {
    var target = _comunicazioniCache.find(function (c) { return c.id === id; });
    confirm('Eliminare questo avviso? Sparirà dall\'area atleti di tutti i destinatari.', function () {
      db.collection('comunicazioni').doc(id).delete()
        .then(function () {
          return _logWrite('avviso', id, 'Avviso — ' + (target ? target.titolo : id), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
        })
        .then(renderComunicazioni)
        .catch(function (e) { _avviso('Errore: ' + e.message); });
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
      _avviso('Categoria, giorno e ora di inizio sono obbligatori.'); return;
    }
    if (data.oraFine && data.oraFine <= data.oraInizio) {
      _avviso('L\'ora di fine deve essere dopo quella di inizio.'); return;
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
      .catch(function (e) { btn.disabled = false; _avviso('Errore: ' + e.message); });
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
        .catch(function (e) { _avviso('Errore: ' + e.message); });
    });
  };

  /* ---- Interfaccia verso admin.js e verso il Budget ---- */
  A.atleti = {
    render: renderAtleti,
    renderRows: _renderAtletiRows,
    renderRateAdmin: _renderRateAdmin,
    stagioneCorrenteNome: _stagioneCorrenteNome,
    renderComunicazioni: renderComunicazioni,
    renderPresenze: renderPresenze,
    renderAllenamenti: renderAllenamenti,
    SENSIBILI: ATLETA_SENSIBILI
  };

})();
