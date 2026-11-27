// "Chiedi a Victor": tasto in basso a destra, invito dopo 3,5 s e pannello con le risposte fisse del sito (js/chatbot.js, css/chatbot.css).
// Sul sito c'e' in tutte le pagine pubbliche tranne Diretta e aree riservate.
import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { INSTAGRAM, linkAmmesso, rispondi, rispostaDinamica, useDatiBot, type Categoria, type DatiBot, type Domanda, type LinkBot } from '~/lib/chiedi';
import { SITO, usePubblico, type Partita } from '~/lib/dati';
import { oggiLocale } from '~/lib/diretta';
import { colors, fonts } from '~/lib/theme';

// Come il sito: niente assistente in diretta.html, atleta, allenatore e admin (qui: Diretta, Area Atleti, Area Dirigenti).
export const PAGINE_SENZA_BOT = ['/diretta', '/area-atleti', '/area-dirigenti'];
const APP: Record<string, string> = { '/atleta': '/area-atleti' }; // pagine del sito con un altro indirizzo nell'app
const PAGINE_APP = ['/', '/squadre', '/calendario', '/news', '/galleria', '/sponsor', '/contatti', '/unisciti-a-noi', '/privacy', '/area-atleti', '/area-dirigenti', '/diretta'];

/** Dove porta il link di una risposta: una pagina dell'app, oppure il browser (Instagram, pagine che l'app non ha). */
export function destinazione(url: string): { app: string } | { web: string } {
  if (url === INSTAGRAM) return { web: url };
  const pagina = APP[url] ?? url;
  return PAGINE_APP.includes(pagina) ? { app: pagina } : { web: SITO + url };
}

type Messaggio = { id: number; chi: 'bot' | 'utente' | 'nota'; testo: string; link?: LinkBot | null };
type Chip = { testo: string; azione: () => void };

// L'invito compare una volta per apertura dell'app (sul sito una volta per scheda).
let invitoVisto = false;

