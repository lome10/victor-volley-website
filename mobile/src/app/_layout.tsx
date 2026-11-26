import { Barlow_600SemiBold, Barlow_700Bold, useFonts } from '@expo-google-fonts/barlow';
import { Manrope_400Regular } from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';

import { BarraAlta } from '~/components/BarraAlta';
import { MenuLaterale } from '~/components/MenuLaterale';
import { colors } from '~/lib/theme';

export default function RootLayout() {
  const [menuAperto, setMenuAperto] = useState(false);
  const [pronti, errore] = useFonts({ Barlow_600SemiBold, Barlow_700Bold, Manrope_400Regular });
  // Se i font non si caricano si va avanti con quelli di sistema.
  if (!pronti && !errore) return <View style={{ flex: 1, backgroundColor: colors.notte }} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.notte }}>
      <StatusBar style="light" />
      <BarraAlta apriMenu={() => setMenuAperto(true)} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.notte } }} />
      <MenuLaterale aperto={menuAperto} chiudi={() => setMenuAperto(false)} />
    </View>
  );
}
