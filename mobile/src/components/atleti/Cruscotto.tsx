// Area atleti dopo l'accesso (#dashboard di atleta.html): testata con Esci, scelta del figlio, testata dell'atleta,
// schede Home e Avvisi; le altre quattro arrivano nei prossimi passi. Barra delle sezioni in basso come il sito da telefono.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvvisiAtleta } from '~/components/atleti/AvvisiAtleta';
import { HomeAtleta, type Vista } from '~/components/atleti/HomeAtleta';
import { Icona, Scheda, TastoLeggero, al, stili as base } from '~/components/atleti/Pezzi';
import { leggiUltimaLettura, salvaUltimaLettura } from '~/lib/accesso';
import { agenda, daConfermare, prossimoImpegno } from '~/lib/agenda';
import {
  categorieAvvisi,
  daFare,
  fissatoAttivo,
  iniziali,
  nomeCompleto,
  nonLetto,
  nuovaLettura,
  ordinaAvvisi,
  rateDaDocumenti,
  scadenze,
  testoBadge,
  unisciSchede,
} from '~/lib/atleti';
import { SITO, usePubblico } from '~/lib/dati';
import { esci, leggiAvvisi, leggiPresenze, leggiRate, leggiSchede, type Utente } from '~/lib/firebase';
import { fonts } from '~/lib/theme';

const SEZIONI: { vista: Vista; nome: string }[] = [
  { vista: 'home', nome: 'Home' },
  { vista: 'calendario', nome: 'Calendario' },
  { vista: 'avvisi', nome: 'Avvisi' },
  { vista: 'squadra', nome: 'Squadra' },
  { vista: 'documenti', nome: 'Documenti' },
  { vista: 'profilo', nome: 'Profilo' },
];

/** Le chiavi dei dati riservati: all'uscita si cancellano tutte. */
export const CHIAVI_RISERVATE = ['atleti', 'avvisi', 'rate', 'presenze'];

