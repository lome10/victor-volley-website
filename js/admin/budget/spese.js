/* Victor Volley — Admin / Budget: sottospese, spese, forecasting e categorie di spesa.
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
  /* ---- SOTTOSPESE — dettaglio reale dentro una singola voce di spesa ----
     Due tipi, stesso oggetto: "spesa" (default, storico) e "credito" — per gli
     eventi che generano anche un incasso (es. biglietti, quote di partecipazione),
     da non confondere con gli incassi già tracciati altrove (sponsor, rette): qui
     è solo un dettaglio informativo dentro la voce, non tocca Sostenuto/Preventivato
     né i totali di Bilancio, per evitare di contare lo stesso incasso due volte. */
  function _sottospeseOf(voceId) {
    return B._sottospese.filter(function (x) { return x.voceSpesaId === voceId; });
  }
  function _isSottospesaCredito(s) { return s.tipo === 'credito'; }
  function _sottospeseSpesaOf(voceId) {
    return _sottospeseOf(voceId).filter(function (x) { return !_isSottospesaCredito(x); });
  }
  function _sottospeseCreditoOf(voceId) {
    return _sottospeseOf(voceId).filter(_isSottospesaCredito);
  }
  /* Ogni sottospesa ha due importi: `importoPreventivato` (quanto era previsto)
     e `importo` (quanto è stato pagato/incassato davvero — nome storico del campo,
     invariato così le sottospese già inserite restano "pagate"). */
  function _sommaSottospese(voceId) {
    return _sottospeseSpesaOf(voceId).reduce(function (s, x) { return s + (+x.importo || 0); }, 0);
  }
  function _sommaSottospesePreventivate(voceId) {
    return _sottospeseSpesaOf(voceId).reduce(function (s, x) { return s + (+x.importoPreventivato || 0); }, 0);
  }
  function _sommaSottospeseIncassato(voceId) {
    return _sottospeseCreditoOf(voceId).reduce(function (s, x) { return s + (+x.importo || 0); }, 0);
  }
  function _sommaSottospeseIncassoPrevisto(voceId) {
    return _sottospeseCreditoOf(voceId).reduce(function (s, x) { return s + (+x.importoPreventivato || 0); }, 0);
  }
  /* Il Preventivato della voce segue le sottospese di spesa solo se almeno una ne ha uno
     (i crediti non c'entrano: tracciare un incasso previsto non deve azzerare il budget). */
  function _voceHaPreventivatoDaSottospese(voceId) {
    return _sottospeseSpesaOf(voceId).some(function (x) { return (+x.importoPreventivato || 0) > 0; });
  }
  /* Stato di una sottospesa, ricavato dai due importi — vocabolario diverso per i crediti. */
  function _statoSottospesa(s) {
    var prev = +s.importoPreventivato || 0, pagato = +s.importo || 0;
    var credito = _isSottospesaCredito(s);
    if (pagato <= 0) return credito ? { key: 'da_incassare', label: 'Da incassare', badge: 'in_trattativa' } : { key: 'da_pagare', label: 'Da pagare', badge: 'in_trattativa' };
    if (prev > 0 && pagato < prev) return { key: 'parziale', label: 'Parziale', badge: 'contattato' };
    return credito ? { key: 'incassato', label: 'Incassato', badge: 'chiuso' } : { key: 'pagata', label: 'Pagata', badge: 'chiuso' };
  }
  /* Finché una voce ha almeno una sottospesa DI SPESA, il suo "Sostenuto" è la somma dei
     pagati e non è più modificabile a mano (i crediti non contano: vedi nota sopra). Lo
     stesso vale per il "Preventivato", ma solo se almeno una sottospesa di spesa ha un
     importo preventivato (altrimenti resta manuale, come per le voci create prima di
     questa distinzione). Se le sottospese di spesa vengono azzerate, i campi tornano
     modificabili mantenendo l'ultimo valore noto. */
  function _syncVoceDaSottospese(voceId) {
    var v = B._vociSpesa.find(function (x) { return x.id === voceId; });
    if (!v) return Promise.resolve();
    if (!_sottospeseSpesaOf(voceId).length) return Promise.resolve();
    var patch = {}, old = {}, fields = [];
    var sostenuto = _sommaSottospese(voceId);
    if (+v.importoSostenuto !== sostenuto) {
      old.importoSostenuto = v.importoSostenuto || 0; patch.importoSostenuto = sostenuto; fields.push('importoSostenuto');
    }
    if (_voceHaPreventivatoDaSottospese(voceId)) {
      var preventivato = _sommaSottospesePreventivate(voceId);
      if (+v.importoPreventivato !== preventivato) {
        old.importoPreventivato = v.importoPreventivato || 0; patch.importoPreventivato = preventivato; fields.push('importoPreventivato');
      }
    }
    if (!fields.length) return Promise.resolve();
    Object.assign(v, patch);
    return db.collection('vociSpesa').doc(voceId).update(patch)
      .then(function () { return _logWrite('voceSpesa', voceId, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, fields)); })
      .then(function () { return _syncSpesaIva(v); });
  }

  function _loadAuditLog() {
    return db.collection('auditLog').orderBy('timestamp', 'desc').limit(300).get().then(function (snap) {
      A.setAuditLog(snap.docs.map(_mapDoc));
    }).catch(function (err) {
      console.error('[budget] log', err);
    });
  }

  /* ---- SPESE ---- */
  function _categoriaSpesaById(id) { return B._categorieSpesa.find(function (c) { return c.id === id; }); }

  function _categorieSpesaOptionsHtml(selectedId) {
    return '<option value="">— Nessuna —</option>' + B._categorieSpesa.map(function (c) {
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
    B._vociSpesa.forEach(function (v) {
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
    return B._budgetStatCard('Preventivato', r.totPreventivato, '') +
      B._budgetStatCard('Sostenuto', r.totSostenuto, '') +
      B._budgetStatCard('Scostamento dal preventivo', r.scostamento, r.scostamento > 0 ? '--red' : '--green') +
      B._budgetStatCard('Preventivato + margine 10%', r.totPreventivatoConBuffer, '--orange');
  }

  function _speseForecastTableHtml(r) {
    if (!r.righe.length) return '<p class="dg-muted">Nessuna voce di spesa per questa stagione.</p>';
    var rows = r.righe.map(function (x) {
      return '<tr>' +
        '<td>' + esc(x.nome) + '</td>' +
        '<td>' + B._eur(x.preventivato) + '</td>' +
        '<td>' + B._eur(x.sostenuto) + '</td>' +
        '<td style="color:' + (x.scostamento > 0 ? 'var(--dg-red)' : 'var(--dg-green)') + '">' + (x.scostamento > 0 ? '+' : '') + B._eurSigned(x.scostamento) + '</td>' +
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
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
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

  B._speseFilterCategoriaId = '';

  function _populateSpeseFilterCategoria() {
    var sel = document.getElementById('speseFilterCategoria');
    if (!sel) return;
    sel.innerHTML = '<option value="">Tutte le categorie</option>' +
      '<option value="__none__">Senza categoria</option>' +
      B._categorieSpesa.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('');
    sel.value = B._speseFilterCategoriaId;
  }

  function _renderSpese() {
    _populateSpeseFilterCategoria();
    _renderSpeseForecast();
    B._renderIvaRiepilogo();
    var body = document.getElementById('speseBody');
    var items = B._vociSpesa.filter(function (v) {
      if (!B._speseFilterCategoriaId) return true;
      if (B._speseFilterCategoriaId === '__none__') return !v.categoriaSpesaId;
      return v.categoriaSpesaId === B._speseFilterCategoriaId;
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
        (B._vociSpesa.length ? 'Nessuna voce di spesa per questa categoria.' : 'Nessuna voce di spesa per questa stagione.') +
        '</td></tr>';
      return;
    }
    body.innerHTML = items.map(function (v) {
      var linked = v.isIva && isLinkedChild[v.id];
      var sub = v.isIva ? [] : _sottospeseOf(v.id);          /* tutte, spese + crediti: solo per l'indicatore "(N)" */
      var subSpesa = v.isIva ? [] : _sottospeseSpesaOf(v.id); /* solo spese: governano Sostenuto/Preventivato */
      var expanded = !v.isIva && !!B._speseExpanded[v.id];
      var toggleBtn = v.isIva ? '' :
        '<button type="button" class="dg-btn-icon-only" title="Sottospese' + (sub.length ? ' (' + sub.length + ')' : '') + '" onclick="DG.toggleSpesaDettaglio(\'' + v.id + '\')" style="margin-right:2px;flex-shrink:0;transform:rotate(' + (expanded ? 90 : 0) + 'deg)">' + _chevronIconSm() + '</button>';
      var sostenutoCell = subSpesa.length
        ? '<input type="number" class="dg-table-input" value="' + Math.round(v.importoSostenuto || 0) + '" disabled title="Calcolato automaticamente dalla somma dei pagati di ' + subSpesa.length + ' sottospes' + (subSpesa.length === 1 ? 'a' : 'e') + '">'
        : '<input type="number" class="dg-table-input" value="' + (v.importoSostenuto || 0) + '" data-id="' + v.id + '" data-field="importoSostenuto" onchange="DG.saveSpesaField(this)">';
      var preventivatoCell = (subSpesa.length && _voceHaPreventivatoDaSottospese(v.id))
        ? '<input type="number" class="dg-table-input" value="' + Math.round(v.importoPreventivato || 0) + '" disabled title="Calcolato automaticamente dalla somma dei preventivati delle sottospese">'
        : '<input type="number" class="dg-table-input" value="' + (v.importoPreventivato || 0) + '" data-id="' + v.id + '" data-field="importoPreventivato" onchange="DG.saveSpesaField(this)">';
      var row = '<tr' + (v.isIva ? ' style="background:#F8FAFC"' : '') + '>' +
        '<td style="display:flex;align-items:center">' + toggleBtn + (linked ? '<span class="dg-iva-link" title="Generata automaticamente dalla voce sopra">↳</span>' : '') +
        '<input type="text" class="dg-table-input" style="width:180px" value="' + esc(v.categoria) + '" data-id="' + v.id + '" data-field="categoria" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><select class="dg-table-input" data-id="' + v.id + '" data-field="categoriaSpesaId" onchange="DG.saveSpesaField(this)">' + _categorieSpesaOptionsHtml(v.categoriaSpesaId) + '</select></td>' +
        '<td>' + preventivatoCell + '</td>' +
        '<td>' + sostenutoCell + '</td>' +
        '<td>' + (v.isIva ? '<span class="dg-muted" title="Aliquota applicata sulla voce madre — le voci IVA non generano a loro volta IVA">' +
            (v.ivaAliquota ? (+v.ivaAliquota).toLocaleString('it-IT') + '%' : '—') + '</span>' :
          '<input type="number" class="dg-table-input" style="width:70px" min="0" step="1" value="' + (v.ivaAliquota || '') + '" placeholder="0" data-id="' + v.id + '" data-field="ivaAliquota" onchange="DG.saveSpesaField(this)">') + '</td>' +
        '<td><input type="date" class="dg-table-input" value="' + esc(v.dataSpesa || '') + '" data-id="' + v.id + '" data-field="dataSpesa" onchange="DG.saveSpesaField(this)">' +
        (v.dataSpesa ? '<div style="font-size:11px;color:var(--dg-muted);margin-top:3px">' + esc(_fmtDateLong(v.dataSpesa)) + '</div>' : '') + '</td>' +
        '<td><input type="text" class="dg-table-input" style="width:160px" value="' + esc(v.note || '') + '" data-id="' + v.id + '" data-field="note" onchange="DG.saveSpesaField(this)"></td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteSpesa(\'' + v.id + '\')">' + B._delIconSm() + '</button></td>' +
        '</tr>';
      return row + (expanded ? _renderSottospeseRow(v) : '');
    }).join('') + _renderSpeseTotaleRow(items);
  }

  /* Riga finale della tabella Spese: l'esito complessivo delle voci mostrate in quel
     momento (rispetta il filtro per categoria, comprende le voci IVA come il resto
     del pannello) — Preventivato, Sostenuto e lo scostamento fra i due, in un colpo
     d'occhio senza dover sommare le righe a mano. */
  function _renderSpeseTotaleRow(items) {
    var totPrev = 0, totSost = 0;
    items.forEach(function (v) { totPrev += (+v.importoPreventivato || 0); totSost += (+v.importoSostenuto || 0); });
    var totScost = totSost - totPrev;
    return '<tr class="dg-total-row">' +
      '<td colspan="2">Totale' + (B._speseFilterCategoriaId ? ' <span class="dg-muted" style="font-weight:400">(categoria filtrata)</span>' : '') + '</td>' +
      '<td>' + B._eur(totPrev) + '</td>' +
      '<td>' + B._eur(totSost) + '</td>' +
      '<td colspan="3" style="color:' + (totScost > 0 ? 'var(--dg-red)' : 'var(--dg-green)') + '">Scostamento ' + (totScost > 0 ? '+' : '') + B._eurSigned(totScost) + '</td>' +
      '<td></td>' +
    '</tr>';
  }

  function _chevronIconSm() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9,6 15,12 9,18"/></svg>'; }

  /* Una delle due tabelle (spese o crediti) dentro il dettaglio di una voce: stessa
     struttura, vocabolario diverso — "Preventivato/Pagato" per le spese, "Incasso
     previsto/Incassato" per i crediti. Il tipo è deciso da QUALE tabella si aggiunge
     la riga (nessun campo "tipo" da cambiare dopo: per correggere un errore si elimina
     e si reinserisce nella tabella giusta). */
  function _sottospesaTableHtml(v, rows, tipo) {
    var isCredito = tipo === 'credito';
    var labelPrev = isCredito ? 'Incasso previsto' : 'Preventivato';
    var labelEff  = isCredito ? 'Incassato' : 'Pagato';
    var righe = rows.length ? rows.map(function (s) {
      var st = _statoSottospesa(s);
      return '<tr>' +
        '<td><input type="text" class="dg-table-input" value="' + esc(s.descrizione) + '" data-sid="' + s.id + '" data-field="descrizione" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><input type="number" class="dg-table-input" value="' + (s.importoPreventivato || 0) + '" data-sid="' + s.id + '" data-field="importoPreventivato" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><input type="number" class="dg-table-input" value="' + (s.importo || 0) + '" data-sid="' + s.id + '" data-field="importo" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><span class="dg-badge dg-badge--' + st.badge + '">' + st.label + '</span></td>' +
        '<td><input type="date" class="dg-table-input" value="' + esc(s.data || '') + '" data-sid="' + s.id + '" data-field="data" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><input type="text" class="dg-table-input" value="' + esc(s.nota || '') + '" data-sid="' + s.id + '" data-field="nota" onchange="DG.saveSottospesaField(this)"></td>' +
        '<td><button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteSottospesa(\'' + s.id + '\')">' + B._delIconSm() + '</button></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7" class="dg-empty">' + (isCredito ? 'Nessun credito inserito.' : 'Nessuna spesa inserita.') + '</td></tr>';

    return '<div style="font-size:12px;font-weight:700;color:var(--dg-muted);margin:14px 0 6px">' + (isCredito ? 'Crediti / incassi' : 'Spese') + '</div>' +
      '<table class="dg-table" style="margin-bottom:8px"><thead><tr><th>Descrizione</th><th>' + labelPrev + '</th><th>' + labelEff + '</th><th>Stato</th><th>Data</th><th>Nota</th><th></th></tr></thead><tbody>' + righe + '</tbody></table>' +
      '<div class="dg-toolbar">' +
        '<input type="text" class="dg-table-input" id="newSottospesaDesc-' + tipo + '-' + v.id + '" placeholder="Descrizione" style="width:180px">' +
        '<input type="number" class="dg-table-input" id="newSottospesaPrev-' + tipo + '-' + v.id + '" placeholder="' + labelPrev + '" style="width:130px">' +
        '<input type="number" class="dg-table-input" id="newSottospesaImporto-' + tipo + '-' + v.id + '" placeholder="' + labelEff + '" style="width:110px">' +
        '<input type="date" class="dg-table-input" id="newSottospesaData-' + tipo + '-' + v.id + '" style="width:140px">' +
        '<input type="text" class="dg-table-input" id="newSottospesaNota-' + tipo + '-' + v.id + '" placeholder="Nota" style="width:160px">' +
        '<button class="dg-btn-primary dg-btn-sm" onclick="DG.addSottospesa(\'' + v.id + '\',\'' + tipo + '\')">Aggiungi ' + (isCredito ? 'credito' : 'spesa') + '</button>' +
      '</div>';
  }

  /* Riga espandibile inserita subito sotto una voce di spesa: due tabelle (spese e
     crediti) con le voci reali che la compongono + form di aggiunta rapida per ciascuna.
     I crediti sono solo un dettaglio informativo qui dentro: non toccano Sostenuto/
     Preventivato della voce né i totali di Bilancio (l'incasso, se già tracciato altrove
     — es. sponsor, rette — non va così contato due volte). */
  function _renderSottospeseRow(v) {
    var elenco = _sottospeseOf(v.id).slice().sort(function (a, b) { return (a.data || '') < (b.data || '') ? 1 : -1; });
    var spese = elenco.filter(function (s) { return !_isSottospesaCredito(s); });
    var crediti = elenco.filter(_isSottospesaCredito);

    var somma = _sommaSottospese(v.id), sommaPrev = _sommaSottospesePreventivate(v.id);
    var daPagare = spese.reduce(function (t, s) { return t + Math.max(0, (+s.importoPreventivato || 0) - (+s.importo || 0)); }, 0);
    var incassato = _sommaSottospeseIncassato(v.id), incassoPrevisto = _sommaSottospeseIncassoPrevisto(v.id);
    var daIncassare = crediti.reduce(function (t, s) { return t + Math.max(0, (+s.importoPreventivato || 0) - (+s.importo || 0)); }, 0);

    var infoLine = 'Dettaglio — "' + esc(v.categoria) + '": pagato €' + somma.toLocaleString('it-IT') + ' su €' + sommaPrev.toLocaleString('it-IT') + ' preventivati nelle spese' +
      ' · ancora da pagare €' + daPagare.toLocaleString('it-IT') +
      ' · preventivato voce €' + Number(v.importoPreventivato || 0).toLocaleString('it-IT');
    if (crediti.length) {
      infoLine += ' · incassato €' + incassato.toLocaleString('it-IT') + ' su €' + incassoPrevisto.toLocaleString('it-IT') + ' previsti' +
        ' · ancora da incassare €' + daIncassare.toLocaleString('it-IT') +
        ' <span title="I crediti sono solo un dettaglio qui dentro: non modificano Sostenuto/Preventivato della voce né i totali di Bilancio.">ⓘ</span>';
    }

    return '<tr class="dg-spesa-detail-row"><td colspan="8" style="background:#F8FAFC;padding:12px 16px;border-top:1px dashed var(--dg-border)">' +
      '<div style="font-size:12px;font-weight:700;color:var(--dg-muted)">' + infoLine + '</div>' +
      _sottospesaTableHtml(v, spese, 'spesa') +
      _sottospesaTableHtml(v, crediti, 'credito') +
      '<div class="dg-toolbar" style="margin-top:4px">' +
        '<button class="dg-btn-ghost dg-btn-sm" onclick="DG.exportSottospesePdf(\'' + v.id + '\')">Esporta PDF</button>' +
      '</div>' +
    '</td></tr>';
  }

  DG.toggleSpesaDettaglio = function (id) {
    B._speseExpanded[id] = !B._speseExpanded[id];
    _renderSpese();
  };

  DG.addSottospesa = function (voceId, tipo) {
    tipo = tipo === 'credito' ? 'credito' : 'spesa';
    var v = B._vociSpesa.find(function (x) { return x.id === voceId; });
    if (!v) return;
    var suffix = tipo + '-' + voceId;
    var descrizione = (val('newSottospesaDesc-' + suffix) || '').trim();
    var importo = +val('newSottospesaImporto-' + suffix) || 0;
    var importoPreventivato = +val('newSottospesaPrev-' + suffix) || 0;
    if (!descrizione) { alert('Inserisci una descrizione.'); return; }
    if (!importo && !importoPreventivato) { alert('Inserisci almeno un importo (' + (tipo === 'credito' ? 'incasso previsto o incassato' : 'preventivato o pagato') + ').'); return; }
    var data = {
      seasonId: B._currentSeasonId, voceSpesaId: voceId, tipo: tipo,
      descrizione: descrizione, importo: importo, importoPreventivato: importoPreventivato,
      data: val('newSottospesaData-' + suffix) || '', nota: (val('newSottospesaNota-' + suffix) || '').trim(),
      createdAt: new Date().toISOString()
    };
    var ref = db.collection('sottospese').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      B._sottospese.push(data);
      return _logWrite('sottospesa', ref.id, (tipo === 'credito' ? 'Credito' : 'Sottospesa') + ' — ' + v.categoria + ' / ' + descrizione, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () {
      B._speseExpanded[voceId] = true;
      return _syncVoceDaSottospese(voceId);
    }).then(function () {
      _renderSpese(); B._renderStatCards(); B._renderCharts(); B._renderBilancio();
    }).catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.saveSottospesaField = function (el) {
    var id = el.dataset.sid, field = el.dataset.field;
    var s = B._sottospese.find(function (x) { return x.id === id; });
    if (!s) return;
    if (field === 'descrizione' && !el.value.trim()) { alert('La descrizione non può essere vuota.'); el.value = s.descrizione; return; }
    var isText = field === 'data' || field === 'descrizione' || field === 'nota';
    var old = {}; old[field] = isText ? (s[field] || '') : (s[field] || 0);
    var nv = isText ? (field === 'descrizione' || field === 'nota' ? el.value.trim() : el.value) : (+el.value || 0);
    s[field] = nv;
    var patch = {}; patch[field] = nv;
    var v = B._vociSpesa.find(function (x) { return x.id === s.voceSpesaId; });
    db.collection('sottospese').doc(id).update(patch)
      .then(function () { return _logWrite('sottospesa', id, (_isSottospesaCredito(s) ? 'Credito' : 'Sottospesa') + ' — ' + (v ? v.categoria : '') + ' / ' + s.descrizione, 'update', _diff(old, patch, [field])); })
      .then(function () { return (field === 'importo' || field === 'importoPreventivato') ? _syncVoceDaSottospese(s.voceSpesaId) : null; })
      .then(function () { _renderSpese(); B._renderStatCards(); B._renderCharts(); B._renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteSottospesa = function (id) {
    var s = B._sottospese.find(function (x) { return x.id === id; });
    if (!s) return;
    var v = B._vociSpesa.find(function (x) { return x.id === s.voceSpesaId; });
    confirm('Eliminare la sottospesa "' + s.descrizione + '"?', function () {
      db.collection('sottospese').doc(id).delete()
        .then(function () { return _logWrite('sottospesa', id, 'Sottospesa — ' + (v ? v.categoria : '') + ' / ' + s.descrizione, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () {
          B._sottospese = B._sottospese.filter(function (x) { return x.id !== id; });
          return _syncVoceDaSottospese(s.voceSpesaId);
        })
        .then(function () { _renderSpese(); B._renderStatCards(); B._renderCharts(); B._renderBilancio(); })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  DG.saveSpesaField = function (el) {
    var id = el.dataset.id, field = el.dataset.field;
    var v = B._vociSpesa.find(function (x) { return x.id === id; });
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
      var auto = B._trimestreIvaDaData(nv);
      old.ivaTrimestre = v.ivaTrimestre || ''; old.ivaScadenza = v.ivaScadenza || '';
      v.ivaTrimestre = patch.ivaTrimestre = auto ? auto.trimestre : '';
      v.ivaScadenza = patch.ivaScadenza = auto ? auto.scadenza : '';
      fields.push('ivaTrimestre', 'ivaScadenza');
    }
    var needsIvaSync = field === 'importoSostenuto' || field === 'importoPreventivato' || field === 'ivaAliquota' || field === 'categoria' || field === 'dataSpesa';
    db.collection('vociSpesa').doc(id).update(patch)
      .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, fields)); })
      .then(function () { return needsIvaSync ? _syncSpesaIva(v) : null; })
      .then(function () { _renderSpese(); B._renderStatCards(); B._renderCharts(); B._renderBilancio(); })
      .catch(function (e) { alert('Errore: ' + e.message); });
  };

  DG.deleteSpesa = function (id) {
    var v = B._vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var figlieSottospesa = _sottospeseOf(id);
    confirm('Eliminare la voce "' + v.categoria + '"?' +
      (v.ivaVoceSpesaId ? ' Verrà eliminata anche la relativa voce IVA.' : '') +
      (figlieSottospesa.length ? ' Verranno eliminate anche le ' + figlieSottospesa.length + ' sottospese collegate.' : ''), function () {
      var figlia = v.ivaVoceSpesaId ? B._vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;
      var genitrice = B._vociSpesa.find(function (x) { return x.ivaVoceSpesaId === id; });
      db.collection('vociSpesa').doc(id).delete()
        .then(function () { return _logWrite('voceSpesa', id, 'Spesa — ' + v.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return figlia ? db.collection('vociSpesa').doc(figlia.id).delete()
          .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); }) : null; })
        .then(function () { return genitrice ? db.collection('vociSpesa').doc(genitrice.id).update({ ivaVoceSpesaId: '' }) : null; })
        .then(function () {
          return Promise.all(figlieSottospesa.map(function (s) {
            return db.collection('sottospese').doc(s.id).delete()
              .then(function () { return _logWrite('sottospesa', s.id, 'Sottospesa — ' + v.categoria + ' / ' + s.descrizione, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); });
          }));
        })
        .then(function () {
          B._vociSpesa = B._vociSpesa.filter(function (x) { return x.id !== id && (!figlia || x.id !== figlia.id); });
          B._sottospese = B._sottospese.filter(function (x) { return x.voceSpesaId !== id; });
          delete B._speseExpanded[id];
          if (genitrice) genitrice.ivaVoceSpesaId = '';
          _renderSpese(); B._renderStatCards(); B._renderCharts(); B._renderBilancio();
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
    var figlia = v.ivaVoceSpesaId ? B._vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;

    if (aliquota <= 0) {
      if (!figlia) return Promise.resolve();
      return db.collection('vociSpesa').doc(figlia.id).delete()
        .then(function () { return _logWrite('voceSpesa', figlia.id, 'Spesa — ' + figlia.categoria, 'delete', [{ campo: '(record)', prima: 'presente', dopo: null }]); })
        .then(function () { return db.collection('vociSpesa').doc(v.id).update({ ivaVoceSpesaId: '' }); })
        .then(function () {
          B._vociSpesa = B._vociSpesa.filter(function (x) { return x.id !== figlia.id; });
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
    var auto = B._trimestreIvaDaData(v.dataSpesa);

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
      seasonId: B._currentSeasonId, categoria: nome, categoriaSpesaId: v.categoriaSpesaId || '',
      importoPreventivato: importoIvaPreventivato, importoSostenuto: importoIva, ivaAliquota: aliquota, dataSpesa: v.dataSpesa || '',
      note: 'IVA ' + aliquota + '% generata automaticamente sulla voce "' + v.categoria + '"', isIva: true, pagata: false, ivaEscluso: false,
      ivaTrimestre: auto ? auto.trimestre : '', ivaScadenza: auto ? auto.scadenza : '', ivaScadenzaManuale: false
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      B._vociSpesa.push(data);
      v.ivaVoceSpesaId = ref.id;
      return db.collection('vociSpesa').doc(v.id).update({ ivaVoceSpesaId: ref.id });
    }).then(function () {
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + nome, 'create', _diff({}, data, Object.keys(data)));
    });
  }

  /* ---- CATEGORIE DI SPESA (gestione, valide per tutte le stagioni) ---- */
  function _renderCategorieSpesaModalList() {
    var list = document.getElementById('categorieSpesaModalList');
    list.innerHTML = B._categorieSpesa.length ? B._categorieSpesa.map(function (c) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px">' +
        '<span>' + esc(c.nome) + '</span>' +
        '<button class="dg-btn-icon-only" title="Elimina" onclick="DG.deleteCategoriaSpesa(\'' + c.id + '\')">' + B._delIconSm() + '</button>' +
        '</div>';
    }).join('') : '<p class="dg-muted">Nessuna categoria ancora.</p>';
  }

  DG.addCategoriaSpesa = function () {
    var input = document.getElementById('categoriaSpesaNewInput');
    var nome = input.value.trim();
    if (!nome) return;
    if (B._categorieSpesa.some(function (c) { return c.nome.toLowerCase() === nome.toLowerCase(); })) { alert('Categoria già esistente.'); return; }
    var data = { nome: nome, createdAt: new Date().toISOString() };
    var ref = db.collection('categorieSpesa').doc();
    ref.set(data).then(function () {
      data.id = ref.id;
      B._categorieSpesa.push(data);
      B._categorieSpesa.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
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
          B._categorieSpesa = B._categorieSpesa.filter(function (x) { return x.id !== id; });
          _renderCategorieSpesaModalList();
          _renderSpese();
        })
        .catch(function (e) { alert('Errore: ' + e.message); });
    });
  };

  /* ---- Esportato per gli altri file del Budget ---- */
  B._calcSpeseForecast = _calcSpeseForecast;
  B._categoriaSpesaById = _categoriaSpesaById;
  B._categorieSpesaOptionsHtml = _categorieSpesaOptionsHtml;
  B._isSottospesaCredito = _isSottospesaCredito;
  B._loadAuditLog = _loadAuditLog;
  B._renderCategorieSpesaModalList = _renderCategorieSpesaModalList;
  B._renderDashSpeseWidget = _renderDashSpeseWidget;
  B._renderSpese = _renderSpese;
  B._renderSpeseForecast = _renderSpeseForecast;
  B._sommaSottospese = _sommaSottospese;
  B._sommaSottospeseIncassato = _sommaSottospeseIncassato;
  B._sommaSottospeseIncassoPrevisto = _sommaSottospeseIncassoPrevisto;
  B._sommaSottospesePreventivate = _sommaSottospesePreventivate;
  B._sottospeseOf = _sottospeseOf;
  B._statoSottospesa = _statoSottospesa;
  B._syncSpesaIva = _syncSpesaIva;

})();
