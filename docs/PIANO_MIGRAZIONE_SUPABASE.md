# Piano di migrazione Firestore → Supabase (NON APPLICATO)

Scritto il 2026-10-14. **È un piano di riserva: nessuna parte è stata eseguita.** Per ora si resta su Firestore (Spark).
I prezzi e i limiti di Supabase e Firebase sono scritti a memoria e vanno verificati sulle pagine ufficiali prima di decidere.

## 1. Perché esiste questo piano, e quando conviene usarlo

Motivo iniziale: il 13/10/2026 il piano Spark ha superato le 50.000 letture al giorno (54K) e gli invii davano «quota raggiunta».

Cosa dice la console Firebase (Firestore → Utilizzo, controllata il 2026-10-14):
- ultimi 30 giorni: **297K letture** (media ~10K/giorno), 2,5K scritture, 55 cancellazioni;
- il limite è stato superato **una sola volta**; il picco è stato di ~25K letture in un'ora, per lavoro sull'admin (budget, backup, ricaricamenti), non per traffico pubblico;
- da inizio ottobre il consumo giornaliero è salito a 10–33K, in parallelo al lavoro sul pannello.

Interventi già fatti sulle letture (commit `914178c`): registro modifiche a richiesta, cache atleti 10 minuti, backup con le ultime 300 voci del registro.

**Per le sole letture la migrazione non serve.** Si prende in considerazione se si verifica almeno una di queste:
1. le letture superano ancora il limite *dopo* i tagli e dopo la cache dei dati pubblici (vedi §10);
2. servono report e query SQL (join tra atleti, rate, ricevute, sponsor) scomode con Firestore;
3. i costi del piano a consumo di Firebase (Blaze) risultano peggiori di quelli di Supabase;
4. Firebase cambia condizioni o servizio in modo sfavorevole.

Alternative più economiche da provare prima: cache dei dati pubblici (§10) e Blaze con tetto di spesa.

## 2. Cosa c'è oggi (inventario)

**Dati.** Backup del 13/10/2026: 2.650 documenti, ~3 MB, di cui 2.047 sono `auditLog`. Circa 36 collezioni:

| Gruppo | Collezioni |
|---|---|
| Sito pubblico (lettura libera) | `articles`, `partite`, `allenamenti`, `albums`, `categories`, `players`, `staff`, `settings`, `siteData` |
| Atleti e famiglie | `atleti`, `atletiDati`, `accessi`, `comunicazioni`, `presenze`, `notifiche`, `rateAtleti`, `ricevute`, `contatoriRicevute`, `firme` |
| Budget / dirigenti | `budgetSeasons`, `aziende`, `sponsorizzazioni`, `tranchePagamento`, `attivita`, `promemoria`, `pianoEditoriale`, `bacheca`, `categorieAtleti`, `atletiRette`, `tessere`, `supercoppaBari`, `altreEntrate`, `vociSpesa`, `sottospese`, `categorieSpesa` |
| Sistema | `dirigenti`, `auditLog`, `promemoriaInviati`, `inviti` |

**Client.** `js/db.js` è il livello dei dati per le pagine pubbliche (caricamento a parti, cache in memoria, scrittura ottimistica). Admin, budget e area atleti parlano con Firestore direttamente: i file più legati sono `js/admin/atleti.js`, `js/admin/budget/*` (materiali, sponsor, spese, main, rette), `js/admin.js`, `js/atleta.js`, `js/admin/ricevute.js`, `js/admin/cms.js`. Non si usa `onSnapshot` (tempo reale).

**Login (Firebase Auth).** Email e password per dirigenti (11), atleti e genitori (circa 49 account in `accessi`). Usati: `signInWithEmailAndPassword`, `createUserWithEmailAndPassword` (il pannello crea gli account), `sendPasswordResetEmail`, `onAuthStateChanged`; lato server `createUser`/`updateUser` (`api/imposta-password.js`, `api/set-athlete-password.js`).

**Server (`api/*`, Vercel, firebase-admin).** `invia-invito`, `imposta-password` (transazione sul codice monouso), `invia-ricevuta` (+ PDF), `promemoria` (cron giornaliero), `sitemap`, `set-athlete-password`. Le email passano da Brevo.

**Permessi.** `firestore.rules` (~200 righe): ruolo dirigente = esistenza di `dirigenti/{uid}`; la famiglia legge solo ciò che riguarda i propri atleti (`accessUids`, `possiedeAtleta`); `ricevute` non cancellabili e annullabili solo con campi precisi; `auditLog` solo in aggiunta; `inviti` e `promemoriaInviati` solo il server.

**Funzioni specifiche di Firestore da sostituire:** transazioni (`runTransaction` in `imposta-password.js`, contatore `contatoriRicevute`), `writeBatch`, id dei documenti generati dal client, `FieldValue` (in `cms.js`, `ricevute.js`, `admin.js`).

**Test.** `npm test` ha 11 controlli; quelli legati a Firestore (`check-collections`, `check-invito`, `check-ricevuta`, parte di `check-budget`, `check-admin`) vanno adattati.

## 3. Architettura di arrivo

