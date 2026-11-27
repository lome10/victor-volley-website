// Area Allenatore (allenatore.html + js/allenatore.js del sito): elenco atleti, presenze un giorno alla volta, statistiche.
// I dati passano SOLO dalle funzioni del server /api/allenatore-atleti e /api/allenatore-presenze, che ricontrollano
// tutto (allenatore attivo, categorie sue, date ammesse): il mister non legge ne' scrive direttamente il database.
import { giornoEsteso } from '~/lib/agenda';
import { SITO } from '~/lib/dati';
import { idToken } from '~/lib/firebase';
import { calcola, type Statistica } from '~/lib/presenzeStat';

/** Le presenze contano dal 29/10/2026 (richiesta di Lorenzo): gli allenamenti prima non si mostrano. */
export const INIZIO = '2026-10-29';
export const VERDE = '#16A34A';
export const ROSSO = '#DC2626';
export const GRIGIO = '#CBD5E1';

// ---------- dati dal server ----------

export type Genitore = { nome: string; parentela: string; telefono: string };
export type SchedaAtleta = { cognome: string; nome: string; categoria: string; dataNascita: string; genitori: Genitore[]; note: string };
export type DatiAtleti = { allenatore: { nome: string; cognome: string }; categorie: string[]; atleti: SchedaAtleta[] };

export type StatoPresenza = 'p' | 'a' | '';
export type GiornoAllenamento = { data: string; dataOriginale: string; orarioId: string; oraInizio: string; oraFine: string; luogo: string };
export type AtletaPresenze = { id: string; cognome: string; nome: string };
export type CategoriaPresenze = {
  categoria: string;
  /** Dal piu' recente (come li manda il server). */
  giorni: GiornoAllenamento[];
  atleti: AtletaPresenze[];
  /** data -> atletaId -> 'p' | 'a' */
  presenze: Record<string, Record<string, 'p' | 'a'>>;
};
export type DatiPresenze = { oggi: string; categorie: CategoriaPresenze[] };

/** 401: la sessione non vale piu' (si esce, come il sito). */
export class SessioneScaduta extends Error {}
/**
 * 403 dall'elenco atleti: l'account non e' (piu') un allenatore attivo. ATTENZIONE: dal browser (app web) il server
 * risponde 403 anche per "origine non consentita" (stessaOrigine), quindi l'area allenatore funziona solo nell'app
 * su telefono, che non manda l'intestazione Origin.
 */
export class AccessoNegato extends Error {}

async function api(percorso: string, metodo: 'GET' | 'POST' = 'GET', corpo?: unknown) {
  const token = await idToken();
  if (!token) throw new SessioneScaduta('nessun utente');
  const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
  if (corpo) headers['Content-Type'] = 'application/json';
  const r = await fetch(SITO + percorso, { method: metodo, headers, cache: 'no-store', body: corpo ? JSON.stringify(corpo) : undefined });
  if (r.status === 401) throw new SessioneScaduta('401');
  return r;
}

export async function leggiAtletiAllenatore(): Promise<DatiAtleti> {
  const r = await api('/api/allenatore-atleti');
  if (r.status === 403) throw new AccessoNegato('403');
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}

export async function leggiPresenzeAllenatore(): Promise<DatiPresenze> {
  const r = await api('/api/allenatore-presenze');
  if (!r.ok) throw new Error('http ' + r.status);
  const dati = (await r.json()) as DatiPresenze;
  return { ...dati, categorie: dati.categorie.map((c) => ({ ...c, giorni: c.giorni.filter((g) => g.data >= INIZIO) })) };
}

/** SCRITTURA (dal server): segna un atleta in un giorno; '' toglie la risposta. Da provare solo con l'account di prova. */
export async function segnaPresenzaAllenatore(categoria: string, data: string, atletaId: string, stato: StatoPresenza) {
  const r = await api('/api/allenatore-presenze', 'POST', { categoria, data, atletaId, stato });
  if (!r.ok) throw new Error('http ' + r.status);
}

