---
name: reference-backup-2026-10-13
description: Ultimo backup Firestore completo (13/10/2026) tenuto dall'utente per il futuro, copia in backups/2026-10-13/
metadata:
  type: reference
---

Backup JSON completo (collezioni in `collections`, 37 raccolte, generato dal pulsante «Esporta backup»): `backups/2026-10-13/victor-volley-backup-2026-10-13.json` (copia di `C:\Users\loren\Downloads\victor-volley-backup-2026-10-13.json`). L'utente ha chiesto di tenerlo «per un futuro».

**Why:** contiene taglie, Aggiunte e modelli a fine stagione-ordini; serve come fonte dati offline senza credenziali Firebase.
**How to apply:** `backups/` è in .gitignore (dati personali): non committarlo. Per conteggi taglie leggere `budgetSeasons` (pezziSponsor, taglieEscluse, taglieModelli, taglieAggiunte), `atletiDati[].taglie` e `dirigenti[].taglie`. Non cancellarlo. Vedi [[project-ricevute-email-famiglie]].
