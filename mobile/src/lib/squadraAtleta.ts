// Scheda Squadra dell'area atleti (_renderSquadra di js/atleta.js): solo nome, numero e ruolo,
// gli stessi dati gia' pubblici nella pagina Squadre. Funzione pura.
import type { Pubblico } from '~/lib/dati';
import { inStagione, nomeRuolo, stagioneCorrente } from '~/lib/squadre';

type Ordinabile = { order: number | null; number?: number | null };
const ordine = (p: Ordinabile) => (p.order != null ? p.order : p.number != null ? p.number : 999);

export type RigaSquadra = { chiave: string; numero: string; nome: string; ruolo: string };

/** null = squadra non ancora assegnata (o categoria che non esiste piu'). */
export function rosaAtleta(categoria: string | undefined, dati: Pick<Pubblico, 'stagioni' | 'categorie' | 'giocatori' | 'staff'>) {
  const cat = categoria ? dati.categorie.find((c) => c.name === categoria) : undefined;
  if (!cat) return null;
  const stagione = stagioneCorrente(dati.stagioni);
  const id = stagione?.id ?? '';
  const nella = (r: { stagione: string }) => !id || inStagione(r, id);
  const staff: RigaSquadra[] = dati.staff
    .filter((s) => s.categoriaId === cat.id && nella(s))
    .sort((x, y) => ordine(x) - ordine(y))
    .map((s, i) => ({ chiave: 's' + i, numero: '', nome: s.name, ruolo: s.role || '' }));
  const giocatori: RigaSquadra[] = dati.giocatori
    .filter((p) => p.categoriaId === cat.id && nella(p))
    .sort((x, y) => ordine(x) - ordine(y))
    .map((p, i) => ({ chiave: 'g' + i, numero: p.number != null ? String(p.number) : '', nome: p.name, ruolo: nomeRuolo(p.role || '', p.gender) }));
  return {
    nome: cat.name,
    stagione: stagione ? 'Stagione ' + (stagione.name || stagione.id) : '',
    staff,
    giocatori,
  };
}
