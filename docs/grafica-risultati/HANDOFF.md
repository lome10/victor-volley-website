# Passaggio di consegne — storia 9:16 «risultato set» (2026-10-21)

Per riprendere il lavoro su un altro PC dopo `git pull`. Leggi questo file, poi `docs/brandbook/BRANDBOOK.md` e `docs/grafica-next-match/HANDOFF.md` (stessa famiglia di grafiche).

## Cosa è

Storia Instagram **1080×1920 (9:16)** con il risultato di una partita: foto a tutta altezza che sfuma nel navy, box magenta con punteggio set grande a sinistra e a destra e i parziali dei 5 set al centro (cerchio sul parziale vinto, `--` sui set non giocati). Riferimento: la grafica di Iowa Volleyball che l'utente ha mandato. Partita di prova inventata: Victor 3 – 1 FlyArmida (25-19, 22-25, 25-17, 25-21).

## Dove vive cosa

| Cosa | Dove | Sull'altro PC |
|---|---|---|
| La tavola (si ritoccano i punteggi qui) | Claude Design, link privato: https://claude.ai/artifact/DfvU4iLegNg978qTjNEHpz, tavola **«Storia 9:16 - risultato set»**, in fondo al canvas (x 0, y 6940) | si apre dal browser con lo stesso account claude.ai: **non serve nessun progetto né Claude Code per cambiare i punteggi** |
| Copia di sicurezza della tavola | `docs/grafica-risultati/artifact/StoriaRisultato.dc.html` | arriva con `git pull` |
| Foto corretta (JPEG 1620×2430, da `IMG_0113 (2).CR2`) | `docs/grafica-risultati/materiali/foto-0113-corretta.jpg` | arriva con `git pull` |
| Logo Fly a colori | `docs/grafica-risultati/materiali/flyarmida-colori.png` | arriva con `git pull` |
| **Tutti i loghi sponsor e squadre** (Puglia in Food bianco/scuro/verde, Vita, Unipol, Trisolino, Gesco, Magiflex, Fly colori/bianco, stemma) | `docs/grafica-risultati/loghi/` con la scheda `LOGHI.md` (quale file su quale fondo) | arriva con `git pull` |
| **Regole di pulizia e color correction** | `docs/grafica-risultati/COLOR-CORRECTION.md` (procedura, valori, controlli) | arriva con `git pull` |
| Script (RAW → JPEG, color correction) | `docs/grafica-risultati/script/` | arriva con `git pull`; servono Node e `npm install sharp` **in una cartella a parte** |
| Prova HTML locale (prima versione, superata dalla tavola) | `docs/grafica-risultati/storia-risultato.html` (+ `impact.ttf`) | arriva con `git pull`; non è la versione attuale |
| **Foto RAW originale** `IMG_0113 (2).CR2` | `C:\Users\loren\Downloads\` del PC attuale | **da copiare a mano** (30 MB, non sta su Git) |
| Memoria di Claude Code (preferenze) | `docs/grafica-risultati/memoria-claude/` | copiala in `C:\Users\<utente>\.claude\projects\<percorso-progetto-con-trattini>\memory\` (vedi `docs/grafica-next-match/HANDOFF.md`) |
| La conversazione | resta sul PC attuale | non si trasferisce: questo file la sostituisce |

## Stato delle tavole

Nel canvas ci sono **due tavole gemelle** (stesso box, stessa foto, stessi dati; copie in `artifact/StoriaRisultato.dc.html` e `artifact/StoriaRisultato2.dc.html`, più `artifact/canvas.json` con le posizioni):

- **«Storia 9:16 - risultato set»** (`StoriaRisultato`, x 0, y 6940): header in alto (top 80 px) con logo FlyArmida a colori su riquadro bianco arrotondato + stemma Victor a sinistra e Puglia in Food (330 px, versione verde) a destra.
- **«Storia 9:16 - risultato set, loghi sopra il box»** (`StoriaRisultato2`, x 1160, y 6940): Puglia in Food **al centro in alto** (300 px, top 30 px, versione verde); Fly + stemma Victor affiancati **sopra il box** (top 905 px, centrati). L'utente ha detto che questa «può piacergli»: è la candidata.

Comune a entrambe:
- Foto di fondo `foto-0113-corretta.jpg`, `object-position: 50% 0%`, in un blocco alto 1365 px con maschera che sfuma a trasparente da metà in giù; sopra, un velo navy leggero (0.45 in alto, 0.15 a un terzo, 0.3 in basso). Sotto il blocco il fondo è un gradiente navy `#002B56 → #00152B`.
- Box punteggio: left 80, top 1090, 920×520, **magenta pieno `#CA2367`** (l'utente ha voluto togliere l'ombreggiatura scura) con riflesso bianco in diagonale e ombra sotto il box; «UNDER 19» in alto dentro il box (34 px, peso normale); colonna centrale dei set abbassata di 16 px; **linee verticali tratteggiate di 2,5 px, bianche al 95%** (prima erano quasi invisibili); numeri grandi in Anton (stand-in web di Impact).
- «WE ARE FUTURE» a top 1640; fascia sponsor a top 1700: Vita, Unipol (250 px di larghezza, il file ha molto margine trasparente), Trisolino (max 90 px). Nessun nome squadra sotto i punteggi.