// ---------- atleti ----------

/** "4/3/2012 (14 anni)"; "—" se la data manca o non e' valida. */
export function dataNascita(iso: string, adesso: Date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '—';
  let eta = adesso.getFullYear() - +m[1];
  if (adesso.getMonth() < +m[2] - 1 || (adesso.getMonth() === +m[2] - 1 && adesso.getDate() < +m[3])) eta--;
  return +m[3] + '/' + +m[2] + '/' + m[1] + (eta >= 0 && eta < 100 ? ' (' + eta + ' anni)' : '');
}

/** Il numero resta com'e' scritto; il link tel: tiene solo cifre e un eventuale + iniziale. */
export function telHref(numero: string) {
  const pulito = String(numero || '')
    .replace(/[^\d+]/g, '')
    .replace(/(?!^)\+/g, '');
  return pulito ? 'tel:' + pulito : '';
}

/** "Maria Rossi (mamma)", oppure solo la parentela. */
export const etichettaGenitore = (g: Genitore) => [g.nome, g.parentela && g.nome ? '(' + g.parentela + ')' : g.parentela].filter(Boolean).join(' ');

/** Le categorie presenti nell'elenco, nell'ordine in cui compaiono. */
export function categorieAtleti(atleti: SchedaAtleta[]) {
  const out: string[] = [];
  for (const a of atleti) if (!out.includes(a.categoria || '')) out.push(a.categoria || '');
  return out;
}

export function filtraAtleti(atleti: SchedaAtleta[], categoria: string, cerca: string) {
  const q = cerca.trim().toLowerCase();
  return atleti.filter((a) => (!categoria || (a.categoria || '') === categoria) && (!q || (a.cognome + ' ' + a.nome).toLowerCase().includes(q)));
}

// ---------- presenze ----------

const due = (n: number) => (n < 10 ? '0' : '') + n;
export function aggiungiGiorni(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + due(t.getUTCMonth() + 1) + '-' + due(t.getUTCDate());
}
const dataDa = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const sigla = (iso: string) => ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'][dataDa(iso).getDay()];
export const giornoCorto = (iso: string) => ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][dataDa(iso).getDay()] + ' ' + dataDa(iso).getDate() + '/' + (dataDa(iso).getMonth() + 1);
export const numeroGiorno = (iso: string) => String(dataDa(iso).getDate());
export const meseCorto = (iso: string) => ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'][dataDa(iso).getMonth()];
/** "Martedì 3 novembre" */
export const giornoLungo = giornoEsteso;

export type GiornoUnico = { data: string; ore: string[] };

/** I giorni di allenamento della squadra, uno per data (due orari lo stesso giorno = un giorno), dal piu' vecchio. */
export function giorniUnici(cat: CategoriaPresenze): GiornoUnico[] {
  const per = new Map<string, GiornoUnico>();
  const out: GiornoUnico[] = [];
  for (const g of cat.giorni.slice().reverse()) {
    let u = per.get(g.data);
    if (!u) {
      u = { data: g.data, ore: [] };
      per.set(g.data, u);
      out.push(u);
    }
    if (g.oraInizio) u.ore.push(g.oraInizio);
  }
  return out;
}

export const statoDi = (cat: CategoriaPresenze, data: string, atletaId: string): StatoPresenza => (cat.presenze[data] || {})[atletaId] || '';

export function conteggio(cat: CategoriaPresenze, data: string) {
  let si = 0;
  let no = 0;
  for (const a of cat.atleti) {
    const s = statoDi(cat, data, a.id);
    if (s === 'p') si++;
    else if (s === 'a') no++;
  }
  return { si, no, nr: cat.atleti.length - si - no };
}

