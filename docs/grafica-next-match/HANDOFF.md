# Passaggio di consegne — grafica «Next match» U19 (2026-10-19)

Per riprendere il lavoro su un altro PC. Leggi questo file per primo, poi `docs/brandbook/BRANDBOOK.md`.

## Dove vive cosa

| Cosa | Dove | Sull'altro PC |
|---|---|---|
| Il progetto grafico (tavole) | Claude Design, link privato: https://claude.ai/artifact/DfvU4iLegNg978qTjNEHpz | si apre con lo stesso account claude.ai |
| Copia di sicurezza delle tavole | `docs/grafica-next-match/artifact/project/` (4 file `.dc.html` + `canvas.json`) | arriva con `git pull` |
| Materiali già pronti (foto scontornate, loghi bianchi/scuri, nebbia) | `docs/grafica-next-match/materiali/` | arriva con `git pull` |
| Script usati per prepararli | `docs/grafica-next-match/script/` | arriva con `git pull`; servono Node e `npm install sharp @imgly/background-removal-node pdfjs-dist @napi-rs/canvas` in una cartella a parte |
| Brand book e loghi ufficiali | `docs/brandbook/`, `assets/brand/` | arriva con `git pull` |
| Loghi sponsor | `assets/` (`Vita.png`, `Puglia in Food.png`, `puglia in food - verde.png`, `flyarmida.jpg`, `GESCO.png`, `MAGIFLEX.png`, `Trisolino_impianti_logo (2).pdf`) | arriva con `git pull` |
| **Foto originali RAW** `IMG_0016.CR2` e `IMG_0013.CR2` | `C:\Users\loren\Downloads\` del PC attuale | **da copiare a mano** (27 MB l'una, non stanno su Git) |
| Memoria di Claude Code (preferenze, regole) | `C:\Users\loren\.claude\projects\C--Users-loren-Desktop-victor-volley-website\memory\` del PC attuale | copia in `docs/grafica-next-match/memoria-claude/`; vedi sotto come ripristinarla |
| La conversazione | resta su questo PC | non si trasferisce: questo file la sostituisce |

## Stato della grafica

Formato 1080×1350 (4:5). Partita: **Victor Volley Puglia in Food v FlyArmida Volley, mercoledì 21 ottobre 2026, ore 19:00, Pallone Tensostatico Taviano**, Under 19 femminile.

Il canvas ha quattro tavole:
1. `Main` — «Prova 1», scura, stile Bayern, foto IMG_0016.
2. `Alt` — «Prova 2», scura, foto IMG_0013 specchiata.
3. `Chiaro1` — «VS FLY – braccia incrociate», stile Burnley, foto IMG_0013. Ha ancora il box sponsor.
4. `Chiaro2` — «VS fLY – indica lo stemma», **la tavola scelta**, foto IMG_0016 (atleta n. 22).

Su `Chiaro2` (stato alla versione 63):
- sfondo malva chiaro in alto con nuvole bianche, pavimento magenta `#CA2367` che scurisce in prugna verso gli sponsor, vignettatura prugna sotto la ragazza (l'atleta non è scurita);
- titolo «NEXT MATCH» in Playfair Display compresso, rosa `#CA2367`;
- in alto: stemma Victor 118 px, filo, Puglia in Food verde 113 px;
- sotto il titolo a sinistra: FlyArmida (176 px); a destra «21 OTTOBRE / ORE 19:00 / Pallone Tensostatico Taviano» in Montserrat;
- sponsor senza box, direttamente sulla sfumatura: Vita, Trisolino (versione per fondi scuri), Gesco, Magiflex;
- testo sopra gli sponsor: «WE ARE FUTURE».

## Decisioni dell'utente da rispettare

- Stile chiaro «Burnley–Liverpool»; **niente specchio** (numero e sponsor sulla maglia devono restare leggibili); niente sfondo magenta pieno.
- Colori e font dal brand book: Pink `#CA2367`, Blue `#028BFD`, Navy `#002B56`; Montserrat, Impact, EDITION.
- Accanto allo stemma Victor, in alto, sempre Puglia in Food.
- Ordine sponsor: Vita, Trisolino, Gesco, Magiflex (Comprovendo e Unipol tolti, mancano i file).
- Prima di ritoccare una tavola **rileggila** (`action: read`): l'utente la modifica a mano nell'editor, e un editor aperto può salvare una versione vecchia sopra la nostra.

## Aperto / da fare

- Il motivo a rete al posto delle piastrelle del pavimento (versione 63) è quasi invisibile: va reso più evidente o cambiato.
- Il testo sotto la ragazza cambia a ogni salvataggio dell'editor («VICTOR VOLLEY X FLYARMIDA» / «WE ARE FUTURE»): da fissare.
- Il serif del titolo non è EDITION né Impact: serve il file del font del brand.
- `Chiaro1` va allineata a `Chiaro2` (sfondo, sponsor senza box, blocco in alto).
- Esportare la tavola scelta in PNG per Instagram (icona di download sulla tavola).

## Ripristinare la memoria di Claude Code sull'altro PC

Copia i file di `docs/grafica-next-match/memoria-claude/` nella cartella memoria del nuovo PC. Il nome della cartella dipende dal percorso del progetto: è `C:\Users\<utente>\.claude\projects\<percorso-progetto-con-trattini>\memory\`. Dopo aver aperto una volta Claude Code nel progetto, `/memory` ne mostra il percorso esatto.

## Regole di lavoro già concordate

`npm test` prima di ogni commit sul sito (e `node scripts/stamp-versions.js` se cambia un JS/CSS pubblicato); dopo ogni commit, sempre il push; aggiornare `session_notes.md` a ogni cambiamento.
