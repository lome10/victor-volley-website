import {
  agenda,
  daConfermare,
  etichettaGiorno,
  giornoEsteso,
  giornoSettimana,
  icsAtleta,
  linkMappa,
  nomeFileIcsAtleta,
  perGiorno,
  piuGiorni,
  prossimoImpegno,
  ultimiRisultati,
  type Eccezione,
  type Orario,
} from '~/lib/agenda';
import type { Partita } from '~/lib/dati';

const ADESSO = new Date(2026, 10, 27, 9, 0); // venerdi' 27/11/2026

const partita = (id: string, data: string, extra: Partial<Partita> = {}): Partita => ({
  id,
  stagione: '2026/2027',
  categoria: 'Under 13',
  squadraCasa: 'Victor Volley',
  squadraOspite: 'Avversaria',
  logoCasa: '',
  logoOspite: '',
  data,
  ora: '18:00',
  palazzetto: 'Palazzetto ARKÉ',
  stato: 'programmata',
  setCasa: null,
  setOspite: null,
  sppCode: null,
  ...extra,
});

const orario = (o: Partial<Orario>): Orario => ({
  id: 'o1',
  categoria: 'Under 13',
  giorno: 2,
  oraInizio: '17:00',
  oraFine: '18:30',
  luogo: 'Palestra',
  note: '',
  validoFino: '',
  ...o,
});

const nessuna = (id: string, e: Partial<Eccezione>): Eccezione => ({ id, annullato: false, data: null, oraInizio: null, oraFine: null, luogo: null, ...e });

