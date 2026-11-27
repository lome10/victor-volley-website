// Area dirigenti (login di /admin del sito): un solo accesso. Come _checkRole di js/admin.js: se l'account e' in
// `dirigenti` resta qui (pannello nell'app "in arrivo"; se e' anche allenatore, tasto "Area allenatore" come /allenatore
// sul sito), se e' in `allenatori` va all'area allenatore, altrimenti accesso non autorizzato. Se la lettura del ruolo
// fallisce (rete) si dice di riprovare. Ogni schermata ha Esci, per non restare collegati.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { AreaAllenatore, Attesa, Negato } from '~/components/allenatore/AreaAllenatore';
import { Accesso } from '~/components/atleti/Accesso';
import { ruoloAccount, seguiUtente, type Utente } from '~/lib/firebase';
import { esciEPulisci, pulisciRiservati } from '~/lib/uscita';

export default function AreaDirigenti() {
  const qc = useQueryClient();
  // undefined = Firebase sta ancora leggendo la sessione salvata nel telefono.
  const [utente, setUtente] = useState<Utente | null | undefined>(undefined);
  useEffect(() => seguiUtente(setUtente), []);
  // Utente uscito senza Esci (sessione scaduta, uscita dall'area atleti): i dati riservati non restano in memoria.
  useEffect(() => {
    if (utente === null) pulisciRiservati(qc);
  }, [utente, qc]);
  if (utente === undefined) return <Attesa />;
  return utente ? <DopoAccesso key={utente.uid} utente={utente} /> : <Accesso titolo="Area Dirigenti" />;
}

function DopoAccesso({ utente }: { utente: Utente }) {
  const qc = useQueryClient();
  const [comeAllenatore, setComeAllenatore] = useState(false);
  const ruolo = useQuery({ queryKey: ['ruolo', utente.uid], queryFn: () => ruoloAccount(utente.uid), retry: false, staleTime: 0 });
  const fuori = () => void esciEPulisci(qc);
  if (ruolo.isPending || (ruolo.isError && ruolo.isFetching)) return <Attesa />;
  if (ruolo.isError) {
    return (
      <Negato
        fuori={fuori}
        titolo="Area Dirigenti"
        testo={'Non riesco a controllare il tuo accesso.\nControlla la connessione e riprova.'}
        altro={{ testo: 'Riprova', onPress: () => void ruolo.refetch() }}
      />
    );
  }
  const { dirigente, allenatore } = ruolo.data;
  if (allenatore && (!dirigente || comeAllenatore)) return <AreaAllenatore utente={utente} />;
  if (dirigente) {
    return (
      <Negato
        fuori={fuori}
        titolo="Area Dirigenti"
        testo={'Il pannello dei dirigenti nell’app è in arrivo.\nPer ora usa il sito.'}
        altro={allenatore ? { testo: 'Area allenatore', onPress: () => setComeAllenatore(true) } : undefined}
      />
    );
  }
  return (
    <Negato
      fuori={fuori}
      titolo="Accesso non autorizzato"
      testo={'Questo account non ha i permessi per il pannello.\nContatta un dirigente per richiedere l’accesso.'}
    />
  );
}
