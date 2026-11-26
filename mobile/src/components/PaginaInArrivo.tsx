// Pagina con l'intestazione del sito; il contenuto vero sostituisce "In arrivo" pagina per pagina.
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Piede } from '~/components/Piede';
import { tutte } from '~/lib/pagine';
import { colors, fonts } from '~/lib/theme';

export function PaginaInArrivo({ href }: { href: string }) {
  const pagina = tutte.find((p) => p.href === href)!;
  return (
    <ScrollView style={styles.pagina} contentContainerStyle={styles.contenuto}>
      <View style={styles.testata}>
        {href !== '/' && <Text style={styles.briciole}>Home / {pagina.menu}</Text>}
        <Text style={styles.titolo} accessibilityRole="header">{pagina.titolo}</Text>
        {pagina.sottotitolo ? <Text style={styles.sottotitolo}>{pagina.sottotitolo}</Text> : null}
        <Text style={styles.nota}>In arrivo.</Text>
      </View>
      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.notte },
  contenuto: { flexGrow: 1, justifyContent: 'space-between' },
  testata: { padding: 24, paddingTop: 40 },
  briciole: { color: 'rgba(255,255,255,0.65)', fontFamily: fonts.corpo, fontSize: 13 },
  titolo: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 32, marginTop: 4 },
  sottotitolo: { color: 'rgba(255,255,255,0.8)', fontFamily: fonts.corpo, fontSize: 16, marginTop: 4 },
  nota: { color: 'rgba(255,255,255,0.55)', fontFamily: fonts.corpo, fontSize: 14, marginTop: 32 },
});
