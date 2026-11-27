// Area atleti, fuori da Firebase: password dimenticata e "ultima lettura" degli avvisi.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SITO } from '~/lib/dati';

export const emailValida = (email: string) => /^\S+@\S+\.\S+$/.test(email);

const NON_INVIATA = 'Non riesco a inviare l’email in questo momento. Riprova più tardi.';
export const RESET_INVIATO =
  'Se l’indirizzo è registrato, riceverai un’email con il link per scegliere una nuova password (vale 2 ore). Controlla anche lo spam.';

/**
 * Password dimenticata come il sito: l'email la manda il server (/api/imposta-password, richiediReset),
 * con la stessa risposta sia che l'indirizzo esista o no. Ritorna null se e' partita, altrimenti l'errore da mostrare.
 */
export async function richiediReset(email: string): Promise<string | null> {
  if (!emailValida(email)) return 'Scrivi qui sopra la tua email, poi tocca «Password dimenticata?».';
  try {
    const r = await fetch(SITO + '/api/imposta-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ richiediReset: email }),
    });
    if (r.status === 429) return 'Troppe richieste: riprova tra qualche minuto.';
    return r.ok ? null : NON_INVIATA;
  } catch {
    return NON_INVIATA;
  }
}

/** "Ultima lettura" degli avvisi per account + atleta, solo su questo telefono (come localStorage sul sito). */
const chiave = (uid: string, atletaId: string) => 'vv_avvisi_letti_' + uid + '_' + atletaId;

export async function leggiUltimaLettura(uid: string, atletaId: string) {
  try {
    return (await AsyncStorage.getItem(chiave(uid, atletaId))) || '';
  } catch {
    return '';
  }
}

export async function salvaUltimaLettura(uid: string, atletaId: string, quando: string) {
  try {
    await AsyncStorage.setItem(chiave(uid, atletaId), quando);
  } catch {
    // memoria non disponibile: pazienza, come il sito
  }
}
