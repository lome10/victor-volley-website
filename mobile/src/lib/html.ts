// Il testo degli articoli e' HTML scritto in admin. Qui diventa un elenco di blocchi:
// passa SOLO cio' che e' in elenco (come DOMPurify sul sito), tutto il resto si butta o resta testo.
import { parseDocument } from 'htmlparser2';

export type Pezzo = { testo: string; grassetto?: boolean; corsivo?: boolean; link?: string; vuota?: boolean };
export type Blocco =
  | { tipo: 'paragrafo' | 'titolo2' | 'titolo3' | 'citazione'; pezzi: Pezzo[]; stretto?: boolean }
  | { tipo: 'voce'; segno: string; pezzi: Pezzo[] }
  | { tipo: 'immagine'; url: string }
  | { tipo: 'spazio' };

type Nodo = { type: string; name?: string; data?: string; attribs?: Record<string, string>; children?: Nodo[] };
type Stile = Omit<Pezzo, 'testo'>;

const VIETATI = new Set(['script', 'style', 'iframe', 'form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math', 'object', 'embed', 'template', 'noscript']);
const BLOCCHI = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'figure', 'figcaption', 'section', 'article', 'table', 'tr']);

export const linkAmmesso = (u: string) => /^(https?:|mailto:|tel:)/i.test(u.trim());

export function blocchi(html: string): Blocco[] {
  const out: Blocco[] = [];
  let pezzi: Pezzo[] = [];
  let tipo: 'paragrafo' | 'titolo2' | 'titolo3' | 'citazione' = 'paragrafo';
  let segno: string | null = null;
  let stretto = false; // i <div> di fila sul sito non hanno spazio in mezzo

  const chiudi = () => {
    const primo = pezzi[0];
    if (primo) primo.testo = primo.testo.replace(/^\s+/, '');
    const ultimo = pezzi[pezzi.length - 1];
    if (ultimo) ultimo.testo = ultimo.testo.replace(/\s+$/, '');
    const rigaVuota = pezzi.some((p) => p.vuota);
    const pieni = pezzi.filter((p) => p.testo);
    for (const p of pieni) delete p.vuota;
    pezzi = [];
    if (!pieni.length) {
      if (rigaVuota && stretto) out.push({ tipo: 'spazio' });
      return;
    }
    if (segno !== null) out.push({ tipo: 'voce', segno, pezzi: pieni });
    else out.push(stretto ? { tipo, pezzi: pieni, stretto } : { tipo, pezzi: pieni });
  };

  const visita = (nodi: Nodo[], stile: Stile) => {
    for (const n of nodi) {
      if (n.type === 'text') {
        pezzi.push({ ...stile, testo: (n.data ?? '').replace(/[ \t\r\n]+/g, ' ') });
        continue;
      }
      if (n.type !== 'tag') continue; // commenti, <script>, <style>
      const nome = (n.name ?? '').toLowerCase();
      const figli = n.children ?? [];
      if (VIETATI.has(nome)) continue;
      if (nome === 'br') {
        pezzi.push({ ...stile, testo: '\n', vuota: true });
        continue;
      }
      if (nome === 'img') {
        const url = n.attribs?.src ?? '';
        if (/^https:\/\//i.test(url)) {
          chiudi();
          out.push({ tipo: 'immagine', url });
        }
        continue;
      }
      const dentro: Stile = { ...stile };
      if (nome === 'strong' || nome === 'b') dentro.grassetto = true;
      if (nome === 'em' || nome === 'i') dentro.corsivo = true;
      // Solo grassetto e corsivo dagli stili scritti in linea: font e misure incollati non si copiano.
      const css = n.attribs?.style ?? '';
      if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(css)) dentro.grassetto = true;
      if (/font-style\s*:\s*italic/i.test(css)) dentro.corsivo = true;
      if (nome === 'td' || nome === 'th') pezzi.push({ ...stile, testo: ' ' });
      if (nome === 'a' && linkAmmesso(n.attribs?.href ?? '')) dentro.link = n.attribs!.href.trim();
      if (!BLOCCHI.has(nome)) {
        visita(figli, dentro);
        continue;
      }
      chiudi();
      const primaTipo = tipo;
      const primaSegno = segno;
      const primaStretto = stretto;
      stretto = nome === 'div';
      if (nome === 'h1' || nome === 'h2') tipo = 'titolo2';
      else if (/^h[3-6]$/.test(nome)) tipo = 'titolo3';
      else if (nome === 'blockquote') tipo = 'citazione';
      if (nome === 'ul' || nome === 'ol') {
        let i = 0;
        for (const li of figli.filter((f) => f.name === 'li')) {
          chiudi();
          i += 1;
          segno = nome === 'ol' ? i + '.' : '•';
          visita(li.children ?? [], dentro);
          chiudi();
        }
      } else visita(figli, dentro);
      chiudi();
      tipo = primaTipo;
      segno = primaSegno;
      stretto = primaStretto;
    }
  };

  visita(parseDocument(html || '').children as unknown as Nodo[], {});
  chiudi();
  return out;
}