- **Database:** Postgres su Supabase, regione UE (dati di minori: GDPR).
- **Auth:** Supabase Auth (email e password), un account per atleta/genitore/dirigente.
- **Permessi:** Row Level Security (RLS) al posto di `firestore.rules`.
- **Server:** le funzioni `api/*` restano su Vercel, ma usano il client Supabase con la *service role key* al posto di firebase-admin. La chiave resta solo nelle variabili d'ambiente di Vercel, mai nel browser.
- **Client:** `@supabase/supabase-js` al posto dell'SDK Firebase (oggi `js/vendor/firebase-app-compat.js`).

## 4. Disegno dei dati: due strade

1. **Una tabella per collezione con colonna `jsonb` (consigliata per partire).** Ogni tabella ha `id` (text/uuid), le colonne che servono a filtrare e proteggere (`atleta_id`, `stagione_id`, `stato`, date) e `dati jsonb` con il resto. È un porting quasi uno a uno: la logica dell'app cambia poco, e si può normalizzare dopo.
2. **Tabelle normalizzate per le entità forti** (atleti, rate, ricevute, sponsorizzazioni, spese) con chiavi esterne. Rende di più per report e integrità, ma richiede più lavoro e più rischio di regressioni.

Scelta: partire con la 1, poi normalizzare solo dove serve (rate, ricevute, tranche).

Cose da decidere nello schema:
- le collezioni pubbliche hanno un `id` numerico nei dati **e** un id di documento diverso (`js/db.js`, mappa `_ids`): in Postgres l'id numerico diventa la chiave e la mappa sparisce;
- le date oggi sono stringhe `YYYY-MM-DD` e ISO: restano testo o diventano `date`/`timestamptz` (impatta confronti e ordinamenti nel codice);
- `settings`/`siteData` contengono array in un campo `items` o JSON in stringa: tabella `impostazioni(chiave, valore jsonb)`;
- `auditLog` (la parte più grande): tabella append-only, valutare se importare tutto o solo gli ultimi N mesi, tenendo il resto come file di archivio.

## 5. Traduzione dei permessi (regole → RLS)

| Regola Firestore | Equivalente Supabase |
|---|---|
| `isDirigente()` | funzione SQL `is_dirigente()` (`exists` su tabella `dirigenti` con `auth.uid()`), `security definer` |
| Pubblico in lettura, scrittura solo dirigenti | policy `select using (true)` + `insert/update/delete using (is_dirigente())` |
| `atleti`: legge chi è in `accessUids` o l'atleta | policy `select` con `auth.uid() = any(access_uids)` |
| `atletiDati` solo dirigenti (dati di minori) | policy solo `is_dirigente()`; **nessuna** lettura pubblica |
| `presenze`: la famiglia scrive solo per i propri atleti, con campi fissi | policy `insert/update` con `with check` + trigger di validazione dei campi |
| `ricevute`: mai cancellabili, solo annullabili | nessuna policy `delete`; trigger che permette solo valida → annullata e solo certi campi |
| `auditLog` solo in aggiunta | solo `insert` e `select` per i dirigenti, nessun `update/delete` |
| `inviti`, `promemoriaInviati` solo server | RLS attiva senza policy: accessibili solo con la service role key |
| `notifiche`: ognuno solo il proprio documento, solo campo `email` | policy su `auth.uid()` + `check` sui campi |

Attenzione: in Firestore gli account si registrano via client (le regole non bastano a distinguere chi è chi). In Supabase **vanno disattivate le registrazioni libere** (solo inviti/creazione dal server), altrimenti chiunque potrebbe creare un account.

Ogni policy ha un test (vedi §9): famiglia A non vede l'atleta della famiglia B, un account qualsiasi non scrive, nessuno cancella una ricevuta.

## 6. Login: la parte più delicata

- Le password di Firebase non si possono riusare in modo utile: le famiglie dovrebbero **sceglierne una nuova**. Il flusso esiste già (invito via email con link monouso, `api/invia-invito.js` + `imposta-password.html`): va riscritto sul nuovo servizio.
- Si crea un utente Supabase per ogni account (importando email e ruolo) con password casuale non comunicata, poi si invia l'invito.
- `dirigenti/{uid}` e `accessi/{uid}` cambiano chiave: il nuovo `uid` Supabase sostituisce quello Firebase. Serve una tabella di corrispondenza vecchio→nuovo uid usata durante l'importazione per riscrivere `accessUids`, `rispostaDa`, `annullataDa`, ecc.
- Il reset password passa dal flusso Supabase; i testi delle email restano quelli di Brevo.
- Piano B se qualcosa va storto: tenere Firebase Auth attivo per un periodo e usarlo solo per il login, finché le famiglie non hanno attivato il nuovo account (richiede un ponte con JWT e non è consigliato se evitabile).

## 7. Fasi di lavoro

