---
name: project-diretta-tabellone
description: Come funziona /diretta (tabellone da Set Point Pulse + video YouTube) e cosa resta in sospeso
metadata:
  node_type: memory
  type: project
  originSessionId: 5b97d4e3-1477-4d8e-9910-2f771440dd5f
  modified: 2026-10-16T15:43:53.356Z
---

`/diretta` (2026-10-16): grafica propria, dati dall'endpoint `https://victor-volley.setpointpulse.com/api/club/victor-volley/live` (polling 5 s, progetto fratello Set Point Pulse, sessione `set-point-pulse-5a`). Video da `api/youtube-live.js` (diretta se il canale trasmette, altrimenti ultimo video riproducibile). L'utente ha approvato grafica e video.

**Why:** il vecchio dominio lovable.app non era più valido; l'utente voleva tutto automatico, senza toccare il calendario.

**How to apply:** per cambiare i dati del tabellone parlare con l'altra sessione via ListAgents/SendMessage. Da Vercel YouTube dà `LOGIN_REQUIRED` (anti-bot): se la diretta non viene riconosciuta, proporre la chiave YouTube Data API. In sospeso: nessuno (partite di prova eliminate, logo FlyArmida caricato, diretta YouTube riconosciuta, confermato 2026-10-16). Vedi [[feedback-push-dopo-commit]].
