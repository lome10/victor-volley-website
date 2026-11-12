/**
 * Ruoli dei dirigenti (campo facoltativo dirigenti/{uid}.ruolo): master | presidente | segreteria | presenze.
 * «master» sta sopra il presidente (stessi permessi + assegna i ruoli); si imposta solo dalla console di Firebase.
 * Stesse regole di firestore.rules (funzione ruoloDirigente): campo mancante o vuoto = 'presidente' (chi c'è oggi non
 * cambia), confronto in minuscolo, valore non riconosciuto = nessun permesso.
 *
 *   puoGestireAtleti(doc)  master, presidente e segreteria: atleti, ricevute, inviti, password degli atleti, caricamento immagini.
 *   ePresidente(doc)       master e presidente.
 *   eMaster(doc)           solo il master.
 * `doc` è il DocumentSnapshot di dirigenti/{uid} (Admin SDK). Un account senza documento non ha nessun ruolo.
 */
const RUOLI = ['master', 'presidente', 'segreteria', 'presenze'];

function ruoloDa(doc) {
  if (!doc || !doc.exists) return null;
  const d = typeof doc.data === 'function' ? (doc.data() || {}) : {};
  return typeof d.ruolo === 'string' && d.ruolo !== '' ? d.ruolo.toLowerCase() : 'presidente';
}
const eMaster = (doc) => ruoloDa(doc) === 'master';
const ePresidente = (doc) => { const r = ruoloDa(doc); return r === 'master' || r === 'presidente'; };
const puoGestireAtleti = (doc) => { const r = ruoloDa(doc); return r === 'master' || r === 'presidente' || r === 'segreteria'; };

module.exports = { RUOLI, ruoloDa, eMaster, ePresidente, puoGestireAtleti };
