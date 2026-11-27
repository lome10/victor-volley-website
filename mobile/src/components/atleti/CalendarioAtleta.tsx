// Scheda Calendario dell'area atleti (#view-calendario di atleta.html): prossimi impegni per giorno, "Ci sarò / Non ci sarò",
// Diretta e "Aggiungi al calendario" per le partite, ultimi risultati della squadra.
import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Distintivo, Icona, Scheda, TastoLeggero, al, stili as base } from '~/components/atleti/Pezzi';
import { etichettaGiorno, linkMappa, perGiorno, type Impegno } from '~/lib/agenda';
import type { Atleta } from '~/lib/atleti';
import { fonts } from '~/lib/theme';

export type Risposta = 'si' | 'no';

type Props = {
  atleta: Atleta;
  /** null finche' partite e allenamenti non sono arrivati. */
  impegni: Impegno[] | null;
  risposte: Record<string, Risposta>;
  /** Messaggio d'errore del salvataggio di una risposta (#presMsg). */
  errore: string;
  risultati: { id: string; vinta: boolean; partita: string; risultato: string; data: string }[];
  adesso: Date;
  rispondi: (ev: Impegno, r: Risposta) => void;
  aggiungiTutto: () => void;
  aggiungiPartita: (id: string) => void;
};

function Presenza({ nome, ev, r, rispondi }: { nome: string; ev: Impegno; r: Risposta | undefined; rispondi: Props['rispondi'] }) {
  const tasto = (valore: Risposta, testo: string) => {
    const attivo = r === valore;
    return (
      <Pressable
        onPress={() => rispondi(ev, valore)}
        accessibilityRole="button"
        accessibilityState={{ selected: attivo }}
        accessibilityLabel={testo + ', ' + ev.title + ' ' + ev.date}
        style={({ pressed }) => [stili.risp, attivo && (valore === 'si' ? stili.rispSi : stili.rispNo), pressed && !attivo && stili.rispPremuto]}>
        <Text style={[stili.rispTesto, attivo && { color: valore === 'si' ? '#047857' : '#B91C1C' }]}>{testo}</Text>
      </Pressable>
    );
  };
  return (
    <View style={stili.rispRiga} accessibilityLabel={'Presenza di ' + nome}>
      <Text style={stili.rispEtichetta}>{(nome || 'Presenza') + ':'}</Text>
      {tasto('si', 'Ci sarò')}
      {tasto('no', 'Non ci sarò')}
    </View>
  );
}

