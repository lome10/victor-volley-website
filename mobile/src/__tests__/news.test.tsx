import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { blocchi } from '~/lib/html';
import { dataEstesa, fuoco, immagineLarga, pagina } from '~/lib/news';

const articolo = (id: number, categoria: string) => ({
  id, title: 'Notizia ' + id, date: '2026-10-' + String(30 - id).padStart(2, '0'), categories: [categoria],
  image: '', imageFocus: '', coverRatio: '4:5', sponsorIds: [], riassunto: '', heroOrder: null,
});
const articoli = [1, 2, 3, 4, 5, 6, 7].map((n) => articolo(n, n === 7 ? 'Under 19' : 'Società'));

const finto = jest.fn(async (url: string) => {
  const m = /articolo=(\d+)/.exec(url);
  const corpo = m ? { ...articoli[0], id: Number(m[1]), title: 'Notizia ' + m[1], content: '<p>Testo <strong>forte</strong></p>' } : { articoli, sponsor: [] };
  if (m && m[1] === '999') return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => corpo };
});

beforeEach(() => {
  globalThis.fetch = finto as unknown as typeof fetch;
});

describe('testo dell\'articolo', () => {
  it('tiene paragrafi, grassetto, elenchi e link buoni', () => {
    const b = blocchi('<h2>Titolo</h2><p>Ciao <b>mondo</b> <a href="https://x.it">qui</a></p><ul><li>uno</li><li>due</li></ul>');
    expect(b.map((x) => x.tipo)).toEqual(['titolo2', 'paragrafo', 'voce', 'voce']);
    expect(JSON.stringify(b)).toContain('"grassetto":true');
    expect(JSON.stringify(b)).toContain('https://x.it');
  });

  it('grassetto in linea, div senza spazio, riga vuota solo col br', () => {
    const b = blocchi('<div>uno</div><div><br></div><div><span style="font-weight: bold; font-family: Times">due</span></div>');
    expect(b).toEqual([
      { tipo: 'paragrafo', pezzi: [{ testo: 'uno' }], stretto: true },
      { tipo: 'spazio' },
      { tipo: 'paragrafo', pezzi: [{ testo: 'due', grassetto: true }], stretto: true },
    ]);
  });

  it('butta script, moduli, link e immagini pericolosi', () => {
    const b = JSON.stringify(blocchi('<script>rubа()</script><style>p{}</style><form>password</form><iframe src="https://male.it"></iframe><p onclick="x()"><a href="javascript:alert(1)">clic</a></p><img src="data:image/png;base64,AA">'));
    expect(b).not.toMatch(/rub|password|male\.it|javascript|onclick|data:|p\{\}/);
    expect(b).toContain('clic');
  });
});

describe('regole delle News', () => {
  it('6 per pagina, filtro e pagina fuori misura', () => {
    expect(pagina(articoli, null, 0)).toMatchObject({ totale: 2, attuale: 0 });
    expect(pagina(articoli, null, 9).voci).toHaveLength(1);
    expect(pagina(articoli, 'Under 19', 0).voci.map((a) => a.id)).toEqual([7]);
  });

  it('data, foto e fuoco', () => {
    expect(dataEstesa('2026-10-21')).toBe('21 ottobre 2026');
    expect(immagineLarga('https://res.cloudinary.com/x/image/upload/v1/a.jpg', 900)).toBe('https://res.cloudinary.com/x/image/upload/f_auto,q_auto,c_limit,w_900/v1/a.jpg');
    expect(fuoco('50% 20%')).toEqual({ left: '50%', top: '20%' });
    expect(fuoco('')).toBe('top');
  });
});

describe('schermate', () => {
  it('elenco, filtro, apre l\'articolo e torna', async () => {
    await renderRouter('./src/app', { initialUrl: '/news' });
    await waitFor(() => expect(screen.getByLabelText('Notizia 1')).toBeTruthy());
    expect(screen.queryByLabelText('Notizia 7')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Under 19' }));
    expect(screen.getByLabelText('Notizia 7')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Notizia 7'));
    expect(screen).toHavePathname('/articolo/7');
    await waitFor(() => expect(screen.getByText('forte')).toBeTruthy());
    await fireEvent.press(screen.getByText('← Torna alle news'));
    expect(screen).toHavePathname('/news');
  }, 60000);

  it('indirizzo senza numero: torna alle news', async () => {
    await renderRouter('./src/app', { initialUrl: '/articolo/abc' });
    await waitFor(() => expect(screen).toHavePathname('/news'));
  }, 60000);

  it('articolo che non esiste', async () => {
    await renderRouter('./src/app', { initialUrl: '/articolo/999' });
    await waitFor(() => expect(screen.getByText('Articolo non trovato.')).toBeTruthy());
  }, 60000);
});
