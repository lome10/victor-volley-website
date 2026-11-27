import { Barlow_600SemiBold, Barlow_700Bold, Barlow_800ExtraBold, useFonts } from '@expo-google-fonts/barlow';
import { Manrope_400Regular, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BarraAlta } from '~/components/BarraAlta';
import { MenuLaterale } from '~/components/MenuLaterale';
import { creaClient, seguiPrimoPiano } from '~/lib/dati';
import { colors } from '~/lib/theme';

export default function RootLayout() {
  const [client] = useState(creaClient);
  useEffect(seguiPrimoPiano, []);
  const [menuAperto, setMenuAperto] = useState(false);
  const [pronti, errore] = useFonts({ Barlow_600SemiBold, Barlow_700Bold, Barlow_800ExtraBold, Manrope_400Regular, Manrope_700Bold });
  // Se i font non si caricano si va avanti con quelli di sistema.
  if (!pronti && !errore) return <View style={{ flex: 1, backgroundColor: colors.notte }} />;
  return (
    <QueryClientProvider client={client}>
    <View style={{ flex: 1, backgroundColor: colors.notte }}>
      <StatusBar style="light" />
      <BarraAlta apriMenu={() => setMenuAperto(true)} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.notte } }} />
      <MenuLaterale aperto={menuAperto} chiudi={() => setMenuAperto(false)} />
    </View>
    </QueryClientProvider>
  );
}
