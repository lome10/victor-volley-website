// Sezione "Atleti" (riempiAtleti / disegnaElencoAtleti di js/allenatore.js): squadra, ricerca, elenco per categoria
// con data di nascita, telefono dei genitori (tocca per chiamare) e note per l'allenatore. Sola lettura.
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Nessuno, Pillole, st } from '~/components/allenatore/Pezzi';
import { al } from '~/components/atleti/Pezzi';
import { categorieAtleti, dataNascita, etichettaGenitore, filtraAtleti, telHref, type DatiAtleti, type SchedaAtleta } from '~/lib/allenatore';
import { fonts } from '~/lib/theme';

export function AtletiAllenatore({ dati, adesso }: { dati: DatiAtleti; adesso: Date }) {
  const [categoria, setCategoria] = useState('');
  const [cerca, setCerca] = useState('');
  if (!dati.atleti.length) return <Nessuno testo="Non ci sono ancora atleti nelle tue squadre." />;

  const cats = categorieAtleti(dati.atleti);
  const cat = cats.includes(categoria) ? categoria : '';
  const vis = filtraAtleti(dati.atleti, cat, cerca);
  const gruppi: { categoria: string; atleti: SchedaAtleta[] }[] = [];
  for (const a of vis) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.categoria === a.categoria) ultimo.atleti.push(a);
    else gruppi.push({ categoria: a.categoria, atleti: [a] });
  }

  return (
    <View>
      {cats.length > 1 ? (
        <Pillole voci={[['', 'Tutte'] as [string, string]].concat(cats.map((c) => [c, c || 'Senza categoria']))} attiva={cat} onScegli={setCategoria} etichetta="Squadra" />
      ) : null}
      <TextInput
        style={s.cerca}
        value={cerca}
        onChangeText={setCerca}
        placeholder="Cerca per nome…"
        placeholderTextColor="#94A3B8"
        accessibilityLabel="Cerca un atleta per nome"
        autoCorrect={false}
        autoComplete="off"
      />
      <Text style={st.sotto}>{vis.length + (vis.length === 1 ? ' atleta' : ' atleti')}</Text>
      {!vis.length ? <Nessuno testo="Nessun atleta trovato." /> : null}
      {gruppi.map((g) => (
        <View key={g.categoria}>
          <Text style={st.titoloCat} accessibilityRole="header">
            {g.categoria || 'Senza categoria'}
          </Text>
          <View style={st.scheda}>
            {g.atleti.map((a, i) => (
              <RigaAtleta key={a.cognome + a.nome + i} a={a} adesso={adesso} ultima={i === g.atleti.length - 1} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function RigaAtleta({ a, adesso, ultima }: { a: SchedaAtleta; adesso: Date; ultima: boolean }) {
  return (
    <View style={[s.riga, !ultima && s.rigaBordo]}>
      <Text style={s.nome}>{(a.cognome + ' ' + a.nome).trim()}</Text>
      <Text style={s.nato}>Nato il {dataNascita(a.dataNascita, adesso)}</Text>
      <View style={s.tel}>
        {!a.genitori.length ? <Text style={st.nessuno}>Telefono non inserito</Text> : null}
        {a.genitori.map((g, i) => {
          const chi = etichettaGenitore(g);
          const href = telHref(g.telefono);
          const corpo = (
            <>
              {chi ? <Text style={s.chi}>{chi}</Text> : null}
              <Text style={[s.numero, href ? s.numeroOn : null]}>{g.telefono}</Text>
            </>
          );
          return href ? (
            <Pressable
              key={i}
              style={[s.chiama, s.chiamaOn]}
              onPress={() => void Linking.openURL(href)}
              accessibilityRole="link"
              accessibilityLabel={'Chiama ' + (chi || 'il genitore') + ' ' + g.telefono}>
              {corpo}
            </Pressable>
          ) : (
            <View key={i} style={s.chiama}>
              {corpo}
            </View>
          );
        })}
      </View>
      {a.note ? <Text style={s.note}>{a.note}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  cerca: { minHeight: 44, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: al.bordo, borderRadius: 10, backgroundColor: '#fff', fontFamily: fonts.corpo, fontSize: 15, color: al.testo },
  riga: { paddingVertical: 11, paddingHorizontal: 16, gap: 6 },
  rigaBordo: { borderBottomWidth: 1, borderColor: al.bordo },
  nome: { fontFamily: fonts.corpoForte, fontSize: 15, color: al.testo },
  nato: { fontFamily: fonts.corpo, fontSize: 13, color: al.spento },
  tel: { gap: 6 },
  chiama: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignSelf: 'flex-start', gap: 8, minHeight: 36, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: al.bordo },
  chiamaOn: { borderColor: '#16A34A' },
  chi: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento },
  numero: { fontFamily: fonts.corpoForte, fontSize: 14, color: al.testo },
  numeroOn: { color: '#15803D' },
  note: { fontFamily: fonts.corpo, fontSize: 13, color: al.testo },
});
