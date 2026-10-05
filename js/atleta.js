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
  var _avvisi      = [];  /* avvisi dell'atleta selezionato (sua squadra + tutta la società) */
  var _avvisiError = false;
  var _avvisiToken = 0;   /* scarta le risposte di un atleta già deselezionato */
  var _seenBefore  = '';  /* "ultima lettura" prima di aprire la scheda Avvisi: serve a evidenziare i nuovi */
  var _presenze      = {};  /* risposte dell'atleta selezionato: eventKey → 'si' | 'no' */
  var _presenzeReady = false;
  var _presToken     = 0;
  var _agendaEvents  = {};  /* eventKey → evento mostrato nel calendario */
  var _allenamenti = [];  /* orari settimanali, collezione `allenamenti` */
  var _dataReady   = false;
  var _dataLoading = false;
  var _dataWaiters = [];

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

    /* Recupero password: Firebase manda un'email con il link per sceglierne una nuova. La risposta è la stessa
       sia che l'indirizzo esista o no, così nessuno può scoprire chi è registrato. */
    document.getElementById('forgotBtn').addEventListener('click', function () {
      var email = document.getElementById('emailInput').value.trim();
      var errEl = document.getElementById('loginError'), okEl = document.getElementById('loginOk');
      errEl.textContent = ''; okEl.textContent = '';
      if (!/^\S+@\S+\.\S+$/.test(email)) { errEl.textContent = 'Scrivi qui sopra la tua email, poi tocca «Password dimenticata?».'; return; }
      auth.sendPasswordResetEmail(email).then(function () { return null; }, function (e) {
        return e && e.code === 'auth/user-not-found' ? null : e;
      }).then(function (e) {
        if (e) { errEl.textContent = 'Non riesco a inviare l\'email in questo momento. Riprova più tardi.'; return; }
        okEl.textContent = 'Se l\'indirizzo è registrato, riceverai un\'email con il link per scegliere una nuova password. Controlla anche lo spam.';
      });
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
      auth.signOut().then(function () { location.reload(); });
    });

    document.getElementById('alNav').addEventListener('click', function (e) {
      var btn = e.target.closest('.al-nav-btn');
      if (btn) _showView(btn.dataset.view);
    });

    /* riquadri e voci di "Da fare" che portano a un'altra scheda (anche quelli creati dopo) */
    document.getElementById('view-home').addEventListener('click', function (e) {
      var el = e.target.closest('[data-goto]');
      if (el) _showView(el.dataset.goto);
    });
    document.getElementById('todoList').addEventListener('keydown', function (e) {
      var el = e.target.closest('[data-goto]');
      if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); _showView(el.dataset.goto); }
    });

    document.getElementById('childBarInner').addEventListener('click', function (e) {
      var btn = e.target.closest('.al-child');
      if (btn) _selectAtleta(btn.dataset.id);
    });

    document.getElementById('pwdForm').addEventListener('submit', _changePassword);

    document.getElementById('ratePdfBtn').addEventListener('click', function () {
      if (_current) _exportRatePdf(_current);
    });

    document.getElementById('ricList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ric]');
      if (!b || !_current) return;
      var r = (_current.ricevute || []).find(function (x) { return x.id === b.getAttribute('data-ric'); });
      document.getElementById('ricMsg').textContent = '';
      if (r && !window.RicevutaDoc.open(r)) {
        document.getElementById('ricMsg').textContent = 'Il browser ha bloccato la finestra della ricevuta. Consenti i popup per questo sito e riprova.';
      }
    });

    document.getElementById('icsAll').addEventListener('click', function () {
      if (_current) _downloadIcs(_buildIcs(_current, null), _current);
    });
    document.getElementById('agendaList').addEventListener('click', function (e) {
      var resp = e.target.closest('[data-resp]');
      if (resp && _current) { _setPresenza(_current, resp.dataset.key, resp.dataset.resp); return; }
      var btn = e.target.closest('[data-ics]');
      if (btn && _current) _downloadIcs(_buildIcs(_current, btn.dataset.ics), _current);
    });

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
      _ensureData(function () { if (_current) _refreshAgendaViews(_current); });
    });
  }

  /* Partite, squadre e allenamenti si scaricano una volta sola, alla prima necessità. */
  function _ensureData(cb) {
    if (_dataReady) { cb(); return; }
    _dataWaiters.push(cb);
    if (_dataLoading) return;
    _dataLoading = true;

    Promise.all([
      new Promise(function (resolve) { DB.load(['categories', 'seasons', 'players', 'staff', 'partite'], resolve); }),
      db.collection('allenamenti').get().then(function (snap) {
        _allenamenti = [];
        snap.forEach(function (d) { _allenamenti.push(Object.assign({}, d.data(), { id: d.id })); });
      }).catch(function (e) { console.error('[atleta] allenamenti', e); })
    ]).then(function () {
      _dataReady = true;
      _dataLoading = false;
      _dataWaiters.splice(0).forEach(function (f) { f(); });
    });
  }

  function _refreshAgendaViews(a) {
    _renderNext(a);
    _renderTodo(a);
    if (_view === 'calendario') _renderCalendario(a);
    if (_view === 'squadra')    _renderSquadra(a);
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
    if (_dataReady) _refreshAgendaViews(_current);
    _presenze = {};
    _presenzeReady = false;
    _loadPresenze(_current);
    _loadRate(_current);
    _loadRicevute(_current);
    _avvisi = [];
    _avvisiError = false;
    _seenBefore = _getLastSeen(_current);
    _renderAvvisiBadge();
    if (_view === 'avvisi') _renderAvvisi(_current);
    _loadAvvisi(_current);
  }

  function _showView(name) {
    _view = name;
    document.querySelectorAll('.al-view').forEach(function (v) {
      v.classList.toggle('is-hidden', v.id !== 'view-' + name);
    });
    document.querySelectorAll('.al-nav-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === name);
    });
    if (name === 'avvisi' && _current) {
      _seenBefore = _getLastSeen(_current);
      _renderAvvisi(_current);
      _loadAvvisi(_current);   /* aggiorna in background */
    }
    if (name === 'squadra' && _current)    _renderSquadra(_current);
    if (name === 'calendario' && _current) _renderCalendario(_current);
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

  function _renderTodo(a) {
    var items = _todoItems(a);
    var n = _unreadAvvisi(a);
    if (n) {
      items.unshift({
        lvl: _avvisi.some(function (v) { return v.importante && _isUnread(a, v); }) ? 'red' : 'orange',
        text: n === 1 ? 'Hai 1 avviso non letto.' : 'Hai ' + n + ' avvisi non letti.',
        go: 'avvisi'
      });
    }
    var daConfermare = _presenzeDaConfermare(a);
    if (daConfermare) {
      items.push({
        lvl: 'orange',
        text: daConfermare === 1 ? 'Conferma la presenza a 1 impegno dei prossimi 7 giorni.' : 'Conferma la presenza a ' + daConfermare + ' impegni dei prossimi 7 giorni.',
        go: 'calendario'
      });
    }
    document.getElementById('todoList').innerHTML = items.length
      ? items.map(function (it) {
          return '<li class="al-todo al-todo--' + it.lvl + (it.go ? ' is-link' : '') + '"' +
            (it.go ? ' data-goto="' + it.go + '" tabindex="0" role="link"' : '') + '>' +
            '<span class="al-todo-dot"></span><span>' + _esc(it.text) + '</span></li>';
        }).join('')
      : '<li class="al-todo al-todo--ok"><span class="al-todo-dot"></span><span>Tutto in regola, non c\'è niente da fare.</span></li>';
  }

  function _renderHome(a) {
    _renderTodo(a);

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

  /* ---------------- avvisi ---------------- */

  var AVVISI_NUOVI_SENZA_LETTURA_GIORNI = 30;

  /* "Ultima lettura" per account + atleta, solo su questo dispositivo. */
  function _lastSeenKey(a) { return 'vv_avvisi_letti_' + (_user ? _user.uid : '') + '_' + a.uid; }
  function _getLastSeen(a) {
    try { return localStorage.getItem(_lastSeenKey(a)) || ''; } catch (e) { return ''; }
  }
  function _setLastSeen(a, iso) {
    try { localStorage.setItem(_lastSeenKey(a), iso); } catch (e) { /* storage non disponibile: pazienza */ }
  }

  function _isUnread(a, v) {
    var seen = _getLastSeen(a);
    if (!seen) {
      /* primo accesso su questo dispositivo: non segnare come "da leggere" tutto lo storico */
      seen = new Date(Date.now() - AVVISI_NUOVI_SENZA_LETTURA_GIORNI * 864e5).toISOString();
    }
    return (v.createdAt || '') > seen;
  }

  function _unreadAvvisi(a) {
    return _avvisi.filter(function (v) { return _isUnread(a, v); }).length;
  }

  function _renderAvvisiBadge() {
    var b = document.getElementById('avvisiBadge');
    var n = _current ? _unreadAvvisi(_current) : 0;
    b.textContent = n > 9 ? '9+' : String(n);
    b.classList.toggle('is-hidden', !n);
  }

  function _loadAvvisi(a) {
    var token = ++_avvisiToken;
    var cats = a.categoria ? ['tutte', a.categoria] : ['tutte'];

    db.collection('comunicazioni').where('categoria', 'in', cats).get()
      .then(function (snap) {
        if (token !== _avvisiToken) return;
        _avvisi = [];
        snap.forEach(function (d) { _avvisi.push(Object.assign({ id: d.id }, d.data())); });
        _avvisi.sort(function (x, y) { return (y.createdAt || '').localeCompare(x.createdAt || ''); });
        _avvisiError = false;
      })
      .catch(function (e) {
        if (token !== _avvisiToken) return;
        console.error('[atleta] avvisi', e);
        _avvisi = [];
        _avvisiError = true;
      })
      .then(function () {
        if (token !== _avvisiToken) return;
        if (_view === 'avvisi') _renderAvvisi(a);   /* segna anche come letti */
        _renderAvvisiBadge();
        _renderTodo(a);
      });
  }

  function _linkify(text) {
    return _esc(text)
      .replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }

  function _renderAvvisi(a) {
    var el = document.getElementById('avvisiList');

    if (_avvisiError) {
      el.innerHTML = '<div class="al-card"><div class="al-card-body"><p class="al-muted">Non è stato possibile caricare gli avvisi. Riprova più tardi.</p></div></div>';
      return;
    }
    if (!_avvisi.length) {
      el.innerHTML = '<div class="al-card"><div class="al-card-body"><p class="al-muted">Non ci sono avvisi.</p></div></div>';
      return;
    }

    var seen = _seenBefore || new Date(Date.now() - AVVISI_NUOVI_SENZA_LETTURA_GIORNI * 864e5).toISOString();

    el.innerHTML = _avvisi.map(function (v) {
      var isNew = (v.createdAt || '') > seen;
      var att = v.allegatoUrl && /^https:\/\//i.test(v.allegatoUrl)
        ? '<a href="' + _esc(_driveViewUrl(v.allegatoUrl)) + '" target="_blank" rel="noopener" class="al-btn-ghost al-btn-sm">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>Apri allegato</a>'
        : '';
      return '<article class="al-card al-avviso' + (v.importante ? ' al-avviso--important' : '') + '">' +
        '<div class="al-card-body">' +
          '<div class="al-avviso-head">' +
            '<h2 class="al-avviso-title">' + _esc(v.titolo) + '</h2>' +
            (isNew ? '<span class="al-badge al-badge--green">Nuovo</span>' : '') +
            (v.importante ? '<span class="al-badge al-badge--red">Importante</span>' : '') +
          '</div>' +
          '<div class="al-avviso-meta">' + _fmtDate((v.createdAt || '').slice(0, 10)) + ' · ' +
            (v.categoria === 'tutte' ? 'Tutta la società' : _esc(v.categoria)) + '</div>' +
          '<div class="al-avviso-text">' + _linkify(v.testo || '') + '</div>' +
          (att ? '<div class="al-avviso-att">' + att + '</div>' : '') +
        '</div></article>';
    }).join('');

    /* l'apertura della scheda li segna come letti (su questo dispositivo) */
    _setLastSeen(a, _avvisi[0].createdAt || new Date().toISOString());
  }

  /* ---------------- quote: arrivano dal budget (rateAtleti), non dalla scheda ---------------- */

  var _rateToken = 0;

  function _loadRate(a) {
    var token = ++_rateToken;
    a.rate = [];
    a.rateErrore = false;

    db.collection('rateAtleti').where('atletaId', '==', a.uid).get()
      .then(function (snap) {
        if (token !== _rateToken) return;
        var rows = [], stagioni = {};
        snap.forEach(function (d) { var r = d.data(); rows.push(r); if (r.stagione) stagioni[r.stagione] = true; });
        var piuStagioni = Object.keys(stagioni).length > 1;
        rows.sort(function (x, y) { return (x.scadenza || '9999-12-31').localeCompare(y.scadenza || '9999-12-31'); });
        a.rate = rows.map(function (r) {
          return {
            descrizione: (r.note || 'Quota') + (piuStagioni && r.stagione ? ' (' + r.stagione + ')' : ''),
            importo: r.importo, scadenza: r.scadenza, pagata: !!r.pagata, dataPagamento: r.dataPagamento || null
          };
        });
      })
      .catch(function (e) {
        if (token !== _rateToken) return;
        console.error('[atleta] rate', e);
        a.rateErrore = true;
      })
      .then(function () {
        if (token !== _rateToken || _current !== a) return;
        _renderRate(a);
        _renderHome(a);
      });
  }

  /* ---------------- ricevute di pagamento: emesse dai dirigenti, qui solo lettura e download ---------------- */

  var _ricToken = 0;

  function _loadRicevute(a) {
    var token = ++_ricToken;
    a.ricevute = [];
    a.ricevuteErrore = false;
    db.collection('ricevute').where('atletaId', '==', a.uid).get()
      .then(function (snap) {
        if (token !== _ricToken) return;
        a.ricevute = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
          .sort(function (x, y) { return (y.data || '').localeCompare(x.data || '') || (y.progressivo || 0) - (x.progressivo || 0); });
      })
      .catch(function (e) {
        if (token !== _ricToken) return;
        console.error('[atleta] ricevute', e);
        a.ricevuteErrore = true;
      })
      .then(function () {
        if (token === _ricToken && _current === a) _renderRicevute(a);
      });
  }

  function _renderRicevute(a) {
    var el = document.getElementById('ricList');
    document.getElementById('ricMsg').textContent = '';
    var list = a.ricevute || [];
    if (!list.length) {
      el.innerHTML = '<p class="al-muted">' + (a.ricevuteErrore ? 'Non è stato possibile caricare le ricevute. Riprova più tardi.' : 'Nessuna ricevuta disponibile.') + '</p>';
      return;
    }
    el.innerHTML = list.map(function (r) {
      var ann = r.stato === 'annullata';
      return '<div class="al-rate-item' + (ann ? '' : ' al-rate-item--paid') + '">' +
        '<div class="al-rate-info">' +
          '<div class="al-rate-desc">Ricevuta ' + _esc(r.numero) + '</div>' +
          '<div class="al-rate-date">' + _esc(_fmtDate(r.data)) + ' · ' + _esc(r.causale || r.tipoIncasso || '') + '</div>' +
        '</div>' +
        '<div class="al-rate-right">' +
          '<div class="al-rate-amount">' + _eur(r.importo) + '</div>' +
          (ann ? '<span class="al-badge al-badge--red">Annullata</span>' : '') +
          '<button type="button" class="al-btn-ghost al-btn-sm" data-ric="' + _esc(r.id) + '">Scarica PDF</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ---------------- presenze: "ci sarò / non ci sarò" ---------------- */

  var PRESENZE_PROMEMORIA_GIORNI = 7;

  function _presenzeDaConfermare(a) {
    if (!_dataReady || !_presenzeReady || !a.categoria) return 0;
    var limit = _addDays(_isoDate(new Date()), PRESENZE_PROMEMORIA_GIORNI);
    return _agenda(a).filter(function (ev) { return ev.date <= limit && !_presenze[ev.key]; }).length;
  }

  function _loadPresenze(a) {
    var token = ++_presToken;
    db.collection('presenze').where('atletaId', '==', a.uid).get()
      .then(function (snap) {
        if (token !== _presToken) return;
        _presenze = {};
        snap.forEach(function (d) { var x = d.data(); _presenze[x.eventKey] = x.risposta; });
        _presenzeReady = true;
      })
      .catch(function (e) {
        if (token !== _presToken) return;
        /* senza le risposte non si può dire cosa manca: niente promemoria, ma il calendario funziona */
        console.error('[atleta] presenze', e);
        _presenzeReady = false;
      })
      .then(function () {
        if (token !== _presToken) return;
        if (_view === 'calendario') _renderCalendario(a);
        _renderTodo(a);
      });
  }

  function _respHtml(a, ev) {
    var r = _presenze[ev.key];
    return '<div class="al-ev-resp" role="group" aria-label="Presenza di ' + _esc(a.nome || '') + '">' +
      '<span class="al-resp-label">' + _esc(a.nome || 'Presenza') + ':</span>' +
      '<button type="button" class="al-resp-btn al-resp-btn--si' + (r === 'si' ? ' is-active' : '') + '" data-resp="si" data-key="' + _esc(ev.key) + '" aria-pressed="' + (r === 'si') + '">Ci sarò</button>' +
      '<button type="button" class="al-resp-btn al-resp-btn--no' + (r === 'no' ? ' is-active' : '') + '" data-resp="no" data-key="' + _esc(ev.key) + '" aria-pressed="' + (r === 'no') + '">Non ci sarò</button>' +
    '</div>';
  }

  function _setPresenza(a, key, risposta) {
    var ev = _agendaEvents[key];
    if (!ev || (risposta !== 'si' && risposta !== 'no') || _presenze[key] === risposta) return;

    var prev = _presenze[key];
    var msg  = document.getElementById('presMsg');
    msg.textContent = '';
    _presenze[key] = risposta;
    _renderCalendario(a);
    _renderTodo(a);

    db.collection('presenze').doc(key + '_' + a.uid).set({
      eventKey: key, tipo: ev.tipo, eventoId: ev.eventoId, data: ev.date,
      categoria: a.categoria, atletaId: a.uid, risposta: risposta,
      rispostaDa: _user.uid, rispostaIl: new Date().toISOString()
    }).catch(function (e) {
      console.error('[atleta] presenza', e);
      if (_current !== a) return;
      if (prev) _presenze[key] = prev; else delete _presenze[key];
      msg.textContent = 'Non sono riuscito a salvare la risposta. Riprova.';
      _renderCalendario(a);
      _renderTodo(a);
    });
  }

  /* ---------------- calendario: partite + allenamenti ---------------- */

  var AGENDA_GIORNI_ALLENAMENTI = 14;
  var MAX_PARTITE_AGENDA = 12;

  function _pad(n) { return (n < 10 ? '0' : '') + n; }
  function _isoDate(d) { return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()); }
  function _addDays(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return _isoDate(d); }
  function _weekday(iso) { return (new Date(iso + 'T00:00:00').getDay() + 6) % 7 + 1; } /* 1=lun … 7=dom */

  function _safeId(s) { return String(s).replace(/\//g, '_'); }

  function _isHome(p) { return /victor/i.test(p.squadra_casa || ''); }

  /* Eventi futuri della categoria dell'atleta, in ordine cronologico. */
  function _agenda(a) {
    if (!a.categoria) return [];
    var today = _isoDate(new Date());
    var events = [];

    VV.getPartite()
      .filter(function (p) { return p.categoria === a.categoria && p.data >= today && p.stato !== 'conclusa'; })
      .sort(function (x, y) { return (x.data + (x.ora || '')).localeCompare(y.data + (y.ora || '')); })
      .slice(0, MAX_PARTITE_AGENDA)
      .forEach(function (p) {
        events.push({
          tipo: 'partita', date: p.data, start: p.ora || '', end: '', id: p.id,
          key: _safeId('p-' + p.id), eventoId: String(p.id),
          title: (p.squadra_casa || '') + ' – ' + (p.squadra_ospite || ''),
          luogo: p.palazzetto || '', home: _isHome(p),
          diretta: !!(p.spp_code && p.data === today)
        });
      });

    _allenamenti.filter(function (t) { return t.categoria === a.categoria; }).forEach(function (t) {
      for (var i = 0; i < AGENDA_GIORNI_ALLENAMENTI; i++) {
        var day = _addDays(today, i);
        if (_weekday(day) !== +t.giorno) continue;
        if (t.validoFino && day > t.validoFino) break;
        events.push({
          tipo: 'allenamento', date: day, start: t.oraInizio || '', end: t.oraFine || '',
          key: _safeId('a-' + t.id + '-' + day), eventoId: String(t.id),
          title: 'Allenamento', luogo: t.luogo || '', note: t.note || ''
        });
      }
    });

    events.sort(function (x, y) { return (x.date + x.start).localeCompare(y.date + y.start); });
    return events;
  }

  function _dayLabel(iso) {
    var today = _isoDate(new Date());
    var txt = new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    txt = txt.charAt(0).toUpperCase() + txt.slice(1);
    return iso === today ? 'Oggi · ' + txt : iso === _addDays(today, 1) ? 'Domani · ' + txt : txt;
  }

  function _mapsLink(luogo) {
    return '<a class="al-ev-place" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(luogo) +
      '" target="_blank" rel="noopener">' + _esc(luogo) + '</a>';
  }

  function _renderNext(a) {
    var t = document.getElementById('tileNext'), s = document.getElementById('tileNextSub');
    var next = _agenda(a)[0];
    if (!a.categoria) { t.textContent = '—'; s.textContent = 'Squadra non ancora assegnata'; return; }
    if (!next) { t.textContent = 'Nessun impegno'; s.textContent = 'Non ci sono partite o allenamenti in programma'; return; }
    var d = new Date(next.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
    t.textContent = d.charAt(0).toUpperCase() + d.slice(1) + (next.start ? ' · ' + next.start : '');
    s.textContent = (next.tipo === 'partita' ? next.title : 'Allenamento') + (next.luogo ? ' — ' + next.luogo : '');
  }

  function _renderCalendario(a) {
    var list = document.getElementById('agendaList');
    var icsBtn = document.getElementById('icsAll');
    if (!_dataReady) {
      list.innerHTML = '<p class="al-muted">Caricamento…</p>';
      _ensureData(function () { if (_view === 'calendario' && _current) _renderCalendario(_current); });
      return;
    }

    var events = _agenda(a);
    icsBtn.classList.toggle('is-hidden', !events.length);
    document.getElementById('agendaSub').textContent = a.categoria ? a.categoria : 'Partite e allenamenti';

    if (!a.categoria) {
      list.innerHTML = '<p class="al-muted">La squadra non è ancora stata assegnata.</p>';
    } else if (!events.length) {
      list.innerHTML = '<p class="al-muted">Non ci sono partite o allenamenti in programma.</p>';
    } else {
      var html = '', lastDay = '';
      _agendaEvents = {};
      events.forEach(function (ev) {
        _agendaEvents[ev.key] = ev;
        if (ev.date !== lastDay) {
          html += (lastDay ? '</ul>' : '') + '<h2 class="al-day">' + _esc(_dayLabel(ev.date)) + '</h2><ul class="al-events">';
          lastDay = ev.date;
        }
        var isMatch = ev.tipo === 'partita';
        html += '<li class="al-event al-event--' + ev.tipo + '">' +
          '<div class="al-ev-time">' + _esc(ev.start || '—') + (ev.end ? '<span>' + _esc(ev.end) + '</span>' : '') + '</div>' +
          '<div class="al-ev-body">' +
            '<div class="al-ev-title">' + _esc(ev.title) + '</div>' +
            '<div class="al-ev-meta">' +
              (isMatch ? '<span class="al-badge ' + (ev.home ? 'al-badge--green' : 'al-badge--orange') + '">' + (ev.home ? 'Casa' : 'Trasferta') + '</span> ' : '') +
              (ev.luogo ? _mapsLink(ev.luogo) : '') +
            '</div>' +
            (ev.note ? '<div class="al-ev-note">' + _esc(ev.note) + '</div>' : '') +
            _respHtml(a, ev) +
            (isMatch ? '<div class="al-ev-actions">' +
              (ev.diretta ? '<a class="al-btn-ghost al-btn-sm" href="/diretta">Diretta</a>' : '') +
              '<button type="button" class="al-btn-ghost al-btn-sm" data-ics="' + _esc(ev.id) + '">Aggiungi al calendario</button></div>' : '') +
          '</div></li>';
      });
      list.innerHTML = html + '</ul>';
    }

    /* ultimi risultati della categoria */
    var done = a.categoria ? VV.getPartite()
      .filter(function (p) { return p.categoria === a.categoria && p.stato === 'conclusa' && p.set_casa != null && p.set_ospite != null; })
      .sort(function (x, y) { return y.data.localeCompare(x.data); })
      .slice(0, 3) : [];
    document.getElementById('risultatiCard').classList.toggle('is-hidden', !done.length);
    document.getElementById('risultatiList').innerHTML = done.map(function (p) {
      var home = _isHome(p);
      var won  = home ? +p.set_casa > +p.set_ospite : +p.set_ospite > +p.set_casa;
      return '<li class="al-person"><span class="al-badge ' + (won ? 'al-badge--green' : 'al-badge--red') + '">' + (won ? 'Vinta' : 'Persa') + '</span>' +
        '<span class="al-person-name">' + _esc(p.squadra_casa) + ' – ' + _esc(p.squadra_ospite) + '</span>' +
        '<span class="al-person-role"><strong>' + _esc(p.set_casa) + '–' + _esc(p.set_ospite) + '</strong> · ' + _fmtDate(p.data) + '</span></li>';
    }).join('');
  }

  /* ---------------- export .ics ---------------- */

  function _icsText(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  function _icsFold(line) {
    var out = [];
    while (line.length > 73) { out.push(line.slice(0, 73)); line = ' ' + line.slice(73); }
    out.push(line);
    return out.join('\r\n');
  }

  /* orari "floating" (senza fuso): il telefono li legge all'ora locale, cioè quella italiana */
  function _icsDT(iso, time) { return iso.replace(/-/g, '') + 'T' + (time || '00:00').replace(':', '') + '00'; }

  function _icsPlusMinutes(iso, time, min) {
    var d = new Date(iso + 'T' + (time || '00:00') + ':00');
    d.setMinutes(d.getMinutes() + min);
    return _icsDT(_isoDate(d), _pad(d.getHours()) + ':' + _pad(d.getMinutes()));
  }

  /* onlyMatchId = null → tutto il calendario (partite future + allenamenti ricorrenti) */
  function _buildIcs(a, onlyMatchId) {
    var now = new Date();
    var stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var today = _isoDate(now);
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Victor Volley//Area Atleti//IT', 'CALSCALE:GREGORIAN',
                 'X-WR-CALNAME:' + _icsText('Victor Volley — ' + (a.categoria || ''))];

    VV.getPartite()
      .filter(function (p) {
        return p.categoria === a.categoria && p.stato !== 'conclusa' && p.data >= today &&
               (onlyMatchId == null || String(p.id) === String(onlyMatchId));
      })
      .forEach(function (p) {
        var ora = p.ora || '00:00';
        lines.push('BEGIN:VEVENT',
          'UID:partita-' + p.id + '@victorvolley',
          'DTSTAMP:' + stamp,
          'DTSTART:' + _icsDT(p.data, ora),
          'DTEND:' + _icsPlusMinutes(p.data, ora, 120),
          'SUMMARY:' + _icsText((p.squadra_casa || '') + ' – ' + (p.squadra_ospite || '')),
          'LOCATION:' + _icsText(p.palazzetto || ''),
          'DESCRIPTION:' + _icsText('Partita ' + (a.categoria || '') + (_isHome(p) ? ' (in casa)' : ' (in trasferta)')),
          'END:VEVENT');
      });

    if (onlyMatchId == null) {
      _allenamenti.filter(function (t) { return t.categoria === a.categoria; }).forEach(function (t) {
        var first = null;
        for (var i = 0; i < 7; i++) {
          var day = _addDays(today, i);
          if (_weekday(day) === +t.giorno) { first = day; break; }
        }
        if (!first || (t.validoFino && first > t.validoFino)) return;
        var fine = t.oraFine ? _icsDT(first, t.oraFine) : _icsPlusMinutes(first, t.oraInizio, 90);
        lines.push('BEGIN:VEVENT',
          'UID:allenamento-' + t.id + '@victorvolley',
          'DTSTAMP:' + stamp,
          'DTSTART:' + _icsDT(first, t.oraInizio),
          'DTEND:' + fine,
          'RRULE:FREQ=WEEKLY;' + (t.validoFino ? 'UNTIL=' + t.validoFino.replace(/-/g, '') + 'T235959' : 'COUNT=52'),
          'SUMMARY:' + _icsText('Allenamento ' + (a.categoria || '')),
          'LOCATION:' + _icsText(t.luogo || ''),
          'DESCRIPTION:' + _icsText(t.note || ''),
          'END:VEVENT');
      });
    }

    lines.push('END:VCALENDAR');
    return lines.map(_icsFold).join('\r\n') + '\r\n';
  }

  function _downloadIcs(text, a) {
    var slug = (a.categoria || 'calendario').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'victor-volley-' + slug + '.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- squadra ---------------- */

  function _renderSquadra(a) {
    var el = document.getElementById('squadraContent');

    if (!_dataReady) {
      el.innerHTML = '<p class="al-muted">Caricamento…</p>';
      _ensureData(function () { if (_view === 'squadra' && _current) _renderSquadra(_current); });
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

    document.getElementById('ratePdfBtn').classList.toggle('is-hidden', !rate.length);
    document.getElementById('ratePdfMsg').textContent = '';

    document.getElementById('rateSub').textContent = t.totale > 0
      ? 'Saldato: €' + t.saldato.toFixed(2) + '  ·  Dovuto: €' + t.dovuto.toFixed(2)
      : 'Stagione corrente';

    if (!rate.length) {
      document.getElementById('rateList').innerHTML = '<p class="al-muted">' +
        (data.rateErrore ? 'Non è stato possibile caricare le quote. Riprova più tardi.' : 'Nessuna quota inserita.') + '</p>';
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

  /* Riepilogo quote in PDF, via finestra di stampa del browser ("Salva come PDF").
     È un riepilogo informativo, non una ricevuta fiscale. */
  function _eur(n) {
    return (+n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function _exportRatePdf(a) {
    var rate = (a.rate || []).slice().sort(function (x, y) {
      return (x.scadenza || '9999-12-31').localeCompare(y.scadenza || '9999-12-31');
    });
    if (!rate.length) return;

    var t     = _totaliRate(a);
    var today = _isoDate(new Date());
    var oggi  = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

    function stato(r) {
      if (r.pagata) {
        return '<span class="badge badge--ok">Pagata' + (r.dataPagamento ? ' il ' + _esc(_fmtDate(r.dataPagamento)) : '') + '</span>';
      }
      if (r.scadenza && r.scadenza < today) return '<span class="badge badge--red">Scaduta</span>';
      return '<span class="badge badge--warn">Da pagare</span>';
    }

    var css = '@page{size:A4;margin:16mm 14mm}' +
      '*{box-sizing:border-box}' +
      'body{font-family:"Manrope",Arial,Helvetica,sans-serif;color:#1E293B;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12.5px}' +
      '.doc{max-width:800px;margin:0 auto}' +
      'h1{font-family:"Barlow",Arial,sans-serif;margin:0}' +
      '.letterhead{display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#0F172A 0%,#1E3A5F 100%);color:#fff;padding:18px 22px;border-radius:10px;margin-bottom:22px}' +
      '.letterhead-brand{display:flex;align-items:center;gap:12px}' +
      '.letterhead-logo{width:42px;height:42px;object-fit:contain;border-radius:8px;background:#fff;padding:3px}' +
      '.letterhead-club{font-family:"Barlow",sans-serif;font-weight:700;font-size:17px}' +
      '.letterhead-sub{font-size:10.5px;color:rgba(255,255,255,.68);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}' +
      '.letterhead-meta{text-align:right;font-size:10.5px;color:rgba(255,255,255,.85)}' +
      '.letterhead-doctype{font-family:"Barlow",sans-serif;font-weight:700;font-size:11.5px;color:#fff;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}' +
      '.letterhead-meta strong{color:#fff;margin-left:4px}' +
      '.titleblock{margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #E2E8F0}' +
      '.titleblock h1{font-size:22px;color:#0F172A;font-weight:700}' +
      '.tag{display:inline-block;margin-top:8px;font-size:10.5px;background:#F1F5F9;color:#475569;border-radius:999px;padding:3px 11px;font-weight:600}' +
      '.kpis{display:flex;gap:10px;margin-bottom:20px}' +
      '.kpi{flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-top:3px solid #94A3B8;border-radius:8px;padding:10px 12px}' +
      '.kpi-label{font-size:9.5px;color:#64748B;text-transform:uppercase;letter-spacing:.05em;font-weight:700}' +
      '.kpi-value{font-size:17px;font-weight:700;color:#0F172A;margin-top:3px;font-family:"Barlow",sans-serif}' +
      '.kpi--ok{border-top-color:#10B981}.kpi--ok .kpi-value{color:#059669}' +
      '.kpi--due{border-top-color:#F59E0B}.kpi--due .kpi-value{color:#B45309}' +
      'table{width:100%;border-collapse:collapse;font-size:11.5px}' +
      'thead{display:table-header-group}tr{page-break-inside:avoid}' +
      'th{background:#0F172A;color:#fff;font-family:"Barlow",sans-serif;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:7px 9px}' +
      'th.num,td.num{text-align:right}' +
      'td{padding:7px 9px;border-bottom:1px solid #E2E8F0}' +
      'tbody tr:nth-child(even){background:#F8FAFC}' +
      'tr.total-row td{border-top:2px solid #0F172A;border-bottom:none;font-weight:700;background:#F1F5F9}' +
      '.badge{display:inline-block;font-size:9.5px;font-weight:700;padding:2.5px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.02em}' +
      '.badge--ok{background:#ECFDF5;color:#059669}.badge--red{background:#FEF2F2;color:#DC2626}.badge--warn{background:#FFFBEB;color:#B45309}' +
      '.note{margin-top:16px;font-size:10.5px;color:#64748B}' +
      'footer{margin-top:18px;padding-top:10px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:9.5px;color:#94A3B8}';

    var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Riepilogo quote — ' + _esc(_fullName(a)) + ' — Victor Volley</title>' +
      '<link rel="stylesheet" href="' + location.origin + '/css/fonts.css"><style>' + css + '</style></head><body><div class="doc">' +
      '<header class="letterhead">' +
        '<div class="letterhead-brand"><img class="letterhead-logo" src="' + location.origin + '/assets/logo.png" alt="">' +
          '<div><div class="letterhead-club">Victor Volley</div><div class="letterhead-sub">Area Atleti</div></div></div>' +
        '<div class="letterhead-meta"><div class="letterhead-doctype">Riepilogo quote</div><div>Generato il<strong>' + oggi + '</strong></div></div>' +
      '</header>' +
      '<div class="titleblock"><h1>' + _esc(_fullName(a)) + '</h1>' +
        (a.categoria ? '<span class="tag">' + _esc(a.categoria) + '</span>' : '') + '</div>' +
      '<div class="kpis">' +
        '<div class="kpi"><div class="kpi-label">Totale quote</div><div class="kpi-value">' + _eur(t.totale) + '</div></div>' +
        '<div class="kpi kpi--ok"><div class="kpi-label">Versato</div><div class="kpi-value">' + _eur(t.saldato) + '</div></div>' +
        '<div class="kpi kpi--due"><div class="kpi-label">Ancora da versare</div><div class="kpi-value">' + _eur(t.dovuto) + '</div></div>' +
      '</div>' +
      '<table><thead><tr><th>Descrizione</th><th>Scadenza</th><th class="num">Importo</th><th>Stato</th></tr></thead><tbody>' +
      rate.map(function (r) {
        return '<tr><td>' + _esc(r.descrizione || 'Quota') + '</td><td>' + (r.scadenza ? _esc(_fmtDate(r.scadenza)) : '—') + '</td>' +
          '<td class="num">' + _eur(r.importo) + '</td><td>' + stato(r) + '</td></tr>';
      }).join('') +
      '<tr class="total-row"><td colspan="2">Totale</td><td class="num">' + _eur(t.totale) + '</td><td></td></tr>' +
      '</tbody></table>' +
      '<p class="note">Riepilogo informativo aggiornato alla data di generazione. Non è una ricevuta: le ricevute dei pagamenti si scaricano dalla scheda «Ricevute di pagamento».</p>' +
      '<footer><span>Victor Volley &middot; Area Atleti</span><span>Documento generato automaticamente</span></footer>' +
      '</div></body></html>';

    var msg = document.getElementById('ratePdfMsg');
    msg.textContent = '';
    var w = window.open('', '_blank');
    if (!w) { msg.textContent = 'Il browser ha bloccato la finestra del PDF. Consenti i popup per questo sito e riprova.'; return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
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

    if (nw.length < 10) { say('La nuova password deve avere almeno 10 caratteri.'); return; }
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
    return /^https:\/\//i.test(url) ? url : '#';
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
