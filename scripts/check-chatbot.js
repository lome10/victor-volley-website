#!/usr/bin/env node
/* Controllo del chatbot a risposte fisse: dati coerenti e domande tipo che trovano la risposta giusta. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/chatbot.json'), 'utf8'));
const bot = require(path.join(root, 'js/chatbot.js'));
let errors = 0;
const fail = (m) => { errors++; console.error('  ✗ ' + m); };

// 1. Struttura dei dati
const ids = new Set();
const pages = new Set(fs.readdirSync(root).filter((f) => f.endsWith('.html')).map((f) => '/' + f.replace(/\.html$/, '')));
data.categorie.forEach((c) => {
  if (!c.id || !c.titolo || !Array.isArray(c.domande) || !c.domande.length) fail('categoria incompleta: ' + c.id);
  c.domande.forEach((d) => {
    if (!d.id || ids.has(d.id)) fail('id mancante o doppio: ' + d.id);
    ids.add(d.id);
    if (!d.q || !d.risposta) fail(d.id + ': manca domanda o risposta');
    if (!Array.isArray(d.parole) || d.parole.length < 3) fail(d.id + ': servono almeno 3 parole chiave');
    if (d.risposta && d.risposta.length > 420) fail(d.id + ': risposta troppo lunga (' + d.risposta.length + ' caratteri)');
    if (d.link) {
      if (d.link.url === 'https://www.instagram.com/asdvictorvolley') { /* unico link esterno ammesso */ }
      else if (!/^\//.test(d.link.url)) fail(d.id + ': il link deve essere interno');
      else if (d.link.url !== '/' && !pages.has(d.link.url.replace(/[?#].*$/, ''))) fail(d.id + ': pagina inesistente ' + d.link.url);
    }
    if (/<|>/.test(d.risposta || '')) fail(d.id + ': niente HTML nelle risposte');
  });
});
if (data.fallback_link && !pages.has(data.fallback_link.url)) fail('fallback_link: pagina inesistente');

// 2. Domande tipo -> risposta attesa (id)
bot._prepare(data);
const prove = [
  ['posso provare gratis un allenamento?', 'prova-gratuita'],
  ['come si fa ad iscriversi', 'come-iscriversi'],
  ['quanto costa iscrivere mia figlia', 'quote'],
  ['qual è la quota annuale?', 'quote'],
  ['che certificato medico serve', 'documenti-iscrizione'],
  ['avete uno sconto per due fratelli', 'sconti'],
  ['quali squadre avete', 'categorie'],
  ['da che età si può iniziare a giocare', 'eta-minima'],
  ['mio figlio ha 6 anni può giocare', 'eta-minima'],
  ['non ho mai giocato a pallavolo va bene lo stesso', 'livello'],
  ['dove vi allenate', 'dove'],
  ['qual è l\'indirizzo del palazzetto', 'dove'],
  ['a che ora è l\'allenamento', 'orari-allenamenti'],
  ['cosa devo portare', 'cosa-portare'],
  ['quando gioca la prossima partita', 'calendario'],
  ['come è finita la partita', 'risultati'],
  ['classifica del girone', 'risultati'],
  ['posso vedere la partita in diretta', 'diretta'],
  ['la partita è stata rinviata?', 'rinvio'],
  ['ho dimenticato la password', 'password'],
  ['come accedo all\'area atleti', 'area-atleti'],
  ['mi serve la ricevuta per il 730', 'ricevute'],
  ['che taglia di maglia', 'divisa'],
  ['mia figlia ha un\'allergia', 'salute'],
  ['voglio sponsorizzare la società', 'sponsor'],
  ['come vi posso contattare', 'contatti'],
  ['qual è la vostra email', 'contatti'],
  ['privacy e dati personali', 'privacy'],
  ['come posso fare il volontario', 'volontari'],
  ['chi sono gli allenatori', 'allenatori'],
  ['siete su instagram', 'social'],
  ['dove trovo le foto', 'galleria'],
  ['ultime news della società', 'news'],
  ['quando è nata la società', 'chi-siamo'],
];
const detail = [];
prove.forEach(([q, atteso]) => {
  const r = bot._search(q);
  const top = r[0];
  const ok = top && top.s >= 2 && top.e.id === atteso && (!r[1] || top.s > r[1].s);
  if (!ok) { fail('"' + q + '" → atteso ' + atteso + ', trovato ' + (top ? top.e.id + ' (' + top.s + ')' + (r[1] ? ' vs ' + r[1].e.id + ' (' + r[1].s + ')' : '') : 'niente')); }
  detail.push(ok);
});

// 3. Domande fuori argomento: non devono avere una risposta sicura
['qual è la capitale della Francia', 'che tempo fa domani', 'dammi la ricetta della carbonara', 'chi ha vinto lo scudetto di calcio'].forEach((q) => {
  const r = bot._search(q);
  if (r[0] && r[0].s >= 2 && (!r[1] || r[0].s > r[1].s)) fail('fuori argomento ma risponde: "' + q + '" → ' + r[0].e.id);
});

const totale = ids.size;
console.log('check-chatbot: ' + totale + ' risposte, ' + prove.length + ' domande tipo, ' + (errors ? errors + ' errori' : 'tutto ok'));
process.exit(errors ? 1 : 0);
