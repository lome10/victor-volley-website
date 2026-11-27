// La pagina Privacy del sito (privacy.html, .legal in css/style.css, js/pages/privacy-1.js).
// Il testo e' in ~/lib/privacy-testo, copiato dal sito parola per parola: le parti che nell'app non hanno senso
// (cookie del browser, mappa, tasto Revoca) restano come sul sito fino alla decisione di Lorenzo (VVW-42).
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Piede } from '~/components/Piede';
import { BLOCCHI, REVOCATO, TESTATA, type Blocco, type Pezzo } from '~/lib/privacy-testo';
import { colors, fonts } from '~/lib/theme';

const TESTO = '#333333';
const GRIGIO = '#f4f6fa';

function Pezzi({ pezzi }: { pezzi: Pezzo[] }) {
  return (
    <>
      {pezzi.map((p, i) => {
        const stile = [p.b && styles.grassetto, p.i && styles.corsivo, p.code && styles.codice, p.href && styles.link];
        const href = p.href;
        return (
          <Text key={i} style={stile} onPress={href ? () => void Linking.openURL(href) : undefined} accessibilityRole={href ? 'link' : undefined}>
            {p.t}
          </Text>
        );
      })}
    </>
  );
}

function Tabella({ testa, righe }: { testa: Pezzo[][]; righe: Pezzo[][][] }) {
  // Come .legal-table-wrap: su schermi stretti la tabella scorre di lato.
  const larghezze = testa.length === 3 ? [150, 260, 150] : [190, 340];
  return (
    <ScrollView horizontal style={styles.tabellaScorre}>
      <View>
        <View style={[styles.riga, styles.rigaTesta]}>
          {testa.map((c, i) => (
            <Text key={i} style={[styles.cella, styles.cellaTesta, { width: larghezze[i] }]}>
              <Pezzi pezzi={c} />
            </Text>
          ))}
        </View>
        {righe.map((r, j) => (
          <View key={j} style={styles.riga}>
            {r.map((c, i) => (
              <Text key={i} style={[styles.cella, { width: larghezze[i] }]}>
                <Pezzi pezzi={c} />
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Revoca({ testo }: { testo: string }) {
  // Sul sito toglie la scelta "Carica sempre" della mappa; nell'app non c'e' una scelta da togliere:
  // per ora mostra solo il messaggio del sito (Dino 27/11, VVW-42).
  const [fatto, setFatto] = useState(false);
  return (
    <View style={styles.revoca}>
      <Pressable style={({ pressed }) => [styles.tasto, pressed && styles.tastoPremuto]} onPress={() => setFatto(true)} accessibilityRole="button">
        <Text style={styles.tastoTesto}>{testo}</Text>
      </Pressable>
      {fatto ? (
        <Text style={styles.revocato} accessibilityLiveRegion="polite">
          {REVOCATO}
        </Text>
      ) : null}
    </View>
  );
}

function Parte({ b }: { b: Blocco }) {
  switch (b.tipo) {
    case 'aggiornato':
    case 'h2':
    case 'h3':
    case 'p':
      return (
        <Text style={styles[b.tipo]} accessibilityRole={b.tipo === 'h2' || b.tipo === 'h3' ? 'header' : undefined}>
          <Pezzi pezzi={b.testo} />
        </Text>
      );
    case 'riquadro':
      return (
        <View style={styles.riquadro}>
          <Text style={styles.testo}>
            <Pezzi pezzi={b.testo} />
          </Text>
        </View>
      );
    case 'ul':
      return (
        <View style={styles.elenco}>
          {b.voci.map((v, i) => (
            <View key={i} style={styles.voce}>
              <Text style={[styles.testo, styles.voceTesto]}>
                <Pezzi pezzi={v} />
              </Text>
            </View>
          ))}
        </View>
      );
    case 'tabella':
      return <Tabella testa={b.testa} righe={b.righe} />;
    case 'tasto':
      return <Revoca testo={b.testo} />;
  }
}

export default function Privacy() {
  return (
    <ScrollView style={styles.pagina} contentContainerStyle={styles.tutto}>
      <View style={styles.testata}>
        <Text style={styles.briciole}>
          <Text onPress={() => router.dismissTo('/')} accessibilityRole="link">
            Home
          </Text>
          {' / ' + TESTATA.briciola}
        </Text>
        <Text style={styles.titolo} accessibilityRole="header">
          {TESTATA.titolo}
        </Text>
        <Text style={styles.sottotitolo}>{TESTATA.sottotitolo}</Text>
      </View>

      <View style={styles.corpo}>
        {BLOCCHI.map((b, i) => (
          <Parte key={i} b={b} />
        ))}
      </View>

      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bianco },
  tutto: { flexGrow: 1, justifyContent: 'space-between' },
  // .page-header: navy, 48/40 px, briciole 13 px al 50%.
  testata: { backgroundColor: colors.navy, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },
  briciole: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.corpo, fontSize: 13 },
  titolo: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 32, lineHeight: 36, marginTop: 4, marginBottom: 8 },
  sottotitolo: { color: 'rgba(255,255,255,0.65)', fontFamily: fonts.corpo, fontSize: 16 },
  // .section (48 px su telefono) e .legal (max 760 px, 15 px, interlinea 1,7, #333).
  corpo: { paddingHorizontal: 24, paddingVertical: 48, width: '100%', maxWidth: 808, alignSelf: 'center' },
  testo: { color: TESTO, fontFamily: fonts.corpo, fontSize: 15, lineHeight: 25.5 },
  p: { color: TESTO, fontFamily: fonts.corpo, fontSize: 15, lineHeight: 25.5, marginBottom: 14 },
  aggiornato: { color: '#777777', fontFamily: fonts.corpo, fontSize: 13, lineHeight: 22, marginBottom: 24 },
  // h2/h3 del sito: Barlow 600 navy (.legal h2 22 px, h3 17 px).
  h2: { color: colors.navy, fontFamily: fonts.titoloMedio, fontSize: 22, lineHeight: 26.4, marginTop: 40, marginBottom: 12 },
  h3: { color: colors.navy, fontFamily: fonts.titoloMedio, fontSize: 17, lineHeight: 22, marginTop: 24, marginBottom: 8 },
  grassetto: { fontFamily: fonts.corpoForte },
  corsivo: { fontStyle: 'italic' },
  codice: { fontFamily: 'monospace', fontSize: 14 },
  link: { color: colors.azzurro, textDecorationLine: 'underline' },
  // Il sito toglie i puntini a tutti gli elenchi (ul { list-style: none }): resta solo il rientro di 22 px.
  elenco: { marginBottom: 14, paddingLeft: 22 },
  voce: { flexDirection: 'row', marginBottom: 6 },
  voceTesto: { flex: 1 },
  riquadro: { backgroundColor: GRIGIO, borderLeftWidth: 4, borderLeftColor: colors.azzurro, borderRadius: 6, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 18 },
  tabellaScorre: { marginBottom: 18, flexGrow: 0 },
  riga: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e3e3ea' },
  rigaTesta: { backgroundColor: GRIGIO },
  cella: { color: TESTO, fontFamily: fonts.corpo, fontSize: 14, lineHeight: 23.8, paddingVertical: 10, paddingHorizontal: 12 },
  cellaTesta: { color: colors.navy, fontFamily: fonts.corpoForte },
  revoca: { marginBottom: 14, alignItems: 'flex-start' },
  // .btn.btn--outline: bordo navy 2 px, Manrope 15 (500 sul sito, 600 il piu' vicino caricato), angoli 3 px.
  tasto: { borderWidth: 2, borderColor: colors.navy, borderRadius: 3, paddingVertical: 12, paddingHorizontal: 28 },
  tastoPremuto: { backgroundColor: 'rgba(5,48,99,0.05)' },
  tastoTesto: { color: colors.navy, fontFamily: fonts.corpoMedio, fontSize: 15 },
  revocato: { color: TESTO, fontFamily: fonts.corpo, fontSize: 14, marginTop: 8 },
});
