// La pagina Galleria del sito (galleria.html, js/pages/galleria-1.js).
// Elenco degli album su /galleria; un album su /galleria?album=<slug> (sul sito /galleria/<slug>), stessa pagina.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { GrigliaAlbum, GrigliaFoto, VisoreFoto } from '~/components/Galleria';
import { Piede } from '~/components/Piede';
import { Scelta } from '~/components/Scelta';
import { Stato } from '~/components/Stato';
import { usePubblico, type Album } from '~/lib/dati';
import { infoAlbum } from '~/lib/galleria';
import { colors, fonts } from '~/lib/theme';

export default function Galleria() {
  const { width } = useWindowDimensions();
  const { album: slug, da } = useLocalSearchParams<{ album?: string; da?: string }>();
  const { data, isPending, isError, refetch, isRefetching } = usePubblico();
  const [aperta, setAperta] = useState<number | null>(null);

  // Gia' ordinati dal piu' recente e solo quelli con foto (api/_app-pubblico-logic.js, come galleria-1.js).
  const tutti = data?.album ?? [];
  const album = slug ? tutti.find((a) => a.slug === slug) : undefined;
  const altri = album ? tutti.filter((a) => a.id !== album.id) : [];
  const caricato = !isPending && !(isError && !data);
  const nonTrovato = !!slug && caricato && !album;

  const apriAlbum = (a: Album) => router.push({ pathname: '/galleria', params: { album: a.slug, da: slug ? undefined : 'elenco' } });
  // "Tutti gli album": se si arriva dall'elenco si torna indietro, altrimenti si va all'elenco.
  const tuttiGliAlbum = () => (da === 'elenco' && router.canGoBack() ? router.back() : router.replace('/galleria'));

  const larghezza = width - 48;
  const titolo = nonTrovato ? 'Album non trovato' : album ? album.title : 'Galleria';
  const sottotitolo = nonTrovato ? '' : album ? infoAlbum(album) : 'Momenti di gioco, allenamento ed eventi';

  const link = (testo: string, azione: () => void) => (
    <Text style={styles.link} onPress={azione} accessibilityRole="link">
      {testo}
    </Text>
  );

  return (
    <ScrollView
      style={styles.pagina}
      contentContainerStyle={styles.tutto}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.navy} />}>
      <View style={styles.testata}>
        <Text style={styles.briciole}>
          {link('Home', () => router.dismissTo('/'))}
          {slug ? (
            <>
              {' / '}
              {link('Galleria', tuttiGliAlbum)}
              {album ? ' / ' + album.title : ''}
            </>
          ) : (
            ' / Galleria'
          )}
        </Text>
        <Text style={styles.titolo} accessibilityRole="header">
          {titolo}
        </Text>
        {sottotitolo ? <Text style={styles.sottotitolo}>{sottotitolo}</Text> : null}
      </View>

      <View style={styles.corpo}>
        {isPending ? (
          <Stato chiaro />
        ) : isError && !data ? (
          <Stato chiaro titolo="Non riusciamo a caricare i contenuti" testo="Controlla la connessione e riprova." riprova={refetch} />
        ) : nonTrovato ? (
          <Text style={styles.vuoto}>
            Questo album non esiste, o non è più disponibile.{'\n'}
            <Text style={styles.vuotoLink} onPress={tuttiGliAlbum} accessibilityRole="link">
              ← Torna a tutti gli album
            </Text>
          </Text>
        ) : album ? (
          <>
            <View style={styles.navAlbum}>
              <Text style={styles.indietro} onPress={tuttiGliAlbum} accessibilityRole="link">
                ← Tutti gli album
              </Text>
              {altri.length ? (
                <View style={styles.vaiA}>
                  <Text style={styles.vaiATesto}>Vai a un altro album</Text>
                  <Scelta
                    chiaro
                    titolo="Vai a un altro album"
                    voci={altri.map((a) => ({ valore: a.slug, etichetta: a.title }))}
                    scelta={null}
                    scegli={(v) => router.push({ pathname: '/galleria', params: { album: v } })}
                  />
                </View>
              ) : null}
            </View>
            {album.photos.length ? (
              <GrigliaFoto foto={album.photos} titolo={album.title} larghezza={larghezza} apri={setAperta} />
            ) : (
              <Text style={styles.vuoto}>
                Nessuna foto in questo album.{'\n'}
                <Text style={styles.nota}>Le foto verranno caricate dalla società.</Text>
              </Text>
            )}
            {altri.length ? (
              <View style={styles.altri}>
                <View style={styles.altriTesta}>
                  <Text style={styles.altriTitolo} accessibilityRole="header">
                    Altri album
                  </Text>
                  {link('Vedi tutti →', tuttiGliAlbum)}
                </View>
                <GrigliaAlbum album={altri.slice(0, 6)} larghezza={larghezza} apri={apriAlbum} />
              </View>
            ) : null}
            <VisoreFoto foto={album.photos} titolo={album.title} inizio={aperta} chiudi={() => setAperta(null)} />
          </>
        ) : tutti.length ? (
          <GrigliaAlbum album={tutti} larghezza={larghezza} apri={apriAlbum} />
        ) : (
          <Text style={styles.vuoto}>
            Nessun album ancora.{'\n'}
            <Text style={styles.nota}>Le foto verranno caricate dalla società.</Text>
          </Text>
        )}
      </View>

      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bianco },
  tutto: { flexGrow: 1, justifyContent: 'space-between' },
  testata: { backgroundColor: colors.navy, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },
  briciole: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.corpo, fontSize: 13 },
  link: { color: colors.azzurro, fontFamily: fonts.corpoForte },
  titolo: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 32, lineHeight: 36, marginTop: 4, marginBottom: 8 },
  sottotitolo: { color: 'rgba(255,255,255,0.65)', fontFamily: fonts.corpo, fontSize: 16 },
  corpo: { flexGrow: 1, backgroundColor: colors.bianco, paddingHorizontal: 24, paddingVertical: 48 },
  navAlbum: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 24 },
  indietro: { color: colors.navy, fontFamily: fonts.corpoForte, fontSize: 16 },
  vaiA: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  vaiATesto: { color: '#64748B', fontFamily: fonts.corpo, fontSize: 13 },
  altri: { marginTop: 64, paddingTop: 40, borderTopWidth: 1, borderColor: '#F4F4F6' },
  altriTesta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  altriTitolo: { color: colors.navy, fontFamily: fonts.titoloMedio, fontSize: 22, lineHeight: 26 },
  vuoto: { color: '#aaaaaa', fontFamily: fonts.corpo, fontSize: 16, lineHeight: 27, textAlign: 'center', paddingVertical: 80 },
  nota: { fontSize: 12 },
  vuotoLink: { color: colors.azzurro },
});
