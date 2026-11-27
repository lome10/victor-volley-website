// Area atleti (atleta.html): accesso con gli stessi account del sito, poi il cruscotto della famiglia.
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Accesso } from '~/components/atleti/Accesso';
import { Cruscotto } from '~/components/atleti/Cruscotto';
import { al } from '~/components/atleti/Pezzi';
import { seguiUtente, type Utente } from '~/lib/firebase';

export default function AreaAtleti() {
  // undefined = Firebase sta ancora leggendo la sessione salvata nel telefono.
  const [utente, setUtente] = useState<Utente | null | undefined>(undefined);
  useEffect(() => seguiUtente(setUtente), []);
  if (utente === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: al.sfondo, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={al.blu} accessibilityLabel="Caricamento" />
      </View>
    );
  }
  return utente ? <Cruscotto key={utente.uid} utente={utente} /> : <Accesso />;
}
