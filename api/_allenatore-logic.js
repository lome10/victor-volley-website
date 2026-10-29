/**
 * Regole dell'Area Allenatore, senza accesso a Firebase (così si provano da sole, vedi scripts/check-allenatore.js).
 * L'allenatore vede SOLO: cognome, nome, data di nascita e telefono del genitore degli atleti delle sue categorie.
 * Codice fiscale, indirizzo, note mediche, pagamenti e tutto il resto restano ai dirigenti.
 */

/** Le categorie dell'allenatore (testi non vuoti, senza doppioni), o null se il suo accesso non vale. */
function categorieAllenatore(doc) {
  if (!doc || doc.senzaAccesso === true || doc.attivo === false || !Array.isArray(doc.categorie)) return null;
  const viste = new Set();
  doc.categorie.forEach((c) => { if (typeof c === 'string' && c.trim()) viste.add(c.trim()); });
  return viste.size ? Array.from(viste) : null;
}

const testo = (v) => (typeof v === 'string' ? v.trim() : '');

/** I genitori con un telefono (massimo due), con il nome se c'è. */
function genitori(dati) {
  const out = [];
  [1, 2].forEach((n) => {
    const telefono = testo(dati['tutore' + n + 'Telefono']);
    if (!telefono) return;
    const nome = (testo(dati['tutore' + n + 'Prenome']) + ' ' + testo(dati['tutore' + n + 'Cognome'])).trim();
    out.push({ nome, parentela: testo(dati['tutore' + n + 'Parentela']), telefono });
  });
  return out;
}

/** La riga che l'allenatore vede per un atleta. `atleta` = scheda pubblica, `dati` = anagrafica riservata. */
function schedaAtleta(atleta, dati) {
  const riservati = dati || {};
  return {
    cognome: testo(atleta.cognome),
    nome: testo(atleta.nome),
    categoria: testo(atleta.categoria),
    dataNascita: testo(riservati.dataNascita) || testo(atleta.dataNascita),
    genitori: genitori(riservati)
  };
}

/** Per categoria, poi per cognome e nome. */
function ordina(schede) {
  return schede.slice().sort((a, b) =>
    a.categoria.localeCompare(b.categoria, 'it') || a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
}

module.exports = { categorieAllenatore, schedaAtleta, genitori, ordina };
