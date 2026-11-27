// Pezzi comuni delle sezioni della home del sito: .section, .section-heading, .btn.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts } from '~/lib/theme';

type SezioneProps = {
  sfondo?: string;
  titolo?: string;
  sottotitolo?: string;
  scuro?: boolean;
  centro?: boolean;
  /** Contenuto da bordo a bordo (es. carosello): il margine di 24 resta solo al titolo. */
  piena?: boolean;
  children: ReactNode;
  style?: ViewStyle;
};

/** .section (48 px sopra e sotto da telefono) con .section-heading. */
export function Sezione({ sfondo = colors.bianco, titolo, sottotitolo, scuro, centro, piena, children, style }: SezioneProps) {
  return (
    <View style={[styles.sezione, piena && styles.piena, { backgroundColor: sfondo }, style]}>
      {titolo ? (
        <View style={[styles.testa, piena && styles.testaPiena, centro && styles.centro]}>
          <Text style={[styles.titolo, scuro && styles.bianco, centro && styles.testoCentro]} accessibilityRole="header">
            {titolo}
          </Text>
          {sottotitolo ? <Text style={[styles.sottotitolo, scuro && styles.sottotitoloScuro, centro && styles.testoCentro]}>{sottotitolo}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

type TastoProps = { testo: string; onPress: () => void; tipo: 'pieno' | 'bordo' | 'bordoBianco' };

/** .btn--primary, .btn--outline, .btn--outline-white. */
export function Tasto({ testo, onPress, tipo }: TastoProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.tasto, styles[tipo], pressed && styles.premuto]}>
      <Text style={[styles.tastoTesto, tipo === 'bordo' ? styles.testoNavy : styles.bianco]}>{testo}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sezione: { paddingVertical: 48, paddingHorizontal: 24 },
  piena: { paddingHorizontal: 0 },
  testa: { marginBottom: 40 },
  testaPiena: { paddingHorizontal: 24 },
  centro: { alignItems: 'center' },
  testoCentro: { textAlign: 'center' },
  titolo: { fontFamily: fonts.titoloMedio, fontSize: 24, lineHeight: 29, color: colors.navy, marginBottom: 8 },
  sottotitolo: { fontFamily: fonts.corpo, fontSize: 16, lineHeight: 26, color: '#555' },
  sottotitoloScuro: { color: 'rgba(255,255,255,0.55)' },
  bianco: { color: colors.bianco },
  tasto: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 28, borderRadius: 3 },
  pieno: { backgroundColor: colors.azzurroScuro },
  bordo: { borderWidth: 2, borderColor: colors.navy },
  bordoBianco: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)' },
  premuto: { opacity: 0.8 },
  tastoTesto: { fontFamily: fonts.corpo, fontSize: 15 },
  testoNavy: { color: colors.navy },
});
