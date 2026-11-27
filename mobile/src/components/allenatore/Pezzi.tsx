// Pezzi dell'area allenatore (css/allenatore.css): pillole, tasti Si'/No, messaggi.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { al } from '~/components/atleti/Pezzi';
import { giornoCorto, ROSSO, VERDE, type StatoPresenza } from '~/lib/allenatore';
import { fonts } from '~/lib/theme';

export const scuro = '#1E293B';

/** .pv-pills: una scelta tra poche voci (squadra, filtro, periodo, ordine). */
export function Pillole<T extends string | number>({ voci, attiva, onScegli, etichetta }: { voci: [T, string][]; attiva: T; onScegli: (v: T) => void; etichetta: string }) {
  return (
    <View style={st.pillole} accessibilityLabel={etichetta}>
      {voci.map(([v, testo]) => {
        const on = v === attiva;
        return (
          <Pressable key={String(v)} style={[st.pillola, on && st.pillolaOn]} onPress={() => !on && onScegli(v)} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[st.pillolaTesto, on && st.pillolaTestoOn]}>{testo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** I due tasti Si' / No di un atleta in un giorno; toccare di nuovo quello acceso toglie la risposta (siNo del sito). */
export function SiNo({ nome, data, stato, onCambia }: { nome: string; data: string; stato: StatoPresenza; onCambia: (s: StatoPresenza) => void }) {
  return (
    <View style={st.siNo}>
      {(
        [
          ['p', 'Sì', 'presente', VERDE],
          ['a', 'No', 'assente', ROSSO],
        ] as const
      ).map(([v, testo, parola, colore]) => {
        const on = stato === v;
        return (
          <Pressable
            key={v}
            style={[st.sn, on && { backgroundColor: colore, borderColor: colore }]}
            onPress={() => onCambia(on ? '' : v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={nome + ', ' + giornoCorto(data) + ': ' + parola}>
            <Text style={[st.snTesto, on && st.snTestoOn]}>{testo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Nessuno = ({ testo }: { testo: string }) => <Text style={st.nessuno}>{testo}</Text>;

export const st = StyleSheet.create({
  pillole: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pillola: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: al.bordo, backgroundColor: '#fff' },
  pillolaOn: { backgroundColor: scuro, borderColor: scuro },
  pillolaTesto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: '#64748B' },
  pillolaTestoOn: { fontFamily: fonts.corpoForte, color: '#fff' },
  siNo: { flexDirection: 'row', gap: 6 },
  sn: { minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: al.bordo, backgroundColor: '#fff' },
  snTesto: { fontFamily: fonts.corpoForte, fontSize: 14, color: '#64748B' },
  snTestoOn: { color: '#fff' },
  nessuno: { fontFamily: fonts.corpo, fontStyle: 'italic', fontSize: 14, color: al.spento, paddingVertical: 8 },
  sotto: { fontFamily: fonts.corpo, fontSize: 13, color: al.spento, marginBottom: 4 },
  scheda: { backgroundColor: '#fff', borderWidth: 1, borderColor: al.bordo, borderRadius: 12, overflow: 'hidden' },
  titoloCat: { fontFamily: fonts.titolo, fontSize: 16, color: al.testo, marginTop: 20, marginBottom: 8 },
});
