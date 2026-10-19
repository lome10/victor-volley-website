const sharp = require('C:/Users/loren/AppData/Local/Temp/claude/C--Users-loren-Desktop-victor-volley-website/b6326e56-bca9-4e12-b76f-46a039a9b933/scratchpad/tool/node_modules/sharp');
const src = 'C:/Users/loren/AppData/Local/Temp/claude/C--Users-loren-Desktop-victor-volley-website/b6326e56-bca9-4e12-b76f-46a039a9b933/scratchpad/occhi/IMG_0016b_r.jpg';
const out = process.env.TEMP + '/strip16g.jpg';
(async () => {
  const cx = 1832, cy = 1159, R = 1100;
  const big = await sharp(src).extract({ left: cx - 1500, top: cy - R, width: 3000, height: 2 * R }).rotate(14.5, { background: '#cfc8bb' }).toBuffer();
  const m = await sharp(big).metadata();
  const W = 1364, H = 385;
  await sharp(big).extract({ left: Math.round(m.width / 2 - W / 2 - 424), top: Math.round(m.height / 2 - H * 0.47), width: W, height: H }).resize(1500, 424).jpeg({ quality: 93 }).toFile(out);
  console.log(m.width, m.height);
})();
