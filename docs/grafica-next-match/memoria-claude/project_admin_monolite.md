---
name: victor-volley-admin-monolite
description: Piano a lungo termine per spezzare js/admin.js (8.5k righe) e migrazioni da verificare
metadata:
  node_type: memory
  type: project
  originSessionId: 49c2a030-722a-4861-b3f7-263704be049c
  modified: 2026-10-01T15:25:55.958Z
---

`js/admin.js` è un unico file di 8.526 righe; il Budget & Forecast occupa circa metà (righe 4645+). Piano deciso il 2026-10-01: spezzarlo in file separati con namespace `window.Admin`, senza bundler, partendo dal Budget, dopo aver scritto una checklist di smoke test (non ci sono test né CI).

**Why:** rischio di regressioni tra sezioni per stato condiviso e assenza di test.

**How to apply:** non estrarre codice senza prima definire l'interfaccia condivisa (`esc`, `db`, `_logWrite`, modali, stagione corrente). Dettagli e stato nelle `session_notes.md` del repo.

**Stato 2026-10-02:** Budget estratto in `js/admin/budget.js` (blocco unico) con interfaccia `window.Admin` / `Admin.budget` in `admin.js`; non ancora provato nel browser né committato. Controllo utile: ESLint `no-undef` (installato fuori dal progetto) + `node scripts/check-admin.js`. I file hanno terminatori CRLF.

**Aggiornamento 2026-10-02 (sera):** Budget spezzato in 11 file `js/admin/budget/*.js` (stato e funzioni condivise in `Admin.budgetShared` come `B._nome`; `state.js` primo, `main.js` ultimo). Prossimo: `atleti.js`, poi `cms.js`.

**Aggiornamento 2026-10-02 (notte):** estratto `js/admin/atleti.js` (espone `Admin.atleti`); `admin.js` ~3.310 righe. Prossimo: `cms.js`.

**Aggiornamento 2026-10-02 (tardi):** estratto anche `js/admin/cms.js`; `admin.js` ~1.435 righe. `atleti.js` e `cms.js` committati ma NON ancora provati dall'utente nel browser. `AdminActions` ora è creato vuoto nel nucleo e riempito da cms.js (Object.assign). Rimasto nel nucleo: bootstrap, navigazione, dashboard, dirigenti, piano editoriale, bacheca, file JSON, backup, cambio password, audit log, modali.

**Aggiornamento 2026-10-02 (fine):** estratti anche `pianoeditoriale.js` e `bacheca.js`; `admin.js` 854 righe. Decisione dell'utente: Dirigenti e File JSON restano in `admin.js`, estrazione chiusa. Pubblicato su origin/main fino a 5100c90; l'ultimo commit (Piano editoriale + Bacheca) è locale.

**Aggiornamento 2026-10-13:** `admin.js` è a 928 righe (estrazione già chiusa il 2026-10-02: Dirigenti e File JSON restano lì per scelta). L'utente conferma che tutti gli altri punti in sospeso (rinomina Under 13 Femminile, taglie, home mobile, email Brevo) sono chiusi. Restano grandi `atleti.js` (2.468 righe) e `cms.js` (2.267): eventuale prossimo spezzamento, non richiesto.
