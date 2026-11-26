import { Image } from 'expo-image';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { blocchi, type Pezzo } from '~/lib/html';
import { colors, fonts } from '~/lib/theme';

const pezzi = (lista: Pezzo[]) =>
  lista.map((p, i) => (
    <Text
      key={i}
      style={[p.grassetto && styles.grassetto, p.corsivo && styles.corsivo, p.link ? styles.link : null]}
      onPress={p.link ? () => Linking.openURL(p.link!) : undefined}
      accessibilityRole={p.link ? 'link' : undefined}>
      {p.testo}
    </Text>
  ));

export function TestoArticolo({ html }: { html: string }) {
  const lista = blocchi(html);
  if (!lista.length) return <Text style={styles.testo}>Contenuto non disponibile.</Text>;
  return (
    <View>
      {lista.map((b, i) => {
        if (b.tipo === 'immagine') return <Image key={i} source={b.url} style={styles.immagine} contentFit="contain" />;
        if (b.tipo === 'voce')
          return (
            <View key={i} style={styles.voce}>
              <Text style={styles.segno}>{b.segno}</Text>
              <Text style={[styles.testo, styles.voceTesto]}>{pezzi(b.pezzi)}</Text>
            </View>
          );
        return (
          <Text
            key={i}
            style={[styles.testo, b.tipo === 'titolo2' && styles.titolo2, b.tipo === 'titolo3' && styles.titolo3, b.tipo === 'citazione' && styles.citazione]}>
            {pezzi(b.pezzi)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  testo: { color: colors.testo, fontFamily: fonts.corpo, fontSize: 16, lineHeight: 27, marginBottom: 20 },
  grassetto: { fontFamily: fonts.corpoForte },
  corsivo: { fontStyle: 'italic' },
  link: { color: colors.azzurroScuro, textDecorationLine: 'underline' },
  titolo2: { color: colors.navy, fontFamily: fonts.titolo, fontSize: 24, lineHeight: 30, marginTop: 12 },
  titolo3: { color: colors.navy, fontFamily: fonts.titolo, fontSize: 19, lineHeight: 25, marginTop: 4 },
  citazione: { borderLeftWidth: 3, borderLeftColor: colors.azzurro, paddingLeft: 12 },
  voce: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  segno: { color: colors.testo, fontFamily: fonts.corpo, fontSize: 16, lineHeight: 27 },
  voceTesto: { flex: 1, marginBottom: 8 },
  immagine: { width: '100%', aspectRatio: 4 / 3, marginBottom: 20 },
});
