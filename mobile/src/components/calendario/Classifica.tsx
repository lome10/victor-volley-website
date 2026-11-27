// Classifica intera del girone (.stand-panel del pannello Calendario del sito).
import { StyleSheet, Text, View } from 'react-native';

import { Logo } from '~/components/calendario/Icone';
import { calcolaClassifica, squadraById, type GironeRisolto } from '~/lib/girone';
import { colors, fonts } from '~/lib/theme';

const AZZURRO_TENUE = '#3aa6ff';

export function Classifica({ girone, stretto }: { girone: GironeRisolto; stretto: boolean }) {
  const righe = calcolaClassifica(girone);
  const casa = girone.squadre.find((s) => s.home)?.id ?? null;
  const sotto = (girone.girone ? 'Girone ' + girone.girone : '') + (girone.stagione ? ' · Stagione ' + girone.stagione : '');
  const cella = stretto ? styles.cellaStretta : null;
  return (
    <View style={styles.pannello}>
      <View style={styles.testa}>
        <Text style={styles.titolo}>CLASSIFICA</Text>
        <Text style={styles.sotto}>{sotto}</Text>
      </View>
      <View style={[styles.riga, styles.intestazione, cella]}>
        <Text style={[styles.th, styles.pos]}>#</Text>
        <Text style={[styles.th, styles.squadra]}>SQUADRA</Text>
        <Text style={[styles.th, styles.stat]} accessibilityLabel="Vittorie">V</Text>
        <Text style={[styles.th, styles.stat]} accessibilityLabel="Sconfitte">P</Text>
        <Text style={[styles.th, styles.punti]}>PT</Text>
      </View>
      {righe.map((r, i) => {
        const s = squadraById(girone.squadre, r.id);
        const victor = r.id === casa;
        return (
          <View key={r.id} style={[styles.riga, i > 0 && styles.bordo, victor && styles.rigaVictor, cella]}>
            <Text style={[styles.td, styles.pos, styles.posTesto]}>{i + 1}</Text>
            <View style={[styles.squadra, styles.nomeRiga]}>
              <Logo url={s.logo} nome={s.nome} misura={22} raggio={5} carattere={10} />
              <Text style={[styles.td, styles.nome, victor && styles.victor]} numberOfLines={1}>{s.nome}</Text>
            </View>
            <Text style={[styles.td, styles.stat, styles.statTesto]}>{r.v}</Text>
            <Text style={[styles.td, styles.stat, styles.statTesto]}>{r.p}</Text>
            <Text style={[styles.td, styles.punti, styles.puntiTesto, victor && styles.victor]}>{r.pts}</Text>
          </View>
        );
      })}
      <Text style={styles.piede}>{girone.stagione}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pannello: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden' },
  testa: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  titolo: { fontFamily: fonts.titoloForte, fontSize: 13, letterSpacing: 1.04, color: colors.bianco },
  sotto: { fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.68)', marginTop: 3 },
  riga: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 10, paddingRight: 16 },
  cellaStretta: { paddingVertical: 10 },
  intestazione: {},
  bordo: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  rigaVictor: { backgroundColor: 'rgba(0,140,253,0.08)' },
  th: { fontFamily: fonts.titolo, fontSize: 10, letterSpacing: 0.8, color: 'rgba(255,255,255,0.6)' },
  td: { color: colors.bianco, fontSize: 13 },
  pos: { width: 34, textAlign: 'center' },
  posTesto: { fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.62)' },
  squadra: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  nomeRiga: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { flexShrink: 1, minWidth: 0, fontFamily: fonts.corpoMedio },
  victor: { fontFamily: fonts.corpoExtra, color: AZZURRO_TENUE },
  stat: { width: 34, textAlign: 'center' },
  statTesto: { fontFamily: fonts.corpo, color: 'rgba(255,255,255,0.72)' },
  punti: { width: 48, textAlign: 'center' },
  puntiTesto: { fontFamily: fonts.corpoExtra },
  piede: { paddingVertical: 12, paddingHorizontal: 22, fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.55)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
});
