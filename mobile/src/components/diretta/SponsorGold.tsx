// Sponsor Gold in alto nella Diretta (js/pages/diretta-2.js): in fila; da telefono, se non ci stanno, scorrono da soli.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { Sponsor } from '~/lib/dati';
import { immagineLarga } from '~/lib/news';

const MINIMO = 110;
const SPAZIO = 12;
const IN_CORSA = 150;

/** Stanno in una riga? (larghezza minima 110 ciascuno, 12 tra uno e l'altro, 12 di margine ai lati). */
export const goldInRiga = (n: number, larghezza: number) => n <= 1 || n * MINIMO + (n - 1) * SPAZIO <= larghezza - 24;

function Voce({ s, style }: { s: Sponsor; style: object }) {
  return (
    <Pressable style={style} onPress={() => s.url && void Linking.openURL(s.url)} disabled={!s.url} accessibilityRole={s.url ? 'link' : 'image'} accessibilityLabel={s.nome}>
      {/* Come il sito: il logo e' ingrandito 1,8 volte dentro la casella. */}
      <Image source={immagineLarga(s.logo, 400)} style={styles.logo} contentFit="contain" />
    </Pressable>
  );
}

export function SponsorGold({ gold }: { gold: Sponsor[] }) {
  const { width } = useWindowDimensions();
  const fermi = goldInRiga(gold.length, width);
  const [x] = useState(() => new Animated.Value(0));
  const giro = gold.length * IN_CORSA;
  useEffect(() => {
    if (fermi) return;
    const anim = Animated.loop(Animated.timing(x, { toValue: -giro, duration: Math.max(12, gold.length * 5) * 1000, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [fermi, x, giro, gold.length]);
  if (!gold.length) return null;
  return (
    <View style={styles.fascia}>
      {fermi ? (
        <View style={styles.riga}>
          {gold.map((s) => (
            <Voce key={s.id} s={s} style={styles.voce} />
          ))}
        </View>
      ) : (
        <Animated.View style={[styles.corsa, { width: giro * 2, transform: [{ translateX: x }] }]}>
          {[...gold, ...gold].map((s, i) => (
            <Voce key={s.id + '-' + i} s={s} style={styles.voceCorsa} />
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fascia: { overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 12 },
  riga: { flexDirection: 'row', justifyContent: 'center', gap: SPAZIO },
  voce: { flexGrow: 1, flexShrink: 1, flexBasis: MINIMO, minWidth: MINIMO, maxWidth: 190, height: 100, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  corsa: { flexDirection: 'row' },
  voceCorsa: { width: IN_CORSA, height: 100, paddingHorizontal: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: '100%', height: '100%', transform: [{ scale: 1.8 }] },
});
