// Agenda dell'area atleti (js/atleta.js, _agenda, _renderNext, _presenzeDaConfermare): prossime partite della squadra
// e allenamenti dei prossimi 14 giorni dagli orari settimanali, con le eccezioni di un solo giorno. Funzioni pure.
import { dataIso } from '~/lib/atleti';
import type { Allenamento, EccezioneAllenamento, Partita } from '~/lib/dati';

/** Orario settimanale e giorno diverso dal solito, da /api/app-pubblico (tipi in dati.ts). */
export type Orario = Allenamento;
export type Eccezione = Pick<EccezioneAllenamento, 'id' | 'annullato' | 'data' | 'oraInizio' | 'oraFine' | 'luogo'>;

export type Impegno = {
  tipo: 'partita' | 'allenamento';
  /** Chiave della risposta in `presenze`: p-{partita} oppure a-{orario}-{data originale}, con "/" -> "_". */
  key: string;
  eventoId: string;
  date: string;
  start: string;
  end: string;
  title: string;
  luogo: string;
  note?: string;
  home?: boolean;
  diretta?: boolean;
};

export const AGENDA_GIORNI_ALLENAMENTI = 14;
export const MAX_PARTITE_AGENDA = 12;
export const PRESENZE_PROMEMORIA_GIORNI = 7;

const idSicuro = (s: string) => String(s).replace(/\//g, '_');

export function piuGiorni(iso: string, n: number) {
  const [a, m, g] = iso.split('-').map(Number);
  return dataIso(new Date(a, m - 1, g + n));
}

/** 1 = lunedi' ... 7 = domenica. */
export function giornoSettimana(iso: string) {
  const [a, m, g] = iso.split('-').map(Number);
  return ((new Date(a, m - 1, g).getDay() + 6) % 7) + 1;
}

export function agenda(
  categoria: string | undefined,
  partite: Partita[],
  orari: Orario[],
  eccezioni: Eccezione[],
  adesso: Date,
): Impegno[] {
  if (!categoria) return [];
  const oggi = dataIso(adesso);
  const eventi: Impegno[] = [];

  partite
    .filter((p) => p.categoria === categoria && p.data >= oggi && p.stato !== 'conclusa')
    .sort((x, y) => (x.data + (x.ora || '')).localeCompare(y.data + (y.ora || '')))
    .slice(0, MAX_PARTITE_AGENDA)
    .forEach((p) => {
      eventi.push({
        tipo: 'partita',
        date: p.data,
        start: p.ora || '',
        end: '',
        key: idSicuro('p-' + p.id),
        eventoId: String(p.id),
        title: (p.squadraCasa || '') + ' – ' + (p.squadraOspite || ''),
        luogo: p.palazzetto || '',
        home: /victor/i.test(p.squadraCasa || ''),
        diretta: !!(p.sppCode && p.data === oggi),
      });
    });

  const perId = new Map(eccezioni.map((e) => [e.id, e]));
  for (const t of orari.filter((o) => o.categoria === categoria)) {
    for (let i = 0; i < AGENDA_GIORNI_ALLENAMENTI; i++) {
      const giorno = piuGiorni(oggi, i);
      if (giornoSettimana(giorno) !== Number(t.giorno)) continue;
      if (t.validoFino && giorno > t.validoFino) break;
      const key = idSicuro('a-' + t.id + '-' + giorno);
      const ecc = perId.get(key);
      if (ecc?.annullato === true) continue; // annullato solo per quel giorno
      eventi.push({
        tipo: 'allenamento',
        date: ecc?.data || giorno,
        start: ecc?.oraInizio || t.oraInizio || '',
        // Sul sito ora di fine e luogo dell'eccezione valgono anche vuoti; ora di inizio e data solo se pieni.
        end: typeof ecc?.oraFine === 'string' ? ecc.oraFine : t.oraFine || '',
        key,
        eventoId: String(t.id),
        title: 'Allenamento',
        luogo: typeof ecc?.luogo === 'string' ? ecc.luogo : t.luogo || '',
        note: t.note || '',
      });
    }
  }

  return eventi.sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
}

/** Impegni dei prossimi 7 giorni senza risposta (per la lista "Da fare"). */
export function daConfermare(impegni: Impegno[], risposte: Record<string, 'si' | 'no'>, adesso: Date) {
  const limite = piuGiorni(dataIso(adesso), PRESENZE_PROMEMORIA_GIORNI);
  return impegni.filter((ev) => ev.date <= limite && !risposte[ev.key]).length;
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** "Sabato 29 novembre", come toLocaleDateString('it-IT', { weekday, day, month: 'long' }) con l'iniziale grande. */
export function giornoEsteso(iso: string) {
  const [a, m, g] = iso.split('-').map(Number);
  const d = new Date(a, m - 1, g);
  const t = GIORNI[d.getDay()] + ' ' + g + ' ' + MESI[m - 1];
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Riquadro "Prossimo impegno" della Home (_renderNext). */
export function prossimoImpegno(categoria: string | undefined, impegni: Impegno[]) {
  if (!categoria) return { valore: '—', sotto: 'Squadra non ancora assegnata' };
  const p = impegni[0];
  if (!p) return { valore: 'Nessun impegno', sotto: 'Non ci sono partite o allenamenti in programma' };
  return {
    valore: giornoEsteso(p.date) + (p.start ? ' · ' + p.start : ''),
    sotto: (p.tipo === 'partita' ? p.title : 'Allenamento') + (p.luogo ? ' — ' + p.luogo : ''),
  };
}
