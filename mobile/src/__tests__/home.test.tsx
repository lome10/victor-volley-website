import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { dataBreve, fotoTagliata, mosaico, sparse } from '~/components/home/AnteprimaGalleria';
import { divisioneSponsor } from '~/components/home/SponsorHome';
import { partiteStriscia } from '~/components/home/StrisciaPartite';
import { ultimeSei } from '~/components/home/UltimeNews';
import type { ArticoloInElenco, Partita, Pubblico, Sponsor } from '~/lib/dati';

// Moduli di Node solo per il test (l'app non ha i tipi di Node).
/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const fs = require('fs') as { readFileSync: (p: string, c: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
/* eslint-enable @typescript-eslint/no-require-imports */

const partita = (id: string, data: string, stato: string, extra: Partial<Partita> = {}): Partita => ({
  id, stagione: '2026/2027', categoria: 'Prima Divisione', squadraCasa: 'VICTOR VOLLEY VITA', squadraOspite: 'SQUADRA ' + id,
  logoCasa: '', logoOspite: '', data, ora: '18:00', palazzetto: 'Palazzetto ARKE', stato,
  setCasa: stato === 'conclusa' ? 3 : null, setOspite: stato === 'conclusa' ? 1 : null, sppCode: null, ...extra,
});
const articolo = (id: number, date: string): ArticoloInElenco => ({
  id, title: 'Notizia ' + id, date, categories: ['Società'], image: '', imageFocus: '', coverRatio: '4:5', sponsorIds: [], riassunto: '', heroOrder: null,
});
const sponsor = (id: number, livello: string, ripetizioni = 1, logo = 'https://x.it/l.png'): Sponsor => ({
  id, nome: 'Sponsor ' + id, logo, url: '', order: id, livello, ripetizioni,
});

describe('regole della home (uguali al sito)', () => {
  it('striscia: le 2 concluse piu\' recenti; se non ce ne sono, resta vuota come sul sito', () => {
    const partite = [partita('a', '2026-11-01', 'conclusa'), partita('b', '2026-11-22', 'conclusa'), partita('c', '2026-11-14', 'conclusa'), partita('d', '2026-11-29', 'programmata')];
    expect(partiteStriscia(partite).map((p) => p.id)).toEqual(['b', 'c']);
    expect(partiteStriscia([partita('d', '2026-11-29', 'programmata')])).toEqual([]);
  });

  it('ultime news: le 6 piu\' recenti', () => {
    const lista = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => articolo(n, '2026-10-' + String(10 + n)));
    expect(ultimeSei(lista).map((a) => a.id)).toEqual([8, 7, 6, 5, 4, 3]);
  });

  it('galleria: stessi indici di spread() del sito e mosaico a 2 colonne', () => {
    // Funzione spread() copiata dal sito (js/pages/index-3.js) per il confronto.
    const codice = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'js', 'pages', 'index-3.js'), 'utf8');
    const corpo = /function spread\(n, count\) \{([\s\S]*?)\n {2}\}/.exec(codice)![1];
    const spread = new Function('n', 'count', corpo) as (n: number, c: number) => number[];
    for (const n of [0, 1, 3, 7, 12, 168]) expect(sparse(n, 7)).toEqual(spread(n, 7));
    expect(mosaico(7).map((t) => [t.col, t.riga, t.c, t.r])).toEqual([[0, 0, 2, 2], [0, 2, 1, 2], [1, 2, 1, 1], [1, 3, 1, 1], [0, 4, 2, 1], [0, 5, 1, 1], [1, 5, 1, 1]]);
    expect(mosaico(3).map((t) => [t.col, t.riga, t.c, t.r])).toEqual([[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1]]);
    expect(fotoTagliata('abc', 450, 900)).toBe('https://res.cloudinary.com/plbxnqlc/image/upload/c_fill,g_auto,w_450,h_900,f_auto,q_auto/abc');
    expect(dataBreve('2026-11-15')).toBe('15 nov 2026');
  });

  it('sponsor: gold a parte, nella fascia solo chi ha il logo, ripetizioni intervallate', () => {
    const { gold, fascia } = divisioneSponsor([sponsor(1, 'silver', 2), sponsor(2, 'gold'), sponsor(3, 'bronze'), sponsor(4, '', 1, '')]);
    expect(gold.map((s) => s.id)).toEqual([2]);
    expect(fascia.map((s) => s.id)).toEqual([1, 3, 1]);
  });
});

