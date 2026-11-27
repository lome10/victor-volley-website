// Vieni a giocare con noi: copia di unisciti-a-noi.html (js/pages/unisciti-a-noi-1.js, css/style.css).
import { usePathname } from 'expo-router';
import { useRef, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Modulo } from '~/components/Modulo';
import { Piede } from '~/components/Piede';
import { TestaPagina } from '~/components/TestaPagina';
import { CAMPI_UNISCITI, datiUnisciti, inviaModulo } from '~/lib/moduli';
import { unisciti } from '~/lib/pagine';
import { colors, fonts } from '~/lib/theme';

const PUNTI = [
  { icona: '🏈', titolo: 'Cinque categorie', testo: 'Da Minivolley (5 anni) fino alla Prima Divisione senior' },
  { icona: '🏗', titolo: 'Palazzetto moderno', testo: 'Palazzetto ARKÉ — Via Don Marino Manco, Melissano (LE)' },
  { icona: '💉', titolo: 'Prima prova gratuita', testo: 'Vieni a provare un allenamento senza impegno' },
];

export default function UniscitiANoi() {
  const attuale = usePathname();
  const { width } = useWindowDimensions();
  const piccolo = width <= 768;
  const scorri = useRef<ComponentRef<typeof ScrollView>>(null);
  // Posizione del modulo nella pagina: sezione + margine alto + posizione nella colonna.
  const pos = useRef({ sezione: 0, modulo: 0 });
  const margine = piccolo ? 48 : 80;
  const alModulo = () => scorri.current?.scrollTo({ y: Math.max(0, pos.current.sezione + margine + pos.current.modulo - 16), animated: true });

  return (
    <ScrollView ref={scorri} style={styles.pagina} contentContainerStyle={styles.tutto} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <TestaPagina briciola="Vieni a giocare con noi" titolo={unisciti.titolo} sottotitolo={unisciti.sottotitolo} />

      <View style={[styles.sezione, { paddingVertical: margine }]} onLayout={(e) => { pos.current.sezione = e.nativeEvent.layout.y; }}>
        <View style={[styles.contenitore, !piccolo && styles.dueColonne]}>
          <View style={!piccolo ? styles.sinistra : styles.sopra}>
            <Text style={[styles.titolo, { fontSize: piccolo ? 24 : 32, lineHeight: piccolo ? 29 : 38 }]} accessibilityRole="header">Perché Victor Volley?</Text>
            <Text style={styles.lead}>
              Siamo una società sportiva dilettantistica nata nel 2019 a Melissano. Il nostro obiettivo è offrire a bambini, ragazzi e adulti la possibilità di praticare la pallavolo in un ambiente sereno, inclusivo e stimolante.
            </Text>
            <View style={styles.punti}>
              {PUNTI.map((p) => (
                <View key={p.titolo} style={styles.punto}>
                  <View style={styles.puntoIcona}><Text style={styles.puntoEmoji} importantForAccessibility="no">{p.icona}</Text></View>
                  <View style={styles.puntoTesti}>
                    <Text style={styles.puntoTitolo}>{p.titolo}</Text>
                    <Text style={styles.puntoTesto}>{p.testo}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.nota}>
              <Text style={styles.notaTesto}>
                <Text style={styles.notaForte}>Questo non è un modulo di tesseramento ufficiale.</Text>
                {'\n'}È un semplice messaggio di contatto per conoscerci. Ti ricontattiamo noi per fissare una prova o darti informazioni sulle categorie.
              </Text>
            </View>
          </View>

          <View style={!piccolo && styles.destra} onLayout={(e) => { pos.current.modulo = e.nativeEvent.layout.y; }}>
            <Modulo
              campi={CAMPI_UNISCITI}
              coppie={[['nome', 'cognome'], ['email', 'telefono']]}
              testoInvio="Invia il messaggio"
              ok={{ titolo: 'Messaggio inviato!', testo: 'Ti contatteremo presto. Grazie per il tuo interesse!' }}
              invia={(v) => inviaModulo(datiUnisciti(v))}
              mostra={alModulo}
              attuale={attuale}
            />
          </View>
        </View>
      </View>

      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bianco },
  tutto: { flexGrow: 1 },
  sezione: { paddingHorizontal: 24 },
  contenitore: { width: '100%', maxWidth: 1200, alignSelf: 'center' },
  dueColonne: { flexDirection: 'row', alignItems: 'flex-start', gap: 64 },
  sinistra: { flex: 1 },
  destra: { flex: 1.6 },
  sopra: { marginBottom: 40 },
  titolo: { fontFamily: fonts.titoloMedio, color: colors.navy, marginBottom: 16 },
  lead: { fontFamily: fonts.corpo, fontSize: 16, lineHeight: 26, color: '#555', marginBottom: 24 },
  punti: { gap: 16, marginBottom: 32 },
  punto: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  puntoIcona: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,140,253,0.1)', alignItems: 'center', justifyContent: 'center' },
  puntoEmoji: { fontSize: 16 },
  puntoTesti: { flex: 1 },
  puntoTitolo: { fontFamily: fonts.corpoForte, fontSize: 16, lineHeight: 24, color: colors.navy, marginBottom: 2 },
  puntoTesto: { fontFamily: fonts.corpo, fontSize: 12, lineHeight: 19, color: '#888' },
  nota: {
    backgroundColor: '#F4F4F6', borderRadius: 12, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  notaTesto: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 21, color: '#666' },
  notaForte: { fontFamily: fonts.corpoForte },
});
