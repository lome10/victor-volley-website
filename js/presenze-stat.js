/* Victor Volley — Statistiche di presenza per atleta (stesse regole per admin e area allenatore; si provano da sole,
   vedi scripts/check-allenatore.js). Conta solo gli allenamenti già SEGNATI: un giorno senza risposta non abbassa la
   percentuale, altrimenti chi segna in ritardo penalizzerebbe l'atleta. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PresenzeStat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Soglie dei colori del numero (solo grafica, nessun giudizio). */
  var SOGLIA_VERDE = 80;
  var SOGLIA_AMBRA = 65;
  var ULTIMI = 8;

  /**
   * giorni = date AAAA-MM-GG di allenamento già avvenuti (anche doppie o in disordine);
   * stati = { data: 'p' | 'a' } per quell'atleta (qualsiasi altro valore = non segnato).
   * Restituisce { si, no, segnate, nr, pct, ultimi, assenzeDiFila }: `ultimi` = fino a 8 stati dal più vecchio
   * al più recente ('p' | 'a' | ''), `assenzeDiFila` = assenze consecutive più recenti (i giorni non segnati si saltano).
   */
  function calcola(giorni, stati) {
    var visti = {};
    var date = (giorni || []).filter(function (d) { if (visti[d]) return false; visti[d] = true; return true; })
      .sort().reverse();
    var si = 0, no = 0, ultimi = [], assenzeDiFila = 0, serie = true;
    date.forEach(function (d) {
      var s = stati && (stati[d] === 'p' || stati[d] === 'a') ? stati[d] : '';
      if (s === 'p') si++;
      else if (s === 'a') no++;
      if (ultimi.length < ULTIMI) ultimi.push(s);
      if (serie && s) { if (s === 'a') assenzeDiFila++; else serie = false; }
    });
    var segnate = si + no;
    var pct = segnate ? Math.round(si / segnate * 100) : null;
    return {
      si: si, no: no, segnate: segnate, nr: date.length - segnate, pct: pct,
      ultimi: ultimi.reverse(), assenzeDiFila: assenzeDiFila
    };
  }

  /** Colore del numero: verde dall'80%, ambra dal 65%, rosso sotto, grigio se non c'è niente di segnato. */
  function colore(pct) {
    if (pct === null || pct === undefined) return '#64748B';
    return pct >= SOGLIA_VERDE ? '#16A34A' : pct >= SOGLIA_AMBRA ? '#B45309' : '#DC2626';
  }

  /** Media delle percentuali (solo di chi ha qualcosa di segnato), o null. */
  function media(lista) {
    var v = lista.filter(function (x) { return x && x.pct !== null; });
    return v.length ? Math.round(v.reduce(function (a, x) { return a + x.pct; }, 0) / v.length) : null;
  }

  /** Primo giorno della stagione (1 settembre) a cui appartiene `oggi`. */
  function inizioStagione(oggi) {
    var y = +oggi.slice(0, 4), m = +oggi.slice(5, 7);
    return (m >= 9 ? y : y - 1) + '-09-01';
  }

  return { calcola: calcola, colore: colore, media: media, inizioStagione: inizioStagione, ULTIMI: ULTIMI };
});
