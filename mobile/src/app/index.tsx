// La home del sito (index.html), da telefono, nello stesso ordine:
// partite concluse, nuova maglia, ultime news, prossime partite e classifica, galleria, partner, "Vuoi giocare con noi?".
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Piede } from '~/components/Piede';
import { Stato } from '~/components/Stato';
import { AnteprimaGalleria } from '~/components/home/AnteprimaGalleria';
import { InvitoGioca } from '~/components/home/InvitoGioca';
import { ProssimePartite } from '~/components/home/ProssimePartite';
import { SponsorHome } from '~/components/home/SponsorHome';
import { StrisciaPartite } from '~/components/home/StrisciaPartite';
import { UltimeNews } from '~/components/home/UltimeNews';
import { usePubblico } from '~/lib/dati';
import { colors } from '~/lib/theme';

export default function Home() {
  const { data, isPending, isError, refetch, isRefetching } = usePubblico();
  return (
    <ScrollView
      style={styles.pagina}
      contentContainerStyle={styles.tutto}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.bianco} />}>
      {isPending ? (
        <Stato />
      ) : isError && !data ? (
        <Stato titolo="Non riusciamo a caricare i contenuti" testo="Controlla la connessione e riprova." riprova={refetch} />
      ) : data ? (
        <View>
          <StrisciaPartite partite={data.partite} />
          <UltimeNews articoli={data.articoli} />
          <ProssimePartite dati={data} />
          <AnteprimaGalleria album={data.album} />
          <SponsorHome sponsor={data.sponsor} />
          <InvitoGioca />
        </View>
      ) : null}
      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.notte },
  tutto: { flexGrow: 1, justifyContent: 'space-between' },
});
