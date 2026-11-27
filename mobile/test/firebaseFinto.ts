// Firebase finto per i test (al posto di ~/lib/firebase, vedi jest.setup.js). Niente rete, niente account veri.
import type { Atleta, Avviso, RataGrezza } from '~/lib/atleti';
import type { Evento, Utente } from '~/lib/firebase';

type Ascolto = (u: Utente | null) => void;

export const finto = {
  utente: null as Utente | null,
  /** L'unico accesso che riesce. */
  credenziali: { email: 'famiglia@prova.it', password: 'prova-prova-1' },
  schede: { conAccesso: [] as Atleta[], propria: null as Atleta | null, errore: false },
  avvisi: [] as Avviso[],
  avvisiErrore: false,
  rate: {} as Record<string, RataGrezza[]>,
  ascolti: new Set<Ascolto>(),
};

const avvisa = () => finto.ascolti.forEach((cb) => cb(finto.utente));

export function azzera() {
  finto.utente = null;
  finto.schede = { conAccesso: [], propria: null, errore: false };
  finto.avvisi = [];
  finto.avvisiErrore = false;
  finto.rate = {};
  finto.ascolti.clear();
}

export const seguiUtente = jest.fn((cb: Ascolto) => {
  finto.ascolti.add(cb);
  cb(finto.utente);
  return () => {
    finto.ascolti.delete(cb);
  };
});

export const accedi = jest.fn(async (email: string, password: string) => {
  if (email !== finto.credenziali.email || password !== finto.credenziali.password) return false;
  finto.utente = { uid: 'u-famiglia', email };
  avvisa();
  return true;
});

export const esci = jest.fn(async () => {
  finto.utente = null;
  avvisa();
});

export const leggiSchede = jest.fn(async (_uid: string) => finto.schede);

export const leggiAvvisi = jest.fn(async (categorie: string[]) => {
  if (finto.avvisiErrore) throw new Error('permesso negato');
  return finto.avvisi.filter((v) => categorie.includes(v.categoria || ''));
});

export const leggiRate = jest.fn(async (atletaId: string) => finto.rate[atletaId] ?? []);
export const leggiPresenze = jest.fn(async (_atletaId: string) => ({}) as Record<string, 'si' | 'no'>);
export const salvaPresenza = jest.fn(async (_ev: Evento, _a: Pick<Atleta, 'uid' | 'categoria'>, _r: 'si' | 'no', _uid: string) => {});
export const leggiPromemoria = jest.fn(async (_uid: string) => true);
export const salvaPromemoria = jest.fn(async (_uid: string, _email: boolean) => {});
export const cambiaPassword = jest.fn(async (_attuale: string, _nuova: string) => ({ ok: true, messaggio: 'Password aggiornata.' }));
