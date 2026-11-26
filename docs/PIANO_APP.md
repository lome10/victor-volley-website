# App Victor Volley per telefono — piano (VVW-37)

Scritto il 26/11/2026. **Solo piano: nessun codice ancora.** Da approvare con Lorenzo prima di iniziare.

## Decisioni di Lorenzo (26/11)
- App **nativa** su App Store e Play Store (non PWA, non un contenitore del sito).
- Prima versione con **tutte e quattro** le parti: pubblica, area atleti, area allenatori/dirigenti, notifiche push.

## Com'è il sito oggi (cosa l'app deve riusare)
- Sito HTML statico su Vercel + **Firebase** (progetto `victor-volley`): Firestore piano gratuito Spark (limite 50.000 letture/giorno, superato una volta il 13/10), login Firebase Auth con email e password.
- Funzioni server in `api/*` (Vercel, firebase-admin): inviti, password, ricevute PDF, promemoria (cron), allenatore, YouTube live. Email con Brevo, immagini su Cloudinary.
- **Punteggio dal vivo** e calendario/risultati delle partite vengono da Set Point Pulse (`victor-volley.setpointpulse.com/api/club/victor-volley/live`, già usato da `js/diretta.js`).
- Ruoli: dirigente = `dirigenti/{uid}` con `ruolo` (master, presidente, segreteria, presenze, vedi `api/_ruolo.js`); allenatore = `allenatori/{uid}` (entra da `/admin`, poi `/allenatore`); famiglia/atleta = account elencato in `atleti/{id}.accessUids`.
- Area atleti (`atleta.html`): Home (avvisi certificato medico), Avvisi, Calendario con risposta sì/no alle presenze, Squadra, Documenti (ricevute PDF), Profilo (promemoria email).
- Area allenatore (`allenatore.html`): Atleti, Presenze, Statistiche, tutto tramite `/api/allenatore-atleti` e `/api/allenatore-presenze`.
- Pannello dirigenti (`admin.html`, 16 sezioni, ~170 KB): atleti, ricevute, budget, sponsor, articoli, galleria, calendario, comunicazioni, presenze, allenamenti, ecc.

## Stack dell'app
Stesso dell'app di Set Point Pulse (`set-point-pulse/mobile/`), così si riusano esperienza, configurazione e account:
- Expo (SDK 58, come SPP) + Expo Router + TypeScript, build e invio agli store con EAS (account Expo `lome-labs`, progetto nuovo).
- Firebase JS SDK (modulare) per login e dati riservati, con la sessione salvata nel telefono (AsyncStorage).
- TanStack Query per i dati, con `focusManager` e riconnessioni collegati ad `AppState` fin dall'inizio (lezione di SPP-97).
- Notifiche con `expo-notifications` (servizio push di Expo).
- Codice in **`victor-volley-website/mobile/`** (come in SPP), da aggiungere a `.vercelignore` per non pubblicarlo sul sito.

## Il punto delicato: le letture di Firestore
Il piano Spark ha già superato il limite una volta. Un'app che legge Firestore direttamente da ogni telefono (home ~94 letture a visita, oggi) rischia di superarlo spesso.
**Soluzione (fase 1):** un endpoint su Vercel, `/api/app-pubblico`, che legge le collezioni pubbliche (`articles`, `partite`, `allenamenti`, `allenamentiEccezioni`, `albums`, `players`, `staff`, `categories`, `settings`, `siteData`) e risponde con un unico JSON in cache (1–5 minuti). L'app legge solo quello per la parte pubblica. È lo stesso intervento consigliato in `docs/PIANO_MIGRAZIONE_SUPABASE.md` §10, quindi può servire anche al sito.
Area atleti e allenatori leggono solo i dati del singolo utente (poche letture), come fa già il sito.

## Fasi
Stima totale: **9–12 sessioni di lavoro**, più l'attesa della revisione degli store.

### Fase 0 — Preparazione (1 sessione)
- Cartella `mobile/` con Expo, icona e colori dal brandbook (`docs/brandbook/`, `assets/icon-512.png`, `assets/logo-bianco.svg`), font del sito.
- Progetto EAS, identificativo dell'app (proposta: `it.victorvolley.app`), schema per i link (`victorvolley://` e `https://www.victorvolley.it/...`).
- Barra in basso: Home, Calendario, News, Diretta, Area riservata.

