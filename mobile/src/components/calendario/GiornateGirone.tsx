// Calendario del girone (.cal-girone-wrap del sito): card "Prossima partita" e tutte le giornate.
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconaCalendario, IconaLuogo, Logo } from '~/components/calendario/Icone';
import { dataBreve, dataEstesa, giornate, linkGoogleCalendar, quantoManca, type Giornata } from '~/lib/calendario';
import { squadraById } from '~/lib/girone';
import type { PartitaGirone, SquadraGirone } from '~/lib/dati';
import { colors, fonts } from '~/lib/theme';

type Props = {
  partite: PartitaGirone[];
  squadre: SquadraGirone[];
  categoria: string;
  oggi: string;
  /** Schermo da 600 px in su: righe a 4 colonne con i loghi (sotto: data in alto, niente loghi). */
  largo: boolean;
  /** Posizione della card della prossima partita dentro questo blocco (per la barra fissa). */
  posizioneProssima?: (y: number) => void;
};

export function GiornateGirone({ partite, squadre, categoria, oggi, largo, posizioneProssima }: Props) {
  const { giornate: elenco, prossima } = giornate(partite, squadre, oggi);
  if (!elenco.length) return null;
  return (
    <View style={styles.blocco}>
      {prossima ? (
        <View onLayout={(e) => posizioneProssima?.(e.nativeEvent.layout.y)}>
          <CardProssima m={prossima} squadre={squadre} categoria={categoria} oggi={oggi} />
        </View>
      ) : null}
      {elenco.map((g, i) => (
        <GiornataVista key={g.numero} g={g} squadre={squadre} largo={largo} primo={i === 0} />
      ))}
    </View>
  );
}

function CardProssima({ m, squadre, categoria, oggi }: { m: PartitaGirone; squadre: SquadraGirone[]; categoria: string; oggi: string }) {
  const casa = squadraById(squadre, m.squadra_casa), ospite = squadraById(squadre, m.squadra_ospite);
  const link = linkGoogleCalendar({ data: m.data, ora: m.ora, casa: casa.nome, ospite: ospite.nome, palazzetto: m.palazzetto, categoria });
  const squadra = (s: SquadraGirone) => (
    <View style={styles.cardSquadra}>
      <Logo url={s.logo} nome={s.nome} misura={64} raggio={12} margine={4} carattere={24} />
      <Text style={[styles.cardNome, s.home && styles.cardNomeVictor]}>{s.nome}</Text>
    </View>
  );
  return (
    <View style={styles.card}>
      <View style={styles.cardTesta}>
        <Text style={styles.cardEtichetta}>PROSSIMA PARTITA</Text>
        <Text style={[styles.cardEtichetta, styles.punto]}>·</Text>
        <Text style={[styles.cardEtichetta, styles.manca]}>{quantoManca(m.data, oggi).toUpperCase()}</Text>
      </View>
      <View style={styles.cardPartita}>
        {squadra(casa)}
        <Text style={styles.vs}>VS</Text>
        {squadra(ospite)}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardInfoTesto}>{dataEstesa(m.data, m.ora)}</Text>
        {m.palazzetto ? (
          <View style={styles.cardLuogo}>
            <IconaLuogo colore="rgba(255,255,255,0.85)" misura={14} />
            <Text style={[styles.cardInfoTesto, styles.ristretto]}>{m.palazzetto}</Text>
          </View>
        ) : null}
      </View>
      <Pressable style={[styles.tasto, styles.tastoCard]} onPress={() => Linking.openURL(link)} accessibilityRole="link">
        <IconaCalendario colore={colors.azzurro} />
        <Text style={[styles.tastoTesto, { fontSize: 13 }]}>Aggiungi al calendario</Text>
      </Pressable>
    </View>
  );
}

function GiornataVista({ g, squadre, largo, primo }: { g: Giornata; squadre: SquadraGirone[]; largo: boolean; primo: boolean }) {
  return (
    <View style={!primo && styles.giornata}>
      <View style={styles.giornataTesta}>
        <Text style={[styles.giornataTitolo, !largo && { fontSize: 16 }]} accessibilityRole="header">{g.numero ? g.numero + 'ª giornata' : 'Partite'}</Text>
        {g.intervallo ? <Text style={styles.giornataDate}>{g.intervallo}</Text> : null}
      </View>
      <View style={styles.lista}>
        {g.partite.map((m) => <Riga key={m.id || m.squadra_casa + m.squadra_ospite} m={m} squadre={squadre} largo={largo} />)}
      </View>
      {g.riposa.length ? <Text style={styles.riposa}>Riposa: {g.riposa.join(', ')}</Text> : null}
    </View>
  );
}

