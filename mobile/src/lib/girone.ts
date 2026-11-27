// Classifica e "prossima partita" come il sito (js/girone.js): stessa logica, usata da Home e Calendario.
import type { Girone, Partita, PartitaGirone, SquadraGirone, Stagione } from '~/lib/dati';

const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

/** "2026-11-29", "19:00" -> "Domenica 29 Novembre · 19:00" (Girone.formatData del sito, senza Intl). */
export function formatData(data: string, ora?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data || '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + (ora ? ' · ' + ora : '');
}

export type RigaClassifica = {
  id: string;
  nome: string;
  pg: number;
  v: number;
  p: number;
  sf: number;
  ss: number;
  pf: number;
  ps: number;
  pts: number;
};

/** Girone di una categoria con le squadre risolte (nome + logo), come Girone.loadGironi del sito. */
export type GironeRisolto = {
  stagione: string;
  categoria: string;
  girone: string;
  squadre: SquadraGirone[];
  partite: PartitaGirone[];
};

export function gironiRisolti(g: Girone | undefined): GironeRisolto[] {
  if (!g) return [];
  const perId = new Map(g.squadre.map((s) => [s.id, s]));
  return g.gironi.map((x) => ({
    stagione: g.stagione,
    categoria: x.categoria,
    girone: x.girone,
    partite: x.partite,
    squadre: x.squadre.map((id) => perId.get(id) ?? { id, nome: id, logo: '', home: false }),
  }));
}

/** Squadra per id, o una di riserva con il solo id come nome (come Girone.squadraById). */
export function squadraById(squadre: SquadraGirone[], id: string): SquadraGirone {
  return squadre.find((s) => s.id === id) ?? { id, nome: id, logo: '', home: false };
}

function quoziente(fatti: number, subiti: number) {
  if (subiti === 0) return fatti > 0 ? Infinity : 0;
  return fatti / subiti;
}
const cmpDesc = (a: number, b: number) => (a === b ? 0 : a > b ? -1 : 1);

/**
 * Classifica italiana: 3-0/3-1 -> 3 punti al vincitore, 3-2 -> 2 e 1.
 * Ordine come Set Point Pulse (FIPAV): punti, vinte, quoziente set, quoziente punti, nome.
 */
export function calcolaClassifica(girone: Pick<GironeRisolto, 'squadre' | 'partite'>): RigaClassifica[] {
  const map: Record<string, RigaClassifica> = {};
  for (const s of girone.squadre) {
    map[s.id] = { id: s.id, nome: s.nome || s.id, pg: 0, v: 0, p: 0, sf: 0, ss: 0, pf: 0, ps: 0, pts: 0 };
  }
  for (const m of girone.partite) {
    if (m.set_casa == null || m.set_ospite == null) continue;
    const casa = map[m.squadra_casa];
    const ospite = map[m.squadra_ospite];
    if (!casa || !ospite) continue;
    const sc = +m.set_casa;
    const so = +m.set_ospite;
    casa.pg++;
    ospite.pg++;
    casa.sf += sc;
    casa.ss += so;
    ospite.sf += so;
    ospite.ss += sc;
    for (const set of m.parziali || []) {
      casa.pf += Number(set[0]);
      casa.ps += Number(set[1]);
      ospite.pf += Number(set[1]);
      ospite.ps += Number(set[0]);
    }
    const vince = sc > so ? casa : ospite;
    const perde = sc > so ? ospite : casa;
    vince.v++;
    perde.p++;
    if (sc + so === 5) {
      vince.pts += 2;
      perde.pts += 1;
    } else {
      vince.pts += 3;
    }
  }
  return Object.values(map).sort(
    (a, b) =>
      cmpDesc(a.pts, b.pts) ||
      cmpDesc(a.v, b.v) ||
      cmpDesc(quoziente(a.sf, a.ss), quoziente(b.sf, b.ss)) ||
      cmpDesc(quoziente(a.pf, a.ps), quoziente(b.pf, b.ps)) ||
      a.nome.localeCompare(b.nome, 'it'),
  );
}

export const FINESTRA = 5;

/** Specchietto di 5 squadre con la Victor al centro; ai bordi la finestra scorre (come il sito). */
export function finestraClassifica(classifica: { id: string }[], homeId: string | null) {
  const n = classifica.length;
  if (n <= FINESTRA) return { da: 0, a: n };
  const pos = classifica.findIndex((r) => r.id === homeId);
  if (pos < 0) return { da: 0, a: FINESTRA };
  const da = Math.max(0, Math.min(pos - 2, n - FINESTRA));
  return { da, a: da + FINESTRA };
}

export const eVictor = (nome: string) => (nome || '').toLowerCase().includes('victor');

const oggiISO = (adesso: Date) => adesso.toISOString().slice(0, 10);

/** La card "prossima partita" della Home: stagione corrente, categoria scelta, non conclusa, da oggi in poi. */
export function prossimaPartita(partite: Partita[], stagioni: Stagione[], categoria: string, adesso = new Date()) {
  const stagione = stagioni.find((s) => s.current);
  const oggi = oggiISO(adesso);
  return (
    partite
      .filter((p) => p.categoria === categoria && (!stagione || p.stagione === stagione.id) && p.stato !== 'conclusa' && p.data >= oggi)
      .sort((a, b) => (a.data > b.data ? 1 : -1))[0] ?? null
  );
}

/** Conto alla rovescia della card (giorni, ore, minuti) o null se la partita e' gia' iniziata. */
export function contoAllaRovescia(data: string, ora: string, adesso = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data || '');
  const h = /^(\d{1,2}):(\d{2})$/.exec(ora || '');
  if (!m || !h) return null;
  const inizio = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(h[1]), Number(h[2]));
  const diff = inizio.getTime() - adesso.getTime();
  if (diff <= 0) return null;
  const due = (n: number) => String(n).padStart(2, '0');
  return {
    giorni: due(Math.floor(diff / 86400000)),
    ore: due(Math.floor((diff % 86400000) / 3600000)),
    minuti: due(Math.floor((diff % 3600000) / 60000)),
  };
}
