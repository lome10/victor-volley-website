const sharp = require('sharp');
(async () => {
  const T = parseFloat(process.argv[2] || '0.55');
  const a = await sharp('../foto/scontornata.png').raw().toBuffer({ resolveWithObject: true });
  const b = await sharp('../foto/scontornata_cc2.png').raw().toBuffer();
  const out = Buffer.from(a.data), ch = a.info.channels;
  for (let i = 0; i < out.length; i += ch)
    for (let c = 0; c < 3; c++) out[i + c] = Math.min(255, (a.data[i + c] + T * (b[i + c] - a.data[i + c])) * 1.05);
  await sharp(out, { raw: { width: a.info.width, height: a.info.height, channels: ch } })
    .modulate({ saturation: 1.12 }).png().toFile('../foto/scontornata_cc3.png');
  const guancia = { left: 620, top: 560, width: 140, height: 120 };
  const buf = await sharp('../foto/scontornata_cc3.png').flatten({ background: '#000' }).extract(guancia).toBuffer();
  console.log('cc3 guancia', (await sharp(buf).stats()).channels.slice(0, 3).map(c => Math.round(c.mean)).join(','));
  const face = { left: 380, top: 330, width: 760, height: 620 };
  const tiles = [];
  for (const f of ['../foto/scontornata.png', '../foto/scontornata_cc3.png'])
    tiles.push(await sharp(f).flatten({ background: '#B81D5F' }).extract(face).resize({ width: 520 }).jpeg().toBuffer());
  const m = await sharp(tiles[0]).metadata();
  await sharp({ create: { width: 1050, height: m.height, channels: 3, background: '#111' } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * 530, top: 0 }))).jpeg({ quality: 90 }).toFile('../foto/confronto_volto2.jpg');
})();
