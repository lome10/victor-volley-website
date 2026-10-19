---
name: project-mobile-prestazioni
description: "Stato prestazioni mobile della home (Lighthouse 73, LCP 6,3 s) e limite del browser automatico per le prove da telefono"
metadata:
  node_type: memory
  type: project
  originSessionId: 793b03d7-d724-4ae4-a157-66dbe3a53d3d
  modified: 2026-10-08T14:04:50.849Z
---

Il 2026-10-08 la home pubblicata ha Lighthouse mobile 73/100 (LCP 6,3 s) dopo la splash a 600 ms e le palline nascoste su mobile. L'LCP è l'anteprima video della maglia caricata da `js/pages/index-4.js` solo a `load`; da sistemare per prima, poi sfondo 215 KB, logo 65 KB, Firestore.

**Why:** il `defer` agli script della home non serve (sono già a fine body); il guadagno è nell'LCP.

**How to apply:** per rimisurare usa `npx lighthouse <url> --only-categories=performance`. Il browser automatico (Chrome MCP) NON emula la larghezza da telefono (innerWidth resta 1920, resize_window non cambia il viewport) e il sito in produzione vieta di incorniciarsi. Workaround che funziona (2026-10-12): `npx serve . -l 3000` in locale, aprire una pagina localhost e metterci un iframe `width:390px` con `src="/"`: le media query scattano e si leggono misure e screenshot (dati Firestore reali). Per un telefono vero resta l utente con F12. Dettagli in `session_notes.md`.

**Aggiornamento 2026-10-13:** l'utente conferma che questo punto è chiuso (non riproporlo).
