/* Victor Volley — documento «Ricevuta di pagamento» (A4, da stampare o salvare in PDF).
   Condiviso da admin.html (registro ricevute) e atleta.html (download per le famiglie).
   Lavora solo sulla copia dei dati salvata nella ricevuta (pagatore, atleta, ASD): così il documento
   non cambia se l'anagrafica viene modificata dopo l'emissione.
   Espone window.RicevutaDoc = { html, open, eur, fmtDate }. */
(function (global) {
  'use strict';

  /* Indipendente da esc.js: atleta.html ha un proprio escape. Escapa anche l'apice. */
  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function eur(n) {
    return (+n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  var CSS = '@page{size:A4;margin:14mm}' +
    '*{box-sizing:border-box}' +
    'body{font-family:"Manrope",Arial,Helvetica,sans-serif;color:#1E293B;margin:0;font-size:12.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.doc{max-width:780px;margin:0 auto;position:relative}' +
    '.head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0F172A;padding-bottom:12px;margin-bottom:16px}' +
    '.logo{width:56px;height:56px;object-fit:contain}' +
    '.asd{font-family:"Barlow",Arial,sans-serif;font-weight:700;font-size:19px;color:#0F172A}' +
    '.asd-sub{font-size:10.5px;color:#475569;line-height:1.5;margin-top:2px}' +
    'h1{font-family:"Barlow",Arial,sans-serif;font-size:24px;letter-spacing:.04em;margin:0 0 4px;color:#0F172A}' +
    '.numrow{display:flex;gap:28px;margin-bottom:18px;font-size:13px}' +
    '.numrow strong{font-size:15px}' +
    '.box{border:1px solid #CBD5E1;border-radius:8px;padding:12px 14px;margin-bottom:14px}' +
    '.box h2{font-family:"Barlow",Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;margin:0 0 8px}' +
    '.row{display:flex;gap:10px;padding:3px 0}' +
    '.row .k{width:170px;flex:none;color:#64748B}' +
    '.row .v{font-weight:600}' +
    '.importo{display:flex;justify-content:space-between;align-items:center;background:#F1F5F9;border:2px solid #0F172A;border-radius:8px;padding:12px 16px;margin:16px 0}' +
    '.importo .k{font-family:"Barlow",Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.05em}' +
    '.importo .v{font-family:"Barlow",Arial,sans-serif;font-weight:700;font-size:26px}' +
    '.bollo{font-size:11px;color:#334155;margin:10px 0}' +
    '.note{font-size:10px;color:#64748B;line-height:1.5;margin:10px 0}' +
    '.firme{display:flex;justify-content:space-between;gap:30px;margin-top:34px;font-size:11.5px}' +
    '.firme div{flex:1;border-top:1px solid #94A3B8;padding-top:6px;color:#475569}' +
    '.stamp{position:absolute;top:210px;left:50%;transform:translateX(-50%) rotate(-18deg);border:6px solid #DC2626;color:#DC2626;' +
      'font-family:"Barlow",Arial,sans-serif;font-weight:800;font-size:64px;letter-spacing:.1em;padding:4px 26px;opacity:.28;pointer-events:none}' +
    '.annullata{background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;border-radius:8px;padding:9px 12px;margin-bottom:14px;font-size:11.5px}';

  function row(k, v) {
    return v ? '<div class="row"><span class="k">' + h(k) + '</span><span class="v">' + h(v) + '</span></div>' : '';
  }

  function html(r, origin) {
    var asd = r.asd || {}, pag = r.pagatore || {}, atl = r.atleta || null;
    var annullata = r.stato === 'annullata';
    var sub = [];
    if (asd.codiceFiscale) sub.push('C.F. ' + asd.codiceFiscale);
    if (asd.sede) sub.push('Sede legale: ' + asd.sede);
    var aff = [asd.affiliazione, asd.codiceAffiliazione].filter(Boolean).join(' ');
    if (aff) sub.push('Affiliazione: ' + aff);
    if (asd.rasd) sub.push('Iscritta al RASD');

    return '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Ricevuta ' + h(r.numero) + ' — ' + h(asd.denominazione || 'Victor Volley') + '</title>' +
      '<link rel="stylesheet" href="' + h(origin) + '/css/fonts.css"><style>' + CSS + '</style></head><body><div class="doc">' +
      (annullata ? '<div class="stamp">ANNULLATA</div>' : '') +
      '<header class="head"><img class="logo" src="' + h(origin) + '/assets/logo.png" alt="">' +
        '<div><div class="asd">' + h(asd.denominazione || 'ASD Victor Volley') + '</div>' +
        '<div class="asd-sub">' + sub.map(h).join('<br>') + '</div></div></header>' +
      '<h1>RICEVUTA DI PAGAMENTO</h1>' +
      '<div class="numrow"><span>Numero <strong>' + h(r.numero) + '</strong></span><span>Data <strong>' + h(fmtDate(r.data)) + '</strong></span></div>' +
      (annullata
        ? '<div class="annullata"><strong>Ricevuta annullata' + (r.dataAnnullamento ? ' il ' + h(fmtDate(r.dataAnnullamento)) : '') + '.</strong>' +
          (r.motivoAnnullamento ? ' Motivo: ' + h(r.motivoAnnullamento) : '') + ' Non ha validità come attestazione di pagamento.</div>'
        : '') +
      '<section class="box"><h2>Ricevuta rilasciata a</h2>' +
        row(pag.ruolo || 'Pagatore', pag.nome) + row('Codice fiscale', pag.cf) + row('Indirizzo', pag.indirizzo) + '</section>' +
      '<section class="box"><h2>Dati del versamento</h2>' +
        (atl ? row('Atleta / beneficiario', atl.nome) + row('Codice fiscale atleta', atl.cf) + row('Data di nascita atleta', fmtDate(atl.dataNascita)) : '') +
        row('Tipo di incasso', r.tipoIncasso) + row('Causale / periodo', r.causale) +
        row('Modalità di pagamento', r.modalita) + row('Riferimento pagamento', r.riferimento) + '</section>' +
      '<div class="importo"><span class="k">Importo ricevuto</span><span class="v">' + h(eur(r.importo)) + '</span></div>' +
      (r.bollo ? '<p class="bollo">' + h(r.bollo) + '</p>' : '') +
      '<p class="note">La presente ricevuta attesta esclusivamente l’incasso indicato. La qualificazione fiscale dipende dalla natura effettiva del rapporto e dai requisiti dell’ASD e del soggetto versante. ' +
        'Per eventuali detrazioni delle spese sportive conservare la prova di un pagamento tracciabile.</p>' +
      '<div class="firme"><div>Luogo e data</div><div>Il Presidente / incaricato — firma</div></div>' +
      '</div></body></html>';
  }

  /* Apre la finestra di stampa del browser («Salva come PDF»). Ritorna false se i popup sono bloccati. */
  function open(r) {
    var w = global.open('', '_blank');
    if (!w) return false;
    w.document.open();
    w.document.write(html(r, global.location.origin));
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 400);
    return true;
  }

  global.RicevutaDoc = { html: html, open: open, eur: eur, fmtDate: fmtDate };
})(window);
