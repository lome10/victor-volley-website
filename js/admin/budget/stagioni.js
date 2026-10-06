/* Victor Volley — Admin / Budget: tra una stagione e l'altra e verso il commercialista.
   - esportazione CSV di entrate e uscite della stagione (Bilancio → Consuntivo);
   - «nuova stagione copiando il budget»: voci di spesa (a zero speso, date spostate di un anno) e categorie delle rette;
   - confronto tra la stagione aperta e un'altra (Bilancio → Confronto).
   Dipende da window.Admin e window.Admin.budgetShared. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var DG = window.AdminActions;
  var esc = A.esc;

  function _eur(n) { return B._eur ? B._eur(n) : '€' + Math.round(n).toLocaleString('it-IT'); }
  function _eurSigned(n) { return (n < 0 ? '-' : '') + '€' + Math.abs(Math.round(n)).toLocaleString('it-IT'); }
  function _stagione(id) { return B._seasons.filter(function (s) { return s.id === id; })[0] || {}; }

  /* ================= CSV ================= */
  /* Separatore «;» e virgola decimale (così Excel italiano lo apre bene); le celle che iniziano con = + - @ vengono
     neutralizzate perché Excel non le esegua come formule. */
  function _cella(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function _num(n) { return String(Math.round((+n || 0) * 100) / 100).replace('.', ','); }
  function _csv(intestazione, righe) {
    return '﻿' + [intestazione].concat(righe).map(function (r) { return r.map(_cella).join(';'); }).join('\r\n');
  }
  function _csvEntrate() {
    var e = B._calcBilancioMensile().entrateList;
    return _csv(['Data incasso', 'Fonte', 'Nome', 'Importo', 'Note'], e.map(function (t) {
      return [t.scadenza || '', t.tipo, t.nome, _num(t.importo), t.note || ''];
    }));
  }
  function _csvUscite() {
    /* stesse uscite del Bilancio: sostenute (l'IVA solo se versata) */
    var voci = B._vociSpesa.filter(function (v) { return +v.importoSostenuto > 0 && (!v.isIva || v.pagata); })
      .sort(function (a, b) { return (a.dataSpesa || '9999') < (b.dataSpesa || '9999') ? -1 : 1; });
    return _csv(['Data', 'Voce', 'Categoria', 'Importo pagato', 'Preventivato', 'IVA %', 'Tipo', 'Note', 'Documento'], voci.map(function (v) {
      var c = v.categoriaSpesaId && B._categoriaSpesaById ? B._categoriaSpesaById(v.categoriaSpesaId) : null;
      return [v.dataSpesa || '', v.categoria || '', c ? c.nome : '', _num(v.importoSostenuto), _num(v.importoPreventivato), v.ivaAliquota ? _num(v.ivaAliquota) : '', v.isIva ? 'Versamento IVA' : 'Spesa', v.note || '', v.documentoUrl || ''];
    }));
  }
  function _scarica(nome, testo) {
    var blob = new Blob([testo], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  B._csvEntrate = _csvEntrate; B._csvUscite = _csvUscite;
  DG.budgetCsv = function (tipo) {
    var nome = (_stagione(B._currentSeasonId).nome || 'stagione').replace(/[^0-9A-Za-z]+/g, '-');
    if (tipo === 'entrate') _scarica('entrate-' + nome + '.csv', _csvEntrate());
    else _scarica('uscite-' + nome + '.csv', _csvUscite());
    A.avviso('File scaricato: contiene solo ciò che risulta già incassato o pagato.', 'ok');
  };

  /* ================= COPIA DEL BUDGET ================= */
  function _spostaAnno(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    if (!m) return '';
    var x = new Date(+m[1] + 1, +m[2] - 1, +m[3]), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }
  /* Puro: dalle voci e categorie di una stagione ai documenti della nuova (nessuna scrittura).
     Voci: preventivato e categoria restano, speso e «pagata» ripartono da zero, date +1 anno, nessun pagamento
     né documento. L'IVA collegata alle voci copiate si copia con il collegamento rifatto; l'IVA degli sponsor no. */
  function _copiaBudgetDati(voci, categorie, nuovaStagioneId, nuovoId) {
    var perId = {}, out = { voci: [], categorie: [] };
    voci.forEach(function (v) { perId[v.id] = v; });
    var figlie = {};
    voci.forEach(function (v) { if (!v.isIva && v.ivaVoceSpesaId && perId[v.ivaVoceSpesaId]) figlie[v.ivaVoceSpesaId] = v.id; });
    var nuoviId = {};
    voci.forEach(function (v) {
      if (v.isIva && !figlie[v.id]) return;
      nuoviId[v.id] = nuovoId();
    });
    voci.forEach(function (v) {
      if (!nuoviId[v.id]) return;
      var d = {
        seasonId: nuovaStagioneId, categoria: v.categoria || '', categoriaSpesaId: v.categoriaSpesaId || '',
        importoPreventivato: +v.importoPreventivato || 0, importoSostenuto: 0, ivaAliquota: +v.ivaAliquota || 0,
        dataSpesa: _spostaAnno(v.dataSpesa), note: v.note || ''
      };
      if (v.isIva) {
        d.isIva = true; d.pagata = false; d.ivaEscluso = !!v.ivaEscluso; d.ivaTrimestre = '';
        d.ivaScadenzaManuale = !!v.ivaScadenzaManuale; d.ivaScadenza = v.ivaScadenzaManuale ? _spostaAnno(v.ivaScadenza) : '';
      } else if (v.ivaVoceSpesaId && nuoviId[v.ivaVoceSpesaId]) {
        d.ivaVoceSpesaId = nuoviId[v.ivaVoceSpesaId];
      }
      out.voci.push({ id: nuoviId[v.id], data: d });
    });
    categorie.forEach(function (c) {
      out.categorie.push({ id: nuovoId(), data: { seasonId: nuovaStagioneId, nome: c.nome || '', rettaUnitaria: +c.rettaUnitaria || 0 } });
    });
    return out;
  }
  /* Scrive la copia a blocchi (un batch Firestore arriva a 500 operazioni). */
  function _copiaBudget(daId, aId) {
    var dati = _copiaBudgetDati(B._vociSpesa.filter(function (v) { return v.seasonId === daId; }), B._categorieAtleti.filter(function (c) { return c.seasonId === daId; }), aId,
      function () { return db.collection('vociSpesa').doc().id; });
    var ops = dati.voci.map(function (x) { return { col: 'vociSpesa', id: x.id, data: x.data }; })
      .concat(dati.categorie.map(function (x) { return { col: 'categorieAtleti', id: x.id, data: x.data }; }));
    var p = Promise.resolve();
    for (var i = 0; i < ops.length; i += 400) (function (blocco) {
      p = p.then(function () {
        var batch = db.batch();
        blocco.forEach(function (o) { batch.set(db.collection(o.col).doc(o.id), o.data); });
        return batch.commit();
      });
    })(ops.slice(i, i + 400));
    return p.then(function () { return { voci: dati.voci.length, categorie: dati.categorie.length }; });
  }
  B._copiaBudgetDati = _copiaBudgetDati;
  B._copiaBudget = _copiaBudget;

  /* ================= CONFRONTO TRA STAGIONI ================= */
  /* Puro: totali di una stagione dai suoi dati (stesse definizioni di Panoramica e Bilancio: incassato, speso). */
  function _totaliStagione(d) {
    var chiusi = d.sponsorizzazioni.filter(function (s) { return s.stato === 'chiuso'; });
    var sponsor = chiusi.reduce(function (t, s) { return t + d.sponsorIncassato(s); }, 0);
    var idsAtleti = {}; d.atletiRette.forEach(function (a) { idsAtleti[a.id] = true; });
    var rette = d.rate.reduce(function (t, r) { return t + (r.pagata && idsAtleti[r.atletaRettaId] ? (+r.importo || 0) : 0); }, 0);
    var tessere = d.tessere.filter(function (t) { return String(t.nome || '').trim() && t.pagata; }).length * d.prezzoTessera;
    var altre = d.altre.reduce(function (t, x) { return t + (x.pagata ? (+x.importo || 0) : 0); }, 0);
    var perCat = {}, spese = 0;
    d.voci.forEach(function (v) {
      var s = +v.importoSostenuto || 0; if (!s) return;
      var c = v.categoriaSpesaId ? d.nomeCategoria(v.categoriaSpesaId) : 'Senza categoria';
      perCat[c] = (perCat[c] || 0) + s; spese += s;
    });
    var entrate = sponsor + rette + tessere + altre;
    return { entrate: { 'Sponsor': sponsor, 'Rette atleti': rette, 'Tessere': tessere, 'Altre entrate': altre }, totEntrate: entrate, spese: perCat, totSpese: spese, saldo: entrate - spese };
  }
  B._totaliStagione = _totaliStagione;

  function _datiStagione(id) {
    var mia = id === B._currentSeasonId;
    var base = {
      sponsorizzazioni: B._sponsorizzazioni.filter(function (s) { return s.seasonId === id; }), sponsorIncassato: B._sponsorIncassato,
      rate: B._rateAtleti, prezzoTessera: B._calcTessere().prezzo, nomeCategoria: function (cid) { var c = B._categoriaSpesaById(cid); return c ? c.nome : 'Senza categoria'; }
    };
    if (mia) return Promise.resolve(Object.assign(base, { atletiRette: B._atletiRette, tessere: B._tessere, altre: B._altreEntrate, voci: B._vociSpesa }));
    var q = function (col) { return db.collection(col).where('seasonId', '==', id).get().then(function (s) { return s.docs.map(A.mapDoc); }).catch(function () { return []; }); };
    return Promise.all([q('atletiRette'), q('tessere'), q('altreEntrate'), q('vociSpesa')]).then(function (r) {
      return Object.assign(base, { atletiRette: r[0], tessere: r[1], altre: r[2], voci: r[3] });
    });
  }

  var _confId = '';
  function _renderConfronto() {
    var sel = document.getElementById('confSelect'), body = document.getElementById('confBody');
    if (!sel || !body) return;
    var altre = B._seasons.filter(function (s) { return s.id !== B._currentSeasonId; });
    sel.style.display = altre.length ? '' : 'none';
    if (!altre.length) { sel.innerHTML = ''; body.innerHTML = '<tr><td colspan="4" class="dg-empty">Non c\'è ancora un\'altra stagione con cui confrontare. Dopo «+ Stagione» qui vedrai le due a fianco.</td></tr>'; return; }
    if (!altre.some(function (s) { return s.id === _confId; })) _confId = altre[0].id;
    sel.innerHTML = altre.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === _confId ? ' selected' : '') + '>' + esc(s.nome) + '</option>'; }).join('');
    body.innerHTML = '<tr><td colspan="4" class="dg-empty">Calcolo…</td></tr>';
    Promise.all([_datiStagione(B._currentSeasonId), _datiStagione(_confId)]).then(function (r) {
      if (sel.value !== _confId) return;
      var a = _totaliStagione(r[0]), b = _totaliStagione(r[1]);
      document.getElementById('confHeadA').textContent = _stagione(B._currentSeasonId).nome || 'Questa stagione';
      document.getElementById('confHeadB').textContent = _stagione(_confId).nome || '';
      body.innerHTML = _tabella(a, b);
    }).catch(function (e) { body.innerHTML = '<tr><td colspan="4" class="dg-empty">Non riesco a calcolare il confronto: ' + esc(e.message) + '</td></tr>'; });
  }
  function _riga(label, x, y, forte, bene) {
    var diff = x - y, cls = diff === 0 ? '' : ((diff > 0) === bene ? 'cs-pos' : 'cs-neg');
    return '<tr' + (forte ? ' style="font-weight:700"' : '') + '><td>' + esc(label) + '</td><td class="cs-r">' + _eur(x) + '</td><td class="cs-r">' + _eur(y) + '</td><td class="cs-r ' + cls + '">' + (diff === 0 ? '—' : _eurSigned(diff)) + '</td></tr>';
  }
  function _tabella(a, b) {
    var h = [], sez = function (t) { h.push('<tr><td colspan="4" class="dg-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;padding-top:14px">' + t + '</td></tr>'); };
    sez('Entrate incassate');
    Object.keys(a.entrate).forEach(function (k) { h.push(_riga(k, a.entrate[k], b.entrate[k], false, true)); });
    h.push(_riga('Totale entrate', a.totEntrate, b.totEntrate, true, true));
    sez('Spese sostenute');
    var cat = {}; Object.keys(a.spese).concat(Object.keys(b.spese)).forEach(function (k) { cat[k] = true; });
    Object.keys(cat).sort().forEach(function (k) { h.push(_riga(k, a.spese[k] || 0, b.spese[k] || 0, false, false)); });
    h.push(_riga('Totale spese', a.totSpese, b.totSpese, true, false));
    sez('Risultato');
    h.push(_riga('Saldo (entrate − spese)', a.saldo, b.saldo, true, true));
    return h.join('');
  }
  B._renderConfronto = _renderConfronto;

  /* ================= collegamenti con la pagina ================= */
  function _collega() {
    var sel = document.getElementById('confSelect');
    if (sel) sel.addEventListener('change', function () { _confId = sel.value; _renderConfronto(); });
    var nuova = document.getElementById('newSeasonBtn');
    if (nuova) nuova.addEventListener('click', function () {
      var wrap = document.getElementById('seasonCopiaWrap'), chk = document.getElementById('seasonCopiaBudget');
      if (!wrap || !chk) return;
      var nome = _stagione(B._currentSeasonId).nome;
      document.getElementById('seasonCopiaNome').textContent = nome ? '«' + nome + '»' : 'quella aperta';
      chk.checked = true;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _collega); else _collega();
})();
