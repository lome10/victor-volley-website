// Moduli pubblici del sito (Sponsor, Contatti, Unisciti a noi): campi, controlli e dati da inviare
// copiati da js/form-validate.js e js/pages/*.js.

export type TipoCampo = 'testo' | 'email' | 'tel' | 'area' | 'scelta' | 'spunta';

export type Campo = {
  nome: string;
  etichetta: string;
  tipo: TipoCampo;
  obbligatorio?: boolean;
  segnaposto?: string;
  /** Solo per 'scelta': [valore, testo mostrato]. */
  opzioni?: [string, string][];
  /** Testo del primo valore vuoto della scelta (come l'<option disabled selected> del sito). */
  vuoto?: string;
  autocompleta?: 'name' | 'given-name' | 'family-name' | 'email' | 'tel' | 'organization';
  /** Obbligatorio ma senza asterisco (come la casella privacy di sponsor.html). */
  senzaAsterisco?: boolean;
};

export type Valori = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Messaggio d'errore di un campo, uguale a messageFor() di form-validate.js; '' se va bene. */
export function errore(campo: Campo, valore: string | undefined) {
  if (campo.tipo === 'spunta') return campo.obbligatorio && valore !== 'si' ? 'Per inviare devi spuntare questa casella.' : '';
  const v = (valore || '').trim();
  if (campo.obbligatorio && !v) return campo.tipo === 'scelta' ? 'Scegli un’opzione.' : 'Campo obbligatorio.';
  if (v && campo.tipo === 'email' && !EMAIL.test(v)) return 'Inserisci un indirizzo email valido.';
  if (v && campo.tipo === 'tel' && v.replace(/\D/g, '').length < 6) return 'Inserisci un numero di telefono valido.';
  return '';
}

/** Tutti gli errori del modulo (solo i campi con errore). */
export function errori(campi: Campo[], valori: Valori) {
  const out: Record<string, string> = {};
  for (const c of campi) {
    const e = errore(c, valori[c.nome]);
    if (e) out[c.nome] = e;
  }
  return out;
}

/* Campi dei moduli del sito, nell'ordine delle pagine. */
export const CAMPI_SPONSOR: Campo[] = [
  { nome: 'azienda', etichetta: 'Azienda o attività', tipo: 'testo', obbligatorio: true, segnaposto: 'Nome dell’azienda', autocompleta: 'organization' },
  { nome: 'referente', etichetta: 'Referente', tipo: 'testo', obbligatorio: true, segnaposto: 'Nome e cognome', autocompleta: 'name' },
  { nome: 'email', etichetta: 'Email', tipo: 'email', obbligatorio: true, segnaposto: 'esempio@azienda.it', autocompleta: 'email' },
  { nome: 'telefono', etichetta: 'Telefono', tipo: 'tel', segnaposto: '+39 000 000 0000', autocompleta: 'tel' },
  {
    nome: 'livello', etichetta: 'Livello di interesse', tipo: 'scelta', obbligatorio: true, vuoto: 'Seleziona un livello',
    opzioni: [['Gold', 'Gold'], ['Silver', 'Silver'], ['Bronze', 'Bronze'], ['Non so', 'Non so / vorrei saperne di più']],
  },
  { nome: 'messaggio', etichetta: 'Messaggio (opzionale)', tipo: 'area', segnaposto: 'Raccontaci della tua attività e di cosa ti piacerebbe fare insieme...' },
  // Sul sito questa casella e' obbligatoria (required) ma senza asterisco.
  { nome: 'privacy', etichetta: 'e acconsento al trattamento dei dati per ricevere una risposta.', tipo: 'spunta', obbligatorio: true, senzaAsterisco: true },
];

