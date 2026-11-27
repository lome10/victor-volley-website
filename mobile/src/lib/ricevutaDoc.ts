// Documento «Ricevuta di pagamento» (A4), porting fedele di js/ricevuta-doc.js del sito: stesso HTML e stesso CSS,
// che l'app trasforma in PDF con expo-print. Lavora solo sulla copia dei dati salvata nella ricevuta.

export type Ricevuta = {
  id: string;
  numero?: string;
  data?: string;
  progressivo?: number;
  importo?: number | string | null;
  stato?: string;
  causale?: string;
  tipoIncasso?: string;
  modalita?: string;
  riferimento?: string;
  bollo?: string;
  dataAnnullamento?: string;
  motivoAnnullamento?: string;
  asd?: {
    denominazione?: string;
    codiceFiscale?: string;
    sede?: string;
    affiliazione?: string;
    codiceAffiliazione?: string;
    rasd?: boolean;
    luogo?: string;
    presidente?: string;
    firma?: string;
  };
  pagatore?: { nome?: string; cf?: string; indirizzo?: string; ruolo?: string };
  atleta?: { nome?: string; cf?: string; dataNascita?: string } | null;
};

/** Indirizzo da cui il documento prende il logo (come location.origin sul sito). */
export const ORIGINE_LOGO = 'https://www.victorvolley.it';

function h(s: unknown) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 1234.5 -> "1.234,50" (toLocaleString('it-IT') scritto a mano: Hermes non garantisce i dati delle lingue). */
export function num(n: unknown) {
  const v = Number(n) || 0;
  const [intera, dec] = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + intera.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}
export const eur = (n: unknown) => num(n) + ' €';

