/* Victor Volley — Admin / Budget: pipeline sponsor in vista a elenco (alternativa al kanban a colonne).
   Una riga per sponsor della stagione, con quanto è incassato e da incassare e se il logo è sul sito
   (collegamento azienda → logo: campo `sponsorSitoId` sull'azienda, impostato dalla pagina «Sponsor» del menu).
   Dipende da window.Admin e window.Admin.budgetShared. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared;
  var DG = window.AdminActions;
  var esc = A.esc;

  B._sponsorVista = 'colonne';

  function _logoSito(azienda) {
    var vv = window.VV;
    if (!azienda || azienda.sponsorSitoId == null || !vv || !vv.getSponsors) return null;
    return vv.getSponsors().filter(function (x) { return x.id === azienda.sponsorSitoId; })[0] || null;
  }

  /* Puro: le righe dell'elenco (nessun DOM), con le stesse definizioni del resto del Budget. */
  function _righeElenco(soloMiei, uid) {
    var ordine = {}; B.STATI.forEach(function (s, i) { ordine[s] = i; });
    return B._sponsorizzazioni.filter(function (s) {
      return s.seasonId === B._currentSeasonId && (!soloMiei || s.dirigenteResponsabileId === uid);
    }).map(function (s) {
      var az = B._aziendaById(s.aziendaId), chiuso = s.stato === 'chiuso';
      var resp = B._dirigentiList.filter(function (d) { return d.id === s.dirigenteResponsabileId; })[0];
      var prom = B._nextPromemoria(s.id);
      return {
        id: s.id, stato: s.stato, nome: az ? az.ragioneSociale : '—', storico: !!(az && B._isStorico(az.id)),
        importo: chiuso ? (+s.importoConfermato || 0) : (+s.importoStimato || 0),
        pct: chiuso && B._sponsorPagato ? B._sponsorPagato(s).pct : 0,
        ivaInclusa: chiuso && B._sponsorIvaCalc ? B._sponsorIvaCalc(s.importoConfermato, s).ivaInclusa : 0,
        incassato: chiuso ? B._sponsorIncassato(s) : 0, daIncassare: chiuso ? B._sponsorDaIncassare(s) : 0,
        responsabile: resp ? (resp.nome + ' ' + resp.cognome).trim() : '', promemoria: prom ? prom.dataScadenza : '',
        sito: _logoSito(az), _o: ordine[s.stato] == null ? 99 : ordine[s.stato]
      };
    }).sort(function (a, b) { return a._o - b._o || b.importo - a.importo || a.nome.localeCompare(b.nome); });
  }
  B._righeElencoSponsor = _righeElenco;

  function _applicaVista() {
    var board = document.getElementById('kanbanBoard'), box = document.getElementById('sponsorElenco');
    if (!board || !box) return;
    var elenco = B._sponsorVista === 'elenco';
    board.classList.toggle('is-hidden', elenco);
    box.classList.toggle('is-hidden', !elenco);
    ['colonne', 'elenco'].forEach(function (k) {
      var b = document.getElementById('spVista' + k.charAt(0).toUpperCase() + k.slice(1));
      if (b) b.setAttribute('aria-selected', String(B._sponsorVista === k));
    });
  }

  function _renderElenco() {
    _applicaVista();
    var body = document.getElementById('sponsorElencoBody');
    if (!body || B._sponsorVista !== 'elenco') return;
    var chk = document.getElementById('filterMieiSponsor');
    var righe = _righeElenco(!!(chk && chk.checked), A.uid());
    if (!righe.length) { body.innerHTML = '<tr><td colspan="8" class="dg-empty">Nessuno sponsor in questa stagione.</td></tr>'; return; }
    var tot = { importo: 0, incassato: 0, da: 0 };
    var rows = righe.map(function (r) {
      if (r.stato === 'chiuso') { tot.importo += r.importo; tot.incassato += r.incassato; tot.da += r.daIncassare; }
      var sito = r.sito
        ? '<span class="sp-sito" title="Logo sul sito">' + (r.sito.logo ? '<img src="' + esc(r.sito.logo) + '" alt="" style="height:18px;width:36px;object-fit:contain;vertical-align:middle;margin-right:6px">' : '') + esc({ gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }[r.sito.livello || 'silver'] || '') + '</span>'
        : '<span class="dg-muted">—</span>';
      return '<tr class="sp-elenco-r" data-id="' + esc(r.id) + '" tabindex="0" style="cursor:pointer">' +
        '<td><strong>' + esc(r.nome) + '</strong>' + (r.storico ? ' <span class="dg-badge dg-badge--storico">storico</span>' : '') + '</td>' +
        '<td><span class="dg-badge" style="background:' + B._statoColor(r.stato) + '22;color:' + B._statoColor(r.stato) + '">' + esc(B._statoLabel(r.stato)) + '</span></td>' +
        '<td class="cs-r">' + B._eur(r.importo) + (r.ivaInclusa > 0 ? '<div class="dg-muted" style="font-size:11px">di cui ' + B._eur(r.ivaInclusa) + ' IVA</div>' : '') + '</td>' +
        '<td class="cs-r">' + (r.stato === 'chiuso' ? B._eur(r.incassato) + '<div class="dg-muted" style="font-size:11px">' + r.pct + '% di ' + B._eur(r.importo) + '</div>' : '—') + '</td>' +
        '<td class="cs-r">' + (r.stato === 'chiuso' ? B._eur(r.daIncassare) : '—') + '</td>' +
        '<td>' + esc(r.responsabile || '—') + '</td>' +
        '<td>' + (r.promemoria ? esc(A.fmtDate(r.promemoria)) : '<span class="dg-muted">—</span>') + '</td>' +
        '<td>' + sito + '</td></tr>';
    });
    rows.push('<tr style="font-weight:700"><td>Chiusi</td><td></td><td class="cs-r">' + B._eur(tot.importo) + '</td><td class="cs-r">' + B._eur(tot.incassato) + '</td><td class="cs-r">' + B._eur(tot.da) + '</td><td colspan="3"></td></tr>');
    body.innerHTML = rows.join('');
  }
  B._renderElencoSponsor = _renderElenco;

  function _collega() {
    var box = document.getElementById('sponsorElenco');
    if (!box) return;
    box.addEventListener('click', function (e) { var r = e.target.closest('.sp-elenco-r'); if (r) B._openDrawer(r.getAttribute('data-id')); });
    box.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sp-elenco-r')) { e.preventDefault(); B._openDrawer(e.target.getAttribute('data-id')); } });
    ['Colonne', 'Elenco'].forEach(function (k) {
      document.getElementById('spVista' + k).addEventListener('click', function () { B._sponsorVista = k.toLowerCase(); _renderElenco(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _collega); else _collega();
  void DG;
})();
