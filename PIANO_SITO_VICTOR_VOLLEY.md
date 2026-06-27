# Piano di sviluppo — Sito web Victor Volley

Brief completo da eseguire con Claude Code. Sito vetrina statico (HTML/CSS/JS), multi-pagina, nessun database richiesto in questa prima fase.

---

## 1. Informazioni società

- **Nome società**: Victor Volley
- **Città**: Melissano (LE)
- **Anno di fondazione**: 2019 (presente nello scudetto del logo)
- **Palazzetto di riferimento**: ARKÈ Melissano — ⚠️ **PLACEHOLDER: indirizzo da verificare e confermare**, non è stato possibile trovare una fonte affidabile online. Inserire nel sito come testo facilmente modificabile (variabile/costante separata) finché non viene confermato.
- **Categorie/squadre attive**:
  1. Prima Divisione
  2. Under 19
  3. Under 13
  4. Under 12
  5. Minivolley

## 2. Identità visiva

- **Logo**: fornito (file `assets/logo.png`, sfondo trasparente, 800x800px) — cerchio diviso a metà, magenta in alto con scritta "VICTOR" ad arco, azzurro in basso con scritta "VOLLEY" ad arco, pallone da volley al centro stilizzato con una "V" che richiama anche la rete, scudetto tricolore con "2019" alla base.
- **Palette colori** (estratta direttamente dal logo):
  - Magenta primario: `#CB2168`
  - Azzurro primario: `#008CFD`
  - Blu navy (testo, bordi, contrasti): `#053063`
  - Bianco: `#FFFFFF` (sfondi, spazi negativi)
  - Suggerito come neutro di supporto: grigio chiaro `#F4F4F6` per sfondi sezione alternati
- **Font**: vedi sezione 2.bis "Design system" per le scelte tipografiche dettagliate
- **Tono**: dinamico, semplice, "di paese" ma professionale — niente fronzoli da grande club, deve sembrare affidabile e curato senza essere sovraccarico.

## 2.bis Design system (linee guida UI dettagliate)

Questa sezione è il riferimento vincolante per ogni pagina: se un punto successivo del piano non specifica diversamente, si applicano sempre queste regole.

### Personalità visiva
Pulita ed equilibrata: moderna e professionale, non urlata. Niente titoli enormi stile "da stadio", niente effetti vistosi. L'obiettivo è un sito che sembri curato e affidabile, con i colori sociali usati con cura e non a tappeto.

### Colori — ruoli precisi (non solo palette)
- `#053063` (navy) → colore di **sfondo dell'header e del footer**, colore principale dei testi su sfondo chiaro, colore dei bordi/contorni sottili
- `#008CFD` (azzurro) → colore primario per **bottoni principali, link, stati attivi/hover, accenti**
- `#CB2168` (magenta) → colore secondario, usato con parsimonia per **badge, evidenziazioni, dettagli decorativi** (es. puntini, sottolineature, tag "Nuovo"/"In casa"). Non usarlo come colore di sfondo di intere sezioni grandi: rischia di diventare pesante. Bene su piccoli elementi.
- `#FFFFFF` → sfondo principale delle pagine
- `#F4F4F6` (grigio chiaro) → sfondo delle sezioni alternate, per creare respiro tra una sezione e l'altra senza usare colori sociali ovunque
- Testo body su sfondo bianco: usare un grigio scuro quasi-nero (es. `#1A1A1E`), non il navy puro (il navy puro è riservato a header/footer/titoli)
- Regola di equilibrio: in una stessa schermata, il colore navy domina come ancoraggio (header/footer/titoli), l'azzurro guida l'azione (bottoni/link), il magenta è il "pizzico di sapore" (accenti puntuali). Evitare che magenta e azzurro compaiano entrambi a piena intensità nello stesso elemento, per non creare un effetto bandiera.

### Tipografia
- **Font titoli**: una sans-serif con un minimo di carattere "sportivo" ma ancora leggibile e professionale — scelta consigliata: **Barlow** (non Condensed, per restare "pulito ed equilibrato" e non aggressivo) nei pesi 600/700. In alternativa **Poppins** 600/700 se Barlow non è disponibile.
- **Font testo body**: sans-serif neutra e molto leggibile — scelta consigliata: **Inter**, pesi 400/500.
- **Scala dimensioni** (desktop):
  - H1 (titolo di pagina/hero): 48px, peso 700, line-height 1.1
  - H2 (titolo di sezione): 32px, peso 600, line-height 1.2
  - H3 (titolo di card/sottosezione): 20px, peso 600
  - Body: 16px, peso 400, line-height 1.6
  - Testo piccolo/meta (date, etichette): 13px, peso 500, lettere leggermente spaziate (letter-spacing 0.02em), spesso in maiuscolo per le etichette di categoria
