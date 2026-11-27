// Sezione "Presenze", un giorno alla volta (vistaGiorno di js/allenatore.js): striscia dei giorni, conteggi,
// "Tutti presenti", filtro e Si'/No per ogni atleta. Ogni tocco si salva da solo (vedi AreaAllenatore: imposta).
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Nessuno, Pillole, scuro, SiNo, st } from '~/components/allenatore/Pezzi';
import { al } from '~/components/atleti/Pezzi';
import {
  atletiFiltrati,
  conteggio,
  giornoIniziale,
  giornoLungo,
  giorniStriscia,
  giorniUnici,
  notaGiorno,
  numeroGiorno,
  ROSSO,
  sigla,
  statoDi,
  VERDE,
  type CategoriaPresenze,
  type Filtro,
  type StatoPresenza,
} from '~/lib/allenatore';
import { fonts } from '~/lib/theme';

type Props = {
  cat: CategoriaPresenze;
  oggi: string;
  giorno: string;
  setGiorno: (g: string) => void;
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
  imposta: (data: string, atletaIds: string[], stato: StatoPresenza) => void;
};

export function PresenzeAllenatore({ cat, oggi, giorno, setGiorno, filtro, setFiltro, imposta }: Props) {
  const striscia = useRef<ScrollView>(null);
  const giorni = giorniUnici(cat);
  if (!giorni.length) return <Nessuno testo="Per questa squadra non ci sono allenamenti in calendario." />;
  if (!cat.atleti.length) return <Nessuno testo="Non ci sono ancora atleti in questa squadra." />;

  const data = giorni.some((g) => g.data === giorno) ? giorno : giornoIniziale(giorni, oggi);
  const sel = giorni.find((g) => g.data === data)!;
  const c = conteggio(cat, data);
  const tot = cat.atleti.length;
  const mostrati = atletiFiltrati(cat, data, filtro);

  return (
    <View>
      <ScrollView ref={striscia} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.striscia} accessibilityLabel="Giorni di allenamento">
        {giorniStriscia(giorni, oggi).map((g) => {
          const on = g.data === data;
          return (
            <Pressable
              key={g.data}
              style={[s.giorno, on && s.giornoOn]}
              onPress={() => setGiorno(g.data)}
              onLayout={on ? (e) => striscia.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 120), animated: false }) : undefined}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={giornoLungo(g.data)}>
              <Text style={[s.dow, on && s.bianco]}>{sigla(g.data)}</Text>
              <Text style={[s.num, on && s.bianco]}>{numeroGiorno(g.data)}</Text>
              <Text style={[s.nota, on && s.bianco]}>{notaGiorno(cat, g, oggi)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={s.testa}>
        <Text style={s.titolo} accessibilityRole="header">
          {(data === oggi ? 'Oggi · ' : '') + giornoLungo(data) + (sel.ore.length ? ' · ' + sel.ore.join(' · ') : '')}
        </Text>
        <Text style={st.sotto}>{tot - c.nr + ' su ' + tot + ' segnati'}</Text>
      </View>
      <View style={s.barra}>
        <View style={{ flex: c.si, backgroundColor: VERDE }} />
        <View style={{ flex: c.no, backgroundColor: ROSSO }} />
        <View style={{ flex: c.nr }} />
      </View>

      <View style={s.azioni}>
        <View style={s.conta}>
          <Text style={[s.contaTesto, { color: VERDE }]}>{c.si} presenti</Text>
          <Text style={[s.contaTesto, { color: ROSSO }]}>{c.no} assenti</Text>
        </View>
        {c.nr ? (
          <Pressable
            style={({ pressed }) => [s.tutti, pressed && { opacity: 0.8 }]}
            onPress={() => imposta(data, cat.atleti.filter((a) => !statoDi(cat, data, a.id)).map((a) => a.id), 'p')}
            accessibilityRole="button">
            <Text style={s.tuttiTesto}>{c.nr === tot ? 'Tutti presenti' : 'Restanti presenti'}</Text>
          </Pressable>
        ) : null}
      </View>

      <Pillole
        voci={[
          ['tutte', 'Tutte (' + tot + ')'],
          ['assenti', 'Assenti (' + c.no + ')'],
          ['da', 'Da segnare (' + c.nr + ')'],
        ]}
        attiva={filtro}
        onScegli={setFiltro}
        etichetta="Filtro"
      />

      <View style={st.scheda}>
        {!mostrati.length ? (
          <View style={s.riga}>
            <Nessuno testo={filtro === 'da' ? 'Tutto segnato per questo giorno.' : 'Nessuna atleta in questo elenco.'} />
          </View>
        ) : null}
        {mostrati.map((a, i) => {
          const stato = statoDi(cat, data, a.id);
          const nome = (a.cognome + ' ' + a.nome).trim();
          return (
            <View key={a.id} style={[s.riga, i < mostrati.length - 1 && s.rigaBordo]}>
              <View style={s.nomeBox}>
                <Text style={s.nome}>{nome}</Text>
                {!stato && data <= oggi ? <Text style={s.daSegnare}>Da segnare</Text> : null}
              </View>
              <SiNo nome={nome} data={data} stato={stato} onCambia={(v) => imposta(data, [a.id], v)} />
            </View>
          );
        })}
      </View>
      <Text style={[st.sotto, { marginTop: 10 }]}>Si salva da solo ad ogni tocco. Puoi correggere o completare un allenamento fino a 60 giorni dopo.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  striscia: { gap: 6, paddingBottom: 10 },
  giorno: { width: 58, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: al.bordo, backgroundColor: '#fff' },
  giornoOn: { backgroundColor: scuro, borderColor: scuro },
  dow: { fontFamily: fonts.corpoForte, fontSize: 10, letterSpacing: 0.6, color: scuro },
  num: { fontFamily: fonts.corpoExtra, fontSize: 20, lineHeight: 23, color: scuro },
  nota: { fontFamily: fonts.corpo, fontSize: 11, color: '#64748B' },
  bianco: { color: '#fff' },
  testa: { marginTop: 4, marginBottom: 6 },
  titolo: { fontFamily: fonts.titolo, fontSize: 18, color: al.testo },
  barra: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: al.bordo, marginBottom: 12 },
  azioni: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  conta: { flexDirection: 'row', gap: 14 },
  contaTesto: { fontFamily: fonts.corpoForte, fontSize: 14 },
  tutti: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: VERDE },
  tuttiTesto: { fontFamily: fonts.corpoForte, fontSize: 13, color: '#fff' },
  riga: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8, paddingHorizontal: 14 },
  rigaBordo: { borderBottomWidth: 1, borderColor: al.bordo },
  nomeBox: { flex: 1, minWidth: 0 },
  nome: { fontFamily: fonts.corpoMedio, fontSize: 15, color: al.testo },
  daSegnare: { fontFamily: fonts.corpo, fontSize: 12, color: '#B45309' },
});
