// Area atleti: l'unico file che parla con Firebase (stesso progetto, stessi account e stesse regole del sito).
// Le query sono IDENTICHE a quelle di js/atleta.js: firestore.rules rifiuta quelle diverse.
// Solo letture singole (niente ascolto continuo): poche letture, come il sito (piano gratuito Spark).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  getAuth,
  // Esiste solo nella versione React Native di firebase/auth (Metro la sceglie da sola).
  // @ts-expect-error i tipi pubblici di firebase/auth non la dichiarano
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type Auth,
  type User,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, query, setDoc, where } from 'firebase/firestore';
import { Platform } from 'react-native';

import type { Atleta, Avviso, RataGrezza } from '~/lib/atleti';
import type { Ricevuta } from '~/lib/ricevutaDoc';

/** Configurazione pubblica di js/firebase-config.js (la chiave web di Firebase non e' un segreto: la proteggono le regole). */
const CONFIG = {
  apiKey: 'AIzaSyAEwljngFef_1WGZBdQ-SAqAvLwyXGxjmk',
  authDomain: 'victor-volley.firebaseapp.com',
  projectId: 'victor-volley',
  storageBucket: 'victor-volley.firebasestorage.app',
  messagingSenderId: '567031992105',
  appId: '1:567031992105:web:9248ce4a69ed2bff413138',
};

let _auth: Auth | null = null;

function app() {
  return getApps().length ? getApp() : initializeApp(CONFIG);
}

/** L'accesso resta salvato nel telefono (AsyncStorage) finche' non si esce. */
export function auth(): Auth {
  if (_auth) return _auth;
  _auth =
    Platform.OS === 'web'
      ? getAuth(app())
      : initializeAuth(app(), { persistence: getReactNativePersistence(AsyncStorage) });
  return _auth;
}

const db = () => getFirestore(app());

export type Utente = Pick<User, 'uid' | 'email'>;

/** Chiama `cb` con l'utente (o null) ora e a ogni accesso/uscita. Ritorna la funzione per smettere. */
export function seguiUtente(cb: (u: Utente | null) => void) {
  return onAuthStateChanged(auth(), (u) => cb(u ? { uid: u.uid, email: u.email } : null));
}

/** true se l'accesso riesce; il sito mostra un solo messaggio per ogni errore. */
export async function accedi(email: string, password: string) {
  try {
    await signInWithEmailAndPassword(auth(), email, password);
    return true;
  } catch {
    return false;
  }
}

export const esci = () => signOut(auth());

/** Le schede visibili: `accessUids` contiene l'uid, piu' la vecchia scheda `atleti/{uid}`. Un errore non blocca l'altra lettura. */
export async function leggiSchede(uid: string): Promise<{ conAccesso: Atleta[]; propria: Atleta | null; errore: boolean }> {
  let errore = false;
  const [lista, propria] = await Promise.all([
    getDocs(query(collection(db(), 'atleti'), where('accessUids', 'array-contains', uid))).catch(() => {
      errore = true;
      return null;
    }),
    getDoc(doc(db(), 'atleti', uid)).catch(() => {
      errore = true;
      return null;
    }),
  ]);
  return {
    conAccesso: lista ? lista.docs.map((d) => ({ ...(d.data() as Omit<Atleta, 'uid'>), uid: d.id })) : [],
    propria: propria && propria.exists() ? { ...(propria.data() as Omit<Atleta, 'uid'>), uid: propria.id } : null,
    errore,
  };
}

/** Avvisi della squadra e di tutta la societa'. */
export async function leggiAvvisi(categorie: string[]): Promise<Avviso[]> {
  const snap = await getDocs(query(collection(db(), 'comunicazioni'), where('categoria', 'in', categorie)));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Avviso, 'id'>), id: d.id }));
}

/** Quote dal budget (`rateAtleti`), solo quelle dell'atleta. */
export async function leggiRate(atletaId: string): Promise<RataGrezza[]> {
  const snap = await getDocs(query(collection(db(), 'rateAtleti'), where('atletaId', '==', atletaId)));
  return snap.docs.map((d) => d.data() as RataGrezza);
}

/** Ricevute dei pagamenti dell'atleta, emesse dai dirigenti: qui solo lettura (_loadRicevute). */
export async function leggiRicevute(atletaId: string): Promise<Ricevuta[]> {
  const snap = await getDocs(query(collection(db(), 'ricevute'), where('atletaId', '==', atletaId)));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Ricevuta, 'id'>), id: d.id }));
}