describe('agenda dell\'area atleti (js/atleta.js)', () => {
  it('giorni e settimana', () => {
    expect(giornoSettimana('2026-11-27')).toBe(5);
    expect(giornoSettimana('2026-11-29')).toBe(7);
    expect(piuGiorni('2026-11-27', 5)).toBe('2026-12-02');
    expect(giornoEsteso('2026-11-29')).toBe('Domenica 29 novembre');
  });

  it('partite della squadra (non concluse, da oggi) e allenamenti di 14 giorni, in ordine', () => {
    const partite = [
      partita('p2', '2026-12-05'),
      partita('p1', '2026-11-27', { sppCode: 'ABC' }),
      partita('vecchia', '2026-11-20'),
      partita('finita', '2026-11-27', { stato: 'conclusa' }),
      partita('altra', '2026-11-28', { categoria: 'Under 19' }),
      partita('fuori/casa', '2026-11-30', { squadraCasa: 'Avversaria', squadraOspite: 'Victor Volley', ora: '' }),
    ];
    const e = agenda('Under 13', partite, [orario({})], [], ADESSO);
    expect(e.map((x) => x.date + ' ' + x.key)).toEqual([
      '2026-11-27 p-p1',
      '2026-11-30 p-fuori_casa',
      '2026-12-01 a-o1-2026-12-01',
      '2026-12-05 p-p2',
      '2026-12-08 a-o1-2026-12-08',
    ]);
    expect(e[0]).toMatchObject({ tipo: 'partita', title: 'Victor Volley – Avversaria', home: true, diretta: true, start: '18:00', luogo: 'Palazzetto ARKÉ' });
    expect(e[1]).toMatchObject({ home: false, diretta: false, start: '' });
    expect(e[2]).toMatchObject({ tipo: 'allenamento', title: 'Allenamento', start: '17:00', end: '18:30', luogo: 'Palestra', eventoId: 'o1' });
    expect(agenda(undefined, partite, [orario({})], [], ADESSO)).toEqual([]);
  });

  it('al massimo 12 partite', () => {
    const tante = Array.from({ length: 15 }, (_, i) => partita('p' + i, piuGiorni('2026-11-28', i)));
    expect(agenda('Under 13', tante, [], [], ADESSO)).toHaveLength(12);
  });

  it('orario valido fino a una data; eccezioni: annullato, spostato, fine e luogo anche vuoti', () => {
    expect(agenda('Under 13', [], [orario({ validoFino: '2026-12-05' })], [], ADESSO).map((x) => x.date)).toEqual(['2026-12-01']);
    const ecc = [
      nessuna('a-o1-2026-12-01', { annullato: true }),
      nessuna('a-o1-2026-12-08', { data: '2026-12-09', oraInizio: '19:00', oraFine: '', luogo: '' }),
    ];
    const e = agenda('Under 13', [], [orario({})], ecc, ADESSO);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ key: 'a-o1-2026-12-08', date: '2026-12-09', start: '19:00', end: '', luogo: '' });
    // Eccezione senza campi: resta l'orario solito.
    const solito = agenda('Under 13', [], [orario({})], [nessuna('a-o1-2026-12-01', {})], ADESSO)[0];
    expect(solito).toMatchObject({ date: '2026-12-01', start: '17:00', end: '18:30', luogo: 'Palestra' });
  });

  it('presenze da confermare nei prossimi 7 giorni e prossimo impegno', () => {
    const e = agenda('Under 13', [partita('p1', '2026-11-28'), partita('p2', '2026-12-10')], [orario({})], [], ADESSO);
    expect(daConfermare(e, {}, ADESSO)).toBe(2);
    expect(daConfermare(e, { 'p-p1': 'no' }, ADESSO)).toBe(1);
    expect(prossimoImpegno('Under 13', e)).toEqual({ valore: 'Sabato 28 novembre · 18:00', sotto: 'Victor Volley – Avversaria — Palazzetto ARKÉ' });
    expect(prossimoImpegno('Under 13', [])).toEqual({ valore: 'Nessun impegno', sotto: 'Non ci sono partite o allenamenti in programma' });
    expect(prossimoImpegno(undefined, e)).toEqual({ valore: '—', sotto: 'Squadra non ancora assegnata' });
  });

  it('giorni del calendario, gruppi, mappa', () => {
    expect(etichettaGiorno('2026-11-27', ADESSO)).toBe('Oggi · Venerdì 27 novembre');
    expect(etichettaGiorno('2026-11-28', ADESSO)).toBe('Domani · Sabato 28 novembre');
    expect(etichettaGiorno('2026-12-01', ADESSO)).toBe('Martedì 1 dicembre');
    const e = agenda('Under 13', [partita('p1', '2026-12-01', { ora: '20:00' })], [orario({})], [], ADESSO);
    expect(perGiorno(e).map((g) => [g.data, g.impegni.map((x) => x.key)])).toEqual([
      ['2026-12-01', ['a-o1-2026-12-01', 'p-p1']],
      ['2026-12-08', ['a-o1-2026-12-08']],
    ]);
    expect(linkMappa('Palazzetto ARKÉ, Lecce')).toBe('https://www.google.com/maps/search/?api=1&query=Palazzetto%20ARK%C3%89%2C%20Lecce');
  });

  it("ultimi risultati: 3, dal piu' recente, vinta/persa dal lato Victor", () => {
    const r = ultimiRisultati('Under 13', [
      partita('a', '2026-11-01', { stato: 'conclusa', setCasa: 3, setOspite: 0 }),
      partita('b', '2026-11-08', { stato: 'conclusa', setCasa: 1, setOspite: 3 }),
      partita('c', '2026-11-15', { stato: 'conclusa', squadraCasa: 'Avversaria', squadraOspite: 'Victor Volley', setCasa: 2, setOspite: 3 }),
      partita('d', '2026-11-22', { stato: 'conclusa', setCasa: null, setOspite: null }),
      partita('e', '2026-11-20', { stato: 'conclusa', setCasa: 3, setOspite: 2 }),
    ]);
    expect(r.map((x) => [x.id, x.vinta, x.risultato, x.data])).toEqual([
      ['e', true, '3–2', '20/11/2026'],
      ['c', true, '2–3', '15/11/2026'],
      ['b', false, '1–3', '08/11/2026'],
    ]);
    expect(ultimiRisultati(undefined, [])).toEqual([]);
  });

  it('.ics come il sito: partite di 2 ore, allenamenti settimanali, righe piegate, nome del file', () => {
    const CRLF = '\r\n';
    const partite = [partita('p1', '2026-11-28', { ora: '18:30' }), partita('p2', '2026-12-05', { squadraCasa: 'Avversaria', squadraOspite: 'Victor Volley' })];
    const t = icsAtleta('Under 13', partite, [orario({ note: 'Porta, la borraccia' })], ADESSO);
    expect(t.startsWith('BEGIN:VCALENDAR' + CRLF + 'VERSION:2.0' + CRLF)).toBe(true);
    expect(t.endsWith('END:VCALENDAR' + CRLF)).toBe(true);
    expect(t).toContain('DTSTART:20261128T183000' + CRLF + 'DTEND:20261128T203000');
    expect(t).toContain('DESCRIPTION:Partita Under 13 (in trasferta)');
    expect(t).toContain('DTSTART:20261201T170000' + CRLF + 'DTEND:20261201T183000' + CRLF + 'RRULE:FREQ=WEEKLY;COUNT=52');
    expect(t).toContain('DESCRIPTION:Porta\\, la borraccia');
    expect(t.split(CRLF).every((r) => r.length <= 74)).toBe(true);
    const una = icsAtleta('Under 13', partite, [orario({})], ADESSO, 'p2');
    expect(una.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(una).toContain('UID:partita-p2@victorvolley');
    expect(icsAtleta('Under 13', [], [orario({ validoFino: '2026-11-30' })], ADESSO)).not.toContain('BEGIN:VEVENT');
    expect(icsAtleta('Under 13', [], [orario({ validoFino: '2027-01-31' })], ADESSO)).toContain('RRULE:FREQ=WEEKLY;UNTIL=20270131T235959');
    expect(nomeFileIcsAtleta('Under 13')).toBe('victor-volley-under-13.ics');
    expect(nomeFileIcsAtleta('Prima Divisione Élite')).toBe('victor-volley-prima-divisione-elite.ics');
  });
});
