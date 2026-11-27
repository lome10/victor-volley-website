// Schermata di accesso dell'area atleti (#loginScreen di atleta.html): email, password, "Password dimenticata?".
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { al } from '~/components/atleti/Pezzi';
import { RESET_INVIATO, richiediReset } from '~/lib/accesso';
import { accedi } from '~/lib/firebase';
import { fonts } from '~/lib/theme';

/** `titolo`: "Area Atleti" (atleta.html) o "Area Dirigenti" (login di /admin, da cui entrano anche gli allenatori). */
export function Accesso({ titolo = 'Area Atleti' }: { titolo?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [ok, setOk] = useState('');
  const [occupato, setOccupato] = useState(false);
  const [fuoco, setFuoco] = useState<'email' | 'password' | null>(null);

  const entra = async () => {
    if (occupato) return;
    setErrore('');
    setOk('');
    if (!email.trim() || !password) {
      setErrore('Email o password non corretti.');
      return;
    }
    setOccupato(true);
    const riuscito = await accedi(email.trim(), password);
    setOccupato(false);
    // Se riesce, la pagina passa da sola al cruscotto (seguiUtente).
    if (!riuscito) setErrore('Email o password non corretti.');
  };

  const dimenticata = async () => {
    if (occupato) return;
    setErrore('');
    setOk('');
    setOccupato(true);
    const e = await richiediReset(email.trim());
    setOccupato(false);
    if (e) setErrore(e);
    else setOk(RESET_INVIATO);
  };

  return (
    <LinearGradient colors={al.notte} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={stili.schermo}>
      <KeyboardAvoidingView style={stili.schermo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={stili.centro} keyboardShouldPersistTaps="handled">
          <View style={stili.riquadro}>
            <Image source={require('../../../assets/images/logo.png')} style={stili.logo} resizeMode="contain" accessibilityLabel="Victor Volley" />
            <Text style={stili.titolo} accessibilityRole="header">
              {titolo}
            </Text>
            <Text style={stili.sotto}>Victor Volley</Text>
            <TextInput
              style={[stili.campo, fuoco === 'email' && stili.campoFuoco]}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              accessibilityLabel="Email"
              onFocus={() => setFuoco('email')}
              onBlur={() => setFuoco(null)}
            />
            <TextInput
              style={[stili.campo, fuoco === 'password' && stili.campoFuoco]}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel="Password"
              returnKeyType="go"
              onSubmitEditing={() => void entra()}
              onFocus={() => setFuoco('password')}
              onBlur={() => setFuoco(null)}
            />
            <Pressable
              style={({ pressed }) => [stili.tasto, pressed && stili.tastoPremuto]}
              onPress={() => void entra()}
              accessibilityRole="button"
              accessibilityState={{ busy: occupato }}>
              {occupato ? <ActivityIndicator color="#fff" /> : <Text style={stili.tastoTesto}>Accedi</Text>}
            </Pressable>
            <Pressable style={stili.dimenticata} onPress={() => void dimenticata()} accessibilityRole="button">
              <Text style={stili.dimenticataTesto}>Password dimenticata?</Text>
            </Pressable>
            {errore ? (
              <Text style={stili.errore} accessibilityLiveRegion="polite">
                {errore}
              </Text>
            ) : null}
            {ok ? (
              <Text style={stili.ok} accessibilityLiveRegion="polite">
                {ok}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const stili = StyleSheet.create({
  schermo: { flex: 1 },
  centro: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  riquadro: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: al.scheda,
    borderRadius: 14,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  logo: { width: 72, height: 72, alignSelf: 'center', marginBottom: 16 },
  titolo: { fontFamily: fonts.titolo, fontSize: 22, color: al.testo, textAlign: 'center', marginBottom: 4 },
  sotto: { fontFamily: fonts.corpo, fontSize: 13, color: al.spento, textAlign: 'center', marginBottom: 28 },
  campo: {
    borderWidth: 2,
    borderColor: al.bordo,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.corpo,
    fontSize: 16,
    color: al.testo,
    marginBottom: 12,
  },
  campoFuoco: { borderColor: al.blu },
  tasto: { minHeight: 46, borderRadius: 7, backgroundColor: al.bluScuro, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  tastoPremuto: { backgroundColor: '#005FB8' },
  tastoTesto: { fontFamily: fonts.corpoMedio, fontSize: 15, color: '#fff' },
  dimenticata: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  dimenticataTesto: { fontFamily: fonts.corpo, fontSize: 13, color: al.blu, textAlign: 'center' },
  errore: { fontFamily: fonts.corpo, fontSize: 13, color: al.rosso, marginTop: 8, textAlign: 'center' },
  ok: { fontFamily: fonts.corpo, fontSize: 13, color: '#059669', marginTop: 10, textAlign: 'center' },
});
