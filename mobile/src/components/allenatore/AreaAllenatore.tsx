// Area Allenatore dopo l'accesso (allenatore.html): testata con nome ed Esci, tre sezioni Atleti / Presenze / Statistiche.
// Le presenze si caricano solo quando si apre Presenze o Statistiche (come mostra() del sito). Ogni tocco cambia subito
// lo schermo e poi si salva sul server; se un salvataggio fallisce torna indietro SOLO quell'atleta (impostaMolti).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AtletiAllenatore } from '~/components/allenatore/AtletiAllenatore';
import { Pillole, scuro, st } from '~/components/allenatore/Pezzi';
import { PresenzeAllenatore } from '~/components/allenatore/PresenzeAllenatore';
import { StatAllenatore } from '~/components/allenatore/StatAllenatore';
import { CHIAVI_RISERVATE } from '~/components/atleti/Cruscotto';
import { al, Icona } from '~/components/atleti/Pezzi';
import {
  AccessoNegato,
  conStatoNeiDati,
  leggiAtletiAllenatore,
  leggiPresenzeAllenatore,
  SessioneScaduta,
  segnaPresenzaAllenatore,
  statoDi,
  type DatiPresenze,
  type Filtro,
  type Ordine,
  type StatoPresenza,
} from '~/lib/allenatore';
import { esci, type Utente } from '~/lib/firebase';
import { fonts } from '~/lib/theme';

type Vista = 'atleti' | 'presenze' | 'stat';
const SEZIONI: [Vista, string, string][] = [
  ['atleti', 'Atleti', 'Atleti'],
  ['presenze', 'Presenze', 'Presenze agli allenamenti'],
  ['stat', 'Statistiche', 'Statistiche di presenza'],
];
export const ERRORE_SALVATAGGIO = 'Non sono riuscito a salvare tutto: controlla e riprova.';

