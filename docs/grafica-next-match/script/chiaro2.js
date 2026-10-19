const sharp = require('sharp');
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 1) foto a colori naturali: incarnato corretto, maglia viva, nessuna tinta magenta
async function nat(inp, out) {
  const { data, info } = await sharp(inp).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, o = Buffer.from(data);
  for (let i = 0; i < data.length; i += ch) {
    const r0 = data[i], g0 = data[i + 1], b0 = data[i + 2];
    let r = r0 * 0.95, g = g0, b = b0 * 1.08;
    const k = (r >= g && g >= b) ? ss(0.14, 0.42, (r - b) / 255) : 0;
    r *= 1 - 0.17 * k; g *= 1 + 0.02 * k; b *= 1 + 0.36 * k;
    const lift = 1 + 0.10 * k + 0.05 * (1 - ((r + g + b) / 3) / 255);
    r *= lift; g *= lift; b *= lift;
    r = r0 + 0.55 * (r - r0); g = g0 + 0.55 * (g - g0); b = b0 + 0.55 * (b - b0);
    r *= 1.05; g *= 1.05; b *= 1.05;
    const blue = ss(0.06, 0.30, (b0 - r0) / 255), lum = 0.299 * r + 0.587 * g + 0.114 * b, sat = 1 + 0.30 * blue + 0.10 * k;
    r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
    const lf = 1 + 0.45 * blue; r *= lf; g *= lf; b *= lf;
    o[i] = Math.min(255, r); o[i + 1] = Math.min(255, g); o[i + 2] = Math.min(255, b);
  }
  await sharp(o, { raw: { width: info.width, height: info.height, channels: ch } }).png().toFile(out);
}
// 2) loghi bianchi -> blu scuro (il verde di Vita resta)
async function scuro(inp, out) {
  const { data, info } = await sharp(inp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const o = Buffer.from(data);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const verde = g > 190 && r < 190; // il segno verde di Vita
    if (!verde) { o[i] = 8; o[i + 1] = 38; o[i + 2] = 82; } else { o[i] = 14; o[i + 1] = 186; o[i + 2] = 140; }
  }
  await sharp(o, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(out);
}
// 3) nebbia: rumore frattale, piu fitta in basso e ai lati
function hash(x, y) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v; }
async function nebbia(out) {
  const W = 1080, H = 1350, buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let n = 0, a = 0.5, f = 1 / 260, s = 0; for (let o = 0; o < 5; o++) { n += a * vnoise(x * f + 7, y * f * 1.5 + 3); s += a; a *= 0.5; f *= 2; } n /= s;
    const yy = y / H, xx = x / W;
    const bottom = ss(0.80, 1.0, yy);
    const gl = Math.exp(-(Math.pow((xx - 0.0) / 0.22, 2) + Math.pow((yy - 0.66) / 0.10, 2)));
    const gr = Math.exp(-(Math.pow((xx - 1.0) / 0.22, 2) + Math.pow((yy - 0.72) / 0.10, 2)));
    const gt1 = Math.exp(-(Math.pow((xx - 0.05) / 0.16, 2) + Math.pow((yy - 0.02) / 0.05, 2)));
    const gt2 = Math.exp(-(Math.pow((xx - 0.98) / 0.16, 2) + Math.pow((yy - 0.03) / 0.05, 2)));
    const mask = Math.max(bottom, gl, gr, gt1, gt2);
    const dens = ss(0.38, 0.70, n) * mask;
    const shade = 218 + 37 * ss(0.3, 0.8, n);
    const i = (y * W + x) * 4;
    buf[i] = shade - 4; buf[i + 1] = shade; buf[i + 2] = Math.min(255, shade + 6); buf[i + 3] = Math.min(255, dens * 255 * 1.05);
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).blur(2.2).png().toFile(out);
}
(async () => {
  await nebbia('../foto/nebbia.png');
  const base = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#9fb0be' } }).composite([{ input: '../foto/nebbia.png' }]).png().toBuffer();
  await sharp(base).resize({ width: 540 }).jpeg({ quality: 85 }).toFile('../foto/nebbia_prova.jpg');
  console.log('ok');
})();
