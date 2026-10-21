import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { Action, Card, Screen, styles } from '../components/ui';
import { areaLabel, getHazardSummary, HazardSummary, percentageLabel } from '../api/hazardSummary';
export function HazardSummaryScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'HazardSummary'>) {
  const [attempt, setAttempt] = useState(0), [data, setData] = useState<HazardSummary | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    getHazardSummary(controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load hazard summary.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <Screen>
    <Text style={styles.eyebrow}>FUNCTION 01 · STUDY-AREA SUMMARY</Text>
    <Card><Text style={styles.heading}>GIS-AHP susceptibility</Text>
      <Text style={styles.body}>The backend combines elevation, slope, distance to water and land cover using AHP weights. These categories describe relative flood susceptibility, not observed historical inundation.</Text>
      <Text style={styles.badge}>Preliminary research model · Not validated</Text>
      <Text style={styles.body}>Independent flood validation: DATA_NOT_READY. Phase 5C sensitivity experiments do not establish flood detection accuracy.</Text></Card>
    {loading && <Card><ActivityIndicator /><Text style={styles.body}>Loading actual study-area hazard statistics…</Text></Card>}
    {!!error && <Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
    <Action label={error ? 'Retry hazard summary' : 'Refresh hazard summary'} disabled={loading} onPress={() => setAttempt(value => value + 1)} />
    {data && <>
      <Card><Text style={styles.heading}>Study AOI coverage</Text>
        {Object.entries(data.areas).map(([label, area]) => <Text key={label} style={styles.body}>{label}: {areaLabel(area)}</Text>)}
        <Text style={styles.body}>Raster analysis scale: {data.scale === null ? 'Unavailable' : `${data.scale} m`}</Text>
        {data.reconciliation && <Text style={styles.body}>{data.reconciliation}</Text>}
      </Card>
      <Card><Text style={styles.heading}>Hazard classes · classified land</Text>
        <Text style={styles.body}>Percentage denominator returned by backend: {data.denominator ?? 'Unavailable; percentages cannot be verified'}</Text>
        {data.rows.every(row => row.area === null) && <Text style={styles.body}>No study-area class estimates were returned.</Text>}
        {data.rows.map(row => <Text key={row.label} style={styles.body}>{row.label}: {areaLabel(row.area)} · {percentageLabel(row.percentage)} of {data.denominator ?? 'unverified denominator'}</Text>)}
        <Text style={styles.body}>Permanent water and no-data areas are separate from classified land. Missing values are unavailable, never estimated on the phone.</Text>
      </Card>
      <Card><Text style={styles.heading}>Backend methodology and sources</Text>
        {[data.method, data.status, data.weightStatus, ...data.datasets, data.note].filter(Boolean).map((line, index) => <Text key={index} style={styles.body}>{line}</Text>)}
      </Card>
    </>}
    <Action label="Population exposure · whole study area" onPress={() => navigation.push('PopulationExposure')} />
    <Action label="Return to hazard map" onPress={() => navigation.popTo('Function1')} />
  </Screen>;
}
