import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Action, Card, Screen, styles } from '../components/ui';

export function HazardMapScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.eyebrow}>FUNCTION 01 · FLOOD HAZARD MAP</Text>
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>Native GIS map</Text>
        <Text style={styles.body}>
          The interactive Earth Engine tile map is available in the Android and iOS app.
          The web build keeps the research summaries available without loading a native map module.
        </Text>
      </Card>
      <Action label="Study-area hazard summary" onPress={() => router.push('/gis-flood/hazard-summary')} />
      <Action label="Population exposure" onPress={() => router.push('/gis-flood/population-exposure')} />
    </Screen>
  );
}
