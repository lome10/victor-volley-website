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
  ["com'è finita l'ultima partita?", 'risultati'],
  ["qual è l'ultimo risultato", 'risultati'],
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
  // Le domande dei bottoni, scritte a mano, devono trovare se stesse (27/11: queste 4 non lo facevano).
  ['Ci sono squadre maschili?', 'maschile-femminile'],
  ['avete squadre maschili', 'maschile-femminile'],
  ['Cosa devo portare agli allenamenti?', 'cosa-portare'],
  ['cosa porto all allenamento', 'cosa-portare'],
  ['Ho un problema con un allenatore o un compagno', 'comportamento'],
  ["ho un problema con l'allenatore", 'comportamento'],
  ['Chi sono i vostri sponsor?', 'chi-sono-sponsor'],
  ['quali sponsor avete', 'chi-sono-sponsor'],
  ['quando sono gli allenamenti', 'orari-allenamenti'],
  ['voglio diventare sponsor', 'sponsor'],
];
// Ogni domanda del json, scritta così com'è, risponde con se stessa.
data.categorie.forEach((c) => c.domande.forEach((d) => {
  const r = bot._search(d.q);
  if (!(r[0] && r[0].s >= 2 && r[0].e.id === d.id && (!r[1] || r[0].s > r[1].s))) fail('la domanda "' + d.q + '" non trova se stessa');
}));
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

// 4. Risposte con le partite vere (prossima partita, ultimo risultato)
const P = [
  { categoria: 'Under 19', squadra_casa: 'VICTOR VOLLEY PUGLIA IN FOOD', squadra_ospite: 'FLYARMIDA VOLLEY', data: '2026-11-24', ora: '18:00', stato: 'programmata', palazzetto: 'Palazzetto ARKÈ - Melissano' },
  { categoria: 'Prima Divisione', squadra_casa: 'ASD OLIMPIUS PARABITA', squadra_ospite: 'VICTOR VOLLEY VITA', data: '2026-11-29', ora: '19:00', stato: 'programmata', palazzetto: 'Pallone Tensostatico - Parabita' },
  { categoria: 'Under 19', squadra_casa: 'CUORE DI MAMMA ASTRA VOLLEY', squadra_ospite: 'VICTOR VOLLEY PUGLIA IN FOOD', data: '2026-12-02', ora: '18:00', stato: 'programmata', palazzetto: 'Palazzetto - Acquarica' },
  { categoria: 'Under 19', squadra_casa: 'VICTOR VOLLEY PUGLIA IN FOOD', squadra_ospite: 'GALLIPOLI', data: '2026-11-17', ora: '18:00', stato: 'conclusa', set_casa: 3, set_ospite: 1, palazzetto: 'x' },
];
const dyn = (tipo, testo) => bot._dinamica(tipo, P, testo, '2026-11-25');
const attese = [
  ['prossima_partita', 'quando gioca la prossima partita', (s) => s.includes('Under 19: Cuore Di Mamma Astra Volley - Victor Volley Puglia In Food, mercoledì 2 dicembre alle 18:00') && s.includes('Prima Divisione: Asd Olimpius Parabita') && !s.includes('Flyarmida')],
  ['prossima_partita', 'prossima partita under 19', (s) => s.startsWith('La prossima partita è Under 19') && !s.includes('Prima Divisione')],
  ['prossima_partita', 'quando gioca la prima divisione', (s) => s.startsWith('La prossima partita è Prima Divisione') && s.includes('domenica 29 novembre alle 19:00')],
  ['ultimo_risultato', 'come è finita', (s) => s.includes('Victor Volley Puglia In Food 3-1 Gallipoli (17 novembre)')],
];
attese.forEach(([tipo, testo, ok]) => { const s = dyn(tipo, testo) || ''; if (!ok(s)) fail('dinamica "' + testo + '" → ' + JSON.stringify(s)); });
if (bot._dinamica('prossima_partita', [], 'prossima partita', '2026-11-25') !== 'Al momento non ci sono partite in programma nel calendario.') fail('dinamica senza partite');
const dinamiche = data.categorie.flatMap((c) => c.domande).filter((d) => d.dinamico).map((d) => d.id + ':' + d.dinamico).sort().join(',');
if (dinamiche !== 'calendario:prossima_partita,risultati:ultimo_risultato') fail('domande dinamiche inattese: ' + dinamiche);

const totale = ids.size;
console.log('check-chatbot: ' + totale + ' risposte, ' + prove.length + ' domande tipo, ' + (errors ? errors + ' errori' : 'tutto ok'));
process.exit(errors ? 1 : 0);
