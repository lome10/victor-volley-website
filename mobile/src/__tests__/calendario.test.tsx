import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { condividiIcs } from '~/lib/condividiIcs';

import {
  categorie,
  dataBreve,
  dataEstesa,
  dataScheda,
  elencoCategoria,
  fileIcs,
  giornate,
  intervallo,
  linkGoogleCalendar,
  nomeFileIcs,
  prossimaDellaCategoria,
  quantoManca,
  slug,
  sponsorCalendario,
  type PartitaCalendario,
} from '~/lib/calendario';
import type { Girone } from '~/lib/dati';
import { gironiRisolti } from '~/lib/girone';

/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const fs = require('fs') as { readFileSync: (p: string, c: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
/* eslint-enable @typescript-eslint/no-require-imports */

// Girone vero letto da /api/app-pubblico il 27/11/2026 (stesso file del test di girone.ts).
const vero: Girone = JSON.parse(fs.readFileSync(path.join(__dirname, 'dati', 'girone-27-11-2026.json'), 'utf8'));

// Il modulo nativo di condivisione non c'e' nei test: si controlla solo cosa gli arriva.
jest.mock('~/lib/condividiIcs', () => ({ condividiIcs: jest.fn(async () => undefined) }));

// Date relative a oggi, cosi' il test non scade.
const giorno = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const partita = (o: Partial<PartitaCalendario>): PartitaCalendario => ({
  id: 'p' + Math.random().toString(36).slice(2), stagione: '2026/2027', categoria: 'Under 13', squadraCasa: 'Victor Volley', squadraOspite: 'Squadra A',
  logoCasa: '', logoOspite: '', data: giorno(5), ora: '18:00', palazzetto: 'Palazzetto di Vita', stato: 'programmata', setCasa: null, setOspite: null, sppCode: null, ...o,
});

describe('regole del calendario (come js/pages/calendario-1.js)', () => {
  it('date come il sito', () => {
    expect(dataScheda('2025-11-08', '18:30')).toBe('Sabato 8 Novembre 2025 - 18:30');
    expect(dataEstesa('2026-11-01', '11:00')).toBe('Domenica 1 novembre · 11:00');
    expect(dataEstesa('', '')).toBe('Data da definire');
    expect(dataBreve('2026-10-31', '18:00')).toBe('Sab 31 ott · 18:00');
    expect(quantoManca('2026-11-27', '2026-11-27')).toBe('Oggi');
    expect(quantoManca('2026-11-28', '2026-11-27')).toBe('Domani');
    expect(quantoManca('2026-12-02', '2026-11-27')).toBe('tra 5 giorni');
    expect(intervallo('2026-10-31', '2026-10-31')).toBe('31 ott');
    expect(intervallo('2026-11-07', '2026-11-08')).toBe('7–8 nov');
    expect(intervallo('2026-10-31', '2026-11-02')).toBe('31 ott – 2 nov');
  });

  it('link di Google Calendar: 2 ore, fuso di Roma, a fine giornata non passa la mezzanotte', () => {
    const u = linkGoogleCalendar({ data: '2026-12-05', ora: '18:30', casa: 'Victor Volley', ospite: 'Otranto', palazzetto: 'PalaVita', categoria: 'Prima Divisione' });
    expect(u).toContain('dates=20261205T183000/20261205T203000');
    expect(u).toContain('ctz=Europe/Rome');
    expect(u).toContain('text=' + encodeURIComponent('Victor Volley - Otranto (Prima Divisione)'));
    expect(u).toContain('location=PalaVita');
    expect(linkGoogleCalendar({ data: '2026-12-05', ora: '22:30', casa: 'a', ospite: 'b', palazzetto: '' })).toContain('/20261205T235900');
    expect(linkGoogleCalendar({ data: '2026-12-31', ora: '', casa: 'a', ospite: 'b', palazzetto: '' })).toContain('dates=20261231/20270101');
  });

  it('categorie con Prima Divisione per prima, slug come il sito', () => {
    expect(categorie([partita({ categoria: 'Under 19' }), partita({ categoria: 'Prima Divisione' }), partita({ categoria: 'Under 19' })])).toEqual(['Prima Divisione', 'Under 19']);
    expect(slug('Società Più')).toBe('societa-piu');
  });

  it('elenco: stagione, avversari ordinati, filtro, prossima e "undefined" escluso', () => {
    const tutte = [
      partita({ squadraOspite: 'Zeta', data: giorno(-3), stato: 'conclusa', setCasa: 3, setOspite: 1 }),
      partita({ squadraOspite: 'Alfa', data: giorno(2) }),
      partita({ squadraCasa: 'Beta', squadraOspite: 'Victor Volley', data: giorno(9) }),
      partita({ squadraOspite: 'undefined', data: giorno(12) }),
      partita({ squadraOspite: 'Gamma', stagione: '2025/2026', data: giorno(4) }),
    ];
    const e = elencoCategoria(tutte, 'Under 13', '2026/2027', '', giorno(0));
    expect(e.avversari).toEqual(['Alfa', 'Beta', 'Zeta']);
    expect(e.partite.map((p) => p.squadraOspite)).toEqual(['Zeta', 'Alfa', 'Victor Volley', 'undefined']);
    expect(e.prossima).toBe(1);
    expect(e.future).toHaveLength(2);
    expect(elencoCategoria(tutte, 'Under 13', '2026/2027', 'Beta', giorno(0)).partite).toHaveLength(1);
    expect(elencoCategoria(tutte, 'Under 13', '2026/2027', 'Nessuno', giorno(0)).filtro).toBe('');
    expect(prossimaDellaCategoria(tutte, 'Under 13', '2026/2027', giorno(0))?.squadraOspite).toBe('Alfa');
  });

  it('file .ics come il sito: orario flottante di 2 ore, giorno intero senza orario, testo protetto', () => {
    const adesso = new Date(Date.UTC(2026, 10, 27, 9, 5, 7));
    const testo = fileIcs([
      partita({ id: 'a1', data: '2026-11-29', ora: '19:00', squadraCasa: 'ASD Olimpius', squadraOspite: 'Victor Volley Vita', categoria: 'Prima Divisione', palazzetto: 'Pallone, Parabita; lato B' }),
      partita({ id: 'a2', data: '2026-12-31', ora: '', palazzetto: '' }),
      partita({ id: 'a3', data: '2026-12-05', ora: '22:30' }),
    ], adesso);
    expect(testo.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Victor Volley//Calendario//IT\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n')).toBe(true);
    expect(testo.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(testo).toContain('UID:partita-a1@victorvolley.it\r\nDTSTAMP:20261127T090507Z\r\nDTSTART:20261129T190000\r\nDTEND:20261129T210000');
    expect(testo).toContain('SUMMARY:ASD Olimpius - Victor Volley Vita (Prima Divisione)');
    expect(testo).toContain('LOCATION:Pallone\\, Parabita\\; lato B');
    expect(testo).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101');
    expect(testo).toContain('DTSTART:20261205T223000\r\nDTEND:20261205T235900');
    expect(testo.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    // Righe piegate a 74 caratteri come il sito.
    const lunga = fileIcs([partita({ palazzetto: 'x'.repeat(100) })], adesso);
    expect(lunga.split('\r\n').every((riga) => riga.length <= 75)).toBe(true);
    expect(nomeFileIcs('Prima Divisione', '')).toBe('victor-volley-prima-divisione.ics');
    expect(nomeFileIcs('Under 13', 'Città Nuova')).toBe('victor-volley-under-13-citta-nuova.ics');
  });

  it('sponsor del calendario per nome, solo con logo', () => {
    expect(sponsorCalendario([{ nome: 'PUGLIA IN FOOD srl', logo: '' }, { nome: 'Puglia in Food', logo: 'x.png' }])?.logo).toBe('x.png');
    expect(sponsorCalendario([{ nome: 'Altro', logo: 'y.png' }])).toBeNull();
  });

  it('giornate del girone vero: 13 squadre, 6 partite e 1 che riposa per giornata', () => {
    const pd = gironiRisolti(vero).find((g) => g.categoria === 'Prima Divisione')!;
    const { giornate: elenco, prossima } = giornate(pd.partite, pd.squadre, '2026-11-27');
    expect(elenco).toHaveLength(26);
    expect(elenco.map((g) => g.numero)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    elenco.forEach((g) => {
      expect(g.partite).toHaveLength(6);
      expect(g.riposa).toHaveLength(1);
    });
    expect(prossima).not.toBeNull();
    const vv = pd.squadre.find((s) => s.home)!.id;
    expect([prossima!.squadra_casa, prossima!.squadra_ospite]).toContain(vv);
    expect(prossima!.set_casa).toBeNull();
  });
});

const PUGLIA = { id: 1, nome: 'Puglia in food', logo: 'https://res.cloudinary.com/x/image/upload/v1/p.png', url: '', order: 2, livello: 'gold', ripetizioni: 1 };
const PARTITE = [
  partita({ categoria: 'Prima Divisione', squadraOspite: 'Otranto', data: giorno(3) }),
  partita({ categoria: 'Prima Divisione', squadraOspite: 'Nardò', data: giorno(10) }),
  partita({ squadraOspite: 'Alfa', data: giorno(-4), stato: 'conclusa', setCasa: 3, setOspite: 1 }),
  partita({ squadraCasa: 'Beta', squadraOspite: 'Victor Volley', data: giorno(6) }),
];

beforeEach(() => {
  const corpo = {
    stagioni: [{ id: '2025/2026', name: '2025/2026', current: false }, { id: '2026/2027', name: '2026/2027', current: true }],
    partite: PARTITE, girone: vero, sponsor: [PUGLIA], articoli: [],
  };
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => corpo })) as unknown as typeof fetch;
});

describe('schermata Calendario', () => {
  it('testata, barra, girone con giornate e classifica, poi categoria senza girone col filtro', async () => {
    const apri = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderRouter('./src/app', { initialUrl: '/calendario' });
    await waitFor(() => expect(screen.getByText('1ª giornata')).toBeTruthy());
    expect(screen.getByText('Calendario e risultati')).toBeTruthy();
    expect(screen.getByText('Stagione 2026/2027')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Prima Divisione', selected: true })).toBeTruthy();
    expect(screen.getByLabelText('Puglia in food')).toBeTruthy();
    expect(screen.getByText('Victor Volley – Otranto')).toBeTruthy();
    expect(screen.getByText('26ª giornata')).toBeTruthy();
    expect(screen.getAllByText(/^Riposa: /)).toHaveLength(26);
    expect(screen.getByText('CLASSIFICA')).toBeTruthy();
    expect(screen.getByText('Girone B · Stagione 2026/27')).toBeTruthy();
    // Col girone il filtro e le schede non ci sono (come il sito).
    expect(screen.queryByText('Squadra avversaria')).toBeNull();

    // "Aggiungi tutte" anche col girone, come il sito: le partite future della categoria.
    await fireEvent.press(screen.getByRole('button', { name: 'Aggiungi tutte al calendario' }));
    expect(condividiIcs).toHaveBeenCalledWith(expect.stringContaining('SUMMARY:Victor Volley - Nardò (Prima Divisione)'), 'victor-volley-prima-divisione.ics');

    await fireEvent.press(screen.getAllByText('Aggiungi al calendario')[0]);
    expect(apri).toHaveBeenCalledWith(expect.stringContaining('https://calendar.google.com/calendar/render?action=TEMPLATE'));

    await fireEvent.press(screen.getByRole('tab', { name: 'Under 13' }));
    expect(screen.queryByText('1ª giornata')).toBeNull();
    expect(screen.queryByText('CLASSIFICA')).toBeNull();
    expect(screen.getAllByText('PROSSIMA PARTITA').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Trasferta')).toBeTruthy();
    expect(screen.getByText('Vai alla prossima partita ↓')).toBeTruthy();
    expect(screen.getByText('Alfa')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Squadra avversaria' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.queryByText('Alfa')).toBeNull();
    expect(screen.getAllByText('Beta')).toHaveLength(2);
    // Una sola partita futura: "Aggiungi tutte" sparisce (il sito lo mostra da 2 in su).
    expect(screen.queryByRole('button', { name: 'Aggiungi tutte al calendario' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: '2025/2026' }));
    expect(screen.getByText('Stagione 2025/2026')).toBeTruthy();
    expect(screen.getByText(/Calendario in arrivo: le date/)).toBeTruthy();
    apri.mockRestore();
  }, 60000);
});
