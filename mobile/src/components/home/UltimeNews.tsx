// "Ultime news" della home del sito (js/pages/index-5.js): 6 schede 4:5 a scorrimento con i puntini (da telefono).
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { SchedaNews } from '~/components/SchedaNews';
import { Sezione, Tasto } from '~/components/home/Sezione';
import type { ArticoloInElenco } from '~/lib/dati';
import { colors } from '~/lib/theme';

const SPAZIO = 10;

/** Le 6 piu' recenti, come il sito. */
export const ultimeSei = (articoli: ArticoloInElenco[]) => [...articoli].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);

export function UltimeNews({ articoli }: { articoli: ArticoloInElenco[] }) {
  const { width } = useWindowDimensions();
  const [attiva, setAttiva] = useState(0);
  const voci = ultimeSei(articoli);
  // Come il CSS da telefono: altezza 340, larghezza 4:5 ma mai oltre lo schermo meno 40.
  const larghezza = Math.min(272, width - 40);
  const passo = larghezza + SPAZIO;
  // Ogni scheda si ferma al centro dello schermo (scroll-snap-align: center).
  const fermate = voci.map((_, i) => Math.max(0, SPAZIO + i * passo - (width - larghezza) / 2));

  return (
    <Sezione sfondo={colors.notte} scuro piena titolo="Ultime news" sottotitolo="Comunicati, risultati e aggiornamenti dalla società">
      {voci.length ? (
        <View style={styles.carosello}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToOffsets={fermate}
            decelerationRate="fast"
            contentContainerStyle={styles.fila}
            scrollEventThrottle={32}
            onScroll={(e) => {
              const centro = e.nativeEvent.contentOffset.x + width / 2;
              let migliore = 0;
              voci.forEach((_, i) => {
                const c = SPAZIO + i * passo + larghezza / 2;
                if (Math.abs(c - centro) < Math.abs(SPAZIO + migliore * passo + larghezza / 2 - centro)) migliore = i;
              });
              if (migliore !== attiva) setAttiva(migliore);
            }}>
            {voci.map((a, i) => (
              <SchedaNews key={a.id} articolo={a} indice={i} larghezza={larghezza} apri={() => router.push(`/articolo/${a.id}`)} />
            ))}
          </ScrollView>
          <View style={styles.puntini} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {voci.map((a, i) => (
              <View key={a.id} style={[styles.puntino, i === attiva && styles.puntinoAttivo]} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.cta}>
        <Tasto testo="Tutte le news" tipo="bordoBianco" onPress={() => router.push('/news')} />
      </View>
    </Sezione>
  );
}

const styles = StyleSheet.create({
  carosello: { paddingTop: 20, paddingBottom: 40 },
  fila: { paddingHorizontal: SPAZIO, gap: SPAZIO },
  puntini: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  puntino: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  puntinoAttivo: { backgroundColor: colors.bianco, transform: [{ scale: 1.25 }] },
  cta: { marginTop: 8 },
});
