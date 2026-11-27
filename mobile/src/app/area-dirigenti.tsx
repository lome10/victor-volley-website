// Area dirigenti (login di /admin del sito): un solo accesso. Come _checkRole di js/admin.js: se l'account e' in
// `dirigenti` resta qui (pannello nell'app "in arrivo"), se e' in `allenatori` va all'area allenatore, altrimenti
// accesso non autorizzato. Ogni schermata ha Esci, per non restare collegati.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { AreaAllenatore, Attesa, Negato } from '~/components/allenatore/AreaAllenatore';
import { Accesso } from '~/components/atleti/Accesso';
import { CHIAVI_RISERVATE } from '~/components/atleti/Cruscotto';
import { esci, ruoloAccount, seguiUtente, type Utente } from '~/lib/firebase';

export default function AreaDirigenti() {
  // undefined = Firebase sta ancora leggendo la sessione salvata nel telefono.
  const [utente, setUtente] = useState<Utente | null | undefined>(undefined);
  useEffect(() => seguiUtente(setUtente), []);
  if (utente === undefined) return <Attesa />;
  return utente ? <DopoAccesso key={utente.uid} utente={utente} /> : <Accesso titolo="Area Dirigenti" />;
}

function DopoAccesso({ utente }: { utente: Utente }) {
  const qc = useQueryClient();
  const ruolo = useQuery({ queryKey: ['ruolo', utente.uid], queryFn: () => ruoloAccount(utente.uid), retry: false, staleTime: 0 });
  const fuori = async () => {
    await esci();
    for (const k of CHIAVI_RISERVATE) qc.removeQueries({ queryKey: [k] });
  };
  if (ruolo.isPending) return <Attesa />;
  if (ruolo.data === 'allenatore') return <AreaAllenatore utente={utente} />;
  if (ruolo.data === 'dirigente') {
    return <Negato fuori={() => void fuori()} titolo="Area Dirigenti" testo={'Il pannello dei dirigenti nell’app è in arrivo.\nPer ora usa il sito.'} />;
  }
  return (
    <Negato
      fuori={() => void fuori()}
      titolo="Accesso non autorizzato"
      testo={'Questo account non ha i permessi per il pannello.\nContatta un dirigente per richiedere l’accesso.'}
    />
  );
}
