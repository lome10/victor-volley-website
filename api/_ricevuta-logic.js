/**
 * Email con la ricevuta in allegato: chi la riceve e che testo ha. Funzioni pure, collaudate da
 * scripts/check-ricevuta-pdf.js. Il PDF lo costruisce api/_ricevuta-pdf.js.
 */
const E = require('./_email-layout');
const L = require('./_promemoria-logic');

/** Genitori collegati all'atleta con email vera; se non ce ne sono, l'accesso dell'atleta stesso (adulto). */
function destinatariRicevuta(atleta) {
  const acc = Array.isArray(atleta && atleta.accessi) ? atleta.accessi : [];
  const buoni = (ruolo) => acc.filter((x) => x && x.ruolo === ruolo && L.emailValida(x.email));
  const scelti = buoni('genitore').length ? buoni('genitore') : buoni('atleta');
  const visti = new Set();
  return scelti.map((x) => ({ email: String(x.email).trim().toLowerCase(), nome: x.nome || '' }))
    .filter((d) => (visti.has(d.email) ? false : (visti.add(d.email), true)));
}

const eur = (n) => (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const data = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };

/** r = ricevuta; dest = { nome }; siteUrl = https://www.victorvolley.it */
function componiEmailRicevuta(r, dest, siteUrl) {
  const h = E.h;
  const saluto = dest && dest.nome ? 'Ciao ' + dest.nome + ',' : 'Buongiorno,';
  const chi = r.atleta && r.atleta.nome ? ' per ' + r.atleta.nome : '';
  const area = siteUrl.replace(/\/$/, '') + '/atleta';
  const subject = 'Victor Volley — ricevuta n. ' + r.numero;
  const righe = [['Ricevuta n.', r.numero], ['Data', data(r.data)], ['Importo', '€ ' + eur(r.importo)], ['Causale', r.causale]]
    .concat(r.atleta && r.atleta.nome ? [['Atleta', r.atleta.nome]] : []);
  const text = [saluto, '', 'in allegato trovi la ricevuta di pagamento n. ' + r.numero + ' del ' + data(r.data) + ', di € ' + eur(r.importo) + chi + '.', '']
    .concat(righe.map((x) => x[0] + ': ' + x[1]))
    .concat(['', 'La ricevuta resta sempre disponibile anche nell’area atleti: ' + area,
      '', 'Per qualsiasi dubbio scrivi a victorvolley@libero.it.', '', 'ASD Victor Volley']).join('\n');
  const tabella = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;border:1px solid #cfd6dd;border-radius:8px;overflow:hidden">' +
    righe.map((x, i) => '<tr><td width="34%" style="padding:10px 14px;background:#f3f6f8;font-family:' + E.FONT + ';font-size:13px;font-weight:bold;color:#33475b;border-top:' + (i ? '1px solid #cfd6dd' : '0') + '">' + h(x[0]) + '</td>' +
      '<td style="padding:10px 14px;font-family:' + E.FONT + ';font-size:' + (x[0] === 'Importo' ? '18' : '14') + 'px;' + (x[0] === 'Importo' ? 'font-weight:bold;color:' + E.BLU + ';' : 'color:#1e293b;') + 'border-top:' + (i ? '1px solid #cfd6dd' : '0') + '">' + h(x[1]) + '</td></tr>').join('') +
    '</table>';
  const corpo =
    '<p style="margin:0 0 14px">' + h(saluto) + '</p>' +
    '<p style="margin:0 0 6px">in allegato trovi la <strong>ricevuta di pagamento</strong>' + h(chi) + ':</p>' +
    tabella +
    E.pulsante('Apri l’area atleti', area) +
    E.riquadro('Il PDF è in allegato a questo messaggio e resta sempre disponibile anche nell’area atleti. Per qualsiasi dubbio scrivi a <a href="mailto:victorvolley@libero.it" style="color:' + E.AZZURRO + '">victorvolley@libero.it</a>.');
  const html = E.cornice({ anteprima: 'Ricevuta n. ' + r.numero + ' di € ' + eur(r.importo) + ' in allegato.', titolo: 'La tua ricevuta', corpo, site: siteUrl });
  return { subject, text, html };
}

module.exports = { destinatariRicevuta, componiEmailRicevuta };
