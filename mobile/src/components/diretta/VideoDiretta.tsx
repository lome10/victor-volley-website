// Video della pagina Diretta (js/diretta.js, renderVideo): diretta del canale muta con "Attiva audio", oppure l'ultimo video.
import { Image } from 'expo-image';
import { useRef, useState, type ComponentRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { WebView } from 'react-native-webview';

import { SITO } from '~/lib/dati';
import { CANALE_URL, type Video } from '~/lib/diretta';
import { colors, fonts } from '~/lib/theme';

/** Pagina per la WebView: l'iframe di YouTube che riempie il riquadro, con cmd() per comandarlo come fa il sito. */
export function paginaIframe(src: string) {
  return (
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body>' +
    '<iframe id="v" src="' + src + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>' +
    '<script>function cmd(f,a){var v=document.getElementById("v");v&&v.contentWindow&&v.contentWindow.postMessage(JSON.stringify({event:"command",func:f,args:a||[]}),"https://www.youtube.com")}</script>' +
    '</body></html>'
  );
}

export function VideoDiretta({ video }: { video: Video }) {
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const [audio, setAudio] = useState(false);

  if (video.tipo === 'nessuno') {
    return (
      <View style={[styles.riquadro, styles.vuoto]}>
        <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}>
          <Rect x={2} y={3} width={20} height={14} rx={2} />
          <Path d="M8 21h8M12 17v4" />
        </Svg>
        <Text style={styles.vuotoTesto}>
          Streaming non ancora configurato.{'\n'}Segui la diretta su{' '}
          <Text style={styles.link} onPress={() => void Linking.openURL(CANALE_URL + '/live')}>
            YouTube
          </Text>
          .
        </Text>
      </View>
    );
  }

  const live = video.tipo === 'live';
  return (
    <View style={styles.riquadro}>
      {Platform.OS === 'web' ? (
        // Nel browser (export web) la WebView non c'e': copertina dell'ultimo video.
        video.tipo === 'ultimo' && video.id ? <Image source={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} style={StyleSheet.absoluteFill} contentFit="cover" /> : null
      ) : (
        <WebView
          key={video.src}
          ref={web}
          source={{ html: paginaIframe(video.src), baseUrl: SITO }}
          style={styles.web}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          scrollEnabled={false}
          accessibilityLabel={live ? 'Diretta YouTube Victor Volley' : 'Ultimo video Victor Volley'}
        />
      )}
      {live && !audio ? (
        <Pressable
          style={styles.audio}
          onPress={() => {
            web.current?.injectJavaScript('cmd("unMute");cmd("setVolume",[100]);true;');
            setAudio(true);
          }}
          accessibilityRole="button">
          <Text style={styles.audioTesto}>🔊 Attiva audio</Text>
        </Pressable>
      ) : null}
      {live ? (
        <Pressable style={styles.youtube} onPress={() => void Linking.openURL(CANALE_URL + '/live')} accessibilityRole="link">
          <Text style={styles.youtubeTesto}>Guarda su YouTube ↗</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  riquadro: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  vuoto: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  vuotoTesto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  link: { fontFamily: fonts.corpoMedio, color: colors.azzurro },
  audio: { position: 'absolute', left: 10, bottom: 52, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.75)' },
  audioTesto: { fontFamily: fonts.corpoForte, fontSize: 13, color: colors.bianco },
  youtube: { position: 'absolute', right: 10, bottom: 10, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
  youtubeTesto: { fontFamily: fonts.corpoMedio, fontSize: 11, color: colors.bianco },
});
