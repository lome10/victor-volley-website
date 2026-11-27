// Il porting ~/lib/presenzeStat deve dare ESATTAMENTE i risultati di js/presenze-stat.js del sito (caricato vero da node).
import * as app from '~/lib/presenzeStat';

// Moduli di Node solo per il test (l'app non ha i tipi di Node), come girone.test.ts.
/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const fs = require('fs') as { readFileSync: (p: string, c: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
const vm = require('vm') as { runInNewContext: (codice: string, contesto: object) => void };
/* eslint-enable @typescript-eslint/no-require-imports */

// Il file del sito caricato cosi' com'e' (UMD: senza `module` si appende a `self.PresenzeStat`).
function caricaDalSito() {
  const codice = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'js', 'presenze-stat.js'), 'utf8');
  const self: Record<string, unknown> = {};
  vm.runInNewContext(codice, { self });
  return self.PresenzeStat as typeof app;
}
const sito = caricaDalSito();

const GIORNI = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23'];

const casi: [string, string[], Record<string, string> | null][] = [
  ['niente', [], {}],
  ['stati null', GIORNI.slice(0, 3), null],
  ['niente segnato', GIORNI, {}],
  ['tutti presenti', GIORNI, Object.fromEntries(GIORNI.map((d) => [d, 'p']))],
  ['tutti assenti', GIORNI, Object.fromEntries(GIORNI.map((d) => [d, 'a']))],
  ['misto con buchi', GIORNI, { '2026-11-02': 'p', '2026-11-06': 'a', '2026-11-11': 'p', '2026-11-18': 'a', '2026-11-20': 'x', '2026-11-23': 'a' }],
  ['assenze di fila saltando i vuoti', GIORNI, { '2026-11-13': 'p', '2026-11-16': 'a', '2026-11-20': 'a', '2026-11-23': '' }],
  ['doppioni e disordine', ['2026-11-09', '2026-11-02', '2026-11-09', '2026-11-04', '2026-11-02'], { '2026-11-09': 'p', '2026-11-02': 'a' }],
  ['2 su 3 (arrotondamento)', GIORNI.slice(0, 3), { '2026-11-02': 'p', '2026-11-04': 'p', '2026-11-06': 'a' }],
];

describe('statistiche di presenza: app uguale al sito (js/presenze-stat.js)', () => {
  it.each(casi)('calcola: %s', (_nome, giorni, stati) => {
    expect(app.calcola(giorni, stati)).toEqual(sito.calcola(giorni, stati));
  });

  it('colore, media, inizio stagione, ULTIMI', () => {
    for (const pct of [null, undefined, 0, 64, 65, 79, 80, 100]) expect(app.colore(pct)).toBe(sito.colore(pct));
    const liste = casi.map(([, g, s]) => sito.calcola(g, s));
    expect(app.media(liste)).toBe(sito.media(liste));
    expect(app.media([])).toBe(sito.media([]));
    expect(app.media([null, liste[2]])).toBe(sito.media([null, liste[2]]));
    for (const oggi of ['2026-08-31', '2026-09-01', '2026-12-31', '2027-01-15']) expect(app.inizioStagione(oggi)).toBe(sito.inizioStagione(oggi));
    expect(app.ULTIMI).toBe(sito.ULTIMI);
  });

  it('valori attesi (non solo uguali al sito)', () => {
    expect(app.calcola(GIORNI.slice(0, 3), { '2026-11-02': 'p', '2026-11-04': 'p', '2026-11-06': 'a' })).toEqual({
      si: 2,
      no: 1,
      segnate: 3,
      nr: 0,
      pct: 67,
      ultimi: ['p', 'p', 'a'],
      assenzeDiFila: 1,
    });
    expect(app.calcola(GIORNI, {}).pct).toBeNull();
    expect(app.calcola(GIORNI, {}).ultimi).toHaveLength(8);
  });
});
