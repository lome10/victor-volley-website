// Scheda Documenti dell'area atleti (js/atleta.js): stato delle rate, riepilogo quote in PDF (_exportRatePdf),
// ordine delle ricevute. Funzioni pure; il PDF lo fa expo-print dall'HTML.
import { dataIso, nomeCompleto, totaliRate, type Atleta, type Rata } from '~/lib/atleti';
import { ORIGINE_LOGO, eur, fmtDate, type Ricevuta } from '~/lib/ricevutaDoc';

export type StatoRata = { k: 'pagata' | 'scaduta' | 'ritardo' | 'da-pagare'; testo: string };

/** Pagata; scaduta (validita' finita e non pagata); in ritardo (data di pagamento passata); altrimenti da pagare. */
export function statoRata(r: Rata, oggi: string): StatoRata {
  if (r.pagata) return { k: 'pagata', testo: 'Pagata' };
  if (r.scadenza && r.scadenza < oggi) return { k: 'scaduta', testo: 'Scaduta' };
  if (r.scadenzaPagamento && r.scadenzaPagamento < oggi) return { k: 'ritardo', testo: 'In ritardo' };
  return { k: 'da-pagare', testo: 'Da pagare' };
}

/** Sottotitolo della card "Quote e Pagamenti". */
export function sottoQuote(rate: Rata[]) {
  const t = totaliRate(rate);
  return t.totale > 0 ? 'Saldato: €' + t.saldato.toFixed(2) + '  ·  Dovuto: €' + t.dovuto.toFixed(2) : 'Stagione corrente';
}

/** Badge del certificato medico nella scheda Documenti (_renderCert). */
export function badgeCertificato(scadenza: string | undefined, adesso: Date): { testo: string; tipo: 'green' | 'orange' | 'red' } | null {
  if (!scadenza) return null;
  const [a, m, g] = scadenza.split('-').map(Number);
  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const giorni = Math.round((new Date(a, m - 1, g).getTime() - oggi.getTime()) / 86400000);
  if (giorni < 0) return { testo: 'Scaduto', tipo: 'red' };
  if (giorni <= 30) return { testo: 'In scadenza', tipo: 'orange' };
  return { testo: 'Valido', tipo: 'green' };
}

/** Ricevute dalla piu' recente; a parita' di data, numero progressivo piu' alto prima. */
export function ordinaRicevute(lista: Ricevuta[]) {
  return lista.slice().sort((x, y) => (y.data || '').localeCompare(x.data || '') || (y.progressivo || 0) - (x.progressivo || 0));
}

const h = (s: unknown) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const CSS_RIEPILOGO =
  '@page{size:A4;margin:16mm 14mm}' +
  '*{box-sizing:border-box}' +
  'body{font-family:"Manrope",Arial,Helvetica,sans-serif;color:#1E293B;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12.5px}' +
  '.doc{max-width:800px;margin:0 auto}' +
  'h1{font-family:"Barlow",Arial,sans-serif;margin:0}' +
  '.letterhead{display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#0F172A 0%,#1E3A5F 100%);color:#fff;padding:18px 22px;border-radius:10px;margin-bottom:22px}' +
  '.letterhead-brand{display:flex;align-items:center;gap:12px}' +
  '.letterhead-logo{width:42px;height:42px;object-fit:contain;border-radius:8px;background:#fff;padding:3px}' +
  '.letterhead-club{font-family:"Barlow",sans-serif;font-weight:700;font-size:17px}' +
  '.letterhead-sub{font-size:10.5px;color:rgba(255,255,255,.68);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}' +
  '.letterhead-meta{text-align:right;font-size:10.5px;color:rgba(255,255,255,.85)}' +
  '.letterhead-doctype{font-family:"Barlow",sans-serif;font-weight:700;font-size:11.5px;color:#fff;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}' +
  '.letterhead-meta strong{color:#fff;margin-left:4px}' +
  '.titleblock{margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #E2E8F0}' +
  '.titleblock h1{font-size:22px;color:#0F172A;font-weight:700}' +
  '.tag{display:inline-block;margin-top:8px;font-size:10.5px;background:#F1F5F9;color:#475569;border-radius:999px;padding:3px 11px;font-weight:600}' +
  '.kpis{display:flex;gap:10px;margin-bottom:20px}' +
  '.kpi{flex:1;background:#F8FAFC;border:1px solid #94A3B8;border-radius:8px;padding:10px 12px}' +
  '.kpi-label{font-size:9.5px;color:#64748B;text-transform:uppercase;letter-spacing:.05em;font-weight:700}' +
  '.kpi-value{font-size:17px;font-weight:700;color:#0F172A;margin-top:3px;font-family:"Barlow",sans-serif}' +
  '.kpi--ok{border-color:#10B981}.kpi--ok .kpi-value{color:#059669}' +
  '.kpi--due{border-color:#F59E0B}.kpi--due .kpi-value{color:#B45309}' +
  'table{width:100%;border-collapse:collapse;font-size:11.5px}' +
  'thead{display:table-header-group}tr{page-break-inside:avoid}' +
  'th{background:#0F172A;color:#fff;font-family:"Barlow",sans-serif;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:7px 9px}' +
  'th.num,td.num{text-align:right}' +
  'td{padding:7px 9px;border-bottom:1px solid #E2E8F0}' +
  'tbody tr:nth-child(even){background:#F8FAFC}' +
  'tr.total-row td{border-top:2px solid #0F172A;border-bottom:none;font-weight:700;background:#F1F5F9}' +
  '.badge{display:inline-block;font-size:9.5px;font-weight:700;padding:2.5px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.02em}' +
  '.badge--ok{background:#ECFDF5;color:#059669}.badge--red{background:#FEF2F2;color:#DC2626}.badge--warn{background:#FFFBEB;color:#B45309}' +
  '.note{margin-top:16px;font-size:10.5px;color:#64748B}' +
  'footer{margin-top:18px;padding-top:10px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:9.5px;color:#94A3B8}';

