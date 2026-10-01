# Session notes — Victor Volley website

File di coordinamento: va aggiornato **alla fine di ogni sessione** e **ad ogni cambiamento**.
Ordine: stato attuale → da fare → da verificare → decisioni → registro sessioni.

Ultimo aggiornamento: 2026-10-01

---

## Stato attuale

- Branch `main`, allineato con `origin`.
- Fix dell'audit del 2026-10-01 (committati):
  - `js/diretta.js`, `js/girone.js`, `js/partite-live.js`, `js/components.js`: `esc()` ora converte anche `"` in `&quot;`.
  - `js/atleta.js`: `_driveViewUrl()` accetta solo URL `https://`, altrimenti `#`.
- Controllata solo la sintassi (`node --check`); non provato nel browser.

---

## Da fare

Legenda: `[ ]` aperto · `[x]` fatto · `[~]` in corso

### Priorità alta
- [x] Committare e pubblicare i fix dell'audit (vedi sopra).
- [ ] Scrivere una checklist di smoke test per ogni sezione dell'admin (prerequisito per spezzare il monolite).

### Monolite `js/admin.js` (8.526 righe, 452 KB)
Piano: file separati caricati in ordine, namespace comune `window.Admin`, nessun bundler.
- [ ] Definire l'interfaccia condivisa (`esc`, `db`, `_logWrite`, modali, stagione corrente).
- [ ] Estrarre il **Budget & Forecast** (righe 4645–8526, circa metà del file) in `js/admin/budget/*.js`.
- [ ] Estrarre `atleti.js` (atleti, rate, avvisi, presenze, allenamenti).
- [ ] Estrarre `cms.js` (articoli, calendario, galleria, squadre, sponsor del sito).
- [ ] Lasciare in `core.js` bootstrap, navigazione, utility, audit log, modali.
- [ ] Cache-busting `?v=` per ogni nuovo file.
- [ ] Valutare uno strato dati: oggi ci sono 143 chiamate dirette a `db.collection()`.

### Pulizia codice morto
- [ ] Eliminare `data/giocatori.json` (nessun riferimento).
- [ ] Eliminare `data/partite.json` (serve solo alla vecchia migrazione) e il commento correlato in `partite-live.js`.
- [ ] Rimuovere gli helper `migrateFromLocalStorage` e `migratePartiteToCollection` da `js/db.js`, dopo aver confermato che sono già stati eseguiti.
- [ ] Rimuovere la regola `matches` da `firestore.rules` (nessuna corrispondenza nel codice).

### Sicurezza e infrastruttura
- [ ] Riscrivere la CSP (oggi `Content-Security-Policy-Report-Only` in `vercel.json`): `script-src 'self'` blocca i 7 script inline di `index.html` e `frame-src` non ammette `maps.google.com`. Non attivarla com'è.
- [ ] Centralizzare `esc()`: è ridefinita circa 17 volte tra pagine e file JS.
- [ ] Decidere su Supabase: `js/config.js` ha ancora i placeholder, ma `index.html` scarica `supabase-js.min.js` (circa 200 KB) senza usarlo. Rimuoverlo oppure configurare la diretta live.
- [ ] Rivedere ogni punto con `innerHTML` in `admin.js` (138 occorrenze): verificato solo che il suo `esc` escapa le virgolette.
- [ ] Aggiungere test e CI (oggi non esistono).

### SEO e contenuti
- [ ] Sitemap: aggiungere articoli e album (oggi solo le 9 pagine statiche).
- [ ] Canonical mancante in `news-dettaglio` e `galleria`.
- [ ] Dati reali da confermare dal piano originale: indirizzo e nome del palazzetto, email e telefono, foto, loghi sponsor, social, dati societari.

### Opzionale
- [ ] Attivare il piano Blaze di Firebase e pubblicare la Cloud Function `setAthletePassword` (oggi il cambio password atleta si fa dalla Console; vedi `DG._FUNCTIONS_DEPLOYED` in `admin.js:3195`).
- [ ] Form per inserire i risultati del girone senza passare dal JSON (proposto, non richiesto).

---

## Da verificare (serve controllo sui dati di produzione)

- [ ] **Regole Firestore pubblicate?** Firebase Console → Firestore → Regole: la data deve essere recente. Se no: `firebase deploy --only firestore:rules`.
- [ ] **Migrazione immagini base64 → Cloudinary**: lanciata dal bottone nella tab File JSON? (idempotente)
- [ ] **Migrazione IVA sponsor** (`DG.migraIvaSponsor`, bottone in Riepilogo IVA): lanciata per ogni stagione con sponsor chiusi?
- [ ] **Migrazione `accessUids` degli atleti**: parte da sola aprendo la sezione Atleti. Controllare che i vecchi atleti abbiano il campo, altrimenti i genitori non vedono la scheda.

---

## Decisioni prese

- **2026-10-01**: menù laterale admin a gruppi comprimibili (Sport, Comunicazione, Società, Sistema). Dashboard resta fuori dai gruppi. All'avvio resta aperto solo il gruppo della sezione attiva.
- **2026-10-01**: tab **Girone** rimossa dal pannello admin, perché era un'anteprima in sola lettura già coperta dalla pagina pubblica `calendario.html`. Restano `data/girone.json`, `js/girone.js` e il blocco nella tab File JSON.
- **2026-10-01**: monolite da spezzare in modo graduale, senza bundler, partendo dal Budget.

---

## Registro sessioni

### 2026-10-01
- Menù laterale admin riorganizzato in gruppi comprimibili con scrollbar sottile → commit `b9a7c17`.
- Rimossa la tab Girone dall'admin, con CSS e JS collegati → commit `ada9a9d`.
- Audit del progetto: corretti `esc()` senza virgolette in 4 file e `_driveViewUrl()` in `atleta.js` → commit del fix di sicurezza.
- Analisi di migrazioni e monolite `admin.js`; creato questo file.
- Spiegata la Cloud Function `setAthletePassword` (richiede piano Blaze, non attiva).
