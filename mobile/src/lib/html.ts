// Il testo degli articoli e' HTML scritto in admin. Qui diventa un elenco di blocchi:
// passa SOLO cio' che e' in elenco (come DOMPurify sul sito), tutto il resto si butta o resta testo.
import { parseDocument } from 'htmlparser2';

export type Pezzo = { testo: string; grassetto?: boolean; corsivo?: boolean; link?: string };
export type Blocco =
  | { tipo: 'paragrafo' | 'titolo2' | 'titolo3' | 'citazione'; pezzi: Pezzo[] }
  | { tipo: 'voce'; segno: string; pezzi: Pezzo[] }
  | { tipo: 'immagine'; url: string };

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

  const chiudi = () => {
    const primo = pezzi[0];
    if (primo) primo.testo = primo.testo.replace(/^\s+/, '');
    const ultimo = pezzi[pezzi.length - 1];
    if (ultimo) ultimo.testo = ultimo.testo.replace(/\s+$/, '');
    const pieni = pezzi.filter((p) => p.testo);
    pezzi = [];
    if (!pieni.length) return;
    if (segno !== null) out.push({ tipo: 'voce', segno, pezzi: pieni });
    else out.push({ tipo, pezzi: pieni });
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
        pezzi.push({ ...stile, testo: '\n' });
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
      if (nome === 'a' && linkAmmesso(n.attribs?.href ?? '')) dentro.link = n.attribs!.href.trim();
      if (!BLOCCHI.has(nome)) {
        visita(figli, dentro);
        continue;
      }
      chiudi();
      const primaTipo = tipo;
      const primaSegno = segno;
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
    }
  };

  visita(parseDocument(html || '').children as unknown as Nodo[], {});
  chiudi();
  return out;
}
