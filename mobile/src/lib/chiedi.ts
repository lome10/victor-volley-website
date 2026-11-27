// "Chiedi a Victor": le regole del chatbot del sito (js/chatbot.js), senza grafica.
// Domande e risposte arrivano da https://www.victorvolley.it/data/chatbot.json: l'app risponde sempre come il sito.
import { useQuery } from '@tanstack/react-query';

import { SITO, type Partita } from '~/lib/dati';

export const INSTAGRAM = 'https://www.instagram.com/asdvictorvolley'; // unico link esterno ammesso
const MIN_PUNTI = 2; // sotto questa soglia: nessuna risposta sicura
export const MAX_SUGGERITE = 3;
const VUOTE = ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'uno', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  'e', 'o', 'ma', 'che', 'chi', 'cosa', 'come', 'dove', 'quando', 'quanto', 'quanti', 'quale', 'quali', 'si', 'mi', 'ti', 'ci',
  'vi', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'dal', 'dalla', 'nel',
  'nella', 'sul', 'sulla', 'mio', 'mia', 'tuo', 'tua', 'sono', 'ho', 'ha', 'hanno', "e'", 'posso', 'puo', 'puoi', 'vorrei',
  'voglio', 'fare', 'avete', 'avere', 'questo', 'questa', 'anche', 'non', 'se', 'ne', 'io', 'tu', 'noi', 'voi', 'piu', 'molto'];

export type LinkBot = { testo?: string; url: string };
export type Domanda = { id?: string; q: string; parole: string[]; risposta: string; link?: LinkBot; dinamico?: 'prossima_partita' | 'ultimo_risultato' | string };
export type Categoria = { titolo: string; domande: Domanda[] };
export type DatiBot = {
  nome: string;
  email: string;
  saluto: string;
  fallback: string;
  fallback_link?: LinkBot;
  avviso: string;
  saluti: string[];
  grazie: string[];
  categorie: Categoria[];
  etichetta?: string;
  invito?: string;
};

export function norm(s: string) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const parole = (s: string) => norm(s).split(' ').filter((t) => t && !VUOTE.includes(t));
// Toglie la vocale finale: "squadra"/"squadre", "iscrivere"/"iscrizione" restano vicini.
const radice = (t: string) => (t.length > 4 ? t.replace(/[aeio]$/, '') : t);

function punti(d: Domanda, qNorm: string, qParole: string[]) {
  let s = 0;
  const conSpazi = ' ' + qNorm + ' ';
  const haRadice = (t: string) => qParole.some((u) => radice(u) === radice(t));
  for (const p of d.parole) {
    const pn = norm(p);
    if (!pn) continue;
    if (conSpazi.includes(' ' + pn + ' ')) {
      s += pn.includes(' ') ? 4 : 3; // frase intera o parola chiave
    } else {
      const pt = parole(p);
      if (pt.length > 1) {
        if (pt.every((t) => qParole.includes(t) || haRadice(t))) s += 3; // frase: tutte le parole, in qualsiasi ordine
      } else if (pt.length === 1 && haRadice(pt[0])) s += 2; // stessa radice
    }
  }
  for (const t of parole(d.q)) if (haRadice(t)) s += 1; // parole in comune con la domanda tipo
  return s;
}

export const tutteLeDomande = (dati: DatiBot) => dati.categorie.flatMap((c) => c.domande);

