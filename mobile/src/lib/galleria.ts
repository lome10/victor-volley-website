// Regole della pagina Galleria del sito (js/pages/galleria-1.js e js/photodb.js). Funzioni pure, senza React.

/** Cloud di Cloudinary del sito (js/config.js). */
const CLOUD = 'plbxnqlc';

const COPERTINA = 'c_fill,g_auto,w_500,h_375,f_auto,q_auto';
const MINIATURA = 'c_fill,g_auto,w_600,h_450,f_auto,q_auto';
const INTERA = 'c_limit,w_2000,f_auto,q_auto';

const indirizzo = (trasformazione: string, id: string) =>
  'https://res.cloudinary.com/' + CLOUD + '/image/upload/' + trasformazione + '/' + encodeURI(id);

export const copertina = (id: string) => indirizzo(COPERTINA, id);
/** Foto di copertina: quella scelta in admin (VV.albumCoverId del sito) se e' ancora nell'album, se no la prima. */
export const copertinaAlbum = (a: { copertina?: string; photos: { id: string }[] }) =>
  a.copertina && a.photos.some((f) => f.id === a.copertina) ? a.copertina : (a.photos[0]?.id ?? '');
export const miniatura = (id: string) => indirizzo(MINIATURA, id);
export const fotoIntera = (id: string) => indirizzo(INTERA, id);

const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "2026-11-15" -> "15 nov 2026", come VV.formatDateShort (senza Intl, che sull'iPhone ha gia' dato problemi). */
export function dataBreve(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m || !MESI_BREVI[Number(m[2]) - 1]) return '';
  return Number(m[3]) + ' ' + MESI_BREVI[Number(m[2]) - 1] + ' ' + m[1];
}

/** "15 nov 2026 · 168 foto" (sotto il titolo della scheda e dell'album). */
export function infoAlbum(a: { date: string; photoCount: number }) {
  return [dataBreve(a.date), a.photoCount + ' foto'].filter(Boolean).join(' · ');
}

/** "Titolo — 3 / 168" sotto la foto del visore. */
export function didascalia(titolo: string, indice: number, totale: number) {
  return (titolo ? titolo + ' — ' : '') + (indice + 1) + ' / ' + totale;
}

/** Foto successiva o precedente, girando in tondo come il sito. */
export const giro = (indice: number, passo: number, totale: number) => (indice + passo + totale) % totale;
