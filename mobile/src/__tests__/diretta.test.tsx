import { renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { goldInRiga } from '~/components/diretta/SponsorGold';
import type { Partita, Sponsor } from '~/lib/dati';
import { dataCorta, oggiLocale, scegliTabellone, scegliVideo, sponsorDiretta, squadraInfo, teamKey, type LiveSpp } from '~/lib/diretta';

// Moduli di Node solo per il test (l'app non ha i tipi di Node).
/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const fs = require('fs') as { readFileSync: (p: string, c: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
/* eslint-enable @typescript-eslint/no-require-imports */
const sito = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...p), 'utf8');

const partita = (id: string, data: string, stato: string, extra: Partial<Partita> = {}): Partita => ({
  id, stagione: '2026/2027', categoria: 'Prima Divisione', squadraCasa: 'VICTOR VOLLEY VITA', squadraOspite: 'SQUADRA ' + id,
  logoCasa: '', logoOspite: '', data, ora: '19:00', palazzetto: 'Palazzetto ARKE', stato,
  setCasa: stato === 'conclusa' ? 3 : null, setOspite: stato === 'conclusa' ? 1 : null, sppCode: null, ...extra,
});
const sponsor = (id: number, livello: string, ripetizioni = 1): Sponsor => ({ id, nome: 'S' + id, logo: 'https://x.it/' + id + '.png', url: '', order: id, livello, ripetizioni });
const spp = (status: string): LiveSpp => ({
  status, currentSet: 3, serving: 'home', home: { name: 'VICTOR VOLLEY VITA', points: 12, sets: 2 }, away: { name: 'ASD DREAM VOLLEY NARDO', points: 10, sets: 1 },
  setHistory: [{ home: 25, away: 20 }, { home: 22, away: 25 }, { home: 25, away: 18 }],
});

describe('regole della Diretta (uguali al sito)', () => {
  it('data corta e nomi delle squadre come js/diretta.js e js/data.js', () => {
    const fd = /function formatData\(dateStr, ora\) \{([\s\S]*?)\n {2}\}/.exec(sito('js', 'diretta.js'))![1];
    const formatData = new Function('dateStr', 'ora', fd) as (d: string, o: string | null) => string;
    for (const [d, o] of [['2026-11-29', '19:00'], ['2027-01-01', null], ['2026-02-28', '']] as [string, string | null][]) expect(dataCorta(d, o)).toBe(formatData(d, o));
    const tk = /teamKey: function \(nome\) \{([\s\S]*?)\n {4}\}/.exec(sito('js', 'data.js'))![1];
    const teamKeySito = new Function('nome', tk) as (n: string) => string;
    for (const n of ['ASD Dream Volley Nardò', 'S.S.D. A R.L. Volley Alezio 98', 'VICTOR VOLLEY VITA', '', 'Cuore di Mamma – Astra']) expect(teamKey(n)).toBe(teamKeySito(n));
    const squadre = [{ id: 'vv', nome: 'Victor Volley Vita', logo: 'v.png', home: true }, { id: 'dream-volley-nardo', nome: 'Dream Volley Nardò', logo: 'd.png', home: false }];
    expect(squadraInfo('VICTOR VOLLEY PUGLIA IN FOOD', squadre)).toMatchObject({ nome: 'Victor Volley Vita', logo: 'v.png' });
    expect(squadraInfo('ASD DREAM VOLLEY NARDO', squadre)).toMatchObject({ nome: 'Dream Volley Nardò', logo: 'd.png' });
    expect(squadraInfo("PALLAVOLO SAN PIETRO-IN L'AMA", squadre)).toMatchObject({ nome: "Pallavolo San Pietro-In L'Ama", logo: '' });
  });

  it('video: diretta se il canale trasmette o se si gioca, altrimenti l\'ultimo video', () => {
    expect(scegliVideo({ live: true, last: null }, false)).toMatchObject({ tipo: 'live' });
    expect(scegliVideo({ live: false, last: 'AMh2vYbFd4A' }, true).tipo).toBe('live');
    expect(scegliVideo({ live: false, last: 'AMh2vYbFd4A' }, false)).toEqual({ tipo: 'ultimo', id: 'AMh2vYbFd4A', src: 'https://www.youtube.com/embed/AMh2vYbFd4A?autoplay=1&mute=1' });
    // Senza ultimo video: playlist dei caricamenti del canale (UC... -> UU...).
    expect(scegliVideo({ live: false, last: null }, false)).toMatchObject({ tipo: 'ultimo', id: null, src: expect.stringContaining('videoseries?list=UUMz111deWu5j1DFY0Mr-OOA') });
    expect((scegliVideo({ live: true, last: null }, false) as { src: string }).src).toContain('live_stream?channel=UCMz111deWu5j1DFY0Mr-OOA&autoplay=1&mute=1&enablejsapi=1&origin=https%3A%2F%2Fwww.victorvolley.it');
  });

  it('tabellone: nascosto se si gioca, risultato se finita, poi prossima, ultimo risultato o niente', () => {
    const adesso = new Date('2026-11-29T21:30:00');
    const oggi = oggiLocale(adesso);
    const partite = [partita('oggi', oggi, 'programmata', { squadraOspite: 'DREAM VOLLEY NARDO' }), partita('dopo', '2026-12-06', 'programmata'), partita('vecchia', '2026-11-01', 'conclusa'), partita('recente', '2026-11-22', 'conclusa')];
    expect(scegliTabellone(spp('live'), partite, adesso).tipo).toBe('nascosto');
    expect(scegliTabellone(spp('finished'), partite, adesso)).toMatchObject({ tipo: 'finita', cal: { id: 'oggi' } });
    expect(scegliTabellone(null, partite, adesso)).toMatchObject({ tipo: 'prossima', p: { id: 'oggi' } });
    expect(scegliTabellone({ ...spp('none'), home: null, away: null }, partite.slice(2), adesso)).toMatchObject({ tipo: 'ultimo', p: { id: 'recente' } });
    expect(scegliTabellone(null, [], adesso).tipo).toBe('vuoto');
  });

  it('sponsor: Gold a parte, nella fascia ogni Silver seguito da 2 Bronze; Gold in riga se ci stanno', () => {
    const { gold, fascia } = sponsorDiretta([sponsor(1, 'silver', 2), sponsor(2, 'gold'), sponsor(3, 'bronze'), sponsor(4, 'bronze'), sponsor(5, 'bronze'), { ...sponsor(6, 'silver'), logo: '' }]);
    expect(gold.map((s) => s.id)).toEqual([2]);
    expect(fascia.map((s) => s.id)).toEqual([1, 3, 4, 1, 5, 3]);
    expect(goldInRiga(2, 390)).toBe(true);
    expect(goldInRiga(3, 390)).toBe(true);
    expect(goldInRiga(4, 390)).toBe(false);
  });
});

describe('schermata Diretta', () => {
  const oggi = oggiLocale(new Date());
  const rispondi = (sppDati: LiveSpp, yt: object) => {
    const pubblico = {
      partite: [partita('p', '2099-12-06', 'programmata', { squadraOspite: 'DREAM VOLLEY NARDO' })], articoli: [], album: [], stagioni: [],
      sponsor: [sponsor(1, 'gold'), sponsor(2, 'silver'), sponsor(3, 'bronze')], girone: { stagione: '', squadre: [], gironi: [] },
      maglia: { enabled: false, title: '', subtitle: '', revealDate: '', videoUrl: '' },
    };
    globalThis.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('setpointpulse') ? sppDati : url.includes('youtube-live') ? yt : pubblico),
    })) as unknown as typeof fetch;
  };

  it('senza partita: ultimo video, prossima diretta, messaggio, sponsor e invito', async () => {
    rispondi({ ...spp('none'), home: null, away: null }, { live: false, lastVideoId: 'AMh2vYbFd4A' });
    await renderRouter('./src/app', { initialUrl: '/diretta' });
    await waitFor(() => expect(screen.getByText('Prossima diretta')).toBeTruthy());
    expect(screen.getByText('DREAM VOLLEY NARDO')).toBeTruthy();
    expect(screen.getByText('Il tabellone si attiva da solo quando inizia la partita.')).toBeTruthy();
    expect(screen.getByText(/Nessuna partita è al momento in diretta/)).toBeTruthy();
    expect(screen.getByLabelText('Ultimo video Victor Volley')).toBeTruthy();
    expect(screen.queryByText('🔊 Attiva audio')).toBeNull();
    expect(screen.getByText('Entra a far parte della famiglia Victor')).toBeTruthy();
    expect(screen.getAllByLabelText('S1').length).toBeGreaterThan(0);
  }, 60000);

  it('partita in corso: diretta con Attiva audio e niente tabellone', async () => {
    rispondi(spp('live'), { live: false, lastVideoId: 'AMh2vYbFd4A' });
    await renderRouter('./src/app', { initialUrl: '/diretta' });
    await waitFor(() => expect(screen.getByText('🔊 Attiva audio')).toBeTruthy());
    expect(screen.getByLabelText('Diretta YouTube Victor Volley')).toBeTruthy();
    expect(screen.getByText('Guarda su YouTube ↗')).toBeTruthy();
    expect(screen.queryByText('Prossima diretta')).toBeNull();
    expect(screen.queryByText(/Nessuna partita è al momento in diretta/)).toBeNull();
  }, 60000);

  it('partita finita: risultato con i set', async () => {
    rispondi(spp('finished'), { live: false, lastVideoId: 'AMh2vYbFd4A' });
    await renderRouter('./src/app', { initialUrl: '/diretta' });
    await waitFor(() => expect(screen.getByText('Partita conclusa')).toBeTruthy());
    expect(screen.getByLabelText('Set vinti 2 a 1')).toBeTruthy();
    expect(screen.getByText('25–20')).toBeTruthy();
    // "Victor Volley" c'e' anche nella barra in alto: qui conta che ci sia anche nel tabellone.
    expect(screen.getAllByText('Victor Volley').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Asd Dream Volley Nardo')).toBeTruthy();
    expect(oggi).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }, 60000);
});
