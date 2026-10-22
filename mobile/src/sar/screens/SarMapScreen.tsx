import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSarWorkflow } from '../SarWorkflowProvider';
import { PreviewStage, routePrerequisite, sessionExpired, supportsSelectedPair } from '../workflow';
import { Choice, Content, Legend, Loading, Note, SarNativeMap, StepActions, StepFrame, TileFeedback, ui } from '../components';

export function SarMapScreen() {
  const router = useRouter();
  const { state, store } = useSarWorkflow(), [details, setDetails] = useState(false);
  const data = state.preview, layer = data?.layers[state.previewStage];
  const supported = supportsSelectedPair(state), expired = sessionExpired(data, state.now);
  return <StepFrame step="SarMap" footer={<StepActions back={() => router.back()} next={() => data ? router.push('/gis-flood/sar/analysis-setup') : void store.loadPreview()}
    label={state.busy === 'preview' ? 'Loading live SAR layers…' : data ? 'Next: Analysis Setup' : 'Load live SAR layers'}
    disabled={!!state.busy || !supported || (!!data && expired)} reason={routePrerequisite(data ? 'AnalysisSetup' : 'SarMap', state)}
    secondary={data && !expired ? <Text accessibilityRole="button" style={ui.linkText} onPress={() => { if (!state.busy) void store.loadPreview(); }}>Refresh live SAR layers</Text> : undefined} />}>
    <View style={ui.tabs}>{(['before', 'later', 'change'] as PreviewStage[]).map(stage => <View key={stage} style={ui.tab}><Choice label={stage[0].toUpperCase() + stage.slice(1)} selected={state.previewStage === stage} onPress={() => store.setPreviewStage(stage)} /></View>)}</View>
    {!!state.errors.preview && <View style={{ paddingHorizontal: 16 }}><Note error>{state.errors.preview}</Note></View>}
    {state.busy === 'preview' && <View style={{ paddingHorizontal: 16 }}><Loading text="Earth Engine quality and live tile request…" seconds={Math.floor((state.now - state.startedAt!) / 1000)} /></View>}
    {data && <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><Text style={ui.body}>Common valid SAR: {data.quality.common.validPixelAreaKm2.toFixed(3)} km² · {data.quality.common.validPixelCoveragePercent.toFixed(2)}% of raster AOI</Text><Text style={ui.caption}>{state.previewStage === 'change' ? 'Exploratory VV change (later − before), not flood extent.' : `${state.previewStage === 'before' ? 'Before' : 'Later'} VV backscatter, not a water classification.`}</Text></View>}
    {details && data ? <Content>
      {(['before', 'later'] as const).map(key => <View style={ui.panel} key={key}><Text style={ui.heading}>{key === 'before' ? 'Before' : 'Later'}</Text><Text style={ui.text}>{data.quality.scenes[key].acquiredAt} UTC</Text><Text style={ui.body}>{data.quality.scenes[key].platform} · {data.quality.scenes[key].orbitDirection} {data.quality.scenes[key].relativeOrbitNumber} · VV</Text><Text style={ui.body}>Footprint {data.quality.scenes[key].footprintCoveragePercent.toFixed(2)}% of study AOI · valid {data.quality.scenes[key].validPixelCoveragePercent.toFixed(2)}% of raster AOI</Text></View>)}
      <Note>{data.limitation}</Note><Text style={ui.body}>{data.quality.alignment.caveat}</Text><Text style={ui.body}>Shared grayscale: −25 to 0 dB. Change: later minus before, −6 to +6 dB. SAR: Copernicus Sentinel-1 / Google Earth Engine.</Text>
    </Content> : <SarNativeMap layer={!expired ? layer : undefined} region={state.previewRegion} center={data?.quality.studyArea.center} sessionKey={data?.generatedAt || 'empty'} onRegion={region => store.setRegion('preview', region)} legend={layer && <Legend layer={layer} />} />}
    {!data && <View style={{ padding: 16 }}><Note>Load live layers to inspect actual common radar pixels for this pair. No imagery has been substituted.</Note></View>}
    {data && <TileFeedback tile={state.previewTiles[state.previewStage]} expired={expired} disabled={!!state.busy} retry={() => void (expired ? store.loadPreview() : store.checkTiles('preview'))} />}
    {data && <Text accessibilityRole="button" style={[ui.linkText, { padding: 12, textAlign: 'center' }]} onPress={() => setDetails(!details)}>{details ? 'Show map' : 'Scene metadata & research warnings'}</Text>}
  </StepFrame>;
}
