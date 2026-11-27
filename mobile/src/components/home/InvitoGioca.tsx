// "Vuoi giocare con noi?" della home del sito (.cta-banner). Da telefono le palline decorative non ci sono.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Tasto } from '~/components/home/Sezione';
import { colors, fonts } from '~/lib/theme';

export function InvitoGioca() {
  return (
    <View style={styles.banner}>
      <Text style={styles.titolo} accessibilityRole="header">
        Vuoi giocare con noi?
      </Text>
      <Text style={styles.testo}>
        Siamo sempre alla ricerca di nuovi atleti, da qualsiasi età e livello. Contattaci e vieni a provare un allenamento gratuitamente.
      </Text>
      <View style={styles.tasti}>
        <Tasto testo="Mandaci un messaggio" tipo="pieno" onPress={() => router.push('/unisciti-a-noi')} />
        <Tasto testo="Dove siamo" tipo="bordoBianco" onPress={() => router.push('/contatti')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.navy, paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
  titolo: { fontFamily: fonts.titoloMedio, fontSize: 24, lineHeight: 29, color: colors.bianco, marginBottom: 16, textAlign: 'center' },
  testo: { fontFamily: fonts.corpo, fontSize: 17, lineHeight: 27, color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: 520, marginBottom: 32 },
  tasti: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
});
