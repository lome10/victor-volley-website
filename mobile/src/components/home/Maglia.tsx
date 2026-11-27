// "Nuova maglia" della home del sito (js/pages/index-4.js, style.css .maglia-*), versione da telefono.
// Con il video: sottotitolo sopra (il titolo da telefono e' nascosto) e video YouTube muto in loop, con il tasto audio.
// Senza video: maglia stilizzata, "In arrivo" e conto alla rovescia (giorni, ore, minuti, secondi).
// Nascosto se la maglia e' spenta dall'admin.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WebView } from 'react-native-webview';

import type { Maglia as DatiMaglia } from '~/lib/dati';
import { colors, fonts } from '~/lib/theme';

/** ID del video da un link YouTube (watch?v=, youtu.be, embed, shorts, live) o dall'ID stesso, come youtubeId() del sito. */
export function youtubeId(url: string) {
  const s = String(url || '').trim();
  if (!s) return '';
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : '';
}

/** Giorni, ore, minuti e secondi alla data del reveal (tutti "00" quando e' passata); null se la data non vale. */
export function mancano(revealDate: string, adesso: number) {
  const target = new Date(revealDate).getTime();
  if (isNaN(target)) return null;
  const diff = target - adesso;
  const due = (n: number) => String(n).padStart(2, '0');
  if (diff <= 0) return { giorni: '00', ore: '00', minuti: '00', secondi: '00', finito: true };
  const s = Math.floor(diff / 1000);
  return { giorni: due(Math.floor(s / 86400)), ore: due(Math.floor((s % 86400) / 3600)), minuti: due(Math.floor((s % 3600) / 60)), secondi: due(s % 60), finito: false };
}

const ORIGINE = 'https://www.victorvolley.it';

/** Pagina per la WebView: lo stesso player del sito (youtube-nocookie, muto, in loop, senza controlli) che riempie il riquadro. */
export function paginaVideo(id: string, muto: boolean) {
  const q =
    'autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(ORIGINE) +
    (muto ? '&mute=1&loop=1&playlist=' + id + '&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&cc_load_policy=0' : '');
  // Da muto l'iframe e' piu' alto del riquadro e spostato in su: la fascia col titolo di YouTube resta fuori (come il sito).
  const stile = muto
    ? 'iframe{position:absolute;left:50%;top:-48px;width:calc((100vh + 48px) * 1.7778);height:calc(100vh + 48px);transform:translateX(-50%);pointer-events:none}'
    : 'iframe{position:absolute;inset:0;width:100%;height:100%}';
  return (
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}iframe{border:0}' + stile + '</style></head><body>' +
    '<iframe id="v" src="https://www.youtube-nocookie.com/embed/' + id + '?' + q + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>' +
    '<script>function cmd(f){var v=document.getElementById("v");v&&v.contentWindow&&v.contentWindow.postMessage(JSON.stringify({event:"command",func:f,args:""}),"*")}</script>' +
    '</body></html>'
  );
}

function Video({ id, titolo }: { id: string; titolo: string }) {
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const [ridotto, setRidotto] = useState<boolean | null>(null);
  const [avviato, setAvviato] = useState(false);
  const [muto, setMuto] = useState(true);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setRidotto);
  }, []);
  const copertina = <Image source={`https://i.ytimg.com/vi/${id}/sddefault.jpg`} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />;

  // Nel browser (export web) la WebView non c'e': resta la copertina. Con "riduci movimento" il video non parte da solo:
  // copertina con il tasto play, e al tocco parte con l'audio e i controlli di YouTube (come il sito).
  if (Platform.OS === 'web' || ridotto === null || (ridotto && !avviato)) {
    return (
      <Pressable style={styles.video} onPress={() => setAvviato(true)} disabled={Platform.OS === 'web' || !ridotto} accessibilityRole="button" accessibilityLabel={'Guarda il video: ' + titolo}>
        {copertina}
        {ridotto ? (
          <View style={styles.play}>
            <Svg width={30} height={30} viewBox="0 0 24 24">
              <Path fill={colors.bianco} d="M8 5v14l11-7z" />
            </Svg>
          </View>
        ) : null}
      </Pressable>
    );
  }
  const sfondo = !ridotto;
  return (
    <View style={styles.video}>
      {copertina}
      <WebView
        ref={web}
        source={{ html: paginaVideo(id, sfondo), baseUrl: ORIGINE }}
        style={styles.web}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={!sfondo}
        scrollEnabled={false}
        pointerEvents={sfondo ? 'none' : 'auto'}
        accessibilityLabel={titolo}
      />
      {sfondo ? (
        <Pressable
          style={[styles.audio, !muto && styles.audioAcceso]}
          onPress={() => {
            web.current?.injectJavaScript(`cmd(${muto ? '"unMute"' : '"mute"'});true;`);
            setMuto(!muto);
          }}
          accessibilityRole="button"
          accessibilityState={{ checked: !muto }}
          accessibilityLabel={muto ? "Attiva l'audio" : "Disattiva l'audio"}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            {muto ? (
              <Path fill={colors.bianco} d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.4-2.4-1.4-1.4L15.2 10.6 12.8 8.2l-1.4 1.4 2.4 2.4-2.4 2.4 1.4 1.4 2.4-2.4 2.4 2.4 1.4-1.4L16.6 12z" />
            ) : (
              <Path fill={colors.bianco} d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
            )}
          </Svg>
        </Pressable>
      ) : null}
    </View>
  );
}

