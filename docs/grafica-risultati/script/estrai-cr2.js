// Estrae da un .CR2 l'anteprima JPEG a piena risoluzione (5184x3456 per la 5D/EOS: il segmento baseline più grande, non il lossless C3 che è il RAW).
// Uso: node estrai-cr2.js foto.CR2 uscita.jpg   -- poi ruotare con sharp (di solito .rotate(-90)) e ridimensionare a 1620 px di larghezza
const fs=require('fs');const [,, inp, out]=process.argv;const b=fs.readFileSync(inp);
const c=[];let i=0;
while((i=b.indexOf(Buffer.from([0xFF,0xD8,0xFF]),i))!==-1){
  // trova il SOF
  let p=i+2,sof=null,w=0,h=0;
  while(p<b.length-9){ if(b[p]!==0xFF){break} const m=b[p+1]; if(m===0xD8){p+=2;continue}
    const len=b.readUInt16BE(p+2); if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){sof=m;h=b.readUInt16BE(p+5);w=b.readUInt16BE(p+7);break}
    p+=2+len;}
  const e=b.indexOf(Buffer.from([0xFF,0xD9]),i+2);
  c.push({off:i,sof:sof&&sof.toString(16),w,h,end:e});i+=3;
}
console.log(c.slice(0,12));
const ok=c.filter(x=>x.sof==='c0'||x.sof==='c1'||x.sof==='c2').sort((a,b2)=>b2.w*b2.h-a.w*a.h)[0];
console.log('scelto',ok);
const end=b.indexOf(Buffer.from([0xFF,0xD9]),ok.off+2)+2;
fs.writeFileSync(out,b.subarray(ok.off,end));
