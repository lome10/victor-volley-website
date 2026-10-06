/* Victor Volley — Admin: Ricevute di pagamento.
   Registro cronologico, emissione (numero progressivo AAAA/NNNN assegnato da una transazione),
   annullamento, dati dell'ASD e CSV. Dipende da window.Admin e window.RicevutaDoc; espone window.Admin.ricevute.

   Modello dati
   - ricevute/{AAAA_NNNN}: ricevuta con una COPIA dei dati di pagatore, atleta e ASD al momento dell'emissione
     (non cambia se l'anagrafica cambia dopo). Non si cancella; si può solo annullare (vedi firestore.rules).
     Importo libero: una ricevuta può coprire più rate (rateIds) o nessuna (altri incassi, atletaId null).
   - contatoriRicevute/{AAAA}: { ultimo } — contatore per anno, letto e aggiornato nella stessa transazione
     che crea la ricevuta: niente buchi né doppioni, un numero annullato non viene riusato.
   - settings/asd: dati dell'ASD stampati sulle ricevute. */
(function () {
  'use strict';
  var A = window.Admin;
  var esc = A.esc, setTopbarBtn = A.setTopbarBtn;
  var _mapDoc = A.mapDoc, _logWrite = A.logWrite, _fmtDate = A.fmtDate;
  var openModal = A.openModal, closeModal = A.closeModal;
  var Doc = window.RicevutaDoc;

  var TIPI = ['Quota associativa', 'Quota corso / attività sportiva', 'Contributo liberale',
    'Tesseramento / assicurazione', 'Materiale / abbigliamento', 'Altro'];
  var MODALITA = ['Bonifico', 'POS / carta', 'Assegno non trasferibile', 'Contanti', 'Altro tracciabile'];
  /* Nessun codice fiscale preimpostato: lo inserisce la società dal pannello «Dati ASD». */
  var ASD_DEFAULT = {
    denominazione: 'ASD Victor Volley', codiceFiscale: '', sede: 'Via Indipendenza 48, Racale (LE)',
    affiliazione: 'FIPAV', codiceAffiliazione: '', rasd: true,
    luogo: 'Racale', presidente: 'Cuna Matteo'          /* stampati in fondo alla ricevuta: «Luogo e data» e nome sotto «Il Presidente» */
  };
  var BOLLO_ESENTE = 'Esente dall’imposta di bollo ai sensi dell’art. 27-bis, Tabella allegato B, D.P.R. 642/1972.';
  var SOGLIA_BOLLO = 77.47;

  var _ric = [], _asd = Object.assign({}, ASD_DEFAULT), _firma = '';   /* _firma: PNG del presidente (data URL), raccolta privata firme/presidente */
  var FIRMA_MAX_BYTES = 60 * 1024;
  var _loaded = false, _loading = null, _errore = false;
  var _atleti = null;
  var _filtro = { anno: String(new Date().getFullYear()), stato: '', q: '' };
  var _payOpts = [];
  var _annullaId = null;

  function _pad4(n) { return ('0000' + n).slice(-4); }
  function _oggi() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function _v(id) { return document.getElementById(id).value.trim(); }
  function _eur(n) { return Doc.eur(n); }

  /* ---------- caricamento ---------- */
  function ensureLoaded(cb) {
    if (_loaded) { cb(); return; }
    if (_loading) { _loading.push(cb); return; }
    _loading = [cb];
    Promise.all([
      db.collection('ricevute').get(),
      db.collection('settings').doc('asd').get(),
      db.collection('firme').doc('presidente').get().catch(function (e) { console.error('[ricevute] firma', e); return null; })
    ])
      .then(function (res) {
        _ric = res[0].docs.map(_mapDoc);
        if (res[1].exists) _asd = Object.assign({}, ASD_DEFAULT, res[1].data());
        if (res[2] && res[2].exists) _firma = res[2].data().img || '';
      })
      .catch(function (e) { console.error('[ricevute] load', e); _errore = true; })
      .then(function () {
        _loaded = true;
        var q = _loading; _loading = null;
        q.forEach(function (f) { f(); });
      });
  }

  function _loadAtleti(cb) {
    if (_atleti) { cb(); return; }
    Promise.all([db.collection('atleti').get(), db.collection('atletiDati').get()]).then(function (res) {
      var dati = {};
      res[1].forEach(function (d) { dati[d.id] = d.data(); });
      _atleti = res[0].docs.map(function (doc) { return Object.assign({}, dati[doc.id] || {}, doc.data(), { uid: doc.id }); });
      _atleti.sort(function (a, b) { return ((a.cognome || '') + (a.nome || '')).localeCompare((b.cognome || '') + (b.nome || '')); });
      cb();
    }).catch(function (e) { console.error('[ricevute] atleti', e); alert('Non riesco a caricare gli atleti. Riprova.'); });
  }

  function _asdCompleto() { return !!(_asd.denominazione && _asd.codiceFiscale); }

  function _coperta(rataId) {
    return _ric.find(function (r) { return r.stato === 'valida' && (r.rateIds || []).indexOf(rataId) !== -1; }) || null;
  }

  /* ---------- registro ---------- */
  function render() {
    setTopbarBtn('Genera ricevuta', function () { openEmit(null); });
    var bt = document.createElement('button');
    bt.className = 'btn-ghost';
    bt.textContent = 'Dati ASD';
    bt.addEventListener('click', openAsd);
    document.getElementById('topbarActions').appendChild(bt);
    var bp = document.createElement('button');
    bp.className = 'btn-ghost';
    bp.textContent = 'Anteprima di esempio';
    bp.title = 'Mostra una ricevuta di esempio con i vostri Dati ASD e la firma, senza emettere né salvare nulla';
    bp.addEventListener('click', anteprimaEsempio);
    document.getElementById('topbarActions').appendChild(bp);
    document.getElementById('ricBody').innerHTML =
      '<tr><td colspan="8" style="text-align:center;color:var(--a-muted);padding:20px">Caricamento…</td></tr>';
    ensureLoaded(_renderRegistro);
  }

  /* Ricevuta di esempio per controllare l'aspetto: usa i Dati ASD e la firma veri ma numero «ESEMPIO», importo e nomi finti.
     Non scrive nulla (nessun numero consumato, niente nel registro) e non lancia la stampa. */
  function anteprimaEsempio() {
    var w = window.RicevutaDoc.openBlank();   /* aperta subito nel clic: dopo l'attesa i popup verrebbero bloccati */
    if (!w) { A.avviso('Il browser ha bloccato la nuova finestra: consenti i popup per questo sito e riprova.'); return; }
    ensureLoaded(function () {
      var oggi = new Date().toISOString().slice(0, 10);
      var r = {
        numero: 'ESEMPIO', data: oggi, importo: 150, stato: 'valida', tipoIncasso: 'Quota associativa',
        causale: 'ESEMPIO — non è una ricevuta valida', modalita: 'Bonifico', riferimento: '', bollo: _bollo(150),
        pagatore: { nome: 'ROSSI MARIO (esempio)', cf: '', indirizzo: '', ruolo: 'Genitore / tutore' },
        atleta: { nome: 'Rossi Luca (esempio)', cf: '', dataNascita: '' },
        asd: { denominazione: _asd.denominazione, codiceFiscale: _asd.codiceFiscale, sede: _asd.sede || '',
          affiliazione: _asd.affiliazione || '', codiceAffiliazione: _asd.codiceAffiliazione || '', rasd: !!_asd.rasd,
          luogo: _asd.luogo || '', presidente: _asd.presidente || '', firma: _firma || '' }
      };
      w.document.open();
      w.document.write(window.RicevutaDoc.html(r, window.location.origin));
      w.document.close();
    });
  }

  function _filtrate() {
    var q = _filtro.q.toLowerCase();
    return _ric.filter(function (r) {
      if (_filtro.anno && String(r.anno) !== _filtro.anno) return false;
      if (_filtro.stato && r.stato !== _filtro.stato) return false;
      if (q) {
        var hay = [r.numero, (r.pagatore || {}).nome, (r.atleta || {}).nome, r.causale, r.tipoIncasso].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return (b.anno - a.anno) || (b.progressivo - a.progressivo); });
  }

  function _renderRegistro() {
    document.getElementById('ricAsdWarn').classList.toggle('is-hidden', _asdCompleto());
    var anni = {};
    anni[new Date().getFullYear()] = true;
    _ric.forEach(function (r) { anni[r.anno] = true; });
    var sel = document.getElementById('ricFiltroAnno');
    sel.innerHTML = '<option value="">Tutti gli anni</option>' + Object.keys(anni).sort().reverse()
      .map(function (y) { return '<option value="' + esc(y) + '"' + (_filtro.anno === y ? ' selected' : '') + '>' + esc(y) + '</option>'; }).join('');
    document.getElementById('ricFiltroStato').value = _filtro.stato;

    if (_errore) {
      document.getElementById('ricBody').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--a-red)">Errore nel caricamento delle ricevute.</td></tr>';
      return;
    }
    var rows = _filtrate();
    var valide = rows.filter(function (r) { return r.stato === 'valida'; });
    var tot = valide.reduce(function (s, r) { return s + (+r.importo || 0); }, 0);
    document.getElementById('ricSummary').textContent = valide.length + (valide.length === 1 ? ' ricevuta valida' : ' ricevute valide') +
      ' · totale ' + _eur(tot) + (rows.length > valide.length ? ' · ' + (rows.length - valide.length) + ' annullate' : '');

    if (!rows.length) {
      document.getElementById('ricBody').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--a-muted);padding:20px">Nessuna ricevuta con questi filtri.</td></tr>';
      return;
    }
    document.getElementById('ricBody').innerHTML = rows.map(function (r) {
      var ann = r.stato === 'annullata';
      return '<tr' + (ann ? ' style="opacity:.6"' : '') + '>' +
        '<td><strong>' + esc(r.numero) + '</strong></td>' +
        '<td>' + esc(_fmtDate(r.data)) + '</td>' +
        '<td>' + esc((r.pagatore || {}).nome || '') + '</td>' +
        '<td>' + esc((r.atleta || {}).nome || '—') + '</td>' +
        '<td>' + esc(r.tipoIncasso || '') + '<div class="table-sub">' + esc(r.causale || '') + '</div></td>' +
        '<td style="text-align:right;white-space:nowrap">' + esc(_eur(r.importo)) + '</td>' +
        '<td>' + (ann ? '<span class="chip chip--red">Annullata</span>' : '<span class="chip chip--green">Valida</span>') + '</td>' +
        '<td style="white-space:nowrap"><button type="button" class="btn-ghost btn-sm" data-ric-open="' + esc(r.id) + '">PDF</button> ' +
          (ann ? '' : '<button type="button" class="btn-ghost btn-sm" data-ric-annulla="' + esc(r.id) + '">Annulla</button>') + '</td>' +
        '</tr>';
    }).join('');
  }

  document.getElementById('ricBody').addEventListener('click', function (e) {
    var o = e.target.closest('[data-ric-open]'), n = e.target.closest('[data-ric-annulla]');
    if (o) openDoc(o.getAttribute('data-ric-open'));
    if (n) openAnnulla(n.getAttribute('data-ric-annulla'));
  });
  document.getElementById('ricFiltroAnno').addEventListener('change', function () { _filtro.anno = this.value; _renderRegistro(); });
  document.getElementById('ricFiltroStato').addEventListener('change', function () { _filtro.stato = this.value; _renderRegistro(); });
  document.getElementById('ricFiltroQ').addEventListener('input', function () { _filtro.q = this.value.trim(); _renderRegistro(); });

  function openDoc(id) {
    var r = _ric.find(function (x) { return x.id === id; });
    if (r && !Doc.open(r)) alert('Il browser ha bloccato la finestra della ricevuta. Consenti i popup per questo sito e riprova.');
  }

  /* ---------- CSV (registro filtrato) ---------- */
  document.getElementById('ricExportCsv').addEventListener('click', function () {
    var rows = _filtrate().slice().reverse();
    if (!rows.length) { alert('Nessuna ricevuta da esportare con questi filtri.'); return; }
    var head = ['Numero', 'Data', 'Pagatore', 'CF pagatore', 'Atleta', 'CF atleta', 'Tipo incasso', 'Causale', 'Importo',
      'Modalità', 'Riferimento', 'Bollo', 'Stato', 'Data annullamento', 'Motivo annullamento', 'Note'];
    function cell(v) {
      var s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var lines = [head.map(cell).join(';')].concat(rows.map(function (r) {
      var p = r.pagatore || {}, a = r.atleta || {};
      return [r.numero, _fmtDate(r.data), p.nome, p.cf, a.nome, a.cf, r.tipoIncasso, r.causale,
        (+r.importo || 0).toFixed(2).replace('.', ','), r.modalita, r.riferimento, r.bollo, r.stato,
        _fmtDate(r.dataAnnullamento), r.motivoAnnullamento, r.note].map(cell).join(';');
    }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = 'registro-ricevute' + (_filtro.anno ? '-' + _filtro.anno : '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  /* ---------- dati ASD ---------- */
  function openAsd() {
    ensureLoaded(function () {
      document.getElementById('ricAsdDenom').value = _asd.denominazione || '';
      document.getElementById('ricAsdCf').value = _asd.codiceFiscale || '';
      document.getElementById('ricAsdSede').value = _asd.sede || '';
      document.getElementById('ricAsdAff').value = _asd.affiliazione || '';
      document.getElementById('ricAsdCodAff').value = _asd.codiceAffiliazione || '';
      document.getElementById('ricAsdRasd').value = _asd.rasd ? 'si' : 'no';
      document.getElementById('ricAsdLuogo').value = _asd.luogo || '';
      document.getElementById('ricAsdPres').value = _asd.presidente || '';
      document.getElementById('ricAsdFirma').value = '';
      var prev = document.getElementById('ricAsdFirmaPrev');
      if (_firma) { prev.src = _firma; prev.classList.remove('is-hidden'); } else { prev.removeAttribute('src'); prev.classList.add('is-hidden'); }
      document.getElementById('ricAsdErr').textContent = '';
      openModal('ricAsdModal');
    });
  }
  function _closeAsd() { closeModal('ricAsdModal'); }
  document.getElementById('ricAsdClose').addEventListener('click', _closeAsd);
  document.getElementById('ricAsdCancel').addEventListener('click', _closeAsd);
  /* Legge l'immagine scelta: solo PNG, max 60 KB; risolve con il data URL o null se non è stata scelta. */
  function _leggiFirma() {
    var f = document.getElementById('ricAsdFirma').files[0];
    if (!f) return Promise.resolve(null);
    if (f.type !== 'image/png') return Promise.reject(new Error('La firma deve essere un file PNG.'));
    if (f.size > FIRMA_MAX_BYTES) return Promise.reject(new Error('La firma pesa troppo (massimo 60 KB).'));
    return new Promise(function (ok, ko) {
      var rd = new FileReader();
      rd.onload = function () { ok(String(rd.result)); };
      rd.onerror = function () { ko(new Error('Non riesco a leggere il file della firma.')); };
      rd.readAsDataURL(f);
    });
  }

  document.getElementById('ricAsdSave').addEventListener('click', function () {
    var err = document.getElementById('ricAsdErr');
    var nuovo = {
      denominazione: _v('ricAsdDenom'), codiceFiscale: _v('ricAsdCf').toUpperCase().replace(/\s+/g, ''),
      sede: _v('ricAsdSede'), affiliazione: _v('ricAsdAff'), codiceAffiliazione: _v('ricAsdCodAff'),
      rasd: document.getElementById('ricAsdRasd').value === 'si',
      luogo: _v('ricAsdLuogo'), presidente: _v('ricAsdPres')
    };
    if (!nuovo.denominazione) { err.textContent = 'Inserisci la denominazione.'; return; }
    if (!/^[A-Z0-9]{11,16}$/.test(nuovo.codiceFiscale)) { err.textContent = 'Il codice fiscale dell\'ASD deve avere 11 o 16 caratteri.'; return; }
    var btn = this, old = Object.assign({}, _asd), nuovaFirma = null;
    btn.disabled = true; err.textContent = '';
    _leggiFirma().then(function (img) {
      nuovaFirma = img;
      return img ? db.collection('firme').doc('presidente').set({ img: img, nome: nuovo.presidente, aggiornataIl: new Date().toISOString() }) : null;
    }).then(function () {
      if (nuovaFirma) _firma = nuovaFirma;
      return db.collection('settings').doc('asd').set(nuovo);
    }).then(function () {
      var diff = Object.keys(nuovo).filter(function (k) { return String(old[k]) !== String(nuovo[k]); })
        .map(function (k) { return { campo: k, prima: old[k] == null ? '' : old[k], dopo: nuovo[k] }; });
      _asd = Object.assign({}, nuovo);
      if (nuovaFirma) diff.push({ campo: 'firma presidente', prima: '', dopo: '(immagine aggiornata)' });
      return _logWrite('impostazione', 'asd', 'Dati ASD per le ricevute', 'update', diff);
    }).then(function () {
      _closeAsd();
      _renderRegistro();
    }).catch(function (e) { console.error('[ricevute] asd', e); err.textContent = e && /PNG|60 KB|file della firma/.test(e.message) ? e.message : 'Errore nel salvataggio. Riprova.'; })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- emissione ---------- */
  function _eta(iso) {
    if (!iso) return null;
    var n = new Date(iso + 'T00:00:00'), t = new Date();
    var e = t.getFullYear() - n.getFullYear();
    if (t.getMonth() < n.getMonth() || (t.getMonth() === n.getMonth() && t.getDate() < n.getDate())) e--;
    return e;
  }
  function _indirizzo(a) {
    var citta = [a.cap, a.citta].filter(Boolean).join(' ') + (a.provincia ? ' (' + a.provincia + ')' : '');
    return [a.indirizzo, citta.trim()].filter(Boolean).join(', ');
  }
  function _atletaByUid(uid) {
    return (_atleti || []).find(function (a) { return a.uid === uid; }) || null;
  }
  function _rateEmettibili(uid) {
    var st = (A.budget && A.budget.state) || {};
    return (st.rateAtleti || []).filter(function (r) { return r.atletaId === uid && r.pagata && !_coperta(r.id); })
      .sort(function (x, y) { return (x.dataPagamento || '').localeCompare(y.dataPagamento || ''); });
  }

  function _fillPagatori(uid) {
    var a = uid ? _atletaByUid(uid) : null;
    _payOpts = [];
    if (a) {
      var ind = _indirizzo(a), nome = ((a.cognome || '') + ' ' + (a.nome || '')).trim();
      if (a.tutore1Nome) _payOpts.push({ label: 'Genitore/tutore: ' + a.tutore1Nome, nome: a.tutore1Nome, cf: a.tutore1CodiceFiscale || '', ind: ind, ruolo: 'Genitore / tutore' });
      if (a.tutore2Nome) _payOpts.push({ label: 'Genitore/tutore: ' + a.tutore2Nome, nome: a.tutore2Nome, cf: '', ind: ind, ruolo: 'Genitore / tutore' });
      var eta = _eta(a.dataNascita);
      _payOpts.push({ label: 'L\'atleta stesso (' + nome + ')', nome: nome, cf: a.codiceFiscale || '', ind: ind,
        ruolo: eta !== null && eta >= 18 ? 'Pagatore (atleta maggiorenne)' : 'Pagatore' });
    }
    _payOpts.push({ label: 'Altro pagatore (inserisci i dati)', nome: '', cf: '', ind: '', ruolo: 'Pagatore' });
    var def = _payOpts.length - 1;                    /* nessun atleta: «Altro pagatore» */
    if (a) {
      var iAtleta = _payOpts.length - 2;              /* «L'atleta stesso» precede «Altro» */
      var haTutori = iAtleta > 0;
      def = (!haTutori || (_eta(a.dataNascita) || 0) >= 18) ? iAtleta : 0;   /* minorenne → primo tutore */
    }
    document.getElementById('ricPagSel').innerHTML = _payOpts.map(function (o, i) {
      return '<option value="' + i + '"' + (i === def ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
    _applyPagatore();
  }
  function _applyPagatore() {
    var o = _payOpts[+document.getElementById('ricPagSel').value] || {};
    document.getElementById('ricPagNome').value = o.nome || '';
    document.getElementById('ricPagCf').value = o.cf || '';
    document.getElementById('ricPagInd').value = o.ind || '';
  }

  function _renderRateBox(uid, preselect) {
    var box = document.getElementById('ricRateBox');
    var rate = uid ? _rateEmettibili(uid) : [];
    if (!uid) { box.innerHTML = '<p class="dg-card-sub">Nessun atleta selezionato: ricevuta per un altro tipo di incasso.</p>'; return; }
    if (!rate.length) { box.innerHTML = '<p class="dg-card-sub">Nessuna rata pagata senza ricevuta. Puoi comunque inserire importo e causale a mano.</p>'; return; }
    box.innerHTML = rate.map(function (r) {
      return '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:4px 0">' +
        '<input type="checkbox" class="ric-rata" value="' + esc(r.id) + '"' + (r.id === preselect ? ' checked' : '') + '> ' +
        '<span>' + esc(r.note || 'Quota') + ' — ' + esc(_eur(r.importo)) + (r.dataPagamento ? ' (pagata il ' + esc(_fmtDate(r.dataPagamento)) + ')' : '') + '</span></label>';
    }).join('');
    _syncDaRate();
  }
  function _ratesChecked() {
    return Array.prototype.slice.call(document.querySelectorAll('#ricRateBox .ric-rata:checked')).map(function (c) { return c.value; });
  }
  /* Con delle rate spuntate importo, causale e data si compilano da sole (restano modificabili). */
  function _syncDaRate() {
    var ids = _ratesChecked();
    if (!ids.length) return;
    var st = A.budget.state.rateAtleti;
    var sel = st.filter(function (r) { return ids.indexOf(r.id) !== -1; });
    document.getElementById('ricImporto').value = sel.reduce(function (s, r) { return s + (+r.importo || 0); }, 0).toFixed(2);
    document.getElementById('ricCausale').value = sel.map(function (r) { return r.note || 'Quota'; }).join(' + ');
    var d = sel.map(function (r) { return r.dataPagamento || ''; }).sort().pop();
    if (d) document.getElementById('ricData').value = d;
    document.getElementById('ricTipo').value = 'Quota corso / attività sportiva';
  }

  /* ctx: { atletaId, rataId } opzionale (si apre dalla scheda atleta). */
  function openEmit(ctx) {
    ensureLoaded(function () {
      if (!_asdCompleto()) {
        alert('Prima di emettere ricevute compila i «Dati ASD» (denominazione e codice fiscale).');
        openAsd();
        return;
      }
      _loadAtleti(function () {
        ctx = ctx || {};
        var selA = document.getElementById('ricAtleta');
        selA.innerHTML = '<option value="">— Nessun atleta (altro incasso) —</option>' + _atleti.map(function (a) {
          return '<option value="' + esc(a.uid) + '">' + esc(((a.cognome || '') + ' ' + (a.nome || '')).trim()) + (a.categoria ? ' — ' + esc(a.categoria) : '') + '</option>';
        }).join('');
        selA.value = ctx.atletaId || '';
        ['ricCausale', 'ricRif', 'ricNote', 'ricImporto'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.getElementById('ricData').value = _oggi();
        document.getElementById('ricTipo').value = TIPI[1];
        document.getElementById('ricModalita').value = MODALITA[0];
        document.getElementById('ricErr').textContent = '';
        _fillPagatori(ctx.atletaId || '');
        _renderRateBox(ctx.atletaId || '', ctx.rataId || '');
        openModal('ricModal');
      });
    });
  }
  function _closeEmit() { closeModal('ricModal'); }
  document.getElementById('ricModalClose').addEventListener('click', _closeEmit);
  document.getElementById('ricCancel').addEventListener('click', _closeEmit);
  document.getElementById('ricAtleta').addEventListener('change', function () {
    _fillPagatori(this.value);
    _renderRateBox(this.value, '');
  });
  document.getElementById('ricPagSel').addEventListener('change', _applyPagatore);
  document.getElementById('ricRateBox').addEventListener('change', function (e) {
    if (e.target.classList.contains('ric-rata')) _syncDaRate();
  });

  function _bollo(importo) {
    if (_asd.rasd) return BOLLO_ESENTE;
    return importo > SOGLIA_BOLLO
      ? 'Imposta di bollo di € 2,00 da assolvere (importo superiore a € 77,47): verificare con il commercialista.'
      : 'Imposta di bollo non dovuta (importo non superiore a € 77,47).';
  }

  /* Crea la ricevuta e incrementa il contatore nella stessa transazione. */
  function _crea(data) {
    var anno = +data.data.slice(0, 4);
    var cref = db.collection('contatoriRicevute').doc(String(anno));
    return db.runTransaction(function (tx) {
      return tx.get(cref).then(function (c) {
        var n = (c.exists ? (+c.data().ultimo || 0) : 0) + 1;
        var id = anno + '_' + _pad4(n);
        var rref = db.collection('ricevute').doc(id);
        return tx.get(rref).then(function (ex) {
          if (ex.exists) throw new Error('Il numero ' + anno + '/' + _pad4(n) + ' esiste già: il contatore non è allineato. Contatta chi gestisce il sito.');
          var doc = Object.assign({}, data, {
            anno: anno, progressivo: n, numero: anno + '/' + _pad4(n), stato: 'valida', createdAt: new Date().toISOString()
          });
          tx.set(cref, { ultimo: n });
          tx.set(rref, doc);
          return Object.assign({ id: id }, doc);
        });
      });
    });
  }

  document.getElementById('ricSave').addEventListener('click', function () {
    var err = document.getElementById('ricErr');
    var importo = Math.round((parseFloat(document.getElementById('ricImporto').value) || 0) * 100) / 100;
    var data = _v('ricData'), nome = _v('ricPagNome'), cf = _v('ricPagCf').toUpperCase().replace(/\s+/g, '');
    var causale = _v('ricCausale');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { err.textContent = 'Inserisci la data della ricevuta.'; return; }
    if (importo <= 0) { err.textContent = 'Inserisci un importo maggiore di zero.'; return; }
    if (!nome) { err.textContent = 'Inserisci il nome del pagatore.'; return; }
    if (cf && !/^[A-Z0-9]{16}$/.test(cf)) { err.textContent = 'Il codice fiscale del pagatore deve avere 16 caratteri (o lascialo vuoto).'; return; }
    if (!causale) { err.textContent = 'Inserisci la causale / periodo.'; return; }

    var uid = document.getElementById('ricAtleta').value;
    var a = uid ? _atletaByUid(uid) : null;
    var po = _payOpts[+document.getElementById('ricPagSel').value] || {};
    var doc = {
      data: data, importo: importo, tipoIncasso: document.getElementById('ricTipo').value, causale: causale,
      modalita: document.getElementById('ricModalita').value, riferimento: _v('ricRif'), note: _v('ricNote'),
      bollo: _bollo(importo),
      atletaId: a ? a.uid : null, rateIds: _ratesChecked(),
      pagatore: { nome: nome, cf: cf, indirizzo: _v('ricPagInd'), ruolo: po.ruolo || 'Pagatore' },
      atleta: a ? { nome: ((a.cognome || '') + ' ' + (a.nome || '')).trim(), cf: a.codiceFiscale || '', dataNascita: a.dataNascita || '' } : null,
      asd: { denominazione: _asd.denominazione, codiceFiscale: _asd.codiceFiscale, sede: _asd.sede || '',
        affiliazione: _asd.affiliazione || '', codiceAffiliazione: _asd.codiceAffiliazione || '', rasd: !!_asd.rasd,
        luogo: _asd.luogo || '', presidente: _asd.presidente || '', firma: _firma || '' },
      emessaDa: A.dirigenteNome() || ''
    };
    var btn = this, creata = null;
    /* la finestra del PDF si apre ora, nel gestore del clic: dopo l'attesa della transazione il browser la bloccherebbe */
    var w = Doc.openBlank();
    btn.disabled = true; err.textContent = '';
    _crea(doc).then(function (r) {
      creata = r;
      _ric.push(r);
      if (w) Doc.writeTo(w, r);
      else alert('Ricevuta ' + r.numero + ' generata. Il browser ha bloccato la finestra del PDF: consenti i popup per questo sito e usa «PDF» nel registro.');
      _filtro.anno = _filtro.anno && String(r.anno) !== _filtro.anno ? String(r.anno) : _filtro.anno;
      return _logWrite('ricevuta', r.id, 'Ricevuta ' + r.numero, 'create', [
        { campo: 'numero', prima: null, dopo: r.numero }, { campo: 'importo', prima: null, dopo: r.importo }]);
    }).then(function () {
      _closeEmit();
      _renderRegistro();
      if (A.renderRateAdmin) A.renderRateAdmin();
    }).catch(function (e) {
      console.error('[ricevute] crea', e);
      if (w && !creata) w.close();
      err.textContent = 'Errore: ' + (e && e.message ? e.message : 'impossibile emettere la ricevuta. Riprova.');
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- annullamento ---------- */
  function openAnnulla(id) {
    var r = _ric.find(function (x) { return x.id === id; });
    if (!r || r.stato !== 'valida') return;
    _annullaId = id;
    document.getElementById('ricAnnullaTesto').textContent = 'Annullare la ricevuta ' + r.numero + ' di ' + _eur(r.importo) +
      '? Il numero non verrà riutilizzato e la ricevuta resterà nel registro con il timbro «ANNULLATA». L\'operazione non si può annullare.';
    document.getElementById('ricAnnullaMotivo').value = '';
    document.getElementById('ricAnnullaErr').textContent = '';
    openModal('ricAnnullaModal');
  }
  function _closeAnnulla() { closeModal('ricAnnullaModal'); _annullaId = null; }
  document.getElementById('ricAnnullaClose').addEventListener('click', _closeAnnulla);
  document.getElementById('ricAnnullaCancel').addEventListener('click', _closeAnnulla);
  document.getElementById('ricAnnullaOk').addEventListener('click', function () {
    var motivo = _v('ricAnnullaMotivo'), err = document.getElementById('ricAnnullaErr');
    var r = _ric.find(function (x) { return x.id === _annullaId; });
    if (!r) return;
    if (motivo.length < 3) { err.textContent = 'Indica il motivo dell\'annullamento.'; return; }
    var patch = { stato: 'annullata', dataAnnullamento: _oggi(), motivoAnnullamento: motivo, annullataDa: A.dirigenteNome() || '' };
    var btn = this;
    btn.disabled = true;
    db.collection('ricevute').doc(r.id).update(patch).then(function () {
      Object.assign(r, patch);
      return _logWrite('ricevuta', r.id, 'Ricevuta ' + r.numero, 'update', [{ campo: 'stato', prima: 'valida', dopo: 'annullata' }, { campo: 'motivoAnnullamento', prima: '', dopo: motivo }]);
    }).then(function () {
      _closeAnnulla();
      _renderRegistro();
      if (A.renderRateAdmin) A.renderRateAdmin();
    }).catch(function (e) { console.error('[ricevute] annulla', e); err.textContent = 'Errore: impossibile annullare. Riprova.'; })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- selettori tipo / modalità ---------- */
  document.getElementById('ricTipo').innerHTML = TIPI.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
  document.getElementById('ricModalita').innerHTML = MODALITA.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');

  /* ---------- interfaccia verso admin.js e atleti.js ---------- */
  A.ricevute = {
    render: render,
    ensureLoaded: ensureLoaded,
    isLoaded: function () { return _loaded; },
    forRata: _coperta,
    openEmit: openEmit,
    openDoc: openDoc
  };
})();
