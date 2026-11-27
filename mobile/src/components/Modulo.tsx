// Modulo pubblico come quelli del sito (.form-group, .form-input, .form-check, .form-notice di css/style.css
// e js/form-validate.js): errori sotto i campi, "Invio in corso…", riquadro ok/errore sopra il modulo.
import { useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { errori, type Campo, type Valori } from '~/lib/moduli';
import { privacy } from '~/lib/pagine';
import { EMAIL } from '~/lib/social';
import { colors, fonts } from '~/lib/theme';
import { vai } from '~/lib/vai';

type Avviso = { titolo: string; testo: string };

type Props = {
  campi: Campo[];
  /** Campi da mettere affiancati sullo schermo largo (.form-row), per nome. */
  coppie?: [string, string][];
  testoInvio: string;
  ok: Avviso;
  /** Riquadri piu' stretti (.form-notice--compact). */
  compatto?: boolean;
  invia: (valori: Valori) => Promise<boolean>;
  /** Chiamato quando compare un riquadro (ok o errore), per scorrere fino al modulo. */
  mostra?: () => void;
  attuale: string;
};

export function Modulo({ campi, coppie = [], testoInvio, ok, compatto, invia, mostra, attuale }: Props) {
  const { width } = useWindowDimensions();
  const largo = width > 768;
  const [valori, setValori] = useState<Valori>({});
  const [sbagli, setSbagli] = useState<Record<string, string>>({});
  const [occupato, setOccupato] = useState(false);
  const [esito, setEsito] = useState<'ok' | 'errore' | null>(null);
  const [scelta, setScelta] = useState<Campo | null>(null);

  // Ultimi valori scritti: "Invia" li legge da qui, cosi' un tocco subito dopo l'ultima modifica non perde niente.
  const ultimi = useRef<Valori>({});

  const cambia = (nome: string, v: string) => {
    ultimi.current = { ...ultimi.current, [nome]: v };
    setValori(ultimi.current);
    setSbagli((x) => (x[nome] ? { ...x, [nome]: '' } : x));
  };

  const manda = async () => {
    if (occupato) return;
    const adesso = ultimi.current;
    setEsito(null);
    const e = errori(campi, adesso);
    setSbagli(e);
    if (Object.keys(e).length) return;
    setOccupato(true);
    let arrivato = false;
    try {
      arrivato = await invia(adesso);
    } catch {
      arrivato = false;
    }
    setOccupato(false);
    if (arrivato) {
      ultimi.current = {};
      setValori({});
    }
    setEsito(arrivato ? 'ok' : 'errore');
    mostra?.();
  };

  const campo = (c: Campo) => {
    const sbaglio = sbagli[c.nome];
    const etichetta = (
      <Text style={styles.etichetta}>
        {c.etichetta}
        {c.obbligatorio ? <Text style={styles.obbligatorio}> *</Text> : null}
      </Text>
    );
    const errore = sbaglio ? <Text style={styles.errore} accessibilityRole="alert">{sbaglio}</Text> : null;

    if (c.tipo === 'spunta') {
      const spuntato = valori[c.nome] === 'si';
      return (
        <View key={c.nome} style={styles.gruppo}>
          <View style={styles.spuntaRiga}>
            <Pressable
              onPress={() => cambia(c.nome, spuntato ? '' : 'si')}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: spuntato }}
              accessibilityLabel="Ho letto l’informativa privacy"
              hitSlop={12}
              style={[styles.casella, spuntato && styles.casellaPiena, !!sbaglio && styles.bordoErrore]}>
              {spuntato ? <Text style={styles.segno}>✓</Text> : null}
            </Pressable>
            <Text style={styles.spuntaTesto}>
              Ho letto l’
              <Text style={styles.link} onPress={() => vai(privacy.href, attuale)} accessibilityRole="link">informativa privacy</Text>
              {' '}{c.etichetta}
              {c.obbligatorio && !c.senzaAsterisco ? <Text style={styles.obbligatorio}> *</Text> : null}
            </Text>
          </View>
          {errore}
        </View>
      );
    }

    if (c.tipo === 'scelta') {
      const v = valori[c.nome] || '';
      const mostrato = c.opzioni?.find(([valore]) => valore === v)?.[1];
      return (
        <View key={c.nome} style={[styles.gruppo, largo && styles.meta]}>
          {etichetta}
          <Pressable
            style={[styles.casello, styles.tendina, !!sbaglio && styles.bordoErrore]}
            onPress={() => setScelta(c)}
            accessibilityRole="button"
            accessibilityLabel={c.etichetta}
            accessibilityHint={mostrato || c.vuoto}>
            <Text style={styles.testoCasello} numberOfLines={1}>{mostrato || c.vuoto}</Text>
            <Text style={styles.freccia}>▾</Text>
          </Pressable>
          {errore}
        </View>
      );
    }

    return (
      <View key={c.nome} style={styles.gruppo}>
        {etichetta}
        <TextInput
          style={[styles.casello, c.tipo === 'area' && styles.area, !!sbaglio && styles.bordoErrore]}
          value={valori[c.nome] || ''}
          onChangeText={(v) => cambia(c.nome, v)}
          placeholder={c.segnaposto}
          placeholderTextColor="#8a8a96"
          accessibilityLabel={c.etichetta}
          keyboardType={c.tipo === 'email' ? 'email-address' : c.tipo === 'tel' ? 'phone-pad' : 'default'}
          autoCapitalize={c.tipo === 'email' ? 'none' : 'sentences'}
          autoCorrect={c.tipo !== 'email'}
          autoComplete={c.autocompleta}
          multiline={c.tipo === 'area'}
          textAlignVertical={c.tipo === 'area' ? 'top' : 'center'}
          editable={!occupato}
        />
        {errore}
      </View>
    );
  };

  // Righe: le coppie affiancate sullo schermo largo, gli altri campi uno per riga.
  const inCoppia = new Map<string, string>();
  coppie.forEach(([a, b]) => { inCoppia.set(a, b); inCoppia.set(b, ''); });
  const righe: Campo[][] = [];
  for (const c of campi) {
    const compagno = inCoppia.get(c.nome);
    if (compagno === '') continue;
    const altro = compagno ? campi.find((x) => x.nome === compagno) : undefined;
    righe.push(altro ? [c, altro] : [c]);
  }

  return (
    <View style={styles.modulo}>
      {esito === 'ok' ? (
        <View style={[styles.avviso, styles.avvisoOk, compatto && styles.compatto]} accessibilityRole="summary" accessibilityLiveRegion="polite">
          <Text style={[styles.avvisoTitolo, { color: '#1a8a2e' }]}>✓ {ok.titolo}</Text>
          <Text style={styles.avvisoTesto}>{ok.testo}</Text>
        </View>
      ) : null}
      {esito === 'errore' ? (
        <View style={[styles.avviso, styles.avvisoErrore]} accessibilityRole="alert">
          <Text style={[styles.avvisoTitolo, { color: '#c82828' }]}>Invio non riuscito.</Text>
          <Text style={styles.avvisoTesto}>
            Riprova oppure scrivici direttamente a{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('mailto:' + EMAIL)} accessibilityRole="link">{EMAIL}</Text>.
          </Text>
        </View>
      ) : null}

      {righe.map((r) =>
        r.length === 2 && largo ? (
          <View key={r[0].nome} style={styles.coppia}>
            {r.map((c) => <View key={c.nome} style={styles.meta}>{campo(c)}</View>)}
          </View>
        ) : r.length === 2 ? (
          // .form-row su telefono: una colonna con gap 16 tra i due campi.
          r.map((c, i) => <View key={c.nome} style={i === 0 && styles.primoDellaCoppia}>{campo(c)}</View>)
        ) : (
          r.map(campo)
        ),
      )}

      <Pressable
        style={[styles.invia, occupato && styles.inviaOccupato]}
        onPress={manda}
        disabled={occupato}
        accessibilityRole="button"
        accessibilityState={{ busy: occupato, disabled: occupato }}>
        <Text style={styles.inviaTesto}>{occupato ? 'Invio in corso…' : testoInvio}</Text>
      </Pressable>

      <Modal visible={!!scelta} transparent animationType="slide" onRequestClose={() => setScelta(null)}>
        <Pressable style={styles.velo} onPress={() => setScelta(null)} accessibilityLabel="Chiudi" />
        <View style={styles.foglio}>
          <Text style={styles.foglioTitolo}>{scelta?.etichetta}</Text>
          {scelta?.opzioni?.map(([valore, testo]) => {
            const attiva = valori[scelta.nome] === valore;
            return (
              <Pressable
                key={valore}
                style={[styles.voce, attiva && styles.voceAttiva]}
                onPress={() => { cambia(scelta.nome, valore); setScelta(null); }}
                accessibilityRole="button"
                accessibilityState={{ selected: attiva }}>
                <Text style={[styles.voceTesto, attiva && styles.voceTestoAttiva]}>{testo}</Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modulo: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  gruppo: { marginBottom: 20 },
  coppia: { flexDirection: 'row', gap: 16 },
  meta: { flex: 1, minWidth: 0 },
  primoDellaCoppia: { marginBottom: 16 },
  etichetta: { fontFamily: fonts.corpoMedio, fontSize: 14, lineHeight: 22, color: colors.navy, marginBottom: 6 },
  obbligatorio: { color: colors.magenta },
  casello: {
    minHeight: 48, paddingVertical: 11, paddingHorizontal: 14, fontFamily: fonts.corpo, fontSize: 15, color: colors.testo,
    backgroundColor: colors.bianco, borderWidth: 2, borderColor: '#e0e0e8', borderRadius: 6,
  },
  area: { minHeight: 120 },
  bordoErrore: { borderColor: '#c82828' },
  tendina: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  testoCasello: { flex: 1, fontFamily: fonts.corpo, fontSize: 15, color: colors.testo },
  freccia: { fontSize: 14, color: colors.navy },
  errore: { marginTop: 6, fontFamily: fonts.corpo, fontSize: 13, lineHeight: 18, color: '#c82828' },
  spuntaRiga: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  casella: { width: 20, height: 20, marginTop: 2, borderRadius: 4, borderWidth: 2, borderColor: '#9a9aa6', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bianco },
  casellaPiena: { backgroundColor: colors.azzurro, borderColor: colors.azzurro },
  segno: { color: colors.bianco, fontSize: 13, lineHeight: 15, fontFamily: fonts.corpoForte },
  spuntaTesto: { flex: 1, fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19.5, color: '#555' },
  link: { color: colors.azzurro, textDecorationLine: 'underline' },
  invia: { minHeight: 48, borderRadius: 3, backgroundColor: colors.azzurroScuro, alignItems: 'center', justifyContent: 'center', padding: 14 },
  inviaOccupato: { opacity: 0.7 },
  inviaTesto: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.bianco },
  avviso: { padding: 20, marginBottom: 24, borderWidth: 1, borderRadius: 12 },
  avvisoOk: { padding: 24, backgroundColor: 'rgba(26,138,46,0.08)', borderColor: 'rgba(26,138,46,0.25)' },
  avvisoErrore: { backgroundColor: 'rgba(200,40,40,0.08)', borderColor: 'rgba(200,40,40,0.25)' },
  compatto: { padding: 20 },
  avvisoTitolo: { fontFamily: fonts.corpoForte, fontSize: 16 },
  avvisoTesto: { marginTop: 4, fontFamily: fonts.corpo, fontSize: 14, lineHeight: 22, color: '#555' },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  foglio: { backgroundColor: colors.bianco, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 18, paddingBottom: 34, paddingHorizontal: 12 },
  foglioTitolo: { fontFamily: fonts.titolo, fontSize: 18, color: colors.navy, marginBottom: 10, marginHorizontal: 8 },
  voce: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8 },
  voceAttiva: { backgroundColor: 'rgba(0,140,253,0.1)' },
  voceTesto: { fontFamily: fonts.corpo, fontSize: 15, color: colors.testo },
  voceTestoAttiva: { fontFamily: fonts.corpoMedio, color: colors.azzurroScuro },
});
