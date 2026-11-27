// Scheda Profilo dell'area atleti (#view-profilo di atleta.html): email dell'account, promemoria via email,
// cambio password. Le due scritture (notifiche, password) arrivano da fuori come funzioni.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Icona, Scheda, al, stili as base } from '~/components/atleti/Pezzi';
import { fonts } from '~/lib/theme';

type Props = {
  email: string;
  /** null finche' la preferenza non e' arrivata (il sito parte con la casella spuntata). */
  promemoria: boolean | null;
  salvaPromemoria: (attivi: boolean) => Promise<void>;
  cambiaPassword: (attuale: string, nuova: string) => Promise<{ ok: boolean; messaggio: string }>;
};

type Msg = { testo: string; ok: boolean } | null;

/** Controlli del modulo prima di chiamare Firebase (_changePassword). */
export function erroreNuovaPassword(attuale: string, nuova: string, conferma: string) {
  if (nuova.length < 10) return 'La nuova password deve avere almeno 10 caratteri.';
  if (nuova !== conferma) return 'Le due password non coincidono.';
  if (nuova === attuale) return 'La nuova password deve essere diversa da quella attuale.';
  return null;
}

function Campo({ etichetta, valore, cambia, nuova, segnaposto }: { etichetta: string; valore: string; cambia: (t: string) => void; nuova?: boolean; segnaposto?: string }) {
  const [fuoco, setFuoco] = useState(false);
  return (
    <>
      <Text style={stili.etichetta}>{etichetta}</Text>
      <TextInput
        style={[stili.campo, fuoco && stili.campoFuoco]}
        value={valore}
        onChangeText={cambia}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={nuova ? 'new-password' : 'current-password'}
        textContentType={nuova ? 'newPassword' : 'password'}
        placeholder={segnaposto}
        placeholderTextColor="#94A3B8"
        accessibilityLabel={etichetta}
        onFocus={() => setFuoco(true)}
        onBlur={() => setFuoco(false)}
      />
    </>
  );
}

const Messaggio = ({ m }: { m: Msg }) =>
  m ? (
    <Text style={[stili.msg, m.ok ? stili.msgOk : stili.msgErr]} accessibilityLiveRegion="polite">
      {m.testo}
    </Text>
  ) : null;

export function ProfiloAtleta({ email, promemoria, salvaPromemoria, cambiaPassword }: Props) {
  // Promemoria: la casella cambia subito; se il salvataggio non riesce torna com'era.
  const [scelta, setScelta] = useState<boolean | null>(null);
  const attivi = scelta ?? promemoria ?? true;
  const [msgNotif, setMsgNotif] = useState<Msg>(null);
  const cambiaPromemoria = (v: boolean) => {
    setMsgNotif(null);
    setScelta(v);
    salvaPromemoria(v).then(
      () => setMsgNotif({ ok: true, testo: v ? 'Promemoria attivati.' : 'Promemoria disattivati: non riceverai più email di scadenza.' }),
      () => {
        setScelta(!v);
        setMsgNotif({ ok: false, testo: 'Non è stato possibile salvare la preferenza. Riprova.' });
      },
    );
  };

  const [attuale, setAttuale] = useState('');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [occupato, setOccupato] = useState(false);
  const [msgPwd, setMsgPwd] = useState<Msg>(null);
  const salva = async () => {
    if (occupato) return;
    const errore = erroreNuovaPassword(attuale, nuova, conferma);
    if (errore) {
      setMsgPwd({ ok: false, testo: errore });
      return;
    }
    setOccupato(true);
    const r = await cambiaPassword(attuale, nuova);
    setOccupato(false);
    setMsgPwd({ ok: r.ok, testo: r.messaggio });
    if (r.ok) {
      setAttuale('');
      setNuova('');
      setConferma('');
    }
  };

  return (
    <Scheda>
      <View style={base.testaScheda}>
        <View style={base.iconaScheda}>
          <Icona nome="profilo" misura={22} colore={al.blu} />
        </View>
        <View style={stili.testaTesto}>
          <Text style={base.titoloScheda} accessibilityRole="header">
            Il tuo account
          </Text>
          <Text style={base.sottoScheda}>{email}</Text>
        </View>
      </View>
      <View style={base.corpo}>
        <View style={stili.modulo}>
          <Text style={stili.titoloModulo} accessibilityRole="header">
            Promemoria via email
          </Text>
          <View style={stili.casella}>
            <Switch
              value={attivi}
              onValueChange={cambiaPromemoria}
              disabled={promemoria === null}
              trackColor={{ true: al.blu, false: al.bordo }}
              accessibilityLabel="Ricevi un’email prima delle scadenze di quote e certificato medico"
            />
            <Text style={stili.casellaTesto}>Ricevi un’email prima delle scadenze di quote e certificato medico</Text>
          </View>
          <Messaggio m={msgNotif} />
        </View>

        <View style={[stili.modulo, stili.secondo]}>
          <Text style={stili.titoloModulo} accessibilityRole="header">
            Cambia password
          </Text>
          <Campo etichetta="Password attuale" valore={attuale} cambia={setAttuale} />
          <Campo etichetta="Nuova password" valore={nuova} cambia={setNuova} nuova segnaposto="Minimo 10 caratteri" />
          <Campo etichetta="Conferma nuova password" valore={conferma} cambia={setConferma} nuova />
          <Pressable
            style={({ pressed }) => [stili.tasto, pressed && stili.tastoPremuto, occupato && stili.tastoFermo]}
            onPress={() => void salva()}
            disabled={occupato}
            accessibilityRole="button"
            accessibilityState={{ busy: occupato, disabled: occupato }}>
            {occupato ? <ActivityIndicator color="#fff" /> : <Text style={stili.tastoTesto}>Salva password</Text>}
          </Pressable>
          <Messaggio m={msgPwd} />
        </View>
      </View>
    </Scheda>
  );
}

const stili = StyleSheet.create({
  testaTesto: { flex: 1 },
  modulo: { maxWidth: 380 },
  secondo: { marginTop: 28 },
  titoloModulo: { fontFamily: fonts.titolo, fontSize: 16, color: al.testo, marginBottom: 14 },
  casella: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  casellaTesto: { flex: 1, fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: al.testo },
  etichetta: { fontFamily: fonts.corpoMedio, fontSize: 13, color: al.testo, marginBottom: 6 },
  campo: {
    borderWidth: 2,
    borderColor: al.bordo,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.corpo,
    fontSize: 16,
    color: al.testo,
    marginBottom: 14,
  },
  campoFuoco: { borderColor: al.blu },
  tasto: { minHeight: 46, borderRadius: 7, backgroundColor: al.bluScuro, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 4 },
  tastoPremuto: { backgroundColor: '#005FB8' },
  tastoFermo: { opacity: 0.7 },
  tastoTesto: { fontFamily: fonts.corpoMedio, fontSize: 15, color: '#fff' },
  msg: { fontFamily: fonts.corpo, fontSize: 13, marginTop: 10 },
  msgOk: { color: '#059669' },
  msgErr: { color: '#B91C1C' },
});
