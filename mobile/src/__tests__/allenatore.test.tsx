// Area Allenatore (allenatore.html): regole e pagina, con Firebase finto e fetch finto. Nessuna chiamata vera al sito,
// nessuna scrittura vera: i salvataggi delle presenze arrivano a un fetch finto che li registra.
import { QueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { esciEPulisci } from '~/lib/uscita';

import {
  AccessoNegato,
  conStatoNeiDati,
  dataNascita,
  etichettaGenitore,
  giornoIniziale,
  giorniUnici,
  leggiAtletiAllenatore,
  leggiPresenzeAllenatore,
  notaGiorno,
  righeStat,
  segnaPresenzaAllenatore,
  SessioneScaduta,
  statDi,
  telHref,
  type CategoriaPresenze,
  type DatiAtleti,
  type DatiPresenze,
} from '~/lib/allenatore';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { azzera, finto, esci, cambiaUtente } = require('../../test/firebaseFinto') as typeof import('../../test/firebaseFinto');

const OGGI = '2026-11-27'; // venerdi'
const g = (data: string, oraInizio = '18:00') => ({ data, dataOriginale: data, orarioId: 'o1', oraInizio, oraFine: '19:30', luogo: 'Palestra' });

const categoria = (): CategoriaPresenze => ({
  categoria: 'Under 14 F',
  // dal piu' recente, come li manda il server; il 20/10 e' prima del 29/10 e non si mostra
  giorni: [g('2026-12-01'), g(OGGI), g('2026-11-25', '17:30'), g('2026-11-20', '17:30'), g('2026-11-18'), g('2026-10-20')],
  atleti: [
    { id: 'a1', cognome: 'Bianchi', nome: 'Anna' },
    { id: 'a2', cognome: 'Rossi', nome: 'Sara' },
    { id: 'a3', cognome: 'Verdi', nome: 'Elena' },
  ],
  presenze: {
    '2026-11-25': { a1: 'p', a2: 'a' },
    '2026-11-20': { a1: 'p', a2: 'p', a3: 'a' },
    '2026-11-18': { a1: 'a' },
  },
});

const ATLETI: DatiAtleti = {
  allenatore: { nome: 'Mario', cognome: 'Mister' },
  categorie: ['Under 14 F'],
  atleti: [
    {
      cognome: 'Bianchi',
      nome: 'Anna',
      categoria: 'Under 14 F',
      dataNascita: '2012-03-04',
      genitori: [{ nome: 'Maria Bianchi', parentela: 'mamma', telefono: '333 123 4567' }],
      note: 'Porta le ginocchiere',
    },
    { cognome: 'Rossi', nome: 'Sara', categoria: 'Under 14 F', dataNascita: '', genitori: [], note: '' },
  ],
};

type Chiamata = { url: string; metodo: string; auth: string; corpo: Record<string, string> | null };

/** Fetch finto: le due funzioni del server dell'allenatore e i dati pubblici dell'app. */
function sitoFinto(op: { atletiStato?: number; presenzeStato?: number; postFallisce?: string[] } = {}) {
  const chiamate: Chiamata[] = [];
  const f = jest.fn(async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const metodo = init?.method ?? 'GET';
    chiamate.push({ url, metodo, auth: init?.headers?.Authorization ?? '', corpo: init?.body ? JSON.parse(init.body) : null });
    const risposta = (status: number, corpo: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
    if (url.endsWith('/api/allenatore-atleti')) return risposta(op.atletiStato ?? 200, ATLETI);
    if (url.endsWith('/api/allenatore-presenze') && metodo === 'GET') return risposta(op.presenzeStato ?? 200, { oggi: OGGI, categorie: [categoria()] });
    if (url.endsWith('/api/allenatore-presenze')) {
      const id = init?.body ? JSON.parse(init.body).atletaId : '';
      return risposta(op.postFallisce?.includes(id) ? 500 : 200, { ok: true });
    }
    return risposta(200, { partite: [], articoli: [], sponsor: [] });
  });
  globalThis.fetch = f as unknown as typeof fetch;
  return chiamate;
}

describe('regole dell\'area allenatore (js/allenatore.js)', () => {
  it('data di nascita, telefono, genitore', () => {
    expect(dataNascita('2012-03-04', new Date(2026, 10, 27))).toBe('4/3/2012 (14 anni)');
    expect(dataNascita('2012-12-04', new Date(2026, 10, 27))).toBe('4/12/2012 (13 anni)');
    expect(dataNascita('', new Date())).toBe('—');
    expect(telHref('+39 333 12-34 567')).toBe('tel:+393331234567');
    expect(telHref('333+12')).toBe('tel:33312');
    expect(telHref('—')).toBe('');
    expect(etichettaGenitore({ nome: 'Maria Bianchi', parentela: 'mamma', telefono: '1' })).toBe('Maria Bianchi (mamma)');
    expect(etichettaGenitore({ nome: '', parentela: 'papà', telefono: '1' })).toBe('papà');
  });

  it('giorni unici, giorno iniziale, nota del giorno', () => {
    const cat = categoria();
    cat.giorni.splice(3, 0, { ...g('2026-11-25', '19:30'), orarioId: 'o2' }); // subito dopo l'altro orario del 25/11
    const giorni = giorniUnici(cat);
    expect(giorni.map((x) => x.data)[0]).toBe('2026-10-20');
    expect(giorni.find((x) => x.data === '2026-11-25')!.ore).toEqual(['19:30', '17:30']);
    expect(giornoIniziale(giorni, OGGI)).toBe(OGGI);
    expect(giornoIniziale(giorni.filter((x) => x.data > OGGI), OGGI)).toBe('2026-12-01');
    expect(giornoIniziale([], OGGI)).toBe('');
    expect(notaGiorno(cat, { data: OGGI, ore: [] }, OGGI)).toBe('oggi');
    expect(notaGiorno(cat, { data: '2026-11-25', ore: [] }, OGGI)).toBe('2/3');
    expect(notaGiorno(cat, { data: '2026-12-01', ore: ['18:00'] }, OGGI)).toBe('18:00');
  });

  it('statistiche: stesse regole di presenze-stat, piu\' bassa prima, chi non ha niente in fondo', () => {
    const cat = categoria();
    expect(statDi(cat, 'a1', 30, OGGI)).toMatchObject({ si: 2, no: 1, nr: 1, pct: 67 });
    expect(statDi(cat, 'a3', 30, OGGI).pct).toBe(0);
    cat.atleti.push({ id: 'a4', cognome: 'Arancio', nome: 'Lia' });
    expect(righeStat(cat, 30, 'ass', OGGI).map((r) => r.a.id)).toEqual(['a3', 'a2', 'a1', 'a4']);
    expect(righeStat(cat, 30, 'nome', OGGI).map((r) => r.a.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('rollback di un solo atleta: gli altri restano', () => {
    const dati: DatiPresenze = { oggi: OGGI, categorie: [categoria()] };
    const tutti = conStatoNeiDati(dati, 'Under 14 F', OGGI, ['a1', 'a2', 'a3'], 'p');
    const indietro = conStatoNeiDati(tutti, 'Under 14 F', OGGI, ['a2'], '');
    expect(indietro.categorie[0].presenze[OGGI]).toEqual({ a1: 'p', a3: 'p' });
    expect(dati.categorie[0].presenze[OGGI]).toBeUndefined(); // l'originale non cambia
  });

  describe('chiamate al server (fetch finto)', () => {
    beforeEach(() => {
      azzera();
      finto.utente = { uid: 'u-mister', email: 'mister@prova.it' };
    });

    it('gettone nell\'intestazione, presenze dal 29/10, POST con i 4 campi', async () => {
      const chiamate = sitoFinto();
      expect((await leggiAtletiAllenatore()).allenatore.nome).toBe('Mario');
      const p = await leggiPresenzeAllenatore();
      expect(p.categorie[0].giorni.map((x) => x.data)).not.toContain('2026-10-20');
      await segnaPresenzaAllenatore('Under 14 F', OGGI, 'a1', 'p');
      expect(chiamate[0]).toEqual({ url: 'https://www.victorvolley.it/api/allenatore-atleti', metodo: 'GET', auth: 'Bearer gettone-finto-u-mister', corpo: null });
      expect(chiamate[2]).toEqual({
        url: 'https://www.victorvolley.it/api/allenatore-presenze',
        metodo: 'POST',
        auth: 'Bearer gettone-finto-u-mister',
        corpo: { categoria: 'Under 14 F', data: OGGI, atletaId: 'a1', stato: 'p' },
      });
    });

    it('401 = sessione scaduta, 403 = accesso negato, senza utente nessuna chiamata', async () => {
      sitoFinto({ atletiStato: 401 });
      await expect(leggiAtletiAllenatore()).rejects.toBeInstanceOf(SessioneScaduta);
      sitoFinto({ atletiStato: 403 });
      await expect(leggiAtletiAllenatore()).rejects.toBeInstanceOf(AccessoNegato);
      const chiamate = sitoFinto();
      finto.utente = null;
      await expect(leggiPresenzeAllenatore()).rejects.toBeInstanceOf(SessioneScaduta);
      expect(chiamate).toHaveLength(0);
    });
  });
});

describe('pagina Area dirigenti / allenatore (Firebase e sito finti)', () => {
  beforeEach(() => {
    azzera();
    jest.clearAllMocks();
    finto.utente = { uid: 'u-mister', email: 'mister@prova.it' };
    finto.ruolo = 'allenatore';
  });

  it('senza accesso: il login dell\'area dirigenti', async () => {
    finto.utente = null;
    sitoFinto();
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    expect(screen.getByRole('header', { name: 'Area Dirigenti' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  }, 60000);

  it('dirigente: "in arrivo" con Esci', async () => {
    sitoFinto();
    finto.ruolo = 'dirigente';
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    expect(await screen.findByText(/Il pannello dei dirigenti nell’app è in arrivo/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Esci' }));
    expect(esci).toHaveBeenCalled();
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  }, 60000);

  it('nessun ruolo: accesso non autorizzato', async () => {
    sitoFinto();
    finto.ruolo = 'nessuno';
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    expect(await screen.findByRole('header', { name: 'Accesso non autorizzato' })).toBeTruthy();
  }, 60000);

  it('allenatore tolto (403 dal server): accesso non abilitato', async () => {
    sitoFinto({ atletiStato: 403 });
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    expect(await screen.findByRole('header', { name: 'Accesso non abilitato' })).toBeTruthy();
  }, 60000);

  it('Atleti: nome del mister, ricerca, telefono del genitore da chiamare', async () => {
    sitoFinto();
    const apri = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    // Il primo caricamento della pagina nei test supera il secondo di attesa standard.
    expect(await screen.findByText('Bianchi Anna', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText('Mario Mister')).toBeTruthy();
    expect(screen.getByText(/Nato il 4\/3\/2012/)).toBeTruthy();
    expect(screen.getByText('Porta le ginocchiere')).toBeTruthy();
    expect(screen.getByText('Telefono non inserito')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Chiama Maria Bianchi (mamma) 333 123 4567' }));
    expect(apri).toHaveBeenCalledWith('tel:3331234567');
    await fireEvent.changeText(screen.getByLabelText('Cerca un atleta per nome'), 'ross');
    expect(screen.getByText('1 atleta')).toBeTruthy();
    expect(screen.queryByText('Bianchi Anna')).toBeNull();
  }, 60000);

  it('Presenze: oggi, "Tutti presenti", un salvataggio fallisce e torna indietro solo quello', async () => {
    const chiamate = sitoFinto({ postFallisce: ['a2'] });
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    await fireEvent.press(await screen.findByRole('tab', { name: 'Presenze' }, { timeout: 10000 }));
    expect(await screen.findByRole('header', { name: 'Oggi · Venerdì 27 novembre · 18:00' })).toBeTruthy();
    expect(screen.getByText('0 su 3 segnati')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tutti presenti' }));
    expect(await screen.findByText('Non sono riuscito a salvare tutto: controlla e riprova.')).toBeTruthy();
    expect(screen.getByText('2 su 3 segnati')).toBeTruthy();
    const post = chiamate.filter((c) => c.metodo === 'POST');
    expect(post.map((c) => c.corpo!.atletaId).sort()).toEqual(['a1', 'a2', 'a3']);
    expect(post.every((c) => c.corpo!.stato === 'p' && c.corpo!.data === OGGI && c.corpo!.categoria === 'Under 14 F')).toBe(true);
    expect(screen.getByRole('button', { name: 'Rossi Sara, ven 27/11: presente' }).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByRole('button', { name: 'Bianchi Anna, ven 27/11: presente' }).props.accessibilityState).toMatchObject({ selected: true });

    // Un altro giorno: 25/11, Bianchi presente; toccare di nuovo "Sì" toglie la risposta (stato '').
    await fireEvent.press(screen.getByRole('button', { name: 'Mercoledì 25 novembre' }));
    expect(screen.getByText('2 su 3 segnati')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Bianchi Anna, mer 25/11: presente' }));
    await waitFor(() => expect(chiamate.filter((c) => c.metodo === 'POST')).toHaveLength(4));
    expect(chiamate[chiamate.length - 1].corpo).toEqual({ categoria: 'Under 14 F', data: '2026-11-25', atletaId: 'a1', stato: '' });
    expect(await screen.findByText('1 su 3 segnati')).toBeTruthy(); // react-query avvisa lo schermo un attimo dopo
  }, 60000);

  it('Statistiche: media, presenza piu\' bassa prima, scheda dell\'atleta e ritorno', async () => {
    sitoFinto();
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    await fireEvent.press(await screen.findByRole('tab', { name: 'Statistiche' }, { timeout: 10000 }));
    expect(await screen.findByText('39%')).toBeTruthy(); // (67 + 50 + 0) / 3
    expect(screen.getByText('4')).toBeTruthy(); // allenamenti fatti negli ultimi 30 giorni
    const voci = screen.getAllByRole('button', { name: /, presenza / }).map((b) => b.props.accessibilityLabel);
    expect(voci).toEqual(['Verdi Elena, presenza 0%', 'Rossi Sara, presenza 50%', 'Bianchi Anna, presenza 67%']);
    await fireEvent.press(screen.getByRole('button', { name: 'Verdi Elena, presenza 0%' }));
    expect(screen.getByRole('header', { name: 'Verdi Elena' })).toBeTruthy();
    expect(screen.getByText('Under 14 F · ultimi 30 giorni')).toBeTruthy();
    expect(screen.getByLabelText('Presenza 0 per cento')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '‹ Statistiche' }));
    expect(screen.getByText('39%')).toBeTruthy();
  }, 60000);
});

describe('revisione di Anselmo (A-D)', () => {
  beforeEach(() => {
    azzera();
    jest.clearAllMocks();
    finto.utente = { uid: 'u-mister', email: 'mister@prova.it' };
    finto.ruolo = 'allenatore';
  });

  it('A) rete assente: "Controlla la connessione" e Riprova, non "Accesso non autorizzato"', async () => {
    sitoFinto();
    finto.ruoloErrore = true;
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    expect(await screen.findByText(/Controlla la connessione/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Accesso non autorizzato' })).toBeNull();
    finto.ruoloErrore = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Bianchi Anna', {}, { timeout: 10000 })).toBeTruthy();
  }, 60000);

  it('B) dirigente che e' anche allenatore: tasto "Area allenatore" (solo a lui), come /allenatore sul sito', async () => {
    sitoFinto();
    finto.ruolo = 'entrambi';
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    expect(await screen.findByText(/Il pannello dei dirigenti nell’app è in arrivo/, {}, { timeout: 10000 })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Area allenatore' }));
    expect(await screen.findByText('Bianchi Anna', {}, { timeout: 10000 })).toBeTruthy();
  }, 60000);

  it('B) solo dirigente: nessun tasto "Area allenatore"', async () => {
    sitoFinto();
    finto.ruolo = 'dirigente';
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    expect(await screen.findByText(/Il pannello dei dirigenti nell’app è in arrivo/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Area allenatore' })).toBeNull();
  }, 60000);

  it('C) se l'uscita da Firebase fallisce, i dati riservati sono gia' cancellati', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['allenatore', 'atleti', 'u-mister'], ATLETI);
    qc.setQueryData(['atleti', 'u-famiglia'], []);
    qc.setQueryData(['pubblico'], { ok: true });
    esci.mockRejectedValueOnce(new Error('rete assente'));
    await esciEPulisci(qc);
    expect(qc.getQueryData(['allenatore', 'atleti', 'u-mister'])).toBeUndefined();
    expect(qc.getQueryData(['atleti', 'u-famiglia'])).toBeUndefined();
    expect(qc.getQueryData(['pubblico'])).toEqual({ ok: true }); // i dati pubblici restano
  });

  it('D) utente che torna null senza Esci: i dati del mister non restano in memoria', async () => {
    const chiamate = sitoFinto();
    const letture = () => chiamate.filter((c) => c.url.endsWith('/api/allenatore-atleti')).length;
    await renderRouter('./src/app', { initialUrl: '/area-dirigenti' });
    expect(await screen.findByText('Bianchi Anna', {}, { timeout: 10000 })).toBeTruthy();
    expect(letture()).toBe(1);
    await act(async () => cambiaUtente(null));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    await act(async () => cambiaUtente({ uid: 'u-mister', email: 'mister@prova.it' }));
    expect(await screen.findByText('Bianchi Anna', {}, { timeout: 10000 })).toBeTruthy();
    // Se i dati fossero rimasti in memoria, l'elenco arriverebbe dalla cache senza una nuova lettura.
    expect(letture()).toBe(2);
  }, 60000);
});
