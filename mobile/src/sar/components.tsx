import { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action } from '../components/ui';
import { colors } from '../theme';
import { SarLayer } from '../api/sar';
import { MapRegion, SAR_STEPS, SarRoute, TileState } from './workflow';

export const LABEL = 'Experimental SAR-Derived Flood Candidates — Unvalidated';
export const INITIAL_REGION: MapRegion = { latitude: 6.9317, longitude: 80.0124, latitudeDelta: 0.29, longitudeDelta: 0.4 };
export { default as SarNativeMap } from './SarNativeMap';
export function StepFrame({ step, children, footer }: PropsWithChildren<{ step: SarRoute; footer: ReactNode }>) {
  const index = SAR_STEPS.findIndex(item => item.name === step);
  return <SafeAreaView style={ui.safe} edges={['left', 'right', 'bottom']}>
    <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={ui.progress} accessibilityLabel={`Step ${index + 1} of 5: ${SAR_STEPS[index].title}`}>
        <Text style={ui.eyebrow}>FUNCTION 02 · STEP {index + 1} OF 5</Text>
        <View style={ui.row}>{SAR_STEPS.map((item, i) => <View key={item.name} style={[ui.segment, i <= index && ui.segmentActive]} />)}</View>
      </View>
      <View style={ui.flex}>{children}</View>
      <View style={ui.footer}>{footer}</View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function StepActions({ back, next, label, disabled, reason, secondary }: { back: () => void; next?: () => void; label?: string; disabled?: boolean; reason?: string | null; secondary?: ReactNode }) {
  return <>{!!reason && <Text accessibilityRole="alert" style={ui.warning}>{reason}</Text>}{secondary}
    <View style={ui.actions}><Pressable accessibilityRole="button" onPress={back} style={ui.back}><Text style={ui.text}>Back</Text></Pressable>
      {!!next && <View style={ui.flex}><Action label={label || 'Next'} disabled={disabled} onPress={next} /></View>}</View>
  </>;
}
export function Content({ children }: PropsWithChildren) { return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>{children}</ScrollView>; }
export function Note({ children, error = false }: PropsWithChildren<{ error?: boolean }>) { return <Text accessibilityRole={error ? 'alert' : undefined} style={error ? ui.error : ui.warning}>{children}</Text>; }
export function Choice({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[ui.choice, selected && ui.selected, disabled && { opacity: 0.5 }]}><Text style={ui.text}>{selected ? '● ' : ''}{label}</Text></Pressable>;
}
export function Loading({ text, seconds }: { text: string; seconds?: number }) { return <View style={ui.loading}><ActivityIndicator color={colors.accent} /><Text accessibilityLiveRegion="polite" style={[ui.text, { flex: 1 }]}>{text}{seconds === undefined ? '' : ` · ${seconds}s`}</Text></View>; }
export function Legend({ layer, candidate = false }: { layer: SarLayer; candidate?: boolean }) {
  return <View style={ui.legend}><View style={ui.row}>{layer.visualization.palette.map((color, index, all) => <View key={`${color}-${index}`} style={ui.legendItem}><View style={[ui.swatch, { backgroundColor: `#${color}` }]} /><Text style={ui.caption}>{candidate ? 'Experimental candidate' : index === 0 ? layer.visualization.min : index === all.length - 1 ? layer.visualization.max : 0}</Text></View>)}<Text style={ui.caption}>{candidate ? 'Binary response' : layer.units}</Text></View><Text style={ui.caption}>Transparent = unclassified, not dry land.</Text></View>;
}
export function TileFeedback({ tile, expired, retry, disabled }: { tile: TileState; expired: boolean; retry: () => void; disabled: boolean }) {
  return <View style={ui.tileFeedback}>
    {expired ? <Note>Earth Engine tile session expired. Refresh tiles to continue.</Note> : tile.status === 'loading' ? <Loading text="Checking live tile connection…" /> : tile.status === 'ready' ? <Text accessibilityLiveRegion="polite" style={ui.caption}>Live PNG tile check passed.</Text> : tile.status === 'error' ? <Note error>{tile.error}</Note> : <Text style={ui.caption}>Load live layers to check tiles.</Text>}
    {(expired || tile.status === 'error') && <Pressable accessibilityRole="button" disabled={disabled} onPress={retry} style={ui.link}><Text style={ui.linkText}>Refresh / retry tiles</Text></Pressable>}
  </View>;
}
export const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  progress: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 8 }, row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  segment: { height: 3, flex: 1, backgroundColor: colors.border, borderRadius: 2 }, segmentActive: { backgroundColor: colors.accent },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 20, gap: 14 }, footer: { padding: 12, gap: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' }, back: { minHeight: 48, minWidth: 64, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 }, body: { color: colors.muted, fontSize: 13, lineHeight: 19 }, caption: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  heading: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '700' }, warning: { color: colors.warning, fontSize: 12, lineHeight: 18 }, error: { color: colors.error, fontSize: 13, lineHeight: 19 },
  panel: { padding: 14, gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  choice: { padding: 11, borderRadius: 10, borderColor: colors.border, borderWidth: 1, minHeight: 44, justifyContent: 'center' }, selected: { backgroundColor: colors.accentDark, borderColor: colors.accent },
  input: { padding: 11, marginTop: 4, fontSize: 16, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, minHeight: 46 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, flexShrink: 1 },
  link: { minHeight: 44, justifyContent: 'center' }, linkText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  mapWrap: { flex: 1, minHeight: 180, marginHorizontal: 12, overflow: 'hidden', borderRadius: 14 }, mapTools: { position: 'absolute', right: 8, top: 8, gap: 8 }, mapLegend: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,21,37,0.92)' },
  mapButton: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  tileFeedback: { paddingHorizontal: 16, paddingVertical: 4 }, legend: { paddingHorizontal: 10, paddingVertical: 6, gap: 3 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, swatch: { width: 16, height: 16, borderRadius: 3, borderWidth: 1, borderColor: colors.muted },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 6 }, tab: { flex: 1 },
  metric: { flex: 1, padding: 9, backgroundColor: colors.surface, borderRadius: 10, gap: 3 }, measurement: { color: colors.accent, fontSize: 18, fontWeight: '700' },
});
