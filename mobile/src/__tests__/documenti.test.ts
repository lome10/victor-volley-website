import { erroreNuovaPassword } from '~/components/atleti/ProfiloAtleta';
import type { Rata } from '~/lib/atleti';
import type { Pubblico } from '~/lib/dati';
import { badgeCertificato, htmlRiepilogoQuote, nomeFileRiepilogo, ordinaRicevute, sottoQuote, statoRata } from '~/lib/documentiAtleta';
import { eur, htmlRicevuta, inLettere, num, titoloRicevuta } from '~/lib/ricevutaDoc';
import { rosaAtleta } from '~/lib/squadraAtleta';

const ADESSO = new Date(2026, 10, 27, 10, 0); // 27/11/2026
const rata = (r: Partial<Rata>): Rata => ({ descrizione: 'Quota', importo: 100, scadenza: '', scadenzaPagamento: '', pagata: false, dataPagamento: null, ...r });

describe('ricevuta (js/ricevuta-doc.js)', () => {
  it('importo in lettere come il sito', () => {
    expect(inLettere(150)).toBe('centocinquanta/00');
    expect(inLettere(12.5)).toBe('dodici/50');
    expect(inLettere(21)).toBe('ventuno/00');
    expect(inLettere(28)).toBe('ventotto/00');
    expect(inLettere(23)).toBe('ventitré/00');
    expect(inLettere(3)).toBe('tre/00');
    expect(inLettere(108)).toBe('centotto/00');
    expect(inLettere(180)).toBe('centottanta/00');
    expect(inLettere(1000)).toBe('mille/00');
    expect(inLettere(2350)).toBe('duemilatrecentocinquanta/00');
    expect(inLettere(1000000)).toBe('un milione/00');
    expect(inLettere('')).toBe('');
    expect(inLettere(-1)).toBe('');
  });

  it('numeri all\'italiana', () => {
    expect(num(1234.5)).toBe('1.234,50');
    expect(num(0)).toBe('0,00');
    expect(num('abc')).toBe('0,00');
    expect(eur(1000000)).toBe('1.000.000,00 €');
  });

  it('documento: dati del pagatore e del versamento, escape, annullata, firma solo PNG', () => {
    const r = {
      id: 'r1',
      numero: '12/2026',
      data: '2026-11-03',
      importo: 150,
      causale: '1ª tranche <b>',
      tipoIncasso: 'Quota',
      modalita: 'Bonifico',
      pagatore: { nome: 'Mario Rossi', cf: 'RSSMRA', indirizzo: 'Via Roma 1', ruolo: 'Genitore / tutore' },
      atleta: { nome: 'Sara Rossi', cf: 'RSSSRA', dataNascita: '2013-04-05' },
      asd: { denominazione: 'ASD Victor Volley', luogo: 'Lecce', presidente: 'Il Presidente', firma: 'javascript:alert(1)' },
    };
    const h = htmlRicevuta(r, ADESSO, 'https://esempio.it');
    expect(h).toContain('<title>Ricevuta 12-2026 - Sara Rossi</title>');
    expect(h).toContain('Genitore / tutore pagatore');
    expect(h).toContain('1ª tranche &lt;b&gt;');
    expect(h).toContain('05/04/2013');
    expect(h).toContain('Euro centocinquanta/00');
    expect(h).toContain('€ 150,00');
    expect(h).toContain('Lecce, 27/11/2026');
    expect(h).toContain('src="https://esempio.it/assets/logo.png"');
    expect(h).not.toContain('javascript:');
    expect(h).not.toContain('ANNULLATA');

    const ann = htmlRicevuta({ ...r, stato: 'annullata', dataAnnullamento: '2026-11-10', motivoAnnullamento: 'Errore' }, ADESSO);
    expect(ann).toContain('<div class="stamp">ANNULLATA</div>');
    expect(ann).toContain('Ricevuta annullata il 10/11/2026.</strong> Motivo: Errore.');

    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(htmlRicevuta({ ...r, asd: { firma: png } }, ADESSO)).toContain('<img class="sigimg" src="' + png + '"');
    expect(titoloRicevuta({ id: 'x', numero: '3/2026', pagatore: { nome: 'Luca: Verdi!' } })).toBe('Ricevuta 3-2026 - Luca Verdi');
  });
});

