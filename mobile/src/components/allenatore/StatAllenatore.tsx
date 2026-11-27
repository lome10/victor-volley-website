// Sezione "Statistiche" (disegnaStat / scheda di js/allenatore.js), con le regole di ~/lib/presenzeStat (= js/presenze-stat.js).
// Sul telefono come sul sito da telefono: prima l'elenco, toccando un atleta la sua scheda con "‹ Statistiche".
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Nessuno, Pillole, scuro, SiNo, st } from '~/components/allenatore/Pezzi';
import { al } from '~/components/atleti/Pezzi';
import {
  allenamentiNelPeriodo,
  giornoLungo,
  giorniUnici,
  GRIGIO,
  meseCorto,
  numeroGiorno,
  righeStat,
  ROSSO,
  statDi,
  statoDi,
  VERDE,
  type AtletaPresenze,
  type CategoriaPresenze,
  type Ordine,
  type StatoPresenza,
} from '~/lib/allenatore';
import { media, type Statistica } from '~/lib/presenzeStat';
import { fonts } from '~/lib/theme';

type Props = {
  cat: CategoriaPresenze;
  oggi: string;
  periodo: 30 | 60;
  setPeriodo: (p: 30 | 60) => void;
  ordine: Ordine;
  setOrdine: (o: Ordine) => void;
  scelto: string;
  setScelto: (id: string) => void;
  imposta: (data: string, atletaIds: string[], stato: StatoPresenza) => void;
};

const pct = (s: Statistica) => (s.pct === null ? '—' : s.pct + '%');

