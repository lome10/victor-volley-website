const sharp = require('sharp');
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
(async () => {
  const src = '../foto/scontornata.png';
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, out = Buffer.from(data);
  for (let i = 0; i < data.length; i += ch) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    // 1) bilanciamento globale morbido (toglie il muro beige)
    r *= 0.95; b *= 1.08;
    // 2) correzione selettiva sui toni caldi (pelle): meno arancio, piu rosa
    const warm = (r - b) / 255;
    const k = (r >= g && g >= b) ? ss(0.14, 0.42, warm) : 0;
    r *= 1 - 0.17 * k; g *= 1 + 0.02 * k; b *= 1 + 0.36 * k;
    // 3) schiarisce un po' la pelle e le ombre
    const lum = (r + g + b) / 3, lift = 1 + 0.10 * k + 0.05 * (1 - lum / 255);
    r *= lift; g *= lift; b *= lift;
    out[i] = Math.min(255, r); out[i + 1] = Math.min(255, g); out[i + 2] = Math.min(255, b);
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: ch } }).png().toFile('../foto/scontornata_cc2.png');
  const guancia = { left: 620, top: 560, width: 140, height: 120 };
  for (const [n, f] of [['originale', '../foto/scontornata.png'], ['correzione 1', '../foto/scontornata_cc.png'], ['correzione 2', '../foto/scontornata_cc2.png']]) {
    const buf = await sharp(f).flatten({ background: '#000' }).extract(guancia).toBuffer();
    const s = await sharp(buf).stats();
    console.log(n, 'guancia', s.channels.slice(0, 3).map(c => Math.round(c.mean)).join(','));
  }
  // confronto del volto: originale | correzione 1 | correzione 2 su magenta
  const face = { left: 380, top: 330, width: 760, height: 620 };
  const tiles = [];
  for (const f of ['../foto/scontornata.png', '../foto/scontornata_cc.png', '../foto/scontornata_cc2.png'])
    tiles.push(await sharp(f).flatten({ background: '#B81D5F' }).extract(face).resize({ width: 420 }).jpeg().toBuffer());
  const m = await sharp(tiles[0]).metadata();
  await sharp({ create: { width: 420 * 3 + 20, height: m.height, channels: 3, background: '#111' } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * 430, top: 0 }))).jpeg({ quality: 90 }).toFile('../foto/confronto_volto.jpg');
})();
