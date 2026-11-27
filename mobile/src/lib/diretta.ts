// Regole della pagina Diretta del sito (js/diretta.js e js/pages/diretta-2.js), senza grafica: si provano contro il sito.
import { useQuery } from '@tanstack/react-query';

import { SITO, type Partita, type Sponsor, type SquadraGirone } from '~/lib/dati';

export const CANALE_ID = 'UCMz111deWu5j1DFY0Mr-OOA'; // js/config.js
export const CANALE_URL = 'https://www.youtube.com/@VictorVolleyVita';
export const SPP_URL = 'https://victor-volley.setpointpulse.com/api/club/victor-volley/live';

// Ogni richiesta conta nel tetto di Vercel: ogni 5 s solo con una partita in corso, altrimenti ogni 60 s (come il sito).
export const OGNI_LIVE = 5000;
export const OGNI_FERMO = 60000;

export type StatoYoutube = { live: boolean; last: string | null };
export type SquadraSpp = { name: string; points: number; sets: number };
export type LiveSpp = {
  status: 'live' | 'finished' | 'none' | string;
  currentSet: number | null;
  serving: 'home' | 'away' | null;
  home: SquadraSpp | null;
  away: SquadraSpp | null;
  setHistory: { home: number; away: number }[];
};

export type Video =
  | { tipo: 'live'; src: string }
  | { tipo: 'ultimo'; src: string; id: string | null }
  | { tipo: 'nessuno' };

const CAT: Record<string, string> = {
  'prima divisione': 'Prima Divisione',
  'under 18': 'Under 18',
  'under 13': 'Under 13',
  'under 12': 'Under 12',
  minivolley: 'Minivolley',
};
export const catLabel = (cat: string) => CAT[(cat || '').toLowerCase()] || cat || '';

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
/** "2026-11-29", "19:00" -> "Dom 29 nov · 19:00" (formatData di js/diretta.js). */
export function dataCorta(data: string, ora?: string | null) {
  const d = new Date(data + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + (ora ? ' · ' + ora : '');
}

const due = (n: number) => (n < 10 ? '0' : '') + n;
export const oggiLocale = (d: Date) => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());

/** Video: la diretta del canale se trasmette (o se il tabellone dice che si gioca), altrimenti l'ultimo video. */
export function scegliVideo(yt: StatoYoutube, partitaInCorso: boolean): Video {
  if (yt.live || partitaInCorso) {
    return { tipo: 'live', src: 'https://www.youtube.com/embed/live_stream?channel=' + encodeURIComponent(CANALE_ID) + '&autoplay=1&mute=1&enablejsapi=1&origin=' + encodeURIComponent(SITO) };
  }
  if (yt.last && /^[\w-]{11}$/.test(yt.last)) return { tipo: 'ultimo', id: yt.last, src: 'https://www.youtube.com/embed/' + yt.last + '?autoplay=1&mute=1' };
  // Playlist dei caricamenti del canale (UC... -> UU...).
  if (CANALE_ID.startsWith('UC')) return { tipo: 'ultimo', id: null, src: 'https://www.youtube.com/embed/videoseries?list=' + encodeURIComponent('UU' + CANALE_ID.slice(2)) + '&autoplay=1&mute=1' };
  return { tipo: 'nessuno' };
}

