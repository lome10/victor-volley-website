// Pezzi della pagina Galleria del sito (galleria.html): scheda album, griglia di foto, visore a schermo intero.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Album, FotoAlbum } from '~/lib/dati';
import { copertina, didascalia, fotoIntera, giro, infoAlbum, miniatura } from '~/lib/galleria';
import { colors, fonts } from '~/lib/theme';

/** .album-card-pub: copertina 4:3, velo scuro, titolo e "data · N foto". */
export function SchedaAlbum({ album, larghezza, apri }: { album: Album; larghezza: number; apri: () => void }) {
  return (
    <Pressable style={[styles.album, { width: larghezza, height: (larghezza * 3) / 4 }]} onPress={apri} accessibilityRole="link" accessibilityLabel={'Apri album: ' + album.title}>
      <LinearGradient colors={['#053063', '#008CFD']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {album.photos[0] ? <Image source={copertina(album.photos[0].id)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      <LinearGradient colors={['rgba(3,12,28,0)', 'rgba(3,12,28,0.85)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.albumCorpo}>
        <Text style={styles.albumTitolo}>{album.title}</Text>
        <Text style={styles.albumInfo}>{infoAlbum(album)}</Text>
      </View>
    </Pressable>
  );
}

/** Schede album in colonne: una su telefono, poi quante ne stanno da 280 px (repeat(auto-fill, minmax(280px, 1fr))). */
export function GrigliaAlbum({ album, larghezza, apri }: { album: Album[]; larghezza: number; apri: (a: Album) => void }) {
  const colonne = Math.max(1, Math.floor((larghezza + 20) / 300));
  const misura = Math.floor((larghezza - 20 * (colonne - 1)) / colonne);
  return (
    <View style={styles.griglia}>
      {album.map((a, i) => (
        <SchedaAlbum key={a.id ?? i} album={a} larghezza={misura} apri={() => apri(a)} />
      ))}
    </View>
  );
}

/** .gallery-grid: miniature 4:3, 2 colonne su telefono e 4 sugli schermi larghi. */
export function GrigliaFoto({ foto, titolo, larghezza, apri }: { foto: FotoAlbum[]; titolo: string; larghezza: number; apri: (i: number) => void }) {
  const colonne = larghezza > 720 ? 4 : 2;
  const misura = Math.floor((larghezza - 8 * (colonne - 1)) / colonne);
  return (
    <View style={styles.grigliaFoto}>
      {foto.map((f, i) => (
        <Pressable
          key={f.id}
          style={[styles.miniatura, { width: misura, height: (misura * 3) / 4 }]}
          onPress={() => apri(i)}
          accessibilityRole="button"
          accessibilityLabel={titolo + ' — foto ' + (i + 1)}>
          <Image source={miniatura(f.id)} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={f.id} />
        </Pressable>
      ))}
    </View>
  );
}

/** La foto intera dentro lo spazio libero, senza deformarla (w e h vengono dall'API). */
function misuraFoto(f: FotoAlbum, larga: number, alta: number) {
  const r = f.w && f.h && f.w > 0 && f.h > 0 ? f.w / f.h : 4 / 3;
  return larga / r <= alta ? { width: larga, height: larga / r } : { width: alta * r, height: alta };
}

type Visore = {
  foto: FotoAlbum[];
  titolo: string;
  inizio: number | null;
  chiudi: () => void;
};

/** Il visore del sito (.lightbox): foto intera su fondo nero, "Titolo — 3 / 168", frecce, dito di lato, ✕. */
export function VisoreFoto({ foto, titolo, inizio, chiudi }: Visore) {
  return (
    <Modal visible={inizio != null} transparent animationType="fade" onRequestClose={chiudi} supportedOrientations={['portrait', 'landscape']}>
      {inizio != null ? <Contenuto key={inizio} foto={foto} titolo={titolo} inizio={inizio} chiudi={chiudi} /> : null}
    </Modal>
  );
}

function Contenuto({ foto, titolo, inizio, chiudi }: Visore & { inizio: number }) {
  const { width, height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const [indice, setIndice] = useState(inizio);
  const lista = useRef<FlatList<FotoAlbum>>(null);

  const vai = (passo: number) => {
    const n = giro(indice, passo, foto.length);
    setIndice(n);
    lista.current?.scrollToIndex({
      index: n,
      animated: Math.abs(n - indice) === 1,
    });
  };

  const altezzaFoto = height - 84 - top - bottom;
  // Frecce come .lightbox-nav del sito: 48 px, e 40 px sotto i 640 px di larghezza.
  const lato = width > 640 ? 48 : 40;
  const tondo = { width: lato, height: lato, borderRadius: lato / 2, top: height / 2 - lato / 2 };
  const segno = { fontSize: lato === 48 ? 24 : 20, lineHeight: lato === 48 ? 28 : 24 };
  return (
    <View style={styles.visore} accessibilityViewIsModal>
      <FlatList
        ref={lista}
        data={foto}
        keyExtractor={(f) => f.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={inizio}
        getItemLayout={(_, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
        onMomentumScrollEnd={(e) => setIndice(Math.round(e.nativeEvent.contentOffset.x / width))}
        windowSize={3}
        initialNumToRender={1}
        renderItem={({ item }) => (
          <Pressable style={[styles.pagina, { width, paddingTop: top }]} onPress={chiudi} accessibilityLabel="Chiudi">
            {/* Come il sito: chiude il tocco sul fondo scuro, non quello sulla foto. */}
            <View onStartShouldSetResponder={() => true} style={misuraFoto(item, width * 0.96, altezzaFoto)}>
              <Image source={fotoIntera(item.id)} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={titolo} />
            </View>
          </Pressable>
        )}
      />
      <Text style={[styles.didascalia, { bottom: 24 + bottom }]}>{didascalia(titolo, indice, foto.length)}</Text>
      {foto.length > 1 ? (
        <>
          <Pressable style={[styles.freccia, styles.sinistra, tondo]} onPress={() => vai(-1)} accessibilityRole="button" accessibilityLabel="Foto precedente">
            <Text style={[styles.frecciaTesto, segno]}>‹</Text>
          </Pressable>
          <Pressable style={[styles.freccia, styles.destra, tondo]} onPress={() => vai(1)} accessibilityRole="button" accessibilityLabel="Foto successiva">
            <Text style={[styles.frecciaTesto, segno]}>›</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable style={[styles.chiudi, { top: 12 + top }]} onPress={chiudi} accessibilityRole="button" accessibilityLabel="Chiudi" hitSlop={8}>
        <Text style={styles.chiudiTesto}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  griglia: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  album: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.navy,
    shadowColor: '#030c1c',
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  albumCorpo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 4,
  },
  albumTitolo: {
    color: colors.bianco,
    fontFamily: fonts.titolo,
    fontSize: 20,
    lineHeight: 24,
  },
  albumInfo: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.corpo,
    fontSize: 12,
  },
  grigliaFoto: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniatura: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#F4F4F6',
  },
  visore: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  pagina: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  didascalia: {
    position: 'absolute',
    left: 16,
    right: 16,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.corpo,
    fontSize: 13,
  },
  freccia: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinistra: { left: 6 },
  destra: { right: 6 },
  frecciaTesto: {
    color: colors.bianco,
    fontSize: 24,
    lineHeight: 28,
    marginTop: -3,
  },
  chiudi: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chiudiTesto: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 32,
    lineHeight: 36,
  },
});
