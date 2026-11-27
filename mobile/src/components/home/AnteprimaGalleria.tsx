// "Galleria foto" della home del sito (js/pages/index-3.js): mosaico di 7 foto dell'album piu' recente.
// Da telefono il sito usa 2 colonne e righe da 120 px (style.css, max-width 768px).
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Sezione, Tasto } from '~/components/home/Sezione';
import type { Album } from '~/lib/dati';

const CLOUD = 'plbxnqlc';
export const MAX = 7;
const RIGA = 120;
const SPAZIO = 8;

// Forma di ogni tessera: colonne x righe e ritaglio chiesto a Cloudinary (come FORME del sito).
const FORME = [
  { c: 2, r: 2, w: 900, h: 900 },
  { c: 1, r: 2, w: 450, h: 900 },
  { c: 1, r: 1, w: 450, h: 450 },
  { c: 1, r: 1, w: 450, h: 450 },
  { c: 2, r: 1, w: 900, h: 450 },
  { c: 1, r: 1, w: 450, h: 450 },
  { c: 1, r: 1, w: 450, h: 450 },
];
const QUADRATA = { c: 1, r: 1, w: 450, h: 450 };

/** Indici ben distribuiti nell'album (primo, meta', terzi...), come spread() del sito. */
export function sparse(n: number, quante: number) {
  const out: number[] = [];
  const visti = new Set<number>();
  for (let k = 1; out.length < quante && k <= n; k++) {
    for (let i = 0; i < k && out.length < quante; i++) {
      const idx = Math.floor((i * n) / k);
      if (!visti.has(idx)) {
        visti.add(idx);
        out.push(idx);
      }
    }
  }
  return out;
}

/** Come PhotoDB.sized del sito. */
export const fotoTagliata = (id: string, w: number, h: number) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,g_auto,w_${w},h_${h},f_auto,q_auto/${encodeURI(id)}`;

const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
/** "2026-11-15" -> "15 nov 2026" (come toLocaleDateString it-IT corto, senza Intl). */
export function dataBreve(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m || !MESI_BREVI[Number(m[2]) - 1]) return '';
  return Number(m[3]) + ' ' + MESI_BREVI[Number(m[2]) - 1] + ' ' + m[1];
}

/**
 * Posizioni del mosaico in una griglia a 2 colonne (CSS grid con "auto-placement"):
 * grande 2x2, alta 1x2 a sinistra con due quadrate a destra, larga 2x1, due quadrate.
 */
export function mosaico(quante: number) {
  if (quante !== MAX) return Array.from({ length: quante }, (_, i) => ({ ...QUADRATA, col: i % 2, riga: Math.floor(i / 2) }));
  const posti = [
    [0, 0],
    [0, 2],
    [1, 2],
    [1, 3],
    [0, 4],
    [0, 5],
    [1, 5],
  ];
  return FORME.map((f, i) => ({ ...f, col: posti[i][0], riga: posti[i][1] }));
}

export function AnteprimaGalleria({ album }: { album: Album[] }) {
  const { width } = useWindowDimensions();
  const primo = album.find((a) => a.photos.length);
  if (!primo) return null;
  const scelte = sparse(primo.photos.length, MAX).map((i) => primo.photos[i]);
  const tessere = mosaico(scelte.length);
  const colonna = (width - 48 - SPAZIO) / 2;
  const righe = tessere.reduce((m, t) => Math.max(m, t.riga + t.r), 0);
  const apri = () => router.push({ pathname: '/galleria', params: { album: primo.slug } });
  const sottotitolo = [primo.date ? dataBreve(primo.date) : '', primo.photos.length + ' foto'].filter(Boolean).join(' · ');

  return (
    <Sezione sfondo="#F4F4F6" titolo={primo.title || 'Galleria foto'} sottotitolo={sottotitolo}>
      <View style={[styles.griglia, { height: righe * RIGA + (righe - 1) * SPAZIO }]}>
        {scelte.map((f, i) => {
          const t = tessere[i];
          return (
            <Pressable
              key={f.id + i}
              onPress={apri}
              accessibilityRole="link"
              accessibilityLabel={'Apri album: ' + primo.title}
              style={[
                styles.tessera,
                {
                  left: t.col * (colonna + SPAZIO),
                  top: t.riga * (RIGA + SPAZIO),
                  width: t.c * colonna + (t.c - 1) * SPAZIO,
                  height: t.r * RIGA + (t.r - 1) * SPAZIO,
                },
              ]}>
              <Image source={fotoTagliata(f.id, t.w, t.h)} style={StyleSheet.absoluteFill} contentFit="cover" />
            </Pressable>
          );
        })}
      </View>
      <Tasto testo="Vedi l'album completo" tipo="bordo" onPress={apri} />
    </Sezione>
  );
}

const styles = StyleSheet.create({
  griglia: { marginBottom: 28 },
  tessera: { position: 'absolute', borderRadius: 10, overflow: 'hidden', backgroundColor: '#F4F4F6' },
});
