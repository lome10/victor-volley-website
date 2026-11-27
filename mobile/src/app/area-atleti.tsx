// Area atleti (atleta.html): accesso con gli stessi account del sito, poi il cruscotto della famiglia.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Accesso } from '~/components/atleti/Accesso';
import { Cruscotto } from '~/components/atleti/Cruscotto';
import { al } from '~/components/atleti/Pezzi';
import { seguiUtente, type Utente } from '~/lib/firebase';
import { pulisciRiservati } from '~/lib/uscita';

export default function AreaAtleti() {
  const qc = useQueryClient();
  // undefined = Firebase sta ancora leggendo la sessione salvata nel telefono.
  const [utente, setUtente] = useState<Utente | null | undefined>(undefined);
  useEffect(() => seguiUtente(setUtente), []);
  // Utente uscito senza Esci (sessione scaduta, uscita dall'area dirigenti): i dati riservati non restano in memoria.
  useEffect(() => {
    if (utente === null) pulisciRiservati(qc);
  }, [utente, qc]);
  if (utente === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: al.sfondo, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={al.blu} accessibilityLabel="Caricamento" />
      </View>
    );
  }
  return utente ? <Cruscotto key={utente.uid} utente={utente} /> : <Accesso />;
}
