/**
 * PDF della ricevuta di pagamento, costruito sul server (nessun browser): stessa impaginazione di
 * js/ricevuta-doc.js (logo, banda blu «RICEVUTA DI PAGAMENTO», righe pagatore/versamento, importo in cifre e in
 * lettere, testi fissi, luogo/data e firma, logo in filigrana, timbro ANNULLATA). Lavora solo sulla copia dei dati
 * salvata nella ricevuta, come il documento a schermo. Collaudato da scripts/check-ricevuta-pdf.js.
 *
 * L'importo in lettere, la data e i testi vengono da js/ricevuta-doc.js, caricato qui senza toccare lo spazio
 * globale (è scritto per il browser: gli passo un finto `window`). Tenere allineati i due file se cambia l'impaginazione.
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

const sandbox = { location: { origin: '' } };
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', 'ricevuta-doc.js'), 'utf8'))(sandbox);
const Doc = sandbox.RicevutaDoc;

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const BLU = hex('#4C95D9'), ROSA = hex('#E8326A'), GRIGIO = hex('#F3F6F8'), BORDO = hex('#CFD6DD'), NERO = rgb(0, 0, 0), BIANCO = rgb(1, 1, 1);

const A4 = [595.28, 841.89], M = 28, W = A4[0] - 2 * M;

/** Il carattere sta nel set standard dei font PDF? Altrimenti «?», così nomi con caratteri strani non fanno fallire l'invio. */
function sicuro(font, s) {
  return Array.from(String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ')).map((c) => {
    try { font.encodeText(c); return c; } catch (e) { return '?'; }
  }).join('');
}

/** Va a capo per parole entro `larg` punti. */
function righe(font, size, testo, larg) {
  const parole = sicuro(font, testo).split(' ').filter(Boolean), out = [];
  let riga = '';
  parole.forEach((p) => {
    const prova = riga ? riga + ' ' + p : p;
    if (font.widthOfTextAtSize(prova, size) <= larg || !riga) riga = prova; else { out.push(riga); riga = p; }
  });
  if (riga) out.push(riga);
  return out.length ? out : [''];
}

/**
 * @param {object} r        ricevuta (stessi campi del documento a schermo)
 * @param {{logo?:Buffer, oggi?:string}} o   logo = PNG del logo; oggi = «gg/mm/aaaa» per «Luogo e data»
 * @returns {Promise<Uint8Array>}
 */
