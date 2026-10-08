/**
 * Victor Volley — Partite della home
 * Carica le partite dalla collection Firestore "partite" (via DB/VV) e popola la partite-bar della home:
 * le prossime in programma e gli ultimi risultati. La diretta vera e propria sta in /diretta (Set Point Pulse).
 */
(function () {
  'use strict';

  /* -------------------------------------------------------
     Helpers HTML
  ------------------------------------------------------- */
  function catCls(cat) { return cat === 'Prima Divisione' ? 'partite-card-cat--magenta' : ''; }

  var LOGO_MAP = { 'victor volley': 'assets/logo.png' };

  function logoHtml(nome, logoSrc) {
    var src = logoSrc || LOGO_MAP[(nome || '').toLowerCase().trim()];
    return src
      ? '<img loading="lazy" decoding="async" src="' + esc(window.VV ? VV.imgUrl(src, 160) : src) + '" alt="' + esc(nome) + '" class="partite-card-logo-img">'
      : '<span class="partite-card-logo-init">' + esc((nome || '?').charAt(0).toUpperCase()) + '</span>';
  }

  function teamEl(nome, logoSrc, isWinner) {
    return '<div class="partite-card-team">' +
      '<div class="partite-card-logo">' + logoHtml(nome, logoSrc) + '</div>' +
      '<span class="partite-card-tname">' + (isWinner ? '<strong>' + esc(nome) + '</strong>' : esc(nome)) + '</span>' +
    '</div>';
  }

  function formatData(dateStr, ora) {
    var d = new Date(dateStr + 'T00:00:00');
    var giorni = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    var mesi   = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    return giorni[d.getDay()] + ' ' + d.getDate() + ' ' + mesi[d.getMonth()] + (ora ? ' · ' + ora : '');
  }

  /* -------------------------------------------------------
     Renderers delle card
  ------------------------------------------------------- */
  function cardProssima(p) {
    return '<div class="partite-card" data-partita-id="' + esc(p.id) + '">' +
      '<div class="partite-card-top">' +
        '<span class="partite-card-cat ' + catCls(p.categoria) + '">' + esc(p.categoria) + '</span>' +
        '<span class="partite-card-date">' + esc(formatData(p.data, p.ora)) + '</span>' +
      '</div>' +
      '<div class="partite-card-body">' +
        '<div class="partite-card-teams">' +
          teamEl(p.squadra_casa, p.logo_casa) +
          teamEl(p.squadra_ospite, p.logo_ospite) +
        '</div>' +
        '<div class="partite-card-vs-col"><span class="partite-card-vs">VS</span></div>' +
      '</div>' +
    '</div>';
  }

  function cardConclusa(p, setCasa, setOspite) {
    var sc = (setCasa  !== null && setCasa  !== undefined) ? setCasa  : (p.set_casa   || 0);
    var so = (setOspite !== null && setOspite !== undefined) ? setOspite : (p.set_ospite || 0);
    var casaWins = sc > so;
    return '<div class="partite-card" data-partita-id="' + esc(p.id) + '">' +
      '<div class="partite-card-top">' +
        '<span class="partite-card-cat ' + catCls(p.categoria) + '">' + esc(p.categoria) + '</span>' +
        '<span class="partite-card-date">' + esc(formatData(p.data, null)) + '</span>' +
      '</div>' +
      '<div class="partite-card-body">' +
        '<div class="partite-card-teams">' +
          teamEl(p.squadra_casa, p.logo_casa, casaWins) +
          teamEl(p.squadra_ospite, p.logo_ospite, !casaWins) +
        '</div>' +
        '<div class="partite-card-scores-col">' +
          '<div class="partite-card-pts">' + sc + '</div>' +
          '<div class="partite-card-pts">' + so + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* -------------------------------------------------------
     Init principale
  ------------------------------------------------------- */
  function init() {
    var elP = document.getElementById('partiteProssime');
    var elC = document.getElementById('partiteConcluse');
    if (!elP && !elC) return;

    new Promise(function (resolve) { DB.load(['partite'], resolve); })
      .then(function () {
        if (DB.failed(['partite'])) {
          var errHtml = '<div class="partite-empty">Partite non disponibili. <button type="button" class="partite-retry">Riprova</button></div>';
          if (elP) elP.innerHTML = errHtml;
          if (elC) elC.innerHTML = '';
          var rb = elP && elP.querySelector('.partite-retry');
          if (rb) rb.addEventListener('click', function () { rb.disabled = true; rb.textContent = 'Riprovo…'; DB.retry(['partite'], init); });
          return;
        }
        var partite = VV.getPartite();

        var prossime = partite
          .filter(function (p) { return p.stato !== 'conclusa'; })
          .sort(function (a, b) { return a.data > b.data ? 1 : -1; })
          .slice(0, 2);

        var concluse = partite
          .filter(function (p) { return p.stato === 'conclusa'; })
          .sort(function (a, b) { return a.data < b.data ? 1 : -1; })
          .slice(0, 2);

        /* Fallback colonna concluse: usa extra prossime */
        var concluseRender = concluse.length ? concluse : prossime.slice(2);

        if (elP) {
          elP.innerHTML = prossime.length
            ? prossime.map(cardProssima).join('')
            : '<div class="partite-empty">Nessuna partita in programma.</div>';
        }

        if (elC) {
          elC.innerHTML = concluseRender.length
            ? concluseRender.map(function (p) {
                return p.stato === 'conclusa' ? cardConclusa(p, p.set_casa, p.set_ospite) : cardProssima(p);
              }).join('')
            : '<div class="partite-empty">Nessun risultato disponibile.</div>';
        }
      })
      .catch(function (e) {
        console.warn('[partite-live] caricamento partite fallito:', e);
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
