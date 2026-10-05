/**
 * Logica dei promemoria di scadenza per i genitori (funzioni pure, senza rete né Firestore: si provano con
 * `node scripts/check-promemoria.js`). Il file inizia con «_» per non essere esposto da Vercel come funzione.
 *
 * Soglie decise con la società (2026-10-05):
 *   - rata non pagata: 7 e 1 giorno PRIMA della scadenza; poi il giorno dopo e ogni 7 giorni per 3 volte
 *     (cioè 1, 8, 15 e 22 giorni DOPO);
 *   - certificato medico: 30 e 7 giorni prima e il giorno della scadenza.
 * Il job gira una volta al giorno. Ogni promemoria ha una chiave (promemoriaInviati/{chiave}) per non essere
 * spedito due volte; per non perdere un avviso se un giorno il job salta, vale anche il giorno dopo la soglia.
 */

const SOGLIE_RATA_PRIMA = [7, 1];
const SOGLIE_RATA_DOPO = [1, 8, 15, 22];
const SOGLIE_CERT_PRIMA = [30, 7, 0];
const TOLLERANZA_GIORNI = 1;

/** Data di oggi a Roma (YYYY-MM-DD): il cron gira in UTC, ma le scadenze sono giorni di calendario italiani. */
function oggiRoma(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now || new Date());
}

/** Giorni da `da` a `a` (entrambe YYYY-MM-DD); positivo se `a` è nel futuro. */
function giorniTra(da, a) {
  const p = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(a) - p(da)) / 86400000);
}

function fmtData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

