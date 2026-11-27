import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { copertina, copertinaAlbum, dataBreve, didascalia, fotoIntera, giro, infoAlbum, miniatura } from '~/lib/galleria';
import { gruppiPerRuolo, iniziali, inStagione, nomeRuolo, ordinaStaff, stagioneCorrente } from '~/lib/squadre';

const persona = (id: number, name: string, role: string, extra: object = {}) => ({
  id, categoriaId: 1, stagione: '', name, role, photo: '', photoFocus: '', order: null, ...extra,
});
const giocatrice = (id: number, name: string, role: string, number: number | null, extra: object = {}) => ({
  ...persona(id, name, role, extra), number, gender: 'F',
});

const giocatori = [
  giocatrice(1, 'Anna Bianchi', 'Centrale', 7),
  giocatrice(2, 'Chiara Calasso', 'Palleggiatore', 4),
  giocatrice(3, 'Martina Chetta', 'Palleggiatore', 9),
  giocatrice(4, 'Sara Rossi', 'Laterale', 12),
  giocatrice(5, 'Vecchia Stagione', 'Libero', 1, { stagione: '2025/2026' }),
  giocatrice(6, 'Under Diciannove', 'Opposto', 3, { categoriaId: 2 }),
];
const staff = [persona(10, 'Fernando Cataldi', 'Assistente allenatore', { order: 2 }), persona(11, 'Renato Urso', 'Allenatore', { order: 1 })];
const album = [
  { id: 2, slug: 'terza-giornata', title: '3ª giornata', date: '2026-11-15', category: '', photoCount: 3, photos: [{ id: 'vv/a', w: 1, h: 1 }, { id: 'vv/b', w: 1, h: 1 }, { id: 'vv/c', w: 1, h: 1 }] },
  { id: 1, slug: 'victor-day', title: 'Victor Day', date: '2026-09-27', category: '', photoCount: 1, photos: [{ id: 'vv/d', w: 1, h: 1 }] },
];
const pubblico = {
  stagioni: [{ id: '2025/2026', name: '2025/2026', current: false }, { id: '2026/2027', name: '2026/2027', current: true }],
  categorie: [
    { id: 1, name: 'Prima Divisione', abbr: '', color: '', description: '', schedule: '', showInSquadre: true },
    { id: 2, name: 'Under 19', abbr: '', color: '', description: '', schedule: '', showInSquadre: true },
    { id: 3, name: 'Minivolley', abbr: '', color: '', description: '', schedule: '', showInSquadre: false },
  ],
  giocatori, staff, album, articoli: [], sponsor: [],
};

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => pubblico })) as unknown as typeof fetch;
});

describe('regole della pagina Squadre', () => {
  it('raggruppa per ruolo nell\'ordine del sito, per numero, e solo la stagione scelta', () => {
    const g = gruppiPerRuolo(giocatori.filter((p) => p.categoriaId === 1), '2026/2027');
    expect(g.map((x) => x.nome)).toEqual(['Palleggiatrice', 'Laterale', 'Centrale']);
    expect(g[0].persone.map((p) => p.number)).toEqual([4, 9]);
    expect(g.map((x) => x.caldo)).toEqual([false, true, false]);
    expect(gruppiPerRuolo(giocatori.filter((p) => p.categoriaId === 1), '2025/2026').map((x) => x.ruolo)).toContain('Libero');
  });

  it('nomi, iniziali, stagione e staff come il sito', () => {
    expect(nomeRuolo('Palleggiatore', 'M')).toBe('Palleggiatore');
    expect(nomeRuolo('Centrale', 'F')).toBe('Centrale');
    expect(iniziali('  maria  de  luca ')).toBe('ML');
    expect(inStagione({ stagione: '' }, 'x')).toBe(true);
    expect(ordinaStaff(staff, '2026/2027').map((s) => s.name)).toEqual(['Renato Urso', 'Fernando Cataldi']);
    expect(stagioneCorrente(pubblico.stagioni)?.id).toBe('2026/2027');
    expect(stagioneCorrente([{ id: 'a', current: false }])?.id).toBe('a');
  });
});

