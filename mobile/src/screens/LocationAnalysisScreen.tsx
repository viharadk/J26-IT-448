import { useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFunction1 } from '../function1/Function1Provider';
import { LocationAnalysisPanel } from '../components/LocationAnalysisPanel';
import { Action, Card, styles } from '../components/ui';
export function LocationAnalysisScreen() {
  const router = useRouter();
  const { state, store } = useFunction1();
  const scroll = useRef<ScrollView>(null);
  const panelTop = useRef(0);
  return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}><ScrollView ref={scroll} contentContainerStyle={styles.page}>
    <Text style={styles.eyebrow}>FUNCTION 01 · LOCATION ANALYSIS</Text>
    {state.point ? <View onLayout={event => { panelTop.current = event.nativeEvent.layout.y; }}><LocationAnalysisPanel point={state.point} locationName={state.point.name} inspection={state.inspection}
      loading={state.loading} error={state.error} onRetry={() => { void store.retry(); }} onClose={() => router.back()}
      onScrollToFactors={offset => scroll.current?.scrollTo({ y: panelTop.current + offset, animated: true })} /></View>
      : <Card><Text style={styles.heading}>No location selected</Text><Text style={styles.body}>Choose a place, coordinates or a point on the Flood Hazard Map before requesting location analysis.</Text>
        <Action label="Choose location on map" onPress={() => router.dismissTo('/gis-flood/hazard-map')} /></Card>}
    <Text style={styles.body}>Location results describe relative flood susceptibility, not observed historical inundation or a current flood warning.</Text>
    <Action label="Population exposure · whole study area" onPress={() => router.push('/gis-flood/population-exposure')} />
    <Action label="Study-area hazard summary" onPress={() => router.push('/gis-flood/hazard-summary')} />
  </ScrollView></SafeAreaView>;
}