- **Scala dimensioni** (mobile): H1 32px, H2 24px, H3 18px, body resta 16px (non scendere sotto 16px sul body per leggibilità mobile)
- Tutti i titoli in **sentence case** (non tutto maiuscolo, eccetto piccole etichette/badge dove le maiuscole sono accettabili per distinguerle dal resto)

### Forme e bordi
- **Card** (news, giocatori, sponsor, partite): angoli arrotondati, `border-radius: 12px`. Ombra leggera e naturale (`box-shadow: 0 2px 8px rgba(5, 48, 99, 0.08)`), nessun bordo visibile salvo un sottile contorno chiaro se la card è su sfondo bianco
- **Bottoni**: angoli squadrati o quasi (`border-radius: 2-4px` massimo, non pillola), per dare un contrasto intenzionale con le card morbide. Stile bottone primario: sfondo azzurro `#008CFD`, testo bianco, padding generoso (`12px 28px`), nessuna ombra; hover: leggero scurimento (es. `#0070D6`) con transizione fluida (`transition: background-color 0.2s ease`). Bottone secondario/outline: bordo navy 2px, testo navy, sfondo trasparente; hover: sfondo navy molto leggero
- **Immagini**: angoli leggermente arrotondati quando dentro le card (eredita il border-radius della card), squadrate quando a piena larghezza (hero, banner)
- **Badge/etichette di categoria** (es. "Under 13", "In casa", "Trasferta"): pillola arrotondata (`border-radius: 999px`), sfondo magenta o azzurro chiaro tenue con testo del colore corrispondente più scuro, padding piccolo (`4px 12px`), testo 12-13px maiuscolo

