/* Victor Volley — Admin: calcolo della vista «Prezzi» (Atleti → Prezzi).
   Funzioni pure, senza DOM né Firestore: ricevono le quantità già contate e restituiscono totali, IVA e riepilogo.
   Espone window.Admin.prezziCalc. Collaudo: node scripts/check-prezzi.js */
(function () {
  'use strict';
  var A = window.Admin = window.Admin || {};

  var ALIQUOTA = 22;   /* IVA % */

  function r2(x) { return Math.round((+x || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100; }
  function num(x) { var n = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isFinite(n) ? n : 0; }

  /* righe: [{ voce, modello, qta, prezzo, stampa, daIndicare }]  (prezzo e stampa = € a capo, IVA esclusa)
     extra: [{ id, desc, qta, importo, ivaInclusa, segno }]       (segno: 1 costo, -1 detrazione; qta già calcolata)
     → { righe[], extra[], totCapi, totStampa, totRighe, base, ivaBase, imponibile, iva, totale } */
  function calcola(righe, extra, aliquota) {
    var al = aliquota == null ? ALIQUOTA : aliquota;
    var rr = (righe || []).map(function (r) {
      var qta = Math.max(0, parseInt(r.qta, 10) || 0), prezzo = num(r.prezzo), stampa = num(r.stampa);
      var totCapo = r2(qta * prezzo), totStampa = r2(qta * stampa);
      return { voce: r.voce, modello: r.modello || '', qta: qta, prezzo: prezzo, stampa: stampa, daIndicare: r.daIndicare || 0,
        totCapo: totCapo, totStampa: totStampa, totRiga: r2(totCapo + totStampa) };
    });
    var totCapi = r2(rr.reduce(function (s, r) { return s + r.totCapo; }, 0));
    var totStampa = r2(rr.reduce(function (s, r) { return s + r.totStampa; }, 0));
    var totRighe = r2(totCapi + totStampa);

    /* voci extra: quelle a IVA esclusa si sommano alla base dei capi (un'unica IVA sul totale), quelle già con IVA si scorporano una per una */
    var baseExtra = 0;
    var ee = (extra || []).map(function (x) {
      var segno = x.segno === -1 ? -1 : 1, qta = x.qta == null ? 1 : num(x.qta), importo = num(x.importo);
      var lordo = r2(segno * qta * importo), imp, iva;
      if (x.ivaInclusa) { imp = r2(lordo / (1 + al / 100)); iva = r2(lordo - imp); }
      else { imp = lordo; iva = null; baseExtra += lordo; }
      return { id: x.id, desc: x.desc || '', qta: qta, importo: importo, segno: segno, ivaInclusa: !!x.ivaInclusa, imponibile: imp, iva: iva, lordo: lordo };
    });
    var base = r2(totRighe + baseExtra);
    var ivaBase = r2(base * al / 100);
    ee.forEach(function (x) { x.conIva = x.ivaInclusa ? x.lordo : null; });

    var imponibile = base, iva = ivaBase;
    ee.forEach(function (x) { if (x.ivaInclusa) { imponibile += x.imponibile; iva += x.iva; } });
    imponibile = r2(imponibile); iva = r2(iva);
    return { righe: rr, extra: ee, totCapi: totCapi, totStampa: totStampa, totRighe: totRighe, base: base, ivaBase: ivaBase,
      imponibile: imponibile, iva: iva, totale: r2(imponibile + iva), aliquota: al };
  }

  /* Formato italiano: 1.234,50 € */
  function eur(x) {
    var n = r2(x), neg = n < 0, s = Math.abs(n).toFixed(2).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '− ' : '') + s[0] + ',' + s[1] + ' €';
  }

  A.prezziCalc = { calcola: calcola, eur: eur, r2: r2, num: num, ALIQUOTA: ALIQUOTA };
})();