/** Domande ordinate per vicinanza a quello che ha scritto l'utente (search() del sito). */
export function cerca(dati: DatiBot, testo: string) {
  const qNorm = norm(testo);
  const qParole = parole(testo);
  if (!qParole.length) return [];
  return tutteLeDomande(dati)
    .map((d) => ({ d, s: punti(d, qNorm, qParole) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
}

export type Esito =
  | { tipo: 'saluto' }
  | { tipo: 'grazie' }
  | { tipo: 'risposta'; d: Domanda }
  | { tipo: 'forse'; domande: Domanda[] }
  | { tipo: 'ripiego' };

/** Cosa fare con un testo libero (onSend() del sito). */
export function rispondi(dati: DatiBot, testo: string): Esito {
  const n = norm(testo);
  if (dati.saluti.includes(n)) return { tipo: 'saluto' };
  if (dati.grazie.includes(n)) return { tipo: 'grazie' };
  const res = cerca(dati, testo);
  if (res.length && res[0].s >= MIN_PUNTI && (res.length === 1 || res[0].s > res[1].s)) return { tipo: 'risposta', d: res[0].d };
  const vicine = res.filter((x) => x.s >= MIN_PUNTI - 1).slice(0, MAX_SUGGERITE);
  if (vicine.length) return { tipo: 'forse', domande: vicine.map((x) => x.d) };
  return { tipo: 'ripiego' };
}

// ---------- partite vere (risposte "dinamico") ----------
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const nomeSquadra = (s: string) => String(s || '').toLowerCase().replace(/(^|[\s'(.-])([a-zà-ù])/g, (_, a: string, b: string) => a + b.toUpperCase());
function quando(p: Partita) {
  const d = new Date(p.data + 'T00:00:00');
  if (isNaN(d.getTime())) return p.data || '';
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + (p.ora ? ' alle ' + p.ora : '');
}

/** Categorie nominate nella domanda ("under 19", "u19", "prima divisione"): se nessuna, tutte. */
function categorieChieste(partite: Partita[], testo: string) {
  const n = ' ' + norm(testo) + ' ';
  const tutte: string[] = [];
  for (const p of partite) if (p.categoria && !tutte.includes(p.categoria)) tutte.push(p.categoria);
  return tutte.filter((c) => {
    const cn = norm(c);
    const num = (cn.match(/\d+/) || [''])[0];
    return n.includes(' ' + cn + ' ') || (num && (n.includes(' u' + num + ' ') || n.includes(' under' + num + ' '))) || (/prima divisione/.test(cn) && /\b(1|prima) ?(a )?div/.test(n));
  });
}

/** La frase con la partita vera, prima della risposta fissa (rispostaDinamica() del sito). null se non c'e'. */
export function rispostaDinamica(tipo: string, partite: Partita[], testo: string, oggi: string): string | null {
  const cats = categorieChieste(partite, testo);
  const lista = cats.length ? partite.filter((p) => cats.includes(p.categoria)) : partite;
  const ord = (a: Partita, b: Partita) => ((a.data || '') + (a.ora || '') < (b.data || '') + (b.ora || '') ? -1 : 1);
  const perCategoria = (arr: Partita[]) => {
    const visti = new Set<string>();
    return arr.filter((p) => (visti.has(p.categoria) ? false : (visti.add(p.categoria), true)));
  };
  if (tipo === 'prossima_partita') {
    const future = lista.filter((p) => p.stato !== 'conclusa' && (p.data || '') >= oggi).sort(ord);
    if (!future.length) return cats.length ? 'Per ' + cats.join(' e ') + ' non ci sono partite in programma nel calendario.' : 'Al momento non ci sono partite in programma nel calendario.';
    const righe = perCategoria(future).map(
      (p) => p.categoria + ': ' + nomeSquadra(p.squadraCasa) + ' - ' + nomeSquadra(p.squadraOspite) + ', ' + quando(p) + (p.palazzetto ? ', ' + p.palazzetto : '') + '.',
    );
    return (righe.length > 1 ? 'Le prossime partite:\n' : 'La prossima partita è ') + righe.join('\n');
  }
  if (tipo === 'ultimo_risultato') {
    const finite = lista.filter((p) => p.stato === 'conclusa' && p.setCasa != null && p.setOspite != null).sort(ord).reverse();
    if (!finite.length) return null;
    const r = perCategoria(finite).map((p) => {
      const d = new Date(p.data + 'T00:00:00');
      return p.categoria + ': ' + nomeSquadra(p.squadraCasa) + ' ' + p.setCasa + '-' + p.setOspite + ' ' + nomeSquadra(p.squadraOspite) + (isNaN(d.getTime()) ? '' : ' (' + d.getDate() + ' ' + MESI[d.getMonth()] + ')') + '.';
    });
    return (r.length > 1 ? 'Gli ultimi risultati:\n' : "L'ultimo risultato: ") + r.join('\n');
  }
  return null;
}

/** Il link si mostra solo se porta a una pagina del sito o a Instagram (come il sito). */
export const linkAmmesso = (l?: LinkBot | null): l is LinkBot => !!l && !!l.url && (l.url.startsWith('/') || l.url === INSTAGRAM);

/** Domande e risposte del sito. Se non arrivano, il tasto non c'e' (come il sito). */
export const useDatiBot = () =>
  useQuery({
    queryKey: ['chatbot'],
    queryFn: async (): Promise<DatiBot> => {
      const r = await fetch(SITO + '/data/chatbot.json');
      if (!r.ok) throw new Error('chatbot ' + r.status);
      return (await r.json()) as DatiBot;
    },
    staleTime: 60 * 60 * 1000,
  });
