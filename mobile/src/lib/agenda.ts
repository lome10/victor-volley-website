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

/** "Oggi · Venerdì 27 novembre", "Domani · …" o solo il giorno (_dayLabel). */
export function etichettaGiorno(iso: string, adesso: Date) {
  const oggi = dataIso(adesso);
  const t = giornoEsteso(iso);
  return iso === oggi ? 'Oggi · ' + t : iso === piuGiorni(oggi, 1) ? 'Domani · ' + t : t;
}

/** Impegni divisi per giorno, nell'ordine dell'agenda. */
export function perGiorno(impegni: Impegno[]) {
  const giorni: { data: string; impegni: Impegno[] }[] = [];
  for (const ev of impegni) {
    const ultimo = giorni[giorni.length - 1];
    if (ultimo && ultimo.data === ev.date) ultimo.impegni.push(ev);
    else giorni.push({ data: ev.date, impegni: [ev] });
  }
  return giorni;
}

/** Link a Google Maps per il luogo (_mapsLink). */
export const linkMappa = (luogo: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(luogo);

/** "27/11/2026" (_fmtDate). */
const dataCorta = (iso: string) => {
  const [a, m, g] = iso.split('-');
  return g + '/' + m + '/' + a;
};

/** Ultime 3 partite concluse della squadra, con il risultato (card "Ultimi risultati"). */
export function ultimiRisultati(categoria: string | undefined, partite: Partita[]) {
  if (!categoria) return [];
  return partite
    .filter((p) => p.categoria === categoria && p.stato === 'conclusa' && p.setCasa != null && p.setOspite != null)
    .sort((x, y) => y.data.localeCompare(x.data))
    .slice(0, 3)
    .map((p) => {
      const casa = /victor/i.test(p.squadraCasa || '');
      const vinta = casa ? Number(p.setCasa) > Number(p.setOspite) : Number(p.setOspite) > Number(p.setCasa);
      return {
        id: p.id,
        vinta,
        partita: p.squadraCasa + ' – ' + p.squadraOspite,
        risultato: p.setCasa + '–' + p.setOspite,
        data: dataCorta(p.data),
      };
    });
}

// ---------- file .ics (_buildIcs del sito) ----------

const due = (n: number) => (n < 10 ? '0' : '') + n;
const icsTesto = (s: string) =>
  String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
function icsPiega(riga: string) {
  const out: string[] = [];
  while (riga.length > 73) {
    out.push(riga.slice(0, 73));
    riga = ' ' + riga.slice(73);
  }
  out.push(riga);
  return out.join('\r\n');
}
/** Orari "floating" (senza fuso): il telefono li legge all'ora locale, cioe' quella italiana. */
const icsData = (iso: string, ora: string) => iso.replace(/-/g, '') + 'T' + (ora || '00:00').replace(':', '') + '00';
function icsPiuMinuti(iso: string, ora: string, minuti: number) {
  const [a, m, g] = iso.split('-').map(Number);
  const [h, mi] = (ora || '00:00').split(':').map(Number);
  const d = new Date(a, m - 1, g, h, mi + minuti);
  return icsData(dataIso(d), due(d.getHours()) + ':' + due(d.getMinutes()));
}

/** Calendario della squadra: partite future e allenamenti settimanali; con soloPartita una sola partita. */
export function icsAtleta(categoria: string, partite: Partita[], orari: Orario[], adesso: Date, soloPartita?: string) {
  const timbro = adesso.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const oggi = dataIso(adesso);
  const righe = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Victor Volley//Area Atleti//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + icsTesto('Victor Volley — ' + categoria)];
  partite
    .filter((p) => p.categoria === categoria && p.stato !== 'conclusa' && p.data >= oggi && (soloPartita == null || String(p.id) === String(soloPartita)))
    .forEach((p) => {
      const ora = p.ora || '00:00';
      righe.push(
        'BEGIN:VEVENT',
        'UID:partita-' + p.id + '@victorvolley',
        'DTSTAMP:' + timbro,
        'DTSTART:' + icsData(p.data, ora),
        'DTEND:' + icsPiuMinuti(p.data, ora, 120),
        'SUMMARY:' + icsTesto((p.squadraCasa || '') + ' – ' + (p.squadraOspite || '')),
        'LOCATION:' + icsTesto(p.palazzetto || ''),
        'DESCRIPTION:' + icsTesto('Partita ' + categoria + (/victor/i.test(p.squadraCasa || '') ? ' (in casa)' : ' (in trasferta)')),
        'END:VEVENT',
      );
    });
  if (soloPartita == null) {
    orari
      .filter((t) => t.categoria === categoria)
      .forEach((t) => {
        let primo: string | null = null;
        for (let i = 0; i < 7; i++) {
          const g = piuGiorni(oggi, i);
          if (giornoSettimana(g) === Number(t.giorno)) {
            primo = g;
            break;
          }
        }
        if (!primo || (t.validoFino && primo > t.validoFino)) return;
        const fine = t.oraFine ? icsData(primo, t.oraFine) : icsPiuMinuti(primo, t.oraInizio, 90);
        righe.push(
          'BEGIN:VEVENT',
          'UID:allenamento-' + t.id + '@victorvolley',
          'DTSTAMP:' + timbro,
          'DTSTART:' + icsData(primo, t.oraInizio),
          'DTEND:' + fine,
          'RRULE:FREQ=WEEKLY;' + (t.validoFino ? 'UNTIL=' + t.validoFino.replace(/-/g, '') + 'T235959' : 'COUNT=52'),
          'SUMMARY:' + icsTesto('Allenamento ' + categoria),
          'LOCATION:' + icsTesto(t.luogo || ''),
          'DESCRIPTION:' + icsTesto(t.note || ''),
          'END:VEVENT',
        );
      });
  }
  righe.push('END:VCALENDAR');
  return righe.map(icsPiega).join('\r\n') + '\r\n';
}

/** "victor-volley-under-13.ics". */
export function nomeFileIcsAtleta(categoria: string) {
  const s = (categoria || 'calendario')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return 'victor-volley-' + s + '.ics';
}
