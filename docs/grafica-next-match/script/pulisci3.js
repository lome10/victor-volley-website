const sharp = require('sharp');
const REG = [{ x0: 440, y0: 1065, x1: 735, y1: 1275, rad: 24 }, { x0: 325, y0: 1735, x1: 915, y1: 2150, rad: 16 }];
function minmax1d(src, n, rad, isMin, stride, off, out) {
  // finestra scorrevole semplice (raggio piccolo): O(n*rad)
  for (let i = 0; i < n; i++) {
    let v = isMin ? 1e9 : -1e9;
    for (let d = -rad; d <= rad; d++) { const j = Math.min(n - 1, Math.max(0, i + d)); const a = src[off + j * stride]; if (isMin ? a < v : a > v) v = a; }
    out[off + i * stride] = v;
  }
}
function morph(a, w, h, rad, isMin) {
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) minmax1d(a, w, rad, isMin, 1, y * w, t);
  for (let x = 0; x < w; x++) minmax1d(t, h, rad, isMin, w, x, o);
  return o;
}
(async () => {
  const { data, info } = await sharp('../foto2/scontornata.png').raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const M = Buffer.alloc(data.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (y * W + (W - 1 - x)) * ch, d = (y * W + x) * ch;
    for (let c = 0; c < ch; c++) M[d + c] = data[s + c];
  }
  for (const r of REG) {
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    const res = [];
    for (let c = 0; c < 3; c++) {
      const a = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = M[((r.y0 + y) * W + (r.x0 + x)) * ch + c];
      res.push(morph(morph(a, w, h, r.rad, true), w, h, r.rad, false)); // apertura = erosione + dilatazione
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((r.y0 + y) * W + (r.x0 + x)) * ch;
      if (M[i + 3] < 200) continue;
      const f = Math.min(1, Math.min(x, w - 1 - x, y, h - 1 - y) / 22);
      const n = (Math.random() - 0.5) * 4;
      for (let c = 0; c < 3; c++) M[i + c] = Math.max(0, Math.min(255, M[i + c] * (1 - f) + (Math.min(M[i + c], res[c][y * w + x]) + n) * f));
    }
  }
  await sharp(M, { raw: { width: W, height: H, channels: ch } }).png().toFile('../foto2/specchio_pulita.png');
  await sharp('../foto2/specchio_pulita.png').flatten({ background: '#222' }).extract({ left: 250, top: 950, width: 900, height: 1250 }).resize({ width: 600 }).jpeg({ quality: 88 }).toFile('../foto2/pulita_prova.jpg');
  console.log('ok');
})();
