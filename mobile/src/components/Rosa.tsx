// Pezzi della pagina Squadre del sito (css/squadre.css): scheda giocatore, staff a nastro, scaffale per ruolo.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import type { Giocatore, Persona } from '~/lib/dati';
import { fuoco, immagineLarga } from '~/lib/news';
import { iniziali, nomeRuolo, type Gruppo } from '~/lib/squadre';
import { colors, fonts } from '~/lib/theme';

export const SCHEDA = 160;
const SPAZIO_SCORRE = 14;

/** Colori del sito: --sport-* in css/style.css. */
export const sport = {
  navyDeep: '#050e1f',
  azzurroDim: '#3aa6ff',
  magentaDim: '#e05c92',
  freddo: ['#0a2c57', '#0d1830', '#051022'] as const,
  caldo: ['#5a1638', '#33112c', '#150a1c'] as const,
};
/** linear-gradient(158deg, ...) del sito. */
const ANGOLO = { start: { x: 0.31, y: 0.04 }, end: { x: 0.69, y: 0.96 } };

function Faccia({ p, iniziale }: { p: Persona; iniziale: object }) {
  if (p.photo) {
    return <Image source={immagineLarga(p.photo, 500)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={fuoco(p.photoFocus || '50% 25%')} />;
  }
  return (
    <View style={[StyleSheet.absoluteFill, styles.centro]}>
      <Text style={iniziale}>{iniziali(p.name)}</Text>
    </View>
  );
}

export function SchedaGiocatore({ p, caldo, larghezza }: { p: Giocatore; caldo: boolean; larghezza: number }) {
  const ruolo = nomeRuolo(p.role, p.gender);
  return (
    <View style={[styles.scheda, { width: larghezza, height: (larghezza * 4) / 3 }]} accessible accessibilityLabel={[p.number ? 'Numero ' + p.number : '', p.name, ruolo].filter(Boolean).join(', ')}>
      <LinearGradient colors={caldo ? sport.caldo : sport.freddo} locations={[0, 0.55, 1]} {...ANGOLO} style={StyleSheet.absoluteFill} />
      <Faccia p={p} iniziale={styles.inizialeGrande} />
      {p.number ? <Text style={styles.numeroFantasma}>{p.number}</Text> : null}
      {p.number ? (
        <View style={styles.numero}>
          <Text style={styles.numeroTesto}>{p.number}</Text>
        </View>
      ) : null}
      <LinearGradient colors={['transparent', 'rgba(3,8,18,0.55)', 'rgba(3,8,18,0.94)']} locations={[0, 0.45, 1]} style={styles.velo}>
        <Text style={styles.nome}>{p.name}</Text>
        <Text style={[styles.ruolo, { color: caldo ? sport.magentaDim : sport.azzurroDim }]}>{ruolo}</Text>
      </LinearGradient>
    </View>
  );
}

function SchedaStaff({ s }: { s: Persona }) {
  return (
    <View style={styles.staff} accessible accessibilityLabel={s.name + ', ' + s.role}>
      <View style={styles.avatar}>
        <LinearGradient colors={sport.freddo} locations={[0, 0.55, 1]} {...ANGOLO} style={StyleSheet.absoluteFill} />
        <Faccia p={s} iniziale={styles.inizialeStaff} />
      </View>
      <Text style={styles.staffNome}>{s.name}</Text>
      <Text style={styles.staffRuolo}>{s.role}</Text>
    </View>
  );
}

/** "Panchina / Staff tecnico": cerchi in fila con la linea tratteggiata dietro. */
export function StrisciaStaff({ staff }: { staff: Persona[] }) {
  const [largo, setLargo] = useState(0);
  return (
    <LinearGradient colors={[colors.navy, sport.navyDeep]} style={styles.zonaStaff}>
      <Text style={styles.occhiello}>Panchina</Text>
      <Text style={styles.titoloSezione} accessibilityRole="header">Staff tecnico</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.striscia} onLayout={(e) => setLargo(e.nativeEvent.layout.width)}>
          {largo > 68 ? (
            <Svg style={styles.tratteggio} width={largo - 68} height={2}>
              <Line x1={0} y1={1} x2={largo - 68} y2={1} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="6 6" />
            </Svg>
          ) : null}
          {staff.map((s, i) => (
            <SchedaStaff key={s.id ?? i} s={s} />
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

/** Un ruolo: titolo e schede. Su telefono, con piu' di due schede, scorre di lato e parte centrato sulla seconda. */
export function Scaffale({ gruppo, larghezza, telefono }: { gruppo: Gruppo<Giocatore>; larghezza: number; telefono: boolean }) {
  const scorre = telefono && gruppo.persone.length > 2;
  // Parte centrato sulla seconda scheda come il sito; contentOffset vale solo su iPhone, quindi scrollTo una volta sola.
  const scaffale = useRef<ScrollView>(null);
  const centrato = useRef(false);
  const margine = (larghezza - SCHEDA) / 2;
  const colonne = Math.max(1, Math.floor((larghezza + 20) / (SCHEDA + 20)));
  const misura = telefono ? SCHEDA : Math.floor((larghezza - 20 * (colonne - 1)) / colonne);
  return (
    <View style={styles.scaffale}>
      <Text style={styles.titoloRuolo} accessibilityRole="header">{gruppo.nome}</Text>
      {scorre ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SCHEDA + SPAZIO_SCORRE}
          decelerationRate="fast"
          ref={scaffale}
          onContentSizeChange={() => {
            if (centrato.current) return;
            centrato.current = true;
            scaffale.current?.scrollTo({ x: SCHEDA + SPAZIO_SCORRE, animated: false });
          }}
          style={{ marginHorizontal: -24 }}
          contentContainerStyle={{ paddingHorizontal: margine + 24, gap: SPAZIO_SCORRE, paddingVertical: 6 }}>
          {gruppo.persone.map((p, i) => (
            <SchedaGiocatore key={p.id ?? i} p={p} caldo={gruppo.caldo} larghezza={SCHEDA} />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.griglia, { gap: 20 }]}>
          {gruppo.persone.map((p, i) => (
            <SchedaGiocatore key={p.id ?? i} p={p} caldo={gruppo.caldo} larghezza={misura} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { alignItems: 'center', justifyContent: 'center' },
  scheda: { borderRadius: 16, overflow: 'hidden' },
  inizialeGrande: { color: 'rgba(255,255,255,0.22)', fontFamily: fonts.titoloForte, fontSize: 44, lineHeight: 50 },
  numeroFantasma: {
    position: 'absolute', right: -10, top: -9, color: 'rgba(255,255,255,0.14)', fontFamily: fonts.titoloForte,
    fontSize: 86, lineHeight: 86, letterSpacing: -3.4,
  },
  numero: {
    position: 'absolute', top: 10, left: 10, width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  numeroTesto: { color: colors.bianco, fontFamily: fonts.titoloForte, fontSize: 12, lineHeight: 14 },
  velo: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '56%', justifyContent: 'flex-end', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  nome: { color: colors.bianco, fontFamily: fonts.corpoExtra, fontSize: 14.5, lineHeight: 17 },
  ruolo: { fontFamily: fonts.corpoForte, fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase', marginTop: 3 },
  zonaStaff: { paddingTop: 34, paddingBottom: 40, paddingHorizontal: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  occhiello: { color: sport.azzurroDim, fontFamily: fonts.titolo, fontSize: 12.5, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  titoloSezione: { color: colors.bianco, fontFamily: fonts.titoloForte, fontSize: 22, lineHeight: 26, marginBottom: 22 },
  striscia: { flexDirection: 'row', gap: 28, paddingVertical: 4, paddingHorizontal: 2 },
  tratteggio: { position: 'absolute', left: 34, top: 34 },
  staff: { width: 120, alignItems: 'center' },
  avatar: {
    width: 68, height: 68, borderRadius: 34, overflow: 'hidden', marginBottom: 12, borderWidth: 3, borderColor: sport.navyDeep,
    alignItems: 'center', justifyContent: 'center',
  },
  inizialeStaff: { color: 'rgba(255,255,255,0.55)', fontFamily: fonts.titoloForte, fontSize: 22, lineHeight: 26 },
  staffNome: { color: colors.bianco, fontFamily: fonts.corpoForte, fontSize: 13.5, textAlign: 'center' },
  staffRuolo: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.corpo, fontSize: 11, lineHeight: 14, marginTop: 3, textAlign: 'center' },
  scaffale: { marginBottom: 44 },
  titoloRuolo: { color: colors.bianco, fontFamily: fonts.titoloForte, fontSize: 20, lineHeight: 24, marginBottom: 16 },
  griglia: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 6 },
});