const dati: Pubblico = {
  versione: 1, generatoIl: '2026-11-27T09:00:00Z',
  stagioni: [{ id: '2026/2027', name: '2026/2027', current: true }],
  categorie: [],
  articoli: [1, 2].map((n) => articolo(n, '2026-11-2' + n)),
  categorieArticoli: [],
  partite: [
    partita('fatta', '2026-11-22', 'conclusa', { squadraOspite: 'DREAM VOLLEY NARDO' }),
    partita('pd', '2099-11-29', 'programmata', { squadraCasa: 'ASD OLIMPIUS PARABITA', squadraOspite: 'VICTOR VOLLEY VITA' }),
    partita('u19', '2099-12-02', 'programmata', { categoria: 'Under 19', squadraOspite: 'CUORE DI MAMMA ASTRA VOLLEY' }),
  ],
  girone: {
    stagione: '2026/27',
    squadre: [
      { id: 'vv', nome: 'Victor Volley Vita', logo: '', home: true },
      { id: 'pa', nome: 'Olimpius Parabita', logo: '', home: false },
    ],
    gironi: [{ categoria: 'Prima Divisione', girone: 'B', squadre: ['vv', 'pa'], partite: [] }],
  },
  giocatori: [], staff: [],
  album: [{ id: 2, slug: 'terza-giornata', title: '3° giornata', date: '2026-11-15', category: 'Prima Divisione', photoCount: 2, photos: [{ id: 'f1', w: 2000, h: 1333 }, { id: 'f2', w: 2000, h: 1333 }] }],
  sponsor: [sponsor(1, 'gold')],
  livelliSponsor: { gold: '', silver: '', bronze: '' },
  maglia: { enabled: false, title: '', subtitle: '', revealDate: '', videoUrl: '' },
};

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => dati })) as unknown as typeof fetch;
});

describe('schermata', () => {
  it('mostra tutte le sezioni nell\'ordine del sito e cambia categoria', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(screen.getByText('Partite concluse')).toBeTruthy());
    expect(screen.getByLabelText(/DREAM VOLLEY NARDO, 3 a 1/)).toBeTruthy();
    expect(screen.getByText('Ultime news')).toBeTruthy();
    expect(screen.getByLabelText('Notizia 2')).toBeTruthy();
    // Prima Divisione: in trasferta a Parabita, classifica del girone B.
    expect(screen.getByText('Trasferta')).toBeTruthy();
    expect(screen.getByText('ASD OLIMPIUS PARABITA')).toBeTruthy();
    expect(screen.getByText('Prima Divisione · Girone B')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Under 19' }));
    expect(screen.getByText('Casa')).toBeTruthy();
    expect(screen.getByText('CUORE DI MAMMA ASTRA VOLLEY')).toBeTruthy();
    expect(screen.queryByText('Classifica')).toBeNull();
    expect(screen.getByText('3° giornata')).toBeTruthy();
    expect(screen.getByText('15 nov 2026 · 2 foto')).toBeTruthy();
    expect(screen.getByText('I nostri partner')).toBeTruthy();
    expect(screen.getByText('Vuoi giocare con noi?')).toBeTruthy();
  }, 60000);

  it('i tasti portano alle pagine del sito', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(screen.getByText('Vedi tutto il calendario')).toBeTruthy());
    await fireEvent.press(screen.getByText('Vedi tutto il calendario'));
    expect(screen).toHavePathname('/calendario');
  }, 60000);

  it('l\'anteprima della galleria apre l\'album', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(screen.getByText("Vedi l'album completo")).toBeTruthy());
    await fireEvent.press(screen.getByText("Vedi l'album completo"));
    expect(screen).toHavePathname('/galleria');
    expect(screen).toHaveSearchParams({ album: 'terza-giornata' });
  }, 60000);
});
