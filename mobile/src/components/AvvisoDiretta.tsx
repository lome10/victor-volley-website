// Avviso "In diretta" del sito (js/live-banner.js): in basso, quando oggi c'e' una partita con codice Set Point Pulse
// e siamo da 1 ora e mezza prima dell'inizio a 4 ore dopo (tutto il giorno se manca l'orario).
// Sul sito lo caricano solo home, calendario, news e squadre.
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useDatiBot } from '~/lib/chiedi';
import { usePubblico, type Partita } from '~/lib/dati';
import { colors, fonts } from '~/lib/theme';

export const SOPRA_TASTO = 12 + 58 + 12;
export const PAGINE_AVVISO = ['/', '/calendario', '/news', '/squadre'];

const due = (n: number) => (n < 10 ? '0' : '') + n;
const oggiLocale = (d: Date) => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());

export function inFinestra(p: Partita, adesso: Date) {
  const m = /^(\d{1,2}):(\d{2})/.exec(p.ora || '');
  if (!m) return true;
  const inizio = new Date(p.data + 'T' + due(Number(m[1])) + ':' + m[2] + ':00').getTime();
  if (isNaN(inizio)) return true;
  const t = adesso.getTime();
  return t >= inizio - 90 * 60000 && t <= inizio + 4 * 3600000;
}

/** La prima partita in diretta adesso, come findLive() del sito. */
export function partitaInDiretta(partite: Partita[], adesso: Date) {
  const oggi = oggiLocale(adesso);
  return (
    (partite ?? []).find(
      (p) =>
        p.stato !== 'conclusa' &&
        !!p.sppCode &&
        p.data === oggi &&
        inFinestra(p, adesso) &&
        !!p.squadraCasa &&
        !!p.squadraOspite &&
        p.squadraCasa !== 'undefined' &&
        p.squadraOspite !== 'undefined',
    ) ?? null
  );
}

// Chiusi con la X: valgono finche' l'app resta aperta (sul sito finche' resta aperta la scheda).
const chiusi = new Set<string>();

function Pallino() {
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let vivo = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((ridotto) => {
      if (!vivo || ridotto) return;
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(o, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(o, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      anim.start();
    });
    return () => {
      vivo = false;
      anim?.stop();
    };
  }, [o]);
  return <Animated.View style={[styles.pallino, { opacity: o }]} />;
}

/** La partita dell'avviso, se l'avviso e' a schermo in questa pagina (null se no). La usa anche "Chiedi a Victor". */
export function useAvvisoDiretta() {
  const pagina = usePathname();
  const { data } = usePubblico();
  const [adesso, setAdesso] = useState(() => new Date());
  // Ricontrolla ogni minuto: la finestra si apre e si chiude da sola.
  useEffect(() => {
    const t = setInterval(() => setAdesso(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!data || !PAGINE_AVVISO.includes(pagina)) return null;
  const p = partitaInDiretta(data.partite, adesso);
  return p && !chiusi.has(p.id) ? p : null;
}

export function AvvisoDiretta() {
  const { bottom } = useSafeAreaInsets();
  // Se c'e' il tasto "Chiedi a Victor" (alto 58, a 12 dal fondo) l'avviso sta sopra, cosi' si vedono tutti e due (scelta di Lorenzo, 27/11).
  const conTasto = !!useDatiBot().data;
  const [, aggiorna] = useState(0);
  const p = useAvvisoDiretta();
  if (!p) return null;
  return (
    <View style={[styles.avviso, { bottom: (conTasto ? SOPRA_TASTO : 16) + bottom }]} accessibilityRole="summary" accessibilityLabel="Partita in diretta">
      <Pressable style={styles.link} onPress={() => router.push('/diretta')} accessibilityRole="link" accessibilityLabel={`In diretta: ${p.squadraCasa} – ${p.squadraOspite}. Guarda`}>
        <Pallino />
        <View style={styles.testi}>
          <Text style={styles.titolo}>In diretta</Text>
          <Text style={styles.partita} numberOfLines={1}>
            {p.squadraCasa} – {p.squadraOspite}
          </Text>
        </View>
        <Text style={styles.guarda}>Guarda →</Text>
      </Pressable>
      <Pressable
        style={styles.chiudi}
        onPress={() => {
          chiusi.add(p.id);
          aggiorna((n) => n + 1);
        }}
        accessibilityRole="button"
        accessibilityLabel="Chiudi avviso">
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2.4} strokeLinecap="round">
          <Path d="M5 5l14 14M19 5L5 19" />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  avviso: { position: 'absolute', left: 16, right: 16, zIndex: 250, flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#0b1b33', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderLeftWidth: 4, borderLeftColor: '#ff4d4d', borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  link: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 14, paddingRight: 6 },
  pallino: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff4d4d' },
  testi: { flex: 1, minWidth: 0 },
  titolo: { fontFamily: fonts.titolo, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: '#ff6b6b' },
  partita: { fontFamily: fonts.corpoForte, fontSize: 13, lineHeight: 17, color: colors.bianco },
  guarda: { fontFamily: fonts.corpoForte, fontSize: 12.5, color: colors.azzurro },
  chiudi: { width: 44, alignItems: 'center', justifyContent: 'center' },
});
