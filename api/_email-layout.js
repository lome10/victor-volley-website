/**
 * Veste grafica comune delle email della società (invito, promemoria). Solo tabelle e stili in linea, come
 * richiedono Gmail, Outlook e le app dei telefoni: niente CSS esterno, niente font web (Arial di riserva).
 * Colori del sito: blu notte #053063, azzurro #008CFD, magenta #CB2168. Il logo è servito dal sito stesso:
 * dove l'app blocca le immagini restano il titolo e il testo alternativo.
 * Tutto ciò che arriva da fuori (nomi, testi) va passato già escapato con h().
 */
const BLU = '#053063', AZZURRO = '#008CFD', MAGENTA = '#CB2168';

function h(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const FONT = "Arial,Helvetica,sans-serif";

/** Pulsante «a prova di client»: link con sfondo pieno e margini interni. */
function pulsante(testo, link) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 8px"><tr>' +
    '<td align="center" bgcolor="' + AZZURRO + '" style="border-radius:8px">' +
    '<a href="' + h(link) + '" style="display:inline-block;padding:15px 34px;font-family:' + FONT + ';font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">' +
    h(testo) + '</a></td></tr></table>';
}

/** Riquadro di testo secondario (note, avvertenze). `htmlInterno` è già escapato. */
function riquadro(htmlInterno) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr>' +
    '<td style="background:#eef5fd;border-left:4px solid ' + AZZURRO + ';border-radius:6px;padding:14px 16px;font-family:' + FONT + ';font-size:14px;line-height:1.55;color:#33475b">' +
    htmlInterno + '</td></tr></table>';
}

/**
 * @param {{anteprima:string, titolo:string, corpo:string, site:string}} o
 *   anteprima = riga che l'app mostra accanto all'oggetto; corpo = HTML già escapato; site = https://www.victorvolley.it
 */
function cornice({ anteprima, titolo, corpo, site }) {
  const base = site.replace(/\/$/, '');
  return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><title>' + h(titolo) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#e9eef5">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + h(anteprima) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e9eef5"><tr><td align="center" style="padding:24px 12px">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(5,48,99,0.14)">' +
        // intestazione blu con logo
        '<tr><td align="center" bgcolor="' + BLU + '" style="background:' + BLU + ';background-image:linear-gradient(160deg,#0a3f80 0%,' + BLU + ' 55%,#031d3f 100%);padding:30px 24px 24px">' +
          '<img src="' + h(base + '/assets/logo.png') + '" width="92" alt="Victor Volley" style="display:block;border:0;width:92px;height:auto;margin:0 auto 14px">' +
          '<div style="font-family:' + FONT + ';font-size:13px;font-weight:bold;letter-spacing:3px;color:#7cc4ff;text-transform:uppercase">ASD Victor Volley</div>' +
        '</td></tr>' +
        // filetto azzurro-magenta
        '<tr><td height="5" style="height:5px;line-height:5px;font-size:0;background:' + MAGENTA + ';background-image:linear-gradient(90deg,' + AZZURRO + ',' + MAGENTA + ')">&nbsp;</td></tr>' +
        // contenuto
        '<tr><td style="padding:32px 34px 30px;font-family:' + FONT + ';font-size:16px;line-height:1.6;color:#2b3a4b">' +
          '<h1 style="margin:0 0 16px;font-family:' + FONT + ';font-size:26px;line-height:1.25;color:' + BLU + '">' + h(titolo) + '</h1>' +
          corpo +
        '</td></tr>' +
        // piè di pagina
        '<tr><td align="center" bgcolor="#f3f6fa" style="background:#f3f6fa;padding:20px 24px;font-family:' + FONT + ';font-size:12px;line-height:1.6;color:#64748b">' +
          '<strong style="color:' + BLU + '">ASD Victor Volley</strong><br>' +
          '<a href="' + h(base) + '" style="color:' + AZZURRO + ';text-decoration:none">' + h(base.replace(/^https?:\/\//, '')) + '</a>' +
          ' &nbsp;·&nbsp; <a href="mailto:victorvolley@libero.it" style="color:' + AZZURRO + ';text-decoration:none">victorvolley@libero.it</a>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr></table></body></html>';
}

module.exports = { h, cornice, pulsante, riquadro, BLU, AZZURRO, MAGENTA, FONT };