/** Riepilogo quote (informativo, non e' una ricevuta): stesso documento del sito. */
export function htmlRiepilogoQuote(a: Atleta, rate: Rata[], adesso: Date, origine = ORIGINE_LOGO) {
  const ordinate = rate
    .slice()
    .sort((x, y) => (x.scadenzaPagamento || x.scadenza || '9999-12-31').localeCompare(y.scadenzaPagamento || y.scadenza || '9999-12-31'));
  const t = totaliRate(rate);
  const oggiIso = dataIso(adesso);
  const oggi = ('0' + adesso.getDate()).slice(-2) + ' ' + MESI[adesso.getMonth()] + ' ' + adesso.getFullYear();
  const nome = nomeCompleto(a);
  const stato = (r: Rata) => {
    if (r.pagata) return '<span class="badge badge--ok">Pagata' + (r.dataPagamento ? ' il ' + h(fmtDate(r.dataPagamento)) : '') + '</span>';
    const s = statoRata(r, oggiIso);
    return '<span class="badge badge--' + (s.k === 'da-pagare' ? 'warn' : 'red') + '">' + s.testo + '</span>';
  };
  return (
    '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Riepilogo quote — ' + h(nome) + ' — Victor Volley</title>' +
    '<link rel="stylesheet" href="' + h(origine) + '/css/fonts.css"><style>' + CSS_RIEPILOGO + '</style></head><body><div class="doc">' +
    '<header class="letterhead">' +
    '<div class="letterhead-brand"><img class="letterhead-logo" src="' + h(origine) + '/assets/logo.png" alt="">' +
    '<div><div class="letterhead-club">Victor Volley</div><div class="letterhead-sub">Area Atleti</div></div></div>' +
    '<div class="letterhead-meta"><div class="letterhead-doctype">Riepilogo quote</div><div>Generato il<strong>' + oggi + '</strong></div></div>' +
    '</header>' +
    '<div class="titleblock"><h1>' + h(nome) + '</h1>' + (a.categoria ? '<span class="tag">' + h(a.categoria) + '</span>' : '') + '</div>' +
    '<div class="kpis">' +
    '<div class="kpi"><div class="kpi-label">Totale quote</div><div class="kpi-value">' + eur(t.totale) + '</div></div>' +
    '<div class="kpi kpi--ok"><div class="kpi-label">Versato</div><div class="kpi-value">' + eur(t.saldato) + '</div></div>' +
    '<div class="kpi kpi--due"><div class="kpi-label">Ancora da versare</div><div class="kpi-value">' + eur(t.dovuto) + '</div></div>' +
    '</div>' +
    '<table><thead><tr><th>Descrizione</th><th>Pagamento entro</th><th>Valida fino al</th><th class="num">Importo</th><th>Stato</th></tr></thead><tbody>' +
    ordinate
      .map(
        (r) =>
          '<tr><td>' + h(r.descrizione || 'Quota') + '</td><td>' + (r.scadenzaPagamento ? h(fmtDate(r.scadenzaPagamento)) : '—') + '</td>' +
          '<td>' + (r.scadenza ? h(fmtDate(r.scadenza)) : '—') + '</td>' +
          '<td class="num">' + eur(r.importo) + '</td><td>' + stato(r) + '</td></tr>',
      )
      .join('') +
    '<tr class="total-row"><td colspan="3">Totale</td><td class="num">' + eur(t.totale) + '</td><td></td></tr>' +
    '</tbody></table>' +
    '<p class="note">Riepilogo informativo aggiornato alla data di generazione. Non è una ricevuta: le ricevute dei pagamenti si scaricano dalla scheda «Ricevute di pagamento».</p>' +
    '<footer><span>Victor Volley &middot; Area Atleti</span><span>Documento generato automaticamente</span></footer>' +
    '</div></body></html>'
  );
}

/** Nome del file PDF del riepilogo: "Riepilogo quote - Sara Prova.pdf". */
export function nomeFileRiepilogo(a: Atleta) {
  return 'Riepilogo quote - ' + nomeCompleto(a).replace(/[^A-Za-z0-9À-ÿ ]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
}
