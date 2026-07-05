/**
 * Victor Volley — Fixture sponsor per test in locale
 * Attivo SOLO su localhost/127.0.0.1 e SOLO se non ci sono ancora sponsor
 * reali su Firestore: inietta sponsor di prova nella cache in-memory senza
 * mai scrivere su Firestore. Sul sito pubblico questo script non fa nulla.
 */
(function () {
  'use strict';
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  if (!window.DB || typeof DB.loadSponsors !== 'function') return;

  DB.loadSponsors(function () {
    if (VV.getSponsors().length) return; /* non sovrascrivere sponsor reali già presenti */
    VV.setSponsors([
      { id: 9001, nome: 'Comune di Melissano',  logo: '', url: '',                    order: 1, livello: 'gold',   ripetizioni: 1 },
      { id: 9002, nome: 'ARKÈ Costruzioni', logo: '', url: '',                   order: 2, livello: 'gold',   ripetizioni: 1 },
      { id: 9003, nome: 'Bar Centrale',          logo: '', url: 'https://example.com', order: 3, livello: 'silver', ripetizioni: 3 },
      { id: 9004, nome: 'Farmacia Salento',      logo: '', url: '',                    order: 4, livello: 'silver', ripetizioni: 1 },
      { id: 9005, nome: 'Pizzeria Da Mimmo',     logo: '', url: '',                    order: 5, livello: 'bronze', ripetizioni: 2 },
      { id: 9006, nome: 'AutoRicambi Melissano', logo: '', url: '',                    order: 6, livello: 'bronze', ripetizioni: 1 }
    ]);
  });
})();
