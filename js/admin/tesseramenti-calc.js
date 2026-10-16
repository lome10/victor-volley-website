/* Victor Volley — Admin: costo di tesseramento per atleta (regola 2026/27).
   Funzioni pure, senza DOM né Firestore. Espone window.Admin.tesseramentiCalc.
   Collaudo: node scripts/check-tesseramenti.js

   Regola (decisa dalla società, per anno di nascita):
     2014–2021 → 5 €   ·   2011–2013 → 7 €   ·   2003–2010 → 10 €   ·   2002 e prima → 18 €
     OPE (minivolley S3) → 5 €, qualunque sia la data di nascita.
     La categoria «Open» è a parte: per ora è esclusa (nessun costo, non conta tra i «senza data»).
   Senza data di nascita (e non OPE) il costo non c'è ancora: si genera man mano che le date vengono inserite. */
(function () {
  'use strict';
  var A = window.Admin = window.Admin || {};

  /* da: primo anno di nascita compreso, a: ultimo (null = senza limite) */
  var FASCE = [
    { da: 2014, a: 2021, importo: 5,  etichetta: 'nati/e dal 2014 al 2021' },
    { da: 2011, a: 2013, importo: 7,  etichetta: 'nati/e dal 2011 al 2013' },
    { da: 2003, a: 2010, importo: 10, etichetta: 'nati/e dal 2003 al 2010' },
    { da: null, a: 2002, importo: 18, etichetta: 'nati/e nel 2002 e anni precedenti' }
  ];
  var OPE = { importo: 5, etichetta: 'OPE (minivolley S3)' };

  function r2(x) { return Math.round((+x || 0) * 100 + 1e-9) / 100; }

  /* La categoria OPE è il minivolley S3: «S3 - Minivolley», «Minivolley», «S3»… */
  function isOpe(categoria) {
    return /(^|[^a-z0-9])s3([^a-z0-9]|$)|minivolley|mini volley/i.test(String(categoria || ''));
  }

  /* Categoria «Open»: esclusa dal calcolo finché la società non ne decide la quota */
  function isEsclusa(categoria) {
    return /(^|[^a-z0-9])open([^a-z0-9]|$)/i.test(String(categoria || ''));
  }

  function annoNascita(dataNascita) {
    var m = /^(\d{4})-\d{2}-\d{2}$/.exec(String(dataNascita || ''));
    return m ? +m[1] : null;
  }

  /* → { importo, etichetta } oppure null se non si può ancora calcolare
       (nessuna data di nascita, o nata dopo il 2021: nessuna fascia prevista) */
  function costo(atleta) {
    atleta = atleta || {};
    if (isEsclusa(atleta.categoria)) return null;
    if (isOpe(atleta.categoria)) return { importo: OPE.importo, etichetta: OPE.etichetta };
    var y = annoNascita(atleta.dataNascita);
    if (y == null) return null;
    for (var i = 0; i < FASCE.length; i++) {
      var f = FASCE[i];
      if ((f.da == null || y >= f.da) && (f.a == null || y <= f.a)) return { importo: f.importo, etichetta: f.etichetta };
    }
    return null;
  }

  /* atleti → { squadre: [{ nome, n, totale, righe: [{ importo, etichetta, n }] }], totale, tesserati, senzaData, fuoriFasce, escluse }
     Una squadra per categoria dell'atleta (ordinata per nome); gli atleti senza categoria vanno in «Senza categoria». */
  function riepilogo(atleti) {
    var per = {}, out = { squadre: [], totale: 0, tesserati: 0, senzaData: 0, fuoriFasce: 0, escluse: 0 };
    (atleti || []).forEach(function (a) {
      var nome = String(a.categoria || '').trim() || 'Senza categoria';
      var c = costo(a);
      if (!c) {
        if (isEsclusa(a.categoria)) { out.escluse++; return; }
        if (annoNascita(a.dataNascita) == null) out.senzaData++; else out.fuoriFasce++;
        return;
      }
      var s = per[nome] || (per[nome] = { nome: nome, n: 0, totale: 0, righe: {} });
      s.n++; s.totale = r2(s.totale + c.importo);
      var k = c.importo + '|' + c.etichetta;
      var r = s.righe[k] || (s.righe[k] = { importo: c.importo, etichetta: c.etichetta, n: 0 });
      r.n++;
      out.tesserati++; out.totale = r2(out.totale + c.importo);
    });
    out.squadre = Object.keys(per).sort(function (x, y) { return x.localeCompare(y, 'it'); }).map(function (k) {
      var s = per[k];
      s.righe = Object.keys(s.righe).map(function (rk) { return s.righe[rk]; }).sort(function (x, y) { return x.importo - y.importo; });
      return s;
    });
    return out;
  }

  /* «3 × 5 € (OPE) · 2 × 10 € (nati/e dal 2003 al 2010)» — per la nota della sottospesa */
  function dettaglio(squadra) {
    return squadra.righe.map(function (r) {
      return r.n + ' × ' + String(r.importo).replace('.', ',') + ' € (' + r.etichetta + ')';
    }).join(' · ');
  }

  A.tesseramentiCalc = { FASCE: FASCE, isOpe: isOpe, isEsclusa: isEsclusa, costo: costo, riepilogo: riepilogo, dettaglio: dettaglio };
})();
