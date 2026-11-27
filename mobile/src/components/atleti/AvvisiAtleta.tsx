// Scheda Avvisi dell'area atleti (#view-avvisi, _renderAvvisi): fissati "In evidenza", poi gli altri; Nuovo dopo l'ultima lettura.
import { StyleSheet, Text, View } from 'react-native';

import { Scheda, SchedaAvviso, al, stili as base } from '~/components/atleti/Pezzi';
import { fissatoAttivo, limiteLettura, type Avviso } from '~/lib/atleti';
import { fonts } from '~/lib/theme';

type Props = {
  avvisi: Avviso[] | undefined;
  errore: boolean;
  /** "Ultima lettura" com'era prima di aprire la scheda: decide cosa e' Nuovo. */
  primaDiAprire: string;
  adesso: Date;
};

function Messaggio({ testo }: { testo: string }) {
  return (
    <Scheda>
      <View style={base.corpo}>
        <Text style={base.spento}>{testo}</Text>
      </View>
    </Scheda>
  );
}

export function AvvisiAtleta({ avvisi, errore, primaDiAprire, adesso }: Props) {
  if (errore) return <Messaggio testo="Non è stato possibile caricare gli avvisi. Riprova più tardi." />;
  if (!avvisi) return <Text style={stili.carica}>Caricamento…</Text>;
  if (!avvisi.length) return <Messaggio testo="Non ci sono avvisi." />;
  const limite = limiteLettura(primaDiAprire, adesso);
  const nFissati = avvisi.filter((v) => fissatoAttivo(v, adesso)).length;
  return (
    <View style={stili.lista}>
      {avvisi.map((v, i) => {
        const fissato = fissatoAttivo(v, adesso);
        const sezione = nFissati && i === 0 ? 'In evidenza' : nFissati && i === nFissati ? 'Altri avvisi' : '';
        return (
          <View key={v.id} style={stili.voce}>
            {sezione ? (
              <Text style={stili.sezione} accessibilityRole="header">
                {sezione}
              </Text>
            ) : null}
            <SchedaAvviso v={v} nuovo={!fissato && (v.createdAt || '') > limite} adesso={adesso} />
          </View>
        );
      })}
    </View>
  );
}

const stili = StyleSheet.create({
  lista: { gap: 16 },
  voce: { gap: 0 },
  sezione: {
    fontFamily: fonts.corpoForte,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: al.spento,
    marginTop: 2,
    marginBottom: 8,
    marginHorizontal: 2,
  },
  carica: { fontFamily: fonts.corpo, fontSize: 15, color: al.spento, textAlign: 'center', paddingVertical: 40 },
});
