// Scheda Home dell'area atleti (#view-home di atleta.html): bonifico, avvisi fissati, "Da fare", riquadri.
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Distintivo, Icona, SchedaAvviso, Scheda, TastoLeggero, al, coloreValore, colorePuntino, stili as base } from '~/components/atleti/Pezzi';
import { riquadroCertificato, riquadroQuote, type Atleta, type Avviso, type Cosa, type Rata } from '~/lib/atleti';
import { fonts } from '~/lib/theme';

export const IBAN = 'IT42Y0538779670000004768039';
export const IBAN_LEGGIBILE = 'IT42 Y053 8779 6700 0000 4768 039';

export type Vista = 'home' | 'calendario' | 'avvisi' | 'squadra' | 'documenti' | 'profilo';

type Props = {
  atleta: Atleta;
  rate: Rata[];
  fissati: Avviso[];
  cose: Cosa[];
  /** Riquadro "Prossimo impegno"; null finche' partite e allenamenti non sono arrivati. */
  prossimo: { valore: string; sotto: string } | null;
  adesso: Date;
  vai: (v: Vista) => void;
};

/** "Pagamenti: coordinate per il bonifico", sempre in cima alla Home. */
function Bonifico() {
  const [stato, setStato] = useState<'' | 'ok' | 'no'>('');
  const tempo = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (tempo.current) clearTimeout(tempo.current);
  }, []);
  const copia = async () => {
    const ok = await Clipboard.setStringAsync(IBAN).catch(() => false);
    setStato(ok ? 'ok' : 'no');
    if (tempo.current) clearTimeout(tempo.current);
    tempo.current = setTimeout(() => setStato(''), 2500);
  };
  return (
    <Scheda style={base.fissato}>
      <View style={base.corpo}>
        <View style={base.testaAvviso}>
          <Text style={base.titoloAvviso} accessibilityRole="header">
            Pagamenti: coordinate per il bonifico
          </Text>
          <Distintivo tipo="blue" testo="Fissato" />
        </View>
        <Text style={stili.testo}>I pagamenti si fanno con bonifico bancario a favore di:</Text>
        <View style={stili.dati}>
          <Text style={stili.etichetta}>Intestatario</Text>
          <Text style={stili.valore}>A.S.D. VICTOR VOLLEY</Text>
          <Text style={stili.etichetta}>IBAN</Text>
          <Text style={[stili.valore, stili.iban]} selectable>
            {IBAN_LEGGIBILE}
          </Text>
          <TastoLeggero
            largo
            testo={stato === 'ok' ? 'IBAN copiato' : stato === 'no' ? 'Selezionalo e copialo a mano' : 'Copia IBAN'}
            onPress={() => void copia()}
          />
        </View>
        <Text style={stili.testo}>
          <Text style={stili.forte}>Causale.</Text> Scrivi sempre il nome e cognome dell’atleta e la tranche che stai pagando (1ª, 2ª o 3ª).
          Solo la 1ª tranche comprende anche i costi di iscrizione, che si pagano una volta sola.
        </Text>
        <Text style={stili.esempio}>Esempi: «Mario Rossi, 1ª tranche + iscrizione» · «Mario Rossi, 2ª tranche»</Text>
      </View>
    </Scheda>
  );
}

function Riquadro({ etichetta, valore, colore, sotto, onPress, largo }: { etichetta: string; valore: string; colore?: string; sotto: string; onPress: () => void; largo?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [stili.riquadro, !largo && stili.meta, pressed && stili.riquadroPremuto]} onPress={onPress} accessibilityRole="button">
      <Text style={stili.riquadroEtichetta}>{etichetta}</Text>
      <Text style={[stili.riquadroValore, colore ? { color: colore } : null]}>{valore}</Text>
      <Text style={stili.riquadroSotto}>{sotto}</Text>
    </Pressable>
  );
}

export function HomeAtleta({ atleta, rate, fissati, cose, prossimo, adesso, vai }: Props) {
  const cert = riquadroCertificato(atleta, adesso);
  const quote = riquadroQuote(rate);
  return (
    <View style={stili.vista}>
      <Bonifico />
      {fissati.map((v) => (
        <SchedaAvviso key={v.id} v={v} nuovo={false} adesso={adesso} />
      ))}
      <Scheda>
        <View style={base.testaScheda}>
          <View style={base.iconaScheda}>
            <Icona nome="fatto" misura={22} colore={al.blu} />
          </View>
          <View>
            <Text style={base.titoloScheda}>Da fare</Text>
            <Text style={base.sottoScheda}>Scadenze e cose da sistemare</Text>
          </View>
        </View>
        <View style={[base.corpo, stili.lista]}>
          {cose.map((c, i) => {
            const contenuto = (
              <>
                <View style={[stili.puntino, { backgroundColor: colorePuntino[c.livello] }]} />
                <Text style={stili.cosa}>{c.testo}</Text>
              </>
            );
            const meta = c.vai;
            return meta ? (
              <Pressable key={i} style={stili.voce} onPress={() => vai(meta)} accessibilityRole="link">
                {contenuto}
              </Pressable>
            ) : (
              <View key={i} style={stili.voce}>
                {contenuto}
              </View>
            );
          })}
        </View>
      </Scheda>
      <Riquadro largo etichetta="Prossimo impegno" valore={prossimo?.valore ?? '—'} sotto={prossimo?.sotto ?? ''} onPress={() => vai('calendario')} />
      <View style={stili.riquadri}>
        <Riquadro etichetta="Certificato medico" valore={cert.valore} colore={coloreValore[cert.livello]} sotto={cert.sotto} onPress={() => vai('documenti')} />
        <Riquadro
          etichetta="Quote"
          valore={quote.valore}
          colore={quote.livello ? coloreValore[quote.livello] : undefined}
          sotto={quote.sotto}
          onPress={() => vai('documenti')}
        />
      </View>
    </View>
  );
}

const stili = StyleSheet.create({
  vista: { gap: 20 },
  testo: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19.5, color: al.testo, marginVertical: 8 },
  forte: { fontFamily: fonts.corpoForte },
  esempio: { fontFamily: fonts.corpo, fontSize: 12, color: '#475569', marginTop: 6 },
  dati: { gap: 6, marginVertical: 10 },
  etichetta: { fontFamily: fonts.corpo, fontSize: 12, color: '#475569' },
  valore: { fontFamily: fonts.corpoMedio, fontSize: 14, color: al.testo },
  iban: { fontFamily: 'monospace', fontSize: 15, letterSpacing: 0.6 },
  lista: { gap: 10 },
  voce: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  puntino: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  cosa: { flex: 1, fontFamily: fonts.corpo, fontSize: 14, lineHeight: 19.6, color: al.testo },
  riquadri: { flexDirection: 'row', gap: 12 },
  meta: { flex: 1 },
  riquadro: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: al.scheda,
    borderWidth: 1,
    borderColor: al.bordo,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  riquadroPremuto: { borderColor: al.blu },
  riquadroEtichetta: { fontFamily: fonts.corpoMedio, fontSize: 12, color: al.spento, textTransform: 'uppercase', letterSpacing: 0.5 },
  riquadroValore: { fontFamily: fonts.titolo, fontSize: 22, color: al.testo },
  riquadroSotto: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento, minHeight: 16 },
});