/**
 * Chi e' l'account nell'area dirigenti (_checkRole di js/admin.js): e' in `dirigenti/{uid}`? e in `allenatori/{uid}`?
 * Un errore di lettura (rete assente) NON vale "nessuno": la promessa fallisce e la pagina dice di riprovare. Sola lettura.
 */
export async function ruoloAccount(uid: string): Promise<{ dirigente: boolean; allenatore: boolean }> {
  const [dirigente, allenatore] = await Promise.all([getDoc(doc(db(), 'dirigenti', uid)), getDoc(doc(db(), 'allenatori', uid))]);
  return { dirigente: dirigente.exists(), allenatore: allenatore.exists() };
}

/** ID token dell'utente collegato, per le funzioni del server (/api/allenatore-*); null se non c'e' nessuno. */
export async function idToken(): Promise<string | null> {
  const u = auth().currentUser;
  return u ? u.getIdToken() : null;
}

/** Risposte "ci sarò / non ci sarò" dell'atleta: eventKey -> 'si' | 'no'. */
export async function leggiPresenze(atletaId: string): Promise<Record<string, 'si' | 'no'>> {
  const snap = await getDocs(query(collection(db(), 'presenze'), where('atletaId', '==', atletaId)));
  const risposte: Record<string, 'si' | 'no'> = {};
  for (const d of snap.docs) {
    const x = d.data() as { eventKey: string; risposta: 'si' | 'no' };
    risposte[x.eventKey] = x.risposta;
  }
  return risposte;
}

export type Evento = { key: string; tipo: 'partita' | 'allenamento'; eventoId: string; date: string };

/** Il documento di una risposta: le regole vogliono ESATTAMENTE questi 9 campi e l'id eventKey_atletaId. */
export function documentoPresenza(ev: Evento, atleta: Pick<Atleta, 'uid' | 'categoria'>, risposta: 'si' | 'no', uid: string, adesso: Date) {
  return {
    id: ev.key + '_' + atleta.uid,
    dati: {
      eventKey: ev.key,
      tipo: ev.tipo,
      eventoId: ev.eventoId,
      data: ev.date,
      categoria: atleta.categoria,
      atletaId: atleta.uid,
      risposta,
      rispostaDa: uid,
      rispostaIl: adesso.toISOString(),
    },
  };
}

/** SCRITTURA. Da provare solo con l'account di prova. */
export async function salvaPresenza(ev: Evento, atleta: Pick<Atleta, 'uid' | 'categoria'>, risposta: 'si' | 'no', uid: string) {
  const { id, dati } = documentoPresenza(ev, atleta, risposta, uid, new Date());
  await setDoc(doc(db(), 'presenze', id), dati);
}

/** Promemoria via email: attivi se il documento non c'e' o non dice email: false. */
export async function leggiPromemoria(uid: string) {
  const d = await getDoc(doc(db(), 'notifiche', uid));
  return !(d.exists() && d.data().email === false);
}

/** SCRITTURA. Solo { email, aggiornatoIl }, come vogliono le regole. Da provare solo con l'account di prova. */
export async function salvaPromemoria(uid: string, email: boolean) {
  await setDoc(doc(db(), 'notifiche', uid), { email, aggiornatoIl: new Date().toISOString() });
}

/** Cambio password come il sito: prima la password attuale, poi la nuova. Ritorna il messaggio da mostrare. */
export async function cambiaPassword(attuale: string, nuova: string): Promise<{ ok: boolean; messaggio: string }> {
  const u = auth().currentUser;
  if (!u || !u.email) return { ok: false, messaggio: 'Non è stato possibile aggiornare la password. Riprova.' };
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, attuale));
    await updatePassword(u, nuova);
    return { ok: true, messaggio: 'Password aggiornata.' };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
      return { ok: false, messaggio: 'La password attuale non è corretta.' };
    }
    if (code === 'auth/too-many-requests') return { ok: false, messaggio: 'Troppi tentativi. Riprova tra qualche minuto.' };
    if (code === 'auth/weak-password') return { ok: false, messaggio: 'La nuova password è troppo debole.' };
    return { ok: false, messaggio: 'Non è stato possibile aggiornare la password. Riprova.' };
  }
}
