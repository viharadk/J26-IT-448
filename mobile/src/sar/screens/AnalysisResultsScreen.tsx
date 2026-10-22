import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { candidateLayer, responseReferenceMethod, SarCandidateStage } from '../../api/sar';
import { coverageRows } from '../resultPresentation';
import { useSarWorkflow } from '../SarWorkflowProvider';
import { sessionExpired, setupPrerequisite } from '../workflow';
import { Choice, Content, LABEL, Legend, Loading, Note, SarNativeMap, StepActions, StepFrame, TileFeedback, ui } from '../components';

export function AnalysisResultsScreen() {
  const router = useRouter();
  const { state, store } = useSarWorkflow(), focused = useIsFocused();
  const [details, setDetails] = useState(false);
  const data = state.analysis, f = data?.filtering, layer = candidateLayer(data, state.candidateStage);
  const reference = data ? responseReferenceMethod(data) : null;
  const expired = sessionExpired(data, state.now), prerequisite = setupPrerequisite(state);
  useEffect(() => { if (focused && state.resultsPending) store.acknowledgeResults(); }, [focused, state.resultsPending, store]);
  const changeFilters = () => router.dismissTo('/gis-flood/sar/analysis-setup');
  return <StepFrame step="AnalysisResults" footer={<StepActions back={() => router.back()} next={() => { changeFilters(); void store.runAnalysis(); }} label="Rerun Analysis" disabled={!!state.busy || !!prerequisite} reason={prerequisite}
    secondary={<><Text accessibilityRole="button" onPress={changeFilters} style={ui.linkText}>Change filters / water reference</Text>
      {state.busy === 'analysis' && <Loading text={state.phase === 'tiles' ? 'Analysis complete · checking candidate tiles…' : 'Renewing candidate layers…'} seconds={Math.floor((state.now - state.startedAt!) / 1000)} />}
      {!!state.errors.analysis && <Note error>{data ? 'Area results retained. ' : ''}{state.errors.analysis}</Note>}
      {!!state.errors.preview && <Note error>{state.errors.preview}</Note>}
      {!!prerequisite && <Text accessibilityRole="button" onPress={() => router.dismissTo('/gis-flood/sar/map')} style={ui.linkText}>Refresh live SAR Map</Text>}
    </>} />}>
    <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 5 }}>
      <Text accessibilityRole="header" style={ui.warning}>{LABEL}</Text>
      {data && <View style={ui.row}>{([
        ['Raw candidates', data.areas.candidateAreaKm2], ['After slope candidates', f?.afterSlopeAreaKm2 ?? data.areas.candidateAreaKm2], ['Final candidates', f?.finalCandidateAreaKm2 ?? data.areas.candidateAreaKm2],
      ] as [string, number][]).map(([label, value]) => <View key={label} style={ui.metric}><Text style={ui.caption}>{label} · km²</Text><Text style={ui.measurement}>{value.toFixed(6)}</Text></View>)}</View>}
      {data && <Text style={ui.caption}>{reference === 'yearly-conservative-v1' ? 'Conservative annual' : reference === 'yearly-monthly-dry-v1' ? 'Historical monthly eligibility' : 'Reference method unverified'} · Slope {f?.configuration.maxSlopeDegrees === null || !f ? 'off' : `≤${f.configuration.maxSlopeDegrees}°`} · Cluster {f?.configuration.minConnectedPixels ?? 'off'}{f?.configuration.minConnectedPixels ? ' px' : ''}</Text>}
      {data && !details && <Note>Supported raw comparison area {data.areas.validAnalysisAreaKm2.toFixed(3)} km² · Historical-water unknown area {data.areas.ancillaryUnknownAreaKm2.toFixed(3)} km² · Missing SAR {data.areas.missingSarAreaKm2.toFixed(3)} km². Not AOI-wide flood extent.</Note>}
    </View>
    {!data ? <Content><Note>No current analysis result. Run analysis in Analysis Setup. Changing dates, scenes, filters or reference invalidates dependent results.</Note></Content> : <>
      <View style={ui.tabs}>{(['raw', 'terrain', 'final'] as SarCandidateStage[]).map(stage => <View key={stage} style={ui.tab}><Choice label={stage === 'raw' ? 'Raw' : stage === 'terrain' ? 'After slope' : 'Final'} selected={state.candidateStage === stage} disabled={!candidateLayer(data, stage)} onPress={() => store.setCandidateStage(stage)} /></View>)}</View>
      {details ? <Content>
        <Note>{data.supportWarning}</Note>
        {f && <View style={ui.panel}>
          <Text style={ui.heading}>Filter exclusions & no-data</Text>
          {([
            ['Steep candidates excluded', f.slopeExcludedAreaKm2], ['Connected patches removed', f.clusterRemovedAreaKm2],
            ['Candidate terrain no-data', f.terrainNoDataCandidateAreaKm2], ['Reference-valid terrain no-data', f.terrainNoDataSupportAreaKm2],
            ['Common SAR support', f.commonSarSupportAreaKm2], ['Reference-valid support', f.referenceValidSupportAreaKm2],
          ] as [string, number | null][]).map(([label, value]) => <Text key={label} style={ui.body}>{label}: {value === null ? 'not queried (filter off)' : `${value.toFixed(6)} km²`}</Text>)}
          <Text style={ui.body}>Connected filtering removed {f.clusterRemovedPixels} pixel centers. Geographic pixelArea sums include AOI boundary weights. Raw = after slope + steep exclusion + terrain no-data; after slope = final + connected removal.</Text>
        </View>}
        <View style={ui.panel}><Text style={ui.heading}>Coverage & support</Text>{coverageRows(data).map(({ label, value, unit }) => <Text key={label} style={ui.body}>{label}: {value.toFixed(3)} {unit}</Text>)}
          <Text style={ui.caption}>The raw percentage uses reference-supported raw comparison area, including observed permanent water. Candidates exclude permanent water. Filtered candidate areas are reported separately; this is not a filtered or AOI-wide flood percentage.</Text>
        </View>
        <Text style={ui.body}>{data.methodology.summary} Water reference year: {data.methodology.waterReferenceYear}.</Text>
        <Text style={ui.body}>SAR: Copernicus Sentinel-1 / Google Earth Engine. Historical water: Source: EC JRC/Google.</Text>
        {state.preview && <><Note>{state.preview.limitation}</Note><Text style={ui.body}>{state.preview.quality.alignment.caveat}</Text></>}
        {data.limitations.map((text, i) => <Note key={i}>{text}</Note>)}
      </Content> : <SarNativeMap layer={!expired ? layer : undefined} region={state.candidateRegion} center={state.preview?.quality.studyArea.center} onRegion={region => store.setRegion('candidates', region)} sessionKey={data.generatedAt} candidate sample={state.candidateStage === 'raw' ? data.candidateCoordinates[0] : undefined} legend={layer && <Legend layer={layer} candidate />} />}
      <TileFeedback tile={state.candidateTiles[state.candidateStage]} expired={expired} disabled={!!state.busy} retry={() => void (expired ? store.renewCandidateTiles() : store.checkTiles('candidates'))} />
      <Text accessibilityRole="button" style={[ui.linkText, { padding: 12, textAlign: 'center' }]} onPress={() => setDetails(!details)}>{details ? 'Show candidate map' : 'Coverage, no-data & scientific warnings'}</Text>
      {!details && f && (f.terrainNoDataCandidateAreaKm2 || 0) > 0 && <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><Note>Candidate terrain no-data: {f.terrainNoDataCandidateAreaKm2!.toFixed(6)} km², excluded separately.</Note></View>}
    </>}
  </StepFrame>;
}
