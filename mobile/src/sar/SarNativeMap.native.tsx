import { ReactNode, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { UrlTile } from 'react-native-maps';

import { SarLayer } from '../api/sar';
import { colors } from '../theme';
import { MapRegion } from './workflow';

const INITIAL_REGION: MapRegion = {
  latitude: 6.9317,
  longitude: 80.0124,
  latitudeDelta: 0.29,
  longitudeDelta: 0.4,
};

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

export default function SarNativeMap({
  layer,
  region,
  center,
  onRegion,
  sessionKey,
  candidate = false,
  sample,
  legend,
}: Props) {
  const map = useRef<MapView>(null);
  const initial = {
    ...INITIAL_REGION,
    ...(center ? { longitude: center[0], latitude: center[1] } : {}),
  };

  return (
    <View style={styles.mapWrap}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={region || initial}
        onRegionChangeComplete={onRegion}
        loadingEnabled
        showsCompass
        showsScale
        toolbarEnabled={false}
      >
        {layer && (
          <UrlTile
            key={`${sessionKey}-${layer.tileUrl}`}
            urlTemplate={layer.tileUrl}
            tileSize={256}
            opacity={candidate ? 0.85 : 1}
            zIndex={2}
            maximumZ={18}
          />
        )}
      </MapView>
      <View style={styles.mapTools}>
        <Pressable accessibilityRole="button" onPress={() => map.current?.animateToRegion(initial)} style={styles.mapButton}>
          <Text style={styles.text}>Recenter</Text>
        </Pressable>
        {sample && (
          <Pressable
            accessibilityRole="button"
            onPress={() => map.current?.animateToRegion({ latitude: sample[1], longitude: sample[0], latitudeDelta: 0.015, longitudeDelta: 0.02 }, 650)}
            style={styles.mapButton}
          >
            <Text style={styles.text}>Raw sample</Text>
          </Pressable>
        )}
      </View>
      {!!legend && <View pointerEvents="none" style={styles.mapLegend}>{legend}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { flex: 1, minHeight: 180, marginHorizontal: 12, overflow: 'hidden', borderRadius: 14 },
  mapTools: { position: 'absolute', right: 8, top: 8, gap: 8 },
  mapLegend: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,21,37,0.92)' },
  mapButton: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
