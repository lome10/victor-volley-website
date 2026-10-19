const sharp = require('sharp');
const stops = [[0.0, [22, 3, 16]], [0.32, [118, 14, 62]], [0.62, [212, 40, 112]], [1.0, [255, 196, 224]]];
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function map(L) {
  for (let i = 1; i < stops.length; i++) if (L <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (L - a) / (b - a);
    return ca.map((v, k) => v + (cb[k] - v) * t);
  }
  return stops[stops.length - 1][1];
}
async function run(inp, out, skinW, shirtW) {
  const { data, info } = await sharp(inp).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, o = Buffer.from(data);
  for (let i = 0; i < data.length; i += ch) {
    let r = data[i] * 0.95, g = data[i + 1], b = data[i + 2] * 1.1;
    let L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    L = Math.min(1, Math.max(0, (L - 0.5) * 1.2 + 0.5 + 0.03));
    const d = map(L);
    // piu blu = maglia: poco magenta, mantiene il suo colore; pelle e bianchi: magenta pieno
    const blue = ss(0.06, 0.30, (b - r) / 255);
    const W = skinW + (shirtW - skinW) * blue;
    // sulla maglia schiarisce un po' per non perdere i dettagli
    const lift = 1 + 0.55 * blue;
    o[i] = Math.min(255, (r * lift) * (1 - W) + d[0] * W);
    o[i + 1] = Math.min(255, (g * lift) * (1 - W) + d[1] * W);
    o[i + 2] = Math.min(255, (b * lift) * (1 - W) + d[2] * W);
  }
  await sharp(o, { raw: { width: info.width, height: info.height, channels: ch } }).png().toFile(out);
}
(async () => {
  await run('../foto/scontornata.png', '../foto/duo1b.png', 0.82, 0.06);
  await run('../foto2/scontornata.png', '../foto2/duo2b.png', 0.82, 0.06);
  const t = [];
  for (const f of ['../foto/duo1b.png', '../foto2/duo2b.png'])
    t.push(await sharp(f).flatten({ background: '#8a1450' }).resize({ width: 450 }).jpeg().toBuffer());
  const m = await sharp(t[0]).metadata();
  await sharp({ create: { width: 910, height: m.height, channels: 3, background: '#111' } })
    .composite(t.map((b, i) => ({ input: b, left: i * 460, top: 0 }))).jpeg({ quality: 88 }).toFile('../foto/duo_prova2.jpg');
  console.log('ok');
})();
