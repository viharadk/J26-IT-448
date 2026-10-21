import { useEffect } from 'react';
import { Keyboard, Switch, Text, TextInput, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SarReferenceMethod } from '../../api/sar';
import { useSarWorkflow } from '../SarWorkflowProvider';
import { resultsDestination, SarStackParamList, setupPrerequisite } from '../workflow';
import { Choice, Content, LABEL, Loading, Note, StepActions, StepFrame, ui } from '../components';

export function AnalysisSetupScreen({ navigation }: NativeStackScreenProps<SarStackParamList, 'AnalysisSetup'>) {
  const { state, store } = useSarWorkflow(), focused = useIsFocused();
  const prerequisite = setupPrerequisite(state), busy = !!state.busy;
  useEffect(() => {
    const destination = focused ? resultsDestination(state, 'AnalysisSetup') : null;
    if (destination) { store.acknowledgeResults(); navigation.navigate(destination); }
  }, [focused, state.resultsPending, state.analysis, store, navigation]);
  return <StepFrame step="AnalysisSetup" footer={<StepActions back={() => navigation.goBack()} next={() => { Keyboard.dismiss(); void store.runAnalysis(); }}
    label={state.busy === 'analysis' ? 'Running Analysis…' : state.analysis ? 'Re-run Analysis' : 'Run Analysis'} disabled={busy || !!prerequisite} reason={prerequisite}
    secondary={<>
      {state.busy === 'analysis' && <Loading text={state.phase === 'tiles' ? 'Areas received. Checking candidate tiles…' : 'Computing experimental areas. Earth Engine may take several minutes (5 minute request limit).'} seconds={Math.floor((state.now - state.startedAt!) / 1000)} />}
      {!!state.errors.analysis && <Note error>{state.errors.analysis}</Note>}
      {!!prerequisite && <Text accessibilityRole="button" style={ui.linkText} onPress={() => navigation.popTo('SarMap')}>Return to SAR Map to load / refresh layers</Text>}
      {!!state.analysis && !busy && <Text accessibilityRole="button" style={ui.linkText} onPress={() => navigation.navigate('AnalysisResults')}>View existing results</Text>}
    </>} />}>
    <Content>
      <Note>{LABEL}</Note>
      <Text style={ui.heading}>Historical water reference</Text>
      {(['yearly-conservative-v1', 'yearly-monthly-dry-v1'] as SarReferenceMethod[]).map(method => <Choice key={method} label={method === 'yearly-conservative-v1' ? 'Conservative annual (default)' : 'Historical monthly eligibility'} selected={state.referenceMethod === method} disabled={busy} onPress={() => store.setReference(method)} />)}
      <Note>Monthly fallback infers historical non-water eligibility, not verified event-date land. More support or candidates does not establish better accuracy.</Note>
      <View style={ui.panel}>
        <View style={ui.row}><Switch accessibilityLabel="Enable slope filtering" disabled={busy} value={state.filters.slopeEnabled} onValueChange={value => store.setFilters({ ...state.filters, slopeEnabled: value })} /><Text style={ui.heading}>Terrain slope filter</Text></View>
        <Text style={ui.body}>Maximum slope in degrees · 1–45 · default 5°</Text>
        <TextInput accessibilityLabel="Maximum slope degrees" editable={!busy && state.filters.slopeEnabled} keyboardType="decimal-pad" value={state.filters.maxSlopeDegrees} onChangeText={value => store.setFilters({ ...state.filters, maxSlopeDegrees: value })} style={ui.input} />
        <Text style={ui.caption}>SRTM 30 m terrain. Missing terrain is excluded separately, never classified dry. Slope is an exclusion heuristic, not proof of flooding or non-flooding.</Text>
      </View>
      <View style={ui.panel}>
        <View style={ui.row}><Switch accessibilityLabel="Enable connected-component filtering" disabled={busy} value={state.filters.clusterEnabled} onValueChange={value => store.setFilters({ ...state.filters, clusterEnabled: value })} /><Text style={ui.heading}>Connected patches</Text></View>
        <Text style={ui.body}>Minimum connected pixels · 1–128 · default 8</Text>
        <TextInput accessibilityLabel="Minimum connected pixels" editable={!busy && state.filters.clusterEnabled} keyboardType="number-pad" value={state.filters.minConnectedPixels} onChangeText={value => store.setFilters({ ...state.filters, minConnectedPixels: value })} style={ui.input} />
        <Text style={ui.caption}>Applied after slope; 8 neighbors, diagonals and the current pixel included. Grid counts do not establish physical area or independent 10 m accuracy. Small disconnected patches can be real inundation.</Text>
      </View>
      <Text style={ui.body}>Fixed exploratory algorithm: 30 m radius mean in linear power; later VV below −15 dB; decrease of more than 3 dB; before VV at least −15 dB. Prior-year permanent water excluded. These thresholds have not been locally validated.</Text>
      <Text style={ui.caption}>HTTP 422: check selection, reference or filter parameters. HTTP 429: worker busy; retry shortly. HTTP 502/503/504: provider, authentication or timeout failure. Connection errors: check backend LAN address and Wi-Fi.</Text>
    </Content>
  </StepFrame>;
}
