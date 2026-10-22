import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Inspection, inspectionLabel } from '../api/flood';
import { analysisState, factorRows, formatBoolean, formatValue, formatWeight, largestContributor } from '../analysis/locationAnalysis';
import { colors } from '../theme';

interface Props {
  point: { latitude: number; longitude: number };
  locationName?: string;
  inspection: Inspection | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
  onScrollToFactors: (offset: number) => void;
}
function Field({ label, value }: { label: string; value: string }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><Text selectable style={s.value}>{value}</Text></View>;
}
export function LocationAnalysisPanel({ point, locationName, inspection, loading, error, onClose, onRetry, onScrollToFactors }: Props) {
  const [factorOffset, setFactorOffset] = useState<number | null>(null);
  const state = inspection ? analysisState(inspection) : null;
  const rows = inspection ? factorRows(inspection) : [];
  const comparison = inspection?.comparison;
  const ahp = inspection?.ahp;
  const largest = inspection ? rows.find(row => row.key === largestContributor(inspection)) : undefined;

  return <View style={s.panel}>
    <View style={s.header}>
      <Text accessibilityRole="header" style={s.title}>Selected Location Analysis</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close location analysis" onPress={onClose} style={s.button}><Text style={s.buttonText}>Close</Text></Pressable>
    </View>
    <Text style={s.note}>Preliminary Research Model — Not Validated</Text>
    <Text style={s.body}>{locationName || inspection?.locationName || 'Location name unavailable'}</Text>
    <View style={s.grid}>
      <Field label="Latitude" value={point.latitude.toFixed(6)} />
      <Field label="Longitude" value={point.longitude.toFixed(6)} />
    </View>
    {loading && <View accessibilityLiveRegion="polite" style={s.loading}><ActivityIndicator color={colors.accent} /><Text style={s.body}>Analyzing selected location…</Text></View>}
    {!!error && <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={s.button}><Text style={s.buttonText}>Retry inspection</Text></Pressable></>}
    {!loading && !error && inspection && <>
      <Text accessibilityLiveRegion="polite" style={s.result}>{inspectionLabel(inspection)}</Text>
      {state === 'water' && <Text style={s.body}>This location is classified as permanent water in ESA WorldCover 2021. Land flood-hazard assessment is not applicable here.</Text>}
      {state === 'no-data' && <Text style={s.body}>{inspection.message || 'No valid land-hazard data is available here. The point may be outside the study area or have missing raster data. Try another location.'}</Text>}
      {state === 'land' && <>
        <Pressable accessibilityRole="button" disabled={factorOffset === null} onPress={() => { if (factorOffset !== null) onScrollToFactors(factorOffset); }} style={s.button}>
          <Text style={s.buttonText}>View all 4 factor cards</Text>
        </Pressable>
        <Text style={s.note}>Swipe up inside this panel to see every factor, comparison and methodology.</Text>
        <Text accessibilityRole="header" style={s.heading}>Observed factor values</Text>
        <Text style={s.note}>GIS measurements sampled at 30 m scale</Text>
        <View style={s.grid}>{rows.map(row => <Field key={row.key} label={row.label} value={formatValue(row.value, row.unit)} />)}</View>

        <View style={s.factorSection} onLayout={event => setFactorOffset(event.nativeEvent.layout.y)}>
        <Text accessibilityRole="header" style={s.heading}>AHP factor contributions (4 factors)</Text>
        <Text style={s.note}>Backend weighted contributions; bars share a 0–5 index scale.</Text>
        {rows.map((row, index) => <View key={row.key} testID={`factor-card-${row.key}`} style={s.card}>
          <Text accessibilityRole="header" style={s.cardTitle}>{index + 1} / 4 · {row.label}</Text>
          <Field label="Raw value" value={formatValue(row.value, row.unit)} />
          <View style={s.grid}>
            <Field label="Reclassified score" value={formatValue(row.factor?.score)} />
            <Field label="AHP weight" value={formatWeight(row.factor?.weight)} />
          </View>
          <Field label="Weighted contribution" value={formatValue(row.factor?.contribution)} />
          <View testID={`factor-bar-${row.key}`} accessible accessibilityLabel={`${row.label} weighted contribution ${formatValue(row.factor?.contribution)}, on a 0 to 5 scale`} style={s.track}>
            <View style={[s.bar, { width: `${row.barWidth}%` }]} />
          </View>
        </View>)}
        </View>

        <Text accessibilityRole="header" style={s.heading}>AHP vs equal-weight baseline</Text>
        <View style={s.card}>
          <Field label="AHP hazard index" value={formatValue(comparison?.ahpIndex)} />
          <Field label="AHP hazard class" value={formatValue(comparison?.ahpHazardClass)} />
          <Field label="Equal-weight hazard index" value={formatValue(comparison?.equalWeightIndex)} />
          <Field label="Equal-weight hazard class" value={formatValue(comparison?.equalWeightHazardClass)} />
          <Field label="Index difference (AHP − equal weight)" value={formatValue(comparison?.difference)} />
          <Field label="Classification changed" value={formatBoolean(comparison?.classificationChanged)} />
        </View>

        <Text accessibilityRole="header" style={s.heading}>AHP methodology</Text>
        <View style={s.card}>
          <Text style={s.cardTitle}>Demonstration judgment framework</Text>
          {rows.map(row => <Field key={row.key} label={`${row.label} weight`} value={formatWeight(row.methodologyWeight)} />)}
          <Field label="Consistency Ratio (CR)" value={formatValue(ahp?.consistencyRatio)} />
          <Text style={s.body}>{ahp?.consistencyAcceptable === true ? 'Consistency check acceptable' : ahp?.consistencyAcceptable === false ? 'Consistency check requires review' : 'Consistency check unavailable'}</Text>
          <Text style={s.body}>CR measures consistency in the pairwise judgments, not model accuracy or predictive validity.</Text>
          <Text style={s.note}>The current weights are demonstration judgments and require research validation.</Text>
          {!!ahp?.researchStatus && <Text style={s.body}>{ahp.researchStatus}</Text>}
        </View>
        <Text accessibilityRole="header" style={s.heading}>Explainable hazard result</Text>
        <Text style={s.body}>{largest ? `${largest.label} has the largest weighted contribution to this location's relative hazard index.` : 'Factor contribution data is unavailable for this location.'}</Text>
        <Text style={s.note}>{inspection.interpretation || 'This relative hazard estimate is not a prediction of flood depth or timing.'}</Text>
      </>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  panel: { gap: 14, flexShrink: 0 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  factorSection: { gap: 14, flexShrink: 0 },
  title: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  cardTitle: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  field: { flexShrink: 0, minWidth: 130, maxWidth: '100%', gap: 4 },
  label: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  card: { flexShrink: 0, gap: 12, padding: 16, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  track: { flexShrink: 0, width: '100%', height: 12, borderRadius: 6, backgroundColor: colors.border, overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: colors.accent, borderRadius: 6 },
  button: { minHeight: 44, justifyContent: 'center', padding: 12, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.accent, fontWeight: '700' },
  loading: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  error: { color: colors.error, fontSize: 14 },
  result: { color: colors.accent, fontSize: 18, fontWeight: '700' },
});
