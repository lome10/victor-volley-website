/**
 * Regole dell'Area Allenatore, senza accesso a Firebase (così si provano da sole, vedi scripts/check-allenatore.js).
 * L'allenatore vede SOLO: cognome, nome, data di nascita e telefono del genitore e le note per l'allenatore degli atleti delle sue categorie.
 * Codice fiscale, indirizzo, note riservate e mediche, pagamenti e tutto il resto restano ai dirigenti.
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
    genitori: genitori(riservati),
    note: testo(riservati.noteAllenatore)
  };
}

/** Per categoria, poi per cognome e nome. */
function ordina(schede) {
  return schede.slice().sort((a, b) =>
    a.categoria.localeCompare(b.categoria, 'it') || a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
}

/* ---------- Presenze agli allenamenti ---------- */

/** Quanti giorni indietro il mister può ancora correggere una presenza. */
const GIORNI_INDIETRO = 60;

/** Quanti giorni avanti può già segnare (chi sa in anticipo che una giocatrice mancherà). */
const GIORNI_AVANTI = 7;

/** Oggi in Italia come AAAA-MM-GG (il server gira in UTC: a mezzanotte il giorno cambia a Roma, non a Londra). */
function oggiRoma(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now || new Date());
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Vera solo per una data di calendario che esiste davvero (non il 31 novembre). */
function dataValida(iso) {
  const m = DATA.exec(iso || '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const aggiungiGiorni = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** 1 = lunedì … 7 = domenica, come il campo `giorno` della raccolta `allenamenti`. */
const giornoSettimana = (iso) => ((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;

/**
 * I giorni di allenamento di una categoria, dai prossimi GIORNI_AVANTI fino a GIORNI_INDIETRO fa (dal più recente),
 * dagli orari settimanali. `orari` = documenti di `allenamenti` (con `id`); un orario con `validoFino` non conta dopo
 * quella data. `orarioId` serve a scrivere nella stessa risposta "ci sarò / non ci sarò" che danno le giocatrici.
 */
function giorniAllenamento(orari, categoria, oggi) {
  const mie = (orari || []).filter((o) => o && o.categoria === categoria && +o.giorno >= 1 && +o.giorno <= 7);
  const out = [];
  for (let i = -GIORNI_AVANTI; i <= GIORNI_INDIETRO; i++) {
    const data = aggiungiGiorni(oggi, -i);
    const g = giornoSettimana(data);
    mie.filter((o) => +o.giorno === g && !(o.validoFino && data > o.validoFino)).forEach((o) => {
      out.push({ data, orarioId: testo(o.id), oraInizio: testo(o.oraInizio), oraFine: testo(o.oraFine), luogo: testo(o.luogo) });
    });
  }
  return out;
}

/** Stessa chiave che usa l'area atleti per un allenamento: "a-{id dell'orario}-{data}" (le "/" diventano "_"). */
const chiaveAllenamento = (orarioId, data) => String('a-' + orarioId + '-' + data).replace(/\//g, '_');

/** Un atleta in una giornata come dicono le risposte: "si"/"no" diventano "p"/"a"; la più recente vince. */
const STATO_DA_RISPOSTA = { si: 'p', no: 'a' };
const RISPOSTA_DA_STATO = { p: 'si', a: 'no' };

/** Id del documento di una giornata: categoria "Under 14 F" + data → "under-14-f_2026-10-29". */
function idGiornata(categoria, data) {
  const slug = String(categoria).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug + '_' + data;
}

const STATI_PRESENZA = ['p', 'a', ''];

module.exports = { categorieAllenatore, schedaAtleta, genitori, ordina, oggiRoma, dataValida, giorniAllenamento, idGiornata, STATI_PRESENZA, GIORNI_INDIETRO, GIORNI_AVANTI, chiaveAllenamento, STATO_DA_RISPOSTA, RISPOSTA_DA_STATO };
