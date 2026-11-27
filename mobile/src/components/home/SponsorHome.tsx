// "I nostri partner" della home del sito (js/pages/index-2.js): Gold in schede grandi, gli altri in una fascia che scorre.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Sezione, Tasto } from '~/components/home/Sezione';
import type { Sponsor } from '~/lib/dati';
import { immagineLarga } from '~/lib/news';
import { colors, fonts } from '~/lib/theme';

const VOCE = 180;

const livello = (s: Sponsor) => s.livello || 'silver';

/** Gold e fascia come il sito: nella fascia solo chi ha il logo, ripetizioni intervallate (un giro per volta). */
export function divisioneSponsor(sponsor: Sponsor[]) {
  const tutti = [...sponsor].sort((a, b) => (a.order || 0) - (b.order || 0));
  const gold = tutti.filter((s) => livello(s) === 'gold');
  const resto = tutti.filter((s) => livello(s) !== 'gold' && !!s.logo);
  const rimasti = resto.map((s) => ({ s, restano: Math.max(1, s.ripetizioni || 1) }));
  const fascia: Sponsor[] = [];
  let ancora = true;
  while (ancora) {
    ancora = false;
    for (const r of rimasti) {
      if (r.restano > 0) {
        fascia.push(r.s);
        r.restano--;
        ancora = true;
      }
    }
  }
  return { gold, fascia };
}

const apri = (url: string) => {
  if (url) void Linking.openURL(url);
};

export function Fascia({ voci, style }: { voci: Sponsor[]; style?: ViewStyle }) {
  const [x] = useState(() => new Animated.Value(0));
  const giro = voci.length * VOCE;
  // Come l'animazione CSS: un giro in max(15, n*4) secondi, poi riparte (la lista e' doppia, quindi non si vede lo stacco).
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(x, { toValue: -giro, duration: Math.max(15, voci.length * 4) * 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [x, giro, voci.length]);
  return (
    <View style={[styles.fascia, style]}>
      <Animated.View style={[styles.fasciaFila, { width: giro * 2, transform: [{ translateX: x }] }]}>
        {[...voci, ...voci].map((s, i) => (
          <Pressable key={s.id + '-' + i} style={styles.voce} onPress={() => apri(s.url)} disabled={!s.url} accessibilityRole={s.url ? 'link' : 'image'} accessibilityLabel={s.nome}>
            <Image source={immagineLarga(s.logo, 400)} style={styles.voceLogo} contentFit="contain" />
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

export function SponsorHome({ sponsor }: { sponsor: Sponsor[] }) {
  const { gold, fascia } = divisioneSponsor(sponsor);
  if (!gold.length && !fascia.length) return null;
  return (
    <Sezione titolo="I nostri partner" sottotitolo="Le aziende che sostengono la Victor Volley" centro>
      {gold.length ? (
        <View style={styles.gold}>
          {gold.map((s) => (
            <Pressable key={s.id} style={styles.schedaGold} onPress={() => apri(s.url)} disabled={!s.url} accessibilityRole={s.url ? 'link' : 'image'} accessibilityLabel={s.nome}>
              {s.logo ? (
                <Image source={immagineLarga(s.logo, 400)} style={styles.logoGold} contentFit="contain" />
              ) : (
                <Text style={styles.nome}>{s.nome}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
      {fascia.length ? <Fascia voci={fascia} /> : null}
      <View style={styles.cta}>
        <Tasto testo="Scopri tutti i nostri partner" tipo="bordo" onPress={() => router.push('/sponsor')} />
      </View>
    </Sezione>
  );
}

const styles = StyleSheet.create({
  gold: { gap: 24 },
  schedaGold: { minHeight: 140, padding: 32, borderRadius: 12, borderWidth: 1, borderColor: '#e8d38c', backgroundColor: colors.bianco, alignItems: 'center', justifyContent: 'center', shadowColor: '#d4af37', shadowOpacity: 0.15, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  logoGold: { width: 180, height: 180 },
  nome: { fontFamily: fonts.corpo, fontSize: 13, color: '#aaa', textAlign: 'center' },
  // Sul sito la fascia sta dentro il contenitore, quindi con il margine della sezione.
  fascia: { marginTop: 32, overflow: 'hidden', backgroundColor: colors.bianco, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eaecf0', paddingVertical: 16 },
  fasciaFila: { flexDirection: 'row' },
  voce: { width: VOCE, height: 100, paddingHorizontal: 16, borderRightWidth: 1, borderRightColor: '#eaecf0', alignItems: 'center', justifyContent: 'center' },
  voceLogo: { width: '100%', height: '100%' },
  cta: { marginTop: 28 },
});
