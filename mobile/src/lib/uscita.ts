// Uscita dalle aree riservate (atleti e allenatore): stesso account Firebase, stessi dati da cancellare.
import type { QueryClient } from '@tanstack/react-query';

import { esci } from '~/lib/firebase';

/** Dati riservati in memoria: area atleti, e 'allenatore'/'ruolo' dell'area allenatore (telefoni dei genitori). */
export const CHIAVI_RISERVATE = ['atleti', 'avvisi', 'rate', 'presenze', 'ricevute', 'promemoria', 'allenatore', 'ruolo'];

export function pulisciRiservati(qc: QueryClient) {
  for (const k of CHIAVI_RISERVATE) qc.removeQueries({ queryKey: [k] });
}

/** Esci: PRIMA si cancellano i dati riservati, poi si esce da Firebase. Se l'uscita fallisce (rete) i dati sono gia' via. */
export async function esciEPulisci(qc: QueryClient) {
  pulisciRiservati(qc);
  try {
    await esci();
  } catch {
    // resta collegato: la pagina rilegge quello che serve, niente rimane da prima
  }
}
