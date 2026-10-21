---
name: feedback-foto-pulizia-color
description: "Conversione RAW, pulizia e color correction delle foto per le grafiche le fa sempre Claude Code"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a81d6eaf-de02-482c-b6f4-c3f44ec69212
  modified: 2026-10-21T15:18:12.419Z
---

Quando l'utente manda una foto per le grafiche (anche un `.CR2` in Downloads), la preparazione la faccio io: estrazione/conversione dal RAW, rotazione, pulizia (rumore, puntini) e color correction (bilanciamento del bianco sul fondale, contrasto, saturazione), poi la carico nel canvas.

**Why:** l'utente l'ha detto esplicitamente il 2026-10-21 («la pulizia dell'immagine, la color correction, la devi fare sempre tu con claude code»), mentre sostituivamo la foto della tavola «Storia 9:16 - risultato set».

**How to apply:** i `.CR2` si leggono estraendo l'anteprima JPEG 5184x3456 (segmento con SOF baseline, non il lossless C3) con uno script Node, poi `sharp` in una cartella scratch (`npm i sharp`); controllare l'orientamento (di solito va ruotata di 90°). Mostrare l'anteprima corretta prima di caricarla. Vedi [[project-storia-risultati-set]].

**Regole salvate nel repo (2026-10-21):** procedura, valori e controlli in `docs/grafica-risultati/COLOR-CORRECTION.md`; loghi sponsor in `docs/grafica-risultati/loghi/` (scheda `LOGHI.md`). L'utente avrà Claude Code anche sull'altro PC e vuole poter ripartire da lì con `git pull`.
