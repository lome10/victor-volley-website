/* Victor Volley — Admin / Budget: tessere (numerate 1–100, una persona per numero, 20 € l'una).
   Ogni tessera con un nome è assegnata; spuntata "Pagata" (con data) conta come entrata nel Riepilogo
   e nel Bilancio mensile. Una raccolta Firestore "tessere", un documento per stagione e numero
   (id = <seasonId>_<numero>). Dipende da window.Admin e window.Admin.budgetShared. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var DG = window.AdminActions;
  var esc = A.esc, confirm = A.confirm;
  var _logWrite = A.logWrite, _diff = A.diff;

  var TESSERA_PREZZO = 20;
  var TESSERE_TOTALI = 100;
  var CAMPI_LOG = ['nome', 'accessorio', 'pagata', 'dataPagamento'];

  function _oggi() { return new Date().toISOString().slice(0, 10); }
  function _eur(n) { return '€' + Math.round(n).toLocaleString('it-IT'); }
  function _tesseraId(n) { return B._currentSeasonId + '_' + n; }
  function _tessera(n) { return B._tessere.find(function (t) { return +t.numero === n; }) || null; }
  function _nomeOf(t) { return t ? String(t.nome || '').trim() : ''; }
  function _accessorioOf(t) { return t ? String(t.accessorio || '').trim() : ''; }   /* testo libero: cosa ha scelto la persona (es. cappellino) */

  /* Calcolo puro (nessun DOM), condiviso da Riepilogo, Bilancio e export PDF.
     B._tessere contiene solo la stagione corrente (vedi _loadSeasonScoped). */
  function _calcTessere() {
    var assegnate = B._tessere.filter(function (t) { return _nomeOf(t); });
    var pagate = assegnate.filter(function (t) { return t.pagata; });
    return {
      prezzo: TESSERA_PREZZO, totali: TESSERE_TOTALI,
      assegnate: assegnate.length, pagate: pagate.length,
      incassato: pagate.length * TESSERA_PREZZO,
      daIncassare: (assegnate.length - pagate.length) * TESSERA_PREZZO,
      righe: pagate.map(function (t) {
        return { numero: +t.numero, nome: _nomeOf(t), dataPagamento: t.dataPagamento || '', importo: TESSERA_PREZZO };
      }).sort(function (a, b) { return a.numero - b.numero; })
    };
  }

  /* ---- Rendering ---- */
  function _statCard(label, valore, cls) {
    return '<div class="dg-stat-card' + (cls ? ' dg-stat-card' + cls : '') + '"><div class="dg-stat-label">' + label + '</div>' +
      '<div class="dg-stat-value">' + valore + '</div></div>';
  }

  function _renderSommario() {
    var el = document.getElementById('tessereSommario');
    if (!el) return;
    var c = _calcTessere();
    el.innerHTML =
      _statCard('Assegnate', c.assegnate + ' / ' + c.totali, '') +
      _statCard('Pagate', String(c.pagate), '') +
      _statCard('Incassato', _eur(c.incassato), '') +
      _statCard('Da incassare', _eur(c.daIncassare), '--orange');
  }

  function _rowHtml(n) {
    var t = _tessera(n), nome = _nomeOf(t), pagata = !!(t && t.pagata && nome);
    return '<tr id="tesseraRow' + n + '">' +
      '<td><strong>' + n + '</strong></td>' +
      '<td><input type="text" id="tesseraNome' + n + '" class="dg-select-sm tessera-nome" maxlength="80" placeholder="Nome e cognome"' +
        ' value="' + esc(nome) + '" aria-label="Nome per la tessera ' + n + '" onchange="DG.tesseraSalvaNome(' + n + ', this.value)"></td>' +
      '<td><input type="text" id="tesseraAccessorio' + n + '" class="dg-select-sm tessera-accessorio" maxlength="80" placeholder="' + (nome ? 'es. cappellino' : '—') + '"' +
        ' value="' + esc(_accessorioOf(t)) + '"' + (nome ? '' : ' disabled') + ' aria-label="Accessorio scelto per la tessera ' + n + '" onchange="DG.tesseraSalvaAccessorio(' + n + ', this.value)"></td>' +
      '<td style="text-align:center"><input type="checkbox" id="tesseraPagata' + n + '"' + (pagata ? ' checked' : '') + (nome ? '' : ' disabled') +
        ' aria-label="Tessera ' + n + ' pagata" onchange="DG.tesseraTogglePagata(' + n + ', this.checked)"></td>' +
      '<td><input type="date" id="tesseraData' + n + '" class="dg-select-sm" value="' + esc(pagata ? (t.dataPagamento || '') : '') + '"' + (pagata ? '' : ' disabled') +
        ' aria-label="Data pagamento tessera ' + n + '" onchange="DG.tesseraSalvaData(' + n + ', this.value)"></td>' +
      '<td id="tesseraImporto' + n + '">' + _importoHtml(nome, pagata) + '</td>' +
      '</tr>';
  }

  function _importoHtml(nome, pagata) {
    if (pagata) return _eur(TESSERA_PREZZO);
    if (nome) return '<span class="dg-muted">' + _eur(TESSERA_PREZZO) + ' da incassare</span>';
    return '<span class="dg-muted">—</span>';
  }

  function _renderTessere() {
    var body = document.getElementById('tessereBody');
    if (!body) return;
    var rows = [];
    for (var n = 1; n <= TESSERE_TOTALI; n++) rows.push(_rowHtml(n));
    body.innerHTML = rows.join('');
    _renderSommario();
    _applicaFiltro();
  }

  /* Aggiorna una riga già nel DOM senza ridisegnarla (altrimenti si perde il focus passando di campo in campo). */
  function _syncRow(n) {
    var t = _tessera(n), nome = _nomeOf(t), pagata = !!(t && t.pagata && nome);
    var elNome = document.getElementById('tesseraNome' + n);
    if (!elNome) return;
    elNome.value = nome;
    var acc = document.getElementById('tesseraAccessorio' + n);
    acc.value = _accessorioOf(t); acc.disabled = !nome; acc.placeholder = nome ? 'es. cappellino' : '—';
    var chk = document.getElementById('tesseraPagata' + n);
    chk.checked = pagata; chk.disabled = !nome;
    var dt = document.getElementById('tesseraData' + n);
    dt.value = pagata ? (t.dataPagamento || '') : ''; dt.disabled = !pagata;
    document.getElementById('tesseraImporto' + n).innerHTML = _importoHtml(nome, pagata);
    _renderSommario();
  }

  function _applicaFiltro() {
    var input = document.getElementById('tessereFiltro');
    var q = input ? input.value.trim().toLowerCase() : '';
    for (var n = 1; n <= TESSERE_TOTALI; n++) {
      var row = document.getElementById('tesseraRow' + n);
      if (!row) continue;
      var t = _tessera(n), nome = _nomeOf(t).toLowerCase(), acc = _accessorioOf(t).toLowerCase();
      row.style.display = (!q || String(n) === q || nome.indexOf(q) !== -1 || acc.indexOf(q) !== -1) ? '' : 'none';
    }
  }

  /* ---- Salvataggio ---- */
  /* Applica lo stato nuovo alla tessera n: nome vuoto = tessera libera (documento eliminato). */
  function _applica(n, nuovo) {
    var old = _tessera(n);
    var id = _tesseraId(n);
    var label = 'Tessera n. ' + n + (nuovo.nome ? ' — ' + nuovo.nome : (old ? ' — ' + _nomeOf(old) : ''));

    if (!nuovo.nome) {
      if (!old) return Promise.resolve();
      return db.collection('tessere').doc(id).delete()
        .then(function () { return _logWrite('tessera', id, label, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { B._tessere = B._tessere.filter(function (t) { return +t.numero !== n; }); });
    }

    var data = { seasonId: B._currentSeasonId, numero: n, nome: nuovo.nome, accessorio: String(nuovo.accessorio || '').trim(), pagata: !!nuovo.pagata, dataPagamento: nuovo.pagata ? (nuovo.dataPagamento || _oggi()) : '' };
    return db.collection('tessere').doc(id).set(data)
      .then(function () {
        var salvata = Object.assign({ id: id }, data);
        if (old) { Object.assign(old, salvata); } else { B._tessere.push(salvata); }
        var prima = old ? { nome: old.nome, accessorio: old.accessorio || '', pagata: old.pagata, dataPagamento: old.dataPagamento } : {};
        return _logWrite('tessera', id, label, old ? 'update' : 'create', _diff(old ? prima : {}, data, old ? CAMPI_LOG : Object.keys(data)));
      });
  }

  function _dopoSalvataggio(n, promessa) {
    return promessa.catch(function (e) { alert('Errore: ' + e.message); }).then(function () { _syncRow(n); });
  }

  DG.tesseraSalvaNome = function (n, value) {
    var nome = String(value || '').trim();
    var old = _tessera(n);
    if (!nome && old && old.pagata) {
      confirm('Svuotando il nome la tessera ' + n + ' risulta libera e non pagata: i ' + _eur(TESSERA_PREZZO) + ' incassati escono dal bilancio. Continuare?', function () {
        _dopoSalvataggio(n, _applica(n, { nome: '' }));
      });
      _syncRow(n);   /* finché non si conferma, la riga resta com'è */
      return;
    }
    _dopoSalvataggio(n, _applica(n, { nome: nome, accessorio: _accessorioOf(old), pagata: !!(old && old.pagata), dataPagamento: old ? old.dataPagamento : '' }));
  };

  /* L'accessorio si scrive solo su una tessera già assegnata (con un nome). */
  DG.tesseraSalvaAccessorio = function (n, value) {
    var old = _tessera(n);
    if (!_nomeOf(old)) { _syncRow(n); return; }
    _dopoSalvataggio(n, _applica(n, { nome: _nomeOf(old), accessorio: value, pagata: !!old.pagata, dataPagamento: old.dataPagamento || '' }));
  };

  DG.tesseraTogglePagata = function (n, checked) {
    var old = _tessera(n);
    if (!_nomeOf(old)) { _syncRow(n); return; }
    _dopoSalvataggio(n, _applica(n, { nome: _nomeOf(old), accessorio: _accessorioOf(old), pagata: checked, dataPagamento: checked ? (old.dataPagamento || _oggi()) : '' }));
  };

  DG.tesseraSalvaData = function (n, value) {
    var old = _tessera(n);
    if (!old || !old.pagata) { _syncRow(n); return; }
    /* la data serve al Bilancio mensile: se la si cancella torna quella di oggi */
    _dopoSalvataggio(n, _applica(n, { nome: _nomeOf(old), accessorio: _accessorioOf(old), pagata: true, dataPagamento: value || _oggi() }));
  };

  document.addEventListener('DOMContentLoaded', function () {
    var filtro = document.getElementById('tessereFiltro');
    if (filtro) filtro.addEventListener('input', _applicaFiltro);
  });

  /* ---- Esportato per gli altri file del Budget ---- */
  B._calcTessere = _calcTessere;
  B._renderTessere = _renderTessere;

})();
