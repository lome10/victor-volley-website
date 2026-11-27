import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { RESET_INVIATO, richiediReset } from '~/lib/accesso';
import {
  daFare,
  dataIso,
  driveVista,
  fissatoAttivo,
  giorniDa,
  nonLetto,
  nuovaLettura,
  ordinaAvvisi,
  pezziTesto,
  rateDaDocumenti,
  riquadroCertificato,
  riquadroQuote,
  scadenze,
  testoBadge,
  unisciSchede,
  type Atleta,
  type Rata,
} from '~/lib/atleti';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { azzera, finto, esci, leggiAvvisi } = require('../../test/firebaseFinto') as typeof import('../../test/firebaseFinto');

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const ADESSO = new Date(2026, 10, 27, 10, 0); // 27/11/2026
const tra = (giorni: number, da = new Date()) => dataIso(new Date(da.getFullYear(), da.getMonth(), da.getDate() + giorni));
const rata = (r: Partial<Rata>): Rata => ({ descrizione: 'Quota', importo: 100, scadenza: '', scadenzaPagamento: '', pagata: false, dataPagamento: null, ...r });

describe('regole dell\'area atleti (js/atleta.js)', () => {
  it('giorni, schede unite e ordinate per nome', () => {
    expect(giorniDa('2026-11-27', ADESSO)).toBe(0);
    expect(giorniDa('2026-11-26', ADESSO)).toBe(-1);
    expect(giorniDa('2026-12-27', ADESSO)).toBe(30);
    const a: Atleta = { uid: 'a', nome: 'Zoe', cognome: 'Rossi' };
    const b: Atleta = { uid: 'b', nome: 'Anna', cognome: 'Rossi' };
    expect(unisciSchede([a, b], { ...a, categoria: 'U13' }).map((x) => [x.uid, x.categoria])).toEqual([
      ['b', undefined],
      ['a', 'U13'],
    ]);
    expect(testoBadge(3)).toBe('3');
    expect(testoBadge(12)).toBe('9+');
  });

  it('certificato e quote nella lista Da fare, rossi prima', () => {
    expect(scadenze({ uid: 'x' }, [], ADESSO)).toEqual([
      { livello: 'orange', testo: 'Certificato medico non ancora consegnato. La società darà aggiornamenti a breve.' },
    ]);
    expect(scadenze({ uid: 'x', certMedicoScadenza: '2026-11-20' }, [], ADESSO)[0]).toEqual({
      livello: 'red',
      testo: 'Certificato medico scaduto il 20/11/2026. La società darà aggiornamenti a breve.',
    });
    expect(scadenze({ uid: 'x', certMedicoScadenza: '2026-11-28' }, [], ADESSO)[0].testo).toBe(
      'Il certificato medico scade domani (28/11/2026). La società darà aggiornamenti a breve.',
    );
    expect(scadenze({ uid: 'x', certMedicoScadenza: '2027-06-01' }, [], ADESSO)).toEqual([]);

    const cose = scadenze(
      { uid: 'x', certMedicoScadenza: '2026-12-10' },
      [
        rata({ descrizione: '2ª tranche', importo: 150, scadenzaPagamento: '2026-12-05' }),
        rata({ descrizione: '1ª tranche', importo: 200, scadenza: '2026-11-01' }),
        rata({ descrizione: 'Pagata', scadenza: '2026-11-01', pagata: true }),
        rata({ descrizione: 'In ritardo', importo: 50, scadenzaPagamento: '2026-11-20', scadenza: '2026-11-28' }),
      ],
      ADESSO,
    );
    expect(cose.map((c) => c.testo)).toEqual([
      'Quota «1ª tranche» (€200.00) scaduta il 01/11/2026 e non pagata: contatta la società.',
      'Quota «In ritardo» (€50.00) da pagare entro il 20/11/2026: pagamento in ritardo.',
      'La validità della quota «In ritardo» (€50.00) scade domani (28/11/2026).',
      'Il certificato medico scade tra 13 giorni (10/12/2026). La società darà aggiornamenti a breve.',
      'Quota «2ª tranche» (€150.00): pagamento previsto tra 8 giorni (05/12/2026).',
    ]);
    expect(cose.map((c) => c.livello)).toEqual(['red', 'red', 'red', 'orange', 'orange']);
  });

  it('avvisi non letti in cima, presenze in fondo, altrimenti tutto in regola', () => {
    const base = [{ livello: 'orange' as const, testo: 'X' }];
    expect(daFare(base, 2, true, 1)).toEqual([
      { livello: 'red', testo: 'Hai 2 avvisi non letti.', vai: 'avvisi' },
      { livello: 'orange', testo: 'X' },
      { livello: 'orange', testo: 'Conferma la presenza a 1 impegno dei prossimi 7 giorni.', vai: 'calendario' },
    ]);
    expect(daFare([], 1, false, 0)[0]).toEqual({ livello: 'orange', testo: 'Hai 1 avviso non letto.', vai: 'avvisi' });
    expect(daFare([], 0, false, 0)).toEqual([{ livello: 'ok', testo: 'Tutto in regola, non c’è niente da fare.' }]);
  });

  it('rate dal budget e riquadri della Home', () => {
    const rate = rateDaDocumenti([
      { note: 'Iscrizione', importo: '50', scadenza: '2026-10-01', stagione: '2026/2027', pagata: true },
      { importo: 120, scadenza: '2026-12-01', scadenzaPagamento: '2026-11-30', stagione: '2025/2026' },
    ]);
    expect(rate.map((r) => r.descrizione)).toEqual(['Iscrizione (2026/2027)', 'Quota (2025/2026)']);
    expect(rate[0].importo).toBe(50);
    expect(riquadroQuote(rate)).toEqual({ valore: '€120.00', livello: 'orange', sotto: 'ancora da versare' });
    expect(riquadroQuote([rata({ pagata: true })])).toEqual({ valore: 'Saldate', livello: 'ok', sotto: 'Totale €100.00' });
    expect(riquadroQuote([])).toEqual({ valore: '—', livello: null, sotto: 'Nessuna quota inserita' });
    expect(riquadroCertificato({ uid: 'x' }, ADESSO)).toEqual({ valore: 'Non inserito', livello: 'orange', sotto: '' });
    expect(riquadroCertificato({ uid: 'x', certMedicoScadenza: '2027-09-30' }, ADESSO)).toEqual({ valore: 'Valido', livello: 'ok', sotto: 'Fino al 30/09/2027' });
  });

  it('avvisi: fissati fino a una data, ordine, non letti, ultima lettura', () => {
    expect(fissatoAttivo({ id: '1', fissato: true }, ADESSO)).toBe(true);
    expect(fissatoAttivo({ id: '1', fissato: true, fissatoFino: '2026-11-27' }, ADESSO)).toBe(true);
    expect(fissatoAttivo({ id: '1', fissato: true, fissatoFino: '2026-11-26' }, ADESSO)).toBe(false);
    const vecchio = { id: 'v', createdAt: '2026-09-01T10:00:00.000Z' };
    const recente = { id: 'r', createdAt: '2026-11-25T10:00:00.000Z' };
    const fisso = { id: 'f', createdAt: '2026-08-01T10:00:00.000Z', fissato: true };
    expect(ordinaAvvisi([vecchio, recente, fisso], ADESSO).map((v) => v.id)).toEqual(['f', 'r', 'v']);
    // Prima volta sul telefono: nuovi solo gli ultimi 30 giorni; i fissati mai.
    expect(nonLetto(recente, '', ADESSO)).toBe(true);
    expect(nonLetto(vecchio, '', ADESSO)).toBe(false);
    expect(nonLetto({ ...recente, fissato: true }, '', ADESSO)).toBe(false);
    expect(nonLetto(recente, '2026-11-25T10:00:00.000Z', ADESSO)).toBe(false);
    expect(nuovaLettura([vecchio, recente], ADESSO)).toBe('2026-11-25T10:00:00.000Z');
    expect(nuovaLettura([], ADESSO)).toBe(ADESSO.toISOString());
  });

  it('link nel testo e allegati Drive', () => {
    expect(pezziTesto('Leggi https://a.it/x e poi http://b.it.')).toEqual([
      { t: 'Leggi ' },
      { t: 'https://a.it/x', link: 'https://a.it/x' },
      { t: ' e poi http://b.it.' },
    ]);
    expect(driveVista('https://drive.google.com/file/d/AbC_1-2/view?usp=sharing')).toBe('https://drive.google.com/file/d/AbC_1-2/view');
    expect(driveVista('https://esempio.it/m.pdf')).toBe('https://esempio.it/m.pdf');
    expect(driveVista('javascript:alert(1)')).toBeNull();
  });
});

