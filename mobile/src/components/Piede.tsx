// Il piede del sito: logo, social, email, diritti e privacy.
import { usePathname } from 'expo-router';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Social } from '~/components/Social';
import { privacy } from '~/lib/pagine';
import { EMAIL } from '~/lib/social';
import { colors, fonts } from '~/lib/theme';
import { vai } from '~/lib/vai';

export function Piede() {
  const attuale = usePathname();
  return (
    <View style={styles.piede}>
      <View style={styles.riga}>
        <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
        <Social />
      </View>
      <Pressable onPress={() => Linking.openURL('mailto:' + EMAIL)} accessibilityRole="link">
        <Text style={styles.testo}>{EMAIL}</Text>
      </Pressable>
      <View style={styles.linea} />
      <View style={styles.riga}>
        <Text style={styles.piccolo}>© {new Date().getFullYear()} Victor Volley. Tutti i diritti riservati.</Text>
        <Pressable onPress={() => vai(privacy.href, attuale)} accessibilityRole="link">
          <Text style={styles.piccolo}>{privacy.menu}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  piede: { backgroundColor: colors.navy, padding: 24, gap: 12 },
  riga: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  logo: { width: 40, height: 40 },
  testo: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.corpo, fontSize: 13, paddingVertical: 8 },
  linea: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  piccolo: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.corpo, fontSize: 12, paddingVertical: 8 },
});
