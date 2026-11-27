// Regole della pagina Calendario del sito (js/pages/calendario-1.js), senza Intl (sull'iPhone ha gia' dato problemi).
// Partite del calendario: campi di /api/app-pubblico (camelCase). Partite del girone: come data/girone.json (snake_case).
import type { Partita as PartitaCalendario, PartitaGirone, SquadraGirone } from '~/lib/dati';
import { eVictor as isVV, squadraById } from '~/lib/girone';

export type { PartitaCalendario };

const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const GIORNI_BREVI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const giorno = (s: string) => (RE_DATA.test(s || '') ? new Date(s + 'T00:00:00') : null);
const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

export function slug(s: string) {
  return (s || '').toLowerCase().replace(/\s+/g, '-').replace(/[àáâ]/g, 'a').replace(/[èéê]/g, 'e').replace(/[ìí]/g, 'i').replace(/[òó]/g, 'o').replace(/[ùú]/g, 'u');
}

/** In Firestore ci sono avversari non ancora noti salvati come testo "undefined". */
export const nomeValido = (n: string) => !!n && n !== 'undefined' && n !== 'null';

export const conDatiValidi = (p: PartitaCalendario) => RE_DATA.test(p.data || '') && nomeValido(p.squadraCasa) && nomeValido(p.squadraOspite);

/** Oggi come lo calcola il sito (data UTC). */
export const oggiIso = (adesso = new Date()) => adesso.toISOString().slice(0, 10);

export const passata = (p: PartitaCalendario, oggi: string) => p.stato === 'conclusa' || p.data < oggi;

export const nellaStagione = (p: PartitaCalendario, stagione: string) => !p.stagione || p.stagione === stagione;

export const avversario = (p: PartitaCalendario) => (isVV(p.squadraCasa) ? p.squadraOspite : p.squadraCasa);

export function perData<T extends { data: string; ora: string }>(a: T, b: T) {
  return a.data === b.data ? (a.ora || '').localeCompare(b.ora || '') : (a.data || '').localeCompare(b.data || '');
}

/** "Sabato 8 Novembre 2025 - 18:30" (schede delle partite). */
export function dataScheda(data: string, ora: string) {
  const d = giorno(data);
  if (!d) return '';
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear() + (ora ? ' - ' + ora : '');
}

/** "Domenica 1 novembre · 11:00" (barra fissa e card della prossima partita). */
export function dataEstesa(data: string, ora: string) {
  const d = giorno(data);
  if (!d) return 'Data da definire';
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()].toLowerCase() + (ora ? ' · ' + ora : '');
}

/** "Sab 31 ott · 18:00" (righe delle giornate). */
export function dataBreve(data: string, ora: string) {
  const d = giorno(data);
  if (!d) return 'Data da definire';
  return GIORNI_BREVI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI_BREVI[d.getMonth()] + (ora ? ' · ' + ora : '');
}

/** "Oggi", "Domani", "tra 5 giorni". */
export function quantoManca(data: string, oggi: string) {
  const d = giorno(data), o = giorno(oggi);
  if (!d || !o) return '';
  const n = Math.round((d.getTime() - o.getTime()) / 86400000);
  if (n <= 0) return 'Oggi';
  if (n === 1) return 'Domani';
  return 'tra ' + n + ' giorni';
}

/** "31 ott", "31 ott – 2 nov", "7–8 nov". */
export function intervallo(primo: string, ultimo: string) {
  const d1 = giorno(primo), d2 = giorno(ultimo);
  if (!d1 || !d2) return '';
  if (d1.getTime() === d2.getTime()) return d1.getDate() + ' ' + MESI_BREVI[d1.getMonth()];
  if (d1.getMonth() === d2.getMonth()) return d1.getDate() + '–' + d2.getDate() + ' ' + MESI_BREVI[d1.getMonth()];
  return d1.getDate() + ' ' + MESI_BREVI[d1.getMonth()] + ' – ' + d2.getDate() + ' ' + MESI_BREVI[d2.getMonth()];
}

type Evento = { data: string; ora: string; casa: string; ospite: string; palazzetto: string; categoria?: string };

/** Link "aggiungi evento" di Google Calendar (come gcalUrl del sito): durata 2 ore, fuso della gara. */
export function linkGoogleCalendar(e: Evento) {
  const ymd = e.data.replace(/-/g, '');
  const m = /^(\d{1,2}):(\d{2})/.exec(e.ora || '');
  let date: string;
  if (m) {
    const h = +m[1], mi = +m[2], fine = h + 2;
    date = ymd + 'T' + pad2(h) + pad2(mi) + '00/' + ymd + 'T' + (fine > 23 ? '235900' : pad2(fine) + pad2(mi) + '00');
  } else {
    const dopo = new Date(e.data + 'T00:00:00');
    dopo.setDate(dopo.getDate() + 1);
    date = ymd + '/' + dopo.getFullYear() + pad2(dopo.getMonth() + 1) + pad2(dopo.getDate());
  }
  const q = [
    'action=TEMPLATE',
    'text=' + encodeURIComponent(e.casa + ' - ' + e.ospite + (e.categoria ? ' (' + e.categoria + ')' : '')),
    'dates=' + date,
    'ctz=Europe/Rome',
  ];
  if (e.palazzetto) q.push('location=' + encodeURIComponent(e.palazzetto));
  q.push('details=' + encodeURIComponent('Victor Volley — calendario partite: https://www.victorvolley.it/calendario'));
  return 'https://calendar.google.com/calendar/render?' + q.join('&');
}