describe('regole della pagina Galleria', () => {
  it('indirizzi Cloudinary come photodb.js', () => {
    expect(copertina('vv/a b')).toBe('https://res.cloudinary.com/plbxnqlc/image/upload/c_fill,g_auto,w_500,h_375,f_auto,q_auto/vv/a%20b');
    expect(miniatura('vv/a')).toContain('/c_fill,g_auto,w_600,h_450,f_auto,q_auto/vv/a');
    expect(fotoIntera('vv/a')).toContain('/c_limit,w_2000,f_auto,q_auto/vv/a');
  });

  it('copertina: quella scelta in admin se c'e' ancora nell'album, se no la prima (VV.albumCoverId)', () => {
    const photos = [{ id: 'vv/a' }, { id: 'vv/b' }];
    expect(copertinaAlbum({ photos })).toBe('vv/a');
    expect(copertinaAlbum({ photos, copertina: 'vv/b' })).toBe('vv/b');
    expect(copertinaAlbum({ photos, copertina: 'vv/cancellata' })).toBe('vv/a');
    expect(copertinaAlbum({ photos: [], copertina: 'vv/b' })).toBe('');
  });

  it('date, didascalia e giro delle foto', () => {
    expect(dataBreve('2026-11-15')).toBe('15 nov 2026');
    expect(dataBreve('')).toBe('');
    expect(infoAlbum({ date: '2026-09-27', photoCount: 180 })).toBe('27 set 2026 · 180 foto');
    expect(didascalia('Victor Day', 2, 180)).toBe('Victor Day — 3 / 180');
    expect(giro(0, -1, 5)).toBe(4);
    expect(giro(4, 1, 5)).toBe(0);
  });
});

describe('pagina Squadre', () => {
  it('mostra la prima categoria, lo staff e i ruoli; cambia categoria e stagione', async () => {
    await renderRouter('./src/app', { initialUrl: '/squadre' });
    await waitFor(() => expect(screen.getByRole('header', { name: 'Prima Divisione' })).toBeTruthy());
    expect(screen.getByText('Stagione 2026/2027')).toBeTruthy();
    expect(screen.getByText('Staff tecnico')).toBeTruthy();
    expect(screen.getByLabelText('Renato Urso, Allenatore')).toBeTruthy();
    expect(screen.getByLabelText('Numero 4, Chiara Calasso, Palleggiatrice')).toBeTruthy();
    expect(screen.queryByText('Vecchia Stagione')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tutte' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Palleggiatrice' })).toBeTruthy();
    // Minivolley non si mostra nella pagina Squadre.
    await fireEvent.press(screen.getByRole('button', { name: 'Categoria: Prima Divisione' }));
    expect(screen.queryByText('Minivolley')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Under 19' }));
    expect(screen.getByRole('header', { name: 'Under 19' })).toBeTruthy();
    expect(screen.getByLabelText('Numero 3, Under Diciannove, Opposto')).toBeTruthy();
    expect(screen.queryByText('Staff tecnico')).toBeNull();
    // Stagione vecchia: torna la giocatrice con stagione 2025/2026 in Prima Divisione.
    await fireEvent.press(screen.getByRole('button', { name: 'Categoria: Under 19' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Prima Divisione' }));
    await fireEvent.press(screen.getByRole('button', { name: '2025/2026' }));
    expect(screen.getByText('Stagione 2025/2026')).toBeTruthy();
    expect(screen.getByText('Vecchia Stagione')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Vieni a giocare con noi' }));
    expect(screen).toHavePathname('/unisciti-a-noi');
  }, 60000);
});

describe('pagina Galleria', () => {
  it('elenco, album, visore e ritorno all\'elenco', async () => {
    await renderRouter('./src/app', { initialUrl: '/galleria' });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Apri album: 3ª giornata' })).toBeTruthy());
    expect(screen.getByText('15 nov 2026 · 3 foto')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Apri album: 3ª giornata' }));
    expect(screen).toHavePathname('/galleria');
    expect(screen).toHaveSearchParams({ album: 'terza-giornata', da: 'elenco' });
    expect(screen.getByRole('header', { name: '3ª giornata' })).toBeTruthy();
    expect(screen.getByText('Altri album')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apri album: Victor Day' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '3ª giornata — foto 2' }));
    expect(screen.getByText('3ª giornata — 2 / 3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Foto successiva' }));
    expect(screen.getByText('3ª giornata — 3 / 3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Foto successiva' }));
    expect(screen.getByText('3ª giornata — 1 / 3')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Chiudi' })[0]);
    expect(screen.queryByText(/— 1 \/ 3/)).toBeNull();
    await fireEvent.press(screen.getByRole('link', { name: '← Tutti gli album' }));
    expect(screen).toHaveSearchParams({});
    expect(screen.getByRole('header', { name: 'Galleria' })).toBeTruthy();
  }, 60000);

  it('album che non esiste', async () => {
    await renderRouter('./src/app', { initialUrl: '/galleria?album=non-esiste' });
    await waitFor(() => expect(screen.getByRole('header', { name: 'Album non trovato' })).toBeTruthy());
    expect(screen.getByText('← Torna a tutti gli album')).toBeTruthy();
  }, 60000);
});