### Fase 1 — Parte pubblica (2–3 sessioni)
- Endpoint `/api/app-pubblico` (vedi sopra) con test in `scripts/`.
- Home: prossima partita con conto alla rovescia, partite in diretta (da SPP), ultime news, sponsor.
- News ed articolo; Calendario e risultati con classifica del girone; Squadre (giocatrici e staff); Galleria (album Cloudinary); Diretta (YouTube + punteggio SPP); Sponsor; Contatti e "Unisciti a noi" (link al modulo del sito).

### Fase 2 — Area atleti (2 sessioni)
- Login con gli stessi account del sito (nessuna nuova registrazione), "password dimenticata", uscita.
- Scelta del figlio se l'account ne ha più di uno.
- Home con avvisi (certificato medico), Avvisi con i nuovi evidenziati, Calendario con risposta sì/no alle presenze, Squadra, Documenti/ricevute (apertura del PDF), Profilo e preferenze dei promemoria.
- Permessi: si usano le stesse regole di `firestore.rules`, senza cambiarle.

### Fase 3 — Allenatori e dirigenti (2 sessioni)
- Allenatore: Atleti, Presenze (un giorno alla volta, comodo da telefono), Statistiche, tramite le API già esistenti.
- Dirigenti: **solo le azioni da campo** in nativo (già indicate in `docs/PIANO_MOBILE.md`): presenze, nuovo avviso/comunicazione, allenamento spostato o annullato. Il resto del pannello (budget, ricevute, sponsor, articoli...) si apre dal sito `/admin` dentro l'app: rifarlo tutto in nativo vorrebbe dire molte sessioni in più per sezioni che si usano da computer.

### Fase 4 — Notifiche push (1–2 sessioni)
- Permesso chiesto al primo accesso; il codice del telefono si salva in una nuova collezione Firestore `dispositivi/{uid}` (regole: ognuno solo il proprio).
- Invio da una funzione Vercel con il servizio push di Expo.
- Notifiche previste: nuovo avviso della società o della squadra (collezione `comunicazioni`, solo alle famiglie interessate), inizio e risultato delle partite di Victor Volley (dal live di SPP), promemoria già esistenti (cron giornaliero). Ogni tipo si può spegnere dal Profilo.

### Fase 5 — Store (1 sessione + attesa revisione)
- Prova interna (TestFlight e test interno Play) con Lorenzo e qualche dirigente.
- Scheda dello store, screenshot, informativa privacy aggiornata (dati di minori, notifiche), etichette privacy di Apple, account di prova per i revisori (un atleta e un allenatore di prova).

## Rischi
| Rischio | Cosa si fa |
|---|---|
| Limite letture di Firestore | endpoint in cache per la parte pubblica (fase 1), prima di pubblicare |
| Dati di minori visibili alla persona sbagliata | nessuna regola nuova sui dati esistenti, si riusano `firestore.rules` e le API del sito; prova con due famiglie diverse |
| Apple rifiuta un'app "di un club" pubblicata da un altro nome | decidere prima chi la pubblica (vedi sotto) |
| App e sito che divergono | stessi dati e stesse API; le regole (es. statistiche presenze `js/presenze-stat.js`) si riusano, non si riscrivono |
| Notifiche verso la famiglia sbagliata | destinatari calcolati sul server dalle stesse regole degli avvisi, con test |

## Cosa serve da Lorenzo
1. **Chi pubblica l'app**: l'account sviluppatore Apple già usato per Set Point Pulse, oppure un account a nome di ASD Victor Volley (consigliato per mostrare "Victor Volley" come venditore; serve il D-U-N-S della società, gratuito ma richiede qualche giorno).
2. **Play Store**: stesso dubbio per l'account Google Play.
3. **Nome sull'icona** ("Victor Volley"?) e identificativo `it.victorvolley.app`: ok?
4. Conferma che il pannello completo dei dirigenti resta sul sito (aperto dentro l'app) e in nativo vanno solo le azioni da campo.
5. Ordine delle notifiche: quali servono per prime.
6. Più avanti: due account di prova (atleta e allenatore) per i revisori degli store.

## Primo passo dopo l'ok
Fase 0 + endpoint `/api/app-pubblico` della fase 1 (utile subito anche al sito per le letture).