describe('documenti dell\'area atleti', () => {
  it('stato delle rate e sottotitolo', () => {
    expect(statoRata(rata({ pagata: true, scadenza: '2020-01-01' }), '2026-11-27').testo).toBe('Pagata');
    expect(statoRata(rata({ scadenza: '2026-11-26' }), '2026-11-27').testo).toBe('Scaduta');
    expect(statoRata(rata({ scadenzaPagamento: '2026-11-26', scadenza: '2027-06-30' }), '2026-11-27').testo).toBe('In ritardo');
    expect(statoRata(rata({ scadenzaPagamento: '2026-11-27' }), '2026-11-27').testo).toBe('Da pagare');
    expect(sottoQuote([])).toBe('Stagione corrente');
    expect(sottoQuote([rata({ importo: 100, pagata: true }), rata({ importo: 50 })])).toBe('Saldato: €100.00  ·  Dovuto: €50.00');
  });

  it('certificato: scaduto, in scadenza entro 30 giorni, valido', () => {
    expect(badgeCertificato(undefined, ADESSO)).toBeNull();
    expect(badgeCertificato('2026-11-26', ADESSO)).toEqual({ testo: 'Scaduto', tipo: 'red' });
    expect(badgeCertificato('2026-11-27', ADESSO)).toEqual({ testo: 'In scadenza', tipo: 'orange' });
    expect(badgeCertificato('2026-12-27', ADESSO)).toEqual({ testo: 'In scadenza', tipo: 'orange' });
    expect(badgeCertificato('2026-12-28', ADESSO)).toEqual({ testo: 'Valido', tipo: 'green' });
  });

  it('ricevute dalla piu\' recente, poi per progressivo', () => {
    const r = ordinaRicevute([
      { id: 'a', data: '2026-10-01', progressivo: 1 },
      { id: 'b', data: '2026-11-01', progressivo: 2 },
      { id: 'c', data: '2026-11-01', progressivo: 3 },
    ]);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('riepilogo quote: totali, ordine per scadenza di pagamento, stati, nome del file', () => {
    const a = { uid: 'x', nome: 'Sara', cognome: 'Rossi', categoria: 'Under 13' };
    const h = htmlRiepilogoQuote(
      a,
      [
        rata({ descrizione: 'Seconda', importo: 100, scadenzaPagamento: '2027-01-31' }),
        rata({ descrizione: 'Prima', importo: 150, scadenzaPagamento: '2026-10-31', pagata: true, dataPagamento: '2026-10-20' }),
      ],
      ADESSO,
      'https://esempio.it',
    );
    expect(h.indexOf('Prima')).toBeLessThan(h.indexOf('Seconda'));
    expect(h).toContain('Generato il<strong>27 novembre 2026</strong>');
    expect(h).toContain('<span class="tag">Under 13</span>');
    expect(h).toContain('Pagata il 20/10/2026');
    expect(h).toContain('<span class="badge badge--warn">Da pagare</span>');
    expect(h).toContain('<div class="kpi-value">250,00 €</div>');
    expect(h).toContain('<div class="kpi kpi--ok"><div class="kpi-label">Versato</div><div class="kpi-value">150,00 €</div>');
    expect(nomeFileRiepilogo({ uid: 'x', nome: "Anna Maria", cognome: "D'Amico" })).toBe('Riepilogo quote - Anna Maria D Amico.pdf');
  });
});

describe('squadra e profilo', () => {
  const persona = { photo: '', photoFocus: '', id: null };
  const dati = {
    stagioni: [{ id: '2026/2027', name: '2026/2027', current: true }],
    categorie: [{ id: 13, name: 'Under 13', abbr: '', color: '', description: '', schedule: '', showInSquadre: true }],
    staff: [
      { ...persona, categoriaId: 13, stagione: '', name: 'Secondo', role: 'Assistente', order: 2 },
      { ...persona, categoriaId: 13, stagione: '2026/2027', name: 'Primo', role: 'Allenatore', order: 1 },
    ],
    giocatori: [
      { ...persona, categoriaId: 13, stagione: '2026/2027', name: 'Senza numero', role: 'Centrale', order: null, number: null, gender: 'M' },
      { ...persona, categoriaId: 13, stagione: '2026/2027', name: 'Palleggiatore', role: 'Palleggiatore', order: null, number: 5, gender: 'M' },
      { ...persona, categoriaId: 13, stagione: '2026/2027', name: 'Con ordine', role: 'Libero', order: 1, number: 12, gender: 'F' },
    ],
  } as Pick<Pubblico, 'stagioni' | 'categorie' | 'giocatori' | 'staff'>;

  it('rosa: ordine come il sito, ruoli al femminile, squadra non assegnata', () => {
    const r = rosaAtleta('Under 13', dati)!;
    expect(r.nome).toBe('Under 13');
    expect(r.stagione).toBe('Stagione 2026/2027');
    expect(r.staff.map((s) => s.nome)).toEqual(['Primo', 'Secondo']);
    expect(r.giocatori.map((g) => [g.numero, g.nome, g.ruolo])).toEqual([
      ['12', 'Con ordine', 'Libero'],
      ['5', 'Palleggiatore', 'Palleggiatore'],
      ['', 'Senza numero', 'Centrale'],
    ]);
    expect(rosaAtleta(undefined, dati)).toBeNull();
    expect(rosaAtleta('Under 99', dati)).toBeNull();
  });

  it('cambio password: i controlli prima di Firebase', () => {
    expect(erroreNuovaPassword('a', 'corta', 'corta')).toBe('La nuova password deve avere almeno 10 caratteri.');
    expect(erroreNuovaPassword('a', 'abcdefghij', 'abcdefghik')).toBe('Le due password non coincidono.');
    expect(erroreNuovaPassword('abcdefghij', 'abcdefghij', 'abcdefghij')).toBe('La nuova password deve essere diversa da quella attuale.');
    expect(erroreNuovaPassword('vecchia', 'abcdefghij', 'abcdefghij')).toBeNull();
  });
});
