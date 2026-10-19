---
name: project-budget-refactor
description: "Rifacimento Budget & Forecast dell'admin concluso (fasi 1-5) più piano editoriale con sponsor; cosa resta in sospeso"
metadata:
  node_type: memory
  type: project
  originSessionId: 334feb6e-4ce8-4133-a522-acc04c1ba99f
  modified: 2026-10-06T16:00:07.511Z
---

Il rifacimento di Budget & Forecast (schede Panoramica, Entrate [Sponsor/Rette/Tessere/Altre entrate], Spese, Bilancio [Consuntivo/Previsione/IVA/Confronto]) è concluso e pubblicato il 2026-10-07. Dettagli e file in `session_notes.md` punto 1f. In più: sponsor collegati ai contenuti del piano editoriale (contatore, drag and drop, nome+logo sul calendario).

**Why:** l'utente lo voleva più chiaro nell'UX; le definizioni dei numeri sono unificate in `js/admin/budget/cassa.js`.

**How to apply:** in sospeso per scelta dell'utente (non riproporre di farli da soli): segnare pagate le 17 tranche sponsor scadute, pulizia dati di prova. Prima di creare una stagione nuova serve il backup («Esporta backup»). Non fatti: menu «⋯», allegati veri alle spese (Storage), prova da telefono, collegamento loghi sito→aziende. Il comando `firebase deploy --only firestore:rules` richiede il sì esplicito dell'utente (il classificatore lo blocca senza). Vedi [[feedback-session-notes]].
