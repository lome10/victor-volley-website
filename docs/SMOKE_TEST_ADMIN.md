# Smoke test — pannello admin

Da fare **prima** di spezzare `js/admin.js` (per avere un punto di partenza che funziona) e **dopo ogni
estrazione** (per accorgersi subito di cosa si è rotto). Tempo: circa 25 minuti completa, 5 minuti la
versione rapida (sezione "Giro rapido").

## Prima di cominciare

1. Lancia il controllo automatico: `node scripts/check-admin.js` → deve finire con `OK`.
   Controlla sintassi, `onclick` che puntano a funzioni esistenti, voci di menu complete e id usati dal JS.
2. Apri il pannello (`/admin`), accedi come dirigente e tieni aperta la **console del browser** (F12 → Console).
   **Qualsiasi errore rosso durante il test è un fallimento**, anche se la pagina sembra funzionare.
3. Ricarica con `Ctrl+Shift+R` per evitare file in cache (admin.js ha `?v=` manuale).

### Regole per non sporcare i dati reali

- Crea solo record con il prefisso **`TEST`** (es. "TEST articolo", "TEST Atleta") e **cancellali a fine prova**.
- **Non** premere i bottoni di migrazione: "Avvia migrazione" (File JSON → immagini) e "Ricalcola IVA sponsor".
- Non modificare né cancellare record reali. Se un passo richiede un dato esistente, apri e chiudi senza salvare.
- Il test sull'**email di reset** manda una mail vera: usalo solo su un account di prova con email reale.

