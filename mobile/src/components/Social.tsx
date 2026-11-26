import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { social } from '~/lib/social';
import { colors } from '~/lib/theme';

export function Social() {
  return (
    <View style={styles.riga}>
      {social.map(({ nome, url, svg }) => (
        <Pressable key={nome} style={styles.tondo} onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={nome}>
          <SvgXml xml={svg} width={20} height={20} color={colors.bianco} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  riga: { flexDirection: 'row', gap: 8 },
  tondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
});
