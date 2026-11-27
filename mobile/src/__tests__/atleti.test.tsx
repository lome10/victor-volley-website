import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { RESET_INVIATO, richiediReset } from '~/lib/accesso';
import { condividiIcs } from '~/lib/condividiIcs';
import { condividiPdf } from '~/lib/stampaPdf';
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
const { azzera, finto, esci, leggiAvvisi, salvaPresenza, salvaPromemoria, cambiaPassword } = require('../../test/firebaseFinto') as typeof import('../../test/firebaseFinto');

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('~/lib/condividiIcs', () => ({ condividiIcs: jest.fn(async () => {}) }));
jest.mock('~/lib/stampaPdf', () => ({ FinestraBloccata: class extends Error {}, condividiPdf: jest.fn(async () => {}) }));

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

    // Documenti: le 4 schede del sito.
    await fireEvent.press(screen.getByRole('tab', { name: 'Documenti' }));
    expect(screen.getByRole('header', { name: 'Certificato Medico' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Quote e Pagamenti' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Ricevute di pagamento' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Modulo di Iscrizione' })).toBeTruthy();

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

  it('Calendario: impegni per giorno, Ci sarò / Non ci sarò (finto), errore che torna indietro, risultati, .ics', async () => {
    const oggi = new Date();
    const domani = tra(1, oggi);
    finto.utente = { uid: 'u-famiglia', email: finto.credenziali.email };
    finto.schede = { conAccesso: [sara], propria: null, errore: false };
    const keyAll = 'a-o1-' + tra(2, oggi);
    finto.presenze = { 'atl-sara': { [keyAll]: 'no' } };
    const pubblico = {
      partite: [
        { id: 'p1', stagione: '2026/2027', categoria: 'Under 13', squadraCasa: 'Victor Volley', squadraOspite: 'Avversaria', data: domani, ora: '18:00', palazzetto: 'Palazzetto ARKÉ', stato: 'programmata', setCasa: null, setOspite: null, sppCode: null },
        { id: 'v1', stagione: '2026/2027', categoria: 'Under 13', squadraCasa: 'Altra', squadraOspite: 'Victor Volley', data: tra(-7, oggi), ora: '18:00', palazzetto: '', stato: 'conclusa', setCasa: 1, setOspite: 3, sppCode: null },
      ],
      articoli: [],
      sponsor: [],
      allenamenti: [{ id: 'o1', categoria: 'Under 13', giorno: ((new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 2).getDay() + 6) % 7) + 1, oraInizio: '17:00', oraFine: '18:30', luogo: 'Palestra', note: 'Portare le ginocchiere', validoFino: '' }],
      allenamentiEccezioni: [],
    };
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => pubblico })) as unknown as typeof fetch;

    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    expect(await screen.findByRole('header', { name: 'Sara Prova' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Calendario' }));

    expect(await screen.findByText('Prossimi impegni')).toBeTruthy();
    expect(screen.getByRole('header', { name: /^Domani · / })).toBeTruthy();
    expect(screen.getByText('Victor Volley – Avversaria')).toBeTruthy();
    expect(screen.getByText('Casa')).toBeTruthy();
    // L'allenamento settimanale cade 2 volte nei 14 giorni: 3 impegni, 3 righe di risposta.
    expect(screen.getAllByText('Portare le ginocchiere')).toHaveLength(2);
    expect(screen.getAllByText('Sara:')).toHaveLength(3);

    // Risposta gia' data al primo allenamento: "Non ci sarò" e' acceso; il secondo e' senza risposta.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Non ci sarò, Allenamento/ })[0].props.accessibilityState).toMatchObject({ selected: true }));
    expect(screen.getAllByRole('button', { name: /^Non ci sarò, Allenamento/ })[1].props.accessibilityState).toMatchObject({ selected: false });

    // "Ci sarò" alla partita: si vede subito e va al Firebase finto con i dati giusti.
    await fireEvent.press(screen.getByRole('button', { name: /^Ci sarò, Victor Volley/ }));
    expect(salvaPresenza).toHaveBeenCalledWith(expect.objectContaining({ key: 'p-p1', tipo: 'partita', eventoId: 'p1', date: domani }), { uid: 'atl-sara', categoria: 'Under 13' }, 'si', 'u-famiglia');
    expect(screen.getByRole('button', { name: /^Ci sarò, Victor Volley/ }).props.accessibilityState).toMatchObject({ selected: true });
    expect(finto.presenze['atl-sara']['p-p1']).toBe('si');

    // Stessa risposta: nessun nuovo salvataggio.
    await fireEvent.press(screen.getByRole('button', { name: /^Ci sarò, Victor Volley/ }));
    expect(salvaPresenza).toHaveBeenCalledTimes(1);

    // Il salvataggio non riesce: messaggio e la risposta torna "Ci sarò".
    finto.presenzaFallisce = true;
    await fireEvent.press(screen.getByRole('button', { name: /^Non ci sarò, Victor Volley/ }));
    expect(await screen.findByText('Non sono riuscito a salvare la risposta. Riprova.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Ci sarò, Victor Volley/ }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: /^Non ci sarò, Victor Volley/ }).props.accessibilityState).toMatchObject({ selected: false });

    // Ultimi risultati: vinta in trasferta 1-3.
    expect(screen.getByText('Ultimi risultati')).toBeTruthy();
    expect(screen.getByText('Vinta')).toBeTruthy();
    expect(screen.getByText('1–3')).toBeTruthy();

    // .ics: tutto il calendario, poi una sola partita.
    const tasti = screen.getAllByRole('button', { name: 'Aggiungi al calendario' });
    await fireEvent.press(tasti[0]);
    const [testo, nome] = (condividiIcs as jest.Mock).mock.calls[0];
    expect(nome).toBe('victor-volley-under-13.ics');
    expect(testo).toContain('SUMMARY:Victor Volley – Avversaria');
    expect(testo).toContain('SUMMARY:Allenamento Under 13');
    await fireEvent.press(tasti[1]);
    expect((condividiIcs as jest.Mock).mock.calls[1][0]).not.toContain('Allenamento');
  }, 60000);

  it('Squadra: staff e giocatori della categoria e della stagione corrente', async () => {
    finto.utente = { uid: 'u-famiglia', email: finto.credenziali.email };
    finto.schede = { conAccesso: [sara], propria: null, errore: false };
    const persona = { photo: '', photoFocus: '', id: null };
    const pubblico = {
      partite: [],
      articoli: [],
      sponsor: [],
      stagioni: [
        { id: '2025/2026', name: '2025/2026', current: false },
        { id: '2026/2027', name: '2026/2027', current: true },
      ],
      categorie: [{ id: 13, name: 'Under 13', abbr: 'U13', color: '', description: '', schedule: '', showInSquadre: true }],
      staff: [{ ...persona, categoriaId: 13, stagione: '2026/2027', name: 'Anna Allenatrice', role: 'Allenatore', order: 1 }],
      giocatori: [
        { ...persona, categoriaId: 13, stagione: '2026/2027', name: 'Bea Bianchi', role: 'Palleggiatore', order: null, number: 7, gender: 'F' },
        { ...persona, categoriaId: 13, stagione: '2026/2027', name: 'Ada Rossi', role: 'Libero', order: null, number: 3, gender: 'F' },
        { ...persona, categoriaId: 13, stagione: '2025/2026', name: 'Vecchia Stagione', role: 'Centrale', order: null, number: 1, gender: 'F' },
        { ...persona, categoriaId: 19, stagione: '2026/2027', name: 'Altra Squadra', role: 'Centrale', order: null, number: 2, gender: 'F' },
      ],
    };
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => pubblico })) as unknown as typeof fetch;
    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    expect(await screen.findByRole('header', { name: 'Sara Prova' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Squadra' }));
    expect(await screen.findByText('Stagione 2026/2027')).toBeTruthy();
    expect(screen.getByText('Anna Allenatrice')).toBeTruthy();
    expect(screen.getByText('Palleggiatrice')).toBeTruthy();
    // In ordine di numero: Ada (3) prima di Bea (7).
    const nomi = screen.getAllByText(/^(Ada Rossi|Bea Bianchi)$/).map((t) => t.props.children);
    expect(nomi).toEqual(['Ada Rossi', 'Bea Bianchi']);
    expect(screen.queryByText('Vecchia Stagione')).toBeNull();
    expect(screen.queryByText('Altra Squadra')).toBeNull();
  }, 60000);

  it('Documenti: certificato, quote con riepilogo PDF, ricevute in PDF (finto), errore del PDF', async () => {
    finto.utente = { uid: 'u-famiglia', email: finto.credenziali.email };
    finto.schede = { conAccesso: [{ ...sara, certMedicoScadenza: tra(10), certMedicoUrl: 'https://drive.google.com/file/d/ABC123/view?usp=sharing' }], propria: null, errore: false };
    finto.rate = {
      'atl-sara': [
        { note: '1ª tranche', importo: 150, scadenza: tra(200), scadenzaPagamento: tra(-5), pagata: false },
        { note: 'Iscrizione', importo: 50, scadenza: tra(200), pagata: true, dataPagamento: tra(-20) },
      ],
    };
    finto.ricevute = {
      'atl-sara': [
        { id: 'r1', numero: '1/2026', data: '2026-10-01', progressivo: 1, importo: 50, causale: 'Iscrizione', stato: 'emessa' },
        { id: 'r2', numero: '2/2026', data: '2026-11-01', progressivo: 2, importo: 150, causale: '1ª tranche', stato: 'annullata' },
      ],
    };
    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    expect(await screen.findByRole('header', { name: 'Sara Prova' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Documenti' }));

    expect(screen.getByText('In scadenza')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apri PDF' })).toBeTruthy();
    expect(await screen.findByText('In ritardo')).toBeTruthy();
    expect(screen.getByText('Pagata')).toBeTruthy();
    expect(screen.getByText('Saldato: €50.00  ·  Dovuto: €150.00')).toBeTruthy();

    // Ricevute: la piu' recente prima, l'annullata segnata.
    expect(await screen.findByText('Ricevuta 2/2026')).toBeTruthy();
    const numeri = screen.getAllByText(/^Ricevuta \d/).map((t) => [].concat(t.props.children).join(''));
    expect(numeri).toEqual(['Ricevuta 2/2026', 'Ricevuta 1/2026']);
    expect(screen.getByText('Annullata')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Riepilogo PDF' }));
    const [html, nome] = (condividiPdf as jest.Mock).mock.calls[0];
    expect(nome).toBe('Riepilogo quote - Sara Prova.pdf');
    expect(html).toContain('<h1>Sara Prova</h1>');
    expect(html).toContain('200,00 €');

    await fireEvent.press(screen.getAllByRole('button', { name: 'Scarica PDF' })[1]);
    expect((condividiPdf as jest.Mock).mock.calls[1][1]).toBe('Ricevuta 1-2026.pdf');
    expect((condividiPdf as jest.Mock).mock.calls[1][0]).toContain('RICEVUTA DI PAGAMENTO');

    (condividiPdf as jest.Mock).mockRejectedValueOnce(new Error('niente'));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Scarica PDF' })[0]);
    expect(await screen.findByText('Non è stato possibile creare il PDF. Riprova.')).toBeTruthy();
  }, 60000);

  it('Documenti: quote e ricevute che non si caricano', async () => {
    finto.utente = { uid: 'u-famiglia', email: finto.credenziali.email };
    finto.schede = { conAccesso: [sara], propria: null, errore: false };
    finto.ricevuteErrore = true;
    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    expect(await screen.findByRole('header', { name: 'Sara Prova' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Documenti' }));
    expect(await screen.findByText('Non è stato possibile caricare le ricevute. Riprova più tardi.')).toBeTruthy();
    expect(screen.getByText('Nessuna quota inserita.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Riepilogo PDF' })).toBeNull();
  }, 60000);

  it('Profilo: promemoria (finto) che torna indietro se non si salva, cambio password con i controlli del sito', async () => {
    finto.utente = { uid: 'u-famiglia', email: finto.credenziali.email };
    finto.schede = { conAccesso: [sara], propria: null, errore: false };
    await renderRouter('./src/app', { initialUrl: '/area-atleti' });
    expect(await screen.findByRole('header', { name: 'Sara Prova' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Profilo' }));
    expect(screen.getByText(finto.credenziali.email)).toBeTruthy();

    const casella = await screen.findByLabelText('Ricevi un’email prima delle scadenze di quote e certificato medico');
    await waitFor(() => expect(casella.props.value).toBe(true));
    await fireEvent(casella, 'valueChange', false);
    expect(salvaPromemoria).toHaveBeenCalledWith('u-famiglia', false);
    expect(await screen.findByText('Promemoria disattivati: non riceverai più email di scadenza.')).toBeTruthy();

    (salvaPromemoria as jest.Mock).mockRejectedValueOnce(new Error('permesso negato'));
    await fireEvent(screen.getByLabelText('Ricevi un’email prima delle scadenze di quote e certificato medico'), 'valueChange', true);
    expect(await screen.findByText('Non è stato possibile salvare la preferenza. Riprova.')).toBeTruthy();
    expect(screen.getByLabelText('Ricevi un’email prima delle scadenze di quote e certificato medico').props.value).toBe(false);

    const scrivi = async (a: string, n: string, c: string) => {
      await fireEvent.changeText(screen.getByLabelText('Password attuale'), a);
      await fireEvent.changeText(screen.getByLabelText('Nuova password'), n);
      await fireEvent.changeText(screen.getByLabelText('Conferma nuova password'), c);
      await fireEvent.press(screen.getByRole('button', { name: 'Salva password' }));
    };
    await scrivi('vecchia-vecchia', 'corta', 'corta');
    expect(screen.getByText('La nuova password deve avere almeno 10 caratteri.')).toBeTruthy();
    await scrivi('vecchia-vecchia', 'nuova-nuova-1', 'nuova-nuova-2');
    expect(screen.getByText('Le due password non coincidono.')).toBeTruthy();
    await scrivi('stessa-stessa', 'stessa-stessa', 'stessa-stessa');
    expect(screen.getByText('La nuova password deve essere diversa da quella attuale.')).toBeTruthy();
    expect(cambiaPassword).not.toHaveBeenCalled();

    await scrivi('vecchia-vecchia', 'nuova-nuova-1', 'nuova-nuova-1');
    expect(cambiaPassword).toHaveBeenCalledWith('vecchia-vecchia', 'nuova-nuova-1');
    expect(await screen.findByText('Password aggiornata.')).toBeTruthy();
    expect(screen.getByLabelText('Nuova password').props.value).toBe('');
  }, 60000);
});
