// Caricamento ed errore, con le stesse parole del sito (.vv-state).
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '~/lib/theme';

type Props = { titolo?: string; testo?: string; riprova?: () => void; chiaro?: boolean };

export function Stato({ titolo, testo, riprova, chiaro }: Props) {
  const colore = { color: chiaro ? colors.testo : colors.bianco };
  if (!titolo) return <ActivityIndicator style={styles.stato} color={colors.azzurro} size="large" />;
  return (
    <View style={styles.stato}>
      <Text style={[styles.titolo, colore]}>{titolo}</Text>
      {testo ? <Text style={[styles.testo, colore]}>{testo}</Text> : null}
      {riprova ? (
        <Pressable style={styles.tasto} onPress={riprova} accessibilityRole="button">
          <Text style={styles.tastoTesto}>Riprova</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stato: { padding: 32, alignItems: 'center', gap: 8 },
  titolo: { fontFamily: fonts.titolo, fontSize: 19, textAlign: 'center' },
  testo: { fontFamily: fonts.corpo, fontSize: 14, textAlign: 'center', opacity: 0.75 },
  tasto: { marginTop: 8, minHeight: 44, paddingHorizontal: 24, justifyContent: 'center', borderRadius: 3, backgroundColor: colors.azzurroScuro },
  tastoTesto: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 14 },
});