function eur(n) {
  return (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Caselle vere: scarta indirizzi non validi e quelli @victorvolley (account interni senza casella). */
function emailValida(e) {
  const s = String(e || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !/@victorvolley\./.test(s);
}

function nomeAtleta(a) { return ((a.nome || '') + ' ' + (a.cognome || '')).trim() || 'l’atleta'; }

/** Chi riceve i promemoria di un atleta: i suoi accessi (genitori e atleta stesso) con email reale. */
function destinatariDi(a) {
  const acc = Array.isArray(a.accessi) && a.accessi.length
    ? a.accessi
    : (a.email ? [{ uid: a.uid || a.id, email: a.email, ruolo: 'atleta', nome: '' }] : []);
  const visti = new Set();
  return acc.filter((x) => {
    const e = String(x.email || '').trim().toLowerCase();
    if (!emailValida(e) || visti.has(e)) return false;
    visti.add(e);
    return true;
  }).map((x) => ({ uid: x.uid || '', email: String(x.email).trim().toLowerCase(), nome: x.nome || '', ruolo: x.ruolo || '' }));
}

function _giornoLabel(n) { return n === 1 ? '1 giorno' : n + ' giorni'; }

/**
 * Promemoria da inviare oggi.
 * @param {{atleti:Array, rate:Array, oggi:string}} p  atleti = documenti `atleti` (con id), rate = documenti `rateAtleti`
 * @returns {Array<{chiave,atletaId,atletaNome,tipo,testo,livello,destinatari}>}
 */
function costruisciPromemoria({ atleti, rate, oggi }) {
  const perId = new Map(atleti.map((a) => [a.id, a]));
  const out = [];

  rate.forEach((r) => {
    if (r.pagata || !r.scadenza || !/^\d{4}-\d{2}-\d{2}$/.test(r.scadenza)) return;
    const a = perId.get(r.atletaId);
    if (!a) return;
    const dest = destinatariDi(a);
    if (!dest.length) return;
    const g = giorniTra(oggi, r.scadenza);                 // >0 futuro, <0 scaduta
    const cosa = '«' + (r.note || 'Quota') + '» (€ ' + eur(r.importo) + ')';
    let soglia = null, testo = '', livello = 'orange';

    if (g >= 0) {
      soglia = SOGLIE_RATA_PRIMA.find((s) => g === s || g === s - TOLLERANZA_GIORNI);
      if (soglia != null) {
        testo = 'Quota ' + cosa + ' di ' + nomeAtleta(a) + ': scade il ' + fmtData(r.scadenza) + (g === 0 ? ' (oggi)' : ' (tra ' + _giornoLabel(g) + ')') + '.';
      }
    } else {
      const ritardo = -g;
      const s = SOGLIE_RATA_DOPO.find((x) => ritardo === x || ritardo === x + TOLLERANZA_GIORNI);
      if (s != null) {
        soglia = -s;
        livello = 'red';
        testo = 'Quota ' + cosa + ' di ' + nomeAtleta(a) + ': era in scadenza il ' + fmtData(r.scadenza) + ' (scaduta da ' + _giornoLabel(ritardo) + ').';
      }
    }
    if (soglia != null && testo) {
      out.push({ chiave: 'rata_' + r.id + '_' + (soglia >= 0 ? 'p' + soglia : 'd' + (-soglia)), atletaId: a.id, atletaNome: nomeAtleta(a), tipo: 'rata', testo, livello, destinatari: dest });
    }
  });

  atleti.forEach((a) => {
    const sc = a.certMedicoScadenza;
    if (!sc || !/^\d{4}-\d{2}-\d{2}$/.test(sc)) return;
    const dest = destinatariDi(a);
    if (!dest.length) return;
    const g = giorniTra(oggi, sc);
    const soglia = SOGLIE_CERT_PRIMA.find((s) => g === s || (g === s - TOLLERANZA_GIORNI && s > 0) || (s === 0 && g === -TOLLERANZA_GIORNI));
    if (soglia == null) return;
    const testo = g >= 0
      ? 'Il certificato medico di ' + nomeAtleta(a) + ' scade il ' + fmtData(sc) + (g === 0 ? ' (oggi)' : ' (tra ' + _giornoLabel(g) + ')') + '. Serve il rinnovo per continuare ad allenarsi.'
      : 'Il certificato medico di ' + nomeAtleta(a) + ' è scaduto il ' + fmtData(sc) + '. Serve il rinnovo per continuare ad allenarsi.';
    // la scadenza fa parte della chiave: dopo un rinnovo i promemoria ripartono da capo
    out.push({ chiave: 'cert_' + a.id + '_' + sc + '_p' + soglia, atletaId: a.id, atletaNome: nomeAtleta(a), tipo: 'certificato', testo, livello: g <= 7 ? 'red' : 'orange', destinatari: dest });
  });

  return out;
}

/** Un'email al giorno per destinatario, con tutti i suoi promemoria (anche di più figli). */
function raggruppaPerDestinatario(promemoria, nonVoglionoEmail) {
  const escludi = nonVoglionoEmail || new Set();
  const per = new Map();
  promemoria.forEach((p) => {
    p.destinatari.forEach((d) => {
      if (d.uid && escludi.has(d.uid)) return;
      if (!per.has(d.email)) per.set(d.email, { email: d.email, nome: d.nome, uids: new Set(), voci: [] });
      const g = per.get(d.email);
      if (d.uid) g.uids.add(d.uid);
      g.voci.push(p);
    });
  });
  return [...per.values()].map((g) => ({ ...g, uids: [...g.uids] }));
}

function h(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function componiEmail(g, siteUrl) {
  const n = g.voci.length;
  const link = siteUrl.replace(/\/$/, '') + '/atleta';
  const subject = n === 1 ? 'Victor Volley — promemoria: 1 scadenza' : 'Victor Volley — promemoria: ' + n + ' scadenze';
  const saluto = g.nome ? 'Ciao ' + g.nome + ',' : 'Buongiorno,';
  const text = [saluto, '', 'ecco le scadenze da tenere d’occhio:', '']
    .concat(g.voci.map((v) => '- ' + v.testo))
    .concat(['', 'Puoi vedere tutto nell’area atleti: ' + link,
      '', 'Se hai già provveduto, ignora questo messaggio. Puoi non ricevere più i promemoria dal tuo account (Il tuo account → Promemoria via email) o scrivendo a victorvolley@libero.it.',
      '', 'ASD Victor Volley']).join('\n');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#0f172a;margin:0 0 12px">Victor Volley — promemoria scadenze</h2>' +
    '<p>' + h(saluto) + '</p><p>ecco le scadenze da tenere d’occhio:</p>' +
    '<ul style="padding-left:18px">' + g.voci.map((v) =>
      '<li style="margin:8px 0;' + (v.livello === 'red' ? 'color:#b91c1c' : '') + '">' + h(v.testo) + '</li>').join('') + '</ul>' +
    '<p><a href="' + h(link) + '" style="display:inline-block;background:#0088ff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Apri l’area atleti</a></p>' +
    '<p style="font-size:12px;color:#64748b">Se hai già provveduto, ignora questo messaggio. Puoi non ricevere più i promemoria dal tuo account (<em>Il tuo account → Promemoria via email</em>) o scrivendo a <a href="mailto:victorvolley@libero.it">victorvolley@libero.it</a>.</p>' +
    '<p style="font-size:12px;color:#64748b">ASD Victor Volley</p></div>';
  return { subject, text, html };
}

module.exports = {
  SOGLIE_RATA_PRIMA, SOGLIE_RATA_DOPO, SOGLIE_CERT_PRIMA,
  oggiRoma, giorniTra, emailValida, destinatariDi,
  costruisciPromemoria, raggruppaPerDestinatario, componiEmail
};
