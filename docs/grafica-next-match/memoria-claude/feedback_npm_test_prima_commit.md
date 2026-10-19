---
name: npm-test-prima-del-commit
description: Prima di ogni commit che tocca file del sito lanciare npm test (e stamp-versions se cambia un JS/CSS pubblicato)
metadata:
  node_type: memory
  type: feedback
  originSessionId: b6326e56-bca9-4e12-b76f-46a039a9b933
  modified: 2026-10-19T10:44:28.685Z
---

Prima di ogni commit che modifica file del sito (JS, CSS, HTML) lanciare `npm test` e correggere gli errori prima di committare.

**Why:** il 2026-10-19 ho committato la modifica a `js/admin/budget/sponsor.js` senza aver aggiornato il `?v=` in `admin.html`; il controllo `stamp-versions.js --check` ha fatto fallire la CI («Controlli») su GitHub. L'utente ha detto «male, mettilo come regola».

**How to apply:** dopo aver modificato un JS/CSS pubblicato, lanciare `node scripts/stamp-versions.js` per aggiornare i `?v=` nelle pagine, poi `npm test`, e solo se passa tutto fare commit e push (vedi [[feedback-push-dopo-commit]]).
