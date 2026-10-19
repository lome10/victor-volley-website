import { removeBackground } from '@imgly/background-removal-node';
import fs from 'fs';
const buf = fs.readFileSync('../foto/dritta.jpg');
const blob = await removeBackground(new Blob([buf], { type: 'image/jpeg' }), { model: 'medium', output: { format: 'image/png' } });
fs.writeFileSync('../foto/scontornata.png', Buffer.from(await blob.arrayBuffer()));
console.log('OK');