/** Nome "pulito" per confrontare le squadre (VV.teamKey di js/data.js). */
export function teamKey(nome: string) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(asd|ssd|srl|arl|ssdarl|a s d|s s d|s r l)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "VICTOR VOLLEY VITA" -> "Victor Volley Vita". */
export function nomeLeggibile(n: string) {
  return String(n || '')
    .toLowerCase()
    .replace(/(^|[ .'-])([a-zà-ú])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** Nome e logo di una squadra del tabellone, riconosciuta per NOME nell'elenco del girone (VV.findSquadraGirone). */
export function squadraInfo(nome: string, squadre: SquadraGirone[]) {
  const key = teamKey(nome);
  let sq: SquadraGirone | null = null;
  if (key) {
    if (key.includes('victor')) sq = squadre.find((s) => s.home) ?? null;
    if (!sq) sq = squadre.find((s) => teamKey(s.nome) === key || s.id === key.replace(/ /g, '-')) ?? null;
  }
  const victor = /victor/i.test(nome || '');
  return { nome: sq?.nome || (victor ? 'Victor Volley' : nomeLeggibile(nome)), logo: sq?.logo || '', victor };
}

/** Partita di oggi in calendario con una delle due squadre del tabellone (per categoria e palazzetto). */
export function partitaDiOggi(j: LiveSpp, partite: Partita[], oggi: string) {
  const a = teamKey(j.home?.name ?? '');
  const b = teamKey(j.away?.name ?? '');
  return (
    partite.find((p) => {
      if (p.data !== oggi) return false;
      const c = teamKey(p.squadraCasa);
      const o = teamKey(p.squadraOspite);
      return c === a || c === b || o === a || o === b;
    }) ?? null
  );
}

export type Tabellone =
  | { tipo: 'nascosto' } // si gioca: il punteggio e' gia' nel video
  | { tipo: 'finita'; j: LiveSpp; cal: Partita | null }
  | { tipo: 'prossima'; p: Partita }
  | { tipo: 'ultimo'; p: Partita }
  | { tipo: 'vuoto' };

/** Cosa mostra il riquadro accanto al video. */
export function scegliTabellone(j: LiveSpp | null | undefined, partite: Partita[], adesso: Date): Tabellone {
  const oggi = oggiLocale(adesso);
  if (j && j.home && j.away) {
    if (j.status === 'live') return { tipo: 'nascosto' };
    if (j.status === 'finished') return { tipo: 'finita', j, cal: partitaDiOggi(j, partite, oggi) };
  }
  const prossima = partite.filter((p) => p.stato === 'programmata' && p.data >= oggi).sort((x, y) => (x.data > y.data ? 1 : -1))[0];
  if (prossima) return { tipo: 'prossima', p: prossima };
  const ultima = partite.filter((p) => p.stato === 'conclusa').sort((x, y) => (x.data < y.data ? 1 : -1))[0];
  if (ultima) return { tipo: 'ultimo', p: ultima };
  return { tipo: 'vuoto' };
}

function aGiri(lista: Sponsor[]) {
  const restano = lista.map((s) => ({ s, n: Math.max(1, s.ripetizioni || 1) }));
  const out: Sponsor[] = [];
  let ancora = true;
  while (ancora) {
    ancora = false;
    for (const r of restano) {
      if (r.n > 0) {
        out.push(r.s);
        r.n--;
        ancora = true;
      }
    }
  }
  return out;
}

/** Sponsor della Diretta: Gold in alto; nella fascia ogni Silver e' seguito da 2 Bronze (js/pages/diretta-2.js). */
export function sponsorDiretta(sponsor: Sponsor[]) {
  const tutti = sponsor.filter((s) => !!s.logo).sort((a, b) => (a.order || 0) - (b.order || 0));
  const liv = (s: Sponsor) => s.livello || 'silver';
  const gold = tutti.filter((s) => liv(s) === 'gold');
  const silver = aGiri(tutti.filter((s) => liv(s) === 'silver'));
  const bronze = aGiri(tutti.filter((s) => s.livello === 'bronze'));
  let fascia: Sponsor[];
  if (silver.length && bronze.length) {
    fascia = [];
    let i = 0;
    for (const s of silver) {
      fascia.push(s, bronze[i % bronze.length], bronze[(i + 1) % bronze.length]);
      i += 2;
    }
  } else fascia = silver.length ? silver : bronze;
  return { gold, fascia };
}

/** Il canale sta trasmettendo? Se il sito non risponde: no (si vede l'ultimo video). Ogni minuto, fermo con l'app in secondo piano. */
export const useYoutube = () =>
  useQuery({
    queryKey: ['youtube-live'],
    queryFn: async (): Promise<StatoYoutube> => {
      try {
        const r = await fetch(SITO + '/api/youtube-live', { cache: 'no-store' });
        const j = r.ok ? await r.json() : null;
        return { live: !!j?.live, last: j?.lastVideoId || null };
      } catch {
        return { live: false, last: null };
      }
    },
    refetchInterval: OGNI_FERMO,
    refetchIntervalInBackground: false,
  });

// Un errore di rete tiene il ritmo di prima (come il sito).
let ritmo = OGNI_FERMO;

/** Tabellone di Set Point Pulse: ogni 5 s se si gioca, ogni 60 s altrimenti; fermo con l'app in secondo piano. */
export const useTabellone = () =>
  useQuery({
    queryKey: ['spp-live'],
    queryFn: async (): Promise<LiveSpp | null> => {
      try {
        const r = await fetch(SPP_URL, { cache: 'no-store' });
        const j = r.ok ? ((await r.json()) as LiveSpp) : null;
        if (j) ritmo = j.status === 'live' ? OGNI_LIVE : OGNI_FERMO;
        return j;
      } catch {
        return null;
      }
    },
    refetchInterval: () => ritmo,
    refetchIntervalInBackground: false,
  });
