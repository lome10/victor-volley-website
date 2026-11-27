// Calendario e risultati: copia di calendario.html (js/pages/calendario-1.js, css/calendario.css).
import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BarraProssima } from '~/components/calendario/BarraProssima';
import { Classifica } from '~/components/calendario/Classifica';
import { GiornateGirone } from '~/components/calendario/GiornateGirone';
import { IconaCalendario } from '~/components/calendario/Icone';
import { SchedaPartita } from '~/components/calendario/SchedaPartita';
import { Piede } from '~/components/Piede';
import { Stato } from '~/components/Stato';
import { categorie, elencoCategoria, fileIcs, nomeFileIcs, oggiIso, prossimaDellaCategoria, slug, sponsorCalendario } from '~/lib/calendario';
import { condividiIcs } from '~/lib/condividiIcs';
import { usePubblico } from '~/lib/dati';
import { gironiRisolti } from '~/lib/girone';
import { colors, fonts } from '~/lib/theme';

const NOTTE_SPORT = '#050e1f';

export default function Calendario() {
  const { width } = useWindowDimensions();
  const stretto = width <= 600;
  const colonne = width > 900;
  const { data, isPending, isError, refetch, isRefetching } = usePubblico();
  const scorri = useRef<ComponentRef<typeof ScrollView>>(null);

  const [stagioneScelta, setStagioneScelta] = useState<string | null>(null);
  const [categoriaScelta, setCategoriaScelta] = useState<string | null>(null);
  const [avversari, setAvversari] = useState<Record<string, string>>({});
  const [foglio, setFoglio] = useState(false);

  const oggi = oggiIso();
  const partite = useMemo(() => data?.partite ?? [], [data]);
  const stagioni = data?.stagioni ?? [];
  const stagione = stagioni.find((s) => s.id === stagioneScelta) ?? stagioni.find((s) => s.current) ?? stagioni[0] ?? null;
  const cats = useMemo(() => categorie(partite), [partite]);
  const attiva = cats.find((c) => slug(c) === categoriaScelta) ?? cats[0] ?? null;
  const gironi = useMemo(() => gironiRisolti(data?.girone), [data]);
  // Come il sito: il girone vale per la categoria (qualunque stagione sia scelta) e serve con almeno 2 squadre.
  const girone = attiva ? gironi.find((g) => g.categoria && slug(g.categoria) === slug(attiva) && g.squadre.length >= 2) ?? null : null;
  const conGirone = !!girone && girone.partite.some((m) => m.squadra_casa && m.squadra_ospite);

  const elenco = attiva && stagione ? elencoCategoria(partite, attiva, stagione.id, avversari[slug(attiva)] ?? '', oggi) : null;
  const prossima = attiva && stagione ? prossimaDellaCategoria(partite, attiva, stagione.id, oggi) : null;
  const sponsor = sponsorCalendario(data?.sponsor ?? []);

  // Posizioni per "vai alla prossima partita": pannello nel contenuto + colonna + punto nel blocco.
  const pos = useRef({ zona: 0, pannello: 0, colonna: 0, girone: 0, card: -1, elenco: 0, riga: -1 });
  const vaiAllaProssima = () => {
    const p = pos.current;
    const dentro = p.card >= 0 && conGirone ? p.girone + p.card : p.riga >= 0 ? p.elenco + p.riga : -1;
    if (dentro < 0) return;
    scorri.current?.scrollTo({ y: Math.max(0, p.zona + p.pannello + p.colonna + dentro - 140), animated: true });
  };

  const testata = (
    <View style={styles.testata}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100" width="100%" height="100%">
        <Defs>
          <RadialGradient id="az" cx="15" cy="-10" rx="70" ry="90" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#008CFD" stopOpacity="0.22" />
            <Stop offset="0.6" stopColor="#008CFD" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="mg" cx="100" cy="0" rx="55" ry="85" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#CB2168" stopOpacity="0.2" />
            <Stop offset="0.55" stopColor="#CB2168" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={colors.navy} />
        <Ellipse cx="15" cy="-10" rx="70" ry="90" fill="url(#az)" />
        <Ellipse cx="100" cy="0" rx="55" ry="85" fill="url(#mg)" />
      </Svg>
      <Text style={styles.briciole}>
        <Text onPress={() => router.dismissTo('/')} accessibilityRole="link">Home</Text> / Calendario
      </Text>
      <View style={styles.testaRiga}>
        <View>
          <Text style={styles.titolo} accessibilityRole="header">Calendario e risultati</Text>
          <Text style={styles.sottotitolo}>{stagione ? 'Stagione ' + stagione.id : 'Stagione'}</Text>
        </View>
        {stagioni.length > 1 ? (
          <View style={styles.gruppo}>
            {stagioni.map((s) => (
              <Pillola key={s.id} testo={s.name || s.id} attiva={s.id === stagione?.id} premi={() => setStagioneScelta(s.id)} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (isPending || (isError && !data)) {
    return (
      <ScrollView style={styles.pagina} contentContainerStyle={styles.tutto}>
        {testata}
        <View style={styles.zona}>
          {isPending ? <Stato /> : <Stato titolo="Non riusciamo a caricare i contenuti" testo="Controlla la connessione e riprova." riprova={refetch} />}
        </View>
        <Piede />
      </ScrollView>
    );
  }

  const calendario = (
    <View style={styles.blocco} onLayout={(e) => { pos.current.colonna = e.nativeEvent.layout.y; }}>
      <View style={styles.sezioneTesta}>
        <Text style={styles.sezioneTitolo} accessibilityRole="header">Calendario</Text>
        {!conGirone && elenco && elenco.prossima >= 0 ? (
          <Pressable style={styles.salta} onPress={vaiAllaProssima} accessibilityRole="button">
            <Text style={styles.saltaTesto}>Vai alla prossima partita ↓</Text>
          </Pressable>
        ) : null}
      </View>
      {elenco && ((!conGirone && elenco.avversari.length > 1) || elenco.future.length > 1) ? (
        <View style={[styles.strumenti, conGirone && styles.strumentiADestra]}>
          {!conGirone && elenco.avversari.length > 1 ? (
          <View style={[styles.filtro, stretto && styles.filtroStretto]}>
            <Text style={styles.filtroEtichetta}>Squadra avversaria</Text>
            <Pressable style={[styles.tendina, stretto && styles.tendinaStretta]} onPress={() => setFoglio(true)} accessibilityRole="button" accessibilityLabel="Squadra avversaria">
              <Text style={styles.tendinaTesto} numberOfLines={1}>{elenco.filtro || 'Tutte le squadre'}</Text>
              <Text style={styles.tendinaFreccia}>▾</Text>
            </Pressable>
          </View>
          ) : null}
          {elenco.future.length > 1 && attiva ? (
            <Pressable
              style={styles.icsTutte}
              onPress={() => {
                condividiIcs(fileIcs(elenco.future), nomeFileIcs(attiva, elenco.filtro)).catch(() =>
                  Alert.alert('Calendario', 'Non sono riuscito a preparare il file. Riprova tra poco.'));
              }}
              accessibilityRole="button">
              <IconaCalendario colore={colors.azzurro} />
              <Text style={styles.saltaTesto}>Aggiungi tutte al calendario</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {conGirone && girone ? (
        <View onLayout={(e) => { pos.current.girone = e.nativeEvent.layout.y; }}>
          <GiornateGirone
            partite={girone.partite}
            squadre={girone.squadre}
            categoria={girone.categoria}
            oggi={oggi}
            largo={!stretto}
            posizioneProssima={(y) => { pos.current.card = y; }}
          />
        </View>
      ) : elenco ? (
        <View style={styles.elenco} onLayout={(e) => { pos.current.elenco = e.nativeEvent.layout.y; }}>
          {elenco.partite.length ? (
            elenco.partite.map((p, i) => (
              <View key={p.id} onLayout={i === elenco.prossima ? (e) => { pos.current.riga = e.nativeEvent.layout.y; } : undefined}>
                <SchedaPartita partita={p} prossima={i === elenco.prossima} oggi={oggi} strettoSotto900={!colonne} />
              </View>
            ))
          ) : (
            <Text style={styles.vuoto}>Calendario in arrivo: le date saranno pubblicate appena la federazione le comunica.</Text>
          )}
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <ScrollView
        ref={scorri}
        style={styles.pagina}
        contentContainerStyle={styles.tutto}
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.bianco} />}>
        {testata}
        <BarraProssima prossima={prossima} sponsor={sponsor} stretto={stretto} vai={vaiAllaProssima} />
        <View style={styles.zona} onLayout={(e) => { pos.current.zona = e.nativeEvent.layout.y; }}>
          {!stagione ? (
            <Stato titolo="Calendario in arrivo" testo="Le date saranno pubblicate appena la federazione le comunica." />
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.schede} contentContainerStyle={styles.schedeDentro}>
                <View style={styles.gruppo} accessibilityRole="tablist">
                  {cats.map((c) => (
                    <Pillola key={c} testo={c} attiva={c === attiva} scheda premi={() => { setCategoriaScelta(slug(c)); pos.current.card = -1; pos.current.riga = -1; }} />
                  ))}
                </View>
              </ScrollView>
              <View style={[styles.pannello, colonne && girone && styles.colonne]} onLayout={(e) => { pos.current.pannello = e.nativeEvent.layout.y; }}>
                <View style={styles.sinistra}>{calendario}</View>
                {girone ? (
                  <View style={colonne ? styles.destra : null}>
                    <Text style={styles.sezioneTitolo} accessibilityRole="header">Classifica</Text>
                    <View style={styles.classificaSpazio}>
                      <Classifica girone={girone} stretto={stretto} />
                    </View>
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>
        <Piede />
      </ScrollView>
      <Modal visible={foglio} transparent animationType="fade" onRequestClose={() => setFoglio(false)}>
        <Pressable style={styles.velo} onPress={() => setFoglio(false)} accessibilityLabel="Chiudi" />
        <View style={styles.foglio}>
          <Text style={styles.foglioTitolo}>Squadra avversaria</Text>
          <ScrollView style={styles.foglioLista}>
            {['', ...(elenco?.avversari ?? [])].map((o) => (
              <Pressable
                key={o || 'tutte'}
                style={[styles.voce, (elenco?.filtro ?? '') === o && styles.voceScelta]}
                onPress={() => {
                  if (attiva) setAvversari((v) => ({ ...v, [slug(attiva)]: o }));
                  pos.current.riga = -1;
                  setFoglio(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: (elenco?.filtro ?? '') === o }}>
                <Text style={styles.voceTesto}>{o || 'Tutte le squadre'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function Pillola({ testo, attiva, premi, scheda }: { testo: string; attiva: boolean; premi: () => void; scheda?: boolean }) {
  return (
    <Pressable
      style={[styles.pillola, attiva && styles.pillolaAttiva]}
      onPress={premi}
      accessibilityRole={scheda ? 'tab' : 'button'}
      accessibilityState={{ selected: attiva }}>
      <Text style={[styles.pillolaTesto, attiva && styles.pillolaTestoAttivo]}>{testo}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: NOTTE_SPORT },
  tutto: { flexGrow: 1 },
  testata: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 34, overflow: 'hidden', backgroundColor: colors.navy },
  briciole: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.corpo, fontSize: 13 },
  testaRiga: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginTop: 6 },
  titolo: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 32, marginTop: 4 },
  sottotitolo: { color: 'rgba(255,255,255,0.72)', fontFamily: fonts.corpo, fontSize: 15, marginTop: 6 },
  gruppo: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)', alignSelf: 'flex-start' },
  pillola: { minHeight: 36, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  pillolaAttiva: { backgroundColor: colors.azzurroScuro },
  pillolaTesto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  pillolaTestoAttivo: { color: colors.bianco },
  zona: { backgroundColor: NOTTE_SPORT, paddingBottom: 8, flexGrow: 1 },
  schede: { flexGrow: 0 },
  schedeDentro: { paddingTop: 22, paddingHorizontal: 24 },
  pannello: { paddingHorizontal: 24 },
  colonne: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  sinistra: { flex: 1, minWidth: 0 },
  destra: { width: 400, paddingTop: 32 },
  classificaSpazio: { marginTop: 4 },
  blocco: { paddingTop: 32, paddingBottom: 8 },
  sezioneTesta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  sezioneTitolo: { fontFamily: fonts.titoloForte, fontSize: 22, color: colors.bianco },
  salta: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, backgroundColor: 'rgba(0,140,253,0.12)', borderWidth: 1, borderColor: 'rgba(0,140,253,0.3)' },
  saltaTesto: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: colors.azzurro },
  strumenti: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 16, rowGap: 12, paddingTop: 18 },
  strumentiADestra: { justifyContent: 'flex-end' },
  icsTutte: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 16, borderRadius: 99, backgroundColor: 'rgba(0,140,253,0.12)', borderWidth: 1, borderColor: 'rgba(0,140,253,0.3)' },
  filtro: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filtroStretto: { flexWrap: 'wrap', width: '100%' },
  filtroEtichetta: { fontFamily: fonts.corpoMedio, fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  tendina: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.08)' },
  tendinaStretta: { flexGrow: 1, flexBasis: 200, minWidth: 0 },
  tendinaTesto: { flexShrink: 1, fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.bianco },
  tendinaFreccia: { marginLeft: 'auto', color: colors.bianco, fontSize: 12 },
  elenco: { gap: 10, paddingTop: 22, paddingBottom: 8, paddingHorizontal: 2 },
  vuoto: { textAlign: 'center', fontFamily: fonts.corpo, color: 'rgba(255,255,255,0.65)', paddingVertical: 40, paddingHorizontal: 24 },
  velo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  foglio: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 20, paddingBottom: 32, paddingHorizontal: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: colors.menu },
  foglioTitolo: { fontFamily: fonts.titoloForte, fontSize: 18, color: colors.bianco, marginBottom: 12, marginHorizontal: 8 },
  foglioLista: { maxHeight: 420 },
  voce: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8 },
  voceScelta: { backgroundColor: 'rgba(0,140,253,0.18)' },
  voceTesto: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.bianco },
});
