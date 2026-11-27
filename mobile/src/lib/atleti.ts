// Regole dell'area atleti del sito (js/atleta.js). Funzioni pure, senza React e senza Firebase.

/** Scheda `atleti/{id}`: la parte che la famiglia puo' leggere. */
export type Atleta = {
  uid: string;
  nome?: string;
  cognome?: string;
  categoria?: string;
  certMedicoScadenza?: string;
  /** Link Drive del certificato (bottone "Apri PDF"). */
  certMedicoUrl?: string;
  moduloIscrizioneUrl?: string;
  accessUids?: string[];
};

/** Rata come la mostra il sito (da `rateAtleti`, gia' trasformata da `rateDaDocumenti`). */
export type Rata = {
  descrizione: string;
  importo: number;
  scadenza: string;
  scadenzaPagamento: string;
  pagata: boolean;
  dataPagamento: string | null;
};

/** Documento di `rateAtleti`. */
export type RataGrezza = {
  note?: string;
  stagione?: string;
  importo?: number | string;
  scadenza?: string;
  scadenzaPagamento?: string;
  pagata?: boolean;
  dataPagamento?: string | null;
};

/** Documento di `comunicazioni`. */
export type Avviso = {
  id: string;
  titolo?: string;
  testo?: string;
  categoria?: string;
  createdAt?: string;
  importante?: boolean;
  fissato?: boolean;
  fissatoFino?: string;
  allegatoUrl?: string;
};

export type Livello = 'red' | 'orange' | 'ok';
export type Cosa = { livello: Livello; testo: string; vai?: 'avvisi' | 'calendario' | 'documenti' };

/** Dopo 30 giorni un avviso non e' piu' "nuovo" per chi apre la scheda per la prima volta. */
export const AVVISI_NUOVI_SENZA_LETTURA_GIORNI = 30;

const due = (n: number) => (n < 10 ? '0' : '') + n;
export const dataIso = (d: Date) => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());

export function nomeCompleto(a: Atleta) {
  return ((a.nome || '') + ' ' + (a.cognome || '')).trim();
}

export function iniziali(a: Atleta) {
  return ((a.nome || '').charAt(0) + (a.cognome || '').charAt(0)).toUpperCase();
}

/** Le schede che l'account vede: quelle con accessUids e la vecchia `atleti/{uid}`, senza doppioni, per nome. */
export function unisciSchede(conAccesso: Atleta[], propria: Atleta | null) {
  const perId = new Map<string, Atleta>();
  for (const a of conAccesso) perId.set(a.uid, a);
  if (propria) perId.set(propria.uid, propria);
  return [...perId.values()].sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b), 'it'));
}

/** Giorni da oggi a "AAAA-MM-GG" (negativo se e' passato), contati a mezzanotte come il sito. */
export function giorniDa(data: string, adesso: Date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data || '');
  if (!m) return NaN;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  return Math.round((d.getTime() - oggi.getTime()) / 86400000);
}

export const traGiorni = (d: number) => (d === 0 ? 'oggi' : d === 1 ? 'domani' : 'tra ' + d + ' giorni');

