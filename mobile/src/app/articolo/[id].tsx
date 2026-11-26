// La pagina articolo del sito (news-dettaglio): sponsor, "Torna alle news", copertina, testo, correlati.
import { Image } from 'expo-image';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Piede } from '~/components/Piede';
import { SchedaNews } from '~/components/SchedaNews';
import { Stato } from '~/components/Stato';
import { TestoArticolo } from '~/components/TestoArticolo';
import { NonTrovato, useArticolo, usePubblico, type Sponsor } from '~/lib/dati';
import { dataEstesa, fuoco, immagineLarga } from '~/lib/news';
import { colors, fonts } from '~/lib/theme';

export default function Rotta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Come il sito: un indirizzo senza un numero valido torna alle news.
  if (!/^[1-9]\d{0,8}$/.test(id ?? '')) return <Redirect href="/news" />;
  return <PaginaArticolo id={id} />;
}

function PaginaArticolo({ id }: { id: string }) {
  const numero = Number(id);
  const { width } = useWindowDimensions();
  const { data: articolo, isPending, error, refetch } = useArticolo(numero);
  const { data: pubblico } = usePubblico();

  const sponsor = (articolo?.sponsorIds ?? [])
    .map((s) => pubblico?.sponsor.find((x) => x.id === s))
    .filter((s): s is Sponsor => !!s?.logo)
    .slice(0, 3);
  const correlati = (pubblico?.articoli ?? []).filter((a) => a.id !== numero).slice(0, 3);
  const copertina = Math.min(260, width - 48);

  return (
    <ScrollView key={id} style={styles.pagina} contentContainerStyle={styles.tutto}>
      <View style={styles.corpo}>
        {sponsor.length > 0 && (
          <View style={styles.sponsor}>
            {sponsor.map((s) => (
              <Pressable key={s.id} style={styles.sponsorVoce} disabled={!s.url} onPress={() => Linking.openURL(s.url)} accessibilityLabel={s.nome}>
                <Image source={s.logo} style={styles.sponsorLogo} contentFit="contain" />
              </Pressable>
            ))}
          </View>
        )}
        <Pressable style={styles.indietro} onPress={() => router.dismissTo('/news')} accessibilityRole="link">
          <Text style={styles.indietroTesto}>← Torna alle news</Text>
        </Pressable>

        {error instanceof NonTrovato ? (
          <Stato chiaro titolo="Articolo non trovato." />
        ) : error && !articolo ? (
          <Stato chiaro titolo="Non riusciamo a caricare i contenuti" testo="Controlla la connessione e riprova." riprova={refetch} />
        ) : isPending || !articolo ? (
          <Stato />
        ) : (
          <>
            {articolo.image ? (
              <Image
                source={immagineLarga(articolo.image, 1200)}
                style={[styles.copertina, { width: copertina, aspectRatio: articolo.coverRatio === '9:16' ? 9 / 16 : 4 / 5 }]}
                contentFit="cover"
                contentPosition={fuoco(articolo.imageFocus)}
                accessibilityLabel={articolo.title}
              />
            ) : null}
            <View style={styles.meta}>
              {articolo.categories.map((c) => (
                <Text key={c} style={[styles.categoria, c === 'Prima Divisione' ? styles.magenta : styles.azzurro]}>{c}</Text>
              ))}
              <Text style={styles.data}>{dataEstesa(articolo.date)}</Text>
            </View>
            <Text style={styles.titolo} accessibilityRole="header">{articolo.title}</Text>
            <TestoArticolo html={articolo.content} />
          </>
        )}

        {articolo && correlati.length > 0 && (
          <View style={styles.correlati}>
            <Text style={styles.correlatiTitolo}>Articoli correlati</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.striscia}>
              {correlati.map((a, i) => (
                <SchedaNews key={a.id} articolo={a} indice={i} larghezza={Math.round(width * 0.7)} apri={() => router.setParams({ id: String(a.id) })} />
              ))}
            </ScrollView>
          </View>
        )}
      </View>
      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bianco },
  tutto: { flexGrow: 1, justifyContent: 'space-between' },
  corpo: { padding: 24, paddingTop: 28 },
  sponsor: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  sponsorVoce: { flex: 1, maxWidth: 190, height: 90 },
  sponsorLogo: { width: '100%', height: '100%' },
  indietro: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 12 },
  indietroTesto: { color: colors.azzurroScuro, fontFamily: fonts.titoloMedio, fontSize: 14 },
  copertina: { alignSelf: 'center', borderRadius: 12, marginBottom: 28 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 20 },
  categoria: { fontFamily: fonts.titolo, fontSize: 12, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', textTransform: 'uppercase' },
  azzurro: { backgroundColor: 'rgba(0,140,253,0.12)', color: colors.azzurroScuro },
  magenta: { backgroundColor: 'rgba(203,33,104,0.12)', color: colors.magenta },
  data: { color: '#888888', fontFamily: fonts.corpo, fontSize: 13 },
  titolo: { color: colors.navy, fontFamily: fonts.titolo, fontSize: 28, lineHeight: 34, textAlign: 'center', marginBottom: 16 },
  correlati: { marginTop: 32 },
  correlatiTitolo: { color: colors.navy, fontFamily: fonts.titolo, fontSize: 20, marginBottom: 16 },
  striscia: { gap: 12 },
});
