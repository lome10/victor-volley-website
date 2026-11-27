// I nostri partner: copia di sponsor.html (js/pages/sponsor-2.js e sponsor-3.js, css/style.css).
import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import { useRef, type ComponentRef } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Modulo } from '~/components/Modulo';
import { Piede } from '~/components/Piede';
import { Stato } from '~/components/Stato';
import { TestaPagina } from '~/components/TestaPagina';
import { usePubblico, type Sponsor } from '~/lib/dati';
import { CAMPI_SPONSOR, datiSponsor, inviaModulo } from '~/lib/moduli';
import { colors, fonts } from '~/lib/theme';

const GRIGIO = '#F4F4F6';

// .sponsor-grid--gold/silver/bronze e .sponsor-card--*: colonna minima, logo, spazio tra card, margine interno.
const LIVELLI = [
  { chiave: 'gold', nome: 'Gold', fondo: '#f5e3ab', colore: '#7a5c00', minimo: 300, logo: 180, spazio: 24, margine: 32, massimo: 900 },
  { chiave: 'silver', nome: 'Silver', fondo: '#e4e7ec', colore: '#4a5568', minimo: 260, logo: 140, spazio: 24, margine: 24, massimo: 1200 },
  { chiave: 'bronze', nome: 'Bronze', fondo: '#eccba5', colore: '#7a4620', minimo: 200, logo: 110, spazio: 20, margine: 20, massimo: 1200 },
] as const;
type Livello = (typeof LIVELLI)[number];