0. **Decisione e preparazione.** Confermare il motivo (§1). Creare il progetto Supabase in regione UE, due ambienti (prova e produzione). Verificare piano, limiti e pausa del progetto gratuito. Nuovo backup completo di Firestore.
1. **Schema e policy.** Tabelle, funzioni (`is_dirigente`, controlli sui campi), policy RLS, trigger. Si rivede insieme prima di toccare il codice.
2. **Test dei permessi.** Script che prova le policy con utenti finti (dirigente, genitore A, genitore B, anonimo).
3. **Importazione dati.** Script dal backup JSON: conversione di timestamp e id, tabella uid vecchio→nuovo, controllo dei conteggi per collezione e di un campione di documenti. Ripetibile (si può rilanciare su un progetto vuoto).
4. **Utenti.** Creazione degli account e prova dell'invito/reimpostazione password su account di prova.
5. **Client, un'area alla volta,** dietro un interruttore (`window.BACKEND = 'firebase' | 'supabase'`): prima `js/db.js` e le pagine pubbliche, poi admin (atleti, CMS), budget, area famiglie. Per ogni area: controlli automatici + prova a mano con `docs/SMOKE_TEST_ADMIN.md`.
6. **Server.** Riscrivere `api/_firebase.js` e le sei funzioni; sostituire le transazioni con funzioni SQL (`rpc`) o `update ... where` atomici; il contatore delle ricevute con una sequenza o funzione che incrementa per anno. Variabili d'ambiente su Vercel.
7. **Collaudo completo** sull'ambiente di prova con una copia dei dati veri: giro completo (login famiglia, rate, ricevuta con PDF, promemoria con `?dry=1`, backup, budget).
8. **Passaggio.** Finestra concordata, avviso ai dirigenti: ultima esportazione da Firestore → importazione → verifica conteggi → cambio interruttore → controllo. Firestore resta in **sola lettura** per alcune settimane (regole `allow write: if false`) come rete di sicurezza.
9. **Pulizia.** CSP (`connect-src` verso Supabase, via Firebase), informativa privacy (nuovo fornitore e regione), rimozione dell'SDK Firebase, di `firestore.rules` e `firebase.json`, aggiornamento di `session_notes.md` e dei test.

## 8. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Perdita o errore di dati nell'importazione | importazione ripetibile, controllo dei conteggi, backup di partenza, Firestore in sola lettura dopo il passaggio |
| Permessi sbagliati (dati di minori visibili) | test automatici delle policy, RLS attiva su tutte le tabelle, nessun accesso anonimo alle tabelle riservate, revisione prima della messa online |
| Famiglie che non riescono ad accedere | inviti scaglionati, istruzioni nella guida famiglie, assistenza per il primo periodo, account dirigenti migrati per primi |
| Regressioni nel pannello admin (monolite grande) | passaggio per area con interruttore, smoke test, test esistenti adattati |
| Transazioni e contatori (numero ricevuta progressivo, codice invito monouso) | funzioni SQL atomiche con test di concorrenza |
| Piano gratuito: pausa per inattività e limiti | verificare prima; per un sito con dati di minori e uso in produzione valutare il piano a pagamento |
| Doppio lavoro se poi non serve | il piano è eseguibile a pezzi; le fasi 0–3 si fanno su un progetto di prova senza toccare il sito |

## 9. Test da scrivere o adattare

- policy RLS (matrice ruolo × tabella × operazione);
- importazione (conteggi, campioni, uid riscritti);
- `check-collections` (oggi confronta le raccolte usate con le regole: va rifatto su tabelle e policy);
- `check-invito`, `check-ricevuta`, `check-promemoria`: la logica pura resta, cambia l'accesso ai dati;
- concorrenza: due richieste insieme sullo stesso invito e sullo stesso contatore di ricevute;
- `check-csp` aggiornato al nuovo dominio.

## 10. Prima di migrare: cosa fare su Firestore (consigliato)

1. **Cache dei dati pubblici:** una funzione su Vercel legge Firestore una volta al minuto e serve a tutti un unico file in cache. Le letture pubbliche (oggi 50–100 per visita: home ~94, squadre ~101, news ~90, calendario ~55) scenderebbero a poche decine all'ora. Il banner delle partite in diretta oggi carica 52 partite su ogni pagina.
2. **Piano a consumo (Blaze) con tetto di spesa** come rete di sicurezza: le prime 50.000 letture al giorno restano gratuite.
3. Rivedere la console di utilizzo ogni settimana per due settimane.

## 11. Stima

Ordine di grandezza (da raffinare in fase 0): schema, policy e test 1–2 sessioni; importazione e utenti 1–2; client e server 4–6; collaudo e passaggio 1–2. In totale **circa 8–12 sessioni di lavoro**, più il tempo di prova con i dirigenti. La parte più rischiosa e più visibile alle famiglie è il login (§6).

## 12. Domande aperte

- Il motivo vero oggi è solo il limite delle letture? (Se sì, vedi §10 prima di tutto.)
- Piano gratuito o a pagamento di Supabase, e in che regione?
- Si accetta di far reimpostare la password a tutte le famiglie?
- Si importa tutto `auditLog` o solo gli ultimi mesi?
- Si vuole normalizzare lo schema subito (strada 2) o dopo (strada 1)?
- Ci sono nuove funzioni (report SQL, area dirigenti) che giustificano il passaggio?
