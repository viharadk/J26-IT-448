import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { RESEARCH_DATES, SarDates } from '../../api/sar';
import { colors } from '../../theme';
import { useSarWorkflow } from '../SarWorkflowProvider';
import { routePrerequisite } from '../workflow';
import { Choice, Content, Loading, Note, StepActions, StepFrame, ui } from '../components';

export function DiscoverImagesScreen() {
  const router = useRouter();
  const { state, store } = useSarWorkflow();
  const busy = !!state.busy, found = !!state.discovery;
  const selectionReason = routePrerequisite('SelectImagePair', state);
  const empty = found && !!selectionReason;
  const fields: [keyof SarDates, string][] = [['beforeStart', 'Before start'], ['beforeEnd', 'Before end'], ['floodStart', 'Later start'], ['floodEnd', 'Later end']];
  const earlier = { beforeStart: '2016-04-01', beforeEnd: '2016-05-15', floodStart: '2016-05-15', floodEnd: '2016-06-01' };
  return <StepFrame step="DiscoverImages" footer={<StepActions back={() => router.back()} label={state.busy === 'discovery' ? 'Finding real scenes…' : found ? 'Next: Select image pair' : 'Find real Sentinel-1 scenes'}
    disabled={busy || (found && empty)} next={() => found ? router.push('/gis-flood/sar/select-image-pair') : void store.discover()}
    reason={found ? selectionReason : null}
    secondary={found ? <Text accessibilityRole="button" onPress={() => { if (!busy) void store.discover(); }} style={ui.linkText}>Find scenes again</Text> : undefined} />}>
    <Content>
      <Text style={ui.heading}>Choose observation windows</Text>
      <Note>Experimental research. No validated flood extent or accuracy. Observation windows do not establish flood conditions.</Note>
      <View style={ui.row}>
        <View style={ui.flex}><Choice label="May 2017" selected={JSON.stringify(state.dates) === JSON.stringify(RESEARCH_DATES)} disabled={busy} onPress={() => store.setDates({ ...RESEARCH_DATES })} /></View>
        <View style={ui.flex}><Choice label="May 2016" selected={JSON.stringify(state.dates) === JSON.stringify(earlier)} disabled={busy} onPress={() => store.setDates(earlier)} /></View>
      </View>
      <Text style={ui.body}>Presets can be edited for any supported year. Dates are UTC; end dates are exclusive. Each window: 1–93 days; combined span: at most 366 days.</Text>
      {[0, 2].map(offset => <View key={offset} style={ui.row}>{fields.slice(offset, offset + 2).map(([key, label]) => <View key={key} style={ui.flex}>
        <Text style={ui.text}>{label}{key.endsWith('End') ? ' (exclusive)' : ''}</Text>
        <TextInput accessibilityLabel={label} editable={!busy} value={state.dates[key]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} maxLength={10} style={ui.input} onChangeText={value => store.setDates({ ...state.dates, [key]: value })} />
      </View>)}</View>)}
      {state.busy === 'discovery' && <Loading text="Querying real scenes and pair footprints. This may take several minutes." seconds={Math.floor((state.now - state.startedAt!) / 1000)} />}
      {!!state.errors.discovery && <Note error>{state.errors.discovery}</Note>}
      {state.discovery && <View style={ui.panel}>
        <Text accessibilityLiveRegion="polite" style={ui.heading}>Discovery complete</Text>
        <Text style={ui.text}>Before: {state.discovery.periods.before.totalCount} scenes · Later: {state.discovery.periods.flood.totalCount} scenes</Text>
        {(state.discovery.periods.before.truncated || state.discovery.periods.flood.truncated || state.pairs?.summary.incomplete) && <Note>Bounded discovery is incomplete. Narrow the windows before interpreting missing pairs.</Note>}
        {empty && <Note>No observations in one window. No scenes have been substituted.</Note>}
        <Text style={ui.body}>Next, compare metadata and select a compatible before/later pair.</Text>
      </View>}
    </Content>
  </StepFrame>;
}
