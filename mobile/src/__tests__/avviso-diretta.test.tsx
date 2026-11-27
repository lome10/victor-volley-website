import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import { inFinestra, partitaInDiretta } from '~/components/AvvisoDiretta';
import type { Partita } from '~/lib/dati';

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
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => dati })) as unknown as typeof fetch;
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
});
