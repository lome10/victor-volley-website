/* Victor Volley — Admin / Budget: rette atleti e rate.
   Estratto da js/admin/budget.js. Dipende da window.Admin e window.Admin.budgetShared. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var DG = window.AdminActions;
  var esc = A.esc, cap = A.cap, confirm = A.confirm, goTo = A.goTo, val = A.val,
      _mapDoc = A.mapDoc, _diff = A.diff, _logWrite = A.logWrite,
      _openBudgetModal = A.openModal, _closeBudgetModal = A.closeModal,
      _daysDiff = A.daysDiff, _fmtDate = A.fmtDate, _fmtDateLong = A.fmtDateLong,
      _renderAtletiRows = A.renderAtletiRows, _renderRateAdmin = A.renderRateAdmin,
      _stagioneCorrenteNome = A.stagioneCorrenteNome, EDIT_ICON_SM = A.EDIT_ICON_SM;
  /* ---- RETTE ATLETI — per categoria, calcolate dagli atleti/rate assegnati ----
     N. atleti e Incassato non sono più campi salvati a mano su categorieAtleti:
     si derivano da B._atletiRette (chi) + B._rateAtleti (le singole rate, pagate o no). */
  function _atletaRettaById(id) { return B._atletiRette.find(function (a) { return a.id === id; }); }
  function _rateByAtleta(atletaId) { return B._rateAtleti.filter(function (r) { return r.atletaRettaId === atletaId; }); }

  function _calcRetteAtleti() {
    var perCategoria = {};
    B._atletiRette.forEach(function (a) {
      var key = a.categoriaAtletiId || '__none__';
      var rate = _rateByAtleta(a.id);
      var incassato = rate.filter(function (r) { return r.pagata; }).reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      perCategoria[key] = perCategoria[key] || { nAtleti: 0, incassato: 0 };
      perCategoria[key].nAtleti++;
      perCategoria[key].incassato += incassato;
    });
    var totIncassato = 0, totPrevisto = 0;
    var righe = B._categorieAtleti.map(function (c) {
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

  /* ---- RETTE ATLETI ---- */
  function _renderRette() {
    var body = document.getElementById('retteBody');
    var r = _calcRetteAtleti();
    body.innerHTML = r.righe.length ? r.righe.map(function (c) {
      var rettaCell = c.id
        ? '<input type="number" class="dg-table-input" value="' + c.rettaUnitaria + '" data-id="' + c.id + '" onchange="DG.saveRettaUnitaria(this)">'
        : '—';
      var azioniCell = c.id
        ? '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteCategoria(\'' + c.id + '\')">' + B._delIconSm() + '</button>'
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
    var c = B._categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    var old = { rettaUnitaria: c.rettaUnitaria || 0 };
    var v = +el.value || 0;
    c.rettaUnitaria = v;
    db.collection('categorieAtleti').doc(id).update({ rettaUnitaria: v })
      .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'update', _diff(old, { rettaUnitaria: v }, ['rettaUnitaria'])); })
      .then(function () { _renderRette(); B._renderStatCards(); B._renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteCategoria = function (id) {
    var c = B._categorieAtleti.find(function (x) { return x.id === id; });
    if (!c) return;
    if (B._atletiRette.some(function (a) { return a.categoriaAtletiId === id; })) {
      alert('Questa categoria ha ancora atleti assegnati. Sposta o elimina prima gli atleti dalla tabella qui sotto.');
      return;
    }
    confirm('Eliminare la categoria "' + c.nome + '"?', function () {
      db.collection('categorieAtleti').doc(id).delete()
        .then(function () { return _logWrite('categoriaAtleti', id, 'Categoria — ' + c.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          B._categorieAtleti = B._categorieAtleti.filter(function (x) { return x.id !== id; });
          _renderRette(); B._renderStatCards(); B._renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _categoriaAtletiOptionsHtml(selectedId) {
    return '<option value="">— Nessuna —</option>' + B._categorieAtleti.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
    }).join('');
  }

  function _renderAtletiRette() {
    var body = document.getElementById('atletiRetteBody');
    if (!body) return;
    if (!B._atletiRette.length) { body.innerHTML = '<tr><td colspan="6" class="dg-empty">Nessun atleta iscritto a questa stagione. Aggiungili dalla sezione Atleti.</td></tr>'; return; }
    var list = B._atletiRette.slice().sort(function (a, b) { return (a.cognome || '').localeCompare(b.cognome || ''); });
    body.innerHTML = list.map(function (a) {
      var cat = B._categorieAtleti.find(function (c) { return c.id === a.categoriaAtletiId; });
      var rate = _rateByAtleta(a.id);
      var pagate = rate.filter(function (r) { return r.pagata; });
      var incassato = pagate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      var totale = rate.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
      var collegato = !!a.atletaId;
      var celle = collegato
        ? '<td>' + esc(a.nome) + '</td><td>' + esc(a.cognome) + '</td><td>' + esc(cat ? cat.nome : '—') + '</td>'
        : '<td><input type="text" class="dg-table-input" value="' + esc(a.nome) + '" data-id="' + a.id + '" data-field="nome" onchange="DG.saveAtletaRettaField(this)"></td>' +
          '<td><input type="text" class="dg-table-input" value="' + esc(a.cognome) + '" data-id="' + a.id + '" data-field="cognome" onchange="DG.saveAtletaRettaField(this)"></td>' +
          '<td><select class="dg-table-input" data-id="' + a.id + '" data-field="categoriaAtletiId" onchange="DG.saveAtletaRettaField(this)">' + _categoriaAtletiOptionsHtml(a.categoriaAtletiId) + '</select></td>';
      var azioni = '<button class="dg-btn-ghost dg-btn-sm" onclick="DG.manageRateAtleta(\'' + a.id + '\')">Gestisci rate</button> ' +
        (collegato
          ? '<button class="dg-btn-ghost dg-btn-sm" title="Modifica anagrafica, categoria e accessi" onclick="DG.apriSchedaAtleta(\'' + esc(a.atletaId) + '\')">Scheda</button>'
          : '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteAtletaRetta(\'' + a.id + '\')">' + B._delIconSm() + '</button>');
      return '<tr>' + celle +
        '<td>' + pagate.length + '/' + rate.length + ' pagate' + (rate.length ? ' — €' + Math.round(totale).toLocaleString('it-IT') : '') + '</td>' +
        '<td>€' + Math.round(incassato).toLocaleString('it-IT') + '</td>' +
        '<td>' + azioni + '</td>' +
        '</tr>';
    }).join('');
  }

  DG.saveAtletaRettaField = function (el) {
    var id = el.dataset.id, field = el.dataset.field;
    var a = B._atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    if (field !== 'categoriaAtletiId' && !el.value.trim()) { alert('Il campo non può essere vuoto.'); el.value = a[field]; return; }
    var nv = field === 'categoriaAtletiId' ? el.value : el.value.trim();
    var old = {}; old[field] = a[field] || '';
    a[field] = nv;
    var patch = {}; patch[field] = nv;
    db.collection('atletiRette').doc(id).update(patch)
      .then(function () { return _logWrite('atletaRetta', id, 'Atleta — ' + a.cognome + ' ' + a.nome, 'update', _diff(old, patch, [field])); })
      .then(function () { _renderRette(); B._renderStatCards(); B._renderCharts(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteAtletaRetta = function (id) {
    var a = B._atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    confirm('Eliminare l\'atleta "' + a.nome + ' ' + a.cognome + '"? Verranno eliminate anche le sue rate.', function () {
      var rate = _rateByAtleta(id);
      var batch = db.batch();
      rate.forEach(function (r) { batch.delete(db.collection('rateAtleti').doc(r.id)); });
      batch.delete(db.collection('atletiRette').doc(id));
      batch.commit()
        .then(function () { return _logWrite('atletaRetta', id, 'Atleta — ' + a.cognome + ' ' + a.nome, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          B._atletiRette = B._atletiRette.filter(function (x) { return x.id !== id; });
          B._rateAtleti = B._rateAtleti.filter(function (x) { return x.atletaRettaId !== id; });
          _renderRette(); B._renderStatCards(); B._renderCharts();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  function _saveNewAtletaRetta() {
    var nome = val('atletaRettaNomeInput').trim();
    var cognome = val('atletaRettaCognomeInput').trim();
    if (!nome || !cognome) { alert('Inserisci nome e cognome dell\'atleta.'); return; }
    var data = {
      seasonId: B._currentSeasonId, nome: nome, cognome: cognome,
      categoriaAtletiId: val('atletaRettaCategoriaSelect')
    };
    var ref = db.collection('atletiRette').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      B._atletiRette.push(data);
      return _logWrite('atletaRetta', ref.id, 'Atleta — ' + cognome + ' ' + nome, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      _closeBudgetModal('newAtletaRettaModal');
      _renderRette(); B._renderStatCards(); B._renderCharts();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  /* ---- Rate atleti (modal) — stesso pattern delle tranche sponsor ---- */
  DG.manageRateAtleta = function (id) {
    var a = B._atletiRette.find(function (x) { return x.id === id; });
    if (!a) return;
    B._curAtletaRettaId = id;
    document.getElementById('rateAtletaNome').textContent = a.nome + ' ' + a.cognome;
    document.getElementById('rataAtletaImporto').value = '';
    document.getElementById('rataAtletaScadenza').value = '';
    document.getElementById('rataAtletaNote').value = '';
    _renderRateAtletaModal();
    _openBudgetModal('rateAtletaModal');
  };

  function _renderRateAtletaModal() {
    var el = document.getElementById('rateAtletaList');
    var rate = B._curAtletaRettaId ? _rateByAtleta(B._curAtletaRettaId) : [];
    rate = rate.slice().sort(function (a, b) { return (a.scadenza || '') < (b.scadenza || '') ? -1 : 1; });
    el.innerHTML = rate.length ? rate.map(function (r) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<div>' +
          '<div style="font-weight:700;font-size:13px">€' + Number(r.importo || 0).toLocaleString('it-IT') + (r.note ? ' — ' + esc(r.note) : '') + '</div>' +
          '<div style="font-size:12px;color:var(--dg-muted)">Scadenza: ' + (r.scadenza ? _fmtDate(r.scadenza) : '—') + '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
          '<label class="dg-check" style="font-size:12px"><input type="checkbox"' + (r.pagata ? ' checked' : '') + ' onchange="DG.toggleRataAtleta(\'' + r.id + '\', this.checked)"> Pagata</label>' +
          '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteRataAtleta(\'' + r.id + '\')">' + B._delIconSm() + '</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<p class="dg-muted">Nessuna rata inserita.</p>';
  }

  function _addRataAtleta() {
    if (!B._curAtletaRettaId) return;
    var importo = +val('rataAtletaImporto') || 0;
    var scadenza = val('rataAtletaScadenza');
    if (!importo) { alert('Inserisci un importo.'); return; }
    var a = B._atletiRette.find(function (x) { return x.id === B._curAtletaRettaId; });
    var data = {
      atletaRettaId: B._curAtletaRettaId, atletaId: (a && a.atletaId) || '', seasonId: B._currentSeasonId, stagione: _stagioneCorrenteNome(),
      importo: importo, scadenza: scadenza,
      note: val('rataAtletaNote').trim(), pagata: false, dataPagamento: null, createdAt: new Date().toISOString()
    };
    var ref = db.collection('rateAtleti').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      B._rateAtleti.push(data);
      return _logWrite('rataAtleti', ref.id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      document.getElementById('rataAtletaImporto').value = '';
      document.getElementById('rataAtletaScadenza').value = '';
      document.getElementById('rataAtletaNote').value = '';
      _renderRateAtletaModal();
      _renderRette(); B._renderStatCards(); B._renderCharts();
      _renderRateAdmin(); _renderAtletiRows();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  }

  DG.toggleRataAtleta = function (id, checked) {
    var r = B._rateAtleti.find(function (x) { return x.id === id; });
    if (!r) return;
    var old = { pagata: !!r.pagata };
    var patch = { pagata: checked, dataPagamento: checked ? new Date().toISOString().slice(0, 10) : null };
    r.pagata = checked;
    r.dataPagamento = patch.dataPagamento;
    var a = B._atletiRette.find(function (x) { return x.id === r.atletaRettaId; });
    db.collection('rateAtleti').doc(id).update(patch)
      .then(function () { return _logWrite('rataAtleti', id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'update', _diff(old, patch, ['pagata'])); })
      .then(function () { _renderRateAtletaModal(); _renderRette(); B._renderStatCards(); B._renderCharts(); B._renderBilancio(); _renderRateAdmin(); _renderAtletiRows(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteRataAtleta = function (id) {
    var r = B._rateAtleti.find(function (x) { return x.id === id; });
    if (!r) return;
    var a = B._atletiRette.find(function (x) { return x.id === r.atletaRettaId; });
    confirm(r.pagata ? 'Questa rata risulta pagata: eliminandola l\'incassato del bilancio diminuisce. Eliminarla?' : 'Eliminare questa rata?', function () {
      db.collection('rateAtleti').doc(id).delete()
        .then(function () { return _logWrite('rataAtleti', id, 'Rata — ' + (a ? a.cognome + ' ' + a.nome : ''), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          B._rateAtleti = B._rateAtleti.filter(function (x) { return x.id !== id; });
          _renderRateAtletaModal(); _renderRette(); B._renderStatCards(); B._renderCharts();
          _renderRateAdmin(); _renderAtletiRows();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- Esportato per gli altri file del Budget ---- */
  B._addRataAtleta = _addRataAtleta;
  B._atletaRettaById = _atletaRettaById;
  B._calcRetteAtleti = _calcRetteAtleti;
  B._renderRette = _renderRette;
  B._saveNewAtletaRetta = _saveNewAtletaRetta;

})();
