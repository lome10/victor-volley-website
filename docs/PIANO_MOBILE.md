# Piano di miglioramento da mobile

Stato: **solo analisi, nulla è stato implementato** (2026-10-07).

## Come è stata fatta l'analisi (e cosa NON dice)

- Letti a mano CSS, HTML e JS (`css/*.css`, `index.html`, `atleta.html`, `admin.html`, `js/splash.js`, `manifest.webmanifest`).
- Provato a misurare la home dal vivo in una finestra stretta: la finestra non cambia la larghezza reale della pagina (restava 1920 px) e il sito non si lascia incorporare in un iframe, quindi **non ci sono misure da telefono vero**.
- Quindi: ogni voce sotto è un'ipotesi dal codice. Prima di implementare, vedere la pagina su un telefono (o con gli strumenti per sviluppatori di Chrome, F12 → icona telefono) e confermare.
- Già noto: Lighthouse mobile della home 49/100 (misurato in una sessione precedente).

## Cosa c'è già di buono (non rifare)

- `viewport` presente su tutte le pagine; `theme-color`; manifest con icone, `maskable` e scorciatoie (Calendario, News, Area Atleti).
- Area atleti: media query `pointer: coarse` con bersagli da 44 px e campi di login a 16 px (evita lo zoom di iOS); barra di navigazione in basso con `safe-area-inset-bottom`.
- Admin: menu laterale che diventa a scomparsa sotto 900 px; tabelle dentro `.admin-table-wrap` con scorrimento orizzontale (7 su 22 tabelle, vedi sotto); la scheda Spese passa a righe compatte sotto 860 px.
- Font locali con `font-display: swap` e preload dei due principali; `loading="lazy"` già usato in molte pagine.

## Priorità alta

### 1. Home e pagine pubbliche: caricamento lento su rete mobile
- **24 `<script>` nella home, solo uno con `defer`**: gli altri bloccano il disegno della pagina. Stesso schema su calendario (15), news (14), galleria (15). Da fare: `defer` (o carico a richiesta) per gli script non indispensabili al primo schermo; verificare l'ordine di dipendenza (`firebase-config` → `data` → `db` → pagine).
- **Firebase caricato per intero in tutte le pagine pubbliche**: `firebase-firestore-compat.js` pesa 344 KB (più 32 KB di `firebase-app-compat.js`); l'auth (139 KB) c'è solo dove serve. Valutare: caricare Firestore solo dove si leggono dati, oppure passare alla versione modulare (più piccola, ma è un lavoro più grosso).
- **Splash screen di 1,5 s con contatore %** (`js/splash.js`): fa aspettare tutti, anche con il contenuto già pronto, ad ogni nuova sessione. Da decidere con l'utente: tenerla più corta (es. 600 ms), mostrarla solo alla prima visita in assoluto, oppure toglierla da mobile. Pesa direttamente su LCP.
- **Immagini**: nella home 3 `<img>`, nessuna `lazy` (probabile logo/splash, da valutare quali sono sopra la piega). Per le foto della galleria e delle news verificare che i link Cloudinary usino `f_auto,q_auto,w_<larghezza>` e `srcset`: da controllare nel codice che le genera (`js/pages/galleria-1.js`, `index-*.js`).
- **Immagini di sfondo grandi**: `assets/team-bg-2.webp` (219 KB) e icone 512 px (228 KB e 134 KB, queste ultime servono solo all'installazione). Valutare una versione più piccola dello sfondo per schermi stretti (`image-set` o `media`).

### 2. Admin su telefono: tabelle
- ~~22 tabelle, solo 7 con wrapper~~ **CORREZIONE (verificata 2026-10-07):** tutte e 22 le tabelle sono già dentro `.admin-table-wrap` (7) o `.dg-table-wrap` (15), quindi scorrono di lato senza uscire dallo schermo. Resta il dubbio di usabilità: `.admin-table` ha `min-width: 600px`, quindi sul telefono si scorre in orizzontale. Da valutare, tabella per tabella e dopo la prova con F12, se trasformare le più usate (Atleti, Avvisi, Allenamenti) in righe compatte come fatto per le Spese.
- **Nessuna regola `pointer: coarse` in `admin.css`, `dirigenti.css`, `style.css`**: le icone di modifica/elimina e i pulsanti piccoli (`btn-icon`, pillole da 13 px, `dg-btn-sm`) sono probabilmente sotto i 44 px. Da fare: bersagli minimi di 40–44 px su schermi a tocco, soprattutto nelle colonne azioni delle tabelle (modifica e cestino vicini = tocchi sbagliati, con cancellazioni).
- **Campi del modulo a 14 px** (`.form-input` in `admin.css`): su iPhone la pagina si ingrandisce da sola quando si tocca un campo. Portarli a 16 px sotto 900 px (o con `pointer: coarse`).
- **Modali** (`.modal-box` larga 340 px): i moduli lunghi (atleta, spesa, tranche sponsor) vanno provati con la tastiera aperta; verificare scorrimento interno e che il pulsante «Salva» resti raggiungibile.

## Priorità media

### 3. Area atleti
- Mai provata su un telefono vero (già in `session_notes.md`). Da provare in particolare: barra in basso con 5+ voci, scheda Ricevute (scarico del PDF su iOS e Android), scheda Avvisi con gli avvisi fissati, barra dei figli con più atleti.
- `safe-area-inset` è gestito solo per la barra in basso; controllare anche il bordo in alto con la pagina aggiunta alla Home (modalità `standalone`, iPhone con notch).
- `apple-touch-icon` c'è già in `index.html` e `atleta.html`; non risulta invece `apple-mobile-web-app-capable` (barra di stato e schermo intero quando l'app è aggiunta alla Home di iPhone): da valutare provando l'installazione.
- Nessun service worker: l'app non funziona senza rete e non c'è «installa» vero con offline. Non è un difetto, ma va deciso se serve (legato alle notifiche push FCM, che richiedono comunque un service worker).
- Notifiche push (fase C): serve la chiave VAPID dalla Console Firebase; su iPhone solo con il sito aggiunto alla Home (iOS 16.4+).