export function CalendarioAtleta({ atleta, impegni, risposte, errore, risultati, adesso, rispondi, aggiungiTutto, aggiungiPartita }: Props) {
  let elenco;
  if (!impegni) elenco = <Text style={base.spento}>Caricamento…</Text>;
  else if (!atleta.categoria) elenco = <Text style={base.spento}>La squadra non è ancora stata assegnata.</Text>;
  else if (!impegni.length) elenco = <Text style={base.spento}>Non ci sono partite o allenamenti in programma.</Text>;
  else
    elenco = perGiorno(impegni).map((g) => (
      <View key={g.data} style={stili.giorno}>
        <Text style={stili.giornoTitolo} accessibilityRole="header">
          {etichettaGiorno(g.data, adesso)}
        </Text>
        {g.impegni.map((ev) => {
          const partita = ev.tipo === 'partita';
          return (
            <View key={ev.key} style={[stili.evento, partita ? stili.eventoPartita : stili.eventoAllenamento]}>
              <View style={stili.ora}>
                <Text style={stili.oraInizio}>{ev.start || '—'}</Text>
                {ev.end ? <Text style={stili.oraFine}>{ev.end}</Text> : null}
              </View>
              <View style={stili.corpoEvento}>
                <Text style={stili.titolo}>{ev.title}</Text>
                <View style={stili.meta}>
                  {partita ? <Distintivo tipo={ev.home ? 'green' : 'orange'} testo={ev.home ? 'Casa' : 'Trasferta'} /> : null}
                  {ev.luogo ? (
                    <Text style={stili.luogo} accessibilityRole="link" onPress={() => void Linking.openURL(linkMappa(ev.luogo))}>
                      {ev.luogo}
                    </Text>
                  ) : null}
                </View>
                {ev.note ? <Text style={stili.nota}>{ev.note}</Text> : null}
                <Presenza nome={atleta.nome || ''} ev={ev} r={risposte[ev.key]} rispondi={rispondi} />
                {partita ? (
                  <View style={stili.azioni}>
                    {ev.diretta ? <TastoLeggero testo="Diretta" onPress={() => router.push('/diretta')} /> : null}
                    <TastoLeggero testo="Aggiungi al calendario" onPress={() => aggiungiPartita(ev.eventoId)} />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    ));

  return (
    <View style={stili.vista}>
      <Scheda>
        <View style={base.testaScheda}>
          <View style={base.iconaScheda}>
            <Icona nome="calendario" misura={22} colore={al.blu} />
          </View>
          <View style={stili.testaTesto}>
            <Text style={base.titoloScheda}>Prossimi impegni</Text>
            <Text style={base.sottoScheda}>{atleta.categoria || 'Partite e allenamenti'}</Text>
          </View>
        </View>
        <View style={base.corpo}>
          {impegni && impegni.length ? (
            <View style={stili.tuttoCal}>
              <TastoLeggero testo="Aggiungi al calendario" onPress={aggiungiTutto} />
            </View>
          ) : null}
          {errore ? (
            <Text style={stili.errore} accessibilityRole="alert">
              {errore}
            </Text>
          ) : null}
          {elenco}
        </View>
      </Scheda>

      {risultati.length ? (
        <Scheda>
          <View style={base.testaScheda}>
            <Text style={base.titoloScheda}>Ultimi risultati</Text>
          </View>
          <View style={[base.corpo, stili.risultati]}>
            {risultati.map((p) => (
              <View key={p.id} style={stili.risultato}>
                <Distintivo tipo={p.vinta ? 'green' : 'red'} testo={p.vinta ? 'Vinta' : 'Persa'} />
                <Text style={stili.risultatoNome}>{p.partita}</Text>
                <Text style={stili.risultatoSotto}>
                  <Text style={stili.forte}>{p.risultato}</Text> · {p.data}
                </Text>
              </View>
            ))}
          </View>
        </Scheda>
      ) : null}
    </View>
  );
}

const stili = StyleSheet.create({
  vista: { gap: 20 },
  testaTesto: { flex: 1 },
  tuttoCal: { flexDirection: 'row', marginBottom: 14 },
  errore: { fontFamily: fonts.corpoMedio, fontSize: 13, color: '#B91C1C', marginBottom: 12 },
  giorno: { gap: 10, marginBottom: 22 },
  giornoTitolo: { fontFamily: fonts.titolo, fontSize: 13, color: al.spento, textTransform: 'uppercase', letterSpacing: 0.8 },
  evento: { flexDirection: 'row', gap: 14, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: al.bordo, borderRadius: 8, borderLeftWidth: 3 },
  eventoPartita: { borderLeftColor: al.blu, backgroundColor: '#FFFFFF' },
  eventoAllenamento: { borderLeftColor: '#94A3B8', backgroundColor: '#FAFAFA' },
  ora: { minWidth: 48 },
  oraInizio: { fontFamily: fonts.titolo, fontSize: 17, color: al.testo },
  oraFine: { fontFamily: fonts.corpoMedio, fontSize: 12, color: al.spento },
  corpoEvento: { flex: 1, minWidth: 0 },
  titolo: { fontFamily: fonts.corpoForte, fontSize: 14, color: al.testo },
  meta: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  luogo: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento, textDecorationLine: 'underline' },
  nota: { marginTop: 6, fontFamily: fonts.corpo, fontSize: 12, color: al.testo },
  rispRiga: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  rispEtichetta: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento, marginRight: 2 },
  risp: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: al.bordo, backgroundColor: '#FFFFFF', minHeight: 36, justifyContent: 'center' },
  rispSi: { backgroundColor: '#ECFDF5', borderColor: al.verde },
  rispNo: { backgroundColor: '#FEF2F2', borderColor: al.rosso },
  rispPremuto: { borderColor: al.testo },
  rispTesto: { fontFamily: fonts.corpoForte, fontSize: 12, color: al.spento },
  azioni: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  risultati: { gap: 12 },
  risultato: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  risultatoNome: { flex: 1, minWidth: 140, fontFamily: fonts.corpoMedio, fontSize: 14, color: al.testo },
  risultatoSotto: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento },
  forte: { fontFamily: fonts.corpoForte, color: al.testo },
});