function Riga({ m, squadre, largo }: { m: PartitaGirone; squadre: SquadraGirone[]; largo: boolean }) {
  const casa = squadraById(squadre, m.squadra_casa), ospite = squadraById(squadre, m.squadra_ospite);
  const victor = casa.home || ospite.home;
  const risultato = m.set_casa != null && m.set_ospite != null;
  const vinceCasa = risultato && (m.set_casa as number) > (m.set_ospite as number);
  // Come il sito: "Aggiungi" sulle partite Victor ancora da giocare, senza la categoria nel titolo dell'evento.
  const aggiungi = victor && !risultato && /^\d{4}-\d{2}-\d{2}$/.test(m.data || '');

  const squadra = (s: SquadraGirone, lato: 'casa' | 'ospite', vince: boolean) => (
    <View style={[styles.squadra, lato === 'casa' && styles.squadraCasa]}>
      {largo ? <Logo url={s.logo} nome={s.nome} misura={28} raggio={6} carattere={12} /> : null}
      <Text
        style={[styles.nome, lato === 'casa' && styles.nomeCasa, victor && styles.nomeRigaVictor, vince && styles.nomeForte, s.home && styles.nomeForte]}
        numberOfLines={1}>
        {s.nome}
      </Text>
    </View>
  );
  const quando = <Text style={[styles.quando, victor && styles.quandoVictor, largo && styles.quandoLargo]}>{dataBreve(m.data, m.ora)}</Text>;
  const luogo = m.palazzetto || aggiungi ? (
    <View style={[styles.luogo, largo && styles.luogoLargo]}>
      {m.palazzetto ? (
        <>
          <IconaLuogo colore="rgba(255,255,255,0.62)" />
          <Text style={styles.palazzetto} numberOfLines={1}>{m.palazzetto}</Text>
        </>
      ) : null}
      {aggiungi ? (
        <Pressable
          style={styles.tasto}
          onPress={() => Linking.openURL(linkGoogleCalendar({ data: m.data, ora: m.ora, casa: casa.nome, ospite: ospite.nome, palazzetto: m.palazzetto }))}
          accessibilityRole="link"
          accessibilityLabel={'Aggiungi a Google Calendar: ' + casa.nome + ' - ' + ospite.nome}>
          <IconaCalendario colore={colors.azzurro} />
          <Text style={styles.tastoTesto}>Aggiungi</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const centro = (
    <View style={styles.squadre}>
      {squadra(casa, 'casa', vinceCasa)}
      <Text style={[styles.punteggio, { width: largo ? 46 : 40 }]}>{risultato ? m.set_casa + ' – ' + m.set_ospite : 'vs'}</Text>
      {squadra(ospite, 'ospite', risultato && !vinceCasa)}
    </View>
  );

  return (
    <View style={[styles.riga, victor && styles.rigaVictor, !largo && styles.rigaStretta]}>
      {largo ? (
        <>
          <View style={styles.rigaLarga}>
            {quando}
            <View style={styles.flex}>{centro}</View>
          </View>
          {luogo ? <View style={styles.sottoLargo}>{luogo}</View> : null}
        </>
      ) : (
        <>
          {quando}
          {centro}
          {luogo}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blocco: { paddingTop: 22, paddingBottom: 8, paddingHorizontal: 2 },
  flex: { flex: 1, minWidth: 0 },
  card: { gap: 14, marginBottom: 18, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 14, backgroundColor: 'rgba(0,140,253,0.14)', borderWidth: 1, borderColor: 'rgba(0,140,253,0.4)' },
  cardTesta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardEtichetta: { fontFamily: fonts.corpoForte, fontSize: 12, letterSpacing: 0.96, color: 'rgba(255,255,255,0.8)' },
  punto: { opacity: 0.6 },
  manca: { color: colors.azzurro },
  cardPartita: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardSquadra: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8 },
  cardNome: { maxWidth: '100%', textAlign: 'center', fontFamily: fonts.corpoMedio, fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  cardNomeVictor: { fontFamily: fonts.corpoExtra, color: colors.bianco },
  vs: { fontFamily: fonts.titoloForte, fontSize: 14, letterSpacing: 1.4, color: 'rgba(255,255,255,0.6)' },
  cardInfo: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 6 },
  cardInfoTesto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  cardLuogo: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' },
  ristretto: { flexShrink: 1 },
  tastoCard: { alignSelf: 'center', marginLeft: 0, paddingHorizontal: 16 },
  giornata: { paddingTop: 22 },
  giornataTesta: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingBottom: 10, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.14)' },
  giornataTitolo: { fontFamily: fonts.titoloForte, fontSize: 18, color: colors.bianco },
  giornataDate: { fontFamily: fonts.corpoMedio, fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  lista: { gap: 8 },
  riga: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 6 },
  rigaStretta: { paddingVertical: 11, paddingHorizontal: 10 },
  rigaVictor: { backgroundColor: 'rgba(0,140,253,0.14)', borderColor: 'rgba(0,140,253,0.4)' },
  rigaLarga: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sottoLargo: { marginLeft: 124 },
  quando: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: 'rgba(255,255,255,0.7)' },
  quandoLargo: { width: 112 },
  quandoVictor: { color: 'rgba(255,255,255,0.92)' },
  squadre: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  squadra: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  squadraCasa: { flexDirection: 'row-reverse' },
  nome: { flexShrink: 1, minWidth: 0, fontFamily: fonts.corpoMedio, fontSize: 14, color: 'rgba(255,255,255,0.78)' },
  nomeCasa: { textAlign: 'right' },
  nomeRigaVictor: { color: colors.bianco },
  nomeForte: { fontFamily: fonts.corpoExtra, color: colors.bianco },
  punteggio: { textAlign: 'center', fontFamily: fonts.titoloForte, fontSize: 14, color: 'rgba(255,255,255,0.65)' },
  luogo: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  luogoLargo: {},
  palazzetto: { flex: 1, minWidth: 0, fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.62)' },
  tasto: { marginLeft: 'auto', flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 99, backgroundColor: 'rgba(0,140,253,0.12)', borderWidth: 1, borderColor: 'rgba(0,140,253,0.3)' },
  tastoTesto: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.azzurro },
  riposa: { marginTop: 8, marginHorizontal: 4, fontFamily: fonts.corpo, fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
});
