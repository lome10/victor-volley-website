# Prompt per Claude Code — Hero, navbar partite, live scoring

Da eseguire in due fasi separate (non chiedere tutto insieme a Claude Code: prima la Fase 1, verifica il risultato, poi passa alla Fase 2).

---

## FASE 1 — Redesign hero + navbar scorrevole partite

```
Nella home page, modifica la sezione hero/carousel attuale:

1. Rimuovi il badge/etichetta "IN EVIDENZA" sopra il carousel.

2. Sposta le card del carousel leggermente più in basso (aumenta il
   margine/padding superiore della sezione di circa 60-80px), per
   lasciare spazio a un nuovo blocco orizzontale che inserirai sopra
   il carousel, sotto l'header.

3. Crea un nuovo blocco "navbar a scorrimento orizzontale" delle
   partite, posizionato tra l'header e il carousel fotografico.
   Caratteristiche:
   - Due tab/filtri cliccabili in alto al blocco: "Prossime partite"
     e "Partite concluse" (stile pillola, coerente con i badge di
     categoria già usati nel sito: sfondo azzurro pieno per il tab
     attivo, sfondo trasparente con bordo per quello inattivo)
   - Sotto i tab, una riga di micro-card in scorrimento orizzontale
     (scroll-x, non wrap su più righe), ciascuna larga circa
     220-260px, in stile coerente con le card già presenti nel sito
     (sfondo navy/blu scuro, angoli arrotondati 12px)
   - Contenuto di ogni micro-card:
     - Badge categoria in alto (stesso stile dei badge "PRIMA
       DIVISIONE" / "MINIVOLLEY" già visibili nel carousel)
     - Nome squadra 1 "vs" nome squadra 2 (testo bianco, peso 600,
       dimensione contenuta per restare leggibile su una card
       piccola — eventualmente su due righe se i nomi sono lunghi)
     - Data e orario della partita (testo più piccolo, grigio
       chiaro, sotto ai nomi)
   - Le card in "Prossime partite" sono ordinate cronologicamente
     dalla più imminente alla più lontana
   - Le card in "Partite concluse" sono ordinate dalla più recente
     alla meno recente, e mostrano anche il risultato finale (es.
     "3-1") al posto di data/ora, con un piccolo indicatore se la
     Victor Volley ha vinto o perso (es. un puntino verde/rosso, o
     il punteggio in verde se vittoria)
   - I dati per popolare entrambi i tab vengono letti per ora da un
     file placeholder `data/partite.json` (la integrazione con
     l'API live verrà fatta in un secondo momento, non implementarla
     in questa fase: usa dati statici di esempio per ora, con almeno
     3-4 partite per ciascun tab)
   - Su mobile: il blocco resta a scorrimento orizzontale (non si
     trasforma in lista verticale), con le card leggermente più
     piccole (180-200px di larghezza) e un piccolo indicatore visivo
     che si può scorrere (es. la card successiva parzialmente
     visibile a bordo schermo)

Non modificare altro nella pagina, solo la sezione hero/carousel e
il nuovo blocco partite sopra di essa.
```

---

## FASE 2 — Integrazione API live scoring

Da eseguire solo dopo che la Fase 1 è stata implementata e verificata, e solo quando l'API del tabellone esterno è pronta e accessibile (con un URL reale, anche se ancora in sviluppo/test).

```
Implementa l'integrazione con l'API esterna del tabellone live per
le partite, con questa struttura dati per ogni partita (l'endpoint
reale verrà fornito a parte, per ora usa questo esempio come
riferimento e lascia l'URL come variabile facilmente configurabile
in un file di configurazione separato, es. `js/config.js`):

{
  "id": "pd-2026-03-15-victor-vs-avversario",
  "categoria": "Prima Divisione",
  "squadra_casa": "Victor Volley",
  "squadra_ospite": "Nome Avversario",
  "data": "2026-03-15",
  "ora": "18:30",
  "palazzetto": "ARKÈ Melissano",
  "stato": "live",
  "set_correnti": { "casa": 1, "ospite": 2 },
  "set_in_corso": 3,
  "punteggio_set_in_corso": { "casa": 14, "ospite": 12 },
  "storico_set": [
    { "set": 1, "casa": 25, "ospite": 20 },
    { "set": 2, "casa": 22, "ospite": 25 }
  ],
  "ultimo_aggiornamento": "2026-03-15T19:42:00Z"
}

Endpoint previsti (sostituisci con l'URL reale quando disponibile,
per ora usa un placeholder chiaramente commentato nel codice):
- GET {API_BASE_URL}/partite → lista di tutte le partite
- GET {API_BASE_URL}/partite/live → solo le partite con stato "live"

Comportamento richiesto:

1. Nel blocco "Prossime partite" creato nella Fase 1, se una
   partita ha stato "programmata" mostra data/ora come già fatto.
   Se invece il suo stato passa a "live" (verificato tramite
   polling, vedi punto 3), la card si trasforma visivamente:
   - Il badge categoria resta, ma accanto compare un indicatore
     "LIVE" lampeggiante o con un piccolo pallino rosso animato
     (pulse animation, CSS, loop infinito, non invasivo)
   - Al posto di data/ora, mostra il punteggio set corrente
     (es. "1 - 2" riferito ai set vinti da ciascuna squadra) e,
     più in piccolo, il punteggio punto a punto del set in corso
     (es. "Set 3: 14-12")
   - La card diventa cliccabile per espandere il dettaglio completo
     con lo storico di tutti i set giocati finora

2. Quando una partita passa da stato "live" a stato "conclusa",
   la card si sposta automaticamente (al successivo refresh dei
   dati) dal tab "Prossime partite" al tab "Partite concluse",
   mostrando il risultato finale.

3. Implementa il polling: ogni 8-10 secondi, se è presente almeno
   una partita con stato "live" tra quelle caricate, richiama
   l'endpoint /partite/live e aggiorna solo i dati delle partite
   live (non ricaricare tutta la pagina, aggiorna il DOM in modo
   mirato). Se non ci sono partite live in quel momento, non fare
   polling continuo: ricontrolla a intervalli più ampi (es. ogni
   60 secondi) se una nuova partita è diventata live.

4. Gestione errori: se la chiamata all'API fallisce (rete assente,
   server del tabellone non raggiungibile), la card della partita
   mostra l'ultimo dato disponibile con una piccola nota
   discreta ("aggiornamento in corso...") invece di rompersi o
   mostrare un errore vistoso all'utente. Riprova automaticamente
   al polling successivo.

5. Rispetta `prefers-reduced-motion`: se attivo, l'indicatore LIVE
   non lampeggia (resta acceso fisso), il resto del comportamento
   rimane invariato.

Non modificare la struttura delle card già creata nella Fase 1 per
le partite "programmata" e "conclusa": questa fase aggiunge solo il
comportamento per lo stato "live".
```

---

## Note per l'esecuzione

- Esegui le due fasi in sessioni separate con Claude Code, verificando il risultato della Fase 1 nel browser prima di passare alla Fase 2.
- L'URL reale dell'API del tabellone va inserito solo quando è pronto: nel frattempo Claude Code può lavorare con dati di esempio (mock) per costruire e testare tutta la logica della Fase 2 senza dipendere dal server esterno.
- Se il tabellone esterno avrà CORS chiuso (blocco delle richieste da un altro dominio), sarà necessario configurare l'API del tabellone per accettare richieste dal dominio del sito Victor Volley (es. `victor-volley-website.vercel.app`) — da verificare insieme quando l'API è pronta.
