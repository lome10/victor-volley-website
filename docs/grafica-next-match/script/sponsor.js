const sharp = require('sharp');
(async () => {
  // Trisolino versione per fondi scuri: toglie il blu di sfondo (color to alpha)
  const crop = await sharp('../foto/trisolino_pdf.png').extract({ left: 240, top: 130, width: 1930, height: 340 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = crop;
  const bg = [data[0], data[1], data[2]];
  const o = Buffer.from(data);
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    const a = Math.max(0, Math.min(1, d / 150));
    if (a < 0.02) { o[i + 3] = 0; continue; }
    // colore reale del primo piano, senza la sfumatura blu dei bordi
    for (let c = 0; c < 3; c++) o[i + c] = Math.max(0, Math.min(255, bg[c] + (data[i + c] - bg[c]) / a));
    o[i + 3] = Math.round(a * 255);
  }
  await sharp(o, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).resize({ width: 1000 }).png().toFile('../foto/trisolino-scuro.png');
  await sharp('C:/Users/loren/Desktop/victor-volley-website/assets/GESCO.png').ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).png().toFile('../foto/gesco.png');
  await sharp('C:/Users/loren/Desktop/victor-volley-website/assets/MAGIFLEX.png').ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).resize({ width: 1000 }).png().toFile('../foto/magiflex.png');
  for (const f of ['trisolino-scuro', 'gesco', 'magiflex']) {
    const m = await sharp('../foto/' + f + '.png').metadata(); console.log(f, m.width + 'x' + m.height);
  }
  // anteprima su fondo scuro
  const tiles = [];
  for (const f of ['trisolino-scuro', 'gesco', 'magiflex'])
    tiles.push(await sharp('../foto/' + f + '.png').resize({ height: 80 }).png().toBuffer());
  const metas = await Promise.all(tiles.map(t => sharp(t).metadata()));
  const W = metas.reduce((s, m) => s + m.width + 60, 60);
  const base = await sharp({ create: { width: W, height: 120, channels: 3, background: '#0e1a2b' } }).png().toBuffer();
  let x = 60; const comp = [];
  tiles.forEach((t, i) => { comp.push({ input: t, left: x, top: 20 }); x += metas[i].width + 60; });
  await sharp(base).composite(comp).jpeg({ quality: 90 }).toFile('../foto/sponsor_prova.jpg');
})();
