// Pezzi dell'area atleti del sito (css/atleta.css): colori, scheda, distintivo, icone, avviso.
import { type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { driveVista, fissatoAttivo, metaAvviso, pezziTesto, type Avviso, type Livello } from '~/lib/atleti';
import { fonts } from '~/lib/theme';

/** --al-* di css/atleta.css. */
export const al = {
  sfondo: '#F1F5F9',
  scheda: '#FFFFFF',
  testo: '#1E293B',
  spento: '#5B6B80',
  bordo: '#E2E8F0',
  blu: '#008CFD',
  bluScuro: '#0070D6',
  verde: '#10B981',
  rosso: '#EF4444',
  arancio: '#F59E0B',
  notte: ['#0F172A', '#1E3A5F'] as const,
};

/** Colore del valore dei riquadri e dei puntini di "Da fare". */
export const coloreValore: Record<Livello, string> = { red: '#DC2626', orange: '#D97706', ok: '#059669' };
export const colorePuntino: Record<Livello, string> = { red: al.rosso, orange: al.arancio, ok: al.verde };

const svg = (corpo: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt">${corpo}</svg>`;

/** Icone di atleta.html. */
export const ICONE = {
  home: svg('<path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>'),
  calendario: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  avvisi: svg('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>'),
  squadra: svg('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
  documenti: svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>'),
  profilo: svg('<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>'),
  esci: svg('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  fatto: svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),
  persona: svg('<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>'),
  graffetta: svg('<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>'),
};

export function Icona({ nome, misura = 20, colore }: { nome: keyof typeof ICONE; misura?: number; colore: string }) {
  return <SvgXml xml={ICONE[nome]} width={misura} height={misura} color={colore} />;
}

/** .al-card (con .al-avviso--fissato / --important se servono). */
export function Scheda({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[stili.scheda, style]}>{children}</View>;
}

/** .al-badge */
export function Distintivo({ tipo, testo }: { tipo: 'green' | 'red' | 'orange' | 'blue'; testo: string }) {
  const c = { green: ['#ECFDF5', '#059669'], red: ['#FEF2F2', '#DC2626'], orange: ['#FFFBEB', '#D97706'], blue: ['#EFF6FF', '#1D4ED8'] }[tipo];
  return (
    <View style={[stili.distintivo, { backgroundColor: c[0] }]}>
      <Text style={[stili.distintivoTesto, { color: c[1] }]}>{testo}</Text>
    </View>
  );
}

/** .al-btn-ghost .al-btn-sm */
export function TastoLeggero({ testo, icona, onPress, largo }: { testo: string; icona?: keyof typeof ICONE; onPress: () => void; largo?: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [stili.leggero, largo && stili.leggeroLargo, pressed && stili.leggeroPremuto]}
      onPress={onPress}
      accessibilityRole="button">
      {icona ? <Icona nome={icona} misura={13} colore={al.spento} /> : null}
      <Text style={stili.leggeroTesto}>{testo}</Text>
    </Pressable>
  );
}

/** Un avviso della bacheca (_avvisoCard). */
export function SchedaAvviso({ v, nuovo, adesso }: { v: Avviso; nuovo: boolean; adesso: Date }) {
  const fissato = fissatoAttivo(v, adesso);
  const allegato = v.allegatoUrl && /^https:\/\//i.test(v.allegatoUrl) ? driveVista(v.allegatoUrl) : null;
  return (
    <Scheda style={[fissato && stili.fissato, v.importante && stili.importante]}>
      <View style={stili.corpo}>
        <View style={stili.testaAvviso}>
          <Text style={stili.titoloAvviso} accessibilityRole="header">
            {v.titolo}
          </Text>
          {fissato ? <Distintivo tipo="blue" testo="Fissato" /> : null}
          {nuovo ? <Distintivo tipo="green" testo="Nuovo" /> : null}
          {v.importante ? <Distintivo tipo="red" testo="Importante" /> : null}
        </View>
        <Text style={stili.metaAvviso}>{metaAvviso(v)}</Text>
        <Text style={stili.testoAvviso}>
          {pezziTesto(v.testo || '').map((p, i) =>
            p.link ? (
              <Text key={i} style={stili.link} onPress={() => void Linking.openURL(p.link!)} accessibilityRole="link">
                {p.t}
              </Text>
            ) : (
              p.t
            ),
          )}
        </Text>
        {allegato ? (
          <View style={stili.allegato}>
            <TastoLeggero testo="Apri allegato" icona="graffetta" onPress={() => void Linking.openURL(allegato)} />
          </View>
        ) : null}
      </View>
    </Scheda>
  );
}

export const stili = StyleSheet.create({
  scheda: {
    backgroundColor: al.scheda,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: al.bordo,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  fissato: { backgroundColor: '#F5F9FF' },
  importante: { borderColor: al.rosso },
  corpo: { paddingHorizontal: 18, paddingVertical: 16 },
  testaScheda: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderColor: al.bordo },
  iconaScheda: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF' },
  titoloScheda: { fontFamily: fonts.titolo, fontSize: 16, color: al.testo },
  sottoScheda: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento, marginTop: 2 },
  distintivo: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  distintivoTesto: { fontFamily: fonts.corpoMedio, fontSize: 12 },
  leggero: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: al.bordo,
  },
  leggeroLargo: { alignSelf: 'stretch', justifyContent: 'center' },
  leggeroPremuto: { borderColor: al.testo },
  leggeroTesto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: al.spento },
  testaAvviso: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  titoloAvviso: { fontFamily: fonts.titolo, fontSize: 17, color: al.testo, marginRight: 'auto', flexShrink: 1 },
  metaAvviso: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento, marginTop: 4, marginBottom: 12 },
  testoAvviso: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21.7, color: al.testo },
  link: { color: al.blu, textDecorationLine: 'underline' },
  allegato: { marginTop: 14 },
  spento: { fontFamily: fonts.corpo, fontSize: 14, color: al.spento },
});
