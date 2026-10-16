/* Victor Volley — Admin / Budget: tesseramenti atleti nelle Spese.
   Dal costo di tesseramento di ogni atleta (js/admin/tesseramenti-calc.js, per data di nascita) genera nelle Spese una
   voce generica «Tesseramenti atleti» con una sottospesa per squadra (categoria dell'atleta).
   Ogni sottospesa ha `tesseramentiSquadra` = nome della squadra: è la chiave con cui la ritrovo. Aggiorno solo il
   Preventivato (e la nota con il dettaglio): il «Pagato» lo inserisce chi gestisce le Spese.
   Dipende da window.Admin, window.Admin.budgetShared (spese.js) e window.Admin.tesseramentiCalc. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var _logWrite = A.logWrite, _diff = A.diff;

  var NOME_VOCE = 'Tesseramenti atleti';
  var NOTA_VOCE = 'Generata automaticamente dalle date di nascita degli atleti (quota di tesseramento per fascia di età); una riga per squadra.';

  function _voce() {
    return B._vociSpesa.find(function (v) { return v.tesseramenti && v.seasonId === B._currentSeasonId; }) || null;
  }

  /* La voce va nella categoria di spesa «Federazione», se esiste. */
  function _categoriaFederazioneId() {
    var c = B._categorieSpesa.find(function (x) { return (x.nome || '').trim().toLowerCase() === 'federazione'; });
    return c ? c.id : '';
  }

  function _creaVoce() {
    var data = {
      seasonId: B._currentSeasonId, categoria: NOME_VOCE, categoriaSpesaId: _categoriaFederazioneId(),
      importoPreventivato: 0, importoSostenuto: 0, dataSpesa: '', note: NOTA_VOCE, pagata: false, tesseramenti: true
    };
    var ref = db.collection('vociSpesa').doc();
    return ref.set(data).then(function () {
      data.id = ref.id;
      B._vociSpesa.push(data);
      return _logWrite('voceSpesa', ref.id, 'Spesa — ' + NOME_VOCE, 'create', _diff({}, data, Object.keys(data)));
    }).then(function () { return data; });
  }

  function _sottospesaSquadra(voceId, nome) {
    return B._sottospese.find(function (s) { return s.voceSpesaId === voceId && s.tesseramentiSquadra === nome; }) || null;
  }

  function _upsertSquadra(voce, nome, totale, nota) {
    var s = _sottospesaSquadra(voce.id, nome);
    var etichetta = 'Sottospesa — ' + NOME_VOCE + ' / ';
    if (!s) {
      var data = {
        seasonId: B._currentSeasonId, voceSpesaId: voce.id, tipo: 'spesa', descrizione: 'Tesseramenti ' + nome,
        importo: 0, importoPreventivato: totale, data: '', nota: nota, notaAuto: nota, tesseramentiSquadra: nome,
        createdAt: new Date().toISOString()
      };
      var ref = db.collection('sottospese').doc();
      return ref.set(data).then(function () {
        data.id = ref.id;
        B._sottospese.push(data);
        return _logWrite('sottospesa', ref.id, etichetta + data.descrizione, 'create', _diff({}, data, Object.keys(data)));
      });
    }
    var patch = {}, old = {};
    if ((+s.importoPreventivato || 0) !== totale) { old.importoPreventivato = s.importoPreventivato || 0; patch.importoPreventivato = totale; }
    /* la nota si riscrive solo se è ancora quella generata: se qualcuno l'ha modificata a mano, si rispetta */
    if ((s.nota || '') === (s.notaAuto || '') && (s.nota || '') !== nota) {
      old.nota = s.nota || ''; patch.nota = nota; patch.notaAuto = nota;
    } else if ((s.notaAuto || '') !== nota) {
      patch.notaAuto = nota;
    }
    var campi = Object.keys(patch);
    if (!campi.length) return Promise.resolve();
    Object.assign(s, patch);
    return db.collection('sottospese').doc(s.id).update(patch).then(function () {
      var logCampi = campi.filter(function (k) { return k !== 'notaAuto'; });
      return logCampi.length ? _logWrite('sottospesa', s.id, etichetta + s.descrizione, 'update', _diff(old, patch, logCampi)) : null;
    });
  }

  var _coda = Promise.resolve();

  /* atleti: elenco con `categoria` e `dataNascita` (la scheda atleta li tiene in cache).
     → { totale, tesserati, senzaData, fuoriFasce, squadre } dello stato dopo l'aggiornamento. */
  function _ricalcola(atleti) {
    var run = function () {
      var C = A.tesseramentiCalc;
      var r = C.riepilogo(atleti);
      var voce = _voce();
      if (!voce && !r.squadre.length) return r;          /* niente da generare e niente da azzerare */
      return (voce ? Promise.resolve(voce) : _creaVoce()).then(function (v) {
        var presenti = {};
        var catena = Promise.resolve();
        r.squadre.forEach(function (s) {
          presenti[s.nome] = true;
          catena = catena.then(function () { return _upsertSquadra(v, s.nome, s.totale, C.dettaglio(s)); });
        });
        /* squadre che non hanno più tesserati calcolabili (data tolta, atleta spostato): preventivato a zero */
        B._sottospese.filter(function (s) { return s.voceSpesaId === v.id && s.tesseramentiSquadra && !presenti[s.tesseramentiSquadra]; })
          .forEach(function (s) {
            catena = catena.then(function () { return _upsertSquadra(v, s.tesseramentiSquadra, 0, 'Nessun atleta con costo di tesseramento calcolabile.'); });
          });
        return catena.then(function () {
          /* il Preventivato della voce segue le sottospese; se sono tutte a zero lo azzero io, perché la sincronizzazione standard non lo farebbe */
          return B._syncVoceDaSottospese(v.id).then(function () {
            if (!r.totale && (+v.importoPreventivato || 0) !== 0) {
              var old = { importoPreventivato: v.importoPreventivato || 0 }, patch = { importoPreventivato: 0 };
              v.importoPreventivato = 0;
              return db.collection('vociSpesa').doc(v.id).update(patch)
                .then(function () { return _logWrite('voceSpesa', v.id, 'Spesa — ' + NOME_VOCE, 'update', _diff(old, patch, ['importoPreventivato'])); });
            }
          });
        });
      }).then(function () {
        B._renderSpese(); B._renderStatCards(); B._renderCharts(); B._renderBilancio();
        return r;
      });
    };
    /* una alla volta: due salvataggi ravvicinati non devono creare due voci o due sottospese uguali */
    var p = _coda.then(run);
    _coda = p.catch(function (e) { console.error('[budget] tesseramenti', e); });
    return p;
  }

  B._ricalcolaTesseramenti = _ricalcola;

  /* Elenco atleti con categoria e data di nascita: quello già in memoria, altrimenti lo legge (2 raccolte). */
  function _elencoAtleti() {
    var inMemoria = A.atleti && A.atleti.elenco ? A.atleti.elenco() : [];
    if (inMemoria.length) return Promise.resolve(inMemoria);
    return Promise.all([db.collection('atleti').get(), db.collection('atletiDati').get()]).then(function (res) {
      var dati = {};
      res[1].forEach(function (d) { dati[d.id] = d.data(); });
      return res[0].docs.map(function (d) {
        return { categoria: d.data().categoria || '', dataNascita: (dati[d.id] || {}).dataNascita || '' };
      });
    });
  }

  /* Bottone «Ricalcola tesseramenti» nelle Spese */
  window.AdminActions.ricalcolaTesseramenti = function (btn) {
    if (btn) btn.disabled = true;
    _elencoAtleti().then(_ricalcola).then(function (r) {
      var righe = [r.tesserati + (r.tesserati === 1 ? ' atleta con costo di tesseramento' : ' atleti con costo di tesseramento') +
        ', totale ' + String(r.totale).replace('.', ',') + ' €.'];
      if (r.senzaData) righe.push(r.senzaData + ' senza data di nascita (il costo si genera quando la inserisci).');
      if (r.fuoriFasce) righe.push(r.fuoriFasce + ' nati dopo il 2021: nessuna fascia prevista.');
      if (r.escluse) righe.push(r.escluse + ' della categoria Open: esclusi per ora.');
      alert('Tesseramenti aggiornati.' + String.fromCharCode(10) + righe.join(String.fromCharCode(10)));
    }).catch(function (e) { alert('Errore: ' + e.message); })
      .then(function () { if (btn) btn.disabled = false; });
  };
})();
