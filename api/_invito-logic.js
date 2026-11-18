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

/** Giorni di validità di un invito dal momento dell'invio (creatoIl su inviti/{impronta}). */
const SCADENZA_GIORNI = 7;
/** Ore di validità del link di «Password dimenticata?» (tipo 'reset' su inviti/{impronta}): molto meno di un invito. */
const RESET_ORE = 2;
/** Vero se l'invito è scaduto. Senza una data valida (documenti vecchi o rovinati) per prudenza è scaduto.
 *  `ore` (facoltativo) sostituisce i 7 giorni: i link di reset passano RESET_ORE. */
function scaduto(creatoIl, adesso, ore) {
  const t = Date.parse(creatoIl);
  if (!isFinite(t)) return true;
  const durata = ore ? ore * 3600 * 1000 : SCADENZA_GIORNI * 24 * 3600 * 1000;
  return (adesso === undefined ? Date.now() : adesso) - t > durata;
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
    '', 'Il link si usa una sola volta e vale ' + SCADENZA_GIORNI + ' giorni: non inoltrarlo a nessuno. Se scade, chiedi alla società di mandartene uno nuovo. Se non te lo aspettavi, ignora questo messaggio o scrivi a victorvolley@libero.it.',
    '', 'ASD Victor Volley'].join('\n');
  const h = E.h;
  const corpo =
    '<p style="margin:0 0 14px">' + h(saluto) + '</p>' +
    '<p style="margin:0 0 14px">è stato creato il tuo account per l’<strong>area atleti</strong> della ASD Victor Volley: qui trovi impegni, allenamenti, avvisi, quote e ricevute' + h(per) + '.</p>' +
    '<p style="margin:0 0 4px">Per iniziare, scegli la tua password:</p>' +
    E.pulsante('Scegli la password', link) +
    '<p style="margin:14px 0 0;font-size:13px;color:#64748b;text-align:center">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><span style="word-break:break-all;color:' + E.AZZURRO + '">' + h(link) + '</span></p>' +
    E.riquadro('Poi accederai da <a href="' + h(area) + '" style="color:' + E.AZZURRO + ';font-weight:bold;text-decoration:none">' + h(area.replace(/^https?:\/\//, '')) + '</a> con questa email (<strong>' + h(g.email) + '</strong>) e la password che avrai scelto.') +
    '<p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#64748b">Il link si usa una sola volta e vale ' + SCADENZA_GIORNI + ' giorni: non inoltrarlo a nessuno. Se scade, chiedi alla società di mandartene uno nuovo. Se non te lo aspettavi, ignora questo messaggio o scrivi a <a href="mailto:victorvolley@libero.it" style="color:' + E.AZZURRO + '">victorvolley@libero.it</a>.</p>';
  const html = E.cornice({ anteprima: 'Scegli la tua password per entrare nell’area atleti.', titolo: 'Benvenuto in Victor Volley', corpo, site: siteUrl });
  return { subject, text, html };
}

/** Seconda email, subito dopo che il genitore ha scelto la password: conferma che è andato tutto bene e dice dove
 *  accedere. Non contiene mai la password. g = { nome (genitore), email, atletiNomi: ['Luca Rossi', …] }: con più figli
 *  il testo parla al plurale e li nomina tutti; atletaNome (uno solo) resta accettato. */
function elencoNomi(n) { return n.length < 2 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1]; }

function componiConferma(g, siteUrl) {
  const area = siteUrl.replace(/\/$/, '') + '/atleta';
  const areaBreve = area.replace(/^https?:\/\/(www\.)?/, '');
  const saluto = g.nome ? 'Ciao ' + g.nome + ',' : 'Buongiorno,';
  const nomi = (Array.isArray(g.atletiNomi) ? g.atletiNomi : (g.atletaNome ? [g.atletaNome] : [])).filter(Boolean);
  const piu = nomi.length > 1;
  const per = nomi.length ? (piu ? ' dei tuoi figli (' + elencoNomi(nomi) + ')' : ' di ' + nomi[0]) : '';
  const passa = piu ? ' Dal selettore in alto puoi passare da un figlio all’altro.' : '';
  const subject = 'Victor Volley — password scelta, ora puoi entrare nell’Area Atleti';
  const text = [saluto, '',
    'hai scelto la password correttamente: il tuo account è pronto.',
    '', 'Puoi accedere all’area atleti da ' + areaBreve + ' (' + area + ') con questa email (' + g.email + ') e la password che hai appena scelto.',
    '', 'Lì trovi impegni, allenamenti, avvisi, quote e ricevute' + per + '.' + passa + ' Nella sezione Documenti trovi anche il modulo di iscrizione da scaricare.',
    '', 'Se non sei stato tu a scegliere la password, scrivici subito a victorvolley@libero.it.',
    '', 'ASD Victor Volley'].join('\n');
  const h = E.h;
  const corpo =
    '<p style="margin:0 0 14px">' + h(saluto) + '</p>' +
    '<p style="margin:0 0 14px">hai scelto la password <strong>correttamente</strong>: il tuo account è pronto.</p>' +
    '<p style="margin:0 0 4px">Ora puoi entrare nell’area atleti:</p>' +
    E.pulsante('Vai all’Area Atleti', area) +
    '<p style="margin:14px 0 0;font-size:13px;color:#475569;text-align:center">Indirizzo: <a href="' + h(area) + '" style="color:' + E.AZZURRO + ';font-weight:bold;text-decoration:none">' + h(areaBreve) + '</a></p>' +
    E.riquadro('Accedi con questa email (<strong>' + h(g.email) + '</strong>) e la password che hai appena scelto. Per sicurezza non te la riscriviamo.') +
    '<p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:#33475b">Nell’area trovi impegni, allenamenti, avvisi, quote e ricevute' + h(per) + '.' + h(passa) + ' Nella sezione <strong>Documenti</strong> c’è anche il modulo di iscrizione da scaricare.</p>' +
    '<p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#475569">Se non sei stato tu a scegliere la password, scrivi subito a <a href="mailto:victorvolley@libero.it" style="color:' + E.AZZURRO + '">victorvolley@libero.it</a>.</p>';
  const html = E.cornice({ anteprima: 'Tutto fatto: ora puoi accedere all’area atleti con la tua email e la password scelta.', titolo: 'Tutto fatto, puoi entrare', corpo, site: siteUrl });
  return { subject, text, html };
}

/** Email di «Password dimenticata?»: stessa veste dell'invito, in italiano. Il saluto è sempre «Ciao,» (nessun nome:
 *  la richiesta è pubblica e la mail va solo a chi ha un account). link = indirizzo completo. */
function componiReset(g, link, siteUrl) {
  const h = E.h;
  const subject = 'Victor Volley — scegli la nuova password';
  const text = ['Ciao,', '',
    'abbiamo ricevuto la richiesta di scegliere una nuova password per l’Area Atleti di Victor Volley.',
    '', 'Apri questo link e scrivi la password nuova (ci vuole mezzo minuto):', link, '',
    'Il link si usa una sola volta e vale ' + RESET_ORE + ' ore: non inoltrarlo a nessuno. Se non si apre, rifai la richiesta da «Password dimenticata?» nella pagina di accesso, oppure scrivici a victorvolley@libero.it.',
    '', 'Non hai chiesto tu il cambio? Ignora questa email: la tua password attuale resta valida.',
    '', 'ASD Victor Volley'].join('\n');
  const corpo =
    '<p style="margin:0 0 14px">Ciao,</p>' +
    '<p style="margin:0 0 14px">abbiamo ricevuto la richiesta di scegliere una nuova password per l’Area Atleti di Victor Volley.</p>' +
    '<p style="margin:0 0 4px">Tocca il pulsante qui sotto e scrivi la password nuova. Ci vuole mezzo minuto.</p>' +
    E.pulsante('Scegli la nuova password', link) +
    '<p style="margin:14px 0 0;font-size:13px;color:#64748b;text-align:center">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><span style="word-break:break-all;color:' + E.AZZURRO + '">' + h(link) + '</span></p>' +
    E.riquadro('<strong>Non hai chiesto tu il cambio?</strong><br>Puoi ignorare questa email: la tua password attuale resta valida e nessuno può entrare senza il link.<br><br>Il link si usa una sola volta e vale ' + RESET_ORE + ' ore. Se non si apre, rifai la richiesta da <em>Password dimenticata?</em> nella pagina di accesso, oppure scrivi a <a href="mailto:victorvolley@libero.it" style="color:' + E.AZZURRO + '">victorvolley@libero.it</a>.');
  const html = E.cornice({ anteprima: 'Scegli la nuova password per l’Area Atleti.', titolo: 'Scegli la nuova password', corpo, site: siteUrl });
  return { subject, text, html };
}

module.exports = { nuovoCodice, impronta, codiceValido, SCADENZA_GIORNI, RESET_ORE, scaduto, linkInvito, componiInvito, componiConferma, componiReset };
