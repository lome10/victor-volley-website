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
export type Sponsor = { id: number; nome: string; logo: string; url: string };
export type Pubblico = { articoli: ArticoloInElenco[]; sponsor: Sponsor[] };

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
