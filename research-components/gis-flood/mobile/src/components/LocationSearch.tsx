import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchPlaces } from '../api/geocoding';
import { createLatestRequest, normalizeQuery, parseCoordinates, Place, SearchLocation } from '../search/locationSearch';
import { colors } from '../theme';

interface Props { onSelect: (location: SearchLocation) => void; onReset: () => void; selectionVersion: number }

export function LocationSearch({ onSelect, onReset, selectionVersion }: Props) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'place' | 'coordinates'>('place');
  const [query, setQuery] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requests = useRef(createLatestRequest()).current;
  const submitting = useRef(false);
  const choosing = useRef(false);

  function cancel() { requests.cancel(); submitting.current = false; setLoading(false); }
  useEffect(() => {
    // A map tap or reset invalidates searches without selecting a stale result.
    requests.cancel(); submitting.current = false; setLoading(false); setPlaces([]);
  }, [selectionVersion, requests]);
  useEffect(() => () => requests.cancel(), [requests]);

  function clear() {
    choosing.current = false;
    cancel(); setQuery(''); setLatitude(''); setLongitude(''); setPlaces([]); setError(''); Keyboard.dismiss();
  }
  function choose(location: SearchLocation) {
    if (choosing.current) return;
    choosing.current = true;
    cancel(); setPlaces([]); setError(''); Keyboard.dismiss(); setOpen(false);
    setLatitude(String(location.latitude)); setLongitude(String(location.longitude));
    setQuery(location.name || '');
    onSelect(location);
  }
  async function submitPlace() {
    // Synchronous lock covers a double tap or keyboard/button submission together.
    if (submitting.current) return;
    let normalized: string;
    try { normalized = normalizeQuery(query); }
    catch (cause) { setError((cause as Error).message); return; }
    const ticket = requests.start();
    submitting.current = true; setLoading(true); setError(''); setPlaces([]); Keyboard.dismiss();
    try {
      const results = await searchPlaces(normalized, ticket.signal);
      if (!ticket.isCurrent()) return;
      setPlaces(results);
      if (!results.length) setError('No matching locations in Sri Lanka. Try another name or coordinates.');
    } catch (cause) {
      if (ticket.isCurrent()) setError(cause instanceof Error ? cause.message : 'Place search failed. Try again.');
    } finally {
      if (ticket.isCurrent()) { submitting.current = false; setLoading(false); }
    }
  }
  function submitCoordinates() {
    try { choose(parseCoordinates(latitude, longitude)); }
    catch (cause) { setError((cause as Error).message); }
  }
  function switchMethod(next: typeof method) {
    cancel(); setMethod(next); setError(''); setPlaces([]); Keyboard.dismiss();
  }
  function editQuery(value: string) { cancel(); setQuery(value); setPlaces([]); setError(''); }

  return <View style={[s.panel, open && s.panelOpen]}>
    <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Collapse location search' : 'Expand location search'}
      accessibilityHint="Search by a Sri Lankan place name or decimal coordinates"
      accessibilityState={{ expanded: open }} onPress={() => {
      if (open) { cancel(); Keyboard.dismiss(); }
      else choosing.current = false;
      setOpen(value => !value);
    }} style={[s.button, s.toggle]}>
      <View style={s.toggleCopy}><Text style={s.toggleTitle}>{open ? 'Location search' : 'Search location'}</Text>
        <Text style={s.toggleHint}>{open ? 'Place name or coordinates' : 'Tap to enter a place or coordinates'}</Text></View>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.chevron}>{open ? '−' : '+'}</Text>
    </Pressable>
    {open && <ScrollView accessibilityLabel="Location search options" style={s.scroll} contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled showsVerticalScrollIndicator>
      <View style={s.row}>
        {(['place', 'coordinates'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: method === value }} onPress={() => switchMethod(value)} style={[s.button, method === value && s.selected]}>
          <Text style={s.buttonText}>{value === 'place' ? 'Location name' : 'Latitude / longitude'}</Text>
        </Pressable>)}
      </View>
      {method === 'place' ? <>
        <Text style={s.label}>Location name (Sri Lanka)</Text>
        <TextInput accessibilityLabel="Location name in Sri Lanka" style={s.input} placeholder="Kelaniya, Kaduwela, Colombo…" placeholderTextColor={colors.muted}
          value={query} onChangeText={editQuery} maxLength={160} returnKeyType="search" onSubmitEditing={() => { void submitPlace(); }} />
        <Pressable accessibilityRole="button" accessibilityLabel={loading ? 'Searching places' : 'Search places'} accessibilityState={{ disabled: loading }} disabled={loading} style={[s.button, loading && s.disabled]} onPress={() => { void submitPlace(); }}>
          <Text style={s.buttonText}>{loading ? 'Searching…' : 'Search places'}</Text>
        </Pressable>
        {loading && <View accessibilityLiveRegion="polite" style={s.row}><ActivityIndicator color={colors.accent} /><Text style={s.label}>Searching places…</Text></View>}
        {places.length > 0 && <Text accessibilityLiveRegion="polite" style={s.label}>Choose a matching location ({places.length})</Text>}
        {places.map((place, index) => <Pressable key={`${place.id}-${index}`} accessibilityRole="button" accessibilityLabel={`Select ${place.name}`} onPress={() => choose(place)} style={s.button}>
          <Text style={s.text}>{place.name}</Text><Text style={s.label}>{place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}</Text>
        </Pressable>)}
        <Text style={s.label}>Place names are sent to OpenStreetMap Nominatim only when you submit.</Text>
      </> : <>
        <Text style={s.label}>Latitude (−90 to 90)</Text>
        <TextInput accessibilityLabel="Latitude in decimal degrees" style={s.input} placeholder="6.9553" placeholderTextColor={colors.muted} value={latitude}
          onChangeText={value => { setLatitude(value); setError(''); }} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'} autoCorrect={false} />
        <Text style={s.label}>Longitude (−180 to 180)</Text>
        <TextInput accessibilityLabel="Longitude in decimal degrees" style={s.input} placeholder="79.9217" placeholderTextColor={colors.muted} value={longitude}
          onChangeText={value => { setLongitude(value); setError(''); }} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'} autoCorrect={false} returnKeyType="go" onSubmitEditing={submitCoordinates} />
        <Pressable accessibilityRole="button" onPress={submitCoordinates} style={s.button}><Text style={s.buttonText}>Go to coordinates</Text></Pressable>
        <Text style={s.label}>Decimal degrees. Points outside the study area may have no analysis data.</Text>
      </>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <View style={s.row}>
        <Pressable accessibilityRole="button" onPress={clear} style={s.button}><Text style={s.buttonText}>Clear search</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { clear(); setOpen(false); onReset(); }} style={s.button}><Text style={s.buttonText}>Reset selection / map</Text></Pressable>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel="Open OpenStreetMap search data attribution" onPress={() => { void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => setError('Attribution: https://www.openstreetmap.org/copyright')); }}>
        <Text style={s.link}>Search data © OpenStreetMap contributors (ODbL)</Text>
      </Pressable>
    </ScrollView>}
  </View>;
}

const s = StyleSheet.create({
  panel: { flexShrink: 1, paddingHorizontal: 10, paddingBottom: 6 },
  panelOpen: { maxHeight: '44%' },
  scroll: { flexGrow: 0, flexShrink: 1, marginTop: 8 }, content: { gap: 10, paddingBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  button: { minHeight: 44, padding: 10, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, maxWidth: '100%' },
  toggle: { minHeight: 48, paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  toggleCopy: { flex: 1, minWidth: 0 }, toggleTitle: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  toggleHint: { color: colors.muted, fontSize: 11, marginTop: 1 }, chevron: { color: colors.accent, fontSize: 24, lineHeight: 26, marginLeft: 10 },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentDark }, disabled: { opacity: 0.5 },
  input: { minHeight: 46, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
  buttonText: { color: colors.accent, fontWeight: '600', flexShrink: 1 },
  text: { color: colors.text, fontSize: 14 }, label: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  link: { color: colors.accent, fontSize: 12, lineHeight: 18, textDecorationLine: 'underline' }, error: { color: colors.error, fontSize: 14 },
});
