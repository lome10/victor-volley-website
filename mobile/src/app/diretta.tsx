// Pagina Diretta del sito (diretta.html), da telefono e nello stesso ordine:
// sponsor Gold, video (diretta del canale o ultimo video), tabellone, messaggio, fascia Silver/Bronze,
// "Entra a far parte della famiglia Victor".
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Piede } from '~/components/Piede';
import { SponsorGold } from '~/components/diretta/SponsorGold';
import { TabelloneDiretta } from '~/components/diretta/TabelloneDiretta';
import { VideoDiretta } from '~/components/diretta/VideoDiretta';
import { Invito } from '~/components/home/InvitoGioca';
import { Fascia } from '~/components/home/SponsorHome';
import { usePubblico } from '~/lib/dati';
import { scegliTabellone, scegliVideo, sponsorDiretta, useTabellone, useYoutube } from '~/lib/diretta';
import { colors, fonts } from '~/lib/theme';

const MAIL = 'mailto:victorvolley@libero.it?subject=Richiesta%20partnership';

export default function Diretta() {
  const pubblico = usePubblico();
  const youtube = useYoutube();
  const spp = useTabellone();
  const [adesso] = useState(() => new Date());

  const j = spp.data ?? null;
  const inCorso = !!(j && j.status === 'live' && j.home && j.away);
  // Finche' YouTube non ha risposto non si carica nessun video (come il sito, che aspetta /api/youtube-live).
  const video = youtube.data ? scegliVideo(youtube.data, inCorso) : null;
  const dati = pubblico.data;
  // Finche' il tabellone non ha risposto: "Caricamento tabellone…" come il sito.
  const tabellone = spp.isPending ? null : scegliTabellone(j, dati?.partite ?? [], adesso);
  const { gold, fascia } = sponsorDiretta(dati?.sponsor ?? []);

  return (
    <ScrollView
      style={styles.pagina}
      contentContainerStyle={styles.tutto}
      refreshControl={
        <RefreshControl
          refreshing={pubblico.isRefetching || spp.isRefetching}
          onRefresh={() => {
            void pubblico.refetch();
            void youtube.refetch();
            void spp.refetch();
          }}
        />
      }>
      <View>
        <Text style={styles.nascosto} accessibilityRole="header">
          Diretta — Victor Volley
        </Text>
        <SponsorGold gold={gold} />
        <View style={styles.sezione}>
          {video ? <VideoDiretta video={video} /> : <View style={styles.attesa} />}
          {tabellone ? (
            <TabelloneDiretta t={tabellone} squadre={dati?.girone.squadre ?? []} />
          ) : (
            <View style={styles.caricamento}>
              <Text style={styles.caricamentoTesto}>Caricamento tabellone…</Text>
            </View>
          )}
          {video && video.tipo === 'ultimo' ? (
            <Text style={styles.messaggio}>Nessuna partita è al momento in diretta.{'\n'}Nel frattempo, dai un’occhiata alla nostra ultima partita.</Text>
          ) : null}
        </View>
        {fascia.length ? <Fascia voci={fascia} style={styles.fascia} /> : null}
        <Invito
          titolo="Entra a far parte della famiglia Victor"
          testo="Vuoi che il tuo brand sia visto da centinaia di appassionati ad ogni diretta? Diventa partner della Victor Volley e porta la tua attività in campo con noi."
          tasti={[
            { testo: 'Scopri come diventare partner', tipo: 'pieno', onPress: () => router.push('/sponsor') },
            { testo: 'Scrivici', tipo: 'bordoBianco', onPress: () => void Linking.openURL(MAIL) },
          ]}
        />
      </View>
      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bianco },
  tutto: { flexGrow: 1, justifyContent: 'space-between' },
  nascosto: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  sezione: { paddingTop: 32, paddingBottom: 8, paddingHorizontal: 24, gap: 12, marginBottom: 12 },
  attesa: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#000' },
  messaggio: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.navy, textAlign: 'center', backgroundColor: '#F4F4F6', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  caricamento: { backgroundColor: colors.navy, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20 },
  caricamentoTesto: { fontFamily: fonts.corpo, fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', paddingVertical: 12 },
  fascia: { marginTop: 0 },
});
