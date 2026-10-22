import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { selectedPair } from '../../api/sar';
import { useSarWorkflow } from '../SarWorkflowProvider';
import { routePrerequisite, supportsSelectedPair } from '../workflow';
import { Choice, Note, StepActions, StepFrame, ui } from '../components';

export function SelectImagePairScreen() {
  const router = useRouter();
  const { state, store } = useSarWorkflow();
  const [period, setPeriod] = useState<'before' | 'flood'>('before');
  const [expanded, setExpanded] = useState<string | null>(null);
  const scenes = state.discovery?.periods[period].scenes || [];
  const pair = selectedPair(state.pairs, state.before, state.later), supported = supportsSelectedPair(state);
  const before = state.discovery?.periods.before.scenes.find(s => s.sceneId === state.before);
  const later = state.discovery?.periods.flood.scenes.find(s => s.sceneId === state.later);
  return <StepFrame step="SelectImagePair" footer={<StepActions back={() => router.back()} next={() => router.push('/gis-flood/sar/map')} label="Next: SAR Map" disabled={!!state.busy || !supported}
    reason={routePrerequisite('SarMap', state)} />}>
    <View style={[ui.panel, { marginHorizontal: 16, marginBottom: 10 }]}>
      <Text style={ui.text}>Before: {before?.acquiredAt.slice(0, 10) || 'Not selected'} · Later: {later?.acquiredAt.slice(0, 10) || 'Not selected'}</Text>
      <Text accessibilityLiveRegion="polite" style={supported ? ui.text : ui.warning}>Pair: {pair?.status || 'not assessed'} · Joint footprint / study AOI: {pair?.jointCoveragePercent === null || pair?.jointCoveragePercent === undefined ? 'unchecked' : `${pair.jointCoveragePercent.toFixed(2)}%`} · Gap: {pair?.gapDays.toFixed(2) ?? '—'} days</Text>
      <Text style={ui.caption}>Metadata compatibility is not flood validation. Valid radar pixels are checked on load.</Text>
    </View>
    <View style={ui.tabs}>{(['before', 'flood'] as const).map(key => <View key={key} style={ui.tab}><Choice label={`${key === 'before' ? 'Before' : 'Later'} (${state.discovery?.periods[key].scenes.length || 0})`} selected={period === key} onPress={() => setPeriod(key)} /></View>)}</View>
    <FlatList data={scenes} keyExtractor={scene => scene.sceneId} contentContainerStyle={ui.content} extraData={[state.before, state.later, expanded, state.busy]}
      ListEmptyComponent={<Note>{state.discovery ? 'No images in this window. Go back and adjust the dates.' : 'Find real scenes on Discover Images first.'}</Note>}
      renderItem={({ item: scene }) => {
        const selected = (period === 'before' ? state.before : state.later) === scene.sceneId;
        return <View style={[ui.panel, { marginBottom: 9 }, selected && ui.selected]}>
          <Pressable disabled={!!state.busy} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: !!state.busy }} onPress={() => store.selectScene(period === 'before' ? 'before' : 'later', scene.sceneId)} style={{ gap: 4, minHeight: 72 }}>
            <Text style={ui.text}>{selected ? '● Selected · ' : ''}{scene.acquiredAt.slice(0, 10)} · {scene.acquiredAt.slice(11, 19)} UTC</Text>
            <Text style={ui.body}>{scene.platform} · {scene.orbitDirection} {scene.relativeOrbitNumber} · {scene.polarizations.join('/')} · {scene.resolutionMeters} m · {scene.instrumentMode}</Text>
            <Text style={ui.body}>Footprint / study AOI {scene.coveragePercent.toFixed(2)}% · valid pixels unchecked</Text>
          </Pressable>
          {!!scene.timestampWarning && <Note>{scene.timestampWarning}</Note>}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === scene.sceneId }} onPress={() => setExpanded(expanded === scene.sceneId ? null : scene.sceneId)}><Text style={ui.linkText}>Asset ID {expanded === scene.sceneId ? '−' : '+'}</Text></Pressable>
          {expanded === scene.sceneId && <Text selectable style={ui.caption}>{scene.sceneId}</Text>}
        </View>;
      }}
      ListFooterComponent={<View style={{ gap: 8 }}><Text style={ui.body}>{state.pairs?.message}</Text>{pair?.reasons.map((reason, i) => <Note key={i}>{reason}</Note>)}</View>} />
  </StepFrame>;
}
