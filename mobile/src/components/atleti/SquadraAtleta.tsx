// Scheda Squadra dell'area atleti (#view-squadra di atleta.html): staff e giocatori della squadra dell'atleta.
import { StyleSheet, Text, View } from 'react-native';

import { Scheda, al, stili as base } from '~/components/atleti/Pezzi';
import type { RigaSquadra } from '~/lib/squadraAtleta';
import { fonts } from '~/lib/theme';

type Rosa = { nome: string; stagione: string; staff: RigaSquadra[]; giocatori: RigaSquadra[] };

/** .al-person: tondo col numero (vuoto per lo staff), nome, ruolo a destra. */
function Riga({ r, staff, ultima }: { r: RigaSquadra; staff: boolean; ultima: boolean }) {
  return (
    <View style={[stili.persona, ultima && stili.ultima]}>
      <View style={[stili.numero, staff && stili.numeroStaff]}>
        <Text style={stili.numeroTesto}>{r.numero}</Text>
      </View>
      <Text style={stili.nome}>{r.nome}</Text>
      <Text style={stili.ruolo}>{r.ruolo}</Text>
    </View>
  );
}

export function SquadraAtleta({ rosa, caricamento }: { rosa: Rosa | null; caricamento: boolean }) {
  if (caricamento) return <Text style={base.spento}>Caricamento…</Text>;
  if (!rosa)
    return (
      <Scheda>
        <View style={base.corpo}>
          <Text style={base.spento}>La squadra non è ancora stata assegnata.</Text>
        </View>
      </Scheda>
    );
  return (
    <Scheda>
      <View style={base.testaScheda}>
        <View>
          <Text style={base.titoloScheda} accessibilityRole="header">
            {rosa.nome}
          </Text>
          {rosa.stagione ? <Text style={base.sottoScheda}>{rosa.stagione}</Text> : null}
        </View>
      </View>
      <View style={base.corpo}>
        {rosa.staff.length ? (
          <>
            <Text style={stili.titoloLista} accessibilityRole="header">
              Staff
            </Text>
            {rosa.staff.map((r, i) => (
              <Riga key={r.chiave} r={r} staff ultima={i === rosa.staff.length - 1} />
            ))}
          </>
        ) : null}
        <Text style={[stili.titoloLista, rosa.staff.length ? stili.titoloDopo : null]} accessibilityRole="header">
          Giocatori
        </Text>
        {rosa.giocatori.length ? (
          rosa.giocatori.map((r, i) => <Riga key={r.chiave} r={r} staff={false} ultima={i === rosa.giocatori.length - 1} />)
        ) : (
          <Text style={base.spento}>Nessun giocatore inserito.</Text>
        )}
      </View>
    </Scheda>
  );
}

const stili = StyleSheet.create({
  titoloLista: { fontFamily: fonts.titolo, fontSize: 13, color: al.spento, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4, marginBottom: 10 },
  titoloDopo: { marginTop: 22 },
  persona: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: al.bordo },
  ultima: { borderBottomWidth: 0 },
  numero: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  numeroStaff: { backgroundColor: al.sfondo },
  numeroTesto: { fontFamily: fonts.titolo, fontSize: 15, color: al.bluScuro },
  nome: { flex: 1, minWidth: 0, fontFamily: fonts.corpoMedio, fontSize: 14, color: al.testo },
  ruolo: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento, textAlign: 'right' },
});