/** Categorie presenti nelle partite, nell'ordine in cui compaiono; Prima Divisione per prima. */
export function categorie(partite: PartitaCalendario[]) {
  const c: string[] = [];
  partite.forEach((p) => { if (!c.includes(p.categoria)) c.push(p.categoria); });
  return c.sort((a, b) => (a === 'Prima Divisione' ? -1 : b === 'Prima Divisione' ? 1 : 0));
}

/** Vittoria o sconfitta della Victor. */
export function esito(p: PartitaCalendario): 'vittoria' | 'sconfitta' | null {
  if (p.setCasa == null || p.setOspite == null) return null;
  const vv = isVV(p.squadraCasa) ? p.setCasa : p.setOspite;
  const avv = isVV(p.squadraCasa) ? p.setOspite : p.setCasa;
  return vv > avv ? 'vittoria' : 'sconfitta';
}

/** Partite di una categoria e stagione, avversari per il filtro, elenco filtrato e indice della prossima. */
export function elencoCategoria(tutte: PartitaCalendario[], categoria: string, stagione: string, scelta: string, oggi: string) {
  const s = slug(categoria);
  const della = tutte.filter((p) => nellaStagione(p, stagione) && slug(p.categoria) === s).sort(perData);
  const avversari: string[] = [];
  della.forEach((p) => {
    const o = avversario(p);
    if (nomeValido(o) && !avversari.includes(o)) avversari.push(o);
  });
  avversari.sort((a, b) => a.localeCompare(b, 'it'));
  const filtro = avversari.includes(scelta) ? scelta : '';
  const partite = filtro ? della.filter((p) => avversario(p) === filtro) : della;
  const prossima = partite.findIndex((p) => !passata(p, oggi));
  const future = partite.filter((p) => !passata(p, oggi) && conDatiValidi(p));
  return { avversari, filtro, partite, prossima, future };
}

/** Prossima partita della categoria per la barra fissa. */
export function prossimaDellaCategoria(tutte: PartitaCalendario[], categoria: string, stagione: string, oggi: string) {
  const s = slug(categoria);
  return tutte.filter((p) => nellaStagione(p, stagione) && slug(p.categoria) === s && !passata(p, oggi) && conDatiValidi(p)).sort(perData)[0] ?? null;
}

export type Giornata = { numero: number; intervallo: string; partite: PartitaGirone[]; riposa: string[] };

/** Giornate del girone (tutte le partite, anche fra le altre squadre) e prossima partita della Victor. */
export function giornate(partite: PartitaGirone[], squadre: SquadraGirone[], oggi: string) {
  const valide = partite.filter((m) => m.squadra_casa && m.squadra_ospite);
  const vv = (m: PartitaGirone) => squadraById(squadre, m.squadra_casa).home || squadraById(squadre, m.squadra_ospite).home;
  const prossima = valide.filter((m) => vv(m) && m.set_casa == null && (m.data || '') >= oggi).sort(perData)[0] ?? null;

  const ordine: number[] = [];
  const per: Record<number, PartitaGirone[]> = {};
  valide.slice().sort(perData).forEach((m) => {
    const k = m.giornata || 0;
    if (!per[k]) { per[k] = []; ordine.push(k); }
    per[k].push(m);
  });
  ordine.sort((a, b) => a - b);
  const elenco: Giornata[] = ordine.map((k) => {
    const lista = per[k].sort(perData);
    const gioca = new Set(lista.flatMap((m) => [m.squadra_casa, m.squadra_ospite]));
    return {
      numero: k,
      intervallo: intervallo(lista[0].data, lista[lista.length - 1].data),
      partite: lista,
      riposa: k ? squadre.filter((s) => !gioca.has(s.id)).map((s) => s.nome) : [],
    };
  });
  return { giornate: elenco, prossima };
}

/** Come VV.teamKey: confronto dei nomi senza accenti, sigle societarie e punteggiatura. */
export function chiaveSquadra(nome: string) {
  return String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(asd|ssd|srl|arl|ssdarl|a s d|s s d|s r l)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Lo sponsor della barra del calendario (sito: SPONSOR_GIRONE). */
export const SPONSOR_CALENDARIO = 'Puglia in food';
export function sponsorCalendario<T extends { nome: string; logo: string }>(sponsor: T[]) {
  const k = chiaveSquadra(SPONSOR_CALENDARIO);
  return sponsor.find((s) => chiaveSquadra(s.nome) === k && s.logo) ?? null;
}