export function fmtDate(iso?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

// ---- importo in lettere (italiano): «centocinquanta/00» ----
const UNITA = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici',
  'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const DECINE = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

function sotto100(n: number) {
  if (n < 20) return UNITA[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  let base = DECINE[d];
  if (u === 1 || u === 8) base = base.slice(0, -1); // ventuno, ventotto, trentuno…
  return u ? base + UNITA[u] : base;
}
function sotto1000(n: number) {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = '';
  if (c) s = c === 1 ? 'cento' : UNITA[c] + 'cento';
  if (r) {
    if (c && (r === 8 || (r >= 80 && r < 90))) s = s.slice(0, -1); // centotto, centottanta
    s += sotto100(r);
  }
  return s;
}
/** Intero da 0 a 999.999.999 in lettere. «tre» prende l'accento solo come ultima parte di un composto (ventitré). */
function interoInLettere(n: number) {
  if (n === 0) return 'zero';
  const milioni = Math.floor(n / 1000000);
  const migliaia = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;
  const out: string[] = [];
  if (milioni) out.push(milioni === 1 ? 'un milione' : sotto1000(milioni) + ' milioni');
  let parte = '';
  if (migliaia) parte += migliaia === 1 ? 'mille' : sotto1000(migliaia) + 'mila';
  if (resto) parte += sotto1000(resto);
  if (parte) out.push(parte);
  return out.join(' ').replace(/(^|\s)(\S+)tre$/, (_m, sp: string, testa: string) => sp + testa + 'tré');
}
/** 150 -> «centocinquanta/00», 12,5 -> «dodici/50». Fuori dall'intervallo gestito ritorna ''. */
export function inLettere(importo: unknown) {
  if (importo === null || importo === undefined || importo === '') return '';
  const cent = Math.round(Number(importo) * 100);
  if (!isFinite(cent) || cent < 0 || cent >= 100000000000) return '';
  return interoInLettere(Math.floor(cent / 100)) + '/' + ('0' + (cent % 100)).slice(-2);
}

const BLU = '#4C95D9';
const ROSA = '#E8326A';
const GRIGIO = '#F3F6F8';
const BORDO = '#CFD6DD';

const CSS =
  '@page{size:A4;margin:10mm}' +
  '*{box-sizing:border-box}' +
  'body{font-family:Calibri,"Segoe UI",Arial,Helvetica,sans-serif;color:#000;margin:0;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
  '.doc{position:relative;max-width:780px;margin:0 auto}' +
  '.wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:440px;height:440px;object-fit:contain;opacity:.08;z-index:3;pointer-events:none}' +
  'table{width:100%;border-collapse:collapse;table-layout:fixed;position:relative;z-index:1}' +
  'td{border:1px solid ' + BORDO + ';padding:3px 6px;vertical-align:middle}' +
  '.logo{width:25%;text-align:center;background:#fff;padding:8px}' +
  '.logo img{width:96px;height:96px;object-fit:contain}' +
  '.tit{background:' + BLU + ';color:#fff;text-align:center;font-weight:700;font-size:21px;height:36px;border-color:' + BLU + '}' +
  '.asd{text-align:center;font-weight:700;font-size:17px;height:34px;border-top:0;border-bottom:0}' +
  '.sede{text-align:center;font-weight:700;font-size:11px;height:30px;border-top:0}' +
  '.lab{background:' + GRIGIO + ';font-style:italic;font-weight:700;font-size:11px;width:29.4%}' +
  '.lab.r{text-align:right;font-style:normal;font-size:12px}' +
  '.big{text-align:center;font-size:20px;height:30px}' +
  '.band{background:' + BLU + ';color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;height:20px;border-color:' + BLU + '}' +
  '.v{font-weight:700;font-size:11px}' +
  '.v.n{font-weight:400;font-size:13px}' +
  '.v.xl{font-size:17px}' +
  '.v.name{font-size:16px}' +
  '.imp-l{background:' + BLU + ';color:#fff;font-weight:700;font-size:20px;height:44px;border-color:' + BLU + ';width:64%}' +
  '.imp-r{background:' + ROSA + ';color:#000;font-weight:700;font-size:23px;text-align:center;border-color:' + ROSA + '}' +
  '.imp-let{font-size:12px;font-weight:600;margin-top:3px;letter-spacing:.01em;opacity:.95}' +
  '.txt{font-weight:700;font-size:12px;padding:8px 6px;line-height:1.45}' +
  '.firma{height:118px;vertical-align:bottom;font-weight:700;font-size:11px;width:50%}' +
  '.firma .sigimg{display:block;height:52px;max-width:200px;margin:0 0 -14px 34px;position:relative;z-index:4}' +
  '.firma .ln{display:block;font-weight:400;color:#555;margin-top:4px}' +
  '.firma .ln.fill{color:#000;font-weight:700;font-size:12px;border-bottom:1px solid #555;max-width:230px;padding-bottom:1px}' +
  '.firma .nome{display:block;font-size:13px;margin-top:2px}' +
  '.annullata{background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;border-radius:6px;padding:8px 12px;margin:8px 0;font-size:12px;position:relative;z-index:1}' +
  '.stamp{position:absolute;top:240px;left:50%;transform:translateX(-50%) rotate(-18deg);border:6px solid #DC2626;color:#DC2626;z-index:2;' +
  'font-weight:800;font-size:68px;letter-spacing:.1em;padding:4px 26px;opacity:.3;pointer-events:none}';

function riga(label: string, valore: unknown, cls?: string) {
  return '<tr><td class="lab">' + h(label) + '</td><td class="v' + (cls ? ' ' + cls : '') + '">' + h(valore) + '</td></tr>';
}

/** Titolo del documento e nome del file PDF: "Ricevuta 12-2026 - Mario Rossi". */
export function titoloRicevuta(r: Ricevuta) {
  const chi = ((r.atleta && r.atleta.nome) || (r.pagatore && r.pagatore.nome) || '')
    .replace(/[^A-Za-z0-9À-ÿ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return 'Ricevuta ' + String(r.numero || '').replace('/', '-') + (chi ? ' - ' + chi : '');
}

export function htmlRicevuta(r: Ricevuta, adesso: Date, origine = ORIGINE_LOGO) {
  const asd = r.asd || {};
  const pag = r.pagatore || {};
  const atl = r.atleta || null;
  const annullata = r.stato === 'annullata';
  const aff = [asd.affiliazione, asd.codiceAffiliazione].filter(Boolean).join(' ');
  const sede = 'Sede legale: ' + (asd.sede || '') + ' | Affiliazione: ' + aff + ' | RASD: ' + (asd.rasd ? 'Sì' : 'No');
  const daGenitore = pag.ruolo === 'Genitore / tutore';
  // firma del presidente: solo un'immagine PNG salvata nella ricevuta (data URL), mai altri schemi
  const firmaImg = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(asd.firma || '') ? '<img class="sigimg" src="' + asd.firma + '" alt="">' : '';
  // luogo e data della firma: il giorno in cui il PDF viene generato
  const oggi = ('0' + adesso.getDate()).slice(-2) + '/' + ('0' + (adesso.getMonth() + 1)).slice(-2) + '/' + adesso.getFullYear();
  const lettere = inLettere(r.importo);

  return (
    '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>' + h(titoloRicevuta(r)) + '</title>' +
    '<style>' + CSS + '</style></head><body><div class="doc">' +
    '<img class="wm" src="' + h(origine) + '/assets/logo.png" alt="">' +
    (annullata ? '<div class="stamp">ANNULLATA</div>' : '') +
    '<table><tr><td class="logo" rowspan="3"><img src="' + h(origine) + '/assets/logo.png" alt=""></td>' +
    '<td class="tit">RICEVUTA DI PAGAMENTO</td></tr>' +
    '<tr><td class="asd">' + h(asd.denominazione || 'ASD Victor Volley') + (asd.codiceFiscale ? ' — C.F. ' + h(asd.codiceFiscale) : '') + '</td></tr>' +
    '<tr><td class="sede">' + h(sede) + '</td></tr></table>' +
    '<table><tr><td class="lab r" style="width:29.4%">Numero ricevuta</td><td class="big" style="width:23.5%">' + h(r.numero) + '</td>' +
    '<td class="lab" style="width:23.5%;text-align:right">Data</td><td class="big" style="width:23.6%">' + h(fmtDate(r.data)) + '</td></tr></table>' +
    (annullata
      ? '<div class="annullata"><strong>Ricevuta annullata' + (r.dataAnnullamento ? ' il ' + h(fmtDate(r.dataAnnullamento)) : '') + '.</strong>' +
        (r.motivoAnnullamento ? ' Motivo: ' + h(r.motivoAnnullamento) + '.' : '') + ' Non ha validità come attestazione di pagamento.</div>'
      : '') +
    '<table><tr><td class="band" colspan="2">RICEVUTA RILASCIATA AL PAGATORE</td></tr>' +
    riga(daGenitore ? 'Genitore / tutore pagatore' : 'Pagatore', pag.nome, 'name') +
    riga('Codice fiscale', pag.cf) + riga('Indirizzo pagatore', pag.indirizzo) +
    '<tr><td class="band" colspan="2">DATI DEL VERSAMENTO</td></tr>' +
    (atl ? riga('Atleta / beneficiario', atl.nome) + riga('Codice fiscale atleta', atl.cf) : '') +
    riga('Tipo incasso', r.tipoIncasso, 'n') + riga('Causale / periodo', r.causale, 'n xl') +
    riga('Modalità di pagamento', r.modalita, 'n') + (r.riferimento ? riga('Riferimento pagamento', r.riferimento, 'n') : '') +
    (atl ? riga('Data nascita atleta', fmtDate(atl.dataNascita)) : '') + '</table>' +
    '<table><tr><td class="imp-l">IMPORTO RICEVUTO' + (lettere ? '<div class="imp-let">Euro ' + h(lettere) + '</div>' : '') + '</td><td class="imp-r">€ ' + h(num(r.importo)) + '</td></tr></table>' +
    '<table>' +
    (r.bollo ? '<tr><td class="txt">' + h(r.bollo) + '</td></tr>' : '') +
    '<tr><td class="txt">La presente ricevuta attesta esclusivamente l’incasso indicato. La qualificazione fiscale dipende dalla natura effettiva del rapporto e dai requisiti dell’ASD e del soggetto versante.</td></tr>' +
    '<tr><td class="txt">Per spese sportive potenzialmente detraibili, registrare un pagamento tracciabile e indicare chiaramente atleta, attività e periodo.</td></tr>' +
    '</table>' +
    '<table><tr><td class="firma">Luogo e data<span class="ln fill">' + h((asd.luogo || '') + (asd.luogo ? ', ' : '') + oggi) + '</span></td>' +
    '<td class="firma">Il Presidente / incaricato' + (asd.presidente ? '<span class="nome">' + h(asd.presidente) + '</span>' : '') + firmaImg +
    '<span class="ln">Firma ____________________________</span></td></tr></table>' +
    '</div></body></html>'
  );
}
