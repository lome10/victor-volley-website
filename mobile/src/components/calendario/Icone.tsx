// Icone della pagina Calendario del sito (PIN_ICON e CAL_ICON di js/pages/calendario-1.js).
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { fonts } from '~/lib/theme';

const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 13v5M9.5 15.5h5"/></svg>';

export const IconaLuogo = ({ colore, misura = 11 }: { colore: string; misura?: number }) => <SvgXml xml={PIN} width={misura} height={misura} color={colore} />;
export const IconaCalendario = ({ colore, misura = 14 }: { colore: string; misura?: number }) => <SvgXml xml={CAL} width={misura} height={misura} color={colore} />;

/** Logo su riquadro bianco, oppure l'iniziale (come .fixture-team-logo / .gp-logo / .stand-logo). */
export function Logo({ url, nome, misura, raggio, margine = 2, carattere }: { url: string; nome: string; misura: number; raggio: number; margine?: number; carattere: number }) {
  if (url) {
    return (
      <View style={[styles.bianco, { width: misura, height: misura, borderRadius: raggio, padding: margine }]}>
        <Image source={{ uri: url }} style={styles.pieno} contentFit="contain" accessibilityIgnoresInvertColors />
      </View>
    );
  }
  return (
    <View style={[styles.vuoto, { width: misura, height: misura, borderRadius: raggio }]}>
      <Text style={[styles.iniziale, { fontSize: carattere }]}>{(nome || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bianco: { backgroundColor: 'rgba(255,255,255,0.92)', flexShrink: 0 },
  pieno: { width: '100%', height: '100%' },
  vuoto: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iniziale: { fontFamily: fonts.titoloForte, color: 'rgba(255,255,255,0.55)' },
});
