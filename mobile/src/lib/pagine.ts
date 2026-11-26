// Pagine del sito, con gli stessi nomi del menu e gli stessi titoli di pagina.
import type { Href } from 'expo-router';

export type Pagina = { href: Href; menu: string; titolo: string; sottotitolo?: string };

// Ordine del menu del sito.
export const menu: Pagina[] = [
  { href: '/', menu: 'Home', titolo: 'Victor Volley' },
  { href: '/diretta', menu: 'Diretta', titolo: 'Diretta' },
  { href: '/squadre', menu: 'Squadre', titolo: 'Le nostre squadre' },
  { href: '/calendario', menu: 'Stagione', titolo: 'Calendario e risultati', sottotitolo: 'Stagione' },
  { href: '/news', menu: 'News', titolo: 'News', sottotitolo: 'Comunicati, risultati e aggiornamenti' },
  { href: '/galleria', menu: 'Galleria', titolo: 'Galleria', sottotitolo: 'Momenti di gioco, allenamento ed eventi' },
  { href: '/sponsor', menu: 'Partner', titolo: 'I nostri partner', sottotitolo: 'Grazie a chi ci sostiene ogni giorno' },
  { href: '/contatti', menu: 'Contatti', titolo: 'Contatti', sottotitolo: 'Siamo a Melissano (LE) — vienici a trovare' },
];

export const aree: Pagina[] = [
  { href: '/area-dirigenti', menu: 'Area Dirigenti', titolo: 'Area Dirigenti' },
  { href: '/area-atleti', menu: 'Area Atleti', titolo: 'Area Atleti' },
];

export const unisciti: Pagina = {
  href: '/unisciti-a-noi',
  menu: 'Gioca con noi',
  titolo: 'Vieni a giocare con noi',
  sottotitolo: 'Inviaci un messaggio — ti ricontattiamo noi',
};

export const privacy: Pagina = {
  href: '/privacy',
  menu: 'Privacy e cookie',
  titolo: 'Privacy e cookie',
  sottotitolo: 'Come trattiamo i tuoi dati e cosa fa questo sito sul tuo dispositivo',
};

export const tutte: Pagina[] = [...menu, ...aree, unisciti, privacy];
