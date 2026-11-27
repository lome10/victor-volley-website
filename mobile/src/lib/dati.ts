// Contenuti pubblici del sito: /api/app-pubblico (vedi api/_app-pubblico-logic.js, e' il contratto).
import { QueryClient, focusManager, useQuery } from '@tanstack/react-query';
import { AppState } from 'react-native';

export const SITO = 'https://www.victorvolley.it';

export type Articolo = {
  id: number;
  title: string;
  date: string;
  categories: string[];
  image: string;
  imageFocus: string;
  coverRatio: string;
  sponsorIds: number[];
};
export type ArticoloInElenco = Articolo & { riassunto: string; heroOrder: number | null };
export type ArticoloIntero = Articolo & { content: string };
export type Sponsor = {
  id: number;
  nome: string;
  logo: string;
  url: string;
  order: number | null;
  /** 'gold' | 'silver' | 'bronze' (il sito tratta il vuoto come 'silver'). */
  livello: string;
  ripetizioni: number;
};

export type Stagione = { id: string; name: string; current: boolean };

export type Categoria = {
  id: number | null;
  name: string;
  abbr: string;
  color: string;
  description: string;
  schedule: string;
  showInSquadre: boolean;
};

/** Partita del calendario (collection "partite"): squadre come nomi liberi, loghi gia' risolti. */
export type Partita = {
  id: string;
  stagione: string;
  categoria: string;
  squadraCasa: string;
  squadraOspite: string;
  logoCasa: string;
  logoOspite: string;
  /** "AAAA-MM-GG" */
  data: string;
  /** "HH:MM" o vuoto */
  ora: string;
  palazzetto: string;
  /** 'programmata' | 'conclusa' | ... */
  stato: string;
  setCasa: number | null;
  setOspite: number | null;
  sppCode: string | null;
};

export type SquadraGirone = { id: string; nome: string; logo: string; home: boolean };

/** Partita del girone (siteData/girone): squadre come id dell'elenco squadre. */
export type PartitaGirone = {
  id: string;
  giornata: number | null;
  data: string;
  ora: string;
  palazzetto: string;
  squadra_casa: string;
  squadra_ospite: string;
  set_casa: number | null;
  set_ospite: number | null;
  /** Punti di ogni set: [casa, ospite]. */
  parziali: [number | null, number | null][];
};

export type GironeCategoria = { categoria: string; girone: string; squadre: string[]; partite: PartitaGirone[] };
export type Girone = { stagione: string; squadre: SquadraGirone[]; gironi: GironeCategoria[] };

export type Persona = {
  id: number | null;
  categoriaId: number | null;
  stagione: string;
  name: string;
  role: string;
  photo: string;
  photoFocus: string;
  order: number | null;
};
export type Giocatore = Persona & { number: number | null; gender: string };

export type FotoAlbum = { id: string; w: number | null; h: number | null };
export type Album = {
  id: number | null;
  slug: string;
  title: string;
  date: string;
  category: string;
  photoCount: number;
  photos: FotoAlbum[];
};

export type Maglia = { enabled: boolean; title: string; subtitle: string; revealDate: string; videoUrl: string };

/** Orario settimanale (collezione "allenamenti"). giorno: 1 = lunedi' … 7 = domenica; validoFino "AAAA-MM-GG" o "". */
export type Allenamento = {
  id: string;
  categoria: string;
  giorno: number | null;
  oraInizio: string;
  oraFine: string;
  luogo: string;
  note: string;
  validoFino: string;
};

/**
 * Un solo giorno diverso dal solito. id = "a-{id orario}-{data originale}" (la chiave che usa js/atleta.js).
 * Come il sito: oraFine e luogo valgono anche se "" (tolti); null = come al solito. data e oraInizio valgono solo se pieni.
 */
export type EccezioneAllenamento = {
  id: string;
  orarioId: string;
  dataOriginale: string;
  categoria: string;
  annullato: boolean;
  data: string | null;
  oraInizio: string | null;
  oraFine: string | null;
  luogo: string | null;
};

export type Pubblico = {
  versione: number;
  generatoIl: string;
  stagioni: Stagione[];
  categorie: Categoria[];
  articoli: ArticoloInElenco[];
  categorieArticoli: string[];
  partite: Partita[];
  girone: Girone;
  giocatori: Giocatore[];
  staff: Persona[];
  /** Gia' nell'ordine scelto in admin (i nuovi in cima, VVW-43), solo quelli con foto: l'app non li riordina. */
  album: Album[];
  /** Gia' ordinati per "order". */
  sponsor: Sponsor[];
  livelliSponsor: { gold: string; silver: string; bronze: string };
  maglia: Maglia;
  /** Dal 27/11 (sito 8271992). Facoltativi: finche' quel commit non e' online l'endpoint non li manda. */
  allenamenti?: Allenamento[];
  allenamentiEccezioni?: EccezioneAllenamento[];
};

export class NonTrovato extends Error {}

async function leggi<T>(percorso: string): Promise<T> {
  const res = await fetch(SITO + percorso);
  if (res.status === 404) throw new NonTrovato();
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()) as T;
}

export const creaClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1 } } });

// Quando l'app torna in primo piano i dati vecchi si rileggono (lezione SPP-97).
export function seguiPrimoPiano() {
  const ascolto = AppState.addEventListener('change', (stato) => focusManager.setFocused(stato === 'active'));
  return () => ascolto.remove();
}

export const usePubblico = () =>
  useQuery({ queryKey: ['pubblico'], queryFn: () => leggi<Pubblico>('/api/app-pubblico') });

export const useArticolo = (id: number) =>
  useQuery({
    queryKey: ['articolo', id],
    queryFn: () => leggi<ArticoloIntero>('/api/app-pubblico?articolo=' + id),
    staleTime: 60 * 60_000,
    retry: (volte, errore) => !(errore instanceof NonTrovato) && volte < 1,
  });
