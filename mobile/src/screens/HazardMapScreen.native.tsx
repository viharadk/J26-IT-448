import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkRasterTiles, getHazardTiles, HazardTiles, INITIAL_REGION, inspectionLabel, LEGEND } from '../api/flood';
import { colors } from '../theme';
import { useFunction1 } from '../function1/Function1Provider';
import { LocationSearch } from '../components/LocationSearch';
import { SearchLocation } from '../search/locationSearch';

export function HazardMapScreen() {
  const router = useRouter();
  const map = useRef<MapView>(null);
  const { state, store } = useFunction1();
  const { point, inspection, loading: inspectLoading, version: selectionVersion } = state;
  const selectedName = point?.name;
  const [basemap, setBasemap] = useState<'standard' | 'satellite'>('standard');
  const [tiles, setTiles] = useState<HazardTiles | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tileLoading, setTileLoading] = useState(true);
  const [tileError, setTileError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setTileLoading(true); setTileError(''); setTiles(null);
    getHazardTiles(controller.signal).then(async result => {
      if (!controller.signal.aborted) {
        setTiles(result);
        await checkRasterTiles(result, controller.signal);
      }
    }).catch(error => {
      if (!controller.signal.aborted) setTileError(error instanceof Error ? error.message : 'Could not generate raster tiles.');
    }).finally(() => { if (!controller.signal.aborted) setTileLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  function select(coordinate: SearchLocation, center = false) {
    Keyboard.dismiss(); void store.select(coordinate);
    if (center) map.current?.animateToRegion({ latitude: coordinate.latitude, longitude: coordinate.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 650);
  }
  function resetSelection() { store.reset(); map.current?.animateToRegion(INITIAL_REGION); }

  return <SafeAreaView style={s.screen} edges={['left', 'right', 'bottom']}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <ScrollView horizontal accessibilityLabel="Map display controls" showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolbar}>
      {(['standard', 'satellite'] as const).map(type => <Pressable key={type} accessibilityRole="button" accessibilityLabel={`${type === 'standard' ? 'Standard' : 'Satellite'} map`} accessibilityState={{ selected: basemap === type }} onPress={() => setBasemap(type)} style={[s.button, basemap === type && s.active]}><Text style={s.text}>{type === 'standard' ? 'Standard' : 'Satellite'}</Text></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel="Recenter map on the study area" onPress={() => map.current?.animateToRegion(INITIAL_REGION)} style={s.button}><Text style={s.text}>Recenter</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh hazard and water layers" accessibilityState={{ disabled: tileLoading }} disabled={tileLoading} onPress={() => setAttempt(value => value + 1)} style={[s.button, tileLoading && s.disabled]}><Text style={s.text}>Refresh layers</Text></Pressable>
    </ScrollView>
    <LocationSearch onSelect={location => { void select(location, true); }} onReset={resetSelection} selectionVersion={selectionVersion} />
    <View style={s.mapArea}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={INITIAL_REGION} mapType={basemap}
        onMapReady={() => setMapReady(true)} onPress={event => { void select(event.nativeEvent.coordinate); }}
        loadingEnabled showsCompass showsScale toolbarEnabled={false}>
        {tiles && <UrlTile key={`hazard-${attempt}`} urlTemplate={tiles.tileUrl} tileSize={256} flipY={false} opacity={0.78} zIndex={1} maximumZ={21} />}
        {tiles && <UrlTile key={`water-${attempt}`} urlTemplate={tiles.permanentWaterTileUrl} tileSize={256} flipY={false} opacity={0.88} zIndex={2} maximumZ={21} />}
        {point && <Marker coordinate={point} title={selectedName || 'Selected location'} description={inspection ? inspectionLabel(inspection) : inspectLoading ? 'Inspecting location' : 'Inspection unavailable'}
          onPress={event => { event.stopPropagation(); router.push('/gis-flood/location-analysis'); }} pinColor={inspection?.isPermanentWater === true ? '#2166AC' : LEGEND.find(([label]) => label === (inspection?.landHazardClass ?? inspection?.hazardClass))?.[1] ?? '#8338EC'} zIndex={10} />}
      </MapView>
      {!mapReady && <View pointerEvents="none" style={s.mapStatus}><ActivityIndicator /><Text style={s.text}>Opening native map…</Text></View>}
    </View>
    <View style={s.content}>
      {tileLoading && <View style={s.row}><ActivityIndicator color={colors.accent} /><Text style={s.text}>Generating hazard and water layers...</Text></View>}
      {!!tileError && <Text accessibilityRole="alert" style={s.error}>{tileError}</Text>}
      <ScrollView horizontal accessibilityLabel="Hazard legend" showsHorizontalScrollIndicator={false} contentContainerStyle={s.legend}>{LEGEND.map(([label, color]) => <View key={label} style={s.row}><View style={[s.swatch, { backgroundColor: color }]} /><Text style={s.text}>{label}</Text></View>)}</ScrollView>
      <Text accessibilityLiveRegion="polite" numberOfLines={2} style={s.selection}>{point ? [selectedName || 'Selected point', point.latitude.toFixed(5), point.longitude.toFixed(5)].join('  ·  ') : 'Search or tap the map to select a location.'}</Text>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open location analysis" onPress={() => { Keyboard.dismiss(); router.push('/gis-flood/location-analysis'); }} style={[s.button, s.action]}><Text style={s.text}>Location analysis</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open whole-study-area population exposure" onPress={() => { Keyboard.dismiss(); router.push('/gis-flood/population-exposure'); }} style={[s.button, s.action]}><Text style={s.text}>Population exposure</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open hazard summary" onPress={() => { Keyboard.dismiss(); router.push('/gis-flood/hazard-summary'); }} style={[s.button, s.action]}><Text style={s.text}>Hazard summary</Text></Pressable>
      </View>
      <Text numberOfLines={2} style={s.note}>Preliminary susceptibility, not a flood warning. AHP: Earth Engine; permanent water: ESA WorldCover 2021.</Text>
    </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  button: { padding: 10, minHeight: 44, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  active: { borderColor: colors.accent, backgroundColor: colors.accentDark },
  disabled: { opacity: 0.5 },
  text: { color: colors.text, fontSize: 13, flexShrink: 1 },
  mapArea: { flex: 1, minHeight: 120 },
  mapStatus: { alignSelf: 'center', marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: colors.surface, flexDirection: 'row', gap: 8 },
  content: { paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  actions: { flexDirection: 'row', gap: 8 }, action: { flex: 1, paddingHorizontal: 7, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legend: { flexDirection: 'row', gap: 12, paddingRight: 8 },
  swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: '#FFFFFF88' },
  selection: { color: colors.text, fontSize: 13, fontWeight: '600' },
  error: { color: colors.error }, note: { color: colors.muted, fontSize: 11, lineHeight: 15 },
});