export const CAMPI_CONTATTI: Campo[] = [
  { nome: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true, segnaposto: 'Il tuo nome', autocompleta: 'name' },
  { nome: 'email', etichetta: 'Email', tipo: 'email', obbligatorio: true, segnaposto: 'esempio@email.it', autocompleta: 'email' },
  { nome: 'oggetto', etichetta: 'Oggetto', tipo: 'testo', obbligatorio: true, segnaposto: 'Di cosa vuoi parlarci?' },
  { nome: 'messaggio', etichetta: 'Messaggio', tipo: 'area', obbligatorio: true, segnaposto: 'Scrivi qui il tuo messaggio...' },
  { nome: 'privacy', etichetta: 'e acconsento al trattamento dei miei dati per ricevere una risposta.', tipo: 'spunta', obbligatorio: true },
];

export const CAMPI_UNISCITI: Campo[] = [
  { nome: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true, segnaposto: 'Il tuo nome', autocompleta: 'given-name' },
  { nome: 'cognome', etichetta: 'Cognome', tipo: 'testo', obbligatorio: true, segnaposto: 'Il tuo cognome', autocompleta: 'family-name' },
  { nome: 'email', etichetta: 'Email', tipo: 'email', obbligatorio: true, segnaposto: 'esempio@email.it', autocompleta: 'email' },
  { nome: 'telefono', etichetta: 'Telefono', tipo: 'tel', segnaposto: '+39 000 000 0000', autocompleta: 'tel' },
  { nome: 'eta', etichetta: 'Età (o data di nascita)', tipo: 'testo', obbligatorio: true, segnaposto: 'Es. 14 anni oppure 15/03/2010' },
  {
    nome: 'categoria', etichetta: 'Categoria di interesse', tipo: 'scelta', obbligatorio: true, vuoto: 'Seleziona una categoria',
    opzioni: [['Under 13', 'Under 13'], ['Under 12', 'Under 12'], ['Minivolley', 'Minivolley (5-10 anni)'], ['Non so', 'Non so / aiutatemi a scegliere']],
  },
  { nome: 'messaggio', etichetta: 'Messaggio (opzionale)', tipo: 'area', segnaposto: 'Scrivi qui eventuali domande o informazioni aggiuntive...' },
  {
    nome: 'privacy', tipo: 'spunta', obbligatorio: true,
    etichetta: 'e acconsento al trattamento dei dati per ricevere una risposta. Se i dati riguardano un minore, dichiaro di essere genitore o tutore.',
  },
];

const t = (valori: Valori, nome: string) => (valori[nome] || '').trim();

/* Dati inviati dai tre moduli del sito (senza la chiave di Web3Forms, che aggiunge chi invia). */
export function datiSponsor(v: Valori) {
  const azienda = t(v, 'azienda'), referente = t(v, 'referente');
  return {
    subject: 'Richiesta partnership: ' + azienda,
    from_name: referente + ' (' + azienda + ')',
    modulo: 'Diventa partner',
    azienda,
    referente,
    email: t(v, 'email'),
    telefono: t(v, 'telefono') || 'non indicato',
    livello: v.livello || '',
    messaggio: t(v, 'messaggio') || '—',
    consenso_privacy: 'sì',
  };
}

export function datiContatti(v: Valori) {
  return {
    subject: t(v, 'oggetto'),
    from_name: t(v, 'nome'),
    nome: t(v, 'nome'),
    email: t(v, 'email'),
    oggetto: t(v, 'oggetto'),
    messaggio: t(v, 'messaggio'),
    consenso_privacy: 'sì',
  };
}

export function datiUnisciti(v: Valori) {
  const nome = t(v, 'nome'), cognome = t(v, 'cognome');
  return {
    subject: 'Richiesta informazioni: ' + nome + ' ' + cognome,
    from_name: nome + ' ' + cognome,
    nome,
    cognome,
    email: t(v, 'email'),
    telefono: t(v, 'telefono') || 'non indicato',
    eta: t(v, 'eta'),
    categoria: v.categoria || '',
    messaggio: t(v, 'messaggio') || '—',
    consenso_privacy: 'sì',
  };
}

/**
 * Invio di un modulo: true se arrivato. NON ancora collegato: dove mandare lo decide Lorenzo (VVW-41).
 * Finche' non e' deciso il modulo mostra il riquadro "Invio non riuscito" con l'email della Victor.
 */
export async function inviaModulo(_dati: Record<string, string>): Promise<boolean> {
  return false;
}