### 4. Piccoli testi e contrasti
- Molti testi sotto i 12 px nell'admin e nei Dirigenti (conteggio dei `font-size: 10–12px`: atleta.css 19, dirigenti.css 35, admin.css 53). Su telefono sono difficili da leggere: alzare le etichette secondarie a 12–13 px minimo.
- Contrasti segnalati dall'hook di design (grigio `#777` su bianco a 4,48:1, stato hover sul blu scuro) e effetti «alla moda» già presenti (bordi laterali sulle schede, pallini pulsanti, fascia che scorre) in `privacy.html`/`atleta.css`: da trattare in un audit di design a parte.

### 5. Home: elementi decorativi
- `.deco-ball` (`style.css`, righe ~3935 e ~3964) esce dallo schermo di 25 px a destra: la pagina non scorre in orizzontale (`scrollWidth` < larghezza), ma conviene confermare che il contenitore abbia `overflow: hidden` anche su schermi stretti, e nascondere questi elementi su mobile per risparmiare lavoro di disegno.

## Priorità bassa / da decidere con l'utente

- **Admin come app da telefono**: deciso dall'utente, i dirigenti lo useranno da telefono (vedi «Decisioni»). Percorso rapido per le cose da campo (presenze, avvisi, allenamenti) da progettare.
- **Dark mode**: non verificata.
- **Rete lenta e invio dei form** (Web3Forms): mai provati (già nelle note).
- **Immagini OG e anteprime** condivise da WhatsApp: provare l'anteprima del link su telefono.

## Ordine suggerito quando si implementa

1. Verifica su telefono vero (o F12 → telefono) delle pagine chiave: home, calendario, `/atleta` (login e ricevute), admin (Atleti, Spese). Annotare cosa non va con screenshot.
2. `defer` degli script + decisione sulla splash (guadagno maggiore, rischio basso con prove).
3. Bersagli a 44 px e campi a 16 px nell'admin (`pointer: coarse`).
4. Tabelle dell'admin senza wrapper.
5. Immagini (Cloudinary `f_auto,q_auto,w_`), `srcset`, sfondi.
6. Tag per l'app su iPhone e prova dell'installazione.
7. Rimisurare con Lighthouse mobile (home e calendario) prima e dopo ogni passo.

## Fatto: admin da telefono, passo 1 (2026-10-07, CSS soltanto, non provato su schermo)

Blocchi in fondo a `css/admin.css` e `css/dirigenti.css` («ADMIN DA TELEFONO»), validi sotto 900 px o con schermo a tocco:
- campi a 16 px e alti almeno 44 px (niente zoom di iOS); `textarea` senza altezza minima;
- pulsanti `btn-primary/ghost/danger` e `dg-btn-*` da 44 px; icone modifica/cestino da 40 px con 10 px di distanza; voci del menu laterale e interruttore del menu da 44 px; celle delle tabelle meno larghe;
- barra in alto che cresce se i pulsanti vanno a capo, titolo che si accorcia con «…»;
- schede dell'atleta su una riga che scorre di lato (niente a capo), da 44 px;
- finestre di conferma/moduli mai più alte dello schermo (`dvh`), scorrevoli; pannello laterale del Budget con `100dvh` e margine per il bordo del telefono;
- pulsanti di fondo modulo (`.form-actions`) fissati in basso, con margine `safe-area`.

**Da provare con F12**: Atleti (elenco, scheda e tab), Avvisi (nuovo avviso con tastiera), Allenamenti, Presenze, Ricevute, Budget (Spese e pannello). Possibili effetti collaterali da guardare: barra in basso dei moduli che copre un campo, titolo troncato, tab che nascondono «Accessi/Sicurezza» a destra (si scorre).

**Ancora da fare per l'admin**: righe compatte al posto delle tabelle più usate; percorso rapido per presenze/avvisi/allenamenti; testi sotto 12 px; controllo di ogni sezione dopo la prova.

## Decisioni dell'utente (2026-10-07)

- **Verifica con F12 di Chrome** (modalità telefono), non serve un telefono vero.
- **I dirigenti useranno l'admin da telefono**: tutto il punto «Admin su telefono» (tabelle, bersagli a 44 px, campi a 16 px, modali con tastiera) passa a **priorità alta, anzi prima della home pubblica**. Aggiungere un percorso rapido per le azioni da campo (presenze, avvisi, allenamenti) e provare le schede più usate: Atleti (elenco e scheda con le sue tab), Avvisi, Presenze, Ricevute, Spese e Rette nel Budget.
- **Splash**: l'utente non sa cos'è (è la schermata iniziale col logo e il contatore 0–100 % che appare per circa 2 secondi alla prima apertura del sito in una sessione). Da spiegargli e decidere dopo che l'ha vista.

## Cosa serve dall'utente

- Aprire le pagine con F12 → icona telefono e dire/mostrare cosa non va (o far fare a me lo screenshot da quella vista).
- Decisione sulla splash (tenere, accorciare, togliere da mobile), dopo averla vista.
- Chiave VAPID di Firebase, solo se si vogliono le notifiche push.
