import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Piede } from '~/components/Piede';
import { SchedaNews } from '~/components/SchedaNews';
import { Stato } from '~/components/Stato';
import { usePubblico } from '~/lib/dati';
import { categorieDi, pagina } from '~/lib/news';
import { colors, fonts } from '~/lib/theme';

export default function News() {
  const { width } = useWindowDimensions();
  const { data, isPending, isError, refetch, isRefetching } = usePubblico();
  const [categoria, setCategoria] = useState<string | null>(null);
  const [numero, setNumero] = useState(0);
  const scorri = useRef<ComponentRef<typeof ScrollView>>(null);

  const articoli = data?.articoli ?? [];
  const { voci, totale, attuale } = pagina(articoli, categoria, numero);
  // Due colonne come il sito da telefono (tre sugli schermi larghi).
  const colonne = width > 640 ? 3 : 2;
  const larghezza = Math.floor((width - 48 - 8 * (colonne - 1)) / colonne);

  const inizioGriglia = useRef({ corpo: 0, griglia: 0 });
  const vaiPagina = (n: number) => {
    setNumero(n);
    scorri.current?.scrollTo({ y: inizioGriglia.current.corpo + inizioGriglia.current.griglia, animated: true });
  };

  const filtro = (nome: string | null, scritta: string) => {
    const attivo = categoria === nome;
    return (
      <Pressable
        key={scritta}
        style={[styles.filtro, attivo && styles.filtroAttivo]}
        onPress={() => {
          setCategoria(nome);
          setNumero(0);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: attivo }}>
        <Text style={[styles.filtroTesto, attivo && styles.filtroTestoAttivo]}>{scritta}</Text>
      </Pressable>
    );
  };

  return (
    <ScrollView
      ref={scorri}
      style={styles.pagina}
      contentContainerStyle={styles.tutto}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.bianco} />}>
      <View>
        <Image source={require('../../assets/images/sfondo.webp')} style={[StyleSheet.absoluteFill, styles.sfondo]} contentFit="cover" contentPosition="top" />
        <View style={styles.testata}>
          <Text style={styles.briciole}>
            <Text onPress={() => router.dismissTo('/')} accessibilityRole="link">Home</Text> / News
          </Text>
          <Text style={styles.titolo} accessibilityRole="header">News</Text>
          <Text style={styles.sottotitolo}>Comunicati, risultati e aggiornamenti</Text>
        </View>
        <View style={styles.corpo} onLayout={(e) => { inizioGriglia.current.corpo = e.nativeEvent.layout.y; }}>
          {isPending ? (
            <Stato />
          ) : isError && !data ? (
            <Stato titolo="Non riusciamo a caricare i contenuti" testo="Controlla la connessione e riprova." riprova={refetch} />
          ) : (
            <>
              <View style={styles.filtri}>
                {filtro(null, 'Tutte')}
                {categorieDi(articoli).map((c) => filtro(c, c))}
              </View>
              {voci.length ? (
                <View style={styles.griglia} onLayout={(e) => { inizioGriglia.current.griglia = e.nativeEvent.layout.y; }}>
                  {voci.map((a, i) => (
                    <SchedaNews key={a.id} articolo={a} indice={attuale * voci.length + i} larghezza={larghezza} apri={() => router.push(`/articolo/${a.id}`)} />
                  ))}
                </View>
              ) : (
                <Stato titolo="Nessun articolo pubblicato" testo="Torna a trovarci presto: le novità arriveranno qui." />
              )}
              {totale > 1 && (
                <View style={styles.pagine}>
                  <Pressable style={[styles.tasto, attuale === 0 && styles.spento]} disabled={attuale === 0} onPress={() => vaiPagina(attuale - 1)} accessibilityRole="button">
                    <Text style={styles.tastoTesto}>‹ Precedente</Text>
                  </Pressable>
                  <Text style={styles.conta}>Pag. {attuale + 1} / {totale}</Text>
                  <Pressable style={[styles.tasto, attuale >= totale - 1 && styles.spento]} disabled={attuale >= totale - 1} onPress={() => vaiPagina(attuale + 1)} accessibilityRole="button">
                    <Text style={styles.tastoTesto}>Successiva ›</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </View>
      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.notte },
  tutto: { flexGrow: 1, justifyContent: 'space-between' },
  sfondo: { opacity: 0.28 },
  testata: { padding: 24, paddingTop: 40 },
  briciole: { color: 'rgba(255,255,255,0.65)', fontFamily: fonts.corpo, fontSize: 13 },
  titolo: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 32, marginTop: 4 },
  sottotitolo: { color: 'rgba(255,255,255,0.8)', fontFamily: fonts.corpo, fontSize: 16, marginTop: 4 },
  corpo: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16 },
  filtri: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 },
  filtro: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.07)' },
  filtroAttivo: { backgroundColor: colors.azzurro, borderColor: colors.azzurro },
  filtroTesto: { color: 'rgba(255,255,255,0.72)', fontFamily: fonts.corpo, fontSize: 13 },
  filtroTestoAttivo: { color: colors.bianco },
  griglia: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pagine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 40 },
  tasto: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.08)' },
  spento: { opacity: 0.35 },
  tastoTesto: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.titoloMedio, fontSize: 14 },
  conta: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.corpo, fontSize: 14 },
});
