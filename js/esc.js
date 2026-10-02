/* Victor Volley — escape HTML condiviso.
   Unica definizione di esc(): va caricato prima degli altri script della pagina (components.js, ecc.).
   Converte & < > " in entità, così testo e valori di attributo con virgolette doppie non possono
   chiudere il tag né iniettare markup. Valori vuoti, null e undefined danno ''.
   Non escapa l'apostrofo: non usarla dentro attributi delimitati da apici singoli. */
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
