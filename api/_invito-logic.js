/**
 * Invito a scegliere la password (account creato da un dirigente). Funzioni pure, collaudate da
 * scripts/check-invito.js. Il link contiene un codice casuale di 256 bit nel frammento (#t=...), che il
 * browser non manda al server né nell'intestazione Referer; su Firestore (inviti/{hash}) resta solo l'impronta.
 */
const crypto = require('crypto');
const E = require('./_email-layout');

const nuovoCodice = () => crypto.randomBytes(32).toString('base64url');
const impronta = (codice) => crypto.createHash('sha256').update(String(codice)).digest('hex');
/** Un codice valido è base64url di 32 byte (43 caratteri): scarta subito il resto senza interrogare Firestore. */
const codiceValido = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c);

function linkInvito(siteUrl, codice) {
  return siteUrl.replace(/\/$/, '') + '/imposta-password#t=' + codice;
}

/** g = { nome (genitore), email, atletaNome }; link = indirizzo completo. */
function componiInvito(g, link, siteUrl) {
  const area = siteUrl.replace(/\/$/, '') + '/atleta';
  const saluto = g.nome ? 'Ciao ' + g.nome + ',' : 'Buongiorno,';
  const per = g.atletaNome ? ' di ' + g.atletaNome : '';
  const subject = 'Victor Volley — il tuo account per l’Area Atleti';
  const text = [saluto, '',
    'è stato creato il tuo account per l’area atleti della ASD Victor Volley, dove puoi vedere impegni, allenamenti, avvisi, quote e ricevute' + per + '.',
    '', 'Per iniziare scegli la tua password da questo link:', link, '',
    'Poi accederai da ' + area + ' con questa email (' + g.email + ') e la password scelta.',
    '', 'Il link si usa una sola volta e non ha scadenza: non inoltrarlo a nessuno. Se non te lo aspettavi, ignora questo messaggio o scrivi a victorvolley@libero.it.',
    '', 'ASD Victor Volley'].join('\n');
  const h = E.h;
  const corpo =
    '<p style="margin:0 0 14px">' + h(saluto) + '</p>' +
    '<p style="margin:0 0 14px">è stato creato il tuo account per l’<strong>area atleti</strong> della ASD Victor Volley: qui trovi impegni, allenamenti, avvisi, quote e ricevute' + h(per) + '.</p>' +
    '<p style="margin:0 0 4px">Per iniziare, scegli la tua password:</p>' +
    E.pulsante('Scegli la password', link) +
    '<p style="margin:14px 0 0;font-size:13px;color:#64748b;text-align:center">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><span style="word-break:break-all;color:' + E.AZZURRO + '">' + h(link) + '</span></p>' +
    E.riquadro('Poi accederai da <a href="' + h(area) + '" style="color:' + E.AZZURRO + ';font-weight:bold;text-decoration:none">' + h(area.replace(/^https?:\/\//, '')) + '</a> con questa email (<strong>' + h(g.email) + '</strong>) e la password che avrai scelto.') +
    '<p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#64748b">Il link si usa una sola volta e non ha scadenza: non inoltrarlo a nessuno. Se non te lo aspettavi, ignora questo messaggio o scrivi a <a href="mailto:victorvolley@libero.it" style="color:' + E.AZZURRO + '">victorvolley@libero.it</a>.</p>';
  const html = E.cornice({ anteprima: 'Scegli la tua password per entrare nell’area atleti.', titolo: 'Benvenuto in Victor Volley', corpo, site: siteUrl });
  return { subject, text, html };
}

module.exports = { nuovoCodice, impronta, codiceValido, linkInvito, componiInvito };
