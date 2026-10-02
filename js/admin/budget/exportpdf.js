/* Victor Volley — Admin / Budget: export PDF (bilancio, spese, singole voci).
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
  /* ---- EXPORT PDF (bilancio + spese per categoria + singole voci), via finestra di stampa del browser ---- */
  function _pdfCss() {
    return 'body{font-family:Arial,Helvetica,sans-serif;color:#1E293B;margin:0;padding:32px}' +
      'header{border-bottom:3px solid #1E3A5F;padding-bottom:12px;margin-bottom:26px}' +
      'header h1{margin:0 0 4px;font-size:19px;color:#1E3A5F}' +
      'header p{margin:0;font-size:12px;color:#64748B}' +
      /* Le sezioni possono contenere tabelle lunghe più di una pagina: "avoid" su tutta
         la section spingerebbe l'intero blocco alla pagina dopo appena non entra più,
         lasciando un vuoto in fondo a quella precedente. Si evita solo di spezzare una
         riga a metà (tr) o di lasciare un titolo orfano in fondo pagina (h2); l'intestazione
         della tabella si ripete da sola a ogni nuova pagina (thead). */
      'section{margin-bottom:26px}' +
      'h2{font-size:14px;color:#1E3A5F;border-bottom:1px solid #E2E8F0;padding-bottom:6px;margin:0 0 10px;page-break-after:avoid}' +
      'table{width:100%;border-collapse:collapse;font-size:11px}' +
      'thead{display:table-header-group}' +
      'tr{page-break-inside:avoid}' +
      'th,td{padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:left}' +
      'th{background:#F8FAFC;font-weight:700;color:#1E3A5F}' +
      '.pdf-stat-row{display:flex;gap:10px;flex-wrap:wrap}' +
      '.pdf-stat-card{flex:1;min-width:110px;background:#F8FAFC;border-radius:8px;padding:10px 12px}' +
      '.pdf-stat-label{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.03em}' +
      '.pdf-stat-value{font-size:15px;font-weight:700;margin-top:2px}' +
      'footer{margin-top:8px;font-size:10px;color:#94A3B8;text-align:center}' +
      '@media print{body{padding:12px}}';
  }

  function _pdfStatRow(items) {
    return '<div class="pdf-stat-row">' + items.map(function (it) {
      return '<div class="pdf-stat-card"><div class="pdf-stat-label">' + esc(it[0]) + '</div><div class="pdf-stat-value">' + B._eur(it[1]) + '</div></div>';
    }).join('') + '</div>';
  }

  function _pdfTableHtml(headers, rows, emptyMsg) {
    if (!rows.length) return '<p style="color:#94A3B8;font-size:12px">' + esc(emptyMsg) + '</p>';
    var thead = '<tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>';
    var tbody = rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('');
    return '<table><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
  }

  /* ---- PDF "gestionale" — solo per il dettaglio di una voce di spesa (letterhead con
     logo, card KPI, barra di avanzamento, tabelle con stato colorato). Foglio di stile
     a sé, separato da _pdfCss/_pdfStatRow/_pdfTableHtml che restano quelli usati da
     exportSpesePdf, per non cambiargli l'aspetto. */
  function _pdfCssRicco() {
    return '@page{size:A4;margin:16mm 14mm}' +
      '*{box-sizing:border-box}' +
      'body{font-family:"Manrope",Arial,Helvetica,sans-serif;color:#1E293B;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12.5px}' +
      '.doc{max-width:800px;margin:0 auto}' +
      'h1,h2{font-family:"Barlow","Poppins",Arial,sans-serif;margin:0}' +
      '.letterhead{display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#0F172A 0%,#1E3A5F 100%);color:#fff;padding:18px 22px;border-radius:10px;margin-bottom:22px}' +
      '.letterhead-brand{display:flex;align-items:center;gap:12px}' +
      '.letterhead-logo{width:42px;height:42px;object-fit:contain;border-radius:8px;background:#fff;padding:3px}' +
      '.letterhead-club{font-family:"Barlow",sans-serif;font-weight:700;font-size:17px;letter-spacing:.01em}' +
      '.letterhead-sub{font-size:10.5px;color:rgba(255,255,255,.68);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}' +
      '.letterhead-meta{text-align:right;font-size:10.5px;color:rgba(255,255,255,.85)}' +
      '.letterhead-doctype{font-family:"Barlow",sans-serif;font-weight:700;font-size:11.5px;color:#fff;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}' +
      '.letterhead-metarow strong{color:#fff;font-weight:700;margin-left:4px}' +
      '.titleblock{margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #E2E8F0}' +
      '.titleblock h1{font-size:22px;color:#0F172A;font-weight:700}' +
      '.titleblock-tags{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}' +
      '.tag{font-size:10.5px;background:#F1F5F9;color:#475569;border-radius:999px;padding:3px 11px;font-weight:600}' +
      '.titleblock-note{margin:8px 0 0;font-size:11.5px;color:#64748B;font-style:italic}' +
      '.kpis{display:flex;gap:10px;margin-bottom:16px}' +
      '.kpi{flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-top:3px solid #94A3B8;border-radius:8px;padding:10px 12px}' +
      '.kpi-label{font-size:9.5px;color:#64748B;text-transform:uppercase;letter-spacing:.05em;font-weight:700}' +
      '.kpi-value{font-size:17px;font-weight:700;color:#0F172A;margin-top:3px;font-family:"Barlow",sans-serif}' +
      '.kpi--accent{border-top-color:#008CFD}' +
      '.kpi--pos{border-top-color:#EF4444}.kpi--pos .kpi-value{color:#DC2626}' +
      '.kpi--neg{border-top-color:#10B981}.kpi--neg .kpi-value{color:#059669}' +
      '.progress{margin:4px 0 22px}' +
      '.progress-row{display:flex;justify-content:space-between;font-size:10.5px;color:#475569;font-weight:600;margin-bottom:5px}' +
      '.progress-track{height:8px;background:#E2E8F0;border-radius:999px;overflow:hidden}' +
      '.progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#008CFD,#053063)}' +
      '.progress-fill--over{background:linear-gradient(90deg,#F59E0B,#EF4444)}' +
      /* Niente "avoid" sull'intero .block: con una tabella lunga più di una pagina lo
         spingerebbe tutto alla pagina dopo, lasciando un vuoto in fondo a quella prima.
         Si evita solo di spezzare una riga a metà o lasciare il titolo orfano in fondo
         pagina; l'intestazione della tabella si ripete da sola a ogni pagina nuova. */
      '.block{margin-bottom:20px}' +
      '.block-hd{display:flex;align-items:center;gap:8px;margin-bottom:9px;page-break-after:avoid}' +
      '.block-dot{width:9px;height:9px;border-radius:50%;display:inline-block}' +
      '.block-dot--spesa{background:#053063}' +
      '.block-dot--credito{background:#10B981}' +
      '.block-hd h2{font-size:13.5px;color:#0F172A;font-weight:700;text-transform:uppercase;letter-spacing:.03em}' +
      '.block-count{font-size:10.5px;color:#94A3B8;font-weight:600}' +
      '.doc table{width:100%;border-collapse:collapse;font-size:11px}' +
      '.doc thead{display:table-header-group}' +
      '.doc tr{page-break-inside:avoid}' +
      '.doc th{background:#0F172A;color:#fff;font-family:"Barlow",sans-serif;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:7px 9px}' +
      '.doc th.num,.doc td.num{text-align:right}' +
      '.doc td{padding:6.5px 9px;border-bottom:1px solid #E2E8F0}' +
      '.doc tbody tr:nth-child(even){background:#F8FAFC}' +
      '.doc tr.total-row td{border-top:2px solid #0F172A;border-bottom:none;font-weight:700;color:#0F172A;background:#F1F5F9;padding-top:8px;padding-bottom:8px}' +
      '.empty-row td{text-align:center;color:#94A3B8;font-style:italic;padding:14px}' +
      '.badge{display:inline-block;font-size:9.5px;font-weight:700;padding:2.5px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.02em}' +
      '.badge--ok{background:#ECFDF5;color:#059669}' +
      '.badge--mid{background:#EFF6FF;color:#2563EB}' +
      '.badge--warn{background:#FFFBEB;color:#B45309}' +
      '.recap{margin-top:4px;margin-bottom:20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 18px;page-break-inside:avoid}' +
      '.recap-title{font-family:"Barlow",sans-serif;font-weight:700;font-size:12.5px;color:#0F172A;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}' +
      '.recap-row{display:flex;justify-content:space-between;font-size:12.5px;padding:5px 0}' +
      '.recap-row strong{font-family:"Barlow",sans-serif}' +
      '.recap-row--net{border-top:1px solid #CBD5E1;margin-top:4px;padding-top:9px;font-size:14px}' +
      '.recap-row--net strong{color:#0F172A;font-size:16px}' +
      '.recap-caption{margin:8px 0 0;font-size:9.5px;color:#94A3B8}' +
      '.doc footer{margin-top:18px;padding-top:10px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:9.5px;color:#94A3B8}';
  }

  /* badge dello stato: stessi 3 colori del pannello (in_trattativa=ambra, contattato=blu, chiuso=verde). */
  function _pdfBadgeKind(badgeKey) {
    if (badgeKey === 'chiuso') return 'ok';
    if (badgeKey === 'contattato') return 'mid';
    return 'warn';
  }
  function _pdfBadgeHtml(label, kind) {
    var cls = kind === 'ok' ? 'badge--ok' : kind === 'mid' ? 'badge--mid' : 'badge--warn';
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }
  function _pdfKpiCard(label, value, variant) {
    return '<div class="kpi' + (variant ? ' kpi--' + variant : '') + '"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + B._eurSigned(value) + '</div></div>';
  }
  /* headers = etichette di Preventivato/Pagato (diverse per spese e crediti); rows = righe
     già pronte da _pdfSottospesaRow(); totalRow = { prev, eff } o null per non stampare il totale. */
  function _pdfSectionHtml(dotClass, title, count, headers, rows, emptyMsg, totalRow) {
    var thead = '<tr><th>Descrizione</th><th class="num">' + esc(headers[0]) + '</th><th class="num">' + esc(headers[1]) + '</th><th>Stato</th><th>Data</th><th>Nota</th></tr>';
    var body;
    if (!rows.length) {
      body = '<tr class="empty-row"><td colspan="6">' + esc(emptyMsg) + '</td></tr>';
    } else {
      body = rows.map(function (r) {
        return '<tr><td>' + r.desc + '</td><td class="num">' + r.prev + '</td><td class="num">' + r.eff + '</td><td>' + r.stato + '</td><td>' + r.data + '</td><td>' + r.nota + '</td></tr>';
      }).join('');
      if (totalRow) body += '<tr class="total-row"><td>Totale</td><td class="num">' + totalRow.prev + '</td><td class="num">' + totalRow.eff + '</td><td></td><td></td><td></td></tr>';
    }
    return '<section class="block">' +
      '<div class="block-hd"><span class="block-dot ' + dotClass + '"></span><h2>' + esc(title) + '</h2><span class="block-count">' + count + '</span></div>' +
      '<table><thead>' + thead + '</thead><tbody>' + body + '</tbody></table>' +
    '</section>';
  }

  /* Export PDF del dettaglio di una singola voce di spesa (es. "Evento 1500€"): letterhead
     con logo, KPI (preventivato/sostenuto/scostamento/da pagare), barra di avanzamento,
     tabella Spese e — se presenti — tabella Crediti/incassi con un riepilogo a parte
     (il netto qui è solo per la stampa: non tocca Sostenuto/Preventivato né Bilancio). */
  DG.exportSottospesePdf = function (voceId) {
    var v = B._vociSpesa.find(function (x) { return x.id === voceId; });
    if (!v) return;
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
    var cat = v.categoriaSpesaId ? B._categoriaSpesaById(v.categoriaSpesaId) : null;
    var elenco = B._sottospeseOf(voceId).slice().sort(function (a, b) { return (a.data || '') < (b.data || '') ? -1 : 1; });
    var spese = elenco.filter(function (s) { return !B._isSottospesaCredito(s); });
    var crediti = elenco.filter(B._isSottospesaCredito);
    var somma = B._sommaSottospese(voceId);
    var sommaPrev = B._sommaSottospesePreventivate(voceId);
    var daPagare = spese.reduce(function (t, s) { return t + Math.max(0, (+s.importoPreventivato || 0) - (+s.importo || 0)); }, 0);
    var incassato = B._sommaSottospeseIncassato(voceId);
    var incassoPrevisto = B._sommaSottospeseIncassoPrevisto(voceId);
    var oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

    var preventivato = v.importoPreventivato || 0, sostenuto = v.importoSostenuto || 0;
    var scostamento = sostenuto - preventivato;
    var pct = preventivato > 0 ? Math.round(sostenuto / preventivato * 100) : (sostenuto > 0 ? 100 : 0);
    var over = sostenuto > preventivato && preventivato > 0;

    function pdfRow(s) {
      var st = B._statoSottospesa(s);
      return {
        desc: esc(s.descrizione),
        prev: B._eur(s.importoPreventivato || 0),
        eff: B._eur(s.importo || 0),
        stato: _pdfBadgeHtml(st.label, _pdfBadgeKind(st.badge)),
        data: s.data ? esc(_fmtDateLong(s.data)) : '—',
        nota: esc(s.nota || '')
      };
    }

    var logoUrl = location.origin + '/assets/logo.png';
    var fontsUrl = location.origin + '/css/fonts.css';

    var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>' + esc(v.categoria) + ' — Report Budget — Victor Volley</title>' +
      '<link rel="stylesheet" href="' + fontsUrl + '">' +
      '<style>' + _pdfCssRicco() + '</style></head><body><div class="doc">';

    html += '<header class="letterhead">' +
      '<div class="letterhead-brand"><img class="letterhead-logo" src="' + logoUrl + '" alt=""><div><div class="letterhead-club">Victor Volley</div><div class="letterhead-sub">Area Dirigenti &middot; Report Budget</div></div></div>' +
      '<div class="letterhead-meta"><div class="letterhead-doctype">Dettaglio voce di spesa</div>' +
      '<div class="letterhead-metarow"><span>Stagione</span><strong>' + esc(season.nome || '—') + '</strong></div>' +
      '<div class="letterhead-metarow"><span>Generato il</span><strong>' + oggi + '</strong></div></div>' +
    '</header>';

    html += '<div class="titleblock"><h1>' + esc(v.categoria) + '</h1>' +
      '<div class="titleblock-tags">' +
        '<span class="tag">Categoria: ' + esc(cat ? cat.nome : '—') + '</span>' +
        (v.dataSpesa ? '<span class="tag">Data: ' + esc(_fmtDateLong(v.dataSpesa)) + '</span>' : '') +
      '</div>' +
      (v.note ? '<p class="titleblock-note">' + esc(v.note) + '</p>' : '') +
    '</div>';

    html += '<div class="kpis">' +
      _pdfKpiCard('Preventivato', preventivato) +
      _pdfKpiCard('Sostenuto', sostenuto, 'accent') +
      _pdfKpiCard('Scostamento', scostamento, scostamento > 0 ? 'pos' : 'neg') +
      _pdfKpiCard('Ancora da pagare', daPagare) +
    '</div>';

    html += '<div class="progress"><div class="progress-row"><span>Avanzamento spesa rispetto al preventivo</span><span>' + pct + '%</span></div>' +
      '<div class="progress-track"><div class="progress-fill' + (over ? ' progress-fill--over' : '') + '" style="width:' + Math.min(100, pct) + '%"></div></div></div>';

    html += _pdfSectionHtml('block-dot--spesa', 'Spese', spese.length + (spese.length === 1 ? ' voce' : ' voci'),
      ['Preventivato', 'Pagato'], spese.map(pdfRow), 'Nessuna spesa inserita per questa voce.',
      spese.length ? { prev: B._eur(sommaPrev), eff: B._eur(somma) } : null);

    /* I crediti compaiono in stampa solo se ce n'è almeno uno: sono un dettaglio
       informativo, non fanno parte del costo della voce sopra. */
    if (crediti.length) {
      html += _pdfSectionHtml('block-dot--credito', 'Crediti / incassi', crediti.length + (crediti.length === 1 ? ' voce' : ' voci'),
        ['Incasso previsto', 'Incassato'], crediti.map(pdfRow), '', { prev: B._eur(incassoPrevisto), eff: B._eur(incassato) });

      var netto = somma - incassato;
      html += '<div class="recap"><div class="recap-title">Bilancio dell\'evento</div>' +
        '<div class="recap-row"><span>Speso</span><strong>' + B._eur(somma) + '</strong></div>' +
        '<div class="recap-row"><span>Incassato</span><strong>' + B._eur(incassato) + '</strong></div>' +
        '<div class="recap-row recap-row--net"><span>Netto</span><strong>' + B._eur(netto) + '</strong></div>' +
        '<p class="recap-caption">Solo un riepilogo di questo documento: non modifica Sostenuto/Preventivato della voce né i totali di Bilancio nel gestionale.</p></div>';
    }

    html += '<footer><span>Victor Volley &middot; Area Dirigenti</span><span>Documento generato automaticamente</span></footer>';
    html += '</div></body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito e riprova.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
  };

  DG.exportSpesePdf = function () {
    var season = B._seasons.find(function (s) { return s.id === B._currentSeasonId; }) || {};
    var r = B._calcRiepilogo();
    var forecast = B._calcSpeseForecast();
    var bilancio = B._calcBilancioMensile();
    var oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

    var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Report Spese — ' + esc(season.nome || '') + '</title>' +
      '<style>' + _pdfCss() + '</style></head><body>';

    html += '<header><h1>Victor Volley — Report Spese &amp; Bilancio</h1>' +
      '<p>Stagione: <strong>' + esc(season.nome || '—') + '</strong> &middot; Generato il ' + oggi + '</p></header>';

    html += '<section><h2>Riepilogo generale</h2>' +
      _pdfStatRow([
        ['Entrate confermate', r.entrateConfermate],
        ['Uscite', r.uscite],
        ['Saldo', r.saldo],
        ['Obiettivo', r.obiettivo],
        ['Differenza da obiettivo', r.differenza]
      ]) + '</section>';

    var entrateDett = B._calcEntrateConfermateDettaglio();
    html += '<section><h2>Da chi arrivano le entrate confermate</h2>' +
      _pdfTableHtml(['Fonte', 'Nome', 'Importo'],
        entrateDett.righe.map(function (x) { return [esc(x.tipo), esc(x.nome), B._eur(x.importo)]; })
          .concat(entrateDett.righe.length ? [['<strong>Totale</strong>', '', '<strong>' + B._eur(entrateDett.totale) + '</strong>']] : []),
        'Nessuna entrata confermata per questa stagione.') + '</section>';

    html += '<section><h2>Bilancio mensile (entrate vs uscite realmente mosse)</h2>' +
      _pdfTableHtml(['Mese', 'Entrate', 'Uscite', 'Saldo mese', 'Saldo progressivo'],
        bilancio.righe.map(function (x) { return [esc(x.label), B._eur(x.entrate), B._eur(x.uscite), B._eur(x.saldo), B._eur(x.progressivo)]; })
          .concat(bilancio.righe.length ? [[
            '<strong>Totale</strong>', '<strong>' + B._eur(bilancio.totEntrate) + '</strong>', '<strong>' + B._eur(bilancio.totUscite) + '</strong>',
            '<strong>' + B._eur(bilancio.totEntrate - bilancio.totUscite) + '</strong>', '—'
          ]] : []),
        'Nessuna tranche incassata o spesa datata per questa stagione.') + '</section>';

    var ivaTot = B._calcIvaTotale();
    html += '<section><h2>Riepilogo IVA</h2>' +
      _pdfStatRow([['Totale IVA', ivaTot.totale]]) +
      _pdfTableHtml(['Voce', 'Importo', 'Data', 'Scadenza versamento'],
        ivaTot.righe.map(function (v) {
          var scad = v.ivaTrimestre ? (B.TRIMESTRI_IVA_LABEL[v.ivaTrimestre] + ' — ' + _fmtDateLong(v.ivaScadenza)) : '—';
          return [esc(v.categoria), B._eur(+v.importoSostenuto || 0), v.dataSpesa ? esc(_fmtDateLong(v.dataSpesa)) : '—', esc(scad)];
        }),
        'Nessuna voce IVA per questa stagione.') + '</section>';

    html += '<section><h2>Spese per categoria — preventivato vs sostenuto</h2>' +
      _pdfTableHtml(['Categoria', 'Preventivato', 'Sostenuto', 'Scostamento'],
        forecast.righe.map(function (x) {
          return [esc(x.nome), B._eur(x.preventivato), B._eur(x.sostenuto),
            '<span style="color:' + (x.scostamento > 0 ? '#DC2626' : '#16A34A') + '">' + (x.scostamento > 0 ? '+' : '') + B._eurSigned(x.scostamento) + '</span>'];
        }), 'Nessuna voce di spesa per questa stagione.') + '</section>';

    /* Riga finale di totale: stessa somma (tutte le voci, comprese quelle IVA) mostrata
       in fondo alla tabella live "Spese" del pannello — vedi B._renderSpese(). Lo
       scostamento totale è già nella sezione "Spese per categoria" appena sopra. */
    var totVociPrev = 0, totVociSost = 0;
    B._vociSpesa.forEach(function (v) { totVociPrev += (+v.importoPreventivato || 0); totVociSost += (+v.importoSostenuto || 0); });
    html += '<section><h2>Singole voci di spesa</h2>' +
      _pdfTableHtml(['Voce', 'Categoria', 'Preventivato', 'Sostenuto', 'Data', 'Note'],
        B._vociSpesa.map(function (v) {
          var cat = v.categoriaSpesaId ? B._categoriaSpesaById(v.categoriaSpesaId) : null;
          return [esc(v.categoria), esc(cat ? cat.nome : '—'), B._eur(v.importoPreventivato || 0), B._eur(v.importoSostenuto || 0),
            v.dataSpesa ? esc(_fmtDateLong(v.dataSpesa)) : '—', esc(v.note || '')];
        }).concat(B._vociSpesa.length ? [[
          '<strong>Totale</strong>', '', '<strong>' + B._eur(totVociPrev) + '</strong>', '<strong>' + B._eur(totVociSost) + '</strong>', '', ''
        ]] : []),
        'Nessuna voce di spesa per questa stagione.') + '</section>';

    html += '<footer>Victor Volley — Area Dirigenti · Documento generato automaticamente</footer>';
    html += '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito e riprova.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
  };

})();
