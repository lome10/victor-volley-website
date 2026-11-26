// La barra in alto del sito da telefono: menu, logo con nome, tasto diretta.
import { usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '~/lib/theme';
import { vai } from '~/lib/vai';

export function BarraAlta({ apriMenu }: { apriMenu: () => void }) {
  const { top } = useSafeAreaInsets();
  const attuale = usePathname();
  return (
    <View style={[styles.barra, { paddingTop: top }]}>
      <View style={styles.riga}>
        <Pressable style={styles.tasto} onPress={apriMenu} accessibilityRole="button" accessibilityLabel="Apri menu">
          <SymbolView name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }} tintColor={colors.bianco} size={26} />
        </Pressable>
        <Pressable style={styles.identita} onPress={() => vai('/', attuale)} accessibilityRole="link" accessibilityLabel="Victor Volley, home">
          <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.nome}>Victor Volley</Text>
        </Pressable>
        <Pressable style={styles.tasto} onPress={() => vai('/diretta', attuale)} accessibilityRole="button" accessibilityLabel="Guarda la diretta">
          <SymbolView name={{ ios: 'tv', android: 'tv', web: 'tv' }} tintColor={colors.magenta} size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { backgroundColor: colors.notte, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  riga: { height: 54, flexDirection: 'row', alignItems: 'center' },
  tasto: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  identita: { flex: 1, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  logo: { width: 34, height: 34 },
  nome: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
});
