/* Victor Volley — documento «Ricevuta di pagamento» (A4, da stampare o salvare in PDF).
   Condiviso da admin.html (registro ricevute) e atleta.html (download per le famiglie).
   L'impaginazione riproduce il foglio «Ricevuta» del modello Excel della società: intestazione con logo e banda blu,
   riga numero/data, bande «RICEVUTA RILASCIATA AL PAGATORE» e «DATI DEL VERSAMENTO», importo in evidenza,
   testi fissi (bollo, avvertenze), spazi per luogo/data e firma, logo in filigrana.
   Lavora solo sulla copia dei dati salvata nella ricevuta (pagatore, atleta, ASD): così il documento
   non cambia se l'anagrafica viene modificata dopo l'emissione.
   Espone window.RicevutaDoc = { html, open, openBlank, writeTo, eur, fmtDate }. */
(function (global) {
  'use strict';

  /* Indipendente da esc.js: atleta.html ha un proprio escape. Escapa anche l'apice. */
  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(n) {
    return (+n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function eur(n) { return num(n) + ' €'; }

  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  var BLU = '#4C95D9', ROSA = '#E8326A', GRIGIO = '#F3F6F8', BORDO = '#CFD6DD';

  var CSS = '@page{size:A4;margin:10mm}' +
    '*{box-sizing:border-box}' +
    'body{font-family:Calibri,"Segoe UI",Arial,Helvetica,sans-serif;color:#000;margin:0;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.doc{position:relative;max-width:780px;margin:0 auto}' +
    '.wm{position:absolute;left:50%;top:400px;transform:translateX(-50%);width:340px;opacity:.09;z-index:0}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed;position:relative;z-index:1}' +
    'td{border:1px solid ' + BORDO + ';padding:3px 6px;vertical-align:middle}' +
    '.logo{width:25%;text-align:center;background:#fff;padding:8px}' +
    '.logo img{width:96px;height:96px;object-fit:contain}' +
    '.tit{background:' + BLU + ';color:#fff;text-align:center;font-weight:700;font-size:21px;height:36px;border-color:' + BLU + '}' +
    '.asd{text-align:center;font-weight:700;font-size:17px;height:34px;border-top:0;border-bottom:0}' +
    '.sede{text-align:center;font-weight:700;font-size:11px;height:30px;border-top:0}' +
    '.lab{background:' + GRIGIO + ';font-style:italic;font-weight:700;font-size:11px;width:29.4%}' +
    '.lab.r{text-align:right;font-style:normal;font-size:12px}' +
    '.big{text-align:center;font-size:20px;height:30px}' +
    '.band{background:' + BLU + ';color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;height:20px;border-color:' + BLU + '}' +
    '.v{font-weight:700;font-size:11px}' +
    '.v.n{font-weight:400;font-size:13px}' +
    '.v.xl{font-size:17px}' +
    '.v.name{font-size:16px}' +
    '.imp-l{background:' + BLU + ';color:#fff;font-weight:700;font-size:20px;height:44px;border-color:' + BLU + ';width:64%}' +
    '.imp-r{background:' + ROSA + ';color:#000;font-weight:700;font-size:23px;text-align:center;border-color:' + ROSA + '}' +
    '.txt{font-weight:700;font-size:12px;padding:8px 6px;line-height:1.45}' +
    '.firma{height:78px;vertical-align:bottom;font-weight:700;font-size:11px;width:50%}' +
    '.firma span{display:block;font-weight:400;color:#555;margin-top:4px}' +
    '.annullata{background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;border-radius:6px;padding:8px 12px;margin:8px 0;font-size:12px;position:relative;z-index:1}' +
    '.stamp{position:absolute;top:240px;left:50%;transform:translateX(-50%) rotate(-18deg);border:6px solid #DC2626;color:#DC2626;z-index:2;' +
      'font-weight:800;font-size:68px;letter-spacing:.1em;padding:4px 26px;opacity:.3;pointer-events:none}';

  function riga(label, valore, cls) {
    return '<tr><td class="lab">' + h(label) + '</td><td class="v' + (cls ? ' ' + cls : '') + '">' + h(valore) + '</td></tr>';
  }

  /* Nome file suggerito al «Salva come PDF» (il browser usa il titolo della pagina). */
  function titolo(r) {
    var chi = ((r.atleta && r.atleta.nome) || (r.pagatore && r.pagatore.nome) || '').replace(/[^A-Za-z0-9À-ÿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return 'Ricevuta ' + String(r.numero || '').replace('/', '-') + (chi ? ' - ' + chi : '');
  }

  function html(r, origin) {
    var asd = r.asd || {}, pag = r.pagatore || {}, atl = r.atleta || null;
    var annullata = r.stato === 'annullata';
    var aff = [asd.affiliazione, asd.codiceAffiliazione].filter(Boolean).join(' ');
    var sede = 'Sede legale: ' + (asd.sede || '') + ' | Affiliazione: ' + aff + ' | RASD: ' + (asd.rasd ? 'Sì' : 'No');
    var daGenitore = pag.ruolo === 'Genitore / tutore';

    return '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>' + h(titolo(r)) + '</title>' +
      '<style>' + CSS + '</style></head><body><div class="doc">' +
      '<img class="wm" src="' + h(origin) + '/assets/logo.png" alt="">' +
      (annullata ? '<div class="stamp">ANNULLATA</div>' : '') +
      '<table><tr><td class="logo" rowspan="3"><img src="' + h(origin) + '/assets/logo.png" alt=""></td>' +
        '<td class="tit">RICEVUTA DI PAGAMENTO</td></tr>' +
        '<tr><td class="asd">' + h(asd.denominazione || 'ASD Victor Volley') + (asd.codiceFiscale ? ' — C.F. ' + h(asd.codiceFiscale) : '') + '</td></tr>' +
        '<tr><td class="sede">' + h(sede) + '</td></tr></table>' +
      '<table><tr><td class="lab r" style="width:29.4%">Numero ricevuta</td><td class="big" style="width:23.5%">' + h(r.numero) + '</td>' +
        '<td class="lab" style="width:23.5%;text-align:right">Data</td><td class="big" style="width:23.6%">' + h(fmtDate(r.data)) + '</td></tr></table>' +
      (annullata
        ? '<div class="annullata"><strong>Ricevuta annullata' + (r.dataAnnullamento ? ' il ' + h(fmtDate(r.dataAnnullamento)) : '') + '.</strong>' +
          (r.motivoAnnullamento ? ' Motivo: ' + h(r.motivoAnnullamento) + '.' : '') + ' Non ha validità come attestazione di pagamento.</div>'
        : '') +
      '<table><tr><td class="band" colspan="2">RICEVUTA RILASCIATA AL PAGATORE</td></tr>' +
        riga(daGenitore ? 'Genitore / tutore pagatore' : 'Pagatore', pag.nome, 'name') +
        riga('Codice fiscale', pag.cf) + riga('Indirizzo pagatore', pag.indirizzo) +
        '<tr><td class="band" colspan="2">DATI DEL VERSAMENTO</td></tr>' +
        (atl ? riga('Atleta / beneficiario', atl.nome) + riga('Codice fiscale atleta', atl.cf) : '') +
        riga('Tipo incasso', r.tipoIncasso, 'n') + riga('Causale / periodo', r.causale, 'n xl') +
        riga('Modalità di pagamento', r.modalita, 'n') + riga('Riferimento pagamento', r.riferimento, 'n') +
        (atl ? riga('Data nascita atleta', fmtDate(atl.dataNascita)) : '') + '</table>' +
      '<table><tr><td class="imp-l">IMPORTO RICEVUTO</td><td class="imp-r">€ ' + h(num(r.importo)) + '</td></tr></table>' +
      '<table>' +
        (r.bollo ? '<tr><td class="txt">' + h(r.bollo) + '</td></tr>' : '') +
        '<tr><td class="txt">La presente ricevuta attesta esclusivamente l’incasso indicato. La qualificazione fiscale dipende dalla natura effettiva del rapporto e dai requisiti dell’ASD e del soggetto versante.</td></tr>' +
        '<tr><td class="txt">Per spese sportive potenzialmente detraibili, registrare un pagamento tracciabile e indicare chiaramente atleta, attività e periodo.</td></tr>' +
        '</table>' +
      '<table><tr><td class="firma">Luogo e data<span>____________________________</span></td>' +
        '<td class="firma">Il Presidente / incaricato<span>Firma ____________________________</span></td></tr></table>' +
      '</div></body></html>';
  }

  /* La finestra va aperta subito nel gestore del clic (altrimenti il browser blocca i popup) e riempita dopo,
     quando la ricevuta è pronta. Ritorna null se i popup sono bloccati. */
  function openBlank() {
    var w = global.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Ricevuta</title></head>' +
        '<body style="font-family:Arial,sans-serif;color:#475569;padding:24px">Generazione della ricevuta…</body></html>');
      w.document.close();
    }
    return w;
  }

  function writeTo(w, r) {
    w.document.open();
    w.document.write(html(r, global.location.origin));
    w.document.close();
    /* il logo deve essere caricato prima della stampa */
    var stampa = function () { w.focus(); w.print(); };
    setTimeout(stampa, 700);
  }

  /* Apre la finestra di stampa del browser («Salva come PDF»). Ritorna false se i popup sono bloccati. */
  function open(r) {
    var w = openBlank();
    if (!w) return false;
    writeTo(w, r);
    return true;
  }

  global.RicevutaDoc = { html: html, open: open, openBlank: openBlank, writeTo: writeTo, eur: eur, fmtDate: fmtDate };
})(window);
