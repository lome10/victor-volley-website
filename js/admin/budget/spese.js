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

  /* ---- NUOVA INTERFACCIA SPESE ----
     Elenco raggruppato per categoria con lo stato di ogni voce, indicatori in alto e pannello laterale per modificare.
     Le voci IVA generate (isIva) non stanno nell'elenco: sono nella sotto-scheda IVA e compaiono come badge sulla voce
     madre. Il nome della voce è il campo `categoria` (nome storico); la categoria vera è `categoriaSpesaId`. */
  B._speseQ = '';
  B._speseStato = 'tutti';
  B._speseGruppiChiusi = {};
  B._speseDrawerId = null;

  /* data di oggi nel fuso del browser (toISOString darebbe quella UTC: ieri tra mezzanotte e le 2 in Italia) */
  function _oggiIso() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function _giorniA(dataIso, oggiIso) { return Math.round((new Date(dataIso + 'T00:00:00') - new Date(oggiIso + 'T00:00:00')) / 864e5); }

  /* Stato ricavato dai due importi: pagata solo se c'è un preventivo e il sostenuto lo raggiunge. */
  function _statoVoce(v) {
    var p = +v.importoPreventivato || 0, s = +v.importoSostenuto || 0;
    if (p > 0 && s >= p) return 'pagata';
    return s > 0 ? 'parziale' : 'da-pagare';
  }
  function _residuoVoce(v) { return Math.max(0, (+v.importoPreventivato || 0) - (+v.importoSostenuto || 0)); }
  /* '' | 'in-scadenza' (entro 30 giorni) | 'scaduta': solo se c'è ancora qualcosa da pagare e una data. */
  function _urgenzaVoce(v, oggi) {
    if (!v.dataSpesa || _residuoVoce(v) <= 0) return '';
    var g = _giorniA(v.dataSpesa, oggi);
    return g < 0 ? 'scaduta' : (g <= 30 ? 'in-scadenza' : '');
  }
  function _etichettaVoce(v, oggi) {
    var u = _urgenzaVoce(v, oggi);
    if (u === 'scaduta') return { k: 'scaduta', t: 'Scaduta' };
    if (u === 'in-scadenza') return { k: 'in-scadenza', t: 'In scadenza' };
    if (!(+v.importoPreventivato) && (+v.importoSostenuto) > 0) return { k: 'in-scadenza', t: 'Senza preventivo' };
    var s = _statoVoce(v);
    return { k: s, t: s === 'pagata' ? 'Pagata' : s === 'parziale' ? 'Parziale' : 'Da pagare' };
  }

  /* Totali della scheda (stessi numeri del Bilancio e della dashboard: comprendono anche le voci IVA). */
  function _calcSpeseKpi(oggi) {
    var k = { prev: 0, speso: 0, daPagare: 0, ivaPrev: 0, entro30n: 0, entro30eur: 0, senzaData: 0, anomalie: 0 };
    B._vociSpesa.forEach(function (v) {
      var p = +v.importoPreventivato || 0, s = +v.importoSostenuto || 0;
      k.prev += p; k.speso += s; k.daPagare += Math.max(0, p - s);
      if (v.isIva) { k.ivaPrev += p; return; }
      if (_urgenzaVoce(v, oggi)) { k.entro30n++; k.entro30eur += Math.max(0, p - s); }
      if (!v.dataSpesa && _statoVoce(v) !== 'pagata') k.senzaData++;
      if (p === 0 && s > 0) k.anomalie++;
    });
    return k;
  }

  function _vociFiltrate(oggi) {
    var q = B._speseQ.trim().toLowerCase(), f = B._speseFilterCategoriaId, st = B._speseStato;
    return B._vociSpesa.filter(function (v) {
      if (v.isIva) return false;
      if (f === '__none__' ? !!v.categoriaSpesaId : (f && v.categoriaSpesaId !== f)) return false;
      if (q && ((v.categoria || '') + ' ' + (v.note || '')).toLowerCase().indexOf(q) === -1) return false;
      var pagata = _statoVoce(v) === 'pagata';
      if (st === 'pagata') return pagata;
      if (st === 'da-pagare') return !pagata;
      if (st === 'in-scadenza') return !!_urgenzaVoce(v, oggi);
      if (st === 'senza-data') return !v.dataSpesa && !pagata;
      if (st === 'anomalia') return !(+v.importoPreventivato) && (+v.importoSostenuto) > 0;
      return true;
    });
  }

  function _seasonCorrente() { return B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || null; }

  function _kpiCard(label, valore, sub, cls, barPct, barCls) {
    return '<div class="sp-kpi' + (cls ? ' sp-kpi--' + cls : '') + '"><span class="sp-kpi-l">' + label + '</span><span class="sp-kpi-v">' + valore + '</span>' +
      (barPct != null ? '<div class="sp-bar' + (barCls ? ' sp-bar--' + barCls : '') + '"><i style="width:' + Math.max(0, Math.min(100, barPct)) + '%"></i></div>' : '') +
      '<span class="sp-kpi-s">' + sub + '</span></div>';
  }

  function _speseKpiHtml(k, season) {
    var budget = season && +season.budgetSpese > 0 ? +season.budgetSpese : 0;
    var pcSp = k.prev > 0 ? Math.round(k.speso / k.prev * 100) : 0;
    var prevSub = (k.ivaPrev ? 'di cui IVA ' + B._eur(k.ivaPrev) + ' · ' : '') + 'con margine 10%: ' + B._eur(k.prev * 1.1);
    var quarta = budget
      ? _kpiCard('Margine sul budget', B._eurSigned(budget - k.prev), 'budget di spesa ' + B._eur(budget) + ' · <button type="button" class="sp-link" onclick="DG.spesaBudgetModifica()">modifica</button>', budget - k.prev < 0 ? 'neg' : 'pos')
      : '<div class="sp-kpi"><span class="sp-kpi-l">Budget di spesa</span><span class="sp-kpi-s">Imposta un tetto per vedere quanto margine resta.</span>' +
        '<div class="sp-inline"><input type="number" id="speseBudgetInput" min="0" step="100" placeholder="es. 30000" aria-label="Budget di spesa in euro"><button type="button" class="dg-btn-primary dg-btn-sm" onclick="DG.salvaBudgetSpese()">Salva</button></div></div>';
    return _kpiCard('Preventivato', B._eur(k.prev), prevSub, '', budget ? k.prev / budget * 100 : null, budget && k.prev > budget ? 'bad' : '') +
      _kpiCard('Speso finora', B._eur(k.speso), pcSp + '% del preventivato', '', pcSp, 'ok') +
      _kpiCard('Ancora da pagare', B._eur(k.daPagare), k.entro30n ? 'di cui ' + B._eur(k.entro30eur) + ' scaduti o in scadenza entro 30 giorni' : 'nessuna scadenza nei prossimi 30 giorni', k.entro30n ? 'warn' : '') +
      quarta;
  }

  function _speseAlertsHtml(k) {
    var h = '';
    if (k.entro30n) h += '<button type="button" class="sp-chip" data-ss="in-scadenza"><span class="sp-dot"></span>' + k.entro30n + (k.entro30n === 1 ? ' scadenza' : ' scadenze') + ' entro 30 giorni</button>';
    if (k.senzaData) h += '<button type="button" class="sp-chip sp-chip--info" data-ss="senza-data"><span class="sp-dot"></span>' + k.senzaData + (k.senzaData === 1 ? ' voce senza data' : ' voci senza data') + ': non entrano nel Saldo mensile</button>';
    if (k.anomalie) h += '<button type="button" class="sp-chip sp-chip--bad" data-ss="anomalia"><span class="sp-dot"></span>' + k.anomalie + (k.anomalie === 1 ? ' voce con speso ma senza preventivo' : ' voci con speso ma senza preventivo') + '</button>';
    return h;
  }

  function _renderSpese() {
    if (!document.getElementById('speseList')) return;
    var oggi = _oggiIso(), k = _calcSpeseKpi(oggi);
    _populateSpeseFilterCategoria();
    document.getElementById('speseKpis').innerHTML = _speseKpiHtml(k, _seasonCorrente());
    document.getElementById('speseAlerts').innerHTML = _speseAlertsHtml(k);
    document.querySelectorAll('#speseFilterStato [data-ss]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-ss') === B._speseStato)); });

    var items = _vociFiltrate(oggi), per = {}, html = '';
    items.forEach(function (v) { var key = v.categoriaSpesaId || '__none__'; (per[key] = per[key] || []).push(v); });
    function sommaPrev(arr) { return arr.reduce(function (t, v) { return t + (+v.importoPreventivato || 0); }, 0); }
    Object.keys(per).sort(function (a, b) { return sommaPrev(per[b]) - sommaPrev(per[a]); }).forEach(function (key) {
      var arr = per[key].slice().sort(function (a, b) { return (a.dataSpesa || '9999').localeCompare(b.dataSpesa || '9999'); });
      var c = key === '__none__' ? null : _categoriaSpesaById(key);
      var p = sommaPrev(arr), s = arr.reduce(function (t, v) { return t + (+v.importoSostenuto || 0); }, 0), pc = p ? Math.round(s / p * 100) : 0;
      var aperto = !B._speseGruppiChiusi[key];
      html += '<button type="button" class="sp-group" data-g="' + esc(key) + '" aria-expanded="' + aperto + '"><span class="sp-chev">▶</span>' +
        '<span class="sp-gname">' + esc(c ? c.nome : 'Senza categoria') + ' <small>' + arr.length + (arr.length === 1 ? ' voce' : ' voci') + '</small></span>' +
        '<span class="sp-gtot">previsto <b>' + B._eur(p) + '</b> · speso <b>' + B._eur(s) + '</b></span>' +
        '<span class="sp-gbar"><div class="sp-bar' + (pc > 100 ? ' sp-bar--bad' : pc > 80 ? ' sp-bar--warn' : '') + '"><i style="width:' + Math.min(100, pc) + '%"></i></div></span><span class="sp-gpc">' + pc + '%</span></button>';
      if (aperto) arr.forEach(function (v) { html += _rigaVoceHtml(v, oggi); });
    });
    document.getElementById('speseList').innerHTML = html || '<div class="sp-empty">' + (B._vociSpesa.length ? 'Nessuna voce con questi filtri.' : 'Nessuna voce di spesa per questa stagione.') + '</div>';

    var tp = items.reduce(function (t, v) { return t + (+v.importoPreventivato || 0); }, 0), ts = items.reduce(function (t, v) { return t + (+v.importoSostenuto || 0); }, 0);
    var ivaTot = B._vociSpesa.reduce(function (t, v) { return t + (v.isIva ? (+v.importoPreventivato || 0) : 0); }, 0);
    document.getElementById('speseFoot').innerHTML = '<span>Totale' + (items.length !== B._vociSpesa.filter(function (v) { return !v.isIva; }).length ? ' (filtrato)' : '') + '</span>' +
      '<span>Previsto ' + B._eur(tp) + ' · Speso ' + B._eur(ts) + ' · Da pagare ' + B._eur(items.reduce(function (t, v) { return t + _residuoVoce(v); }, 0)) + '</span>' +
      (ivaTot ? '<span class="sp-foot-note">IVA collegata (preventivata): ' + B._eur(ivaTot) + ' · si versa dal Bilancio, sezione IVA</span>' : '');
    if (B._speseDrawerId) _renderDrawer();
  }

  function _rigaVoceHtml(v, oggi) {
    var e = _etichettaVoce(v, oggi), p = +v.importoPreventivato || 0, s = +v.importoSostenuto || 0, pcv = p ? Math.round(s / p * 100) : 0;
    var figlia = v.ivaVoceSpesaId ? B._vociSpesa.find(function (x) { return x.id === v.ivaVoceSpesaId; }) : null;
    var iva = figlia ? (+figlia.importoPreventivato || 0) : (+v.ivaAliquota > 0 ? p * (+v.ivaAliquota) / 100 : 0);
    var nSub = _sottospeseOf(v.id).length, gestitaDaSub = _sottospeseSpesaOf(v.id).length > 0;
    var badge = (iva ? '<span class="sp-b">+ IVA ' + (+v.ivaAliquota || '') + (+v.ivaAliquota ? '% ' : ' ') + B._eur(iva) + '</span>' : '') + (nSub ? '<span class="sp-tag">' + nSub + (nSub === 1 ? ' pagamento' : ' pagamenti') + '</span>' : '');
    return '<div class="sp-row" tabindex="0" role="button" data-id="' + v.id + '" aria-label="Apri ' + esc(v.categoria) + '">' +
      '<div class="sp-name"><div class="sp-t">' + esc(v.categoria) + '</div>' + (badge ? '<div class="sp-m">' + badge + '</div>' : '') +
        '<div class="sp-m sp-m-mobile"><span>' + B._eur(s) + ' / ' + B._eur(p) + '</span><span>' + (v.dataSpesa ? esc(_fmtDate(v.dataSpesa)) : 'senza data') + '</span></div></div>' +
      '<div class="sp-d">' + (v.dataSpesa ? esc(_fmtDate(v.dataSpesa)) : '<span title="Senza data">—</span>') + '</div>' +
      '<div class="sp-c">' + B._eur(p) + '</div>' +
      '<div class="sp-s">' + B._eur(s) + '<div class="sp-bar' + (pcv > 100 ? ' sp-bar--bad' : '') + '"><i style="width:' + Math.min(100, pcv) + '%"></i></div></div>' +
      '<div class="sp-st"><span class="sp-pill sp-pill--' + e.k + '">' + e.t + '</span></div>' +
      '<div class="sp-act">' + (_statoVoce(v) === 'pagata' || !p || gestitaDaSub ? '' : '<button type="button" class="dg-btn-ghost dg-btn-sm" data-pay="' + v.id + '">Segna pagata</button>') + '</div></div>';
  }

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

  /* Dettaglio dei pagamenti di una voce (sottospese e crediti): le due tabelle di prima, ora dentro il pannello laterale.
     I crediti sono solo un dettaglio informativo: non toccano Sostenuto/Preventivato della voce né i totali di Bilancio
     (un incasso già tracciato altrove, per esempio sponsor o rette, non va contato due volte). */
  function _sottospeseInnerHtml(v) {
    var elenco = _sottospeseOf(v.id).slice().sort(function (a, b) { return (a.data || '') < (b.data || '') ? 1 : -1; });
    var spese = elenco.filter(function (s) { return !_isSottospesaCredito(s); });
    var crediti = elenco.filter(_isSottospesaCredito);
    var somma = _sommaSottospese(v.id), sommaPrev = _sommaSottospesePreventivate(v.id);
    var daPagare = spese.reduce(function (t, s) { return t + Math.max(0, (+s.importoPreventivato || 0) - (+s.importo || 0)); }, 0);
    var incassato = _sommaSottospeseIncassato(v.id), incassoPrevisto = _sommaSottospeseIncassoPrevisto(v.id);
    var daIncassare = crediti.reduce(function (t, s) { return t + Math.max(0, (+s.importoPreventivato || 0) - (+s.importo || 0)); }, 0);
    var info = 'Pagato €' + somma.toLocaleString('it-IT') + ' su €' + sommaPrev.toLocaleString('it-IT') + ' preventivati · ancora da pagare €' + daPagare.toLocaleString('it-IT');
    if (crediti.length) info += ' · incassato €' + incassato.toLocaleString('it-IT') + ' su €' + incassoPrevisto.toLocaleString('it-IT') + ' previsti · da incassare €' + daIncassare.toLocaleString('it-IT') +
      ' <span title="I crediti sono solo un dettaglio qui dentro: non modificano Sostenuto/Preventivato della voce né i totali di Bilancio.">ⓘ</span>';
    return '<div class="sp-dr-info">' + info + '</div>' + _sottospesaTableHtml(v, spese, 'spesa') + _sottospesaTableHtml(v, crediti, 'credito') +
      '<div class="dg-toolbar" style="margin-top:4px"><button type="button" class="dg-btn-ghost dg-btn-sm" onclick="DG.exportSottospesePdf(\'' + v.id + '\')">Esporta PDF</button></div>';
  }

  /* ---- Pannello laterale ---- */
  function _drawerRoot() { return document.getElementById('speseDrawerRoot'); }
  function _chiudiDrawer() { B._speseDrawerId = null; var r = _drawerRoot(); if (r) r.innerHTML = ''; }
  var CAMPI_BOZZA = { speDNome: 'categoria', speDCat: 'categoriaSpesaId', speDData: 'dataSpesa', speDPrev: 'importoPreventivato', speDSost: 'importoSostenuto', speDIva: 'ivaAliquota', speDNote: 'note' };

  /* Valori già scritti nel pannello, per non perderli quando si aggiunge o cambia un pagamento (il pannello si ridisegna). */
  function _leggiBozza() {
    if (!document.getElementById('speDNome')) return null;
    var b = {};
    Object.keys(CAMPI_BOZZA).forEach(function (id) { var el = document.getElementById(id); if (el) b[id] = el.value; });
    return b;
  }

  function _renderDrawer() {
    var root = _drawerRoot();
    var v = B._vociSpesa.find(function (x) { return x.id === B._speseDrawerId; });
    if (!root || !v) { _chiudiDrawer(); return; }
    var corpoPrima = root.querySelector('.sp-dr-body'), scroll = corpoPrima ? corpoPrima.scrollTop : 0;
    var bozza = _leggiBozza(), giaAperto = !!corpoPrima;
    var val0 = function (id, campo, def) { return bozza && bozza[id] != null ? bozza[id] : (v[campo] == null ? def : v[campo]); };
    var haSub = _sottospeseSpesaOf(v.id).length > 0, prevDaSub = haSub && _voceHaPreventivatoDaSottospese(v.id);
    var e = _etichettaVoce(v, _oggiIso());
    root.innerHTML = '<div class="sp-dr-bg" onclick="DG.speseDrawerChiudi()"></div>' +
      '<aside class="sp-dr" role="dialog" aria-modal="true" aria-label="Voce di spesa ' + esc(v.categoria) + '">' +
      '<header class="sp-dr-h"><div><h3>' + esc(v.categoria) + '</h3><span class="sp-pill sp-pill--' + e.k + '">' + e.t + '</span></div><button type="button" class="dg-btn-ghost dg-btn-sm" id="speDClose" onclick="DG.speseDrawerChiudi()">Chiudi</button></header>' +
      '<div class="sp-dr-body"><div class="sp-grid">' +
      '<div class="sp-f sp-full"><label for="speDNome">Voce di spesa</label><input type="text" id="speDNome" class="dg-form-input" value="' + esc(val0('speDNome', 'categoria', '')) + '"></div>' +
      '<div class="sp-f"><label for="speDCat">Categoria</label><select id="speDCat" class="dg-form-input">' + _categorieSpesaOptionsHtml(val0('speDCat', 'categoriaSpesaId', '')) + '</select></div>' +
      '<div class="sp-f"><label for="speDData">Data o scadenza</label><input type="date" id="speDData" class="dg-form-input" value="' + esc(val0('speDData', 'dataSpesa', '')) + '"><span class="sp-h">Conta nel Saldo mensile; senza data finisce in «Spese senza data».</span></div>' +
      '<div class="sp-f"><label for="speDPrev">Preventivato (€)</label><input type="number" id="speDPrev" class="dg-form-input" min="0" step="any" value="' + esc(val0('speDPrev', 'importoPreventivato', 0)) + '"' + (prevDaSub ? ' readonly' : '') + '>' + (prevDaSub ? '<span class="sp-h">Somma dei preventivati dei pagamenti qui sotto.</span>' : '') + '</div>' +
      '<div class="sp-f"><label for="speDSost">Già speso (€)</label><input type="number" id="speDSost" class="dg-form-input" min="0" step="any" value="' + esc(val0('speDSost', 'importoSostenuto', 0)) + '"' + (haSub ? ' readonly' : '') + '>' + (haSub ? '<span class="sp-h">Somma dei pagati dei pagamenti qui sotto.</span>' : '') + '</div>' +
      '<div class="sp-f"><label for="speDIva">IVA %</label><input type="number" id="speDIva" class="dg-form-input" min="0" step="1" placeholder="0" value="' + esc(val0('speDIva', 'ivaAliquota', '') || '') + '"><span class="sp-h" id="speDIvaH"></span></div>' +
      '<div class="sp-f sp-full"><label for="speDNote">Note</label><textarea id="speDNote" class="dg-form-input" rows="3">' + esc(val0('speDNote', 'note', '')) + '</textarea></div></div>' +
      '<div class="sp-sect"><h4>Pagamenti e dettaglio</h4>' + _sottospeseInnerHtml(v) + '</div></div>' +
      '<footer class="sp-dr-f"><button type="button" class="dg-btn-ghost sp-danger" onclick="DG.speseDrawerElimina()">Elimina</button><span class="sp-sp"></span>' +
      '<button type="button" class="dg-btn-ghost" onclick="DG.speseDrawerChiudi()">Annulla</button><button type="button" class="dg-btn-primary" onclick="DG.speseDrawerSalva()">Salva</button></footer></aside>';
    var body = root.querySelector('.sp-dr-body'); if (body) body.scrollTop = scroll;
    var ivaH = function () {
      var al = +document.getElementById('speDIva').value || 0, pv = +document.getElementById('speDPrev').value || 0;
      document.getElementById('speDIvaH').textContent = al > 0 && pv > 0 ? 'IVA stimata ' + B._eur(pv * al / 100) : '';
    };
    ['speDIva', 'speDPrev'].forEach(function (id) { document.getElementById(id).addEventListener('input', ivaH); });
    ivaH();
    if (!giaAperto) document.getElementById('speDClose').focus();
  }

  DG.speseDrawerApri = function (id) { B._speseDrawerId = id; _renderDrawer(); };
  DG.speseDrawerChiudi = _chiudiDrawer;

  DG.speseDrawerSalva = function () {
    var v = B._vociSpesa.find(function (x) { return x.id === B._speseDrawerId; });
    if (!v) return;
    var nome = document.getElementById('speDNome').value.trim();
    if (!nome) { A.avviso('Scrivi il nome della voce di spesa.'); document.getElementById('speDNome').focus(); return; }
    var nuovo = {
      categoria: nome, categoriaSpesaId: document.getElementById('speDCat').value, dataSpesa: document.getElementById('speDData').value,
      importoPreventivato: +document.getElementById('speDPrev').value || 0, importoSostenuto: +document.getElementById('speDSost').value || 0,
      ivaAliquota: +document.getElementById('speDIva').value || 0, note: document.getElementById('speDNote').value.trim()
    };
    var patch = {};
    Object.keys(nuovo).forEach(function (k) {
      var vecchio = k === 'categoria' || k === 'categoriaSpesaId' || k === 'dataSpesa' || k === 'note' ? (v[k] || '') : (+v[k] || 0);
      if (nuovo[k] !== vecchio) patch[k] = nuovo[k];
    });
    if (!Object.keys(patch).length) { _chiudiDrawer(); A.avviso('Nessuna modifica da salvare.'); return; }
    _salvaCampi(v, patch).then(function () { _chiudiDrawer(); A.avviso('Voce «' + v.categoria + '» salvata.', 'ok'); })
      .catch(function (e) { A.avviso('Errore: ' + e.message, 'errore'); });
  };

  DG.speseDrawerElimina = function () { if (B._speseDrawerId) DG.deleteSpesa(B._speseDrawerId); };

  /* «Segna pagata»: lo speso diventa il preventivato; se manca la data, vale oggi (serve al Saldo mensile). */
  DG.spesaSegnaPagata = function (id) {
    var v = B._vociSpesa.find(function (x) { return x.id === id; });
    if (!v) return;
    var senzaData = !v.dataSpesa, patch = { importoSostenuto: +v.importoPreventivato || 0 };
    if (senzaData) patch.dataSpesa = _oggiIso();
    _salvaCampi(v, patch).then(function () { A.avviso('«' + v.categoria + '» segnata come pagata' + (senzaData ? ' (data: oggi)' : '') + '.', 'ok'); })
      .catch(function (e) { A.avviso('Errore: ' + e.message, 'errore'); });
  };

  /* Budget di spesa della stagione (campo budgetSpese su budgetSeasons): serve al «Margine sul budget». */
  DG.salvaBudgetSpese = function () {
    var season = _seasonCorrente(), el = document.getElementById('speseBudgetInput');
    if (!season || !el) return;
    var nuovo = +el.value || 0;
    if (nuovo <= 0) { A.avviso('Scrivi un importo maggiore di zero.'); return; }
    _scriviBudgetSpese(season, nuovo);
  };
  DG.spesaBudgetModifica = function () {
    var season = _seasonCorrente();
    if (!season) return;
    document.getElementById('speseKpis').lastElementChild.outerHTML =
      '<div class="sp-kpi"><span class="sp-kpi-l">Budget di spesa</span><div class="sp-inline"><input type="number" id="speseBudgetInput" min="0" step="100" value="' + (+season.budgetSpese || '') + '" aria-label="Budget di spesa in euro"><button type="button" class="dg-btn-primary dg-btn-sm" onclick="DG.salvaBudgetSpese()">Salva</button></div></div>';
    document.getElementById('speseBudgetInput').focus();
  };
  function _scriviBudgetSpese(season, nuovo) {
    var old = { budgetSpese: +season.budgetSpese || 0 };
    season.budgetSpese = nuovo;
    db.collection('budgetSeasons').doc(season.id).update({ budgetSpese: nuovo })
      .then(function () { return _logWrite('obiettivo', season.id, 'Budget di spesa — stagione ' + season.nome, 'update', _diff(old, { budgetSpese: nuovo }, ['budgetSpese'])); })
      .then(function () { _renderSpese(); A.avviso('Budget di spesa salvato.', 'ok'); })
      .catch(function (e) { season.budgetSpese = old.budgetSpese; A.avviso('Errore: ' + e.message, 'errore'); });
  }

  /* ---- Eventi della scheda (un solo ascoltatore, le righe si ridisegnano di continuo) ---- */
  function _collegaEventiSpese() {
    var pane = document.getElementById('budgetPaneSpese');
    if (!pane || pane.dataset.spCollegato) return;
    pane.dataset.spCollegato = '1';
    pane.addEventListener('click', function (e) {
      var x;
      if ((x = e.target.closest('[data-pay]'))) { DG.spesaSegnaPagata(x.getAttribute('data-pay')); return; }
      if ((x = e.target.closest('[data-g]'))) { var k = x.getAttribute('data-g'); B._speseGruppiChiusi[k] = !B._speseGruppiChiusi[k]; _renderSpese(); return; }
      if ((x = e.target.closest('[data-ss]'))) { B._speseStato = x.getAttribute('data-ss'); _renderSpese(); return; }
      if ((x = e.target.closest('.sp-row[data-id]'))) DG.speseDrawerApri(x.getAttribute('data-id'));
    });
    pane.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('sp-row')) { e.preventDefault(); DG.speseDrawerApri(e.target.getAttribute('data-id')); }
    });
    var q = document.getElementById('speseSearch');
    if (q) q.addEventListener('input', function () { B._speseQ = this.value; _renderSpese(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && B._speseDrawerId && !document.querySelector('.dg-modal:not(.is-hidden)')) _chiudiDrawer(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _collegaEventiSpese); else _collegaEventiSpese();

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

  /* Salva uno o più campi di una voce di spesa (pannello laterale e «Segna pagata»). Stessa logica di prima: audit log,
     ricalcolo del trimestre di versamento se si tocca la data di una voce IVA, aggiornamento della voce IVA collegata.
     Risolve quando tutto è scritto e le schede dipendenti sono ridisegnate; rifiuta con l'errore di Firestore. */
  function _salvaCampi(v, patch) {
    var fields = Object.keys(patch), old = {}, testo = ['categoria', 'categoriaSpesaId', 'dataSpesa', 'note'];
    fields.forEach(function (f) { old[f] = testo.indexOf(f) !== -1 ? (v[f] || '') : (v[f] || 0); });
    Object.assign(v, patch);
    /* Se è la voce IVA stessa (non la sua «genitrice») e la scadenza non è mai stata forzata a mano,
       cambiare la data ricalcola in automatico il trimestre di versamento. */
    if (v.isIva && 'dataSpesa' in patch && !v.ivaScadenzaManuale) {
      var auto = B._trimestreIvaDaData(patch.dataSpesa);
      old.ivaTrimestre = old.ivaTrimestre || ''; old.ivaScadenza = old.ivaScadenza || '';
      v.ivaTrimestre = patch.ivaTrimestre = auto ? auto.trimestre : '';
      v.ivaScadenza = patch.ivaScadenza = auto ? auto.scadenza : '';
      fields.push('ivaTrimestre', 'ivaScadenza');
    }
    var serveIva = ['importoSostenuto', 'importoPreventivato', 'ivaAliquota', 'categoria', 'dataSpesa'].some(function (f) { return f in patch; });
    return db.collection('vociSpesa').doc(v.id).update(patch)
      .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + v.categoria, 'update', _diff(old, patch, fields)); })
      .then(function () { return serveIva ? _syncSpesaIva(v) : null; })
      .then(function () { _renderSpese(); B._renderStatCards(); B._renderCharts(); B._renderBilancio(); });
  }

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
          if (B._speseDrawerId === id) _chiudiDrawer();
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
  B._calcSpeseKpi = _calcSpeseKpi;
  B._statoVoceSpesa = _statoVoce;
  B._urgenzaVoceSpesa = _urgenzaVoce;
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
