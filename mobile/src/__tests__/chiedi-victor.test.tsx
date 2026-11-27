import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { destinazione } from '~/components/ChiediVictor';
import { cerca, norm, rispondi, rispostaDinamica, tutteLeDomande, type DatiBot } from '~/lib/chiedi';
import type { Partita } from '~/lib/dati';

// File del sito, solo per il test (l'app non ha i tipi di Node).
/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const path = require('path') as { join: (...p: string[]) => string };
const radice = path.join(__dirname, '..', '..', '..');
const DATI = require(path.join(radice, 'data', 'chatbot.json')) as DatiBot;
type Sito = {
  _prepare: (d: DatiBot) => void;
  _search: (t: string) => { e: { q: string }; s: number }[];
  _norm: (t: string) => string;
  _dinamica: (tipo: string, partite: object[], testo: string, oggi: string) => string | null;
};
const sito = require(path.join(radice, 'js', 'chatbot.js')) as Sito;
/* eslint-enable @typescript-eslint/no-require-imports */
sito._prepare(DATI);

const LIBERE = [
  'ciao', 'Grazie mille', 'quanto costa iscriversi?', "com'è il calendario dell'under 19", 'dove vi allenate', 'prova gratuita per mia figlia di 10 anni',
  'ci sono squadre maschili', 'avete il minivolley?', 'risultati prima divisione', 'u19 prossima partita', 'voglio fare lo sponsor', 'password dimenticata',
  'come trattate i dati', 'foto della partita', 'pizza margherita', '', '   ', 'è possibile venire a vedere?', 'trasferta pullman', "l'allenatore è bravo?",
];

describe('Chiedi a Victor: uguale al sito su tutte le domande vere', () => {
  it('normalizza il testo come il sito (accenti, apostrofi, simboli)', () => {
    for (const t of [...LIBERE, "Cos'è?", 'Perché NO!!', 'àèìòù ÀÉ']) expect(norm(t)).toBe(sito._norm(t));
  });

  it('stesso ordine e stessi punti per ogni domanda del json e per le frasi libere', () => {
    const prove = [...tutteLeDomande(DATI).map((d) => d.q), ...tutteLeDomande(DATI).flatMap((d) => d.parole), ...LIBERE];
    for (const t of prove) {
      expect(cerca(DATI, t).map((x) => [x.d.q, x.s])).toEqual(sito._search(t).map((x) => [x.e.q, x.s]));
    }
  });

  it('ogni domanda del json, scritta cosi\' com\'e\', trova se stessa', () => {
    for (const d of tutteLeDomande(DATI)) {
      const e = rispondi(DATI, d.q);
      expect(e.tipo === 'risposta' ? e.d.q : e.tipo === 'forse' ? e.domande.map((x) => x.q) : e.tipo).toEqual(e.tipo === 'forse' ? expect.arrayContaining([d.q]) : d.q);
    }
    expect(rispondi(DATI, 'ciao').tipo).toBe('saluto');
    expect(rispondi(DATI, 'grazie mille').tipo).toBe('grazie');
    expect(rispondi(DATI, 'pizza margherita').tipo).toBe('ripiego');
  });

  it('prossima partita e ultimo risultato: stesse frasi del sito', () => {
    const p = (id: string, categoria: string, data: string, stato: string, sc: number | null = null, so: number | null = null, extra: Partial<Partita> = {}): Partita => ({
      id, stagione: '2026/2027', categoria, squadraCasa: 'VICTOR VOLLEY VITA', squadraOspite: "DREAM VOLLEY NARDO'", logoCasa: '', logoOspite: '',
      data, ora: '18:00', palazzetto: 'Palazzetto ARKE', stato, setCasa: sc, setOspite: so, sppCode: null, ...extra,
    });
    const partite = [
      p('a', 'Prima Divisione', '2026-11-29', 'programmata', null, null, { squadraCasa: 'ASD OLIMPIUS PARABITA', squadraOspite: 'VICTOR VOLLEY VITA', ora: '19:00' }),
      p('b', 'Under 19', '2026-12-02', 'programmata', null, null, { palazzetto: '' }),
      p('c', 'Prima Divisione', '2026-11-22', 'conclusa', 3, 1),
      p('d', 'Under 19', '2026-11-18', 'conclusa', 0, 3),
      p('e', 'Under 19', '2026-11-10', 'conclusa', 3, 2),
    ];
    const snake = partite.map((x) => ({ categoria: x.categoria, squadra_casa: x.squadraCasa, squadra_ospite: x.squadraOspite, data: x.data, ora: x.ora, palazzetto: x.palazzetto, stato: x.stato, set_casa: x.setCasa, set_ospite: x.setOspite }));
    for (const tipo of ['prossima_partita', 'ultimo_risultato']) {
      for (const testo of ['', 'prossima partita under 19', 'u19', 'risultati 1a divisione', 'prima div', 'minivolley']) {
        for (const oggi of ['2026-11-27', '2027-01-01']) expect(rispostaDinamica(tipo, partite, testo, oggi)).toBe(sito._dinamica(tipo, snake, testo, oggi));
      }
    }
    expect(rispostaDinamica('ultimo_risultato', partite, 'u19', '2026-11-27')).toBe("L'ultimo risultato: Under 19: Victor Volley Vita 0-3 Dream Volley Nardo' (18 novembre).");
  });

  it('i link vanno alle pagine dell\'app, o al browser se l\'app non le ha', () => {
    expect(destinazione('/calendario')).toEqual({ app: '/calendario' });
    expect(destinazione('/atleta')).toEqual({ app: '/area-atleti' });
    expect(destinazione('https://www.instagram.com/asdvictorvolley')).toEqual({ web: 'https://www.instagram.com/asdvictorvolley' });
    expect(destinazione('/shop')).toEqual({ web: 'https://www.victorvolley.it/shop' });
    for (const d of tutteLeDomande(DATI)) if (d.link?.url.startsWith('/')) expect(destinazione(d.link.url)).toHaveProperty(d.link.url === '/atleta' ? 'app' : 'app');
  });
});

