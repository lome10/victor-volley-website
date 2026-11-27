// Barra fissa del calendario (.cal-sticky del sito): prossima partita della categoria e sponsor.
import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { dataEstesa, type PartitaCalendario } from '~/lib/calendario';
import type { Sponsor } from '~/lib/dati';
import { immagineLarga } from '~/lib/news';
import { colors, fonts } from '~/lib/theme';

type Props = { prossima: PartitaCalendario | null; sponsor: Sponsor | null; stretto: boolean; vai: () => void };

export function BarraProssima({ prossima, sponsor, stretto, vai }: Props) {
  if (!prossima && !sponsor) return <View />;
  const link = sponsor && /^https?:\/\//.test(sponsor.url || '') ? sponsor.url : '';
  const logo = sponsor ? (
    <Image
      source={{ uri: immagineLarga(sponsor.logo, 160) }}
      style={[styles.logo, stretto ? styles.logoStretto : styles.logoLargo]}
      contentFit="contain"
      accessibilityLabel={sponsor.nome}
    />
  ) : null;
  return (
    <View style={styles.barra}>
      <View style={[styles.dentro, stretto && styles.dentroStretto]}>
        {prossima ? (
          <Pressable style={styles.prossima} onPress={vai} accessibilityRole="button" accessibilityLabel="Vai alla prossima partita">
            <Text style={styles.etichetta}>PROSSIMA PARTITA</Text>
            <View style={styles.principale}>
              <Text style={styles.quando}>{dataEstesa(prossima.data, prossima.ora)}</Text>
              <Text style={[styles.squadre, stretto && { fontSize: 12 }]} numberOfLines={1}>{prossima.squadraCasa} – {prossima.squadraOspite}</Text>
            </View>
          </Pressable>
        ) : (
          <View style={[styles.prossima, styles.nessuna]}>
            <Text style={styles.etichetta}>PROSSIMA PARTITA</Text>
            <Text style={styles.squadre}>Calendario in arrivo</Text>
          </View>
        )}
        {sponsor ? (
          <View style={styles.sponsor}>
            {stretto ? null : <Text style={styles.presentato}>PRESENTATO DA</Text>}
            {link ? (
              <Pressable style={styles.riquadro} onPress={() => Linking.openURL(link)} accessibilityRole="link" accessibilityLabel={sponsor.nome}>{logo}</Pressable>
            ) : (
              <View style={styles.riquadro}>{logo}</View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { backgroundColor: 'rgba(5,14,31,0.94)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)' },
  dentro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, minHeight: 60, paddingVertical: 6, paddingHorizontal: 24 },
  dentroStretto: { gap: 10, minHeight: 52 },
  prossima: { flexShrink: 1, minWidth: 0, gap: 1, paddingVertical: 4, paddingHorizontal: 6, marginLeft: -6, borderRadius: 8 },
  nessuna: { opacity: 0.8 },
  etichetta: { fontFamily: fonts.titolo, fontSize: 10, letterSpacing: 1, color: '#3aa6ff' },
  principale: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 4, minWidth: 0 },
  quando: { fontFamily: fonts.titoloForte, fontSize: 15, color: colors.bianco },
  squadre: { flexShrink: 1, minWidth: 0, fontFamily: fonts.corpoForte, fontSize: 13, color: 'rgba(255,255,255,0.82)' },
  sponsor: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  presentato: { fontFamily: fonts.titolo, fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.7)' },
  riquadro: { backgroundColor: colors.bianco, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  logo: { borderRadius: 7 },
  logoLargo: { height: 46, width: 110 },
  logoStretto: { height: 38, width: 90 },
});