/** "2026-11-27" -> "27/11/2026"; vuoto -> "—". */
export function dataIt(s?: string | null) {
  if (!s) return '—';
  const p = s.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

export const euro = (n: number) => '€' + (Number(n) || 0).toFixed(2);

/** Google Drive: link di condivisione -> link di visualizzazione; solo https, altrimenti nulla. */
export function driveVista(url?: string) {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/file/d/' + m[1] + '/view';
  return /^https:\/\//i.test(url) ? url : null;
}

/** Le rate di `rateAtleti` come le prepara il sito (_loadRate). */
export function rateDaDocumenti(righe: RataGrezza[]): Rata[] {
  const stagioni = new Set(righe.map((r) => r.stagione).filter(Boolean));
  const piuStagioni = stagioni.size > 1;
  const perScadenza = [...righe].sort((x, y) => (x.scadenza || '9999-12-31').localeCompare(y.scadenza || '9999-12-31'));
  const rate = perScadenza.map((r) => ({
    descrizione: (r.note || 'Quota') + (piuStagioni && r.stagione ? ' (' + r.stagione + ')' : ''),
    importo: Number(r.importo) || 0,
    scadenza: r.scadenza || '',
    scadenzaPagamento: r.scadenzaPagamento || '',
    pagata: !!r.pagata,
    dataPagamento: r.dataPagamento || null,
  }));
  return rate.sort((x, y) => (x.scadenzaPagamento || x.scadenza || '9999-12-31').localeCompare(y.scadenzaPagamento || y.scadenza || '9999-12-31'));
}

export function totaliRate(rate: Rata[]) {
  const totale = rate.reduce((s, r) => s + (Number(r.importo) || 0), 0);
  const saldato = rate.filter((r) => r.pagata).reduce((s, r) => s + (Number(r.importo) || 0), 0);
  return { totale, saldato, dovuto: totale - saldato };
}

/** Riquadro "Certificato medico" della Home. */
export function riquadroCertificato(a: Atleta, adesso: Date): { valore: string; livello: Livello; sotto: string } {
  if (!a.certMedicoScadenza) return { valore: 'Non inserito', livello: 'orange', sotto: '' };
  const d = giorniDa(a.certMedicoScadenza, adesso);
  return {
    valore: d < 0 ? 'Scaduto' : d <= 30 ? 'In scadenza' : 'Valido',
    livello: d < 0 ? 'red' : d <= 30 ? 'orange' : 'ok',
    sotto: 'Fino al ' + dataIt(a.certMedicoScadenza),
  };
}

/** Riquadro "Quote" della Home. livello null = nessun colore. */
export function riquadroQuote(rate: Rata[]): { valore: string; livello: Livello | null; sotto: string } {
  const t = totaliRate(rate);
  if (t.totale <= 0) return { valore: '—', livello: null, sotto: 'Nessuna quota inserita' };
  return t.dovuto > 0
    ? { valore: euro(t.dovuto), livello: 'orange', sotto: 'ancora da versare' }
    : { valore: 'Saldate', livello: 'ok', sotto: 'Totale ' + euro(t.totale) };
}

/** Certificato e quote: la lista "Da fare" del sito senza avvisi e presenze (_todoItems). */
export function scadenze(a: Atleta, rate: Rata[], adesso: Date): Cosa[] {
  const cose: Cosa[] = [];
  if (!a.certMedicoScadenza) {
    cose.push({ livello: 'orange', testo: 'Certificato medico non ancora consegnato. La società darà aggiornamenti a breve.' });
  } else {
    const d = giorniDa(a.certMedicoScadenza, adesso);
    if (d < 0) {
      cose.push({ livello: 'red', testo: 'Certificato medico scaduto il ' + dataIt(a.certMedicoScadenza) + '. La società darà aggiornamenti a breve.' });
    } else if (d <= 30) {
      cose.push({ livello: 'orange', testo: 'Il certificato medico scade ' + traGiorni(d) + ' (' + dataIt(a.certMedicoScadenza) + '). La società darà aggiornamenti a breve.' });
    }
  }
  for (const r of rate) {
    if (r.pagata) continue;
    const cosa = '«' + (r.descrizione || 'Quota') + '» (€' + (Number(r.importo) || 0).toFixed(2) + ')';
    const dv = r.scadenza ? giorniDa(r.scadenza, adesso) : null;
    if (dv != null && dv < 0) {
      cose.push({ livello: 'red', testo: 'Quota ' + cosa + ' scaduta il ' + dataIt(r.scadenza) + ' e non pagata: contatta la società.' });
      continue;
    }
    if (r.scadenzaPagamento) {
      const dp = giorniDa(r.scadenzaPagamento, adesso);
      if (dp < 0) {
        cose.push({ livello: 'red', testo: 'Quota ' + cosa + ' da pagare entro il ' + dataIt(r.scadenzaPagamento) + ': pagamento in ritardo.' });
      } else if (dp <= 14) {
        cose.push({ livello: 'orange', testo: 'Quota ' + cosa + ': pagamento previsto ' + traGiorni(dp) + ' (' + dataIt(r.scadenzaPagamento) + ').' });
      }
    }
    if (dv != null && dv <= 14) {
      cose.push({ livello: dv <= 1 ? 'red' : 'orange', testo: 'La validità della quota ' + cosa + ' scade ' + traGiorni(dv) + ' (' + dataIt(r.scadenza) + ').' });
    }
  }
  // Prima i rossi, poi gli arancioni, nell'ordine in cui sono nati (sort stabile come quello del browser).
  return cose.sort((x, y) => (x.livello === 'red' ? 0 : 1) - (y.livello === 'red' ? 0 : 1));
}

/** Lista "Da fare" completa: avvisi non letti in cima, poi scadenze, poi presenze da confermare (_renderTodo). */
export function daFare(base: Cosa[], nonLetti: number, nonLettiImportanti: boolean, daConfermare: number): Cosa[] {
  const cose = [...base];
  if (nonLetti) {
    cose.unshift({
      livello: nonLettiImportanti ? 'red' : 'orange',
      testo: nonLetti === 1 ? 'Hai 1 avviso non letto.' : 'Hai ' + nonLetti + ' avvisi non letti.',
      vai: 'avvisi',
    });
  }
  if (daConfermare) {
    cose.push({
      livello: 'orange',
      testo:
        daConfermare === 1
          ? 'Conferma la presenza a 1 impegno dei prossimi 7 giorni.'
          : 'Conferma la presenza a ' + daConfermare + ' impegni dei prossimi 7 giorni.',
      vai: 'calendario',
    });
  }
  return cose.length ? cose : [{ livello: 'ok', testo: 'Tutto in regola, non c’è niente da fare.' }];
}

/* ---------------- avvisi ---------------- */

/** Categorie degli avvisi da leggere: sempre 'tutte', piu' la squadra se c'e' (le regole vogliono questa query). */
export const categorieAvvisi = (categoria?: string) => (categoria ? ['tutte', categoria] : ['tutte']);

/** Avviso fissato in alto: `fissato` e, se c'e', `fissatoFino` (AAAA-MM-GG, incluso). */
export function fissatoAttivo(v: Avviso, adesso: Date) {
  if (!v.fissato) return false;
  if (!v.fissatoFino) return true;
  return v.fissatoFino >= dataIso(adesso);
}

/** Fissati prima, poi dal piu' recente. */
export function ordinaAvvisi(avvisi: Avviso[], adesso: Date) {
  return [...avvisi].sort(
    (x, y) => Number(fissatoAttivo(y, adesso)) - Number(fissatoAttivo(x, adesso)) || (y.createdAt || '').localeCompare(x.createdAt || ''),
  );
}

/** Senza "ultima lettura" (primo accesso su questo telefono) contano come nuovi solo gli ultimi 30 giorni. */
export function limiteLettura(ultimaLettura: string, adesso: Date) {
  return ultimaLettura || new Date(adesso.getTime() - AVVISI_NUOVI_SENZA_LETTURA_GIORNI * 864e5).toISOString();
}

/** I fissati sono sempre in vista: non contano tra i non letti. */
export function nonLetto(v: Avviso, ultimaLettura: string, adesso: Date) {
  if (fissatoAttivo(v, adesso)) return false;
  return (v.createdAt || '') > limiteLettura(ultimaLettura, adesso);
}

/** Il momento da salvare dopo aver aperto la scheda Avvisi: l'avviso piu' recente, o adesso se non ce ne sono. */
export function nuovaLettura(avvisi: Avviso[], adesso: Date) {
  const piuRecente = avvisi.reduce((m, v) => ((v.createdAt || '') > m ? v.createdAt || '' : m), '');
  return piuRecente || adesso.toISOString();
}

export const testoBadge = (n: number) => (n > 9 ? '9+' : String(n));

/** Testo dell'avviso diviso in pezzi: i link https diventano toccabili (_linkify). */
export function pezziTesto(testo: string): { t: string; link?: string }[] {
  const pezzi: { t: string; link?: string }[] = [];
  const re = /https:\/\/[^\s<]+/g;
  let da = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testo))) {
    if (m.index > da) pezzi.push({ t: testo.slice(da, m.index) });
    pezzi.push({ t: m[0], link: m[0] });
    da = m.index + m[0].length;
  }
  if (da < testo.length) pezzi.push({ t: testo.slice(da) });
  return pezzi;
}

/** Riga sotto il titolo dell'avviso: "27/11/2026 · Tutta la società". */
export const metaAvviso = (v: Avviso) =>
  dataIt((v.createdAt || '').slice(0, 10)) + ' · ' + (v.categoria === 'tutte' ? 'Tutta la società' : v.categoria || '');
