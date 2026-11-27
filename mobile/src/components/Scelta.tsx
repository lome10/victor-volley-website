// Tendina del sito (<select>) come foglio dell'app: un tasto con la voce scelta, e l'elenco che sale dal basso.
// Differenza dal sito da far approvare a Lorenzo (VVW-39).
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '~/lib/theme';

export type Voce = { valore: string; etichetta: string };

type Props = {
  voci: Voce[];
  scelta: string | null;
  scegli: (valore: string) => void;
  /** Testo del tasto quando non c'e' una scelta ("Scegli…"). */
  vuoto?: string;
  /** Titolo del foglio e nome per i lettori di schermo. */
  titolo: string;
  /** Tasto chiaro (pagina bianca) o scuro (testata blu). */
  chiaro?: boolean;
};

export function Scelta({ voci, scelta, scegli, vuoto = 'Scegli…', titolo, chiaro }: Props) {
  const [aperta, setAperta] = useState(false);
  const { bottom } = useSafeAreaInsets();
  const attuale = voci.find((v) => v.valore === scelta);
  return (
    <>
      <Pressable
        style={[styles.tasto, chiaro ? styles.tastoChiaro : styles.tastoScuro]}
        onPress={() => setAperta(true)}
        accessibilityRole="button"
        accessibilityLabel={titolo + ': ' + (attuale ? attuale.etichetta : vuoto)}>
        <Text style={[styles.tastoTesto, chiaro && styles.testoChiaro]} numberOfLines={1}>
          {attuale ? attuale.etichetta : vuoto}
        </Text>
        <Text style={[styles.freccia, chiaro && styles.testoChiaro]}>⌄</Text>
      </Pressable>
      <Modal visible={aperta} transparent animationType="slide" onRequestClose={() => setAperta(false)}>
        <Pressable style={styles.velo} onPress={() => setAperta(false)} accessibilityLabel="Chiudi" />
        <View style={[styles.foglio, { paddingBottom: 16 + bottom }]}>
          <Text style={styles.titolo}>{titolo}</Text>
          <ScrollView>
            {voci.map((v) => {
              const attiva = v.valore === scelta;
              return (
                <Pressable
                  key={v.valore}
                  style={[styles.voce, attiva && styles.voceAttiva]}
                  onPress={() => {
                    setAperta(false);
                    scegli(v.valore);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: attiva }}>
                  <Text style={[styles.voceTesto, attiva && styles.voceTestoAttiva]}>{v.etichetta}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tasto: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, maxWidth: 260, alignSelf: 'flex-start' },
  tastoScuro: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
  tastoChiaro: { backgroundColor: colors.bianco, borderColor: '#E2E8F0', borderRadius: 8 },
  tastoTesto: { flexShrink: 1, color: colors.bianco, fontFamily: fonts.corpoForte, fontSize: 13 },
  testoChiaro: { color: colors.navy },
  freccia: { color: colors.bianco, fontSize: 14, lineHeight: 16, marginTop: -6 },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  foglio: { maxHeight: '70%', backgroundColor: colors.menu, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 16 },
  titolo: { color: 'rgba(255,255,255,0.6)', fontFamily: fonts.titolo, fontSize: 12.5, letterSpacing: 1.5, textTransform: 'uppercase', paddingHorizontal: 24, marginBottom: 8 },
  voce: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 24 },
  voceAttiva: { backgroundColor: 'rgba(0,140,253,0.18)' },
  voceTesto: { color: colors.bianco, fontFamily: fonts.corpo, fontSize: 16 },
  voceTestoAttiva: { fontFamily: fonts.corpoForte },
});
