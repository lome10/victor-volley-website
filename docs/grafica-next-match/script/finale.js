const sharp = require('sharp');
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const stops = [[0.0, [22, 3, 16]], [0.32, [118, 14, 62]], [0.62, [212, 40, 112]], [1.0, [255, 196, 224]]];
function map(L) { for (let i = 1; i < stops.length; i++) if (L <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (L - a) / (b - a); return ca.map((v, k) => v + (cb[k] - v) * t); } return stops[3][1]; }
async function grade(inp, out, skinTint) {
  const { data, info } = await sharp(inp).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, o = Buffer.from(data);
  for (let i = 0; i < data.length; i += ch) {
    const r0 = data[i], g0 = data[i + 1], b0 = data[i + 2];
    // 1) incarnato naturale (stessa correzione approvata prima)
    let r = r0 * 0.95, g = g0, b = b0 * 1.08;
    const k = (r >= g && g >= b) ? ss(0.14, 0.42, (r - b) / 255) : 0;
    r *= 1 - 0.17 * k; g *= 1 + 0.02 * k; b *= 1 + 0.36 * k;
    let lift = 1 + 0.10 * k + 0.05 * (1 - ((r + g + b) / 3) / 255);
    r *= lift; g *= lift; b *= lift;
    r = r0 + 0.55 * (r - r0); g = g0 + 0.55 * (g - g0); b = b0 + 0.55 * (b - b0);
    r *= 1.05; g *= 1.05; b *= 1.05;
    // 2) colori piu vivi: la maglia blu viene schiarita e saturata, la pelle resta naturale
    const blue = ss(0.06, 0.30, (b0 - r0) / 255);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b);
    const sat = 1 + 0.30 * blue + 0.10 * k;
    r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
    const lf = 1 + 0.45 * blue; r *= lf; g *= lf; b *= lf;
    // 3) tinta magenta leggera solo sulla pelle e sui bianchi, per legare la foto allo sfondo
    let L = Math.min(1, Math.max(0, (0.299 * r + 0.587 * g + 0.114 * b) / 255));
    const d = map(L), W = skinTint * (1 - blue);
    o[i] = Math.min(255, r * (1 - W) + d[0] * W);
    o[i + 1] = Math.min(255, g * (1 - W) + d[1] * W);
    o[i + 2] = Math.min(255, b * (1 - W) + d[2] * W);
  }
  await sharp(o, { raw: { width: info.width, height: info.height, channels: ch } }).png().toFile(out);
}
(async () => {
  await grade('../foto/scontornata.png', '../foto/fin1.png', 0.18);
  await grade('../foto2/specchio_pulita.png', '../foto2/fin2.png', 0.18);
  const t = [];
  for (const f of ['../foto/fin1.png', '../foto2/fin2.png'])
    t.push(await sharp(f).flatten({ background: '#3B0B27' }).resize({ width: 450 }).jpeg().toBuffer());
  const m = await sharp(t[0]).metadata();
  await sharp({ create: { width: 910, height: m.height, channels: 3, background: '#111' } })
    .composite(t.map((b, i) => ({ input: b, left: i * 460, top: 0 }))).jpeg({ quality: 88 }).toFile('../foto/fin_prova.jpg');
  console.log('ok');
})();