### Header
- Sfondo navy pieno (`#053063`), testo bianco
- Altezza: 72px desktop, 60px mobile
- Logo a sinistra (su sfondo navy, va bene la versione standard del logo già fornita, eventualmente con un piccolo padding per respirare)
- Voci di menu: testo bianco 15px peso 500; voce attiva/pagina corrente con piccola sottolineatura o pallino azzurro sotto al testo; hover delle voci: colore azzurro chiaro, transizione fluida
- Su mobile: hamburger menu bianco che apre un pannello a tendina (non a tutto schermo, scorre dall'alto) con sfondo navy e voci impilate verticalmente, ben distanziate per il tap

### Footer
- Sfondo navy pieno, stesso colore dell'header (continuità visiva header/footer)
- Testo bianco/grigio chiaro per i contenuti secondari, link in azzurro chiaro
- Organizzato in colonne su desktop (logo+social a sinistra, link rapidi al centro, contatti a destra), impilato in verticale su mobile

### Spaziatura
- Spaziatura verticale tra sezioni della pagina: 80px desktop, 48px mobile
- Padding interno standard delle card: 24px
- Container massimo contenuto: 1200px, centrato, con padding laterale di 24px su schermi più piccoli del container

### Bottoni e link — stati interattivi
- Ogni elemento cliccabile deve avere uno stato hover visibile e una transizione fluida (`0.2s ease`), mai cambi di colore istantanei
- I link di testo nel corpo della pagina: colore azzurro, sottolineatura solo on-hover (non sempre visibile, per restare puliti)
- Le card cliccabili (es. card news, card giocatore): leggero effetto di elevazione al passaggio del mouse (`transform: translateY(-4px)` + ombra che si accentua leggermente), desktop solo (su mobile/touch questo effetto si omette, non serve)

### Comportamento responsive specifico per sezione
- **Slider/griglie di card orizzontali** (es. "Ultime news", "Le nostre squadre" in home): su desktop griglia a 3-4 colonne; su mobile diventano scroll orizzontale con leggero "spazio" visibile della card successiva (per segnalare che si può scorrere), non si impilano verticalmente per non allungare troppo la pagina
- **Tabelle** (es. calendario/risultati): su mobile non si comprime la tabella, si trasforma in lista di card verticali, una per partita, con le stesse informazioni disposte in verticale
- **Galleria foto**: griglia a mattonelle (masonry o grid uniforme) su desktop, 2 colonne su mobile

### Microinterazioni e transizioni
- Fade-in leggero degli elementi quando entrano nella viewport durante lo scroll (solo per le sezioni principali della home, non esagerare — un fade + leggero movimento verso l'alto di 12px, durata 0.4s, è sufficiente)
- Transizione tra pagine: nessun effetto particolare richiesto, va bene la navigazione standard del browser (mantenere il sito semplice e veloce è più importante di una transizione elaborata)
- Lo splash screen (vedi sezione 3.1) è l'unica animazione "importante" del sito: il resto deve restare sobrio per non competere con essa

## 2.ter Animazioni signature (elementi che danno carattere al sito)

Oltre alle microinterazioni base già descritte in 2.bis, il sito include 5 animazioni distintive, pensate per dare personalità senza tradire il tono "pulito ed equilibrato". Vanno usate con misura: sono accenti, non un effetto-show. Ognuna ha un compito preciso e un posto preciso — non vanno ripetute ovunque.

### 1. Hero con parallax leggero (home page)
- Nella sezione hero della home, l'immagine di sfondo si muove a una velocità diversa (più lenta) rispetto al testo/contenuto sovrapposto durante lo scroll, creando un leggero effetto di profondità
- Implementazione: `transform: translateY()` sull'immagine di sfondo agganciato all'evento scroll, con un fattore di circa 0.3-0.4 (l'immagine si muove al 30-40% della velocità di scroll della pagina)
- Range di movimento limitato (max 60-80px di spostamento totale), per evitare che l'immagine "stacchi" dal contenitore o mostri bordi vuoti
- Su mobile: disattivare l'effetto (gli scroll su touch sono meno fluidi e il parallax tende a "scattare"); l'immagine resta fissa, statica
- Performance: usare `will-change: transform` e aggiornare la posizione con `requestAnimationFrame`, non direttamente nell'evento scroll, per evitare scatti

### 2. Contatori numerici animati (sezione statistiche)
- Nuova mini-sezione da aggiungere in home, subito dopo l'hero o dopo "Le nostre squadre": una fascia con 3-4 numeri chiave della società, ad esempio:
  - Anno di fondazione → "Dal 2019"
  - Numero di squadre/categorie → "5 categorie"
  - Numero di atleti (placeholder, es. "150+ atleti")
  - Eventuale altro dato a piacere (es. "1 palazzetto", "X stagioni")
- Ogni numero parte da 0 e "sale" rapidamente fino al valore finale quando la sezione entra nella viewport (usare Intersection Observer per attivare l'animazione solo alla prima visualizzazione, non ripeterla ad ogni scroll)
- Durata della conta: 1.2-1.5 secondi, easing `ease-out` (parte veloce, frena alla fine)
- Stile: numero grande in font titoli (Barlow, peso 700, 40-48px), colore navy o azzurro, con etichetta piccola sotto (13px, maiuscolo, grigio)
- Layout: 3-4 colonne affiancate su desktop, 2 colonne su mobile (grid 2x2 se sono 4 numeri)

### 3. Pallone decorativo animato (elemento ambientale)
- Un'icona/illustrazione semplice e stilizzata di un pallone da volley (coerente con lo stile del logo, nei colori sociali — non un'emoji, un disegno vettoriale leggero in SVG), usata come elemento decorativo di sfondo in 1-2 punti del sito dove c'è spazio vuoto (es. accanto al titolo della sezione hero, o come elemento fluttuante nella sezione "Vieni a giocare con noi")
- Animazione: rotazione lenta e continua (`transform: rotate(360deg)`, durata 20-30 secondi, lineare, loop infinito) oppure leggero movimento verticale tipo "fluttuazione" (`translateY` oscillante di pochi pixel, durata 3-4 secondi, easing `ease-in-out`, loop infinito) — scegliere una sola delle due per elemento, non sommarle
- Dimensione contenuta (80-140px), opacità ridotta se sovrapposto a testo (es. 15-25% di opacità) per restare decorativo e non competere con i contenuti
- Va usato con parsimonia: massimo 2 occorrenze nell'intero sito, per non diventare un cliché ripetuto

### 4. Countdown prossima partita (home + pagina calendario)
- Nella card "prossima partita in casa" (sia in home che, se utile, in testa alla pagina Calendario), un piccolo countdown live che mostra il tempo rimanente alla partita: giorni, ore, minuti (es. "3 giorni 14 ore 22 min")
- Aggiornamento: ogni minuto è sufficiente (non serve aggiornare al secondo, appesantirebbe inutilmente senza beneficio reale per l'utente)
- Calcolo basato sulla data/ora della partita nei dati JSON placeholder (`data/partite.json`); se non ci sono partite future nei dati, la card mostra un messaggio neutro tipo "Prossime partite in aggiornamento" invece del countdown
- Stile: numeri in font titoli, taglio leggermente più contenuto della sezione statistiche (28-32px), con etichette piccole (GG / ORE / MIN) sotto ciascun numero, separati da un divisore sottile o leggero spazio
- Colore di accento: azzurro per i numeri, per restare nel ruolo "azione/elemento attivo" assegnato a questo colore nel design system

### 5. Effetto reveal a cascata sulle card (stagger animation)
- Si applica a tutte le griglie/liste di card della home e delle pagine interne: ultime news, le nostre squadre, sponsor, galleria, roster giocatori
- Quando la griglia entra nella viewport, le card non appaiono tutte insieme: ognuna fa un fade-in + leggero movimento verso l'alto (`opacity 0→1`, `translateY(16px)→0`), con un ritardo crescente tra una card e la successiva (`stagger delay` di 80-100ms)
- Durata della singola animazione: 0.4-0.5 secondi, easing `ease-out`
- Attivazione tramite Intersection Observer, una sola volta per elemento (non si ripete se l'utente scrolla su e giù più volte sulla stessa sezione)
- Limite pratico: se una griglia ha più di 8-10 card visibili contemporaneamente, applicare il ritardo crescente solo alle prime 8-10 e far apparire le altre con delay fisso massimo, per non rendere l'attesa eccessiva

### Nota tecnica generale sulle animazioni
- Tutte le animazioni vanno implementate in modo che rispettino la preferenza di sistema "riduci animazioni" dell'utente (media query `prefers-reduced-motion: reduce`): se attiva, disabilitare parallax, countdown con effetti, rotazione del pallone, e ridurre il reveal a un semplice fade senza movimento
- Nessuna animazione deve bloccare l'interazione dell'utente o ritardare la leggibilità dei contenuti: sono tutte rifiniture, il contenuto deve essere sempre accessibile anche con JavaScript disabilitato (gli elementi devono essere visibili di default, le animazioni aggiungono solo l'effetto di apparizione)

## 3. Riferimento di stile/struttura

Riferimento ispirativo: **sirsafetyperugia.it** (squadra di Serie A1), ma **semplificato** per una realtà dilettantistica — niente biglietteria, niente shop, niente app.

### 3.1 Splash screen di apertura (richiesta specifica, priorità alta)
Una schermata a schermo intero che appare per primissima al caricamento del sito:
- Sfondo blu navy pieno (`#053063`) a tutto schermo, coerente con header/footer
- Logo Victor Volley centrato (versione su sfondo navy, va bene il logo standard fornito, circa 160-200px di diametro su desktop, 120px su mobile)
- Sotto il logo, con uno spazio di 24px, opzionale il nome "VICTOR VOLLEY" in testo bianco, font titoli (Barlow/Poppins), peso 600, lettere leggermente spaziate, maiuscolo — solo se non risulta ridondante col logo che già contiene il testo
- Sotto al logo (o al testo, se presente), con uno spazio di 32px: una barra di progresso orizzontale sottile (altezza 4px, larghezza 200px circa, bordi arrotondati `border-radius: 999px`), sfondo della barra bianco trasparente al 15% (`rgba(255,255,255,0.15)`), riempimento della barra che va da sinistra a destra in un gradiente lineare da azzurro `#008CFD` a magenta `#CB2168`
- Animazione della barra: da 0 a 100% in circa 1.2–1.8 secondi, easing fluido (`ease-out`), non lineare meccanico
- Al completamento della barra: dissolvenza (fade-out, durata 0.4s) dell'intero splash screen che rivela la home sottostante
- Deve apparire una sola volta per sessione (usare `sessionStorage`, non mostrarlo di nuovo se l'utente naviga tra pagine interne nella stessa sessione)
- Deve essere leggero e non bloccare la pagina per utenti con connessioni lente (max 2 secondi di attesa, poi mostra comunque il contenuto)

### 3.2 Header (presente su tutte le pagine)

Riferimento di ispirazione: **trentinovolley.it** — struttura a due livelli (topbar superiore sottile + header principale con logo e menu), con mega-menu a colonne sotto le voci principali e icone social sempre visibili.

**Topbar superiore** (striscia sottile sopra l'header principale, sfondo navy più scuro o con una linea di separazione, altezza 36-40px):
- A sinistra o al centro: riga di **icone social cliccabili** (Facebook, Instagram, eventuale YouTube/TikTok — solo quelle realmente attive della società, placeholder con link `#` per ora), icone semplici in bianco/azzurro chiaro, dimensione 18-20px, spaziate 12px l'una dall'altra, con effetto hover (leggero cambio colore o piccolo scale-up)
- A destra (facoltativo, solo se utile): un piccolo link veloce, es. "Vieni a giocare con noi" come call-to-action sempre visibile anche scrollando

**Header principale** (sotto la topbar, sfondo navy pieno `#053063`, altezza 72px desktop / 60px mobile):
- Logo a sinistra (cliccabile, porta alla home)
- Menu di navigazione orizzontale a destra, voci principali:
  - Home
  - La Squadra (mega-menu, vedi sotto)
  - Stagione (mega-menu, vedi sotto)
  - News
  - Galleria
  - Sponsor
  - Vieni a giocare con noi
  - Contatti

**Mega-menu a colonne** (al passaggio del mouse/click su "La Squadra" e "Stagione", si apre un pannello sotto la voce di menu, largo, con sfondo bianco e ombra leggera, NON un semplice elenco verticale stretto):
- *La Squadra* → colonne con: Prima Divisione (Roster, Staff), Under 19 (Roster, Staff), Under 13 (Roster, Staff), Under 12 (Roster, Staff), Minivolley (Roster, Staff) — ogni categoria è una colonna o un blocco con titolo e 2 sotto-link
- *Stagione* → colonne con: Calendario, Risultati, Classifiche (se disponibili per le categorie agonistiche), Palazzetto ARKÈ (info e mappa)
- Il mega-menu si chiude cliccando fuori o spostando il mouse via; su mobile questi diventano semplici accordion a comparsa (si espandono in verticale sotto la voce, non un mega-menu — su schermi piccoli non c'è spazio per le colonne)
- Stile del mega-menu: sfondo bianco, testo navy, titoli di colonna in grassetto con un piccolo accento azzurro o una sottile linea sotto, voci di link con hover azzurro chiaro

**Mobile**: hamburger menu bianco che apre un pannello a tendina dall'alto, sfondo navy, voci impilate verticalmente; le voci con sottomenu (La Squadra, Stagione) si espandono inline con un accordion (tap per aprire/chiudere), senza affollare lo schermo

### 3.3 Home page
Sezioni in ordine dall'alto verso il basso:
1. **Hero**: immagine/foto di squadra a tutta larghezza (placeholder per ora) con overlay del nome società e una breve frase di benvenuto/claim (es. "Victor Volley — la pallavolo a Melissano"), bottone call-to-action verso "Vieni a giocare con noi" o "Scopri le squadre". Effetto parallax leggero sull'immagine di sfondo (vedi 2.ter, punto 1)
2. **Carousel fotografico in evidenza**: riferimento di ispirazione: il carousel di news in evidenza di trentinovolley.it, ma applicato a un set di foto invece che a articoli testuali. Slider a tutta larghezza con 3-5 foto (placeholder per ora: partite, allenamenti, eventi di squadra), avanzamento automatico ogni 4-5 secondi più freccie prev/next e indicatori a pallini cliccabili sotto; ogni foto può avere una piccola didascalia overlay in basso (es. "Under 13 — allenamento di aprile"). Pensato per essere gestito facilmente in autonomia dalla società: basta aggiungere nuove immagini a una cartella/lista per aggiornarlo, senza dover toccare il codice della pagina
3. **Statistiche società**: fascia con 3-4 numeri chiave animati con effetto "conta fino a" (vedi 2.ter, punto 2) — es. anno di fondazione, numero categorie, numero atleti
4. **Prossime partite**: card con le prossime 2-4 partite in calendario (data, ora, categoria, squadra avversaria, casa/fuori, palazzetto) — la card della prossima partita in casa include il countdown live (vedi 2.ter, punto 4). Anche solo placeholder per iniziare
5. **Ultime news**: griglia o slider di 3 card news (titolo, immagine, data, estratto breve, link "leggi di più"), con effetto reveal a cascata (vedi 2.ter, punto 5)
6. **Le nostre squadre**: presentazione rapida delle 5 categorie con foto/icona e link alla pagina squadra dedicata, con effetto reveal a cascata
7. **Galleria**: anteprima di alcune foto (4-6 immagini) con link "vedi tutta la galleria"
8. **Sponsor**: striscia/griglia di loghi sponsor (placeholder per ora)
9. **Vieni a giocare con noi**: sezione/banner che invita a unirsi, con link al form — può ospitare il pallone decorativo animato (vedi 2.ter, punto 3)
10. **Footer**: vedi punto 3.8

### 3.4 Pagina "La Squadra" / pagine categoria
Per ciascuna delle 5 categorie (Prima Divisione, Under 19, Under 13, Under 12, Minivolley):
- Nome categoria e breve descrizione (es. giorni/orari di allenamento — placeholder)
- Roster giocatori: griglia di card con foto placeholder, nome, ruolo, numero di maglia (struttura pronta, contenuti placeholder)
- Staff tecnico della categoria (allenatore, eventuale assistente) — placeholder
- Possibilità di avere una pagina singola "Squadre" con tutte le categorie elencate in tab/accordion, oppure 5 pagine separate — **decisione tecnica da prendere in fase di sviluppo in base a quanto contenuto reale ci sarà**; iniziare con struttura semplice (una pagina, sezioni ancorate) ed espandere se necessario

### 3.5 Pagina "Calendario e Risultati"
- Lista/tabella delle partite per categoria, con filtro per categoria (Prima Divisione, Under 19, ecc.)
- Per ogni partita: data, ora, categoria, squadra Victor Volley vs avversario, luogo (casa/fuori, nome palazzetto), risultato se già giocata
- Contenuti placeholder per ora, struttura dati semplice (es. array JS o file JSON separato così è facile aggiornarlo manualmente in futuro)

### 3.6 Pagina "News"
- Lista cronologica di articoli/comunicati (card con immagine, titolo, data, estratto)
- Pagina di dettaglio singolo articolo
- Contenuti placeholder (3-5 articoli di esempio)

### 3.7 Form "Vieni a giocare con noi"
**Importante**: NON è un modulo di tesseramento ufficiale. È un semplice form di contatto/manifestazione di interesse per chi vuole iniziare a giocare nella società.
Campi del form:
- Nome e cognome
- Email
- Telefono
- Età (o data di nascita, per indirizzare alla categoria giusta)
- Categoria di interesse (select: Prima Divisione, Under 19, Under 13, Under 12, Minivolley, Non so/altro)
- Messaggio libero (opzionale)
- Bottone invio
Funzionamento: per questa prima versione, il form può:
- Aprire un client email precompilato (`mailto:`) con i dati, oppure
- Essere collegato in un secondo momento a un servizio di invio email (es. Formspree, EmailJS) — lasciare un commento nel codice che indica dove collegare il servizio in futuro
Non richiede database né backend per questa fase.

### 3.8 Footer (presente su tutte le pagine)
- Sfondo navy pieno, organizzato in colonne su desktop:
  - Colonna 1: logo Victor Volley (versione semplice/monocolore o standard) + riga di icone social cliccabili, stesso stile della topbar (coerenza visiva tra l'alto e il basso della pagina)
  - Colonna 2: link rapidi (Home, La Squadra, Calendario, News, Contatti)
  - Colonna 3: informazioni di contatto — indirizzo palazzetto ARKÈ (placeholder ⚠️ da confermare), email, telefono (placeholder)
- Su mobile: colonne impilate in verticale, icone social centrate
- Riga finale sottile (separata da una linea divisoria sottile chiara/trasparente): copyright con anno corrente, eventuale P.IVA/dati societari se disponibili (placeholder), link a privacy policy

### 3.9 Pagina "Sponsor"
- Griglia di loghi sponsor con eventuale link al sito dello sponsor (placeholder)
- Breve testo che invita aziende locali a diventare sponsor, con contatto

### 3.10 Pagina "Galleria"
- Griglia fotografica (placeholder), eventualmente organizzata per evento/partita
- Lightbox per visualizzare le foto a schermo intero al click

### 3.11 Pagina "Contatti"
- Indirizzo palazzetto (placeholder ⚠️)
- Email e telefono società (placeholder)
- Mappa (embed Google Maps, anche se con indirizzo placeholder per ora)
- Eventuale piccolo form di contatto generico (può essere lo stesso form del punto 3.7 oppure uno più generico)

## 4. Specifiche tecniche

- **Stack consigliato**: HTML statico + CSS + JavaScript vanilla (nessun framework necessario per un sito vetrina di queste dimensioni); se si preferisce comunque un framework leggero, va bene anche un setup minimale (es. Astro o Vite + vanilla JS), ma non è necessario
- **Responsive**: mobile-first, deve funzionare bene su smartphone (la maggior parte dei visitatori di una società dilettantistica naviga da mobile)
- **Performance**: immagini placeholder leggere, lazy loading per le immagini sotto la prima schermata
- **Accessibilità**: contrasto colori adeguato (verificare che testo bianco su magenta/azzurro sia leggibile), alt text su tutte le immagini, navigazione da tastiera funzionante
- **Struttura file consigliata**:
  ```
  /
  ├── index.html
  ├── squadre.html (o pagine separate per categoria)
  ├── calendario.html
  ├── news.html
  ├── news-dettaglio.html (template)
  ├── galleria.html
  ├── sponsor.html
  ├── unisciti-a-noi.html
  ├── contatti.html
  ├── css/
  │   └── style.css
  ├── js/
  │   ├── main.js
  │   └── splash.js
  ├── data/
  │   ├── partite.json (placeholder)
  │   ├── news.json (placeholder)
  │   ├── giocatori.json (placeholder)
  │   └── carousel-home.json (placeholder — lista foto in evidenza per il carousel della home: percorso immagine, didascalia, eventuale link)
  └── assets/
      ├── logo.png (fornito, sfondo trasparente)
      ├── img/ (cartella per foto placeholder)
      └── sponsor/ (cartella per loghi sponsor placeholder)
  ```
- **Contenuti placeholder**: usare testo segnaposto chiaramente riconoscibile (es. "Nome Giocatore", "Lorem ipsum...", date fittizie ma plausibili) così la società può sostituirlo facilmente in un secondo momento. Per le immagini, usare placeholder a tinta unita con icona pallone da volley o silhouette, nei colori sociali, evitando servizi placeholder esterni che richiedono connessione internet continua.

## 5. Priorità di sviluppo (ordine consigliato)

1. Setup struttura cartelle + CSS base con palette colori e font
2. Splash screen di caricamento (componente isolato, testabile da solo)
3. Header + footer condivisi (componenti riutilizzabili su tutte le pagine)
4. Home page completa (struttura e contenuti, senza animazioni avanzate per ora)
5. Pagina Squadre/categorie
6. Pagina Calendario e Risultati
7. Pagina News (lista + dettaglio)
8. Form "Vieni a giocare con noi"
9. Pagina Galleria
10. Pagina Sponsor
11. Pagina Contatti
12. Animazioni signature (vedi sezione 2.ter): parallax hero, contatori statistiche, pallone decorativo, countdown partita, reveal a cascata — da implementare dopo che tutte le pagine hanno contenuto e struttura definitiva, per evitare di animare elementi che cambiano ancora
13. Rifinitura responsive e test su mobile
14. Verifica accessibilità e performance (incluso test con `prefers-reduced-motion` attivo)

## 6. Cose da NON fare

- Non copiare codice, asset grafici o testi da sirsafetyperugia.it o da altri siti — usarlo solo come riferimento di struttura/skeleton, non di contenuto o codice
- Non inventare dati reali (indirizzi, numeri di telefono, nomi di persone reali) — usare sempre placeholder chiaramente marcati
- Non implementare il tesseramento come processo ufficiale/legale (pagamenti, documenti) — è solo un form di primo contatto

## 7. Dati ancora da raccogliere dal cliente (placeholder attuali da sostituire)

- [ ] Indirizzo esatto e conferma del nome del palazzetto (ARKÈ Melissano)
- [ ] Email e telefono reali della società
- [ ] Foto reali di squadra, palazzetto, giocatori
- [ ] Loghi sponsor reali (se presenti)
- [ ] Nominativi reali di giocatori/staff (se si vuole popolare i roster)
- [ ] Account social reali (Facebook/Instagram)
- [ ] Eventuali dati societari (P.IVA, ragione sociale completa) se da pubblicare in footer/privacy
