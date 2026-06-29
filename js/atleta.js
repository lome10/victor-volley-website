/* Victor Volley — Area Atleti */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    auth.onAuthStateChanged(function (user) {
      if (user) {
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

  });

  function _showLogin() {
    document.getElementById('loginScreen').classList.remove('is-hidden');
    document.getElementById('dashboard').classList.add('is-hidden');
  }

  function _loadDashboard(user) {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('dashboard').classList.remove('is-hidden');

    db.collection('atleti').doc(user.uid).get()
      .then(function (doc) {
        document.getElementById('loadingState').classList.add('is-hidden');
        if (!doc.exists || !doc.data()) {
          document.getElementById('noDataState').classList.remove('is-hidden');
          return;
        }
        var data = doc.data();
        document.getElementById('atletaContent').classList.remove('is-hidden');
        document.getElementById('atletaNome').textContent =
          (data.nome || '') + ' ' + (data.cognome || '');
        _renderCert(data);
        _renderRate(data);
        _renderModulo(data);
      })
      .catch(function (err) {
        document.getElementById('loadingState').textContent = 'Errore nel caricamento. Riprova.';
        console.error('[atleta]', err);
      });
  }

  function _renderCert(data) {
    var scadenza = data.certMedicoScadenza || '';
    document.getElementById('certScadenza').textContent = scadenza ? _fmtDate(scadenza) : 'Non inserita';

    var badge = document.getElementById('certBadge');
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

    if (data.certMedicoUrl) {
      document.getElementById('certPdfRow').classList.remove('is-hidden');
      document.getElementById('certPdfLink').href = _driveViewUrl(data.certMedicoUrl);
    }
  }

  function _renderRate(data) {
    var rate    = data.rate || [];
    var totale  = rate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
    var saldato = rate.filter(function (r) { return r.pagata; })
                      .reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
    var dovuto  = totale - saldato;

    if (totale > 0) {
      document.getElementById('rateSub').textContent =
        'Saldato: €' + saldato.toFixed(2) + '  ·  Dovuto: €' + dovuto.toFixed(2);
    }

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

  /* ---- Google Drive URL helper ---- */
  function _driveViewUrl(url) {
    if (!url) return '#';
    var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/view';
    return url;
  }

  /* ---- utils ---- */
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

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
