# Regole di pulizia e color correction delle foto (grafiche Instagram)

Le fa **sempre Claude Code** (richiesta dell'utente, 2026-10-21). Valgono per le foto scattate dall'utente (ritratti su fondale da studio, `.CR2` Canon) che finiscono nelle tavole del canvas Claude Design. Script: `script/estrai-cr2.js` e `script/correzione-colore.js`.

Stato: sono le regole **applicate la prima volta su `IMG_0113 (2).CR2`** (muro grigio-beige caldo, maglia navy). L'utente non ha dato valori numerici: ha chiesto di farla io e ha visto il risultato senza obiezioni. Se una foto viene male, correggere il valore e aggiornare questo file.

## 1. Da RAW a JPEG di lavoro

1. Copiare il `.CR2` in una **cartella nuova e vuota** (file non fidato) e non eseguire nulla da lì dentro.
2. `node script/estrai-cr2.js foto.CR2 anteprima.jpg`: prende l'anteprima JPEG a piena risoluzione incorporata (5184×3456). Il file contiene tre JPEG: miniatura 160×120, anteprima 5184×3456 (**è quella buona**, baseline `SOF0`) e il RAW come lossless JPEG (`SOF3`, 1336×3516 a strisce, non leggibile come JPEG: va scartato). Non è uno sviluppo del RAW: i colori sono quelli dell'anteprima della fotocamera.
3. **Orientamento**: l'anteprima può essere girata di 90° (nella 0113 lo era). Guardarla e ruotare: `sharp(...).rotate(-90)` se la testa è a destra, `rotate(90)` se a sinistra.
4. Ridimensionare a **1620 px di larghezza** (1,5× la larghezza della storia, abbastanza per il ritaglio e leggero): JPEG qualità ~86, ~650 KB.

## 2. Color correction (`script/correzione-colore.js`)

Ordine e valori usati:

1. **Bilanciamento del bianco sul fondale**: media RGB di 4 riquadri 200×200 di muro (due in alto, due a metà, a sinistra e a destra, 40 px dal bordo) → gain per canale = grigio medio / media del canale; si applica con `recomb` diagonale. Sulla 0113: muro RGB 148,5 / 137,7 / 128,8, gain 0,931 / 1,005 / 1,074 (il muro era caldo: via il giallo). Se il fondale non è neutro (colorato, scuro, assente) **non usare questo passo alla cieca**: stimare il bianco dalla maglia bianca/dalle scritte o lasciarlo com'è.
2. **Pulizia**: `median(3)` per togliere rumore e puntini di polvere sul fondale. Non di più: non deve ammorbidire la pelle né i loghi della maglia.
3. **Contrasto**: `linear(1.08, -10)` (leggero).
4. **Saturazione**: `modulate({saturation: 1.08})`.
5. **Nitidezza**: `sharpen({sigma: 1.1, m1: 0.8, m2: 1.6})`.
6. Uscita JPEG qualità 88.

## 3. Controlli prima di caricare (sempre: guardare l'anteprima)

- **Fondale** neutro, non verdastro/violaceo; **pelle** naturale: dopo il bilanciamento sul muro la pelle può diventare un po' fredda/pallida (successo sulla 0113, accettabile): se pare spenta, scaldare leggermente (più rosso o un gain blu un po' più basso solo su pelle) o ridurre il gain.
- **Maglia navy**: non bruciata né sbiadita; **numeri e loghi sponsor** (Vita, Puglia in Food, stemma) leggibili e senza aloni di nitidezza.
- Nessun canale sbruciato (bianchi a 255 su aree grandi) né neri chiusi.
- Lo sfondo chiaro o scuro decide la scelta dei loghi sopra: muro chiaro → **Puglia in Food verde** (o scuro), muro scuro → bianco.

## 4. Dopo

Caricare il JPEG corretto come asset del canvas (`Artifact` con `asset: true`), mettere l'indirizzo `/_blob/<id>` nell'`src` della foto della tavola (rileggere prima la tavola: vedi `HANDOFF.md`), e dire all'utente di ricaricare la pagina.

## Cose non ancora risolte

- Non c'è ritocco della pelle, rimozione di oggetti o ritaglio intelligente dello sfondo: se serve (foto di partita, con palazzetto), va deciso caso per caso con l'utente.
- Le foto di partita (luci miste del palazzetto, movimento) vanno trattate diversamente da questo ritratto da studio: non applicare il bilanciamento sul «muro».
