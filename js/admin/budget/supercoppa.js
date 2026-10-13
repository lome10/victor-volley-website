/* Victor Volley — Admin / Budget: Evento Supercoppa Bari (54 posti numerati, una persona per numero, 35 € l'uno).
   Ogni posto con un nome è assegnato; spuntato "Pagata" (con data) conta come entrata nel Riepilogo
   e nel Bilancio mensile. «Tesserato» dice se la persona è tesserata con la nostra società (solo informativo).
   Una raccolta Firestore "supercoppaBari", un documento per stagione e numero (id = <seasonId>_<numero>).
   Dipende da window.Admin e window.Admin.budgetShared. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var DG = window.AdminActions;
  var esc = A.esc, confirm = A.confirm;
  var _logWrite = A.logWrite, _diff = A.diff;

  var QUOTA_PREZZO = 35;
  var POSTI_TOTALI = 54;
  var CAMPI_LOG = ['nome', 'tesserato', 'note', 'pagata', 'dataPagamento'];

  function _oggi() { return new Date().toISOString().slice(0, 10); }
  function _eur(n) { return '€' + Math.round(n).toLocaleString('it-IT'); }
  function _quotaId(n) { return B._currentSeasonId + '_' + n; }
  function _quota(n) { return B._supercoppa.find(function (t) { return +t.numero === n; }) || null; }
  function _nomeOf(t) { return t ? String(t.nome || '').trim() : ''; }
  function _noteOf(t) { return t ? String(t.note || '').trim() : ''; }

  /* Calcolo puro (nessun DOM), condiviso da Riepilogo, Bilancio, Cassa e confronto stagioni.
     B._supercoppa contiene solo la stagione corrente (vedi _loadSeasonScoped). */
  function _calcSupercoppa() {
    var assegnate = B._supercoppa.filter(function (t) { return _nomeOf(t); });
    var pagate = assegnate.filter(function (t) { return t.pagata; });
    return {
      prezzo: QUOTA_PREZZO, totali: POSTI_TOTALI,
      assegnate: assegnate.length, pagate: pagate.length,
      tesserati: assegnate.filter(function (t) { return t.tesserato; }).length,
      incassato: pagate.length * QUOTA_PREZZO,
      daIncassare: (assegnate.length - pagate.length) * QUOTA_PREZZO,
      previsto: assegnate.length * QUOTA_PREZZO,
      righe: pagate.map(function (t) {
        return { numero: +t.numero, nome: _nomeOf(t), dataPagamento: t.dataPagamento || '', importo: QUOTA_PREZZO, note: _noteOf(t) };
      }).sort(function (a, b) { return a.numero - b.numero; })
    };
  }

  /* ---- Rendering ---- */
  function _statCard(label, valore, cls) {
    return '<div class="dg-stat-card' + (cls ? ' dg-stat-card' + cls : '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + valore + '</div></div>';
  }

  function _renderSommario() {
    var el = document.getElementById('supercoppaSommario');
    if (!el) return;
    var c = _calcSupercoppa();
    el.innerHTML =
      _statCard('Posti assegnati', c.assegnate + ' / ' + c.totali, '') +
      _statCard('Tesserati', c.tesserati + ' / ' + c.assegnate, '') +
      _statCard('Pagate', String(c.pagate), '') +
      _statCard('Incassato', _eur(c.incassato), '') +
      _statCard('Da incassare', _eur(c.daIncassare), '--orange');
  }

  function _importoHtml(nome, pagata) {
    if (pagata) return _eur(QUOTA_PREZZO);
    if (nome) return '<span class="dg-muted">' + _eur(QUOTA_PREZZO) + ' da incassare</span>';
    return '<span class="dg-muted">—</span>';
  }

  function _rowHtml(n) {
    var t = _quota(n), nome = _nomeOf(t), pagata = !!(t && t.pagata && nome);
    return '<tr id="supercoppaRow' + n + '">' +
      '<td><strong>' + n + '</strong></td>' +
      '<td><input type="text" id="supercoppaNome' + n + '" class="dg-select-sm tessera-nome" maxlength="80" placeholder="Nome e cognome"' +
        ' value="' + esc(nome) + '" aria-label="Nome per il posto ' + n + '" onchange="DG.supercoppaSalvaNome(' + n + ', this.value)"></td>' +
      '<td style="text-align:center"><input type="checkbox" id="supercoppaTesserato' + n + '"' + (t && t.tesserato && nome ? ' checked' : '') + (nome ? '' : ' disabled') +
        ' aria-label="Posto ' + n + ': tesserato nella nostra società" onchange="DG.supercoppaToggleTesserato(' + n + ', this.checked)"></td>' +
      '<td><input type="text" id="supercoppaNote' + n + '" class="dg-select-sm tessera-accessorio" maxlength="120" placeholder="' + (nome ? 'Note' : '—') + '"' +
        ' value="' + esc(_noteOf(t)) + '"' + (nome ? '' : ' disabled') + ' aria-label="Note per il posto ' + n + '" onchange="DG.supercoppaSalvaNote(' + n + ', this.value)"></td>' +
      '<td style="text-align:center"><input type="checkbox" id="supercoppaPagata' + n + '"' + (pagata ? ' checked' : '') + (nome ? '' : ' disabled') +
        ' aria-label="Posto ' + n + ' pagato" onchange="DG.supercoppaTogglePagata(' + n + ', this.checked)"></td>' +
      '<td><input type="date" id="supercoppaData' + n + '" class="dg-select-sm" value="' + esc(pagata ? (t.dataPagamento || '') : '') + '"' + (pagata ? '' : ' disabled') +
        ' aria-label="Data pagamento posto ' + n + '" onchange="DG.supercoppaSalvaData(' + n + ', this.value)"></td>' +
      '<td id="supercoppaImporto' + n + '">' + _importoHtml(nome, pagata) + '</td>' +
      '</tr>';
  }

  function _renderSupercoppa() {
    var body = document.getElementById('supercoppaBody');
    if (!body) return;
    var rows = [];
    for (var n = 1; n <= POSTI_TOTALI; n++) rows.push(_rowHtml(n));
    body.innerHTML = rows.join('');
    _renderSommario();
    _applicaFiltro();
  }

  /* Aggiorna una riga già nel DOM senza ridisegnarla (altrimenti si perde il focus passando di campo in campo). */
  function _syncRow(n) {
    var t = _quota(n), nome = _nomeOf(t), pagata = !!(t && t.pagata && nome);
    var elNome = document.getElementById('supercoppaNome' + n);
    if (!elNome) return;
    elNome.value = nome;
    var tes = document.getElementById('supercoppaTesserato' + n);
    tes.checked = !!(t && t.tesserato && nome); tes.disabled = !nome;
    var note = document.getElementById('supercoppaNote' + n);
    note.value = _noteOf(t); note.disabled = !nome; note.placeholder = nome ? 'Note' : '—';
    var chk = document.getElementById('supercoppaPagata' + n);
    chk.checked = pagata; chk.disabled = !nome;
    var dt = document.getElementById('supercoppaData' + n);
    dt.value = pagata ? (t.dataPagamento || '') : ''; dt.disabled = !pagata;
    document.getElementById('supercoppaImporto' + n).innerHTML = _importoHtml(nome, pagata);
    _renderSommario();
  }

  function _applicaFiltro() {
    var input = document.getElementById('supercoppaFiltro');
    var q = input ? input.value.trim().toLowerCase() : '';
    for (var n = 1; n <= POSTI_TOTALI; n++) {
      var row = document.getElementById('supercoppaRow' + n);
      if (!row) continue;
      var t = _quota(n), nome = _nomeOf(t).toLowerCase(), note = _noteOf(t).toLowerCase();
      row.style.display = (!q || String(n) === q || nome.indexOf(q) !== -1 || note.indexOf(q) !== -1) ? '' : 'none';
    }
  }

  /* ---- Salvataggio ---- */
  /* Applica lo stato nuovo al posto n: nome vuoto = posto libero (documento eliminato). */
  function _applica(n, nuovo) {
    var old = _quota(n);
    var id = _quotaId(n);
    var label = 'Supercoppa Bari, posto ' + n + (nuovo.nome ? ' — ' + nuovo.nome : (old ? ' — ' + _nomeOf(old) : ''));

    if (!nuovo.nome) {
      if (!old) return Promise.resolve();
      return db.collection('supercoppaBari').doc(id).delete()
        .then(function () { return _logWrite('supercoppa', id, label, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { B._supercoppa = B._supercoppa.filter(function (t) { return +t.numero !== n; }); });
    }

    var data = {
      seasonId: B._currentSeasonId, numero: n, nome: nuovo.nome, tesserato: !!nuovo.tesserato, note: String(nuovo.note || '').trim(),
      pagata: !!nuovo.pagata, dataPagamento: nuovo.pagata ? (nuovo.dataPagamento || _oggi()) : ''
    };
    return db.collection('supercoppaBari').doc(id).set(data)
      .then(function () {
        var salvata = Object.assign({ id: id }, data);
        if (old) { Object.assign(old, salvata); } else { B._supercoppa.push(salvata); }
        var prima = old ? { nome: old.nome, tesserato: !!old.tesserato, note: old.note || '', pagata: old.pagata, dataPagamento: old.dataPagamento } : {};
        return _logWrite('supercoppa', id, label, old ? 'update' : 'create', _diff(old ? prima : {}, data, old ? CAMPI_LOG : Object.keys(data)));
      });
  }

  function _dopoSalvataggio(n, promessa) {
    return promessa.catch(function (e) { alert('Errore: ' + e.message); }).then(function () { _syncRow(n); });
  }

  /* Stato attuale del posto n come oggetto da modificare campo per campo. */
  function _stato(n) {
    var old = _quota(n);
    return { nome: _nomeOf(old), tesserato: !!(old && old.tesserato), note: _noteOf(old), pagata: !!(old && old.pagata), dataPagamento: old ? (old.dataPagamento || '') : '' };
  }

  DG.supercoppaSalvaNome = function (n, value) {
    var nome = String(value || '').trim();
    var old = _quota(n);
    if (!nome && old && old.pagata) {
      confirm('Svuotando il nome il posto ' + n + ' risulta libero e non pagato: i ' + _eur(QUOTA_PREZZO) + ' incassati escono dal bilancio. Continuare?', function () {
        _dopoSalvataggio(n, _applica(n, { nome: '' }));
      });
      _syncRow(n);   /* finché non si conferma, la riga resta com'è */
      return;
    }
    var s = _stato(n); s.nome = nome;
    _dopoSalvataggio(n, _applica(n, s));
  };

  /* Tesserato, note e pagamento si scrivono solo su un posto già assegnato (con un nome). */
  DG.supercoppaToggleTesserato = function (n, checked) {
    var s = _stato(n);
    if (!s.nome) { _syncRow(n); return; }
    s.tesserato = checked;
    _dopoSalvataggio(n, _applica(n, s));
  };

  DG.supercoppaSalvaNote = function (n, value) {
    var s = _stato(n);
    if (!s.nome) { _syncRow(n); return; }
    s.note = value;
    _dopoSalvataggio(n, _applica(n, s));
  };

  DG.supercoppaTogglePagata = function (n, checked) {
    var s = _stato(n);
    if (!s.nome) { _syncRow(n); return; }
    s.pagata = checked; s.dataPagamento = checked ? (s.dataPagamento || _oggi()) : '';
    _dopoSalvataggio(n, _applica(n, s));
  };

  DG.supercoppaSalvaData = function (n, value) {
    var s = _stato(n);
    if (!s.nome || !s.pagata) { _syncRow(n); return; }
    /* la data serve al Bilancio mensile: se la si cancella torna quella di oggi */
    s.dataPagamento = value || _oggi();
    _dopoSalvataggio(n, _applica(n, s));
  };

  document.addEventListener('DOMContentLoaded', function () {
    var filtro = document.getElementById('supercoppaFiltro');
    if (filtro) filtro.addEventListener('input', _applicaFiltro);
  });

  /* ---- Esportato per gli altri file del Budget ---- */
  B._calcSupercoppa = _calcSupercoppa;
  B._renderSupercoppa = _renderSupercoppa;

})();
