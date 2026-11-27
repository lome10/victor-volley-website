// Riquadro accanto al video della Diretta (js/diretta.js): risultato finale da Set Point Pulse,
// oppure "Prossima diretta" / "Ultimo risultato" / nessuna diretta. Quando si gioca non c'e' (il punteggio e' nel video).
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { SquadraGirone } from '~/lib/dati';
import { catLabel, dataCorta, squadraInfo, type Tabellone } from '~/lib/diretta';
import { immagineLarga } from '~/lib/news';
import { colors, fonts } from '~/lib/theme';

const LOGO_VICTOR = require('../../../assets/images/logo.png');

function Logo({ nome, logo, grande }: { nome: string; logo: string; grande?: boolean }) {
  const victor = !logo && (nome || '').toLowerCase().trim() === 'victor volley';
  return (
    <View style={[styles.logo, grande && styles.logoGrande]}>
      {logo ? (
        <Image source={immagineLarga(logo, 160)} style={styles.pieno} contentFit="contain" accessibilityLabel={nome} />
      ) : victor ? (
        <Image source={LOGO_VICTOR} style={styles.pieno} contentFit="contain" />
      ) : (
        <Text style={styles.iniziale}>{(nome || '?').charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

function Squadra({ nome, logo, set, forte, grande }: { nome: string; logo: string; set?: number; forte?: boolean; grande?: boolean }) {
  return (
    <View style={styles.squadra}>
      <Logo nome={nome} logo={logo} grande={grande} />
      <Text style={[styles.nome, forte && styles.nomeForte]}>{nome}</Text>
      {set !== undefined ? <Text style={styles.set}>{set}</Text> : null}
    </View>
  );
}

export function TabelloneDiretta({ t, squadre }: { t: Tabellone; squadre: SquadraGirone[] }) {
  if (t.tipo === 'nascosto') return null;
  if (t.tipo === 'vuoto') {
    return (
      <View style={styles.box}>
        <Text style={styles.vuoto}>Nessuna diretta disponibile al momento.</Text>
      </View>
    );
  }
  if (t.tipo === 'finita') {
    const { j, cal } = t;
    const casa = squadraInfo(j.home!.name, squadre);
    const ospite = squadraInfo(j.away!.name, squadre);
    const meta = cal ? (cal.palazzetto ? cal.palazzetto + ' · ' : '') + dataCorta(cal.data, cal.ora) : '';
    return (
      <View style={styles.box}>
        <View style={styles.alto}>
          <Text style={styles.cat}>{(cal?.categoria && catLabel(cal.categoria)) || 'Risultato finale'}</Text>
          <Text style={styles.finale}>Partita conclusa</Text>
        </View>
        <View style={[styles.squadre, styles.squadreLive]}>
          <Squadra nome={casa.nome} logo={casa.logo} grande />
          <View style={styles.centro}>
            <Text style={styles.etichetta}>Set vinti</Text>
            <Text style={styles.setVinti} accessibilityLabel={`Set vinti ${j.home!.sets} a ${j.away!.sets}`}>
              {j.home!.sets}
              <Text style={styles.trattino}> – </Text>
              {j.away!.sets}
            </Text>
          </View>
          <Squadra nome={ospite.nome} logo={ospite.logo} grande />
        </View>
        {j.setHistory?.length ? (
          <View style={styles.chips} accessibilityLabel="Set conclusi">
            {j.setHistory.map((s, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipSet}>Set {i + 1}</Text>
                <Text style={styles.chipPunti}>
                  {s.home}–{s.away}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    );
  }
  const p = t.p;
  if (t.tipo === 'ultimo') {
    const sc = p.setCasa ?? 0;
    const so = p.setOspite ?? 0;
    return (
      <View style={styles.box}>
        <Text style={styles.etichettaAlta}>Ultimo risultato</Text>
        <View style={styles.squadre}>
          <Squadra nome={p.squadraCasa} logo={p.logoCasa} set={sc} forte={sc > so} />
          <View style={styles.centro}>
            <Text style={styles.etichetta}>Finale</Text>
          </View>
          <Squadra nome={p.squadraOspite} logo={p.logoOspite} set={so} forte={!(sc > so)} />
        </View>
        <Text style={styles.meta}>
          {catLabel(p.categoria)} · {dataCorta(p.data)}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <Text style={styles.etichettaAlta}>Prossima diretta</Text>
      <View style={styles.squadre}>
        <Squadra nome={p.squadraCasa} logo={p.logoCasa} />
        <View style={styles.centro}>
          <Text style={styles.etichetta}>vs</Text>
        </View>
        <Squadra nome={p.squadraOspite} logo={p.logoOspite} />
      </View>
      <Text style={styles.meta}>
        {catLabel(p.categoria)} · {dataCorta(p.data, p.ora)}
        {p.palazzetto ? ' · ' + p.palazzetto : ''}
      </Text>
      <Text style={styles.nota}>Il tabellone si attiva da solo quando inizia la partita.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pieno: { width: '100%', height: '100%' },
  box: { backgroundColor: colors.navy, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20 },
  vuoto: { fontFamily: fonts.corpo, fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', paddingVertical: 12 },
  alto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  cat: { fontFamily: fonts.corpoForte, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, overflow: 'hidden' },
  finale: { fontFamily: fonts.corpoExtra, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' },
  etichettaAlta: { fontFamily: fonts.corpoForte, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.azzurro, textAlign: 'center', marginBottom: 16 },
  squadre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 12 },
  squadreLive: { alignItems: 'flex-start' },
  squadra: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8 },
  logo: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoGrande: { width: 52, height: 52, borderRadius: 26 },
  iniziale: { fontFamily: fonts.corpoForte, fontSize: 20, color: 'rgba(255,255,255,0.6)' },
  nome: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.bianco, textAlign: 'center' },
  nomeForte: { fontFamily: fonts.corpoExtra },
  set: { fontFamily: fonts.titoloForte, fontSize: 32, color: colors.bianco },
  centro: { alignItems: 'center', gap: 6, paddingTop: 4 },
  etichetta: { fontFamily: fonts.corpo, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' },
  setVinti: { fontFamily: fonts.titoloForte, fontSize: 34, lineHeight: 36, color: colors.bianco, fontVariant: ['tabular-nums'] },
  trattino: { color: 'rgba(255,255,255,0.35)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 6 },
  chip: { alignItems: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  chipSet: { fontFamily: fonts.corpoMedio, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' },
  chipPunti: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.bianco, fontVariant: ['tabular-nums'] },
  meta: { marginTop: 16, fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  nota: { marginTop: 14, fontFamily: fonts.corpo, fontStyle: 'italic', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
});
