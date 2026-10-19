const fs = require('fs');
const b = fs.readFileSync(process.argv[2]);
const le = b.toString('ascii', 0, 2) === 'II';
const r16 = o => le ? b.readUInt16LE(o) : b.readUInt16BE(o);
const r32 = o => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
let ifd = r32(4), n = 0;
while (ifd && n < 6) {
  const cnt = r16(ifd); let off = 0, len = 0, w = 0, h = 0;
  for (let i = 0; i < cnt; i++) {
    const e = ifd + 2 + i * 12, tag = r16(e), val = r32(e + 8);
    if (tag === 0x111) off = val; if (tag === 0x117) len = val; if (tag === 0x100) w = val; if (tag === 0x101) h = val;
  }
  console.log('IFD' + n, 'offset', off, 'len', len, w + 'x' + h);
  if (n === 0 && off && len && b[off] === 0xFF && b[off+1] === 0xD8) fs.writeFileSync(process.argv[3], b.subarray(off, off + len));
  ifd = r32(ifd + 2 + cnt * 12); n++;
}
