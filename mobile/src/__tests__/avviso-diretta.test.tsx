import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import { inFinestra, partitaInDiretta } from '~/components/AvvisoDiretta';
import type { Partita } from '~/lib/dati';

// Domande del sito (data/chatbot.json), per avere la nuvoletta "Ciao, sono Victor!".
/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const path = require('path') as { join: (...p: string[]) => string };
const BOT = require(path.join(__dirname, '..', '..', '..', 'data', 'chatbot.json')) as { invito: string };
/* eslint-enable @typescript-eslint/no-require-imports */

const p = (extra: Partial<Partita> = {}): Partita => ({
  id: 'x', stagione: '2026/2027', categoria: 'Prima Divisione', squadraCasa: 'VICTOR VOLLEY VITA', squadraOspite: 'DREAM VOLLEY',
  logoCasa: '', logoOspite: '', data: '2026-11-29', ora: '19:00', palazzetto: '', stato: 'programmata',
  setCasa: null, setOspite: null, sppCode: 'ABC123', ...extra,
});
const alle = (ora: string, data = '2026-11-29') => new Date(data + 'T' + ora + ':00');

describe('avviso In diretta (regola di js/live-banner.js)', () => {
  it('finestra: da 1h30 prima a 4 ore dopo', () => {
    expect(inFinestra(p(), alle('17:29'))).toBe(false);
    expect(inFinestra(p(), alle('17:30'))).toBe(true);
    expect(inFinestra(p(), alle('23:00'))).toBe(true);
    expect(inFinestra(p(), alle('23:01'))).toBe(false);
    expect(inFinestra(p({ ora: '' }), alle('08:00'))).toBe(true);
  });

  it('solo oggi, non conclusa, con codice SPP e squadre vere', () => {
    expect(partitaInDiretta([p()], alle('19:30'))?.id).toBe('x');
    expect(partitaInDiretta([p()], alle('19:30', '2026-11-28'))).toBeNull();
    expect(partitaInDiretta([p({ stato: 'conclusa' })], alle('19:30'))).toBeNull();
    expect(partitaInDiretta([p({ sppCode: null })], alle('19:30'))).toBeNull();
    expect(partitaInDiretta([p({ squadraOspite: 'undefined' })], alle('19:30'))).toBeNull();
    expect(partitaInDiretta([p({ id: 'a', sppCode: null }), p({ id: 'b' })], alle('19:30'))?.id).toBe('b');
  });
});

describe('avviso a schermo', () => {
  const d = new Date();
  const oggi = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  beforeEach(() => {
    const dati = { partite: [p({ data: oggi, ora: '' })], articoli: [], album: [], sponsor: [], stagioni: [], girone: { stagione: '', squadre: [], gironi: [] } };
    globalThis.fetch = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.includes('chatbot.json') ? BOT : dati) })) as unknown as typeof fetch;
  });

  it('compare nelle news, porta alla diretta, non compare nella galleria, si chiude con la X', async () => {
    await renderRouter('./src/app', { initialUrl: '/news' });
    await waitFor(() => expect(screen.getByText('VICTOR VOLLEY VITA – DREAM VOLLEY')).toBeTruthy());
    // Sopra il tasto "Chiedi a Victor" (in questo test i dati del tasto arrivano): 12 + 58 + 12.
    expect(StyleSheet.flatten(screen.getByLabelText('Partita in diretta').props.style).bottom).toBe(82);
    await fireEvent.press(screen.getByText('Guarda →'));
    expect(screen).toHavePathname('/diretta');
    expect(screen.queryByText('In diretta')).toBeNull();
  }, 60000);

  it('la X lo chiude', async () => {
    await renderRouter('./src/app', { initialUrl: '/calendario' });
    await waitFor(() => expect(screen.getByLabelText('Chiudi avviso')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Chiudi avviso'));
    expect(screen.queryByText('Guarda →')).toBeNull();
  }, 60000);

  // Scelta di Lorenzo (27/11): con l'avviso la nuvoletta non compare, perche' coprirebbe "Guarda →" e la X. Il tasto resta.
  it('con l\'avviso la nuvoletta "Ciao, sono Victor!" non compare, il tasto si', async () => {
    // Un'altra partita: la "x" e' gia' stata chiusa nel test precedente e resta chiusa finche' l'app e' aperta.
    const dati = { partite: [p({ id: 'y', data: oggi, ora: '' })], articoli: [], album: [], sponsor: [], stagioni: [], girone: { stagione: '', squadre: [], gironi: [] } };
    globalThis.fetch = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.includes('chatbot.json') ? BOT : dati) })) as unknown as typeof fetch;
    await renderRouter('./src/app', { initialUrl: '/news' });
    await waitFor(() => expect(screen.getByText('Guarda →')).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText("Apri l'assistente Victor")).toBeTruthy());
    // Passati i 3,5 s dell'invito: la nuvoletta deve restare chiusa.
    await act(async () => {
      jest.advanceTimersByTime(4200);
    });
    expect(screen.queryByText(BOT.invito)).toBeNull();
    expect(screen.getByText('Guarda →')).toBeTruthy();
  }, 60000);

  it('controprova: senza partita in diretta la nuvoletta compare dopo 3,5 s', async () => {
    const vuoti = { partite: [], articoli: [], album: [], sponsor: [], stagioni: [], girone: { stagione: '', squadre: [], gironi: [] } };
    globalThis.fetch = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.includes('chatbot.json') ? BOT : vuoti) })) as unknown as typeof fetch;
    await renderRouter('./src/app', { initialUrl: '/news' });
    await waitFor(() => expect(screen.getByText(BOT.invito)).toBeTruthy(), { timeout: 6000 });
    expect(screen.queryByText('Guarda →')).toBeNull();
  }, 60000);
});
