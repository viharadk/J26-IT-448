import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { POPULATION_CLASSES } from '../api/population';
import { PopulationState, formatPopulationCount, formatPopulationPercent, populationAvailability } from '../population/exposure';
import { colors } from '../theme';
import { Action, Card, styles } from './ui';

export function PopulationExposureView({ state, onRetry }: { state: PopulationState; onRetry: () => void }) {
  const data = state.data, availability = data ? populationAvailability(data) : null;
  return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text accessibilityRole="header" style={styles.heading}>Population exposure</Text>
        <Text style={styles.body}>Whole Function 1 Lower Kelani study AOI (HydroBASINS). These estimates are not specific to your searched coordinate or selected point.</Text>
        <Text style={s.warning}>Estimated population within AHP susceptibility categories — not currently flooded, evacuated or confirmed affected people. Susceptibility is distinct from historical SAR observations; independent flood validation remains pending.</Text>
        {state.status === 'loading' && <View accessibilityLiveRegion="polite" style={s.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.body}>Loading backend population estimates… This may take several minutes.</Text></View>}
        {!!state.error && <Text accessibilityRole="alert" style={s.error}>{state.error}{data ? ' Previously loaded estimates are retained.' : ' No population estimate has been substituted.'}</Text>}
        {availability === 'empty' && <Text style={s.warning}>No population exposure estimates were returned. Missing values are unavailable, not zero.</Text>}
        {availability === 'zero' && <Text style={s.warning}>The backend returned zero estimated study-area population. Percentages with a zero denominator are not estimable. This does not establish complete population observation coverage.</Text>}
        {data && <>
          <Card><Text accessibilityRole="header" style={styles.heading}>Study-area estimates</Text>
            {([
              ['Study-area population (whole AOI)', data.studyAreaPopulation],
              ['Population allocated to classified land', data.classifiedLandPopulation],
              ['Population in High + Very High susceptibility', data.highAndVeryHighExposure],
              ['Unallocated population', data.unallocatedPopulation],
            ] as const).map(([label, value]) => <Text key={label} style={s.value}>{label}: {formatPopulationCount(value)} estimated people</Text>)}
            <Text style={s.value}>High + Very High / study-area population: {formatPopulationPercent(data.highAndVeryHighPercentage, data.studyAreaPopulation)}</Text>
            <Text style={styles.body}>Unallocated population is not assigned to a land susceptibility class; it is not confirmed safe or unexposed.</Text>
          </Card>
          <Text accessibilityRole="header" style={styles.heading}>Population by susceptibility class</Text>
          <Text style={styles.body}>Each percentage below uses the stated population denominator, not geographic area. Counts are estimates rounded only for display; fractional counts reflect area-weighted allocation.</Text>
          {POPULATION_CLASSES.map((label, index) => {
            const row = data.populationByHazardClass.find(c => c.classId === index + 1);
            return <Card key={label}><Text accessibilityRole="header" style={styles.heading}>{label}</Text>
              <Text style={s.value}>{formatPopulationCount(row?.population)} estimated people</Text>
              <Text style={styles.body}>Of study-area population: {formatPopulationPercent(row?.percentageOfStudyAreaPopulation, data.studyAreaPopulation)}</Text>
              <Text style={styles.body}>Of classified-land population: {formatPopulationPercent(row?.percentageOfClassifiedLandPopulation, data.classifiedLandPopulation)}</Text>
              {!row && <Text style={s.warning}>This class was not returned by the backend.</Text>}
            </Card>;
          })}
          <Card><Text accessibilityRole="header" style={styles.heading}>Source & coverage</Text>
            <Text selectable style={styles.body}>Dataset: {data.dataset || 'Unavailable'}</Text>
            <Text style={styles.body}>Reference year: {data.year ?? 'Unavailable'} · Source resolution: {data.nativeResolutionMeters ?? 'Unavailable'} m</Text>
            <Text style={styles.body}>The API does not supply AOI area, an observed-population coverage percentage, uncertainty intervals or a separate missing-population count. The backend fills masked source population cells with zero; a returned zero does not prove complete observations.</Text>
          </Card>
          <Card><Text accessibilityRole="header" style={styles.heading}>Backend methodology & limitations</Text>
            {Object.entries(data.methodology).map(([key, value]) => <Text key={key} style={styles.body}>{value}</Text>)}
            {!Object.keys(data.methodology).length && <Text style={styles.body}>Methodology details were not returned.</Text>}
            {data.limitations.map((value, index) => <Text key={index} style={styles.body}>{value}</Text>)}
            {!data.limitations.length && <Text style={styles.body}>Additional backend limitations were not returned. These remain preliminary susceptibility-based estimates, not verified flooding.</Text>}
          </Card>
        </>}
        <Action label={state.status === 'loading' ? 'Loading exposure…' : state.status === 'error' || availability === 'empty' ? 'Retry population exposure' : data ? 'Refresh population estimates' : 'Load population exposure'} disabled={state.status === 'loading'} onPress={onRetry} />
      </ScrollView>
    </SafeAreaView>;
}
const s = StyleSheet.create({
  value: { color: colors.text, fontSize: 15, lineHeight: 23 }, warning: { color: colors.warning, fontSize: 13, lineHeight: 20 },
  error: { color: colors.error, fontSize: 14, lineHeight: 21 }, loading: { gap: 10 },
});