export function Cruscotto({ utente }: { utente: Utente }) {
  const qc = useQueryClient();
  const { bottom } = useSafeAreaInsets();
  const adesso = new Date();
  const [vista, setVista] = useState<Vista>('home');
  const [sceltoId, setScelto] = useState<string | null>(null);

  const schede = useQuery({ queryKey: ['atleti', utente.uid], queryFn: () => leggiSchede(utente.uid) });
  const atleti = useMemo(() => (schede.data ? unisciSchede(schede.data.conAccesso, schede.data.propria) : []), [schede.data]);
  const atleta = atleti.find((a) => a.uid === sceltoId) ?? atleti[0];
  const atletaId = atleta?.uid ?? '';
  const categoria = atleta?.categoria ?? '';

  const avvisi = useQuery({
    queryKey: ['avvisi', utente.uid, categoria],
    queryFn: async () => ordinaAvvisi(await leggiAvvisi(categorieAvvisi({ uid: atletaId, categoria })), new Date()),
    enabled: !!atletaId,
  });
  const rate = useQuery({
    queryKey: ['rate', atletaId],
    queryFn: async () => rateDaDocumenti(await leggiRate(atletaId)),
    enabled: !!atletaId,
  });

  const presenze = useQuery({
    queryKey: ['presenze', atletaId],
    queryFn: () => leggiPresenze(atletaId),
    enabled: !!atletaId,
  });

  // Partite e allenamenti della squadra: dati pubblici (/api/app-pubblico), non Firestore.
  const pubblico = usePubblico();
  const datiPubblici = pubblico.data;
  const impegni = datiPubblici
    ? agenda(categoria || undefined, datiPubblici.partite, datiPubblici.allenamenti ?? [], datiPubblici.allenamentiEccezioni ?? [], adesso)
    : null;

  // "Ultima lettura" degli avvisi su questo telefono, e com'era prima di aprire la scheda Avvisi.
  const [letti, setLetti] = useState<{ id: string; valore: string } | null>(null);
  const [primaDiAprire, setPrima] = useState('');
  useEffect(() => {
    if (!atletaId) return;
    let vivo = true;
    void leggiUltimaLettura(utente.uid, atletaId).then((v) => {
      if (!vivo) return;
      setLetti({ id: atletaId, valore: v });
      setPrima(v);
    });
    return () => {
      vivo = false;
    };
  }, [utente.uid, atletaId]);

  // Aprire la scheda Avvisi li segna come letti (fino al piu' recente), come il sito.
  const datiAvvisi = avvisi.data;
  useEffect(() => {
    if (vista !== 'avvisi' || !datiAvvisi || !letti || letti.id !== atletaId) return;
    const nuova = nuovaLettura(datiAvvisi, new Date());
    if (nuova === letti.valore) return;
    let vivo = true;
    void salvaUltimaLettura(utente.uid, atletaId, nuova).then(() => {
      if (vivo) setLetti({ id: atletaId, valore: nuova });
    });
    return () => {
      vivo = false;
    };
  }, [vista, datiAvvisi, letti, atletaId, utente.uid]);

  const apri = (v: Vista) => {
    if (v === 'avvisi') setPrima(letti?.id === atletaId ? letti.valore : '');
    setVista(v);
  };

  const scegli = (id: string) => {
    if (id === atletaId) return;
    setScelto(id);
    setLetti(null);
  };

  const fuori = async () => {
    await esci();
    for (const k of CHIAVI_RISERVATE) qc.removeQueries({ queryKey: [k] });
  };

  const aggiorna = () => {
    void schede.refetch();
    if (atletaId) {
      void avvisi.refetch();
      void rate.refetch();
      void presenze.refetch();
    }
    void pubblico.refetch();
  };

  const elencoAvvisi = avvisi.isError ? [] : (datiAvvisi ?? []);
  const nonLettiAvvisi = letti && letti.id === atletaId ? elencoAvvisi.filter((v) => nonLetto(v, letti.valore, adesso)) : [];
  // Come il sito: senza le risposte gia' date non si dice cosa manca.
  const nDaConfermare = impegni && presenze.data && categoria ? daConfermare(impegni, presenze.data, adesso) : 0;
  const cose = atleta
    ? daFare(scadenze(atleta, rate.data ?? [], adesso), nonLettiAvvisi.length, nonLettiAvvisi.some((v) => v.importante), nDaConfermare)
    : [];

  let corpo: ReactNode;
  if (schede.isPending) {
    corpo = <Text style={stili.stato}>Caricamento dati…</Text>;
  } else if (!atleta) {
    corpo = (
      <View style={stili.nessuno}>
        <Icona nome="persona" misura={40} colore="#94A3B8" />
        <Text style={stili.stato}>
          {schede.data?.errore ? 'Errore nel caricamento. Riprova più tardi.' : 'Nessun dato trovato per questo account.'}
        </Text>
        {schede.data?.errore ? null : <Text style={stili.statoSotto}>Contatta la segreteria di Victor Volley.</Text>}
      </View>
    );
  } else {
    corpo = (
      <View style={stili.contenuto}>
        <View style={stili.eroe}>
          <View style={stili.avatar}>
            <Text style={stili.avatarTesto}>{iniziali(atleta)}</Text>
          </View>
          <View style={stili.eroeTesto}>
            <Text style={stili.nome} accessibilityRole="header">
              {nomeCompleto(atleta)}
            </Text>
            {atleta.categoria ? (
              <View style={stili.chip}>
                <Text style={stili.chipTesto}>{atleta.categoria}</Text>
              </View>
            ) : (
              <Text style={base.spento}>Squadra non ancora assegnata</Text>
            )}
          </View>
        </View>
        {vista === 'home' ? (
          <HomeAtleta
            atleta={atleta}
            rate={rate.data ?? []}
            fissati={elencoAvvisi.filter((v) => fissatoAttivo(v, adesso))}
            cose={cose}
            prossimo={impegni ? prossimoImpegno(atleta.categoria, impegni) : null}
            adesso={adesso}
            vai={apri}
          />
        ) : vista === 'avvisi' ? (
          <AvvisiAtleta avvisi={avvisi.isError ? [] : datiAvvisi} errore={avvisi.isError} primaDiAprire={primaDiAprire} adesso={adesso} />
        ) : (
          <Scheda>
            <View style={[base.corpo, stili.inArrivo]}>
              <Text style={base.spento}>Questa sezione arriva presto nell’app. Intanto la trovi nell’area atleti del sito.</Text>
              <TastoLeggero testo="Apri l’area atleti del sito" onPress={() => void Linking.openURL(SITO + '/atleta')} />
            </View>
          </Scheda>
        )}
      </View>
    );
  }

  return (
    <View style={stili.pagina}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: atleta ? 96 + bottom : 48 }}
        refreshControl={<RefreshControl refreshing={schede.isRefetching} onRefresh={aggiorna} />}>
        <LinearGradient colors={al.notte} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={stili.testata}>
          <View style={stili.marchio}>
            <Image source={require('../../../assets/images/logo.png')} style={stili.logo} resizeMode="contain" accessibilityLabel="Victor Volley" />
            <Text style={stili.marchioTesto}>Area Atleti</Text>
          </View>
          <Pressable style={({ pressed }) => [stili.esci, pressed && stili.esciPremuto]} onPress={() => void fuori()} accessibilityRole="button">
            <Icona nome="esci" misura={15} colore="rgba(255,255,255,0.7)" />
            <Text style={stili.esciTesto}>Esci</Text>
          </Pressable>
        </LinearGradient>
        {atleti.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={stili.figli} contentContainerStyle={stili.figliRiga} accessibilityRole="tablist">
            {atleti.map((a) => {
              const attivo = a.uid === atletaId;
              return (
                <Pressable
                  key={a.uid}
                  style={[stili.figlio, attivo && stili.figlioAttivo]}
                  onPress={() => scegli(a.uid)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: attivo }}>
                  <Text style={[stili.figlioTesto, attivo && stili.figlioTestoAttivo]}>{a.nome || nomeCompleto(a)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        <View style={stili.principale}>{corpo}</View>
      </ScrollView>

      {atleta ? (
        <View style={[stili.barra, { paddingBottom: bottom }]} accessibilityRole="tablist">
          {SEZIONI.map((s) => {
            const attiva = s.vista === vista;
            const n = s.vista === 'avvisi' ? nonLettiAvvisi.length : 0;
            return (
              <Pressable
                key={s.vista}
                style={[stili.sezione, attiva && stili.sezioneAttiva]}
                onPress={() => apri(s.vista)}
                accessibilityRole="tab"
                accessibilityState={{ selected: attiva }}
                accessibilityLabel={n ? s.nome + ', ' + n + ' non letti' : s.nome}>
                <Icona nome={s.vista} colore={attiva ? al.blu : al.spento} />
                <Text style={[stili.sezioneTesto, attiva && stili.sezioneTestoAttiva]} numberOfLines={1}>
                  {s.nome}
                </Text>
                {n ? (
                  <View style={stili.badge}>
                    <Text style={stili.badgeTesto}>{testoBadge(n)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const stili = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: al.sfondo },
  testata: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  marchio: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36 },
  marchioTesto: { fontFamily: fonts.titolo, fontSize: 15, letterSpacing: 0.75, textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' },
  esci: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  esciPremuto: { backgroundColor: 'rgba(255,255,255,0.1)' },
  esciTesto: { fontFamily: fonts.corpo, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  figli: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: al.bordo, flexGrow: 0 },
  figliRiga: { gap: 8, paddingVertical: 10, paddingHorizontal: 16 },
  figlio: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: al.bordo, backgroundColor: '#fff' },
  figlioAttivo: { backgroundColor: al.blu, borderColor: al.blu },
  figlioTesto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: al.spento },
  figlioTestoAttivo: { color: '#fff' },
  principale: { paddingTop: 20, paddingHorizontal: 16 },
  contenuto: { gap: 20 },
  stato: { fontFamily: fonts.corpo, fontSize: 15, color: al.spento, textAlign: 'center', paddingTop: 12 },
  statoSotto: { fontFamily: fonts.corpo, fontSize: 13, color: al.spento, textAlign: 'center', marginTop: 4 },
  nessuno: { alignItems: 'center', paddingVertical: 68 },
  eroe: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center' },
  avatarTesto: { fontFamily: fonts.titolo, fontSize: 17, color: '#fff' },
  eroeTesto: { flex: 1, minWidth: 0, gap: 4 },
  nome: { fontFamily: fonts.titolo, fontSize: 20, lineHeight: 23, color: al.testo },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20, backgroundColor: '#EFF6FF' },
  chipTesto: { fontFamily: fonts.corpoMedio, fontSize: 12, color: al.bluScuro },
  inArrivo: { gap: 14 },
  barra: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: al.bordo,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  sezione: { flex: 1, alignItems: 'center', gap: 3, paddingTop: 9, paddingBottom: 8, paddingHorizontal: 2, borderTopWidth: 2, borderColor: 'transparent' },
  sezioneAttiva: { borderColor: al.blu },
  sezioneTesto: { fontFamily: fonts.corpoMedio, fontSize: 11, color: al.spento },
  sezioneTestoAttiva: { color: al.blu },
  badge: {
    position: 'absolute',
    top: 6,
    left: '50%',
    marginLeft: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: al.rosso,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTesto: { fontFamily: fonts.corpoForte, fontSize: 10, lineHeight: 16, color: '#fff' },
});