/** Il giorno da aprire: l'ultimo allenamento gia' fatto (oggi compreso), altrimenti il primo. */
export function giornoIniziale(giorni: GiornoUnico[], oggi: string) {
  const passati = giorni.filter((g) => g.data <= oggi);
  return passati.length ? passati[passati.length - 1].data : giorni.length ? giorni[0].data : '';
}

/** I giorni della striscia in alto: dagli ultimi 28 giorni in poi. */
export const giorniStriscia = (giorni: GiornoUnico[], oggi: string) => giorni.filter((g) => g.data >= aggiungiGiorni(oggi, -28));

/** Sotto il numero del giorno: "oggi", "12/15" segnati per i giorni passati, l'ora per quelli futuri. */
export function notaGiorno(cat: CategoriaPresenze, g: GiornoUnico, oggi: string) {
  if (g.data === oggi) return 'oggi';
  if (g.data < oggi) return cat.atleti.length - conteggio(cat, g.data).nr + '/' + cat.atleti.length;
  return g.ore[0] || '';
}

export type Filtro = 'tutte' | 'assenti' | 'da';
export function atletiFiltrati(cat: CategoriaPresenze, data: string, filtro: Filtro) {
  return cat.atleti.filter((a) => {
    const s = statoDi(cat, data, a.id);
    return filtro === 'tutte' || (filtro === 'assenti' && s === 'a') || (filtro === 'da' && !s);
  });
}

/**
 * Stesso giro dentro tutti i dati: la categoria `categoria`, il giorno `data`, l'atleta `atletaId` torna/diventa `stato`.
 * Serve al rollback di UN atleta (come impostaMolti del sito): se su tre salvataggi uno fallisce, gli altri due restano.
 */
export function conStatoNeiDati(dati: DatiPresenze, categoria: string, data: string, atletaIds: string[], stato: StatoPresenza): DatiPresenze {
  return { ...dati, categorie: dati.categorie.map((c) => (c.categoria === categoria ? conStato(c, data, atletaIds, stato) : c)) };
}

/** Copia delle presenze con alcuni atleti cambiati in un giorno ('' toglie). */
export function conStato(cat: CategoriaPresenze, data: string, atletaIds: string[], stato: StatoPresenza): CategoriaPresenze {
  const giorno = { ...(cat.presenze[data] || {}) };
  for (const id of atletaIds) {
    if (stato) giorno[id] = stato;
    else delete giorno[id];
  }
  return { ...cat, presenze: { ...cat.presenze, [data]: giorno } };
}

// ---------- statistiche ----------

/** Le statistiche di un atleta sugli ultimi `giorni` giorni (oggi compreso). */
export function statDi(cat: CategoriaPresenze, atletaId: string, giorni: number, oggi: string): Statistica {
  const da = aggiungiGiorni(oggi, -giorni);
  const date = cat.giorni.filter((g) => g.data <= oggi && g.data > da).map((g) => g.data);
  const stati: Record<string, string> = {};
  for (const d of date) stati[d] = statoDi(cat, d, atletaId);
  return calcola(date, stati);
}

/** Allenamenti svolti nel periodo (come la card "Allenamenti" del sito: un orario = uno). */
export const allenamentiNelPeriodo = (cat: CategoriaPresenze, giorni: number, oggi: string) =>
  cat.giorni.filter((g) => g.data <= oggi && g.data > aggiungiGiorni(oggi, -giorni)).length;

export type Ordine = 'ass' | 'nome';
export function righeStat(cat: CategoriaPresenze, periodo: number, ordine: Ordine, oggi: string) {
  const righe = cat.atleti.map((a) => ({ a, s: statDi(cat, a.id, periodo, oggi) }));
  if (ordine === 'ass') {
    // chi non ha niente di segnato va in fondo: non si sa se manca
    righe.sort(
      (x, y) => Number(x.s.pct === null) - Number(y.s.pct === null) || (x.s.pct || 0) - (y.s.pct || 0) || x.a.cognome.localeCompare(y.a.cognome, 'it'),
    );
  }
  return righe;
}