async function creaPdf(r, o) {
  o = o || {};
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage(A4);
  const F = await pdf.embedFont(StandardFonts.Helvetica);
  const FB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const FI = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  pdf.setTitle('Ricevuta ' + String(r.numero || '').replace('/', '-'));
  pdf.setProducer('ASD Victor Volley');

  const asd = r.asd || {}, pag = r.pagatore || {}, atl = r.atleta || null;
  const annullata = r.stato === 'annullata';
  let y = A4[1] - M;   // bordo alto dell'elemento successivo

  /** Cella: sfondo, bordo e testo (una o più righe) a sinistra / al centro / a destra. */
  function cella(x, w, h, o2) {
    const yb = y - h;
    pagina.drawRectangle({ x, y: yb, width: w, height: h, color: o2.sfondo || BIANCO, borderColor: o2.bordo || BORDO, borderWidth: 0.6 });
    const font = o2.font || F, size = o2.size || 9, col = o2.colore || NERO, pad = 5;
    const ls = o2.righe || righe(font, size, o2.testo, w - 2 * pad);
    const lh = size * 1.25, blocco = ls.length * lh;
    let ty = yb + (h + blocco) / 2 - size * 0.95;
    ls.forEach((t) => {
      const tw = font.widthOfTextAtSize(t, size);
      const tx = o2.allinea === 'c' ? x + (w - tw) / 2 : o2.allinea === 'd' ? x + w - pad - tw : x + pad;
      pagina.drawText(t, { x: tx, y: ty, size, font, color: col });
      ty -= lh;
    });
  }
  /** Altezza che serve a un testo in una cella di larghezza w. */
  const altezza = (font, size, testo, w, min) => Math.max(min, righe(font, size, testo, w - 10).length * size * 1.25 + 8);

  /* ---- intestazione: logo a sinistra, titolo / ASD / sede a destra ---- */
  const wl = W * 0.25, wr = W - wl, hT = 28, hA = 26, hS = 24, hH = hT + hA + hS;
  pagina.drawRectangle({ x: M, y: y - hH, width: wl, height: hH, color: BIANCO, borderColor: BORDO, borderWidth: 0.6 });
  let logo = null;
  if (o.logo) { try { logo = await pdf.embedPng(o.logo); } catch (e) { logo = null; } }
  if (logo) pagina.drawImage(logo, { x: M + (wl - 74) / 2, y: y - hH + (hH - 74) / 2, width: 74, height: 74 });
  const xr = M + wl;
  cella(xr, wr, hT, { testo: 'RICEVUTA DI PAGAMENTO', sfondo: BLU, bordo: BLU, colore: BIANCO, font: FB, size: 16, allinea: 'c' });
  y -= hT;
  const aff = [asd.affiliazione, asd.codiceAffiliazione].filter(Boolean).join(' ');
  cella(xr, wr, hA, { testo: (asd.denominazione || 'ASD Victor Volley') + (asd.codiceFiscale ? ' — C.F. ' + asd.codiceFiscale : ''), font: FB, size: 12.5, allinea: 'c' });
  y -= hA;
  cella(xr, wr, hS, { testo: 'Sede legale: ' + (asd.sede || '') + ' | Affiliazione: ' + aff + ' | RASD: ' + (asd.rasd ? 'Sì' : 'No'), font: FB, size: 8, allinea: 'c' });
  y -= hS;

  /* ---- numero e data ---- */
  const hN = 26, w1 = W * 0.294, w2 = W * 0.235, w3 = W * 0.235, w4 = W - w1 - w2 - w3;
  cella(M, w1, hN, { testo: 'Numero ricevuta', sfondo: GRIGIO, font: FB, size: 9, allinea: 'd' });
  cella(M + w1, w2, hN, { testo: String(r.numero || ''), font: F, size: 14, allinea: 'c' });
  cella(M + w1 + w2, w3, hN, { testo: 'Data', sfondo: GRIGIO, font: FB, size: 8.5, allinea: 'd' });
  cella(M + w1 + w2 + w3, w4, hN, { testo: Doc.fmtDate(r.data), font: F, size: 14, allinea: 'c' });
  y -= hN;

  if (annullata) {
    const msg = 'Ricevuta annullata' + (r.dataAnnullamento ? ' il ' + Doc.fmtDate(r.dataAnnullamento) : '') + '.' +
      (r.motivoAnnullamento ? ' Motivo: ' + r.motivoAnnullamento + '.' : '') + ' Non ha validità come attestazione di pagamento.';
    const h = altezza(FB, 8.5, msg, W, 24);
    y -= 6;
    cella(M, W, h, { testo: msg, sfondo: hex('#FEF2F2'), bordo: hex('#FCA5A5'), colore: hex('#991B1B'), font: FB, size: 8.5 });
    y -= h + 2;
  }

  /* ---- bande e righe ---- */
  const wL = W * 0.294, wV = W - wL;
  function banda(t) { cella(M, W, 16, { testo: t, sfondo: BLU, bordo: BLU, colore: BIANCO, font: FB, size: 8.5 }); y -= 16; }
  function riga(label, valore, stile) {
    const st = stile || {};
    const size = st.size || 8.5, font = st.font || FB;
    const h = altezza(font, size, valore || ' ', wV, 19);
    cella(M, wL, h, { testo: label, sfondo: GRIGIO, font: FI, size: 8.5 });
    cella(M + wL, wV, h, { testo: valore || '', font, size });
    y -= h;
  }
  banda('RICEVUTA RILASCIATA AL PAGATORE');
  riga(pag.ruolo === 'Genitore / tutore' ? 'Genitore / tutore pagatore' : 'Pagatore', pag.nome, { size: 12 });
  riga('Codice fiscale', pag.cf); riga('Indirizzo pagatore', pag.indirizzo);
  banda('DATI DEL VERSAMENTO');
  if (atl) { riga('Atleta / beneficiario', atl.nome); riga('Codice fiscale atleta', atl.cf); }
  riga('Tipo incasso', r.tipoIncasso, { font: F, size: 10 });
  riga('Causale / periodo', r.causale, { font: F, size: 12 });
  riga('Modalità di pagamento', r.modalita, { font: F, size: 10 });
  if (r.riferimento) riga('Riferimento pagamento', r.riferimento, { font: F, size: 10 });
  if (atl) riga('Data nascita atleta', Doc.fmtDate(atl.dataNascita));

  /* ---- importo ---- */
  const hI = 40, wi = W * 0.64, lettere = Doc.inLettere(r.importo);
  pagina.drawRectangle({ x: M, y: y - hI, width: wi, height: hI, color: BLU, borderColor: BLU, borderWidth: 0.6 });
  pagina.drawText('IMPORTO RICEVUTO', { x: M + 5, y: y - (lettere ? 17 : 24), size: 14, font: FB, color: BIANCO });
  if (lettere) pagina.drawText('Euro ' + sicuro(FB, lettere), { x: M + 5, y: y - 31, size: 8.5, font: FB, color: BIANCO });
  const cifre = '€ ' + (Number(r.importo) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  cella(M + wi, W - wi, hI, { testo: cifre, sfondo: ROSA, bordo: ROSA, font: FB, size: 17, allinea: 'c' });
  y -= hI;

  /* ---- testi fissi ---- */
  function testo(t) { const h = altezza(FB, 8.5, t, W, 22); cella(M, W, h, { testo: t, font: FB, size: 8.5 }); y -= h; }
  if (r.bollo) testo(r.bollo);
  testo('La presente ricevuta attesta esclusivamente l’incasso indicato. La qualificazione fiscale dipende dalla natura effettiva del rapporto e dai requisiti dell’ASD e del soggetto versante.');
  testo('Per spese sportive potenzialmente detraibili, registrare un pagamento tracciabile e indicare chiaramente atleta, attività e periodo.');

  /* ---- luogo/data e firma ---- */
  const hF = 104, wf = W / 2;
  cella(M, wf, hF, { righe: [''], font: F });
  cella(M + wf, W - wf, hF, { righe: [''], font: F });
  const yb = y - hF;
  pagina.drawText('Luogo e data', { x: M + 6, y: yb + 30, size: 8.5, font: FB, color: NERO });
  const luogoData = sicuro(FB, (asd.luogo || '') + (asd.luogo ? ', ' : '') + (o.oggi || ''));
  pagina.drawText(luogoData, { x: M + 6, y: yb + 14, size: 9.5, font: FB, color: NERO });
  pagina.drawLine({ start: { x: M + 6, y: yb + 11 }, end: { x: M + 6 + Math.max(110, FB.widthOfTextAtSize(luogoData, 9.5)), y: yb + 11 }, thickness: 0.6, color: rgb(0.33, 0.33, 0.33) });
  pagina.drawText('Il Presidente / incaricato', { x: M + wf + 6, y: yb + 90, size: 8.5, font: FB, color: NERO });
  if (asd.presidente) pagina.drawText(sicuro(FB, asd.presidente), { x: M + wf + 6, y: yb + 77, size: 10, font: FB, color: NERO });
  pagina.drawText('Firma ____________________________', { x: M + wf + 6, y: yb + 12, size: 8.5, font: F, color: rgb(0.33, 0.33, 0.33) });
  if (/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(asd.firma || '')) {
    try {
      const img = await pdf.embedPng(Buffer.from(asd.firma.split(',')[1], 'base64'));
      const s = Math.min(150 / img.width, 38 / img.height);
      pagina.drawImage(img, { x: M + wf + 30, y: yb + 22, width: img.width * s, height: img.height * s });
    } catch (e) { /* firma illeggibile: il documento resta valido, con la riga per la firma a mano */ }
  }
  y = yb;

  /* ---- filigrana e timbro ---- */
  if (logo) pagina.drawImage(logo, { x: (A4[0] - 330) / 2, y: (A4[1] - 330) / 2 + 40, width: 330, height: 330, opacity: 0.08 });
  if (annullata) {
    pagina.drawText('ANNULLATA', { x: 110, y: A4[1] - 330, size: 70, font: FB, color: hex('#DC2626'), opacity: 0.3, rotate: degrees(18) });
  }
  return pdf.save();
}

module.exports = { creaPdf, righe, sicuro };
