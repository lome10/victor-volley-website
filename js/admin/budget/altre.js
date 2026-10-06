/* Victor Volley — Admin / Budget: altre entrate (contributi, eventi, donazioni, tornei…), tutto ciò che non è
   sponsor, rette o tessere. Una raccolta Firestore "altreEntrate", un documento per voce, per stagione.
   Conta come incassata solo se «Incassata» (con data d'incasso); se no è «da incassare» alla data prevista.
   Dipende da window.Admin e window.Admin.budgetShared. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var DG = window.AdminActions;
  var esc = A.esc, confirm = A.confirm;
  var _logWrite = A.logWrite, _diff = A.diff;

  var TIPI = ['Contributo', 'Evento', 'Donazione', 'Torneo', 'Altro'];
  var CAMPI_LOG = ['descrizione', 'tipo', 'importo', 'data', 'pagata', 'dataIncasso', 'note'];
  var _editId = null;

  function _oggi() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function _eur(n) { return '€' + Math.round(n).toLocaleString('it-IT'); }
  function _voce(id) { return (B._altreEntrate || []).filter(function (x) { return x.id === id; })[0] || null; }
  function _label(v) { return 'Altra entrata — ' + (v.descrizione || '—'); }

  /* Calcolo puro (nessun DOM), condiviso da Panoramica, Bilancio e «Da fare».
     B._altreEntrate contiene solo la stagione corrente (vedi _loadSeasonScoped). */
  function _calcAltreEntrate() {
    var l = B._altreEntrate || [], inc = 0, da = 0;
    l.forEach(function (v) { if (v.pagata) inc += +v.importo || 0; else da += +v.importo || 0; });
    return { righe: l, n: l.length, incassato: inc, daIncassare: da, previsto: inc + da };
  }

  /* ---- Rendering ---- */
  function _kpi(label, valore, sub, cls) {
    return '<div class="sp-kpi' + (cls ? ' sp-kpi--' + cls : '') + '"><span class="sp-kpi-l">' + label + '</span><span class="sp-kpi-v">' + valore + '</span><span class="sp-kpi-s">' + sub + '</span></div>';
  }
  function _stato(v, oggi) {
    if (v.pagata) return '<span class="dg-badge dg-badge--chiuso">Incassata</span>';
    if (v.data && v.data < oggi) return '<span class="dg-badge dg-badge--ritardo">In ritardo</span>';
    return '<span class="dg-badge dg-badge--prospect">Da incassare</span>';
  }
  function _dataTxt(d) { return d ? A.fmtDate(d) : '—'; }

  function _render() {
    var body = document.getElementById('altreBody');
    if (!body) return;
    var c = _calcAltreEntrate(), oggi = _oggi();
    document.getElementById('altreKpis').innerHTML =
      _kpi('Incassato', _eur(c.incassato), c.righe.filter(function (v) { return v.pagata; }).length + ' voci incassate', '') +
      _kpi('Da incassare', _eur(c.daIncassare), c.righe.filter(function (v) { return !v.pagata; }).length + ' voci in attesa', c.daIncassare ? 'warn' : '') +
      _kpi('Totale previsto', _eur(c.previsto), c.n + (c.n === 1 ? ' voce' : ' voci') + ' in questa stagione', '');
    var righe = c.righe.slice().sort(function (a, b) { return ((a.pagata ? a.dataIncasso : a.data) || '9999') < ((b.pagata ? b.dataIncasso : b.data) || '9999') ? -1 : 1; });
    if (!righe.length) { body.innerHTML = '<tr><td colspan="6" class="dg-empty">Nessuna altra entrata in questa stagione. Aggiungi un contributo, un incasso da un evento o una donazione con «Nuova entrata».</td></tr>'; return; }
    body.innerHTML = righe.map(function (v) {
      return '<tr>' +
        '<td>' + esc(v.descrizione || '—') + (v.note ? '<div class="dg-muted" style="font-size:12px">' + esc(v.note) + '</div>' : '') + '</td>' +
        '<td>' + esc(v.tipo || '—') + '</td>' +
        '<td>' + _eur(+v.importo || 0) + '</td>' +
        '<td>' + (v.pagata ? _dataTxt(v.dataIncasso) + ' <span class="dg-muted">(incasso)</span>' : _dataTxt(v.data)) + '</td>' +
        '<td>' + _stato(v, oggi) + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button type="button" class="dg-btn-ghost dg-btn-sm" onclick="DG.altraTogglePagata(\'' + v.id + '\')">' + (v.pagata ? 'Annulla incasso' : 'Segna incassata') + '</button> ' +
          '<button type="button" class="dg-btn-ghost dg-btn-sm" onclick="DG.altraModifica(\'' + v.id + '\')" aria-label="Modifica">' + (A.EDIT_ICON_SM || 'Modifica') + '</button> ' +
          '<button type="button" class="dg-btn-ghost dg-btn-sm" onclick="DG.altraElimina(\'' + v.id + '\')" aria-label="Elimina">' + B._delIconSm() + '</button>' +
        '</td></tr>';
    }).join('');
  }

  /* ---- Modulo di inserimento / modifica ---- */
  function _el(id) { return document.getElementById(id); }
  function _apriForm(v) {
    _editId = v ? v.id : null;
    _el('altreTipo').innerHTML = TIPI.map(function (t) { return '<option>' + t + '</option>'; }).join('');
    _el('altreFormTitolo').textContent = v ? 'Modifica entrata' : 'Nuova entrata';
    _el('altreDescr').value = v ? (v.descrizione || '') : '';
    _el('altreTipo').value = v && TIPI.indexOf(v.tipo) !== -1 ? v.tipo : 'Altro';
    _el('altreImporto').value = v ? (+v.importo || 0) : '';
    _el('altreData').value = v ? (v.data || '') : '';
    _el('altrePagata').checked = !!(v && v.pagata);
    _el('altreDataIncasso').value = v && v.pagata ? (v.dataIncasso || _oggi()) : '';
    _el('altreNote').value = v ? (v.note || '') : '';
    _syncIncasso();
    _el('altreForm').classList.remove('is-hidden');
    _el('altreDescr').focus();
  }
  function _chiudiForm() { _editId = null; _el('altreForm').classList.add('is-hidden'); }
  function _syncIncasso() {
    var p = _el('altrePagata').checked;
    _el('altreIncassoWrap').classList.toggle('is-hidden', !p);
    if (p && !_el('altreDataIncasso').value) _el('altreDataIncasso').value = _oggi();
  }

  function _salva() {
    var descr = _el('altreDescr').value.trim(), importo = parseFloat(_el('altreImporto').value);
    if (!descr) { A.avviso('Scrivi una descrizione (per esempio «Contributo del Comune»).', 'avviso'); return; }
    if (!(importo > 0)) { A.avviso('Inserisci un importo maggiore di zero.', 'avviso'); return; }
    var pagata = _el('altrePagata').checked;
    var data = {
      seasonId: B._currentSeasonId, descrizione: descr, tipo: _el('altreTipo').value, importo: importo,
      data: _el('altreData').value || '', pagata: pagata, dataIncasso: pagata ? (_el('altreDataIncasso').value || _oggi()) : '',
      note: _el('altreNote').value.trim()
    };
    var old = _editId ? _voce(_editId) : null;
    var ref = old ? db.collection('altreEntrate').doc(old.id) : db.collection('altreEntrate').doc();
    if (!old) data.createdAt = new Date().toISOString();
    var prima = old ? CAMPI_LOG.reduce(function (o, k) { o[k] = old[k]; return o; }, {}) : {};
    (old ? ref.update(data) : ref.set(data)).then(function () {
      if (old) { Object.assign(old, data); } else { B._altreEntrate.push(Object.assign({ id: ref.id }, data)); }
      _chiudiForm(); _render();
      return _logWrite('altraEntrata', ref.id, _label(data), old ? 'update' : 'create', _diff(prima, data, old ? CAMPI_LOG : Object.keys(data)));
    }).catch(function (e) { A.avviso('Non sono riuscito a salvare: ' + e.message, 'errore'); });
  }

  DG.altraModifica = function (id) { var v = _voce(id); if (v) _apriForm(v); };

  DG.altraTogglePagata = function (id) {
    var v = _voce(id); if (!v) return;
    var nuovo = { pagata: !v.pagata, dataIncasso: v.pagata ? '' : _oggi() };
    db.collection('altreEntrate').doc(id).update(nuovo).then(function () {
      var prima = { pagata: v.pagata, dataIncasso: v.dataIncasso || '' };
      Object.assign(v, nuovo); _render();
      return _logWrite('altraEntrata', id, _label(v), 'update', _diff(prima, nuovo, ['pagata', 'dataIncasso']));
    }).catch(function (e) { A.avviso('Non sono riuscito a salvare: ' + e.message, 'errore'); });
  };

  DG.altraElimina = function (id) {
    var v = _voce(id); if (!v) return;
    confirm('Eliminare «' + (v.descrizione || '') + '» (' + _eur(+v.importo || 0) + ')?' + (v.pagata ? ' Era già incassata: esce dal bilancio.' : ''), function () {
      db.collection('altreEntrate').doc(id).delete().then(function () {
        B._altreEntrate = B._altreEntrate.filter(function (x) { return x.id !== id; });
        if (_editId === id) _chiudiForm();
        _render();
        return _logWrite('altraEntrata', id, _label(v), 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]);
      }).catch(function (e) { A.avviso('Non sono riuscito a eliminare: ' + e.message, 'errore'); });
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    var nuova = _el('newAltraBtn');
    if (!nuova) return;
    nuova.addEventListener('click', function () { _apriForm(null); });
    _el('altreCancel').addEventListener('click', _chiudiForm);
    _el('altreSave').addEventListener('click', _salva);
    _el('altrePagata').addEventListener('change', _syncIncasso);
  });

  /* ---- Esportato per gli altri file del Budget ---- */
  B._calcAltreEntrate = _calcAltreEntrate;
  B._renderAltreEntrate = _render;
})();