export function AreaAllenatore({ utente }: { utente: Utente }) {
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>('atleti');
  const [catNome, setCatNome] = useState('');
  const [giorno, setGiorno] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tutte');
  const [periodo, setPeriodo] = useState<30 | 60>(30);
  const [ordine, setOrdine] = useState<Ordine>('ass');
  const [scelto, setScelto] = useState('');
  const [avviso, setAvviso] = useState('');
  const inVolo = useRef(0);
  const chiavePresenze = ['allenatore', 'presenze', utente.uid];

  const atleti = useQuery({ queryKey: ['allenatore', 'atleti', utente.uid], queryFn: leggiAtletiAllenatore, retry: false });
  const presenze = useQuery({
    queryKey: chiavePresenze,
    queryFn: leggiPresenzeAllenatore,
    enabled: vista !== 'atleti',
    retry: false,
    staleTime: Infinity,
  });

  const fuori = async () => {
    await esci();
    for (const k of CHIAVI_RISERVATE) qc.removeQueries({ queryKey: [k] });
  };

  // 401 = la sessione non vale piu': si esce, come il sito (signOut + ricarica).
  const scaduta = atleti.error instanceof SessioneScaduta || presenze.error instanceof SessioneScaduta;
  useEffect(() => {
    if (scaduta) void fuori();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaduta]);

  const imposta = (categoria: string, data: string, ids: string[], stato: StatoPresenza) => {
    const dati = qc.getQueryData<DatiPresenze>(chiavePresenze);
    const cat = dati?.categorie.find((c) => c.categoria === categoria);
    if (!cat || !ids.length) return;
    const prima = new Map(ids.map((id) => [id, statoDi(cat, data, id)]));
    setAvviso('');
    void qc.cancelQueries({ queryKey: chiavePresenze });
    qc.setQueryData<DatiPresenze>(chiavePresenze, (d) => d && conStatoNeiDati(d, categoria, data, ids, stato));
    for (const id of ids) {
      inVolo.current++;
      segnaPresenzaAllenatore(categoria, data, id, stato)
        .catch((e: unknown) => {
          if (e instanceof SessioneScaduta) return void fuori();
          qc.setQueryData<DatiPresenze>(chiavePresenze, (d) => d && conStatoNeiDati(d, categoria, data, [id], prima.get(id) ?? ''));
          setAvviso(ERRORE_SALVATAGGIO);
        })
        .finally(() => {
          inVolo.current--;
        });
    }
  };

  const aggiorna = () => {
    void atleti.refetch();
    // Mai rileggere mentre un salvataggio e' in corso: rimetterebbe lo stato vecchio sullo schermo.
    if (vista !== 'atleti' && inVolo.current === 0) void presenze.refetch();
  };

  if (atleti.error instanceof AccessoNegato) return <Negato fuori={fuori} />;

  const nomeMister = atleti.data ? (atleti.data.allenatore.nome + ' ' + atleti.data.allenatore.cognome).trim() : '';
  const titolo = SEZIONI.find((x) => x[0] === vista)![2];

  let corpo: ReactNode;
  if (vista === 'atleti') {
    corpo = atleti.isPending ? (
      <Text style={s.msg}>Caricamento…</Text>
    ) : atleti.isError ? (
      <Text style={s.msg}>Non riesco a caricare l’elenco. Controlla la connessione e riprova.</Text>
    ) : (
      <AtletiAllenatore dati={atleti.data} adesso={new Date()} />
    );
  } else if (presenze.isPending) {
    corpo = <Text style={s.msg}>Caricamento…</Text>;
  } else if (presenze.isError) {
    corpo = <Text style={s.msg}>Non riesco a caricare le presenze. Controlla la connessione e riprova.</Text>;
  } else if (!presenze.data.categorie.length) {
    corpo = <Text style={s.msg}>Non hai ancora squadre assegnate.</Text>;
  } else {
    const dati = presenze.data;
    const cat = dati.categorie.find((c) => c.categoria === catNome) || dati.categorie[0];
    const cambiaSquadra = (c: string) => {
      setCatNome(c);
      setGiorno('');
      setScelto('');
    };
    const segna = (data: string, ids: string[], stato: StatoPresenza) => imposta(cat.categoria, data, ids, stato);
    corpo = (
      <View>
        {avviso ? (
          <Text style={s.avviso} accessibilityRole="alert">
            {avviso}
          </Text>
        ) : null}
        {dati.categorie.length > 1 ? <Pillole voci={dati.categorie.map((c) => [c.categoria, c.categoria])} attiva={cat.categoria} onScegli={cambiaSquadra} etichetta="Squadra" /> : null}
        {vista === 'presenze' ? (
          <PresenzeAllenatore cat={cat} oggi={dati.oggi} giorno={giorno} setGiorno={setGiorno} filtro={filtro} setFiltro={setFiltro} imposta={segna} />
        ) : (
          <StatAllenatore
            cat={cat}
            oggi={dati.oggi}
            periodo={periodo}
            setPeriodo={setPeriodo}
            ordine={ordine}
            setOrdine={setOrdine}
            scelto={scelto}
            setScelto={setScelto}
            imposta={segna}
          />
        )}
      </View>
    );
  }

  return (
    <View style={s.pagina}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={false} onRefresh={aggiorna} />}>
        <LinearGradient colors={al.notte} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.testata}>
          <View style={s.marchio}>
            <Image source={require('../../../assets/images/logo.png')} style={s.logo} resizeMode="contain" accessibilityLabel="Victor Volley" />
            <View style={{ flexShrink: 1 }}>
              <Text style={s.marchioTesto}>Area Allenatore</Text>
              {nomeMister ? (
                <Text style={s.mister} numberOfLines={1}>
                  {nomeMister}
                </Text>
              ) : null}
            </View>
          </View>
          <Pressable style={({ pressed }) => [s.esci, pressed && s.esciPremuto]} onPress={() => void fuori()} accessibilityRole="button">
            <Icona nome="esci" misura={15} colore="rgba(255,255,255,0.7)" />
            <Text style={s.esciTesto}>Esci</Text>
          </Pressable>
        </LinearGradient>
        <View style={s.principale}>
          <View style={s.schede} accessibilityRole="tablist">
            {SEZIONI.map(([v, nome]) => {
              const on = v === vista;
              return (
                <Pressable key={v} style={[s.scheda, on && s.schedaOn]} onPress={() => setVista(v)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Text style={[s.schedaTesto, on && s.schedaTestoOn]} numberOfLines={1}>
                    {nome}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.titolo} accessibilityRole="header">
            {titolo}
          </Text>
          {corpo}
        </View>
      </ScrollView>
    </View>
  );
}

/** #deniedScreen di allenatore.html: account senza accesso da allenatore (o accesso tolto). */
export function Negato({ fuori, titolo = 'Accesso non abilitato', testo }: { fuori: () => void; titolo?: string; testo?: string }) {
  return (
    <LinearGradient colors={al.notte} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.negato}>
      <View style={s.negatoBox}>
        <Image source={require('../../../assets/images/logo.png')} style={s.negatoLogo} resizeMode="contain" accessibilityLabel="Victor Volley" />
        <Text style={s.negatoTitolo} accessibilityRole="header">
          {titolo}
        </Text>
        <Text style={s.negatoTesto}>{testo ?? 'Questo account non è abilitato come allenatore.\nChiedi alla segreteria di attivarlo.'}</Text>
        <Pressable style={({ pressed }) => [s.negatoTasto, pressed && { opacity: 0.85 }]} onPress={fuori} accessibilityRole="button">
          <Text style={s.negatoTastoTesto}>Esci</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

/** Attesa mentre Firebase legge la sessione o il ruolo. */
export const Attesa = () => (
  <View style={{ flex: 1, backgroundColor: al.sfondo, alignItems: 'center', justifyContent: 'center' }}>
    <ActivityIndicator color={al.blu} accessibilityLabel="Caricamento" />
  </View>
);

const s = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: al.sfondo },
  testata: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  marchio: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  logo: { width: 36, height: 36 },
  marchioTesto: { fontFamily: fonts.titolo, fontSize: 15, letterSpacing: 0.75, textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' },
  mister: { fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  esci: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  esciPremuto: { backgroundColor: 'rgba(255,255,255,0.1)' },
  esciTesto: { fontFamily: fonts.corpo, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  principale: { paddingTop: 20, paddingHorizontal: 16 },
  schede: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  scheda: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: al.bordo, backgroundColor: '#fff' },
  schedaOn: { backgroundColor: scuro, borderColor: scuro },
  schedaTesto: { fontFamily: fonts.corpoForte, fontSize: 14, color: al.testo },
  schedaTestoOn: { color: '#fff' },
  titolo: { fontFamily: fonts.titolo, fontSize: 24, color: al.testo, marginBottom: 8 },
  msg: { ...st.sotto, marginBottom: 12 },
  avviso: { fontFamily: fonts.corpoMedio, fontSize: 13, color: '#B91C1C', backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 12 },
  negato: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  negatoBox: { width: '100%', maxWidth: 400, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, gap: 10 },
  negatoLogo: { width: 72, height: 72 },
  negatoTitolo: { fontFamily: fonts.titolo, fontSize: 22, color: '#fff', textAlign: 'center' },
  negatoTesto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  negatoTasto: { marginTop: 8, alignSelf: 'stretch', minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: al.blu },
  negatoTastoTesto: { fontFamily: fonts.corpoForte, fontSize: 15, color: '#fff' },
});
