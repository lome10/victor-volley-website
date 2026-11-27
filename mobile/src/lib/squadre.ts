// Regole della pagina Squadre del sito (js/pages/squadre-1.js). Funzioni pure, senza React.

type Persona = { name: string; stagione: string; order: number | null; role: string };
type Giocatore = Persona & { number: number | null; gender: string };

export const ORDINE_RUOLI = ['Palleggiatore', 'Laterale', 'Opposto', 'Centrale', 'Libero', 'Universale'];
const CALDI = new Set(['Laterale', 'Opposto', 'Universale']);
const FEMMINILI: Record<string, string> = { Palleggiatore: 'Palleggiatrice' };

/** Laterale, Opposto e Universale hanno la scheda "calda" (magenta), gli altri "fredda" (azzurra). */
export const ruoloCaldo = (ruolo: string) => CALDI.has(ruolo);

export function nomeRuolo(ruolo: string, genere: string) {
  return genere === 'F' && FEMMINILI[ruolo] ? FEMMINILI[ruolo] : ruolo;
}

export function iniziali(nome: string) {
  const parti = String(nome || '').trim().split(/\s+/).filter(Boolean);
  const a = parti[0] ? parti[0][0] : '';
  const b = parti.length > 1 ? parti[parti.length - 1][0] : '';
  return (a + b).toUpperCase();
}

/** Chi non ha una stagione si vede in tutte. */
export const inStagione = (p: { stagione: string }, stagione: string) => !p.stagione || p.stagione === stagione;

function chiave(p: Persona & { number?: number | null }, giocatore: boolean) {
  if (p.order != null) return p.order;
  return giocatore && p.number != null ? p.number : 999;
}

export function ordinaStaff<T extends Persona>(staff: T[], stagione: string) {
  return staff.filter((s) => inStagione(s, stagione)).sort((a, b) => chiave(a, false) - chiave(b, false));
}

export type Gruppo<T> = { ruolo: string; nome: string; caldo: boolean; persone: T[] };

/** Rosa divisa per ruolo, nell'ordine del sito; dentro ogni ruolo per numero di maglia. */
export function gruppiPerRuolo<T extends Giocatore>(giocatori: T[], stagione: string): Gruppo<T>[] {
  const ordinati = giocatori.filter((p) => inStagione(p, stagione)).sort((a, b) => chiave(a, true) - chiave(b, true));
  const gruppi = new Map<string, T[]>();
  for (const p of ordinati) {
    const r = p.role || 'Altro';
    gruppi.set(r, [...(gruppi.get(r) ?? []), p]);
  }
  const ruoli = [...ORDINE_RUOLI.filter((r) => gruppi.has(r)), ...[...gruppi.keys()].filter((r) => !ORDINE_RUOLI.includes(r))];
  return ruoli.map((r) => {
    const persone = gruppi.get(r)!.slice().sort((a, b) => (a.number || 99) - (b.number || 99));
    return { ruolo: r, nome: nomeRuolo(r, persone[0].gender), caldo: ruoloCaldo(r), persone };
  });
}

/** La stagione con current, altrimenti la prima. */
export function stagioneCorrente<T extends { current: boolean }>(stagioni: T[]): T | null {
  return stagioni.find((s) => s.current) ?? stagioni[0] ?? null;
}
