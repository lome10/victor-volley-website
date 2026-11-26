// Regole della pagina News del sito (js/pages/news-1.js e js/data.js).
export const PER_PAGINA = 6;

export const SFUMATURE = [
  ['#053063', '#0a5cbf', '#008CFD'],
  ['#3d0b1e', '#8a1040', '#CB2168'],
  ['#0a3d2e', '#145c44', '#1a8a5a'],
  ['#0d2a04', '#1a4a0e', '#2d7a1f'],
  ['#1a0533', '#3d0b72', '#CB2168'],
] as const;

/** Categorie nell'ordine in cui compaiono negli articoli. */
export function categorieDi(articoli: { categories: string[] }[]) {
  return [...new Set(articoli.flatMap((a) => a.categories))];
}

export function pagina<T extends { categories: string[] }>(articoli: T[], categoria: string | null, numero: number) {
  const filtrati = categoria ? articoli.filter((a) => a.categories.includes(categoria)) : articoli;
  const totale = Math.max(1, Math.ceil(filtrati.length / PER_PAGINA));
  const attuale = Math.min(Math.max(numero, 0), totale - 1);
  return { voci: filtrati.slice(attuale * PER_PAGINA, (attuale + 1) * PER_PAGINA), totale, attuale };
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** "2026-10-21" -> "21 ottobre 2026" (senza Intl, che sull'iPhone ha gia' dato problemi). */
export function dataEstesa(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m || !MESI[Number(m[2]) - 1]) return '';
  return Number(m[3]) + ' ' + MESI[Number(m[2]) - 1] + ' ' + m[1];
}

/** Come VV.imgUrl: Cloudinary ridimensiona. */
export function immagineLarga(url: string, larghezza: number) {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(url || '');
  return m ? m[1] + 'f_auto,q_auto,c_limit,w_' + larghezza + '/' + m[2] : url;
}

/** "50% 20%" (fuoco scelto in admin) -> posizione per expo-image. */
export function fuoco(s: string) {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%/.exec(s || '');
  return m ? { left: `${Number(m[1])}%` as const, top: `${Number(m[2])}%` as const } : ('top' as const);
}
