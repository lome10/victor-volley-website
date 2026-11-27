// Contatti: copia di contatti.html (js/pages/contatti-1.js, css/style.css).
import { usePathname } from 'expo-router';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, SvgXml } from 'react-native-svg';

import { Modulo } from '~/components/Modulo';
import { Piede } from '~/components/Piede';
import { TestaPagina } from '~/components/TestaPagina';
import { CAMPI_CONTATTI, datiContatti, inviaModulo } from '~/lib/moduli';
import { unisciti } from '~/lib/pagine';
import { EMAIL, social } from '~/lib/social';
import { colors, fonts } from '~/lib/theme';
import { vai } from '~/lib/vai';

const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const POSTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>';
const FB = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>';

// .social-btn--fb / --ig / --tt
const FONDO_SOCIAL: Record<string, string> = { Facebook: '#1877f2', TikTok: '#010101' };

function FondoInstagram() {
  return (
    <Svg width={40} height={40} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="ig" cx="12" cy="44" r="46" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#f09433" />
          <Stop offset="0.25" stopColor="#e6683c" />
          <Stop offset="0.5" stopColor="#dc2743" />
          <Stop offset="0.75" stopColor="#cc2366" />
          <Stop offset="1" stopColor="#bc1888" />
        </RadialGradient>
      </Defs>
      <Circle cx="20" cy="20" r="20" fill="url(#ig)" />
    </Svg>
  );
}

export default function Contatti() {
  const attuale = usePathname();
  const { width } = useWindowDimensions();
  const piccolo = width <= 768;
  const margine = piccolo ? 48 : 80;
  const scorri = useRef<ComponentRef<typeof ScrollView>>(null);
  const posModulo = useRef(0);
  const alModulo = () => scorri.current?.scrollTo({ y: Math.max(0, posModulo.current + margine - 16), animated: true });
  const h2 = { fontSize: piccolo ? 24 : 32, lineHeight: piccolo ? 29 : 38 };

  const voce = (icona: ReactNode, titolo: string, valore: ReactNode, magenta = false) => (
    <View style={styles.voce}>
      <View style={[styles.icona, magenta && styles.iconaMagenta]}>{icona}</View>
      <View style={styles.voceTesti}>
        <Text style={styles.voceTitolo}>{titolo}</Text>
        {valore}
      </View>
    </View>
  );

  return (
    <ScrollView ref={scorri} style={styles.pagina} contentContainerStyle={styles.tutto} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <TestaPagina briciola="Contatti" titolo="Contatti" sottotitolo="Siamo a Melissano (LE) — vienici a trovare" />

      <View style={[styles.sezione, { paddingVertical: margine }]}>
        <View style={[styles.contenitore, !piccolo && styles.dueColonne]}>
          <View style={!piccolo ? styles.colonna : styles.sopra}>
            <Text style={[styles.titolo, h2]} accessibilityRole="header">Come contattarci</Text>
            {voce(
              <SvgXml xml={PIN} width={20} height={20} color={colors.azzurro} />,
              'Palazzetto ARKÉ',
              <Text style={styles.valore}>Via Don Marino Manco{'\n'}Melissano (LE)</Text>,
            )}
            {voce(
              <SvgXml xml={POSTA} width={20} height={20} color={colors.azzurro} />,
              'Email',
              <Text style={[styles.valore, styles.link]} onPress={() => Linking.openURL('mailto:' + EMAIL)} accessibilityRole="link">{EMAIL}</Text>,
            )}
            {voce(
              <SvgXml xml={FB} width={18} height={18} color={colors.magenta} />,
              'Social',
              <View style={styles.social}>
                {social.map(({ nome, url, svg }) => (
                  <Pressable key={nome} style={[styles.tondo, FONDO_SOCIAL[nome] ? { backgroundColor: FONDO_SOCIAL[nome] } : null]} onPress={() => Linking.openURL(url)} hitSlop={2} accessibilityRole="link" accessibilityLabel={nome}>
                    {nome === 'Instagram' ? <FondoInstagram /> : null}
                    <SvgXml xml={svg} width={20} height={20} color={colors.bianco} />
                  </Pressable>
                ))}
              </View>,
              true,
            )}
            <Pressable style={styles.bottone} onPress={() => vai(unisciti.href, attuale)} accessibilityRole="button">
              <Text style={styles.bottoneTesto}>Vieni a giocare con noi</Text>
            </Pressable>
          </View>

          <View style={!piccolo && styles.colonna}>
            <Text style={[styles.titolo, h2]} accessibilityRole="header">Dove siamo</Text>
            {/* Qui va la mappa del Palazzetto ARKÉ: come mostrarla lo decide Lorenzo (VVW-41). */}
            <View style={styles.mappa} />
          </View>
        </View>
      </View>

      <View style={[styles.sezione, styles.grigia, { paddingVertical: margine }]} onLayout={(e) => { posModulo.current = e.nativeEvent.layout.y; }}>
        <View style={styles.testaModulo}>
          <Text style={[styles.titoloModulo, h2]} accessibilityRole="header">Mandaci un messaggio</Text>
          <Text style={styles.testoModulo}>Per informazioni generali, partnership o qualsiasi altra richiesta</Text>
        </View>
        <Modulo
          campi={CAMPI_CONTATTI}
          coppie={[['nome', 'email']]}
          testoInvio="Invia"
          ok={{ titolo: 'Messaggio inviato!', testo: 'Ti risponderemo al più presto.' }}
          compatto
          invia={(v) => inviaModulo(datiContatti(v))}
          mostra={alModulo}
          attuale={attuale}
        />
      </View>

      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bianco },
  tutto: { flexGrow: 1 },
  sezione: { paddingHorizontal: 24 },
  grigia: { backgroundColor: '#F4F4F6' },
  contenitore: { width: '100%', maxWidth: 1200, alignSelf: 'center' },
  dueColonne: { flexDirection: 'row', alignItems: 'flex-start', gap: 48 },
  colonna: { flex: 1 },
  sopra: { marginBottom: 48 },
  titolo: { fontFamily: fonts.titoloMedio, color: colors.navy, marginBottom: 28 },
  voce: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  icona: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,140,253,0.1)', alignItems: 'center', justifyContent: 'center' },
  iconaMagenta: { backgroundColor: 'rgba(203,33,104,0.1)' },
  voceTesti: { flex: 1 },
  voceTitolo: { fontFamily: fonts.titoloMedio, fontSize: 14, color: colors.navy, marginBottom: 4 },
  valore: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 22, color: '#666' },
  link: { color: colors.azzurro },
  social: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 4 },
  tondo: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bottone: { alignSelf: 'flex-start', marginTop: 8, minHeight: 44, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 3, backgroundColor: colors.azzurroScuro },
  bottoneTesto: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.bianco },
  mappa: { width: '100%', height: 380, borderRadius: 12, backgroundColor: '#F4F4F6' },
  testaModulo: { width: '100%', maxWidth: 640, alignSelf: 'center', marginBottom: 36 },
  titoloModulo: { fontFamily: fonts.titoloMedio, color: colors.navy, marginBottom: 8, textAlign: 'center' },
  testoModulo: { fontFamily: fonts.corpo, fontSize: 16, lineHeight: 26, color: '#555', textAlign: 'center' },
});
