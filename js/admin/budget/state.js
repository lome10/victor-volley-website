/* Victor Volley — Admin / Budget: stato condiviso del Budget.
   Va caricato per primo tra i file di js/admin/budget/: crea window.Admin.budgetShared (B),
   lo spazio comune in cui i file del Budget si scambiano stato e funzioni. */
(function () {
  'use strict';
  var A = window.Admin, B = A.budgetShared = {};
  var DG = window.AdminActions;
  /* ================================================================
     BUDGET & FORECAST — CRM sponsor, rette, spese, log (Area Dirigenti)

     Fuso nel pannello unico: stesso login, stesso ruolo "dirigente"
     verificato in _checkRole(), stesso log (auditLog) usato anche da
     db.js per il resto del CMS. DG è un alias di AdminActions, ma va
     esposto anche su window: tutto admin.js vive in un'unica IIFE,
     quindi un "var DG" locale non basta — gli onclick="DG.xxx()"
     iniettati via innerHTML girano nello scope globale della pagina,
     non nella closure dello script, e senza window.DG risolvono a
     "DG is not defined" ad ogni click.
  ================================================================ */

  window.DG = DG;

  B._seasons = [];
  B._currentSeasonId = null;
  B._aziende = [];
  B._sponsorizzazioni = [];
  B._attivita = [];
  B._promemoria = [];
  B._tranche = [];
  B._trancheEditingId = null;
  B._categorieAtleti = [];
  B._atletiRette = [];
  B._rateAtleti = [];
  B._curAtletaRettaId = null;
  B._vociSpesa = [];
  B._sottospese = [];
  B._speseExpanded = {};
  B._categorieSpesa = [];
  B._dirigentiList = [];
  B._curSponsorId = null;
  B._curAziendaId = null;
  B._activeBudgetTab = 'riepilogo';
  B.STATI = ['prospect', 'contattato', 'in_trattativa', 'chiuso', 'rifiutato'];

})();
