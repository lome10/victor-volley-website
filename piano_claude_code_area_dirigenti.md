# Piano di implementazione — "Area Dirigenti" + Budget & Forecast su sito Victor Volley

Questo documento è pensato per essere incollato come istruzione iniziale a **Claude Code**
(nel terminale, VS Code o l'app desktop), lanciato dentro la cartella del progetto del sito
(o con accesso al repository). Claude Code dovrà eseguire le fasi in ordine, fermandosi dopo
la Fase 0 per farsi confermare le assunzioni prima di scrivere codice.

---

## Obiettivo

1. Aggiungere una voce di menu **"Area Dirigenti"** posizionata **sopra "Area Atleti"** nella
   navigazione del sito.
2. La voce porta a una sezione protetta da login (visibile solo dopo autenticazione, e solo a
   utenti con ruolo "dirigente"/"amministratore").
3. Dentro l'Area Dirigenti, creare una pagina **Budget & Forecast** che replica in versione
   web la logica del file Excel già realizzato: obiettivo di budget, sponsor chiusi, sponsor
   da chiamare (pipeline), rette atleti per categoria, spese, riepilogo con saldo e grafici.
4. I dati vanno salvati a sistema (database), non in un file scaricabile: più dirigenti devono
   poter consultare/aggiornare gli stessi dati nel tempo, stagione dopo stagione.
5. La parte sponsor non è una semplice tabella: va trattata come un **mini-CRM**. Ogni
   sponsor/potenziale sponsor è un'anagrafica unica che attraversa uno storico di stati
   (prospect → contattato → in trattativa → chiuso/rifiutato), con uno storico attività
   (chiamate, email, incontri), promemoria di follow-up e un dirigente responsabile
   assegnato — invece delle due liste separate "Sponsor Chiusi" / "Sponsor da Chiamare" del
   file Excel, che restano solo come **viste filtrate** sullo stesso dato.

---

## Fase 0 — Audit del sito esistente (obbligatoria, da fare per prima)

Prima di scrivere una riga di codice, Claude Code deve rispondere a queste domande
esplorando il repository/hosting, e riportarle all'utente in sintesi:

- [ ] Che stack usa il sito? (WordPress/PHP, Node/Next.js, altro framework, sito statico...)
- [ ] Esiste già un sistema di login/autenticazione? Dove vive (plugin WordPress, backend
      custom, servizio esterno tipo Auth0/Firebase)?
- [ ] Esiste già un concetto di "ruolo utente" (es. atleta, dirigente, admin)? Se sì, come è
      modellato (campo su tabella utenti, plugin, capability WP)?
- [ ] Come è strutturata oggi la sezione "Area Atleti"? (pagina protetta, plugin membership,
      area riservata custom) — la nuova Area Dirigenti deve seguire lo stesso pattern per
      coerenza, a meno che l'utente non chieda diversamente.
- [ ] Dove e come è definito il menu di navigazione? (file di configurazione, editor
      WordPress, componente React/Vue hardcoded)
- [ ] Che database è in uso (MySQL/MariaDB, Postgres, altro) e come si accede in sviluppo?
- [ ] Esiste un ambiente di staging/locale per testare prima di andare in produzione, o si
      lavora solo in produzione? (Se solo produzione: **procedere con estrema cautela**, mai
      eseguire migrazioni distruttive senza backup).

**Output atteso della Fase 0:** un breve report a Claude Code stesso (e da mostrare
all'utente) con lo stack rilevato, il pattern di autenticazione esistente, e una proposta di
come agganciarsi ad esso — prima di procedere alla Fase 1.

---

## Fase 1 — Modello dati

Indipendentemente dallo stack, servono queste entità (nomi indicativi, adattare alle
convenzioni del progetto esistente):

| Tabella | Campi principali | Note |
|---|---|---|
| `budget_seasons` | id, nome (es. "2026/2027"), data_inizio, data_fine, obiettivo_saldo, is_attiva | una riga per stagione, permette lo storico anno su anno |
| `aziende` | id, ragione_sociale, settore, indirizzo, sito_web, note_generali, referente_principale, telefono, email, tag (es. "ristorazione", "storico", "grande") | anagrafica **unica** dell'azienda/sponsor, indipendente dalla stagione: uno sponsor che collabora da 3 anni ha un'unica scheda con tutto lo storico |
| `sponsorizzazioni` | id, azienda_id, season_id, stato (prospect / contattato / in_trattativa / chiuso / rifiutato / da_riconfermare), importo_stimato, probabilita_chiusura (0–1, rilevante solo se non è "chiuso"), importo_confermato (valorizzato solo a stato "chiuso"), tipologia (denaro/servizi/materiale), data_firma, scadenza, modalita_pagamento, dirigente_responsabile_id, contropartite, note | **il "deal" della stagione**: un'azienda può avere una riga per stagione. Le viste "Sponsor Chiusi" e "Sponsor da Chiamare" del vecchio Excel diventano filtri su `stato`, non tabelle separate |
| `attivita` | id, sponsorizzazione_id, tipo (chiamata/email/incontro/nota), data, dirigente_id (chi l'ha fatta), descrizione | **timeline** delle interazioni: ogni telefonata o email fatta a uno sponsor lascia traccia, visibile a tutto il direttivo (non solo a chi ha chiamato) |
| `promemoria` | id, sponsorizzazione_id, data_scadenza, descrizione (es. "Richiamare dopo invio preventivo"), dirigente_assegnato_id, completato (bool) | follow-up con notifica/scadenza, per non perdere un contatto caldo |
| `categorie_atleti` | id, season_id, nome (es. "Under 13 Maschile"), n_atleti_previsti, retta_unitaria | |
| `rette_incassate` | id, categoria_id, atleta (opzionale, se si vuole tracciare per singolo atleta), importo, data_incasso | in versione semplice basta un contatore "rette incassate" per categoria come nel foglio Excel; in versione più evoluta si traccia per singolo atleta |
| `voci_spesa` | id, season_id, categoria (es. "Palestra/Impianti"), importo_preventivato, importo_sostenuto, note | |
| `utenti_ruoli` (se non esiste già) | user_id, ruolo (atleta/dirigente/admin) | riusare il sistema utenti esistente, aggiungere solo il ruolo se manca |
| `audit_log` | id, timestamp, dirigente_id, entita (es. "sponsorizzazioni", "voci_spesa", "categorie_atleti"...), entita_id, azione (create/update/delete), campo_modificato, valore_precedente, valore_nuovo | **log immutabile** di ogni scrittura fatta dentro l'Area Dirigenti — vedi Fase 1bis sotto |

**Vincoli minimi:**
- Ogni tabella collegata a `budget_seasons` per poter cambiare stagione senza perdere lo storico
  (eccetto `aziende`, che è trasversale alle stagioni per natura, e `attivita`/`promemoria`, che
  ereditano la stagione tramite `sponsorizzazioni`).
- Solo utenti con ruolo `dirigente` o `admin` possono leggere/scrivere su queste tabelle.
- `valore_pesato` (usato per il forecast, come nell'Excel) = `importo_stimato × probabilita_chiusura`,
  calcolato a runtime solo per le righe con stato diverso da "chiuso"; per lo stato "chiuso" si usa
  direttamente `importo_confermato`.
- `audit_log` non ha endpoint di update/delete: si scrive solo in append, mai in modifica —
  vedi permessi dedicati in Fase 1bis.

---

## Fase 1bis — Log delle modifiche (audit trail, sola lettura)

Requisito: una sezione **"Log"**, visibile solo ai dirigenti, che mostra chi ha modificato
cosa, quando, dentro tutta l'Area Dirigenti — sponsor, rette, spese, obiettivo, promemoria
compresi.

**Come tracciare le modifiche (a prescindere dallo stack rilevato in Fase 0):**
- Ogni endpoint di scrittura (`POST`/`PUT`/`PATCH`/`DELETE`) su una tabella dell'Area Dirigenti
  deve, nella stessa transazione, scrivere una riga in `audit_log` con: chi (dirigente
  autenticato, mai "sistema" o "anonimo"), cosa (tabella + id record), quale campo è cambiato,
  valore prima/dopo, e quando.
- Il modo più robusto per non dimenticarselo in qualche endpoint è centralizzare la scrittura
  in un unico middleware/hook/trigger, non ripeterla a mano in ogni controller. Se lo stack lo
  permette, valutare **trigger a livello di database** (es. trigger Postgres/MySQL su
  UPDATE/INSERT/DELETE) come rete di sicurezza in più, così anche una modifica fatta da uno
  script di manutenzione risulta tracciata.
- Il confronto valore_precedente/valore_nuovo va fatto **per singolo campo**, non a livello di
  intera riga: se un dirigente cambia solo la probabilità di chiusura di uno sponsor, il log
  deve dire esattamente quello, non "riga modificata" in generale.

**Permessi sul log:**
- Sola lettura per **tutti** i dirigenti (nessuna eccezione: il log serve proprio a garantire
  trasparenza reciproca all'interno del direttivo).
- **Nessun ruolo, admin incluso, può modificare o cancellare voci del log** dall'interfaccia:
  se in futuro serve una pulizia dati per motivi di privacy/retention, va fatta solo via
  intervento diretto sul database, mai da un pulsante dell'app.
- Il log non deve mai bloccare l'operazione che traccia: se per un bug la scrittura del log
  fallisse, va comunque garantito che l'operazione principale (es. salvare uno sponsor) non
  vada persa — loggare l'errore di logging separatamente, non far fallire tutto il salvataggio.

---

## Fase 2 — Autenticazione e permessi

- Riutilizzare **il sistema di login esistente** del sito (non crearne uno nuovo da zero).
- Aggiungere il ruolo `dirigente` se il sistema attuale non lo prevede.
- Middleware/guard di accesso: ogni route/endpoint di Budget & Forecast deve verificare
  `utente.ruolo IN (dirigente, admin)`, altrimenti redirect al login o pagina 403.
- Se il sito è WordPress: valutare una **capability custom** (`manage_budget`) assegnata al
  ruolo Dirigente, invece di hardcodare controlli sparsi nel codice.

---

## Fase 3 — Navigazione

- Individuare il file/componente/menu che genera la voce "Area Atleti".
- Aggiungere **subito sopra** una nuova voce "Area Dirigenti":
  - Sempre visibile nel menu (anche a chi non ha fatto login), ma al click porta al login se
    l'utente non è autenticato, e a una pagina "accesso non autorizzato" se autenticato ma
    senza ruolo dirigente — **oppure**, se preferite, visibile solo dopo login come sotto-voce
    condizionale (da decidere in base a come si comporta oggi "Area Atleti").
  - Dopo login con ruolo corretto, porta alla dashboard dell'Area Dirigenti (Fase 5).

---

## Fase 4 — API / logica di backend

Endpoint minimi (REST o equivalente secondo lo stack rilevato in Fase 0):

- `GET/POST/PUT/DELETE /api/budget/seasons`
- `GET/POST/PUT/DELETE /api/crm/aziende` — anagrafica sponsor, indipendente dalla stagione
- `GET/POST/PUT/DELETE /api/crm/sponsorizzazioni` — il "deal" per stagione, con filtro per `stato`
  (così il frontend può chiedere solo i "chiusi" o solo la pipeline senza due endpoint diversi)
- `POST /api/crm/sponsorizzazioni/:id/cambia-stato` — endpoint dedicato per lo spostamento tra
  stadi della pipeline (utile per la vista kanban drag-and-drop della Fase 5)
- `GET/POST /api/crm/sponsorizzazioni/:id/attivita` — timeline delle interazioni
- `GET/POST/PUT /api/crm/promemoria` — follow-up, con `GET /api/crm/promemoria/scaduti` per i
  reminder in ritardo da mostrare in dashboard
- `GET/POST/PUT/DELETE /api/budget/categorie-atleti`
- `GET/POST/PUT/DELETE /api/budget/voci-spesa`
- `GET /api/budget/riepilogo?season_id=...` → calcola e restituisce totali entrate, uscite,
  saldo, differenza da obiettivo, % raggiungimento (stessa logica delle formule del foglio Excel)
- `GET /api/budget/audit-log?entita=...&dirigente_id=...&dal=...&al=...` — **solo lettura**,
  nessun verbo di scrittura esposto; supporta filtri per entità, dirigente e intervallo date
  per rendere il log consultabile anche con molte righe accumulate nel tempo

Tutti protetti dal controllo ruolo della Fase 2.

---

## Fase 5 — UI Area Dirigenti → Budget & Forecast

Pagina con le stesse sezioni del file Excel, in versione web — ma la parte sponsor diventa
un vero modulo CRM invece di due tabelle:

1. **Obiettivo stagione** — campo editabile, salvataggio automatico o con pulsante "Salva".
2. **Sponsor — vista Pipeline (Kanban)** — colonne per stato (Prospect · Contattato · In
   Trattativa · Chiuso · Rifiutato), ogni sponsor è una card trascinabile tra colonne
   (drag-and-drop cambia stato via `POST /sponsorizzazioni/:id/cambia-stato`). Ogni card mostra:
   nome azienda, importo (stimato o confermato), dirigente responsabile, data prossimo
   promemoria. Filtro rapido "solo i miei" per dirigente.
3. **Sponsor — Scheda Azienda** (click su una card) — vista di dettaglio con: dati anagrafici,
   storico sponsorizzazioni delle stagioni passate (per capire subito se è uno sponsor storico
   da riconfermare), **timeline attività** (chiamate/email/incontri con data e autore) e
   **promemoria** collegati, con possibilità di aggiungerne di nuovi.
4. **Dashboard promemoria** — widget in home Area Dirigenti con i follow-up in scadenza o
   scaduti, per tutto il direttivo (non solo per chi li ha creati) — es. "3 promemoria
   scaduti", cliccabile per andare dritti alla scheda azienda.
5. **Rette Atleti** — una riga per categoria, con incasso aggiornabile.
6. **Spese** — tabella voci di spesa.
7. **Riepilogo** — card con Entrate totali / Uscite totali / Saldo / Differenza da obiettivo,
   più due grafici (a barre: entrate vs uscite vs obiettivo; a torta: composizione entrate) —
   usare la libreria grafici già presente nel progetto, se c'è, altrimenti una libreria leggera
   (es. Chart.js/Recharts per stack JS). L'entrata "sponsor potenziali" del riepilogo si
   calcola sommando il valore pesato di tutte le sponsorizzazioni non ancora "chiuse".
8. **Selettore stagione** in alto, per consultare anche stagioni passate (sola lettura se non
   è la stagione attiva, oppure editabile con conferma).
9. **Log (sola lettura)** — nuova voce nel menu dell'Area Dirigenti, separata dalle altre
   sezioni operative. Mostra una tabella cronologica (più recente in alto) con: data/ora,
   dirigente, entità toccata (es. "Sponsorizzazione — Ristorante Da Gino"), campo modificato,
   valore prima → valore dopo. Filtri per dirigente, per tipo di entità e per intervallo date.
   Nessun pulsante di modifica o cancellazione da nessuna parte in questa pagina, nemmeno per
   l'admin — coerente con i permessi descritti in Fase 1bis. Utile in caso di dubbi tipo "chi
   ha cambiato l'importo di questo sponsor?" senza dover chiedere in giro al direttivo.

**Bonus opzionale:**
- Notifica (email o, se il sito lo supporta, push/WhatsApp) quando un promemoria è in scadenza.
- Pulsante "Esporta in Excel" che genera al volo un file .xlsx con la stessa struttura del
  template già creato, per chi vuole comunque scaricare un riepilogo offline.

---

## Fase 6 — Test

- [ ] Un utente "atleta" non deve vedere né la voce di menu funzionante né poter chiamare le API.
- [ ] Un utente "dirigente" deve poter fare CRUD completo su tutte le sezioni.
- [ ] I totali/calcoli lato server devono coincidere con quelli mostrati lato client (niente
      calcoli solo in frontend che poi divergono dal backend).
- [ ] Cambiare stagione non deve mescolare i dati tra stagioni diverse.
- [ ] Spostare una card nel kanban deve aggiornare correttamente lo stato a DB e ricalcolare
      subito il riepilogo (uno sponsor spostato su "Chiuso" deve uscire dal "valore pesato" ed
      entrare nel totale sponsor chiusi).
- [ ] La timeline attività e i promemoria devono essere visibili a **tutti** i dirigenti, non
      solo a chi li ha creati (è collaborazione di squadra, non un'agenda personale).
- [ ] Un'azienda già sponsor in una stagione precedente deve essere facilmente riconoscibile
      (es. badge "sponsor storico") quando si crea la nuova sponsorizzazione per la stagione
      corrente, senza dover ricreare l'anagrafica da zero.
- [ ] Ogni singola modifica (creazione, modifica campo, cancellazione) su sponsor, rette,
      spese, obiettivo e promemoria deve produrre una riga di log coerente e leggibile, con
      valore precedente e nuovo corretti — non solo "riga X modificata".
- [ ] Nessuna richiesta HTTP verso l'endpoint del log con verbo diverso da GET deve essere
      accettata, a prescindere dal ruolo di chi la invia (nemmeno l'admin può scrivere lì).
- [ ] Se un dirigente cancella uno sponsor o una voce di spesa, il record sparisce dalle
      viste operative ma resta visibile nel Log (il log non deve dipendere dall'esistenza
      del record originale, altrimenti una cancellazione cancellerebbe anche la sua traccia).
- [ ] Test su mobile/responsive, dato che i dirigenti potrebbero consultarlo da telefono.

---

## Fase 7 — Deploy

- Migrazioni database in staging prima che in produzione (se esiste uno staging, vedi Fase 0).
- Backup del database di produzione prima di applicare le migrazioni.
- Deploy della voce di menu e della pagina solo dopo che i permessi sono verificati, per
  evitare di esporre temporaneamente dati sensibili (importi sponsor, rette) a chi non deve
  vederli.

---

## Domande da confermare con il committente (dirigente Victor Volley) prima di iniziare

1. Il sito ha già un login per "Area Atleti"? Con che tecnologia è fatto?
2. Chi altro, oltre a te, dovrà avere accesso all'Area Dirigenti? Serve un ruolo unico
   "dirigente" o più livelli (es. presidente vede tutto, un altro dirigente vede solo la sua
   sezione)?
3. Preferisci che i dati storici (stagioni passate) restino consultabili, o basta la stagione
   corrente?
4. Serve anche l'export in Excel dalla pagina web, o il sito sostituisce del tutto il file?
5. Ogni sponsor/potenziale sponsor deve avere un dirigente "responsabile" assegnato (per sapere
   chi lo segue), o la gestione è collettiva senza assegnazioni individuali?
6. I promemoria di follow-up devono generare una notifica (email? altro canale?) o basta che
   siano visibili in una lista quando si apre il sito?