## Decisioni dell'utente da rispettare

- **Foto e pulizia sono compito di Claude Code** (anche sull'altro PC, dove l'utente avrà Claude Code): conversione dal RAW, rotazione, pulizia e color correction le fa Claude seguendo `COLOR-CORRECTION.md` (vedi anche `memoria-claude/feedback_foto_pulizia_color.md`).
- **Puglia in Food è il main sponsor: sempre presente e leggibile.** Esiste in bianco (`puglia-scuro-t.png` con `filter: brightness(0) invert(1)`, per fondi scuri) e **in verde** (`puglia-verde-t.png`, per fondi/foto chiari): scegliere quella che si legge meglio sulla foto di turno. Ora è verde perché la foto ha il muro chiaro.
- La categoria («Under 19») sta nel box del punteggio, non in alto: la zona alta sotto l'header è riservata alla live.
- Velo sulla foto leggero; box punteggio **magenta pieno** (provato blu e magenta ombrato, scartati); niente nomi squadra sotto i punteggi; niente soggetto ritagliato (le foto le fa l'utente).
- Unipol meno grande di Vita/Trisolino; Trisolino un po' più grande degli altri.
- Il logo Trisolino ad alta risoluzione non è disponibile: non riproporlo (vedi `docs/grafica-next-match/memoria-claude/feedback_non_riproporre_logo_trisolino.md`).

## Come si fa durante una partita (dal browser, anche senza Claude Code)

1. Apri il link del canvas dal browser. 2. Duplica la tavola (o lavora sull'originale se non serve più) e cambia nell'editor i numeri: punteggio set grande (3 e 1), parziali, quale parziale ha il cerchio (sono riquadri con bordo bianco da spostare), `--` sui set non giocati. 3. Scarica il PNG dall'icona di download della tavola. Non ho potuto verificare i menu esatti dell'editor: se qualcosa non torna, descrivilo a Claude.

## Come si prepara una nuova foto (con Claude Code)

1. Copia il `.CR2` in una cartella nuova e vuota (è un file non fidato). 2. `node docs/grafica-risultati/script/estrai-cr2.js foto.CR2 anteprima.jpg` estrae l'anteprima JPEG a piena risoluzione. 3. Con `sharp` (installato in una cartella a parte): `.rotate(-90)` se serve (il file era girato), `.resize({width:1620})`. 4. `node docs/grafica-risultati/script/correzione-colore.js girata.jpg corretta.jpg` neutralizza la dominante del fondale e pulisce. 5. Guardare l'anteprima, caricare l'asset nel canvas (`Artifact` con `asset: true`) e cambiare l'`src` dell'immagine nella tavola.

## Attenzione al canvas

- L'utente ritocca la tavola nell'editor e un editor aperto salva spesso una copia più vecchia sopra la nostra: **prima di ogni modifica rileggere la tavola** (`action: read`, path `project/StoriaRisultato.dc.html`) e applicare le modifiche sulla versione letta; un publish sulla copia vecchia viene rifiutato. Dopo aver pubblicato, l'utente deve ricaricare la pagina (F5) prima di toccare altro.
- Le immagini del canvas sono asset con indirizzo `/_blob/<id>` (foto corretta `dc1e9789b07915b6e301bbcfec154148`, Puglia verde `61af531a851a6918c2fa4441630d5257`, Puglia bianca `bff4fda19d4783283f70598763bfd754`, Fly colorato `f680c78ee18fb1f243b6d0788b547b53`, Unipol `75e7a4c66b30c9dc8ccb99744157124c`, Vita `be702746670391a1b5a9245a85c101e7`, Trisolino `c0c2ede4109849ec247053791492ee15`, stemma `ec877601eed9aaf1541f8827b7c11414`). Se mancano, si ricaricano dai file di questo repo.

## Aperto / da fare

- Non ho mai riaperto la tavola per vedere il risultato finale (l'utente la guarda e mi dice cosa cambiare): se una modifica non torna, verificare con l'utente.
- Il viso nella foto attuale cade tra l'header e il box: controllare che i loghi in alto non lo coprano.
- Il cerchio sul parziale vinto va spostato a mano a ogni partita: valutare se rendere i cerchi un parametro della tavola.
- Foto di partita vere: da scattare a cura dell'utente; la preparazione resta a Claude Code.

## Regole di lavoro già concordate

`npm test` prima di ogni commit sul sito (e `node scripts/stamp-versions.js` se cambia un JS/CSS pubblicato); dopo ogni commit, sempre il push; aggiornare `session_notes.md` a ogni cambiamento.
