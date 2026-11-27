// La barra delle partite in cima alla home del sito (js/partite-live.js, .partite-bar).
// Da telefono il sito mostra solo la colonna "Partite concluse" (style.css, max-width 640px).
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Partita } from '~/lib/dati';
import { formatData } from '~/lib/girone';
import { immagineLarga } from '~/lib/news';
import { colors, fonts } from '~/lib/theme';

const LOGO_VICTOR = require('../../../assets/images/logo.png');

/** Le partite della colonna "Partite concluse", con la stessa regola del sito. */
export function partiteStriscia(partite: Partita[]) {
  const prossime = partite
    .filter((p) => p.stato !== 'conclusa')
    .sort((a, b) => (a.data > b.data ? 1 : -1))
    .slice(0, 2);
  const concluse = partite
    .filter((p) => p.stato === 'conclusa')
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, 2);
  return concluse.length ? concluse : prossime.slice(2);
}

function Logo({ nome, logo }: { nome: string; logo: string }) {
  const victor = (nome || '').toLowerCase().trim() === 'victor volley';
  return (
    <View style={styles.logo}>
      {logo ? (
        <Image source={immagineLarga(logo, 160)} style={styles.logoImg} contentFit="contain" accessibilityLabel={nome} />
      ) : victor ? (
        <Image source={LOGO_VICTOR} style={styles.logoImg} contentFit="contain" accessibilityLabel={nome} />
      ) : (
        <Text style={styles.iniziale}>{(nome || '?').charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

function Squadra({ nome, logo, vince }: { nome: string; logo: string; vince?: boolean }) {
  return (
    <View style={styles.squadra}>
      <Logo nome={nome} logo={logo} />
      <Text style={[styles.nome, vince && styles.nomeVince]} numberOfLines={1}>
        {nome}
      </Text>
    </View>
  );
}

export function SchedaPartita({ p }: { p: Partita }) {
  const conclusa = p.stato === 'conclusa';
  const sc = p.setCasa ?? 0;
  const so = p.setOspite ?? 0;
  const vinceCasa = sc > so;
  return (
    <View style={styles.scheda} accessible accessibilityLabel={`${p.categoria}, ${p.squadraCasa} contro ${p.squadraOspite}` + (conclusa ? `, ${sc} a ${so}` : '')}>
      <View style={styles.alto}>
        <Text style={[styles.categoria, p.categoria === 'Prima Divisione' && styles.magenta]}>{p.categoria}</Text>
        <Text style={styles.data} numberOfLines={1}>
          {formatData(p.data, conclusa ? null : p.ora)}
        </Text>
      </View>
      <View style={styles.corpo}>
        <View style={styles.squadre}>
          <Squadra nome={p.squadraCasa} logo={p.logoCasa} vince={conclusa && vinceCasa} />
          <Squadra nome={p.squadraOspite} logo={p.logoOspite} vince={conclusa && !vinceCasa} />
        </View>
        {conclusa ? (
          <View style={styles.punti}>
            <Text style={styles.punto}>{sc}</Text>
            <Text style={styles.punto}>{so}</Text>
          </View>
        ) : (
          <View style={styles.vsCol}>
            <Text style={styles.vs}>VS</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function StrisciaPartite({ partite }: { partite: Partita[] }) {
  const voci = partiteStriscia(partite);
  return (
    <View style={styles.barra}>
      <Text style={styles.titolo}>Partite concluse</Text>
      {voci.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
          {voci.map((p) => (
            <SchedaPartita key={p.id} p={p} />
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.vuoto}>Nessun risultato disponibile.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { backgroundColor: colors.notte, paddingVertical: 10, paddingHorizontal: 16 },
  titolo: { fontFamily: fonts.corpoForte, fontSize: 9, letterSpacing: 1.1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 },
  fila: { gap: 8 },
  scheda: { width: 260, backgroundColor: '#0c2240', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, gap: 7 },
  alto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  categoria: { fontFamily: fonts.corpoForte, fontSize: 7, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.bianco, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(0,140,253,0.75)' },
  magenta: { backgroundColor: 'rgba(203,33,104,0.75)' },
  data: { flexShrink: 1, fontFamily: fonts.corpo, fontSize: 9, color: 'rgba(255,255,255,0.55)' },
  corpo: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  squadre: { flex: 1, minWidth: 0, gap: 5 },
  squadra: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  logo: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  logoImg: { width: '100%', height: '100%' },
  iniziale: { fontFamily: fonts.corpoForte, fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  nome: { flexShrink: 1, fontFamily: fonts.titoloMedio, fontSize: 11, color: colors.bianco, textTransform: 'uppercase' },
  nomeVince: { fontFamily: fonts.titolo },
  vsCol: { width: 28, alignItems: 'center', justifyContent: 'center' },
  vs: { fontFamily: fonts.corpoForte, fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  punti: { width: 28, gap: 5 },
  punto: { height: 26, lineHeight: 26, textAlign: 'center', fontFamily: fonts.titolo, fontSize: 15, color: colors.bianco },
  vuoto: { fontFamily: fonts.corpo, fontSize: 11, fontStyle: 'italic', color: 'rgba(255,255,255,0.3)', paddingVertical: 4 },
});
