// La scheda notizia del sito (.hero-card, 4:5): foto, sfumatura, categorie e titolo.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SFUMATURE, fuoco, immagineLarga } from '~/lib/news';
import type { Articolo } from '~/lib/dati';
import { colors, fonts } from '~/lib/theme';

type Props = { articolo: Articolo; indice: number; apri: () => void; larghezza: number };

export function SchedaNews({ articolo, indice, apri, larghezza }: Props) {
  return (
    <Pressable style={[styles.scheda, { width: larghezza, height: larghezza * 1.25 }]} onPress={apri} accessibilityRole="link" accessibilityLabel={articolo.title}>
      {articolo.image ? (
        <Image source={immagineLarga(articolo.image, 900)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={fuoco(articolo.imageFocus)} />
      ) : (
        <LinearGradient colors={SFUMATURE[indice % SFUMATURE.length]} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['rgba(2,8,20,0.04)', 'rgba(2,8,20,0.12)', 'rgba(2,8,20,0.55)', 'rgba(2,8,20,0.92)']}
        locations={[0, 0.38, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.contenuto}>
        <View style={styles.categorie}>
          {articolo.categories.map((c) => (
            <Text key={c} style={[styles.categoria, c === 'Prima Divisione' ? styles.magenta : styles.azzurro]}>
              {c}
            </Text>
          ))}
        </View>
        <Text style={styles.titolo} numberOfLines={5}>
          {articolo.title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scheda: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.menu },
  contenuto: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  categorie: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  categoria: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, overflow: 'hidden' },
  azzurro: { backgroundColor: 'rgba(0,140,253,0.85)' },
  magenta: { backgroundColor: 'rgba(203,33,104,0.85)' },
  titolo: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 16, lineHeight: 21 },
});
