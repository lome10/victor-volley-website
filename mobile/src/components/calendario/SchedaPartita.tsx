// Scheda di una partita della Victor (.fixture-row del sito): si vede nelle categorie senza girone.
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconaCalendario, IconaLuogo, Logo } from '~/components/calendario/Icone';
import { conDatiValidi, dataScheda, esito, linkGoogleCalendar, passata, type PartitaCalendario } from '~/lib/calendario';
import { eVictor as isVV } from '~/lib/girone';
import { colors, fonts } from '~/lib/theme';

type Props = { partita: PartitaCalendario; prossima: boolean; oggi: string; strettoSotto900: boolean };

export function SchedaPartita({ partita: p, prossima, oggi, strettoSotto900 }: Props) {
  const inCasa = isVV(p.squadraCasa);
  const risultato = p.setCasa != null && p.setOspite != null;
  const e = esito(p);
  const vinceCasa = risultato && (p.setCasa as number) > (p.setOspite as number);
  const aggiungi = !passata(p, oggi) && conDatiValidi(p);

  const squadra = (nome: string, logo: string, victor: boolean, vince: boolean, set: number | null) => (
    <View style={styles.squadra}>
      <Logo url={logo} nome={nome} misura={22} raggio={5} carattere={11} />
      <Text style={[styles.nome, victor && styles.nomeVictor, vince && styles.nomeVince]} numberOfLines={1}>{nome}</Text>
      {risultato ? <Text style={[styles.set, e === 'vittoria' ? styles.vittoria : styles.sconfitta]}>{set}</Text> : null}
    </View>
  );

  const contenuto = (
    <>
      {prossima ? <Text style={styles.etichetta}>PROSSIMA PARTITA</Text> : null}
      <View style={styles.alto}>
        <Text style={styles.data}>{dataScheda(p.data, p.ora)}</Text>
        <Text style={[styles.tag, inCasa ? styles.tagCasa : styles.tagTrasferta]}>{inCasa ? 'Casa' : 'Trasferta'}</Text>
      </View>
      <View style={styles.squadre}>
        {squadra(p.squadraCasa, p.logoCasa, inCasa, vinceCasa, p.setCasa)}
        {squadra(p.squadraOspite, p.logoOspite, !inCasa, risultato && !vinceCasa, p.setOspite)}
      </View>
      <View style={[styles.luogo, strettoSotto900 && styles.luogoAcapo, aggiungi && styles.luogoConTasto]}>
        <View style={styles.luogoTesto}>
          <IconaLuogo colore="rgba(255,255,255,0.62)" />
          <Text style={styles.palazzetto} numberOfLines={1}>{p.palazzetto || '—'}</Text>
        </View>
        {aggiungi ? (
          <Pressable
            style={styles.tasto}
            onPress={() => Linking.openURL(linkGoogleCalendar({ data: p.data, ora: p.ora, casa: p.squadraCasa, ospite: p.squadraOspite, palazzetto: p.palazzetto, categoria: p.categoria }))}
            accessibilityRole="link"
            accessibilityLabel={'Aggiungi a Google Calendar: ' + p.squadraCasa + ' - ' + p.squadraOspite}>
            <IconaCalendario colore={colors.azzurro} />
            <Text style={styles.tastoTesto}>Aggiungi al calendario</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );

  if (prossima) {
    return (
      <LinearGradient colors={['rgba(0,140,253,0.14)', 'rgba(255,255,255,0.03)']} locations={[0, 0.55]} start={{ x: 0, y: 0.3 }} end={{ x: 1, y: 0.7 }} style={[styles.scheda, styles.schedaProssima]}>
        {contenuto}
      </LinearGradient>
    );
  }
  return <View style={styles.scheda}>{contenuto}</View>;
}

const styles = StyleSheet.create({
  scheda: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 9 },
  schedaProssima: { backgroundColor: 'transparent', borderColor: 'rgba(0,140,253,0.35)', paddingTop: 30 },
  etichetta: { position: 'absolute', top: 10, left: 16, fontFamily: fonts.titoloForte, fontSize: 9.5, letterSpacing: 0.9, color: colors.azzurro },
  alto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  data: { flexShrink: 1, fontFamily: fonts.titoloMedio, fontSize: 12, letterSpacing: 0.24, color: 'rgba(255,255,255,0.7)' },
  tag: { fontFamily: fonts.corpoMedio, fontSize: 11, lineHeight: 13, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden' },
  tagCasa: { color: '#7cc8ff', backgroundColor: 'rgba(0,140,253,0.16)' },
  tagTrasferta: { color: '#f59bbf', backgroundColor: 'rgba(203,33,104,0.18)' },
  squadre: { gap: 6 },
  squadra: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  nome: { flex: 1, minWidth: 0, fontFamily: fonts.corpoMedio, fontSize: 14, color: 'rgba(255,255,255,0.55)' },
  nomeVictor: { color: colors.bianco },
  nomeVince: { fontFamily: fonts.corpoExtra, color: colors.bianco },
  set: { width: 24, textAlign: 'center', fontFamily: fonts.titoloForte, fontSize: 16, color: colors.bianco },
  vittoria: { color: '#5fd97a' },
  sconfitta: { color: '#e05c92' },
  luogo: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 8, marginTop: 1, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  luogoAcapo: { flexWrap: 'wrap' },
  luogoConTasto: { paddingTop: 2 },
  luogoTesto: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  palazzetto: { flex: 1, minWidth: 0, fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.62)' },
  tasto: { marginLeft: 'auto', flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 12, borderRadius: 99, backgroundColor: 'rgba(0,140,253,0.12)', borderWidth: 1, borderColor: 'rgba(0,140,253,0.3)' },
  tastoTesto: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.azzurro },
});
