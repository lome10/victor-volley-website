// "Prossime partite" della home del sito (js/girone.js): scelta categoria, card della prossima partita e classifica.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Sezione, Tasto } from '~/components/home/Sezione';
import type { Partita, Pubblico, SquadraGirone } from '~/lib/dati';
import {
  FINESTRA,
  calcolaClassifica,
  contoAllaRovescia,
  eVictor,
  finestraClassifica,
  formatData,
  gironiRisolti,
  prossimaPartita,
  squadraById,
  type GironeRisolto,
} from '~/lib/girone';
import { immagineLarga } from '~/lib/news';
import { colors, fonts } from '~/lib/theme';

export const CATEGORIE = ['Prima Divisione', 'Under 19'] as const;

function LogoGrande({ nome, logo }: { nome: string; logo: string }) {
  return (
    <View style={styles.gfLogo}>
      {logo ? (
        <Image source={immagineLarga(logo, 240)} style={styles.pieno} contentFit="contain" accessibilityLabel={nome} />
      ) : (
        <Text style={styles.gfIniziale}>{(nome || '?').charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

function ContoAllaRovescia({ data, ora }: { data: string; ora: string }) {
  const [adesso, setAdesso] = useState(() => new Date());
  // Come il sito: si aggiorna ogni minuto.
  useEffect(() => {
    const t = setInterval(() => setAdesso(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const c = contoAllaRovescia(data, ora, adesso);
  if (!c) return null;
  const unita = (n: string, etichetta: string) => (
    <View style={styles.cdUnita} key={etichetta}>
      <Text style={styles.cdNum}>{n}</Text>
      <Text style={styles.cdEtichetta}>{etichetta}</Text>
    </View>
  );
  return <View style={styles.cd}>{[unita(c.giorni, 'GG'), unita(c.ore, 'ORE'), unita(c.minuti, 'MIN')]}</View>;
}

/** La card .gf-card: in casa la Victor a sinistra, in trasferta a destra (come nel referto). */
export function CardProssima({ p }: { p: Partita }) {
  const casa = eVictor(p.squadraCasa);
  const sinistra = { nome: p.squadraCasa, logo: p.logoCasa };
  const destra = { nome: p.squadraOspite, logo: p.logoOspite };
  return (
    <LinearGradient colors={['#0d2240', '#07111e']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={styles.gf}>
      <LinearGradient
        colors={['transparent', casa ? 'rgba(203,33,104,0.12)' : 'rgba(0,130,200,0.10)']}
        style={styles.gfBagliore}
        pointerEvents="none"
      />
      <View style={styles.gfAlto}>
        <Text style={[styles.badge, styles.badgeCat]}>{p.categoria || 'Prima Divisione'}</Text>
        <Text style={[styles.badge, casa ? styles.badgeCasa : styles.badgeTrasferta]}>{casa ? 'Casa' : 'Trasferta'}</Text>
        <Text style={styles.gfData}>{formatData(p.data, p.ora)}</Text>
      </View>
      <View style={styles.gfCorpo}>
        <View style={styles.gfSquadra}>
          <LogoGrande {...sinistra} />
          <Text style={[styles.gfNome, casa && styles.gfNomeVV]}>{sinistra.nome}</Text>
        </View>
        <Text style={styles.gfVs}>VS</Text>
        <View style={[styles.gfSquadra, styles.gfSquadraDestra]}>
          <LogoGrande {...destra} />
          <Text style={[styles.gfNome, styles.destra, !casa && styles.gfNomeVV]}>{destra.nome}</Text>
        </View>
      </View>
      {p.palazzetto ? (
        <View style={styles.gfLuogo}>
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth={2}>
            <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <Circle cx={12} cy={10} r={3} />
          </Svg>
          <Text style={styles.gfLuogoTesto}>{p.palazzetto}</Text>
        </View>
      ) : null}
      {p.ora ? <ContoAllaRovescia data={p.data} ora={p.ora} /> : null}
    </LinearGradient>
  );
}

function LogoPiccolo({ s }: { s: SquadraGirone }) {
  return s.logo ? (
    <Image source={immagineLarga(s.logo, 160)} style={styles.gcLogo} contentFit="contain" />
  ) : (
    <View style={styles.gcLogoInit}>
      <Text style={styles.gcLogoInitTesto}>{(s.nome || '?').charAt(0)}</Text>
    </View>
  );
}

/** Il pannello .gc-panel: 5 squadre con la Victor al centro. Da telefono il sito nasconde V e P. */
export function PannelloClassifica({ girone }: { girone: GironeRisolto }) {
  const classifica = calcolaClassifica(girone);
  const casa = girone.squadre.find((s) => s.home);
  const homeId = casa ? casa.id : null;
  const fin = finestraClassifica(classifica, homeId);
  return (
    <View style={styles.gc}>
      <View style={styles.gcTesta}>
        <Text style={styles.gcTitolo}>Classifica</Text>
        <Text style={styles.gcSub}>
          {girone.categoria}
          {girone.girone ? ' · Girone ' + girone.girone : ''}
        </Text>
      </View>
      <View style={[styles.gcRiga, styles.gcRigaTesta]}>
        <Text style={[styles.gcTh, styles.gcPos]}>#</Text>
        <Text style={[styles.gcTh, styles.gcNomeCol]}>Squadra</Text>
        <Text style={[styles.gcTh, styles.gcPts]}>Pt</Text>
      </View>
      {classifica.slice(fin.da, fin.a).map((r, i) => {
        const s = squadraById(girone.squadre, r.id);
        const vv = r.id === homeId;
        const ultima = fin.da + i === fin.a - 1;
        return (
          <View key={r.id} style={[styles.gcRiga, vv && styles.gcRigaVV, !ultima && styles.gcBordo]}>
            <Text style={[styles.gcTd, styles.gcPos, styles.gcPosTesto]}>{fin.da + i + 1}</Text>
            <View style={[styles.gcNomeCol, styles.gcNome]}>
              <LogoPiccolo s={s} />
              <Text style={[styles.gcTd, styles.gcNomeTesto, vv && styles.gcNomeVV]} numberOfLines={1}>
                {s.nome}
              </Text>
            </View>
            <Text style={[styles.gcTd, styles.gcPts, styles.gcPtsTesto, vv && styles.gcPtsVV]}>{r.pts}</Text>
          </View>
        );
      })}
      <View style={styles.gcPiede}>
        <Text style={styles.gcPiedeTesto}>
          {girone.stagione}
          {classifica.length > FINESTRA ? ' · ' : ''}
          {classifica.length > FINESTRA ? (
            <Text style={styles.link} onPress={() => router.push('/calendario')} accessibilityRole="link">
              Classifica completa
            </Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

export function ProssimePartite({ dati }: { dati: Pubblico }) {
  const [cat, setCat] = useState<string>(CATEGORIE[0]);
  const girone = gironiRisolti(dati.girone).find((g) => g.categoria === cat);
  const prossima = prossimaPartita(dati.partite, dati.stagioni, cat);
  return (
    <Sezione titolo="Prossime partite" sottotitolo="Il calendario aggiornato delle nostre squadre">
      <View style={styles.scelta} accessibilityRole="tablist">
        {CATEGORIE.map((c) => {
          const attiva = c === cat;
          return (
            <Pressable key={c} style={[styles.sceltaTasto, attiva && styles.sceltaAttiva]} onPress={() => setCat(c)} accessibilityRole="tab" accessibilityState={{ selected: attiva }}>
              <Text style={[styles.sceltaTesto, attiva && styles.sceltaTestoAttivo]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.riga}>
        {prossima ? (
          <CardProssima p={prossima} />
        ) : (
          <LinearGradient colors={['#0d2240', '#07111e']} style={styles.gf}>
            <Text style={styles.gfVuoto}>Calendario in arrivo: le date di {cat} saranno pubblicate appena disponibili.</Text>
          </LinearGradient>
        )}
        {girone && girone.squadre.length > 1 ? <PannelloClassifica girone={girone} /> : null}
      </View>
      <View style={styles.cta}>
        <Tasto testo="Vedi tutto il calendario" tipo="bordo" onPress={() => router.push('/calendario')} />
      </View>
    </Sezione>
  );
}

const styles = StyleSheet.create({
  pieno: { width: '100%', height: '100%' },
  scelta: { flexDirection: 'row', alignSelf: 'center', gap: 4, padding: 4, borderRadius: 12, backgroundColor: 'rgba(13,34,64,0.07)', marginBottom: 24 },
  sceltaTasto: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 22, borderRadius: 9 },
  sceltaAttiva: { backgroundColor: colors.navy },
  sceltaTesto: { fontFamily: fonts.titoloMedio, fontSize: 14, color: '#666' },
  sceltaTestoAttivo: { color: colors.bianco },
  riga: { gap: 20, marginBottom: 36 },
  cta: { marginTop: -4 },
  // Card prossima partita
  gf: { borderRadius: 16, paddingTop: 26, paddingHorizontal: 28, paddingBottom: 22, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  gfBagliore: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  gfAlto: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 28 },
  badge: { fontFamily: fonts.corpoForte, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, overflow: 'hidden' },
  badgeCat: { backgroundColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.65)' },
  badgeCasa: { backgroundColor: 'rgba(203,33,104,0.25)', color: '#f07aaa' },
  badgeTrasferta: { backgroundColor: 'rgba(0,140,253,0.20)', color: '#70c2ff' },
  // Da telefono la data va su una riga a se'.
  gfData: { flexBasis: '100%', fontFamily: fonts.corpoForte, fontSize: 12, letterSpacing: 0.5, color: 'rgba(255,255,255,0.45)' },
  gfCorpo: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  gfSquadra: { flex: 1, alignItems: 'flex-start', gap: 10 },
  gfSquadraDestra: { alignItems: 'flex-end' },
  gfLogo: { width: 54, height: 54, borderRadius: 10, padding: 6, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  gfIniziale: { fontFamily: fonts.titolo, fontSize: 22, color: '#0d2240' },
  gfNome: { fontFamily: fonts.corpo, fontSize: 17, lineHeight: 18, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' },
  gfNomeVV: { fontFamily: fonts.titolo, color: colors.bianco },
  destra: { textAlign: 'right' },
  gfVs: { fontFamily: fonts.titolo, fontSize: 28, color: 'rgba(255,255,255,0.12)' },
  gfLuogo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  gfLuogoTesto: { flexShrink: 1, fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.40)' },
  gfVuoto: { paddingVertical: 40, paddingHorizontal: 20, fontFamily: fonts.corpo, fontSize: 14, textAlign: 'center', color: 'rgba(255,255,255,0.40)' },
  cd: { flexDirection: 'row', gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  cdUnita: { minWidth: 54, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
  cdNum: { fontFamily: fonts.titolo, fontSize: 22, lineHeight: 24, color: colors.bianco },
  cdEtichetta: { fontFamily: fonts.corpoForte, fontSize: 9, letterSpacing: 0.9, color: 'rgba(255,255,255,0.30)', marginTop: 3 },
  // Classifica
  gc: { backgroundColor: colors.bianco, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  gcTesta: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f2' },
  gcTitolo: { fontFamily: fonts.titolo, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: colors.navy },
  gcSub: { fontFamily: fonts.corpo, fontSize: 11, color: '#6b6b6b', marginTop: 1 },
  gcRiga: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  gcRigaTesta: { paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#f0f0f2' },
  gcRigaVV: { backgroundColor: 'rgba(5,48,99,0.04)' },
  gcBordo: { borderBottomWidth: 1, borderBottomColor: '#f6f6f8' },
  gcTh: { fontFamily: fonts.corpoForte, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: '#6b6b6b' },
  gcTd: { fontFamily: fonts.corpo, fontSize: 13, color: '#333', paddingVertical: 10 },
  gcPos: { width: 28, textAlign: 'center' },
  gcPosTesto: { fontSize: 11, color: '#767676' },
  gcNomeCol: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  gcNome: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  gcNomeTesto: { flexShrink: 1 },
  gcNomeVV: { fontFamily: fonts.corpoForte, color: colors.navy },
  gcPts: { width: 36, textAlign: 'center' },
  gcPtsTesto: { fontFamily: fonts.corpoForte, color: '#111' },
  gcPtsVV: { color: colors.azzurro },
  gcLogo: { width: 20, height: 20, borderRadius: 3 },
  gcLogoInit: { width: 20, height: 20, borderRadius: 3, backgroundColor: '#e8edf2', alignItems: 'center', justifyContent: 'center' },
  gcLogoInitTesto: { fontFamily: fonts.corpoForte, fontSize: 10, color: '#555' },
  gcPiede: { paddingVertical: 9, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#f0f0f2' },
  gcPiedeTesto: { fontFamily: fonts.corpo, fontSize: 11, color: '#767676', textAlign: 'right' },
  link: { color: colors.azzurro },
});
