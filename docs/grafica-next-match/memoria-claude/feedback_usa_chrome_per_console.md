---
name: feedback-usa-chrome-per-console
description: "Per dati nelle console web (Firebase, Vercel, ecc.) usare Claude in Chrome invece di dire che non si ha accesso"
metadata:
  node_type: memory
  type: feedback
  originSessionId: d91d1510-fd17-42f9-a0e7-b044852d39a5
  modified: 2026-10-14T08:42:54.321Z
---

Quando servono dati che stanno in una console web (es. utilizzo Firestore nella console Firebase), aprirla con Claude in Chrome (progetto `victor-volley`, la sessione dell'utente è già autenticata) invece di dire «non ho accesso» e chiedere i numeri all'utente.

**Why:** il 2026-10-14 l'utente si è irritato quando ho detto che non avevo accesso alla console: «apriti la console firebase con claude in chrome, non usare questa scusa ogni volta».

**How to apply:** prima di chiedere all'utente un dato leggibile in una console, provare col browser; chiedere solo se il login manca o la pagina non si apre. Solo lettura: non modificare impostazioni senza richiesta.