export function StatAllenatore({ cat, oggi, periodo, setPeriodo, ordine, setOrdine, scelto, setScelto, imposta }: Props) {
  const fatti = cat.giorni.filter((g) => g.data <= oggi).length;
  if (!cat.atleti.length) return <Nessuno testo="Non ci sono ancora atleti in questa squadra." />;
  if (!fatti) return <Nessuno testo="Non ci sono ancora allenamenti svolti." />;

  const righe = righeStat(cat, periodo, ordine, oggi);
  const squadra = media(righe.map((r) => r.s));
  const sel = righe.find((r) => r.a.id === scelto);
  if (sel) return <Scheda cat={cat} atleta={sel.a} squadra={squadra} oggi={oggi} periodo={periodo} indietro={() => setScelto('')} imposta={imposta} />;

  return (
    <View>
      <Pillole
        voci={[
          [30, 'Ultimi 30 giorni'],
          [60, 'Ultimi 60 giorni'],
        ]}
        attiva={periodo}
        onScegli={setPeriodo}
        etichetta="Periodo"
      />
      <View style={s.carte}>
        <View style={s.carta}>
          <Text style={s.cartaEtichetta}>Media squadra</Text>
          <Text style={s.cartaValore}>{squadra === null ? '—' : squadra + '%'}</Text>
        </View>
        <View style={s.carta}>
          <Text style={s.cartaEtichetta}>Allenamenti</Text>
          <Text style={s.cartaValore}>{allenamentiNelPeriodo(cat, periodo, oggi)}</Text>
        </View>
      </View>
      <Pillole
        voci={[
          ['ass', 'Presenza più bassa'],
          ['nome', 'In ordine A–Z'],
        ]}
        attiva={ordine}
        onScegli={setOrdine}
        etichetta="Ordine"
      />
      <View style={st.scheda}>
        {righe.map((r, i) => {
          const nome = (r.a.cognome + ' ' + r.a.nome).trim();
          return (
            <Pressable
              key={r.a.id}
              style={({ pressed }) => [s.voce, i < righe.length - 1 && s.voceBordo, pressed && { backgroundColor: al.sfondo }]}
              onPress={() => setScelto(r.a.id)}
              accessibilityRole="button"
              accessibilityLabel={nome + ', presenza ' + pct(r.s)}>
              <View style={s.voceNome}>
                <Text style={s.nome}>{nome}</Text>
                <Text style={s.piccolo}>{r.s.segnate ? r.s.si + ' presente · ' + r.s.no + ' assente · ' + r.s.nr + ' da segnare' : 'Ancora niente di segnato'}</Text>
              </View>
              {r.s.segnate ? <Barrette ultimi={r.s.ultimi} /> : null}
              <Text style={s.pct}>{pct(r.s)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** .st-ticks: gli ultimi 8 allenamenti, verde presente, rosso assente, grigio da segnare. */
function Barrette({ ultimi }: { ultimi: StatoPresenza[] }) {
  const si = ultimi.filter((x) => x === 'p').length;
  const no = ultimi.filter((x) => x === 'a').length;
  return (
    <View style={s.barrette} accessible accessibilityRole="image" accessibilityLabel={si + ' presenze e ' + no + ' assenze negli ultimi ' + ultimi.length + ' allenamenti'}>
      {ultimi.map((x, i) => (
        <View key={i} style={[s.barretta, { backgroundColor: x === 'p' ? VERDE : x === 'a' ? ROSSO : GRIGIO }]} />
      ))}
    </View>
  );
}

/** Ciambella: verde le presenze, rossa le assenze (sui giorni segnati). */
function Ciambella({ s: stat }: { s: Statistica }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const vSi = stat.segnate ? (C * stat.si) / stat.segnate : 0;
  const vNo = stat.segnate ? (C * stat.no) / stat.segnate : 0;
  return (
    <View style={s.anello} accessible accessibilityRole="image" accessibilityLabel={'Presenza ' + (stat.pct === null ? 'non disponibile' : stat.pct + ' per cento')}>
      <Svg width={128} height={128} viewBox="0 0 128 128">
        <Circle cx={64} cy={64} r={R} fill="none" stroke="#E2E8F0" strokeWidth={12} />
        {vNo ? <Circle cx={64} cy={64} r={R} fill="none" stroke={ROSSO} strokeWidth={12} strokeDasharray={vNo + ' ' + C} strokeDashoffset={-vSi} transform="rotate(-90 64 64)" /> : null}
        {vSi ? <Circle cx={64} cy={64} r={R} fill="none" stroke={VERDE} strokeWidth={12} strokeDasharray={vSi + ' ' + C} transform="rotate(-90 64 64)" /> : null}
      </Svg>
      <View style={s.anelloMezzo}>
        <Text style={s.anelloNumero}>{pct(stat)}</Text>
        <Text style={s.piccolo}>presenza</Text>
      </View>
    </View>
  );
}

function Scheda({
  cat,
  atleta,
  squadra,
  oggi,
  periodo,
  indietro,
  imposta,
}: {
  cat: CategoriaPresenze;
  atleta: AtletaPresenze;
  squadra: number | null;
  oggi: string;
  periodo: number;
  indietro: () => void;
  imposta: Props['imposta'];
}) {
  const stat = statDi(cat, atleta.id, periodo, oggi);
  const nome = (atleta.cognome + ' ' + atleta.nome).trim();
  const storia = giorniUnici(cat)
    .filter((g) => g.data <= oggi)
    .slice(-10)
    .reverse();
  return (
    <View style={{ gap: 12 }}>
      <Pressable style={s.indietro} onPress={indietro} accessibilityRole="button">
        <Text style={s.indietroTesto}>‹ Statistiche</Text>
      </Pressable>
      <View style={[st.scheda, s.box]}>
        <Text style={s.titolo} accessibilityRole="header">
          {nome}
        </Text>
        <Text style={st.sotto}>{cat.categoria + ' · ultimi ' + periodo + ' giorni'}</Text>
        <View style={s.riepilogo}>
          <Ciambella s={stat} />
          <View style={s.numeri}>
            {(
              [
                ['Presente', stat.si, VERDE],
                ['Assente', stat.no, ROSSO],
                ['Da segnare', stat.nr, GRIGIO],
              ] as const
            ).map(([t, n, c]) => (
              <View key={t}>
                <Text style={s.numero}>{n}</Text>
                <View style={s.legenda}>
                  <View style={[s.puntino, { backgroundColor: c }]} />
                  <Text style={s.piccolo}>{t}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        {squadra !== null ? (
          <View style={{ marginTop: 12 }}>
            <View style={s.confTesta}>
              <Text style={s.piccolo}>Rispetto alla squadra</Text>
              <Text style={s.piccolo}>squadra {squadra}%</Text>
            </View>
            <View style={s.asta}>
              <View style={{ flex: stat.pct || 0, backgroundColor: scuro }} />
              <View style={{ flex: 100 - (stat.pct || 0) }} />
              <View style={[s.segno, { left: `${squadra}%` }]} />
            </View>
          </View>
        ) : null}
      </View>
      <View style={st.scheda}>
        <View style={[s.box, { paddingBottom: 4 }]}>
          <Text style={s.titoletto}>Allenamenti</Text>
          <Text style={st.sotto}>Correggi con Sì e No: si aggiorna per tutti</Text>
        </View>
        {storia.map((g) => (
          <View key={g.data} style={s.storia}>
            <View style={s.quando}>
              <Text style={s.quandoNum}>{numeroGiorno(g.data)}</Text>
              <Text style={s.piccolo}>{meseCorto(g.data)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nome}>{giornoLungo(g.data).split(' ')[0]}</Text>
              {g.ore.length ? <Text style={s.piccolo}>{g.ore.join(' · ')}</Text> : null}
            </View>
            <SiNo nome={nome} data={g.data} stato={statoDi(cat, g.data, atleta.id)} onCambia={(v) => imposta(g.data, [atleta.id], v)} />
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  carte: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  carta: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: al.bordo, backgroundColor: '#fff' },
  cartaEtichetta: { fontFamily: fonts.corpoMedio, fontSize: 12, color: al.spento },
  cartaValore: { fontFamily: fonts.titolo, fontSize: 24, color: al.testo, marginTop: 2 },
  voce: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, minHeight: 56 },
  voceBordo: { borderBottomWidth: 1, borderColor: al.bordo },
  voceNome: { flex: 1, minWidth: 0 },
  nome: { fontFamily: fonts.corpoForte, fontSize: 14, color: al.testo },
  piccolo: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento },
  pct: { fontFamily: fonts.corpoExtra, fontSize: 15, color: al.testo, minWidth: 44, textAlign: 'right' },
  barrette: { flexDirection: 'row', gap: 2 },
  barretta: { width: 5, height: 16, borderRadius: 2 },
  indietro: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  indietroTesto: { fontFamily: fonts.corpoForte, fontSize: 14, color: al.bluScuro },
  box: { padding: 16 },
  titolo: { fontFamily: fonts.titolo, fontSize: 20, color: al.testo },
  titoletto: { fontFamily: fonts.titolo, fontSize: 16, color: al.testo },
  riepilogo: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 8 },
  anello: { width: 128, height: 128 },
  anelloMezzo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  anelloNumero: { fontFamily: fonts.titolo, fontSize: 26, color: al.testo },
  numeri: { flex: 1, gap: 8 },
  numero: { fontFamily: fonts.titolo, fontSize: 20, color: al.testo },
  legenda: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  puntino: { width: 10, height: 10, borderRadius: 5 },
  confTesta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  asta: { flexDirection: 'row', height: 10, borderRadius: 5, backgroundColor: al.bordo, overflow: 'visible' },
  segno: { position: 'absolute', top: -4, width: 3, height: 18, marginLeft: -1.5, backgroundColor: ROSSO, borderRadius: 1 },
  storia: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 14, borderTopWidth: 1, borderColor: al.bordo },
  quando: { width: 40, alignItems: 'center' },
  quandoNum: { fontFamily: fonts.titolo, fontSize: 18, color: al.testo, lineHeight: 20 },
});
