// Color correction di una foto da studio: neutralizza la dominante del fondale (media di 4 riquadri di muro),
// toglie rumore, contrasto e saturazione leggeri, nitidezza.
// Uso: node correzione-colore.js foto-girata.jpg foto-corretta.jpg   (serve `npm i sharp` in una cartella a parte)
const sharp = require('sharp');
const [, , src, out] = process.argv;
(async () => {
  const { width: W } = await sharp(src).metadata();
  const box = 200;
  const m = [];
  for (const [l, t] of [[40, 40], [W - 40 - box, 40], [40, 500], [W - 40 - box, 500]]) {
    const s = await sharp(src).extract({ left: l, top: t, width: box, height: box }).stats();
    m.push(s.channels.slice(0, 3).map(c => c.mean));
  }
  const avg = [0, 1, 2].map(i => m.reduce((a, x) => a + x[i], 0) / m.length);
  const g = (avg[0] + avg[1] + avg[2]) / 3;
  const k = avg.map(v => g / v);
  console.log('muro RGB', avg.map(v => v.toFixed(1)), 'gain', k.map(v => v.toFixed(3)));
  await sharp(src)
    .recomb([[k[0], 0, 0], [0, k[1], 0], [0, 0, k[2]]])
    .median(3)
    .linear(1.08, -10)
    .modulate({ saturation: 1.08 })
    .sharpen({ sigma: 1.1, m1: 0.8, m2: 1.6 })
    .jpeg({ quality: 88 })
    .toFile(out);
})();