/** Come VV.safeUrl: solo indirizzi http(s). */
const sicuro = (u: string) => (/^https?:\/\//i.test((u || '').trim()) ? u.trim() : '');

export default function Partner() {
  const attuale = usePathname();
  const { width } = useWindowDimensions();
  const piccolo = width <= 768;
  const { data, isPending, isError, refetch, isRefetching } = usePubblico();
  const scorri = useRef<ComponentRef<typeof ScrollView>>(null);
  const posModulo = useRef(0);
  const alModulo = () => scorri.current?.scrollTo({ y: Math.max(0, posModulo.current - 16), animated: true });

  const utile = Math.min(width, 1200) - 48;
  const sponsor = [...(data?.sponsor ?? [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const sotto = data?.livelliSponsor;

  const sezione = { paddingVertical: piccolo ? 48 : 80, paddingHorizontal: 24 };
  const h2 = { fontSize: piccolo ? 24 : 32, lineHeight: piccolo ? 29 : 38 };

  const card = (s: Sponsor, l: Livello, larghezzaCard: number) => {
    const url = sicuro(s.url);
    const dentro = s.logo ? (
      <Image source={{ uri: s.logo }} style={{ width: Math.min(l.logo, larghezzaCard - 2 * l.margine), aspectRatio: 1 }} contentFit="contain" accessibilityLabel={s.nome} />
    ) : (
      <Text style={styles.cardNome}>{s.nome}</Text>
    );
    const stile = [styles.card, { padding: l.margine, width: larghezzaCard }, l.chiave === 'gold' && styles.cardGold];
    return url ? (
      <Pressable key={s.id} style={stile} onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={s.nome}>
        {dentro}
      </Pressable>
    ) : (
      <View key={s.id} style={stile} accessible accessibilityLabel={s.nome}>{dentro}</View>
    );
  };

  const livelli = LIVELLI.map((l, i) => {
    const lista = sponsor.filter((s) => (s.livello || 'silver') === l.chiave);
    const larghezza = Math.min(utile, l.massimo);
    let colonne = Math.max(1, Math.floor((larghezza + l.spazio) / (l.minimo + l.spazio)));
    // Gold e' "auto-fit": le colonne vuote spariscono e le card si allargano.
    if (l.chiave === 'gold') colonne = Math.min(colonne, Math.max(1, lista.length));
    const larghezzaCard = (larghezza - l.spazio * (colonne - 1)) / colonne;
    return (
      <View key={l.chiave} style={i < LIVELLI.length - 1 && styles.livello}>
        <View style={styles.livelloTesta}>
          <Text style={[styles.badge, { backgroundColor: l.fondo, color: l.colore }]}>{l.nome.toUpperCase()}</Text>
          {sotto?.[l.chiave] ? <Text style={styles.livelloSotto}>{sotto[l.chiave]}</Text> : null}
        </View>
        {lista.length ? (
          <View style={[styles.griglia, { gap: l.spazio, width: larghezza }]}>{lista.map((s) => card(s, l, larghezzaCard))}</View>
        ) : (
          <View style={[styles.vuoto, { width: larghezza }]}>
            <Text style={styles.vuotoTesto}>
              Nessun partner {l.nome} al momento.{' '}
              <Text style={styles.vuotoLink} onPress={alModulo} accessibilityRole="link">Vuoi essere il primo?</Text>
            </Text>
          </View>
        )}
      </View>
    );
  });

  return (
    <ScrollView
      ref={scorri}
      style={styles.pagina}
      contentContainerStyle={styles.tutto}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.navy} />}>
      <TestaPagina briciola="Partner" titolo="I nostri partner" sottotitolo="Grazie a chi ci sostiene ogni giorno" />

      <View style={sezione}>
        <View style={styles.intestazione}>
          {/* Stesso testo del titolo della pagina: per la lettura vocale basta il primo. */}
          <Text style={[styles.h2, h2, styles.centro]}>I nostri partner</Text>
          <Text style={[styles.intestazioneTesto, styles.centro]}>Le aziende che sostengono la Victor Volley, divise per livello di partnership</Text>
        </View>
        {isPending ? (
          <Stato chiaro />
        ) : isError && !data ? (
          <Stato chiaro titolo="Non riusciamo a caricare i partner" testo="Controlla la connessione e riprova." riprova={refetch} />
        ) : (
          livelli
        )}
      </View>

      <View style={[sezione, { backgroundColor: GRIGIO }]}>
        <View style={[styles.contenitore, !piccolo && styles.ctaLarga]}>
          <View style={!piccolo && styles.ctaTesto}>
            <Text style={[styles.h2, h2, { marginBottom: 16 }]} accessibilityRole="header">Diventa partner di Victor Volley</Text>
            <Text style={[styles.testo, { marginBottom: 20 }]}>
              Sostenere la Victor Volley significa investire nello sport giovanile del territorio melissanese. Siamo una realtà in crescita, con oltre 80 tesserati, una forte presenza sui social e grande visibilità locale.
            </Text>
            <Text style={[styles.testo, { marginBottom: 24 }]}>
              Offriamo tre livelli di partnership — <Text style={styles.forte}>Gold</Text>, <Text style={styles.forte}>Silver</Text> e <Text style={styles.forte}>Bronze</Text> — con visibilità crescente del tuo logo su maglie, striscioni, sito web e social network. Contattaci per un preventivo personalizzato su misura per la tua azienda.
            </Text>
            <Pressable style={styles.bottone} onPress={alModulo} accessibilityRole="button">
              <Text style={styles.bottoneTesto}>Richiedi informazioni</Text>
            </Pressable>
          </View>
          <View style={[styles.numeri, !piccolo ? styles.numeriLarghi : styles.numeriSotto]}>
            <Text style={[styles.numero, { color: colors.azzurro }]}>80+</Text>
            <Text style={[styles.numeroEtichetta, styles.numeroSpazio]}>TESSERATI</Text>
            <Text style={[styles.numero, { color: colors.navy }]}>5</Text>
            <Text style={[styles.numeroEtichetta, styles.numeroSpazio]}>CATEGORIE ATTIVE</Text>
            <Text style={[styles.numero, { color: colors.magenta }]}>2019</Text>
            <Text style={styles.numeroEtichetta}>ANNO DI FONDAZIONE</Text>
          </View>
        </View>
      </View>

      <View style={sezione} onLayout={(e) => { posModulo.current = e.nativeEvent.layout.y; }}>
        <View style={styles.intestazione}>
          <Text style={[styles.h2, h2, styles.centro]} accessibilityRole="header">Richiedi informazioni</Text>
          <Text style={[styles.intestazioneTesto, styles.centro]}>
            Raccontaci chi sei: ti ricontattiamo per presentarti i livelli di partnership e trovare la formula più adatta.
          </Text>
        </View>
        <Modulo
          campi={CAMPI_SPONSOR}
          coppie={[['azienda', 'referente'], ['email', 'telefono']]}
          testoInvio="Invia la richiesta"
          ok={{ titolo: 'Richiesta inviata!', testo: 'Grazie per l’interesse: ti contatteremo presto.' }}
          invia={(v) => inviaModulo(datiSponsor(v))}
          mostra={alModulo}
          attuale={attuale}
        />
      </View>

      <Piede />
    </ScrollView>
  );
}

const ombra = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 };

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bianco },
  tutto: { flexGrow: 1 },
  contenitore: { width: '100%', maxWidth: 1200, alignSelf: 'center' },
  centro: { textAlign: 'center' },
  intestazione: { marginBottom: 40 },
  h2: { fontFamily: fonts.titoloMedio, color: colors.navy, marginBottom: 8 },
  intestazioneTesto: { fontFamily: fonts.corpo, fontSize: 16, lineHeight: 26, color: '#555' },
  livello: { marginBottom: 64 },
  livelloTesta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'center', columnGap: 14, rowGap: 8, marginBottom: 24 },
  badge: { fontFamily: fonts.titolo, fontSize: 13, letterSpacing: 0.5, paddingVertical: 5, paddingHorizontal: 16, borderRadius: 999, overflow: 'hidden' },
  livelloSotto: { fontFamily: fonts.corpo, fontSize: 14, color: '#888', textAlign: 'center' },
  griglia: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  card: { ...ombra, backgroundColor: colors.bianco, borderRadius: 12, minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 12 },
  cardGold: { borderWidth: 1, borderColor: '#e8d38c', shadowColor: '#d4af37', shadowOpacity: 0.15, shadowRadius: 18, shadowOffset: { width: 0, height: 4 } },
  cardNome: { fontFamily: fonts.corpo, fontSize: 13, color: '#aaa', textAlign: 'center' },
  vuoto: { alignSelf: 'center', padding: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: '#ddd', borderRadius: 12 },
  vuotoTesto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 22, color: '#999', textAlign: 'center' },
  vuotoLink: { color: colors.azzurro, fontFamily: fonts.corpoMedio },
  ctaLarga: { flexDirection: 'row', alignItems: 'center', gap: 64 },
  ctaTesto: { flex: 1.5 },
  testo: { fontFamily: fonts.corpo, fontSize: 16, lineHeight: 26, color: '#555' },
  forte: { fontFamily: fonts.corpoForte, color: '#555' },
  bottone: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 3, backgroundColor: colors.azzurroScuro },
  bottoneTesto: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.bianco },
  numeri: { ...ombra, backgroundColor: colors.bianco, borderRadius: 12, padding: 32, alignItems: 'center' },
  numeriLarghi: { flex: 1 },
  numeriSotto: { marginTop: 32 },
  numero: { fontFamily: fonts.titolo, fontSize: 40, lineHeight: 48, marginBottom: 4 },
  numeroEtichetta: { fontFamily: fonts.corpo, fontSize: 13, letterSpacing: 0.65, color: '#888' },
  numeroSpazio: { marginBottom: 20 },
});
