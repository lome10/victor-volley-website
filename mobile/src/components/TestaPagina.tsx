// Intestazione delle pagine del sito (.page-header di css/style.css): fondo navy, briciole, titolo, sottotitolo.
import { router } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { colors, fonts } from '~/lib/theme';

type Props = { briciola: string; titolo: string; sottotitolo?: string };

export function TestaPagina({ briciola, titolo, sottotitolo }: Props) {
  const { width } = useWindowDimensions();
  const piccolo = width <= 768;
  return (
    <View style={styles.testata}>
      <Text style={styles.briciole}>
        <Text onPress={() => router.dismissTo('/')} accessibilityRole="link">Home</Text> / {briciola}
      </Text>
      <Text style={[styles.titolo, { fontSize: piccolo ? 32 : 48, lineHeight: piccolo ? 35 : 53 }]} accessibilityRole="header">{titolo}</Text>
      {sottotitolo ? <Text style={styles.sottotitolo}>{sottotitolo}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  testata: { backgroundColor: colors.navy, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },
  briciole: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.corpo, fontSize: 13, lineHeight: 21 },
  titolo: { color: colors.bianco, fontFamily: fonts.titolo, marginBottom: 8 },
  sottotitolo: { color: 'rgba(255,255,255,0.65)', fontFamily: fonts.corpo, fontSize: 16, lineHeight: 26 },
});