function Conversazione({ dati, partite, chiudi }: { dati: DatiBot; partite: Partita[]; chiudi: () => void }) {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [chips, setChips] = useState<{ voci: Chip[]; colonna?: boolean } | null>(null);
  const [testo, setTesto] = useState('');
  const conta = useRef(0);
  const lista = useRef<ComponentRef<typeof ScrollView>>(null);

  const scrivi = (chi: Messaggio['chi'], t: string, link?: LinkBot | null) => setMessaggi((m) => [...m, { id: ++conta.current, chi, testo: t, link }]);

  const dopo = () =>
    setChips({
      voci: [
        { testo: 'Altra domanda', azione: () => (scrivi('utente', 'Altra domanda'), argomenti()) },
        { testo: 'Parla con la società', azione: () => (scrivi('utente', 'Parla con la società'), persona()) },
      ],
    });
  const persona = () => {
    scrivi('bot', 'Scrivici a ' + dati.email + ' oppure usa il modulo contatti: ti risponde una persona della società.', dati.fallback_link);
    dopo();
  };
  const risposta = (d: Domanda, testoLibero = '') => {
    setChips(null);
    if (d.dinamico) {
      // Sul sito c'e' "Controllo il calendario…" mentre arrivano le partite: qui sono gia' caricate.
      const frase = rispostaDinamica(d.dinamico, partite, testoLibero, oggiLocale(new Date()));
      if (frase) scrivi('bot', frase);
    }
    scrivi('bot', d.risposta, d.link);
    dopo();
  };
  const categoria = (c: Categoria) => {
    scrivi('bot', 'Ecco le domande su «' + c.titolo + '». Scegline una.');
    setChips({
      colonna: true,
      voci: [
        ...c.domande.map((d) => ({ testo: d.q, azione: () => (scrivi('utente', d.q), risposta(d)) })),
        { testo: '← Altri argomenti', azione: () => (scrivi('utente', 'Altri argomenti'), argomenti()) },
      ],
    });
  };
  const argomenti = () => setChips({ voci: dati.categorie.map((c) => ({ testo: c.titolo, azione: () => (scrivi('utente', c.titolo), categoria(c)) })) });

  const invia = () => {
    const t = testo.trim().slice(0, 300);
    setTesto('');
    if (!t) return;
    scrivi('utente', t);
    setChips(null);
    const e = rispondi(dati, t);
    if (e.tipo === 'saluto') {
      scrivi('bot', 'Ciao! Come posso aiutarti?');
      argomenti();
    } else if (e.tipo === 'grazie') {
      scrivi('bot', 'Di niente! Se hai altre domande sono qui.');
      dopo();
    } else if (e.tipo === 'risposta') risposta(e.d, t);
    else if (e.tipo === 'forse') {
      scrivi('bot', 'Forse cercavi una di queste domande?');
      setChips({
        colonna: true,
        voci: [
          ...e.domande.map((d) => ({ testo: d.q, azione: () => (scrivi('utente', d.q), risposta(d)) })),
          { testo: 'Nessuna di queste', azione: () => (scrivi('utente', 'Nessuna di queste'), persona()) },
        ],
      });
    } else {
      scrivi('bot', dati.fallback, dati.fallback_link);
      dopo();
    }
  };

  // All'apertura: saluto, avviso e argomenti (start() del sito).
  useEffect(() => {
    setMessaggi([
      { id: ++conta.current, chi: 'bot', testo: dati.saluto },
      { id: ++conta.current, chi: 'nota', testo: dati.avviso },
    ]);
    argomenti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apriLink = (l: LinkBot) => {
    const dove = destinazione(l.url);
    if ('web' in dove) void Linking.openURL(dove.web);
    else {
      chiudi();
      router.push(dove.app as Href);
    }
  };

  return (
    <>
      <ScrollView ref={lista} style={styles.log} contentContainerStyle={styles.logDentro} onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })} accessibilityLiveRegion="polite">
        {messaggi.map((m) =>
          m.chi === 'nota' ? (
            <Text key={m.id} style={styles.nota}>
              {m.testo}
            </Text>
          ) : (
            <View key={m.id} style={[styles.riga, m.chi === 'utente' && styles.rigaUtente]}>
              <View style={[styles.fumetto, m.chi === 'utente' && styles.fumettoUtente]}>
                <Text style={[styles.fumettoTesto, m.chi === 'utente' && styles.fumettoTestoUtente]}>{m.testo}</Text>
                {m.chi === 'bot' && linkAmmesso(m.link) ? (
                  <Pressable style={styles.link} onPress={() => apriLink(m.link!)} accessibilityRole="link">
                    <Text style={styles.linkTesto}>{m.link!.testo || 'Apri'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ),
        )}
        {chips ? (
          <View style={[styles.chips, chips.colonna && styles.chipsColonna]}>
            {chips.voci.map((c) => (
              <Pressable key={c.testo} style={styles.chip} onPress={c.azione} accessibilityRole="button">
                <Text style={styles.chipTesto}>{c.testo}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.form}>
        <TextInput
          style={styles.campo}
          value={testo}
          onChangeText={setTesto}
          onSubmitEditing={invia}
          maxLength={300}
          placeholder="Scrivi la tua domanda…"
          placeholderTextColor="#767676"
          accessibilityLabel="La tua domanda"
          autoCorrect
          returnKeyType="send"
        />
        <Pressable style={styles.invia} onPress={invia} accessibilityRole="button">
          <Text style={styles.inviaTesto}>Invia</Text>
        </Pressable>
      </View>
    </>
  );
}

export function ChiediVictor() {
  const pagina = usePathname();
  const { bottom } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { data: dati } = useDatiBot();
  const { data: pubblico } = usePubblico();
  const [aperto, setAperto] = useState(false);
  const [invito, setInvito] = useState(false);
  const [anello] = useState(() => new Animated.Value(0));

  // Invito dopo 3,5 s, una volta sola.
  useEffect(() => {
    if (!dati?.invito || invitoVisto) return;
    const t = setTimeout(() => setInvito(true), 3500);
    return () => clearTimeout(t);
  }, [dati]);
  // Anello che pulsa intorno al tasto (fermo con "riduci movimento").
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let vivo = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((ridotto) => {
      if (!vivo || ridotto) return;
      anim = Animated.loop(Animated.timing(anello, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }));
      anim.start();
    });
    return () => {
      vivo = false;
      anim?.stop();
    };
  }, [anello]);

  if (!dati || PAGINE_SENZA_BOT.includes(pagina)) return null;

  const chiudiInvito = () => {
    invitoVisto = true;
    setInvito(false);
  };
  const apri = () => {
    chiudiInvito();
    setAperto(true);
  };

  return (
    <>
      <View style={[styles.angolo, { bottom: 12 + bottom }]} pointerEvents="box-none">
        {invito && !aperto ? (
          <View style={styles.invito}>
            <Pressable style={styles.invitoTasto} onPress={apri} accessibilityRole="button">
              <Text style={styles.invitoTesto}>{dati.invito}</Text>
            </Pressable>
            <Pressable style={styles.invitoX} onPress={chiudiInvito} accessibilityRole="button" accessibilityLabel="Chiudi il suggerimento">
              <Text style={styles.invitoXTesto}>×</Text>
            </Pressable>
            <View style={styles.punta} />
          </View>
        ) : null}
        <View>
          <Animated.View
            pointerEvents="none"
            style={[styles.anello, { opacity: anello.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.55, 0, 0] }), transform: [{ scale: anello.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.25, 1.25] }) }] }]}
          />
          <Pressable style={styles.tasto} onPress={apri} accessibilityRole="button" accessibilityLabel="Apri l'assistente Victor" accessibilityState={{ expanded: aperto }}>
            <Text style={styles.tastoIcona}>🏐</Text>
            <Text style={styles.tastoTesto}>{dati.etichetta || 'Chiedi a Victor'}</Text>
          </Pressable>
        </View>
      </View>
      <Modal visible={aperto} transparent animationType="slide" onRequestClose={() => setAperto(false)}>
        <Pressable style={styles.velo} onPress={() => setAperto(false)} accessibilityLabel="Chiudi l'assistente" importantForAccessibility="no" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sotto} pointerEvents="box-none">
          <View style={[styles.pannello, { height: Math.min(height * 0.78, 600), paddingBottom: bottom }]} accessibilityViewIsModal accessibilityLabel={dati.nome}>
            <View style={styles.testa}>
              <View>
                <Text style={styles.titolo}>{dati.nome}</Text>
                <Text style={styles.sottotitolo}>Risponde subito, senza registrarti</Text>
              </View>
              <Pressable style={styles.chiudi} onPress={() => setAperto(false)} accessibilityRole="button" accessibilityLabel="Chiudi l'assistente">
                <Text style={styles.chiudiTesto}>×</Text>
              </Pressable>
            </View>
            <Conversazione dati={dati} partite={pubblico?.partite ?? []} chiudi={() => setAperto(false)} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  angolo: { position: 'absolute', right: 12, zIndex: 9000, alignItems: 'flex-end' },
  tasto: { height: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 18, paddingRight: 24, borderRadius: 29, borderWidth: 2, borderColor: colors.bianco, backgroundColor: colors.magenta, shadowColor: colors.magenta, shadowOpacity: 0.55, shadowRadius: 13, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  anello: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 29, backgroundColor: colors.magenta },
  tastoIcona: { fontSize: 24 },
  tastoTesto: { fontFamily: fonts.titoloForte, fontSize: 17, letterSpacing: 0.3, color: colors.bianco },
  invito: { width: 260, marginBottom: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingVertical: 12, paddingLeft: 14, paddingRight: 8, borderRadius: 12, backgroundColor: colors.bianco, shadowColor: colors.navy, shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  invitoTasto: { flex: 1 },
  invitoTesto: { fontFamily: fonts.corpoForte, fontSize: 14, lineHeight: 20, color: colors.navy },
  invitoX: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  invitoXTesto: { fontSize: 18, lineHeight: 20, color: '#5b5b66' },
  punta: { position: 'absolute', right: 36, bottom: -7, width: 14, height: 14, backgroundColor: colors.bianco, transform: [{ rotate: '45deg' }] },
  velo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(2,13,26,0.35)' },
  sotto: { flex: 1, justifyContent: 'flex-end' },
  pannello: { backgroundColor: colors.bianco, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  testa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.navy },
  titolo: { fontFamily: fonts.titolo, fontSize: 16, letterSpacing: 0.3, color: colors.bianco },
  sottotitolo: { fontFamily: fonts.corpo, fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  chiudi: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  chiudiTesto: { fontSize: 22, lineHeight: 24, color: colors.bianco },
  log: { flex: 1, backgroundColor: '#F4F4F6' },
  logDentro: { padding: 14, gap: 10 },
  riga: { flexDirection: 'row' },
  rigaUtente: { justifyContent: 'flex-end' },
  fumetto: { maxWidth: '86%', paddingVertical: 10, paddingHorizontal: 13, borderRadius: 14, backgroundColor: colors.bianco, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 1, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  fumettoUtente: { backgroundColor: colors.azzurro },
  fumettoTesto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: '#1A1A1E' },
  fumettoTestoUtente: { color: colors.bianco },
  link: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 3, backgroundColor: colors.navy },
  linkTesto: { fontFamily: fonts.corpoForte, fontSize: 13, color: colors.bianco },
  nota: { fontFamily: fonts.corpo, fontSize: 11.5, color: '#5b5b66', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsColonna: { flexDirection: 'column', alignItems: 'flex-start' },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, borderColor: colors.azzurro, backgroundColor: colors.bianco },
  chipTesto: { fontFamily: fonts.corpoMedio, fontSize: 13, lineHeight: 17, color: colors.navy },
  form: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#e3e3e8', backgroundColor: colors.bianco },
  campo: { flex: 1, minWidth: 0, height: 42, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#c9c9d1', borderRadius: 3, fontFamily: fonts.corpo, fontSize: 16, color: '#1A1A1E' },
  invia: { height: 42, paddingHorizontal: 16, borderRadius: 3, backgroundColor: colors.magenta, justifyContent: 'center' },
  inviaTesto: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.bianco },
});
