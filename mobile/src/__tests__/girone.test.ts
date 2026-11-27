import type { Girone, Partita } from '~/lib/dati';
import {
  calcolaClassifica,
  contoAllaRovescia,
  finestraClassifica,
  formatData,
  gironiRisolti,
  prossimaPartita,
  squadraById,
} from '~/lib/girone';

// Moduli di Node solo per il test (l'app non ha i tipi di Node).
/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const fs = require('fs') as { readFileSync: (p: string, c: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
const vm = require('vm') as { runInNewContext: (codice: string, contesto: object) => void };
/* eslint-enable @typescript-eslint/no-require-imports */

// Girone vero letto da /api/app-pubblico il 27/11/2026.
const vero: Girone = JSON.parse(fs.readFileSync(path.join(__dirname, 'dati', 'girone-27-11-2026.json'), 'utf8'));

// La funzione del sito (js/girone.js), caricata cosi' com'e': i due calcoli devono dare lo stesso risultato.
function classificaDelSito() {
  const codice = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'js', 'girone.js'), 'utf8');
  const finestra: Record<string, unknown> = { document: { readyState: 'complete', getElementById: () => null } };
  vm.runInNewContext(codice, { window: finestra, document: finestra.document });
  return (finestra.Girone as { calcolaClassifica: (g: unknown) => { id: string; pts: number; v: number; p: number }[] }).calcolaClassifica;
}

describe('classifica', () => {
  const gironi = gironiRisolti(vero);

  test('sui gironi veri da lo stesso risultato del sito, squadra per squadra', () => {
    const delSito = classificaDelSito();
    expect(gironi.length).toBeGreaterThan(1);
    for (const g of gironi) {
      const mia = calcolaClassifica(g);
      const sito = delSito(g);
      expect(mia.map((r) => [r.id, r.pts, r.v, r.p])).toEqual(sito.map((r) => [r.id, r.pts, r.v, r.p]));
      expect(mia.length).toBe(g.squadre.length);
    }
  });

  test('classifica intera (non solo 5 righe) per il Calendario', () => {
    const prima = gironi.find((g) => g.categoria === 'Prima Divisione')!;
    expect(prima.squadre.length).toBeGreaterThan(5);
    expect(calcolaClassifica(prima)).toHaveLength(prima.squadre.length);
  });

  test('3-2 vale 2 punti e 1 punto, 3-1 vale 3 e 0; ordine per punti poi vinte', () => {
    const squadre = ['a', 'b', 'c'].map((id) => ({ id, nome: id.toUpperCase(), logo: '', home: false }));
    const partita = (casa: string, ospite: string, sc: number, so: number) => ({
      id: casa + ospite, giornata: 1, data: '', ora: '', palazzetto: '', squadra_casa: casa, squadra_ospite: ospite,
      set_casa: sc, set_ospite: so, parziali: [],
    });
    const c = calcolaClassifica({ squadre, partite: [partita('a', 'b', 3, 2), partita('c', 'a', 3, 1), partita('b', 'c', null as unknown as number, 0)] });
    expect(c.map((r) => [r.id, r.pts, r.v, r.p, r.pg])).toEqual([
      ['c', 3, 1, 0, 1],
      ['a', 2, 1, 1, 2],
      ['b', 1, 0, 1, 1],
    ]);
  });
});

test('finestra di 5 con la Victor al centro, che scorre ai bordi', () => {
  const righe = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 's' + i }));
  expect(finestraClassifica(righe(4), 's1')).toEqual({ da: 0, a: 4 });
  expect(finestraClassifica(righe(13), 's0')).toEqual({ da: 0, a: 5 });
  expect(finestraClassifica(righe(13), 's1')).toEqual({ da: 0, a: 5 });
  expect(finestraClassifica(righe(13), 's6')).toEqual({ da: 4, a: 9 });
  expect(finestraClassifica(righe(13), 's11')).toEqual({ da: 8, a: 13 });
  expect(finestraClassifica(righe(13), 's12')).toEqual({ da: 8, a: 13 });
  expect(finestraClassifica(righe(13), 'nessuna')).toEqual({ da: 0, a: 5 });
});

test('squadraById trova la squadra o ne restituisce una col solo id', () => {
  const s = [{ id: 'x', nome: 'Ics', logo: 'l', home: true }];
  expect(squadraById(s, 'x').nome).toBe('Ics');
  expect(squadraById(s, 'y')).toEqual({ id: 'y', nome: 'y', logo: '', home: false });
});

test('formatData come il sito, senza Intl', () => {
  expect(formatData('2026-11-29', '19:00')).toBe('Domenica 29 Novembre · 19:00');
  expect(formatData('2027-01-09', '')).toBe('Sabato 9 Gennaio');
  expect(formatData('', '10:00')).toBe('');
});

describe('prossima partita e conto alla rovescia', () => {
  const p = (id: string, categoria: string, data: string, stato = 'programmata', stagione = '2026/2027'): Partita => ({
    id, stagione, categoria, squadraCasa: 'VICTOR VOLLEY VITA', squadraOspite: 'ALTRA', logoCasa: '', logoOspite: '',
    data, ora: '18:00', palazzetto: '', stato, setCasa: null, setOspite: null, sppCode: null,
  });
  const stagioni = [
    { id: '2025/2026', name: '2025/2026', current: false },
    { id: '2026/2027', name: '2026/2027', current: true },
  ];
  const adesso = new Date('2026-11-27T10:00:00Z');

  test('prende la prima da oggi in poi della categoria e della stagione corrente', () => {
    const partite = [
      p('vecchia', 'Prima Divisione', '2026-11-22', 'conclusa'),
      p('scaduta', 'Under 19', '2026-11-24'),
      p('altra-stagione', 'Prima Divisione', '2026-11-28', 'programmata', '2025/2026'),
      p('dopo', 'Prima Divisione', '2026-12-06'),
      p('giusta', 'Prima Divisione', '2026-11-29'),
      p('u19', 'Under 19', '2026-12-02'),
    ];
    expect(prossimaPartita(partite, stagioni, 'Prima Divisione', adesso)?.id).toBe('giusta');
    expect(prossimaPartita(partite, stagioni, 'Under 19', adesso)?.id).toBe('u19');
    expect(prossimaPartita(partite, stagioni, 'Under 13', adesso)).toBeNull();
  });

  test('conto alla rovescia in giorni, ore, minuti; null se gia\' iniziata o senza orario', () => {
    const ora = new Date(2026, 10, 27, 10, 0);
    expect(contoAllaRovescia('2026-11-29', '19:30', ora)).toEqual({ giorni: '02', ore: '09', minuti: '30' });
    expect(contoAllaRovescia('2026-11-27', '09:00', ora)).toBeNull();
    expect(contoAllaRovescia('2026-11-29', '', ora)).toBeNull();
  });
});
