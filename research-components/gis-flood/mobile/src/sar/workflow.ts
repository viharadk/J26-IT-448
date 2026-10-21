import { analyzeSar, candidateLayer, checkSarTile, discoverSar, INITIAL_FILTERS, previewSar, RESEARCH_DATES, RESEARCH_IDS, SarAnalysis, SarCandidateStage, SarDates, SarDiscovery, SarFilterDraft, SarPairs, SarPreview, SarReferenceMethod, selectedPair } from '../api/sar';
import { analysisPrerequisite, AnalysisPhase, executeAnalysis } from './analysisRun';
import { createLatestRequest } from '../search/locationSearch';

export const SAR_STEPS = [
  { name: 'DiscoverImages', title: 'Discover Images' },
  { name: 'SelectImagePair', title: 'Select Image Pair' },
  { name: 'SarMap', title: 'SAR Map' },
  { name: 'AnalysisSetup', title: 'Analysis Setup' },
  { name: 'AnalysisResults', title: 'Analysis Results' },
] as const;
export type SarRoute = typeof SAR_STEPS[number]['name'];
export type SarStackParamList = { [K in SarRoute]: undefined };
export type PreviewStage = 'before' | 'later' | 'change';
export type TileState = { status: 'idle' | 'loading' | 'ready' | 'error'; error: string };
export interface MapRegion { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }
type Operation = 'discovery' | 'preview' | 'analysis';
const tile = (): TileState => ({ status: 'idle', error: '' });
const previewTiles = () => ({ before: tile(), later: tile(), change: tile() });
const candidateTiles = () => ({ raw: tile(), terrain: tile(), final: tile() });
export interface SarWorkflowState {
  dates: SarDates; discovery: SarDiscovery | null; pairs: SarPairs | null; before: string; later: string;
  preview: SarPreview | null; analysis: SarAnalysis | null; filters: SarFilterDraft; referenceMethod: SarReferenceMethod;
  previewStage: PreviewStage; candidateStage: SarCandidateStage; previewRegion: MapRegion | null; candidateRegion: MapRegion | null;
  busy: Operation | null; startedAt: number | null; now: number;
  errors: Record<Operation, string>; phase: AnalysisPhase; resultsPending: boolean;
  previewTiles: Record<PreviewStage, TileState>; candidateTiles: Record<SarCandidateStage, TileState>;
}
export function initialSarState(now = Date.now()): SarWorkflowState {
  return { dates: { ...RESEARCH_DATES }, discovery: null, pairs: null, before: '', later: '', preview: null, analysis: null,
    filters: { ...INITIAL_FILTERS }, referenceMethod: 'yearly-conservative-v1', previewStage: 'before', candidateStage: 'raw',
    previewRegion: null, candidateRegion: null, busy: null, startedAt: null, now,
    errors: { discovery: '', preview: '', analysis: '' }, phase: 'idle', resultsPending: false, previewTiles: previewTiles(), candidateTiles: candidateTiles() };
}
export function supportsSelectedPair(state: SarWorkflowState): boolean {
  const pair = selectedPair(state.pairs, state.before, state.later);
  const before = state.discovery?.periods.before.scenes.find(s => s.sceneId === state.before);
  const later = state.discovery?.periods.flood.scenes.find(s => s.sceneId === state.later);
  return pair?.status === 'suitable' && [before, later].every(s => s?.instrumentMode === 'IW' && s.polarizations.includes('VV') && s.resolutionMeters === 10 && !s.timestampWarning);
}
export function sessionExpired(session: { generatedAt: string; renewAfterSeconds?: number } | null, now: number) {
  return !session || !Number.isFinite(Date.parse(session.generatedAt)) || now >= Date.parse(session.generatedAt) + (session.renewAfterSeconds ?? 600) * 1000;
}
export function setupPrerequisite(state: SarWorkflowState, now = state.now) {
  return analysisPrerequisite({ before: state.before, later: state.later, preview: state.preview, supported: supportsSelectedPair(state), expired: sessionExpired(state.preview, now) });
}
export function routePrerequisite(route: SarRoute, state: SarWorkflowState): string | null {
  if (route === 'DiscoverImages') return null;
  if (!state.discovery) return 'Find real Sentinel-1 scenes first.';
  if (route === 'SelectImagePair') return state.discovery.periods.before.scenes.length && state.discovery.periods.flood.scenes.length ? null : 'No scenes in one or both windows. Adjust the dates and search again.';
  if (!supportsSelectedPair(state)) return 'Select a compatible before/later image pair first.';
  if (route === 'SarMap') return null;
  if (route === 'AnalysisResults') return state.analysis ? null : 'Run analysis in Analysis Setup to produce candidate areas.';
  return setupPrerequisite(state);
}
// A completion is consumed once by a focused screen, so Android Back from
// Results does not immediately push Results again. No navigation from a worker.
export function resultsDestination(state: SarWorkflowState, focusedRoute: SarRoute): SarRoute | null {
  return state.resultsPending && state.analysis && focusedRoute === 'AnalysisSetup' ? 'AnalysisResults' : null;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : 'SAR request failed. Retry the operation.';

export function createSarWorkflow(dependencies = { discover: discoverSar, preview: previewSar, analyze: analyzeSar, execute: executeAnalysis, checkTile: checkSarTile, now: Date.now }) {
  let state = initialSarState(dependencies.now());
  let disposed = false;
  const listeners = new Set<() => void>();
  const requests = { discovery: createLatestRequest(), preview: createLatestRequest(), analysis: createLatestRequest() };
  const tileRequests = { preview: createLatestRequest(), candidates: createLatestRequest() };
  const update = (patch: Partial<SarWorkflowState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); } };
  const errors = (operation: Operation, message: string) => ({ ...state.errors, [operation]: message });
  function invalidateAnalysis(): Partial<SarWorkflowState> {
    requests.analysis.cancel(); tileRequests.candidates.cancel();
    return { analysis: null, phase: 'idle', resultsPending: false, candidateTiles: candidateTiles(), errors: errors('analysis', ''),
      ...(state.busy === 'analysis' ? { busy: null, startedAt: null } : {}) };
  }
  function invalidatePair(): Partial<SarWorkflowState> {
    requests.preview.cancel(); tileRequests.preview.cancel();
    return { ...invalidateAnalysis(), preview: null, previewTiles: previewTiles(), previewStage: 'before', previewRegion: null, candidateRegion: null,
      errors: { ...state.errors, preview: '', analysis: '' }, ...(state.busy === 'preview' ? { busy: null, startedAt: null } : {}) };
  }
  function start(operation: Operation) {
    if (disposed) return null;
    if (state.busy) { update({ errors: errors(operation, 'Another SAR operation is running. Wait for it to finish before retrying.') }); return null; }
    const ticket = requests[operation].start();
    update({ busy: operation, startedAt: dependencies.now(), now: dependencies.now(), errors: errors(operation, '') });
    return ticket;
  }
  function setTile(kind: 'preview' | 'candidates', stage: string, value: TileState) {
    if (kind === 'preview') update({ previewTiles: { ...state.previewTiles, [stage]: value } });
    else update({ candidateTiles: { ...state.candidateTiles, [stage]: value } });
  }
  async function checkTiles(kind: 'preview' | 'candidates') {
    if (disposed) return;
    const data = kind === 'preview' ? state.preview : state.analysis;
    if (!data) return;
    if (sessionExpired(data, dependencies.now())) return;
    const ticket = tileRequests[kind].start();
    const layers = kind === 'preview' ? state.preview!.layers : state.analysis!.layers || { raw: state.analysis!.layer };
    const coordinate = kind === 'preview' ? state.preview!.quality.samples[0]?.geometry.coordinates || state.preview!.quality.studyArea.center :
      state.analysis!.candidateCoordinates[0] || state.preview?.quality.studyArea.center;
    if (!coordinate) return;
    const managesPhase = kind === 'candidates' && state.phase !== 'error';
    if (managesPhase) update({ phase: 'tiles', errors: errors('analysis', '') });
    await Promise.all(Object.entries(layers).map(async ([stage, layer]) => {
      setTile(kind, stage, { status: 'loading', error: '' });
      try { await dependencies.checkTile(layer, coordinate, ticket.signal); if (ticket.isCurrent()) setTile(kind, stage, { status: 'ready', error: '' }); }
      catch (error) { if (ticket.isCurrent()) setTile(kind, stage, { status: 'error', error: errorText(error) }); }
    }));
    if (managesPhase && ticket.isCurrent()) {
      const failed = Object.keys(layers).map(stage => state.candidateTiles[stage as SarCandidateStage]).find(value => value.status === 'error');
      update({ phase: failed ? 'tile-error' : 'success', errors: errors('analysis', failed?.error || '') });
    }
  }
  const store = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { disposed = true; Object.values(requests).forEach(r => r.cancel()); Object.values(tileRequests).forEach(r => r.cancel()); listeners.clear(); },
    tick: () => {
      const now = dependencies.now();
      if (state.busy || sessionExpired(state.preview, now) !== sessionExpired(state.preview, state.now) || sessionExpired(state.analysis, now) !== sessionExpired(state.analysis, state.now)) update({ now });
    },
    setDates: (dates: SarDates) => {
      if (JSON.stringify(dates) === JSON.stringify(state.dates)) return;
      requests.discovery.cancel();
      update({ ...invalidatePair(), dates: { ...dates }, discovery: null, pairs: null, before: '', later: '', busy: null, startedAt: null,
        candidateStage: 'raw', errors: { discovery: '', preview: '', analysis: '' } });
    },
    selectScene: (period: 'before' | 'later', id: string) => {
      if (state[period] === id) return;
      update({ ...invalidatePair(), [period]: id, candidateStage: 'raw' });
    },
    setFilters: (filters: SarFilterDraft) => { if (JSON.stringify(filters) !== JSON.stringify(state.filters)) update({ ...invalidateAnalysis(), filters: { ...filters } }); },
    setReference: (referenceMethod: SarReferenceMethod) => { if (referenceMethod !== state.referenceMethod) update({ ...invalidateAnalysis(), referenceMethod }); },
    setPreviewStage: (previewStage: PreviewStage) => update({ previewStage }),
    setCandidateStage: (candidateStage: SarCandidateStage) => { if (candidateLayer(state.analysis, candidateStage)) update({ candidateStage }); },
    setRegion: (kind: 'preview' | 'candidates', region: MapRegion) => update(kind === 'preview' ? { previewRegion: region } : { candidateRegion: region }),
    acknowledgeResults: () => { if (state.resultsPending) update({ resultsPending: false }); },
    checkTiles,
    async discover() {
      const ticket = start('discovery'); if (!ticket) return;
      try {
        const result = await dependencies.discover(state.dates, ticket.signal); if (!ticket.isCurrent()) return;
        const researchAvailable = result.scenes.periods.before.scenes.some(s => s.sceneId === RESEARCH_IDS.before) && result.scenes.periods.flood.scenes.some(s => s.sceneId === RESEARCH_IDS.later);
        const preferred = result.pairs.candidatePairs.find(p => p.beforeSceneId === RESEARCH_IDS.before && p.duringSceneId === RESEARCH_IDS.later) || result.pairs.candidatePairs[0];
        const before = result.scenes.periods.before.scenes.some(s => s.sceneId === state.before) ? state.before : researchAvailable ? RESEARCH_IDS.before : preferred?.beforeSceneId || result.scenes.periods.before.scenes[0]?.sceneId || '';
        const later = result.scenes.periods.flood.scenes.some(s => s.sceneId === state.later) ? state.later : researchAvailable ? RESEARCH_IDS.later : preferred?.duringSceneId || result.scenes.periods.flood.scenes[0]?.sceneId || '';
        // A new discovery can change compatibility evidence even for the same IDs.
        // Preserve downstream data only while the same pair remains supported.
        const next = { ...state, discovery: result.scenes, pairs: result.pairs, before, later };
        const changed = before !== state.before || later !== state.later || !supportsSelectedPair(next);
        update({ ...(changed ? invalidatePair() : {}), discovery: result.scenes, pairs: result.pairs, before, later });
      } catch (error) { if (ticket.isCurrent()) update({ errors: errors('discovery', errorText(error)) }); }
      finally { if (ticket.isCurrent()) update({ busy: null, startedAt: null }); }
    },
    async loadPreview() {
      if (!supportsSelectedPair(state)) { update({ errors: errors('preview', 'Select a compatible IW/VV 10 m before/later pair first.') }); return false; }
      const ticket = start('preview'); if (!ticket) return false;
      tileRequests.preview.cancel();
      update({ previewTiles: previewTiles() });
      try {
        const result = await dependencies.preview(state.before, state.later, ticket.signal); if (!ticket.isCurrent()) return false;
        // Renewal for unchanged scenes must not discard an existing analysis.
        update({ preview: result, now: dependencies.now(), previewTiles: previewTiles() });
        await checkTiles('preview'); return ticket.isCurrent();
      } catch (error) { if (ticket.isCurrent()) update({ errors: errors('preview', errorText(error)) }); return false; }
      finally { if (ticket.isCurrent()) update({ busy: null, startedAt: null }); }
    },
    async runAnalysis(renew = false) {
      const ticket = start('analysis'); if (!ticket) return;
      tileRequests.candidates.cancel();
      // Original analysis probes and tile-only retries share one owner. A retry
      // aborts/invalidates every remaining probe from the previous generation.
      let tiles: ReturnType<typeof tileRequests.candidates.start> | null = null;
      update({ ...(renew ? {} : { analysis: null }), phase: 'idle', resultsPending: false, candidateTiles: candidateTiles() });
      await dependencies.execute({ context: { before: state.before, later: state.later, preview: state.preview, supported: supportsSelectedPair(state), expired: sessionExpired(state.preview, dependencies.now()) },
        filters: state.filters, referenceMethod: state.referenceMethod, ticket,
        onPhase: (phase, detail) => { if (ticket.isCurrent() && (!tiles || tiles.isCurrent())) update({ phase, errors: errors('analysis', detail || '') }); },
        onResult: analysis => {
          if (!ticket.isCurrent()) return;
          tiles = tileRequests.candidates.start();
          const candidateStage = candidateLayer(analysis, state.candidateStage) ? state.candidateStage : 'raw';
          update({ analysis, candidateStage, now: dependencies.now(), resultsPending: true });
        },
      }, { analyze: dependencies.analyze, checkTile: async (layer, coordinate) => {
        const owner = tiles;
        if (!owner || !owner.isCurrent() || !ticket.isCurrent()) return;
        const current = () => owner.isCurrent() && ticket.isCurrent();
        const layers = state.analysis?.layers || { raw: state.analysis?.layer };
        const stages = Object.entries(layers).filter(([, value]) => value === layer).map(([stage]) => stage);
        stages.forEach(stage => { if (current()) setTile('candidates', stage, { status: 'loading', error: '' }); });
        try {
          await dependencies.checkTile(layer, coordinate, owner.signal);
          stages.forEach(stage => { if (current()) setTile('candidates', stage, { status: 'ready', error: '' }); });
        } catch (error) {
          stages.forEach(stage => { if (current()) setTile('candidates', stage, { status: 'error', error: errorText(error) }); });
          throw error;
        }
      } }).catch(error => {
        if (ticket.isCurrent()) update({ phase: 'error', errors: errors('analysis', errorText(error)) });
      });
      if (ticket.isCurrent()) update({ busy: null, startedAt: null });
    },
    async renewCandidateTiles() {
      if (state.busy) return;
      if (sessionExpired(state.preview, dependencies.now()) && !await store.loadPreview()) return;
      await store.runAnalysis(true);
    },
  };
  return store;
}
export type SarWorkflow = ReturnType<typeof createSarWorkflow>;
