// Banner blu con titolo, testo e due tasti (.cta-banner del sito). Da telefono le palline decorative non ci sono.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Tasto } from '~/components/home/Sezione';
import { colors, fonts } from '~/lib/theme';

type TastoInvito = { testo: string; tipo: 'pieno' | 'bordoBianco'; onPress: () => void };

export function Invito({ titolo, testo, tasti }: { titolo: string; testo: string; tasti: TastoInvito[] }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.titolo} accessibilityRole="header">
        {titolo}
      </Text>
      <Text style={styles.testo}>{testo}</Text>
      <View style={styles.tasti}>
        {tasti.map((t) => (
          <Tasto key={t.testo} testo={t.testo} tipo={t.tipo} onPress={t.onPress} />
        ))}
      </View>
    </View>
  );
}

/** "Vuoi giocare con noi?" della home. */
export function InvitoGioca() {
  return (
    <Invito
      titolo="Vuoi giocare con noi?"
      testo="Siamo sempre alla ricerca di nuovi atleti, da qualsiasi età e livello. Contattaci e vieni a provare un allenamento gratuitamente."
      tasti={[
        { testo: 'Mandaci un messaggio', tipo: 'pieno', onPress: () => router.push('/unisciti-a-noi') },
        { testo: 'Dove siamo', tipo: 'bordoBianco', onPress: () => router.push('/contatti') },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.navy, paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
  titolo: { fontFamily: fonts.titoloMedio, fontSize: 24, lineHeight: 29, color: colors.bianco, marginBottom: 16, textAlign: 'center' },
  testo: { fontFamily: fonts.corpo, fontSize: 17, lineHeight: 27, color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: 520, marginBottom: 32 },
  tasti: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
});
