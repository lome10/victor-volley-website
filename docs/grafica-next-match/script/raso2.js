const sharp = require('sharp');
const W = 1080, H = 760;
const folds = [ { kx: 0.00120, ky: 0.00075, a: 1.0, p: 0.9 }, { kx: 0.00070, ky: -0.00045, a: 0.85, p: 2.6 }, { kx: 0.00210, ky: 0.00110, a: 0.45, p: 4.3 }, { kx: -0.00060, ky: 0.00090, a: 0.55, p: 1.5 } ];
function h(x, y) {
  const wx = x + 85 * Math.sin(y * 0.0017 + 1.0), wy = y + 70 * Math.sin(x * 0.0015 + 2.0);
  let s = 0; for (const f of folds) s += f.a * Math.sin(f.kx * wx * 6.283 + f.ky * wy * 6.283 + f.p);
  return s;
}
const base = [98, 11, 54], mid = [176, 30, 98], hi = [228, 80, 150];   // dal prugna profondo al magenta luminoso del brand
const L = [-0.5, -0.65, 0.57];
const out = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const e = 1.5, dx = (h(x + e, y) - h(x - e, y)) / (2 * e), dy = (h(x, y + e) - h(x, y - e)) / (2 * e);
  const k = 62;
  let nx = -dx * k, ny = -dy * k, nz = 1, n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n;
  const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  const hx = L[0], hy = L[1], hz = L[2] + 1, hn = Math.hypot(hx, hy, hz);
  const sp = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hn), 38);
  const t = Math.min(1, d * 1.2);
  const i = (y * W + x) * 3, g = (Math.random() - 0.5) * 7; // grana del tessuto
  for (let c = 0; c < 3; c++) {
    let v = t < 0.5 ? base[c] + (mid[c] - base[c]) * (t / 0.5) : mid[c] + (hi[c] - mid[c]) * ((t - 0.5) / 0.5) * 0.7;
    v += (hi[c] - v) * sp * 0.45 + g;
    out[i + c] = Math.max(0, Math.min(255, v));
  }
}
sharp(out, { raw: { width: W, height: H, channels: 3 } }).blur(0.7).jpeg({ quality: 90 }).toFile('../foto/raso_pavimento.jpg').then(() => console.log('ok'));