function ContoMaglia({ revealDate }: { revealDate: string }) {
  const [adesso, setAdesso] = useState(() => Date.now());
  const c = mancano(revealDate, adesso);
  const finito = !c || c.finito;
  useEffect(() => {
    if (finito) return;
    const t = setInterval(() => setAdesso(Date.now()), 1000);
    return () => clearInterval(t);
  }, [finito]);
  if (!c) return null;
  const voci: [string, string][] = [
    [c.giorni, 'Giorni'],
    [c.ore, 'Ore'],
    [c.minuti, 'Min'],
    [c.secondi, 'Sec'],
  ];
  return (
    <View style={styles.conto} accessibilityRole="timer" accessibilityLabel="Conto alla rovescia al reveal della maglia">
      {voci.map(([n, etichetta], i) => (
        <View key={etichetta} style={styles.contoRiga}>
          {i > 0 ? <Text style={styles.sep}>:</Text> : null}
          <View style={[styles.casella, c.finito && styles.casellaFinita]}>
            <Text style={styles.num}>{n}</Text>
            <Text style={styles.etichetta}>{etichetta}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function Maglia({ maglia }: { maglia: DatiMaglia }) {
  const { width } = useWindowDimensions();
  if (!maglia?.enabled) return null;
  const id = youtubeId(maglia.videoUrl);
  if (id) {
    return (
      <LinearGradient colors={['#0F172A', colors.navy]} start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }} style={styles.sezioneVideo}>
        {/* Da telefono il titolo non si vede (resta per chi usa il lettore di schermo). */}
        <Text style={styles.nascosto} accessibilityRole="header">
          {maglia.title}
        </Text>
        {maglia.subtitle ? <Text style={styles.sottotitoloVideo}>{maglia.subtitle}</Text> : null}
        <View style={{ width, height: (width * 9) / 16 }}>
          <Video id={id} titolo={maglia.title || 'Presentazione maglia'} />
        </View>
      </LinearGradient>
    );
  }
  return (
    <LinearGradient colors={['#0F172A', colors.navy]} start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }} style={styles.sezione}>
      <LinearGradient colors={['rgba(0,140,253,0.30)', 'rgba(203,33,104,0.10)', 'transparent']} style={styles.bagliore} pointerEvents="none" />
      <Svg width={100} height={100} viewBox="0 0 120 120" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" style={styles.sagoma}>
        <Path d="M40 8 L20 20 L8 40 L22 50 L28 42 L28 108 L92 108 L92 42 L98 50 L112 40 L100 20 L80 8 Q60 22 40 8 Z" />
      </Svg>
      {maglia.title ? (
        <Text style={styles.titolo} accessibilityRole="header">
          {maglia.title}
        </Text>
      ) : null}
      {maglia.subtitle ? <Text style={styles.sottotitolo}>{maglia.subtitle}</Text> : null}
      <View style={styles.badge}>
        <View style={styles.puntino} />
        <Text style={styles.badgeTesto}>In arrivo</Text>
      </View>
      <ContoMaglia revealDate={maglia.revealDate} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  sezione: { paddingVertical: 56, paddingHorizontal: 24, alignItems: 'center', overflow: 'hidden' },
  sezioneVideo: { paddingTop: 28 },
  bagliore: { position: 'absolute', alignSelf: 'center', top: 30, width: 240, height: 240, borderRadius: 120 },
  sagoma: { marginBottom: 24 },
  titolo: { fontFamily: fonts.titoloMedio, fontSize: 24, lineHeight: 29, color: colors.bianco, textAlign: 'center', marginBottom: 14 },
  sottotitolo: { fontFamily: fonts.corpo, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.68)', textAlign: 'center', maxWidth: 480, marginBottom: 24 },
  sottotitoloVideo: { fontFamily: fonts.corpo, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.85)', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 18 },
  nascosto: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 },
  puntino: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.azzurro },
  badgeTesto: { fontFamily: fonts.corpoForte, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: colors.azzurro },
  conto: { flexDirection: 'row', alignItems: 'center' },
  contoRiga: { flexDirection: 'row', alignItems: 'center' },
  sep: { fontFamily: fonts.titoloForte, fontSize: 22, color: colors.magenta, marginHorizontal: 4, transform: [{ translateY: -8 }] },
  casella: { minWidth: 46, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
  casellaFinita: { borderColor: colors.magenta, shadowColor: colors.magenta, shadowOpacity: 0.5, shadowRadius: 9, shadowOffset: { width: 0, height: 0 } },
  num: { fontFamily: fonts.titoloForte, fontSize: 22, lineHeight: 24, color: colors.bianco, fontVariant: ['tabular-nums'] },
  etichetta: { fontFamily: fonts.corpoForte, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginTop: 6 },
  video: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: 'transparent' },
  play: { position: 'absolute', top: '50%', left: '50%', width: 60, height: 60, marginTop: -30, marginLeft: -30, borderRadius: 30, backgroundColor: colors.magenta, alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  audio: { position: 'absolute', right: 16, bottom: 16, width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(3,12,28,0.6)', alignItems: 'center', justifyContent: 'center' },
  audioAcceso: { backgroundColor: colors.magenta, borderColor: colors.magenta },
});
