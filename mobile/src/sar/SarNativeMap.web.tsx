import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SarLayer } from '../api/sar';
import { colors } from '../theme';
import { MapRegion } from './workflow';

type Props = {
  layer?: SarLayer;
  region: MapRegion | null;
  center?: [number, number];
  onRegion: (region: MapRegion) => void;
  sessionKey: string;
  candidate?: boolean;
  sample?: [number, number];
  legend?: ReactNode;
};

export default function SarNativeMap({ layer, legend }: Props) {
  return (
    <View style={styles.fallback}>
      <Text accessibilityRole="header" style={styles.title}>Native SAR map</Text>
      <Text style={styles.body}>
        Live Earth Engine raster tiles are displayed in the Android and iOS app.
        {layer ? ' The selected layer metadata remains available below.' : ''}
      </Text>
      {legend}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, minHeight: 180, marginHorizontal: 12, padding: 18, gap: 12, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