describe('Chiedi a Victor a schermo', () => {
  beforeEach(() => {
    const pubblico = {
      partite: [{ id: 'x', categoria: 'Under 19', squadraCasa: 'VICTOR VOLLEY VITA', squadraOspite: 'ASTRA', data: '2099-12-02', ora: '18:00', palazzetto: '', stato: 'programmata', setCasa: null, setOspite: null, sppCode: null }],
      articoli: [], album: [], sponsor: [], stagioni: [], girone: { stagione: '', squadre: [], gironi: [] }, maglia: { enabled: false },
    };
    globalThis.fetch = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.includes('chatbot.json') ? DATI : pubblico) })) as unknown as typeof fetch;
  });

  it('si apre, mostra argomenti e domande, risponde con il calendario vero', async () => {
    await renderRouter('./src/app', { initialUrl: '/news' });
    await waitFor(() => expect(screen.getByLabelText("Apri l'assistente Victor")).toBeTruthy());
    await fireEvent.press(screen.getByLabelText("Apri l'assistente Victor"));
    expect(screen.getByText(DATI.saluto)).toBeTruthy();
    expect(screen.getByText(DATI.avviso)).toBeTruthy();
    await fireEvent.press(screen.getByText('Partite e risultati'));
    expect(screen.getByText('Ecco le domande su «Partite e risultati». Scegline una.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Dove vedo il calendario delle partite?'));
    expect(screen.getByText(/La prossima partita è Under 19: Victor Volley Vita - Astra/)).toBeTruthy();
    expect(screen.getByText('Altra domanda')).toBeTruthy();
    await fireEvent.press(screen.getByText('Calendario'));
    expect(screen).toHavePathname('/calendario');
  }, 60000);

  it('testo libero: risposta, "forse cercavi" o ripiego', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(screen.getByLabelText("Apri l'assistente Victor")).toBeTruthy());
    await fireEvent.press(screen.getByLabelText("Apri l'assistente Victor"));
    await fireEvent.changeText(screen.getByLabelText('La tua domanda'), 'pizza margherita');
    await fireEvent.press(screen.getByText('Invia'));
    expect(screen.getByText(DATI.fallback)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('La tua domanda'), 'ciao');
    await fireEvent(screen.getByLabelText('La tua domanda'), 'submitEditing');
    expect(screen.getByText('Ciao! Come posso aiutarti?')).toBeTruthy();
  }, 60000);

  it('non c\'e\' nella Diretta', async () => {
    await renderRouter('./src/app', { initialUrl: '/diretta' });
    await waitFor(() => expect(screen.getByText('Entra a far parte della famiglia Victor')).toBeTruthy());
    expect(screen.queryByLabelText("Apri l'assistente Victor")).toBeNull();
  }, 60000);
});