Legenda: ☐ da fare · ✔ ok · ✘ rotto (annota cosa, con il testo dell'errore in console).

---

## 0. Giro rapido (5 minuti, dopo ogni piccola modifica)

- ☐ Il pannello si apre dopo il login e la Dashboard mostra i numeri, senza errori in console.
- ☐ Clicca **ogni voce del menu** (4 gruppi + Dashboard): ogni sezione si apre, mostra dati o "vuoto", titolo corretto in alto.
- ☐ Apri e chiudi **un modulo di creazione** a scelta (es. Nuovo articolo) senza salvare.
- ☐ Budget: clicca le 5 schede (Riepilogo, Pipeline Sponsor, Rette Atleti, Spese, Bilancio).
- ☐ Ricarica la pagina su `/admin/atleti` (URL diretto): si apre direttamente la sezione giusta.

---

## 1. Accesso e struttura

- ☐ Login con un account **non dirigente** → accesso negato, nessun dato visibile.
- ☐ Login dirigente → entra. "Esci" (in basso a sinistra) riporta al login.
- ☐ **Menu laterale:** i gruppi (Sport, Comunicazione, Società, Sistema) si aprono/chiudono; all'avvio è aperto solo
  quello della sezione attiva; cambiando sezione il suo gruppo si apre da solo.
- ☐ **Routing:** i pulsanti Indietro/Avanti del browser cambiano sezione; un URL diretto `/admin/<sezione>` funziona;
  un URL sconosciuto (`/admin/xyz`) apre la Dashboard.
- ☐ **Mobile** (finestra stretta, < 900 px): il menu si apre dal pulsante in alto, si chiude cliccando fuori, con `Esc`
  e dopo aver scelto una voce.
- ☐ **Cambia la mia password** (pulsante nella barra in alto della Dashboard): chiede la password attuale; validazione
  (minimo 6 caratteri, due campi uguali). Non completare il cambio se non serve.
- ☐ **Esporta backup** (in basso a sinistra): scarica un file JSON non vuoto.

## 2. Dashboard

- ☐ Mostra i contatori (articoli, partite, ecc.) e le liste "ultimi elementi" senza errori.
- ☐ Il widget "Budget stagione" compare e i suoi numeri coincidono con Budget → Riepilogo.

## 3. Gruppo Sport

### Calendario
- ☐ Elenco partite con filtri; **Nuova partita** (TEST) con avversario, data, categoria, casa/fuori.
- ☐ Modifica e salva; cambia lo stato (programmata/conclusa) → compaiono i campi risultato (`toggleResultFields`).
- ☐ Carica un logo avversario (anteprima e upload su Cloudinary).
- ☐ Cancella la partita TEST (con conferma).
- ☐ Sito pubblico: la partita compare in `/calendario` e, se prossima, nella barra partite della home.

### Allenamenti
- ☐ Aggiungi un orario settimanale TEST per una categoria, modificalo, cancellalo.

### Presenze
- ☐ La pagina si apre e mostra il riepilogo ("ci sarò / non ci sarò") per evento; il selettore categoria cambia l'elenco.

### Squadre
- ☐ Elenco categorie; **nuova categoria** TEST; aprila: tab giocatori e staff.
- ☐ Aggiungi un giocatore TEST con foto (ritaglio/upload); trascina per riordinare; modifica; cancella.
- ☐ Aggiungi un membro dello staff TEST; cancella.
- ☐ Cambia stagione (selettore) e torna indietro: i dati non si mescolano.
- ☐ Cancella la categoria TEST.

### Atleti
- ☐ Elenco per categoria con ricerca; filtro "senza categoria".
- ☐ **Nuovo atleta** TEST (con un'email di prova): compare in elenco.
- ☐ Apri la scheda: tab **Anagrafica** (salva un campo e ricarica per verificare), **Cert. Medico**, **Rate & Quote**,
  **Modulo Iscrizione**, **Accessi**, **Sicurezza** (visibile solo se l'atleta ha un login proprio).
- ☐ Rate: aggiungi una rata TEST, segnala come pagata, cancella. Verifica che compaia in Budget → Rette Atleti.
- ☐ Accessi: aggiungi un genitore di prova; "Scollega".
- ☐ Sicurezza: validazione dei due campi password; **Imposta password a mano** su un atleta di prova.
- ☐ **Invia email di reset**: funziona **solo** se l'indirizzo è una casella reale; le email `@victorvolley` non lo sono
  (il pannello lo dice nel commento a `_openMyPasswordModal`). Provalo su un genitore con email vera.
- ☐ Cancella l'atleta TEST (e controlla che sparisca anche da Budget → Rette Atleti).
- ☐ Riepilogo PDF delle quote (famiglie): si apre la finestra di stampa con importi coerenti.

### Girone
- ☐ Non esiste più nel menu (rimossa il 2026-10-01). Verifica che `/admin/girone` apra la Dashboard.

## 4. Gruppo Comunicazione

### Avvisi
- ☐ Nuovo avviso TEST per una squadra e uno per "tutte"; con allegato `https://…` valido; un allegato `http://` o
  senza protocollo viene **rifiutato**.
- ☐ Modifica, cancella.
- ☐ Area atleti (`/atleta`, account di prova): vede solo gli avvisi della propria categoria e quelli "tutte".

### Articoli
- ☐ Nuovo articolo TEST: titolo, testo formattato (editor ricco), categoria, copertina (upload + ritaglio/messa a fuoco).
- ☐ Salva come bozza e come pubblicato; modifica; cancella.
- ☐ Gestione **categorie articolo** (modale): aggiungi, rinomina, cancella.
- ☐ Sito pubblico: l'articolo pubblicato appare in `/news` e si apre in `/news-dettaglio`; la bozza no.

### Piano editoriale
- ☐ Vista calendario (e agenda su mobile); nuovo post TEST su un canale; modifica; cancella.

### Bacheca (kanban)
- ☐ Nuova scheda TEST; **trascinala** tra "Da fare / In corso / Fatta" (anche col tocco su mobile); modifica; cancella.

### Galleria
- ☐ Nuovo album TEST (titolo, data, slug automatico); carica 2 foto; apri l'album; modifica titolo/data/categoria.
- ☐ Cancella una foto, poi l'album.
- ☐ Sito pubblico: `/galleria` mostra l'album, `/galleria/<slug>` si apre, foto a schermo intero al clic.

## 5. Gruppo Società

### Sponsor (del sito)
- ☐ Nuovo sponsor TEST con livello e logo (con e senza "rimuovi sfondo"); link `https://…`.
- ☐ Modifica, riordina, cancella.
- ☐ Sito pubblico: `/sponsor` e la striscia in home mostrano lo sponsor; il link si apre (solo `http(s)`).

### Ricevute
Richiede le regole Firestore pubblicate (`ricevute`, `contatoriRicevute`). Le ricevute **non si cancellano**: ogni prova lascia un record. Provale con importi e nomi `TEST` e **annullale** a fine prova (il numero resta usato: è voluto).
- ☐ «Dati ASD» (pulsante in alto): senza codice fiscale «Nuova ricevuta» rifiuta di procedere; compilali e salva.
- ☐ «Nuova ricevuta» senza atleta (contributo liberale TEST): si emette, numero `AAAA/0001`, compare nel registro.
- ☐ Da Atleti → scheda → Rate & Quote: su una rata **pagata** compare «Emetti ricevuta»; si apre con importo, causale e data già compilati; dopo l'emissione il pulsante diventa «Ricevuta AAAA/NNNN» e apre il documento.
- ☐ Il documento si apre (finestra di stampa/«Salva come PDF»): dati ASD, pagatore, atleta, importo, bollo e firme corretti.
- ☐ Una rata con ricevuta valida **non si cancella** né si rimette «da pagare» (messaggio che rimanda alla ricevuta).
- ☐ «Annulla» chiede il motivo; la ricevuta resta nel registro come Annullata, il PDF mostra il timbro e la rata torna emettibile.
- ☐ Filtri (anno, stato, ricerca) ed «Esporta CSV» (si apre in Excel con le colonne giuste).
- ☐ Area atleti (`/atleta`, account famiglia di prova): la scheda «Ricevute di pagamento» elenca solo le ricevute del proprio atleta e «Scarica PDF» apre il documento. Un'altra famiglia non le vede.
- ☐ Log: compaiono «Ricevuta … create/update» e le modifiche ai Dati ASD.

### Dirigenti
- ☐ Elenco dirigenti; **aggiungi** un dirigente TEST (form nome, cognome, email, password); poi rimuovi. Non toccare i
  dirigenti veri.

### Budget & Forecast
Seleziona la stagione corrente e lasciala invariata, salvo dove indicato.
- ☐ **Riepilogo:** obiettivo, totali, grafici SVG e cashflow si disegnano; i numeri non sono `NaN`.
- ☐ **Pipeline Sponsor:** kanban a colonne; crea un'azienda TEST; sposta la scheda tra le colonne (anche col tocco).
- ☐ Apri la **scheda azienda** (drawer): accordion, note, tranche di pagamento (aggiungi una tranche TEST e segnala
  come pagata), attività e promemoria.
- ☐ Tabella **Materiali sponsor:** assegna dimensione/quantità a una cella, prezzo del pezzo (anche con due fasce).
- ☐ **Rette Atleti:** elenco per categoria coerente con le rate delle schede atleta.
- ☐ **Spese:** nuova voce TEST con categoria; **sottospesa** (preventivato/pagato, credito/incasso); totale riga;
  forecasting preventivato vs sostenuto; **PDF** della singola voce (letterhead, dettaglio sottospese).
- ☐ **Riepilogo IVA:** si apre e somma senza errori (**non** premere "Ricalcola IVA sponsor").
- ☐ **Bilancio:** entrate vs uscite per mese; export PDF (bilancio + spese per categoria).
- ☐ **Categorie di spesa** (gestione): aggiungi/cancella una categoria TEST.
- ☐ **Log** (sola lettura): le azioni fatte nel test compaiono con data, dirigente, entità e campi.
- ☐ Cancella tutto ciò che è TEST (azienda, tranche, spesa, sottospese) e ricontrolla che i totali tornino quelli di prima.

## 6. Gruppo Sistema

### File JSON
- ☐ Gli editor caricano il contenuto; **Formatta** funziona; **Salva** su un file solo se è un'azione voluta.
- ☐ **Non** premere "Avvia migrazione".

### Log
- ☐ Già coperto dal Budget → Log: si apre e filtra.

---

## 7. Chiusura

- ☐ Console del browser **senza errori rossi** per tutta la durata del test.
- ☐ Nessun record TEST rimasto (cerca "TEST" in Articoli, Squadre, Atleti, Spese, Sponsor, Galleria, Bacheca, Avvisi).
- ☐ Annota data, esito e problemi in `session_notes.md` (registro sessioni).

## Come usarlo durante la divisione di `admin.js`

1. Prima di toccare il codice: `node scripts/check-admin.js` e **giro rapido** → tutto ✔ (punto di partenza).
2. Estrai **una** sezione alla volta.
3. Dopo l'estrazione: `node scripts/check-admin.js`; poi il giro rapido; poi la sezione estratta per intero.
4. Se qualcosa si rompe, torna al commit precedente e ripeti con un passo più piccolo.
