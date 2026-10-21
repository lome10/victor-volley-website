# Loghi per le grafiche — quale file su quale fondo

Tutti i PNG sono trasparenti. «Fondo scuro» = navy `#002B56`/`#00152B`, foto scure; «fondo chiaro» = bianco, muro chiaro, malva.
Fonti originali nel repo: `assets/` e `docs/grafica-next-match/materiali/`; questa cartella è la copia ordinata per andare dall'altro PC con `git pull`.

| File | Per cosa | Note |
|---|---|---|
| `puglia-in-food-testo-scuro-per-fondi-chiari.png` (679×411) | **Puglia in Food (main sponsor)** su fondi chiari; su fondi scuri si rende bianco con `filter: brightness(0) invert(1)` | ritagliato stretto, senza margini |
| `puglia-in-food-verde-trasparente.png` (679×411) | **Puglia in Food verde**, la versione alternativa per fondi/foto chiari | ritagliato stretto; è quella usata ora in alto sulla storia |
| `puglia-in-food-bianco-con-margini.png` (1170×1320) | Puglia in Food bianco per fondi scuri | **ha molto margine trasparente**: meglio il file scuro reso bianco col filtro |
| `vita-bianco-per-fondi-scuri.png` (648×197) | Vita (Studio Dentistico) con scritta bianca e segno verde acqua | per fondi scuri |
| `vita-testo-scuro-per-fondi-chiari.png` (648×197) | Vita con scritta scura | per fondi chiari |
| `vita-originale.png` (1280×905) | Vita originale | ha margini |
| `trisolino-per-fondi-scuri.png` (1000×140) | Trisolino Impianti (testo arancione, striscia «Tecnologia & Innovazione») | per fondi scuri; **non esiste una versione ad alta risoluzione**: la società non ha il file, non riproporlo |
| `trisolino-originale.pdf` | PDF originale del logo Trisolino | si può rasterizzare con `docs/grafica-next-match/script/pdf.mjs` |
| `unipol-bianco.png` (1659×700) | Unipol con lettere bianche e tricolore | per fondi scuri; **molto margine trasparente** (il logo vero occupa ~1135×250 al centro): su 1080 px di grafica usare larghezza ~250 px; **manca la versione a colori** |
| `gesco.png` (570×118) | Gesco | |
| `magiflex.png` (1000×634) | Magiflex | |
| `flyarmida-colori.png` (401×234) | FlyArmida Volley Taviano a colori (blu + magenta) | il blu scuro non si legge su fondi scuri: metterlo su un riquadro bianco arrotondato |
| `flyarmida-bianco.png` (400×229) | FlyArmida tutto bianco | per fondi scuri |
| `victor-stemma-colori.svg` / `.png` | Stemma Victor Volley a colori (magenta/azzurro) | l'SVG è quello da usare; per i fondi chiari/scuri monocromatici vedi `assets/brand/` (`logo-bianco.svg` = contorni neri per fondi chiari, `logo-nero.svg` = versione bianca per fondi scuri: i nomi sono invertiti) |

## Regole d'uso (decise dall'utente)

- Accanto allo stemma Victor, in alto, sempre Puglia in Food.
- Ordine sponsor in fascia: Vita, Unipol, Trisolino (Gesco e Magiflex dove c'è spazio; Comprovendo non c'è il file).
- Puglia in Food va scelto **bianco o verde in base alla foto**, così resta leggibile.
