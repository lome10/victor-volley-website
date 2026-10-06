/**
 * Invito a scegliere la password (account creato da un dirigente). Funzioni pure, collaudate da
 * scripts/check-invito.js. Il link contiene un codice casuale di 256 bit nel frammento (#t=...), che il
 * browser non manda al server né nell'intestazione Referer; su Firestore (inviti/{hash}) resta solo l'impronta.
 */
const crypto = require('crypto');

const nuovoCodice = () => crypto.randomBytes(32).toString('base64url');
const impronta = (codice) => crypto.createHash('sha256').update(String(codice)).digest('hex');
/** Un codice valido è base64url di 32 byte (43 caratteri): scarta subito il resto senza interrogare Firestore. */
const codiceValido = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c);

function h(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#0f172a;margin:0 0 12px">Victor Volley — il tuo account</h2>' +
    '<p>' + h(saluto) + '</p>' +
    '<p>è stato creato il tuo account per l’area atleti della ASD Victor Volley, dove puoi vedere impegni, allenamenti, avvisi, quote e ricevute' + h(per) + '.</p>' +
    '<p>Per iniziare scegli la tua password:</p>' +
    '<p><a href="' + h(link) + '" style="display:inline-block;background:#0088ff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Scegli la password</a></p>' +
    '<p style="font-size:13px">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><span style="word-break:break-all">' + h(link) + '</span></p>' +
    '<p>Poi accederai da <a href="' + h(area) + '">' + h(area.replace(/^https?:\/\//, '')) + '</a> con questa email (' + h(g.email) + ') e la password scelta.</p>' +
    '<p style="font-size:12px;color:#64748b">Il link si usa una sola volta e non ha scadenza: non inoltrarlo a nessuno. Se non te lo aspettavi, ignora questo messaggio o scrivi a <a href="mailto:victorvolley@libero.it">victorvolley@libero.it</a>.</p>' +
    '<p style="font-size:12px;color:#64748b">ASD Victor Volley</p></div>';
  return { subject, text, html };
}

module.exports = { nuovoCodice, impronta, codiceValido, linkInvito, componiInvito };
