// Statistiche di presenza per atleta: porting di js/presenze-stat.js del sito (stesse regole per admin, area allenatore
// del sito e app). Il test presenze-stat.test.ts carica il file vero del sito e confronta i risultati: se il sito
// cambia regole, il test fallisce. Conta solo gli allenamenti gia' SEGNATI: un giorno senza risposta non abbassa la
// percentuale, altrimenti chi segna in ritardo penalizzerebbe l'atleta.

export type Stato = 'p' | 'a' | '';
export type Statistica = {
  si: number;
  no: number;
  segnate: number;
  nr: number;
  pct: number | null;
  /** Fino a 8 stati, dal piu' vecchio al piu' recente. */
  ultimi: Stato[];
  /** Assenze consecutive piu' recenti (i giorni non segnati si saltano). */
  assenzeDiFila: number;
};

/** Soglie dei colori del numero (solo grafica, nessun giudizio). */
const SOGLIA_VERDE = 80;
const SOGLIA_AMBRA = 65;
export const ULTIMI = 8;

/** giorni = date AAAA-MM-GG di allenamento gia' avvenuti (anche doppie o in disordine); stati = { data: 'p' | 'a' }. */
export function calcola(giorni: string[], stati: Record<string, string> | null | undefined): Statistica {
  const visti = new Set<string>();
  const date = (giorni || [])
    .filter((d) => {
      if (visti.has(d)) return false;
      visti.add(d);
      return true;
    })
    .sort()
    .reverse();
  let si = 0;
  let no = 0;
  let assenzeDiFila = 0;
  let serie = true;
  const ultimi: Stato[] = [];
  for (const d of date) {
    const s: Stato = stati && (stati[d] === 'p' || stati[d] === 'a') ? (stati[d] as Stato) : '';
    if (s === 'p') si++;
    else if (s === 'a') no++;
    if (ultimi.length < ULTIMI) ultimi.push(s);
    if (serie && s) {
      if (s === 'a') assenzeDiFila++;
      else serie = false;
    }
  }
  const segnate = si + no;
  return {
    si,
    no,
    segnate,
    nr: date.length - segnate,
    pct: segnate ? Math.round((si / segnate) * 100) : null,
    ultimi: ultimi.reverse(),
    assenzeDiFila,
  };
}

/** Colore del numero: verde dall'80%, ambra dal 65%, rosso sotto, grigio se non c'e' niente di segnato. */
export function colore(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return '#64748B';
  return pct >= SOGLIA_VERDE ? '#16A34A' : pct >= SOGLIA_AMBRA ? '#B45309' : '#DC2626';
}

/** Media delle percentuali (solo di chi ha qualcosa di segnato), o null. */
export function media(lista: (Statistica | null | undefined)[]) {
  const v = lista.filter((x): x is Statistica => !!x && x.pct !== null);
  return v.length ? Math.round(v.reduce((a, x) => a + (x.pct as number), 0) / v.length) : null;
}

/** Primo giorno della stagione (1 settembre) a cui appartiene `oggi`. */
export function inizioStagione(oggi: string) {
  const y = +oggi.slice(0, 4);
  const m = +oggi.slice(5, 7);
  return (m >= 9 ? y : y - 1) + '-09-01';
}
