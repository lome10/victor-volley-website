import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { CAMPI_CONTATTI, CAMPI_SPONSOR, CAMPI_UNISCITI, datiContatti, datiSponsor, datiUnisciti, errore, errori, inviaModulo } from '~/lib/moduli';

// Nessun invio vero nei test: si controlla solo cosa arriverebbe.
jest.mock('~/lib/moduli', () => ({ ...jest.requireActual('~/lib/moduli'), inviaModulo: jest.fn(async () => true) }));
const invio = inviaModulo as jest.Mock;

const SPONSOR = [
  { id: 1, nome: 'Puglia in food', logo: 'https://res.cloudinary.com/x/image/upload/v1/p.png', url: 'https://pugliainfood.it', order: 2, livello: 'gold', ripetizioni: 1 },
  { id: 2, nome: 'Bar Centrale', logo: '', url: 'javascript:alert(1)', order: 1, livello: '', ripetizioni: 1 },
];

beforeEach(() => {
  invio.mockClear();
  const corpo = {
    stagioni: [], partite: [], articoli: [], girone: null, sponsor: SPONSOR,
    livelliSponsor: { gold: 'Il massimo della visibilità', silver: 'Visibilità sui canali', bronze: 'Per iniziare' },
  };
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => corpo })) as unknown as typeof fetch;
});

describe('regole dei moduli (come js/form-validate.js)', () => {
  it('messaggi di errore uguali al sito', () => {
    const email = CAMPI_CONTATTI.find((c) => c.nome === 'email')!;
    expect(errore(email, '')).toBe('Campo obbligatorio.');
    expect(errore(email, 'mario@')).toBe('Inserisci un indirizzo email valido.');
    expect(errore(email, ' mario@rossi.it ')).toBe('');
    const tel = CAMPI_UNISCITI.find((c) => c.nome === 'telefono')!;
    expect(errore(tel, '')).toBe('');
    expect(errore(tel, '12-34')).toBe('Inserisci un numero di telefono valido.');
    expect(errore(CAMPI_UNISCITI.find((c) => c.nome === 'categoria')!, '')).toBe('Scegli un’opzione.');
    expect(errore(CAMPI_UNISCITI.find((c) => c.nome === 'privacy')!, '')).toBe('Per inviare devi spuntare questa casella.');
    expect(Object.keys(errori(CAMPI_SPONSOR, {}))).toEqual(['azienda', 'referente', 'email', 'livello', 'privacy']);
  });

  it('dati inviati uguali a quelli del sito (senza la chiave)', () => {
    expect(datiSponsor({ azienda: ' Bar ', referente: 'Ada', email: 'a@b.it', livello: 'Gold', privacy: 'si' })).toEqual({
      subject: 'Richiesta partnership: Bar', from_name: 'Ada (Bar)', modulo: 'Diventa partner', azienda: 'Bar', referente: 'Ada',
      email: 'a@b.it', telefono: 'non indicato', livello: 'Gold', messaggio: '—', consenso_privacy: 'sì',
    });
    expect(datiContatti({ nome: 'Ada', email: 'a@b.it', oggetto: 'Ciao', messaggio: 'Testo' })).toEqual({
      subject: 'Ciao', from_name: 'Ada', nome: 'Ada', email: 'a@b.it', oggetto: 'Ciao', messaggio: 'Testo', consenso_privacy: 'sì',
    });
    expect(datiUnisciti({ nome: 'Ada', cognome: 'Lo', email: 'a@b.it', eta: '12 anni', categoria: 'Minivolley' })).toEqual({
      subject: 'Richiesta informazioni: Ada Lo', from_name: 'Ada Lo', nome: 'Ada', cognome: 'Lo', email: 'a@b.it',
      telefono: 'non indicato', eta: '12 anni', categoria: 'Minivolley', messaggio: '—', consenso_privacy: 'sì',
    });
    for (const d of [datiSponsor({}), datiContatti({}), datiUnisciti({})]) expect(JSON.stringify(d)).not.toContain('access_key');
  });
});

describe('pagina Partner', () => {
  it('livelli, card, livello vuoto e modulo con controlli e invio', async () => {
    await renderRouter('./src/app', { initialUrl: '/sponsor' });
    await waitFor(() => expect(screen.getByText('GOLD')).toBeTruthy());
    expect(screen.getByRole('header', { name: 'I nostri partner' })).toBeTruthy();
    expect(screen.getByText('Il massimo della visibilità')).toBeTruthy();
    // Bar Centrale ha livello vuoto (= Silver, come il sito) e un link non sicuro: niente link.
    expect(screen.getByRole('link', { name: 'Puglia in food' })).toBeTruthy();
    expect(screen.getByText('Bar Centrale')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Bar Centrale' })).toBeNull();
    expect(screen.getByText(/Nessun partner Bronze al momento/)).toBeTruthy();
    expect(screen.getByText('80+')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Invia la richiesta' }));
    expect(screen.getAllByText('Campo obbligatorio.')).toHaveLength(3);
    expect(screen.getByText('Scegli un’opzione.')).toBeTruthy();
    expect(screen.getByText('Per inviare devi spuntare questa casella.')).toBeTruthy();
    expect(invio).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Azienda o attività'), 'Bar Centrale');
    fireEvent.changeText(screen.getByLabelText('Referente'), 'Ada Lo');
    fireEvent.changeText(screen.getByLabelText('Email'), 'ada@bar.it');
    await fireEvent.press(screen.getByRole('button', { name: 'Livello di interesse' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Non so / vorrei saperne di più' }));
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: 'Invia la richiesta' }));
    await waitFor(() => expect(screen.getByText('✓ Richiesta inviata!')).toBeTruthy());
    expect(invio).toHaveBeenCalledWith(expect.objectContaining({ azienda: 'Bar Centrale', livello: 'Non so', telefono: 'non indicato' }));
  }, 60000);

  it('se l\'invio non riesce mostra il riquadro con l\'email', async () => {
    invio.mockResolvedValueOnce(false);
    await renderRouter('./src/app', { initialUrl: '/unisciti-a-noi' });
    expect(screen.getByRole('header', { name: 'Vieni a giocare con noi' })).toBeTruthy();
    expect(screen.getByText('Questo non è un modulo di tesseramento ufficiale.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Nome'), 'Ada');
    fireEvent.changeText(screen.getByLabelText('Cognome'), 'Lo');
    fireEvent.changeText(screen.getByLabelText('Email'), 'ada@lo.it');
    fireEvent.changeText(screen.getByLabelText('Età (o data di nascita)'), '9 anni');
    await fireEvent.press(screen.getByRole('button', { name: 'Categoria di interesse' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Minivolley (5-10 anni)' }));
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: 'Invia il messaggio' }));
    await waitFor(() => expect(screen.getByText('Invio non riuscito.')).toBeTruthy());
    expect(invio).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Richiesta informazioni: Ada Lo', categoria: 'Minivolley' }));
  }, 60000);
});
