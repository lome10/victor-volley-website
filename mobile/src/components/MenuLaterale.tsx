// Il menu laterale del sito: stesse voci, stesso ordine, "Gioca con noi" e social in fondo.
import { usePathname } from 'expo-router';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Social } from '~/components/Social';
import { aree, menu, unisciti, type Pagina } from '~/lib/pagine';
import { colors, fonts } from '~/lib/theme';
import { vai } from '~/lib/vai';

export function MenuLaterale({ aperto, chiudi }: { aperto: boolean; chiudi: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const attuale = usePathname();

  const scegli = (p: Pagina) => {
    chiudi();
    vai(p.href, attuale);
  };

  const voce = (p: Pagina) => {
    const attiva = p.href === attuale;
    return (
      <Pressable key={p.menu} style={[styles.voce, attiva && styles.voceAttiva]} onPress={() => scegli(p)} accessibilityRole="menuitem" accessibilityLabel={p.menu}>
        <Text style={[styles.testo, attiva && styles.testoAttivo]}>{p.menu}</Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={aperto} transparent animationType="fade" onRequestClose={chiudi}>
      <View style={styles.sfondo}>
        <View style={[styles.pannello, { paddingTop: top, paddingBottom: bottom }]}>
          <ScrollView contentContainerStyle={styles.contenuto}>
            <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            {menu.map(voce)}
            <View style={styles.separatore} />
            {aree.map(voce)}
            <Pressable style={styles.cta} onPress={() => scegli(unisciti)} accessibilityRole="menuitem" accessibilityLabel={unisciti.menu}>
              <Text style={styles.ctaTesto}>{unisciti.menu}</Text>
            </Pressable>
            <View style={styles.social}>
              <Social />
            </View>
          </ScrollView>
        </View>
        <Pressable style={styles.fuori} onPress={chiudi} accessibilityRole="button" accessibilityLabel="Chiudi menu" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sfondo: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.55)' },
  pannello: { width: 220, backgroundColor: colors.menu },
  fuori: { flex: 1 },
  contenuto: { paddingVertical: 16 },
  logo: { width: 72, height: 72, alignSelf: 'center', marginBottom: 16 },
  voce: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  voceAttiva: { borderLeftColor: colors.azzurro },
  testo: { color: 'rgba(255,255,255,0.78)', fontFamily: fonts.titolo, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
  testoAttivo: { color: colors.azzurro },
  separatore: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 10, marginHorizontal: 14 },
  cta: { margin: 14, minHeight: 44, borderRadius: 2, backgroundColor: colors.magenta, alignItems: 'center', justifyContent: 'center' },
  ctaTesto: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
  social: { alignItems: 'center', marginTop: 8 },
});