describe('password dimenticata (/api/imposta-password)', () => {
  it('chiede l\'email, poi chiama il server con richiediReset', async () => {
    const f = jest.fn(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = f as unknown as typeof fetch;
    expect(await richiediReset('nonvalida')).toBe('Scrivi qui sopra la tua email, poi tocca «Password dimenticata?».');
    expect(f).not.toHaveBeenCalled();
    expect(await richiediReset('a@b.it')).toBeNull();
    expect(f).toHaveBeenCalledWith('https://www.victorvolley.it/api/imposta-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ richiediReset: 'a@b.it' }),
    });
    f.mockResolvedValueOnce({ ok: false, status: 429 });
    expect(await richiediReset('a@b.it')).toBe('Troppe richieste: riprova tra qualche minuto.');
    f.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await richiediReset('a@b.it')).toBe('Non riesco a inviare l’email in questo momento. Riprova più tardi.');
    f.mockRejectedValueOnce(new Error('rete'));
    expect(await richiediReset('a@b.it')).toBe('Non riesco a inviare l’email in questo momento. Riprova più tardi.');
  });
});

describe('pagina Area atleti (Firebase finto)', () => {
  const sara: Atleta = { uid: 'atl-sara', nome: 'Sara', cognome: 'Prova', categoria: 'Under 13', certMedicoScadenza: tra(200) };
  const luca: Atleta = { uid: 'atl-luca', nome: 'Luca', cognome: 'Prova', categoria: 'Under 19' };

  beforeEach(async () => {
    azzera();
    await AsyncStorage.clear();
    jest.clearAllMocks();
    // Il resto dell'app (barra, avviso diretta, chatbot) legge i dati pubblici: risposta vuota.
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ partite: [], articoli: [], sponsor: [] }) })) as unknown as typeof fetch;
  });

  const accediCome = async () => {
    await fireEvent.changeText(screen.getByLabelText('Email'), finto.credenziali.email);
    await fireEvent.changeText(screen.getByLabelText('Password'), finto.credenziali.password);
    await fireEvent.press(screen.getByRole('button', { name: 'Accedi' }));
  };

  it('accesso sbagliato, password dimenticata, poi accesso giusto', async () => {
    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    expect(screen.getByRole('header', { name: 'Area Atleti' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'famiglia@prova.it');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'sbagliata');
    await fireEvent.press(screen.getByRole('button', { name: 'Accedi' }));
    expect(await screen.findByText('Email o password non corretti.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Password dimenticata?' }));
    expect(await screen.findByText(RESET_INVIATO)).toBeTruthy();
    expect(screen.queryByText('Email o password non corretti.')).toBeNull();

    finto.schede = { conAccesso: [sara], propria: null, errore: false };
    await accediCome();
    expect(await screen.findByRole('header', { name: 'Sara Prova' })).toBeTruthy();
    expect(screen.getByText('Under 13')).toBeTruthy();
    // Un solo figlio: niente barra di scelta.
    expect(screen.queryByRole('tab', { name: 'Sara' })).toBeNull();
  }, 60000);

  it('Home, avvisi letti, scelta del figlio, Copia IBAN ed Esci', async () => {
    const oggi = new Date();
    finto.utente = { uid: 'u-famiglia', email: finto.credenziali.email };
    finto.schede = { conAccesso: [luca], propria: sara, errore: false };
    finto.avvisi = [
      { id: 'a1', titolo: 'Allenamento spostato', testo: 'Info su https://www.victorvolley.it', categoria: 'Under 13', createdAt: new Date(oggi.getTime() - 864e5).toISOString(), importante: true },
      { id: 'a2', titolo: 'Festa di Natale', testo: 'Tutti invitati', categoria: 'tutte', createdAt: new Date(oggi.getTime() - 2 * 864e5).toISOString() },
      { id: 'a3', titolo: 'Regolamento', testo: 'Da leggere', categoria: 'tutte', createdAt: '2026-01-01T10:00:00.000Z', fissato: true },
      { id: 'a4', titolo: 'Solo Under 19', testo: 'x', categoria: 'Under 19', createdAt: new Date().toISOString() },
    ];
    finto.rate = { 'atl-luca': [{ importo: 80, scadenza: tra(60) }] };
    // Allenamento di Luca domani (dati pubblici, non Firestore): 1 impegno da confermare nei prossimi 7 giorni.
    const domani = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1);
    const pubblico = {
      partite: [], articoli: [], sponsor: [],
      allenamenti: [{ id: 'o1', categoria: 'Under 19', giorno: ((domani.getDay() + 6) % 7) + 1, oraInizio: '17:00', oraFine: '18:30', luogo: 'Palestra', note: '', validoFino: '' }],
      allenamentiEccezioni: [],
    };
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => pubblico })) as unknown as typeof fetch;

    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    // Due figli: la barra, in ordine di nome; si parte da Luca.
    expect(await screen.findByRole('tab', { name: 'Luca' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sara' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Luca Prova' })).toBeTruthy();
    // Luca (Under 19): la festa di tutta la societa' e l'avviso della sua squadra.
    expect(await screen.findByText('Hai 2 avvisi non letti.')).toBeTruthy();
    expect(screen.getByText('Certificato medico non ancora consegnato. La società darà aggiornamenti a breve.')).toBeTruthy();
    expect(await screen.findByText('€80.00')).toBeTruthy();
    expect(await screen.findByText('Conferma la presenza a 1 impegno dei prossimi 7 giorni.')).toBeTruthy();
    expect(screen.getByText('Allenamento — Palestra')).toBeTruthy();
    expect(leggiAvvisi).toHaveBeenCalledWith(['tutte', 'Under 19']);

    await fireEvent.press(screen.getByRole('tab', { name: 'Sara' }));
    expect(screen.getByRole('header', { name: 'Sara Prova' })).toBeTruthy();
    await waitFor(() => expect(leggiAvvisi).toHaveBeenCalledWith(['tutte', 'Under 13']));
    expect(await screen.findByText('Hai 2 avvisi non letti.')).toBeTruthy();
    // Il fissato della bacheca sta in Home, sotto il bonifico.
    expect(screen.getByRole('header', { name: 'Regolamento' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Avvisi, 2 non letti' })).toBeTruthy();
    expect(screen.getByText('Valido')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Copia IBAN' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('IT42Y0538779670000004768039');
    expect(await screen.findByText('IBAN copiato')).toBeTruthy();

    // Il tocco su "Hai 2 avvisi non letti." porta agli Avvisi.
    await fireEvent.press(screen.getByRole('link', { name: 'Hai 2 avvisi non letti.' }));
    expect(screen.getByText('In evidenza')).toBeTruthy();
    expect(screen.getByText('Altri avvisi')).toBeTruthy();
    expect(screen.getAllByText('Nuovo')).toHaveLength(2);
    expect(screen.getByText('Importante')).toBeTruthy();
    expect(screen.queryByText('Solo Under 19')).toBeNull();
    expect(screen.getByRole('link', { name: 'https://www.victorvolley.it' })).toBeTruthy();
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith('vv_avvisi_letti_u-famiglia_atl-sara', finto.avvisi[0].createdAt));

    // Letti: in Home non ci sono piu', e il numero sparisce.
    await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
    expect(screen.queryByText(/avvisi? non lett/)).toBeNull();
    expect(screen.getByRole('tab', { name: 'Avvisi' })).toBeTruthy();

    // Le sezioni non ancora fatte rimandano al sito.
    await fireEvent.press(screen.getByRole('tab', { name: 'Documenti' }));
    expect(screen.getByRole('button', { name: 'Apri l’area atleti del sito' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Esci' }));
    expect(esci).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Accedi' })).toBeTruthy();
  }, 60000);

  it('account senza schede e avvisi che non si caricano', async () => {
    finto.utente = { uid: 'u-vuoto', email: 'x@y.it' };
    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    expect(await screen.findByText('Nessun dato trovato per questo account.')).toBeTruthy();
    expect(screen.getByText('Contatta la segreteria di Victor Volley.')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
  }, 60000);

  it('se gli avvisi non si caricano lo dice, e la Home funziona lo stesso', async () => {
    finto.utente = { uid: 'u-famiglia', email: finto.credenziali.email };
    finto.schede = { conAccesso: [sara], propria: null, errore: false };
    finto.avvisiErrore = true;
    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    expect(await screen.findByRole('header', { name: 'Sara Prova' })).toBeTruthy();
    expect(screen.getByText('Tutto in regola, non c’è niente da fare.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Avvisi' }));
    expect(await screen.findByText('Non è stato possibile caricare gli avvisi. Riprova più tardi.')).toBeTruthy();
  }, 60000);
});
