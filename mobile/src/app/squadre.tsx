// La pagina Squadre del sito (squadre.html, js/pages/squadre-1.js, css/squadre.css).
import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Piede } from '~/components/Piede';
import { Scaffale, StrisciaStaff, sport } from '~/components/Rosa';
import { Scelta } from '~/components/Scelta';
import { Stato } from '~/components/Stato';
import { usePubblico } from '~/lib/dati';
import { gruppiPerRuolo, ordinaStaff, stagioneCorrente } from '~/lib/squadre';
import { colors, fonts } from '~/lib/theme';

/** I due aloni della testata (.page-header--squadre): azzurro a sinistra in alto, magenta a destra. */
function Aloni({ w, h }: { w: number; h: number }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width={w} height={h}>
      <Defs>
        <RadialGradient id="az" cx={w * 0.15} cy={-h * 0.1} rx={450} ry={210} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#008CFD" stopOpacity={0.22} />
          <Stop offset="0.6" stopColor="#008CFD" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="ma" cx={w} cy={0} rx={350} ry={190} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#CB2168" stopOpacity={0.2} />
          <Stop offset="0.55" stopColor="#CB2168" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#az)" />
      <Rect width={w} height={h} fill="url(#ma)" />
    </Svg>
  );
}

export default function Squadre() {
  const { width, height } = useWindowDimensions();
  const telefono = width <= 720;
  const { data, isPending, isError, refetch, isRefetching } = usePubblico();
  const [stagioneScelta, setStagione] = useState<string | null>(null);
  const [categoriaScelta, setCategoria] = useState<number | null>(null);
  const [ruoloAttivo, setRuoloAttivo] = useState('tutte');
  const [testata, setTestata] = useState({ w: width, h: 0 });
  const scorri = useRef<ComponentRef<typeof ScrollView>>(null);
  const posizioni = useRef<{ scaffali: number; filtri: number; altezzaFiltri: number; ruoli: Record<string, number> }>({
    scaffali: 0,
    filtri: 0,
    altezzaFiltri: 0,
    ruoli: {},
  });

  const categorie = useMemo(() => (data?.categorie ?? []).filter((c) => c.showInSquadre && c.id !== null), [data]);
  const stagioni = useMemo(() => data?.stagioni ?? [], [data]);
  const stagione = stagioni.find((s) => s.id === stagioneScelta) ?? stagioneCorrente(stagioni);
  const categoria = categorie.find((c) => c.id === categoriaScelta) ?? categorie[0];

  const staff = useMemo(
    () => (categoria && stagione ? ordinaStaff((data?.staff ?? []).filter((s) => s.categoriaId === categoria.id), stagione.id) : []),
    [data, categoria, stagione],
  );
  const gruppi = useMemo(
    () => (categoria && stagione ? gruppiPerRuolo((data?.giocatori ?? []).filter((p) => p.categoriaId === categoria.id), stagione.id) : []),
    [data, categoria, stagione],
  );

  const ricomincia = () => {
    setRuoloAttivo('tutte');
    posizioni.current.ruoli = {};
  };

  const vaiRuolo = (ruolo: string) => {
    setRuoloAttivo(ruolo);
    const p = posizioni.current;
    // Come scroll-margin-top del sito: lo scaffale si ferma sotto la fascia dei filtri.
    const y = ruolo === 'tutte' ? p.filtri : p.scaffali + (p.ruoli[ruolo] ?? 0) - p.altezzaFiltri - 8;
    scorri.current?.scrollTo({ y, animated: true });
  };

  // Come l'IntersectionObserver del sito: si accende il ruolo dello scaffale a meta' schermo.
  const seguiScorrimento = (y: number) => {
    const p = posizioni.current;
    const centro = y + height * 0.5 - p.scaffali;
    let attivo: string | null = null;
    for (const g of gruppi) if ((p.ruoli[g.ruolo] ?? Infinity) <= centro) attivo = g.ruolo;
    if (attivo && attivo !== ruoloAttivo) setRuoloAttivo(attivo);
  };

  const chip = (ruolo: string, scritta: string) => {
    const attivo = ruoloAttivo === ruolo;
    return (
      <Pressable
        key={ruolo}
        style={[styles.chip, attivo && styles.chipAttivo]}
        onPress={() => vaiRuolo(ruolo)}
        accessibilityRole="button"
        accessibilityState={{ selected: attivo }}>
        <Text style={[styles.chipTesto, attivo && styles.chipTestoAttivo]}>{scritta}</Text>
      </Pressable>
    );
  };

  const pronto = !isPending && !(isError && !data);
  const conRosa = pronto && gruppi.length > 0;

  return (
    <ScrollView
      ref={scorri}
      style={styles.pagina}
      contentContainerStyle={styles.tutto}
      stickyHeaderIndices={conRosa ? [2] : undefined}
      onScroll={(e) => {
        if (conRosa) seguiScorrimento(e.nativeEvent.contentOffset.y);
      }}
      scrollEventThrottle={64}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.bianco} />}>
      {/* 0: testata */}
      <View style={styles.testata} onLayout={(e) => setTestata({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Aloni w={testata.w} h={testata.h} />
        <Text style={styles.briciole}>
          <Text onPress={() => router.dismissTo('/')} accessibilityRole="link">
            Home
          </Text>{' '}
          / Le squadre
        </Text>
        {stagione ? <Text style={styles.occhiello}>Stagione {stagione.name || stagione.id}</Text> : null}
        <Text style={styles.titolo} accessibilityRole="header">
          {categoria ? categoria.name : 'Le nostre squadre'}
        </Text>
        {pronto && categorie.length ? (
          <View style={styles.scelte}>
            {stagioni.length > 1 ? (
              <View style={styles.stagioni}>
                {stagioni.map((s) => {
                  const attiva = s.id === stagione?.id;
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.stagione, attiva && styles.stagioneAttiva]}
                      onPress={() => {
                        setStagione(s.id);
                        ricomincia();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: attiva }}>
                      <Text style={[styles.stagioneTesto, attiva && styles.stagioneTestoAttiva]}>{s.name || s.id}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <Scelta
              titolo="Categoria"
              voci={categorie.map((c) => ({ valore: String(c.id), etichetta: c.name }))}
              scelta={categoria ? String(categoria.id) : null}
              scegli={(v) => {
                setCategoria(Number(v));
                ricomincia();
              }}
            />
          </View>
        ) : null}
      </View>

      {/* 1: staff (o caricamento, errore, vuoto) */}
      <View>
        {isPending ? (
          <Stato />
        ) : isError && !data ? (
          <Stato titolo="Non riusciamo a caricare i contenuti" testo="Controlla la connessione e riprova." riprova={refetch} />
        ) : !stagione ? (
          <Stato titolo="Nessuna stagione disponibile" testo="Le rose saranno pubblicate presto." />
        ) : !categorie.length ? (
          <Stato titolo="Nessuna squadra disponibile" testo="Le rose della stagione saranno pubblicate presto." />
        ) : staff.length ? (
          <StrisciaStaff staff={staff} />
        ) : null}
      </View>

      {/* 2: filtri per ruolo, fissi in alto mentre si scorre */}
      <View
        style={conRosa ? styles.filtri : undefined}
        onLayout={(e) => {
          posizioni.current.filtri = e.nativeEvent.layout.y;
          posizioni.current.altezzaFiltri = e.nativeEvent.layout.height;
        }}>
        {conRosa ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtriRiga}>
            {chip('tutte', 'Tutte')}
            {gruppi.map((g) => chip(g.ruolo, g.nome))}
          </ScrollView>
        ) : null}
      </View>

      {/* 3: scaffali per ruolo */}
      <View
        style={styles.scaffali}
        onLayout={(e) => {
          posizioni.current.scaffali = e.nativeEvent.layout.y;
        }}>
        {conRosa ? (
          gruppi.map((g) => (
            <View
              key={g.ruolo + '-' + (categoria?.id ?? '') + '-' + (stagione?.id ?? '')}
              onLayout={(e) => {
                posizioni.current.ruoli[g.ruolo] = e.nativeEvent.layout.y;
              }}>
              <Scaffale gruppo={g} larghezza={width - 48} telefono={telefono} />
            </View>
          ))
        ) : pronto && stagione && categoria && !staff.length ? (
          <Text style={styles.vuoto}>Informazioni in aggiornamento.</Text>
        ) : null}
      </View>

      {/* 4: invito (.cta-banner) */}
      <View style={styles.invito}>
        <Text style={styles.invitoTitolo} accessibilityRole="header">
          Vuoi unirti a una delle nostre squadre?
        </Text>
        <Text style={styles.invitoTesto}>Contattaci e vieni a provare un allenamento gratuitamente, senza impegno.</Text>
        <Pressable style={styles.tasto} onPress={() => router.push('/unisciti-a-noi')} accessibilityRole="link">
          <Text style={styles.tastoTesto}>Vieni a giocare con noi</Text>
        </Pressable>
      </View>

      <Piede />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: sport.navyDeep },
  tutto: { flexGrow: 1 },
  testata: { backgroundColor: colors.navy, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 34, overflow: 'hidden' },
  briciole: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.corpo, fontSize: 13 },
  occhiello: { color: sport.azzurroDim, fontFamily: fonts.titolo, fontSize: 12.5, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  titolo: { color: colors.bianco, fontFamily: fonts.titolo, fontSize: 32, lineHeight: 36 },
  scelte: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 20 },
  stagioni: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)' },
  stagione: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8 },
  stagioneAttiva: { backgroundColor: colors.azzurroScuro },
  stagioneTesto: { color: 'rgba(255,255,255,0.6)', fontFamily: fonts.corpoForte, fontSize: 13 },
  stagioneTestoAttiva: { color: colors.bianco },
  filtri: { backgroundColor: 'rgba(5,14,31,0.96)', borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingVertical: 14 },
  filtriRiga: { gap: 10, paddingHorizontal: 24 },
  chip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.04)' },
  chipAttivo: { backgroundColor: colors.magenta, borderColor: colors.magenta },
  chipTesto: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.corpoForte, fontSize: 13 },
  chipTestoAttivo: { color: colors.bianco },
  scaffali: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 20 },
  vuoto: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.corpo, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  invito: { backgroundColor: colors.navy, paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
  invitoTitolo: { color: colors.bianco, fontFamily: fonts.titoloMedio, fontSize: 24, lineHeight: 29, textAlign: 'center', marginBottom: 16 },
  invitoTesto: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.corpo, fontSize: 17, lineHeight: 26, textAlign: 'center', maxWidth: 520, marginBottom: 32 },
  tasto: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 28, borderRadius: 3, backgroundColor: colors.azzurroScuro },
  tastoTesto: { color: colors.bianco, fontFamily: fonts.corpo, fontSize: 15 },
});
