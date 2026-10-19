import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import fs from 'fs';
const dir = '../foto/';
// raddrizza (la testa e a destra: ruota di 90 gradi antiorario) e riduce a 2400 px di altezza
const dritta = await sharp(dir + 'anteprima.jpg').rotate(270).resize({ height: 2400 }).jpeg({ quality: 92 }).toBuffer();
fs.writeFileSync(dir + 'dritta.jpg', dritta);
const meta = await sharp(dritta).metadata();
console.log('dritta', meta.width + 'x' + meta.height);
const blob = await removeBackground(new Blob([dritta], { type: 'image/jpeg' }), { model: 'medium', output: { format: 'image/png' } });
fs.writeFileSync(dir + 'scontornata.png', Buffer.from(await blob.arrayBuffer()));
console.log('scontornata ok');
