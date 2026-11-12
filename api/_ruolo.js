/**
 * Ruoli dei dirigenti (campo facoltativo dirigenti/{uid}.ruolo): presidente | segreteria | presenze.
 * Stesse regole di firestore.rules (funzione ruoloDirigente): campo mancante o vuoto = 'presidente' (chi c'è oggi non
 * cambia), confronto in minuscolo, valore non riconosciuto = nessun permesso.
 *
 *   puoGestireAtleti(doc)  presidente e segreteria: atleti, ricevute, inviti, password degli atleti, caricamento immagini.
 *   ePresidente(doc)       solo il presidente.
 * `doc` è il DocumentSnapshot di dirigenti/{uid} (Admin SDK). Un account senza documento non ha nessun ruolo.
 */
const RUOLI = ['presidente', 'segreteria', 'presenze'];

function ruoloDa(doc) {
  if (!doc || !doc.exists) return null;
  const d = typeof doc.data === 'function' ? (doc.data() || {}) : {};
  return typeof d.ruolo === 'string' && d.ruolo !== '' ? d.ruolo.toLowerCase() : 'presidente';
}
const ePresidente = (doc) => ruoloDa(doc) === 'presidente';
const puoGestireAtleti = (doc) => { const r = ruoloDa(doc); return r === 'presidente' || r === 'segreteria'; };

module.exports = { RUOLI, ruoloDa, ePresidente, puoGestireAtleti };
