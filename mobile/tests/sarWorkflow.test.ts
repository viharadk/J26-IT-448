import test from 'node:test';
import assert from 'node:assert/strict';
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import { INITIAL_FILTERS, RESEARCH_DATES, RESEARCH_IDS, SarAnalysis, SarDiscovery, SarLayer, SarPairs, SarPreview, SarScene } from '../src/api/sar';
import { executeAnalysis } from '../src/sar/analysisRun';
import { createSarWorkflow, resultsDestination, routePrerequisite, SAR_STEPS, sessionExpired, setupPrerequisite, supportsSelectedPair } from '../src/sar/workflow';

const otherBefore = RESEARCH_IDS.before.replace('3CCB', '3CCC');
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function fixture() {
  let clock = 1700000000000;
  const calls = { discover: 0, preview: 0, analyze: 0, tiles: [] as string[] };
  const scene = (id: string, date: string): SarScene => ({ sceneId: id, acquiredAt: date, platform: 'S1A', orbitDirection: 'DESCENDING', relativeOrbitNumber: 19, instrumentMode: 'IW', polarizations: ['VV', 'VH'], resolutionMeters: 10, coveragePercent: 95, timestampWarning: null });
  const discovery: SarDiscovery = { success: true, periods: {
    before: { scenes: [scene(RESEARCH_IDS.before, '2017-05-24T00:25:12Z'), scene(otherBefore, '2017-05-24T00:25:12Z')], totalCount: 2, truncated: false },
    flood: { scenes: [scene(RESEARCH_IDS.later, '2017-05-30T00:24:30Z')], totalCount: 1, truncated: false },
  } };
  const pairs: SarPairs = { success: true, candidatePairs: [RESEARCH_IDS.before, otherBefore].map(before => ({ beforeSceneId: before, duringSceneId: RESEARCH_IDS.later, status: 'suitable', reasons: [], jointCoveragePercent: 94, gapDays: 6 })), rejectedPairs: [], summary: { incomplete: false }, message: 'Synthetic compatible metadata; not flood validation.' };
  const layer = (stage: string): SarLayer => ({ label: stage, tileUrl: `https://earthengine.googleapis.com/v1/projects/example/maps/${clock}-${stage}/tiles/{z}/{x}/{y}`, visualization: { min: 1, max: 1, palette: ['ff4fd8'] }, units: 'experimental response', mask: 'Unclassified transparent remainder' });
  const preview = (before = RESEARCH_IDS.before, later = RESEARCH_IDS.later): SarPreview => ({ success: true, generatedAt: new Date(clock).toISOString(), renewAfterSeconds: 600,
    layers: { before: layer('before'), later: layer('later'), change: layer('change') }, limitation: 'Unvalidated', quality: {
      scenes: { before: { ...discovery.periods.before.scenes[0], sceneId: before, footprintCoveragePercent: 95, validPixelCoveragePercent: 90 }, later: { ...discovery.periods.flood.scenes[0], sceneId: later, footprintCoveragePercent: 95, validPixelCoveragePercent: 90 } },
      studyArea: { center: [80, 6.9], rasterAreaKm2: 10 }, common: { validPixelAreaKm2: 9, validPixelCoveragePercent: 90, jointFootprintCoveragePercent: 94 },
      alignment: { sameNativeGrid: false, caveat: 'Synthetic alignment caveat' }, limitation: 'Unvalidated', samples: [{ geometry: { coordinates: [80, 6.9] } }],
    } });
  type Dependencies = NonNullable<Parameters<typeof createSarWorkflow>[0]>;
  const dependencies: Dependencies = { now: () => clock, execute: executeAnalysis,
    discover: async () => { calls.discover++; return { scenes: discovery, pairs }; },
    preview: async (before, later) => { calls.preview++; return preview(before, later); },
    analyze: async (before, later, _signal, filters, referenceMethod) => {
      calls.analyze++;
      const rawLayer = layer('raw');
      const result: SarAnalysis = { success: true, sceneIds: { before, later }, generatedAt: new Date(clock).toISOString(), renewAfterSeconds: 600, label: 'Experimental SAR-Derived Flood Candidates — Unvalidated', layer: rawLayer,
        layers: { raw: rawLayer, terrain: layer('terrain'), final: layer('final') }, candidateCoordinates: [[80, 6.9]], supportWarning: 'Restricted support, not AOI-wide flood extent.',
        areas: { validAnalysisAreaKm2: 8, candidateAreaKm2: 1, candidatePercentOfValid: 12.5, excludedPermanentWaterAreaKm2: 1, missingSarAreaKm2: 1, ancillaryUnknownAreaKm2: 0.5, smoothingEdgeExcludedAreaKm2: 0.5, eligibleNonPermanentAreaKm2: 7 },
        methodology: { summary: 'Synthetic unvalidated test response', waterReferenceYear: 2016 }, limitations: ['Unvalidated'],
        filtering: { version: 'sar-filtering-v1', configuration: filters || { terrainFilter: 'none', maxSlopeDegrees: null, clusterFilter: 'none', minConnectedPixels: null }, referenceMethod: referenceMethod || 'yearly-conservative-v1',
          rawCandidateAreaKm2: 1, afterSlopeAreaKm2: 1, finalCandidateAreaKm2: 1, slopeExcludedAreaKm2: 0, clusterRemovedAreaKm2: 0, clusterRemovedPixels: 0,
          terrainNoDataCandidateAreaKm2: null, terrainNoDataSupportAreaKm2: null, commonSarSupportAreaKm2: 9, referenceValidSupportAreaKm2: 8 },
      }; return result;
    },
    checkTile: async layer => { calls.tiles.push(layer.tileUrl); },
  };
  const store = createSarWorkflow(dependencies);
  const ready = async () => { await store.discover(); await store.loadPreview(); };
  const complete = async () => { await ready(); await store.runAnalysis(); };
  return { store, dependencies, calls, discovery, pairs, preview, ready, complete, advance: (ms: number) => { clock += ms; store.tick(); } };
}

test('all five separate SAR routes follow the native stack and Android Back returns one step at a time', () => {
  const names = SAR_STEPS.map(s => s.name);
  assert.deepEqual(names, ['DiscoverImages', 'SelectImagePair', 'SarMap', 'AnalysisSetup', 'AnalysisResults']);
  const router = StackRouter({ initialRouteName: names[0] }), options = { routeNames: names, routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  for (const name of names.slice(1)) { state = router.getRehydratedState(router.getStateForAction(state, CommonActions.navigate(name), options)!, options); assert.equal(state.routes[state.index].name, name); }
  for (const name of [...names].reverse().slice(1)) { state = router.getRehydratedState(router.getStateForAction(state, CommonActions.goBack(), options)!, options); assert.equal(state.routes[state.index].name, name); }
  assert.equal(router.getStateForAction(state, CommonActions.goBack(), options), null, 'Back on first nested route bubbles to the parent');
  const root = StackRouter({ initialRouteName: 'Home' }), rootOptions = { routeNames: ['Home', 'Function1', 'Function2'], routeParamList: {}, routeGetIdList: {} };
  const entered = root.getRehydratedState(root.getStateForAction(root.getInitialState(rootOptions), CommonActions.navigate('Function2'), rootOptions)!, rootOptions);
  assert.equal(root.getStateForAction(entered, CommonActions.goBack(), rootOptions)!.routes[0].name, 'Home');
});
test('rerun/change filters pop to Setup without duplicating routes in the Android history', () => {
  const names = SAR_STEPS.map(s => s.name), router = StackRouter({}), options = { routeNames: names, routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  for (const name of names.slice(1)) state = router.getRehydratedState(router.getStateForAction(state, CommonActions.navigate(name), options)!, options);
  state = router.getRehydratedState(router.getStateForAction(state, StackActions.popTo('AnalysisSetup'), options)!, options);
  state = router.getRehydratedState(router.getStateForAction(state, CommonActions.navigate('AnalysisResults'), options)!, options);
  assert.deepEqual(state.routes.map(r => r.name), names);
});
test('prerequisites give explicit messages and allow only appropriate next steps', async () => {
  const h = fixture();
  assert.equal(routePrerequisite('DiscoverImages', h.store.getSnapshot()), null);
  assert.match(routePrerequisite('SelectImagePair', h.store.getSnapshot())!, /Find real/);
  await h.store.discover();
  assert.equal(supportsSelectedPair(h.store.getSnapshot()), true);
  assert.equal(routePrerequisite('SarMap', h.store.getSnapshot()), null);
  assert.match(routePrerequisite('AnalysisSetup', h.store.getSnapshot())!, /Load live/);
  await h.store.loadPreview();
  assert.equal(routePrerequisite('AnalysisSetup', h.store.getSnapshot()), null);
  assert.match(routePrerequisite('AnalysisResults', h.store.getSnapshot())!, /Run analysis/);
  await h.store.runAnalysis(); assert.equal(routePrerequisite('AnalysisResults', h.store.getSnapshot()), null);
});
test('scene metadata, selections, settings, results, overlay and map viewport survive screen unsubscribe/remount', async () => {
  const h = fixture(); await h.complete();
  h.store.setCandidateStage('final'); h.store.setPreviewStage('change');
  const region = { latitude: 6.9, longitude: 80, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  h.store.setRegion('candidates', region);
  let notified = 0; const unsubscribe = h.store.subscribe(() => { notified++; });
  const saved = h.store.getSnapshot(); unsubscribe();
  const remounted = h.store.subscribe(() => { notified++; });
  assert.equal(h.store.getSnapshot(), saved); assert.equal(saved.candidateStage, 'final'); assert.equal(saved.previewStage, 'change'); assert.equal(saved.candidateRegion, region);
  assert.ok(saved.discovery && saved.pairs && saved.preview && saved.analysis); assert.deepEqual(saved.filters, INITIAL_FILTERS);
  h.store.setCandidateStage('terrain'); assert.equal(notified, 1); remounted(); h.store.dispose();
});
test('date changes invalidate discovery and downstream data, retaining filters and reference; unchanged dates preserve results', async () => {
  const h = fixture(); await h.complete(); const saved = h.store.getSnapshot();
  h.store.setDates({ ...RESEARCH_DATES }); assert.equal(h.store.getSnapshot(), saved);
  h.store.setFilters({ ...INITIAL_FILTERS, slopeEnabled: true }); h.store.setReference('yearly-monthly-dry-v1');
  h.store.setDates({ ...RESEARCH_DATES, beforeStart: '2017-05-19' });
  const s = h.store.getSnapshot();
  assert.equal(s.discovery, null); assert.equal(s.pairs, null); assert.equal(s.before, ''); assert.equal(s.preview, null); assert.equal(s.analysis, null);
  assert.equal(s.filters.slopeEnabled, true); assert.equal(s.referenceMethod, 'yearly-monthly-dry-v1');
});
test('changing a selected scene keeps discovery/compatibility evidence and invalidates only preview/analysis', async () => {
  const h = fixture(); await h.complete(); const saved = h.store.getSnapshot();
  h.store.selectScene('before', saved.before); assert.equal(h.store.getSnapshot(), saved);
  h.store.selectScene('before', otherBefore);
  const s = h.store.getSnapshot(); assert.equal(s.discovery, saved.discovery); assert.equal(s.pairs, saved.pairs); assert.equal(s.preview, null); assert.equal(s.analysis, null);
  assert.equal(s.later, saved.later); assert.equal(supportsSelectedPair(s), true); assert.equal(s.candidateRegion, null);
});
test('changing filters/reference invalidates analysis and retains dates, discovery, pair selection and preview', async () => {
  const h = fixture(); await h.complete(); const original = h.store.getSnapshot();
  h.store.setFilters({ ...original.filters }); assert.equal(h.store.getSnapshot(), original);
  h.store.setFilters({ ...original.filters, clusterEnabled: true });
  let s = h.store.getSnapshot(); assert.equal(s.analysis, null); assert.equal(s.preview, original.preview); assert.equal(s.discovery, original.discovery); assert.equal(s.before, original.before);
  await h.store.runAnalysis(); h.store.setReference('yearly-monthly-dry-v1');
  s = h.store.getSnapshot(); assert.equal(s.analysis, null); assert.equal(s.preview, original.preview); assert.equal(s.phase, 'idle');
});
test('discovery retry with unchanged pair and preview tile renewal keep existing areas and selected overlay', async () => {
  const h = fixture(); await h.complete(); h.store.setCandidateStage('final');
  const data = h.store.getSnapshot().analysis;
  await h.store.discover(); assert.equal(h.store.getSnapshot().analysis, data);
  h.advance(600001); await h.store.loadPreview();
  assert.equal(h.store.getSnapshot().analysis, data); assert.equal(h.store.getSnapshot().candidateStage, 'final'); assert.equal(h.calls.analyze, 1);
});
test('Run Analysis reports elapsed pending state and automatically offers Results once areas arrive, before tile checks finish', async () => {
  const h = fixture(); await h.ready();
  const original = h.dependencies.analyze, response = await original(RESEARCH_IDS.before, RESEARCH_IDS.later);
  const request = deferred<SarAnalysis>(), tiles = deferred<void>();
  h.dependencies.analyze = async () => request.promise; h.dependencies.checkTile = async () => tiles.promise;
  const work = h.store.runAnalysis();
  assert.equal(h.store.getSnapshot().phase, 'running'); assert.equal(h.store.getSnapshot().busy, 'analysis');
  h.advance(3000); assert.equal(h.store.getSnapshot().now - h.store.getSnapshot().startedAt!, 3000);
  request.resolve(response); await new Promise(resolve => setImmediate(resolve));
  let s = h.store.getSnapshot(); assert.equal(s.analysis, response); assert.equal(s.phase, 'tiles');
  assert.equal(resultsDestination(s, 'SarMap'), null, 'A worker must not move a user who navigated back');
  assert.equal(resultsDestination(s, 'AnalysisSetup'), 'AnalysisResults');
  h.store.acknowledgeResults(); assert.equal(resultsDestination(h.store.getSnapshot(), 'AnalysisSetup'), null, 'Back from Results does not push it again');
  tiles.resolve(); await work; s = h.store.getSnapshot(); assert.equal(s.phase, 'success'); assert.equal(s.busy, null);
});
test('request failure stays on Setup, and a retry succeeds without changing discovery or preview', async () => {
  const h = fixture(); await h.ready(); const preview = h.store.getSnapshot().preview, original = h.dependencies.analyze;
  h.dependencies.analyze = async () => { throw Error('Backend returned HTTP 503.'); };
  await h.store.runAnalysis();
  let s = h.store.getSnapshot(); assert.equal(s.phase, 'error'); assert.match(s.errors.analysis, /HTTP 503/); assert.equal(s.analysis, null); assert.equal(s.busy, null); assert.equal(resultsDestination(s, 'AnalysisSetup'), null);
  h.dependencies.analyze = original; await h.store.runAnalysis(); s = h.store.getSnapshot();
  assert.equal(s.phase, 'success'); assert.equal(s.errors.analysis, ''); assert.equal(s.preview, preview); assert.equal(resultsDestination(s, 'AnalysisSetup'), 'AnalysisResults');
});
test('missing prerequisites or invalid filter inputs show errors without invoking analysis', async () => {
  const h = fixture(); await h.store.runAnalysis(); assert.match(h.store.getSnapshot().errors.analysis, /Select both/); assert.equal(h.calls.analyze, 0);
  await h.ready(); h.store.setFilters({ ...INITIAL_FILTERS, slopeEnabled: true, maxSlopeDegrees: '' }); await h.store.runAnalysis();
  assert.match(h.store.getSnapshot().errors.analysis, /degrees/); assert.equal(h.calls.analyze, 0); assert.equal(h.store.getSnapshot().busy, null);
});
test('tile failures retain areas, distinguish stage errors, and support retry without recomputing analysis', async () => {
  const h = fixture(); await h.ready();
  h.dependencies.checkTile = async layer => { if (layer.label === 'final') throw Error('Final PNG unavailable'); };
  await h.store.runAnalysis(); let s = h.store.getSnapshot();
  assert.equal(s.phase, 'tile-error'); assert.ok(s.analysis); assert.equal(s.candidateTiles.raw.status, 'ready'); assert.equal(s.candidateTiles.final.status, 'error');
  assert.equal(resultsDestination(s, 'AnalysisSetup'), 'AnalysisResults');
  h.store.setCandidateStage('final'); h.dependencies.checkTile = async () => {}; await h.store.checkTiles('candidates');
  s = h.store.getSnapshot(); assert.equal(s.candidateTiles.final.status, 'ready'); assert.equal(h.calls.analyze, 1); assert.equal(s.candidateStage, 'final');
  assert.equal(s.phase, 'success'); assert.equal(s.errors.analysis, '', 'A successful tile retry clears the obsolete warning');
});
test('preview tiles expose per-layer loading/error states and retry retains the same preview metadata', async () => {
  const h = fixture(); await h.store.discover(); h.dependencies.checkTile = async layer => { if (layer.label === 'change') throw Error('Change tile unavailable'); };
  await h.store.loadPreview(); const preview = h.store.getSnapshot().preview;
  assert.ok(preview); assert.equal(h.store.getSnapshot().previewTiles.change.status, 'error'); assert.equal(h.store.getSnapshot().previewTiles.before.status, 'ready');
  h.dependencies.checkTile = async () => {}; await h.store.checkTiles('preview');
  assert.equal(h.store.getSnapshot().preview, preview); assert.equal(h.store.getSnapshot().previewTiles.change.status, 'ready');
});
test('expired sessions retain results, explain the prerequisite and renew preview/candidate tiles using existing API', async () => {
  const h = fixture(); await h.complete(); h.store.setCandidateStage('final'); const prior = h.store.getSnapshot().analysis;
  h.advance(600001); let s = h.store.getSnapshot();
  assert.equal(sessionExpired(s.preview, s.now), true); assert.equal(sessionExpired(s.analysis, s.now), true); assert.match(setupPrerequisite(s)!, /expired/); assert.equal(s.analysis, prior);
  await h.store.renewCandidateTiles(); s = h.store.getSnapshot();
  assert.equal(sessionExpired(s.preview, s.now), false); assert.equal(sessionExpired(s.analysis, s.now), false); assert.equal(s.candidateStage, 'final'); assert.equal(h.calls.analyze, 2);
});
test('late discovery and analysis responses cannot restore data invalidated by newer dates or filters', async () => {
  const h = fixture(), response = deferred<{ scenes: SarDiscovery; pairs: SarPairs }>();
  h.dependencies.discover = async () => response.promise;
  const finding = h.store.discover(); h.store.setDates({ ...RESEARCH_DATES, beforeStart: '2017-05-19' });
  response.resolve({ scenes: h.discovery, pairs: h.pairs }); await finding;
  assert.equal(h.store.getSnapshot().discovery, null); assert.equal(h.store.getSnapshot().busy, null);
  const next = fixture(); await next.ready(); const result = await next.dependencies.analyze(RESEARCH_IDS.before, RESEARCH_IDS.later), pending = deferred<SarAnalysis>();
  next.dependencies.analyze = async () => pending.promise;
  const running = next.store.runAnalysis(); next.store.setFilters({ ...INITIAL_FILTERS, clusterEnabled: true }); pending.resolve(result); await running;
  assert.equal(next.store.getSnapshot().analysis, null); assert.equal(next.store.getSnapshot().resultsPending, false); assert.equal(next.store.getSnapshot().phase, 'idle');
});
test('changing only filters does not cancel a pending valid preview request', async () => {
  const h = fixture(); await h.store.discover(); const pending = deferred<SarPreview>(); h.dependencies.preview = async () => pending.promise;
  const loading = h.store.loadPreview(); h.store.setFilters({ ...INITIAL_FILTERS, slopeEnabled: true });
  assert.equal(h.store.getSnapshot().busy, 'preview'); pending.resolve(h.preview()); await loading;
  assert.ok(h.store.getSnapshot().preview); assert.equal(h.store.getSnapshot().filters.slopeEnabled, true);
});

test('empty discovery and unsupported scene metadata cannot advance to the map', async () => {
  const h = fixture();
  h.discovery.periods.before.scenes = []; h.discovery.periods.before.totalCount = 0; h.pairs.candidatePairs = [];
  await h.store.discover();
  assert.match(routePrerequisite('SelectImagePair', h.store.getSnapshot())!, /No scenes/);
  assert.equal(await h.store.loadPreview(), false); assert.equal(h.calls.preview, 0);
  const unsupported = fixture(); unsupported.discovery.periods.before.scenes[0].timestampWarning = 'Timestamp mismatch';
  await unsupported.store.discover(); assert.equal(supportsSelectedPair(unsupported.store.getSnapshot()), false);
  assert.match(routePrerequisite('SarMap', unsupported.store.getSnapshot())!, /compatible/);
});
test('both references and current experimental controls reach the existing analysis API; overlay changes never recompute', async () => {
  const h = fixture(); await h.ready();
  h.store.setFilters({ ...INITIAL_FILTERS, slopeEnabled: true, clusterEnabled: true });
  for (const method of ['yearly-conservative-v1', 'yearly-monthly-dry-v1'] as const) {
    h.store.setReference(method); await h.store.runAnalysis();
    const result = h.store.getSnapshot().analysis!;
    assert.equal(result.filtering?.referenceMethod, method);
    assert.deepEqual(result.filtering?.configuration, { terrainFilter: 'slope-v1', maxSlopeDegrees: 5, clusterFilter: 'connected-v1', minConnectedPixels: 8 });
    assert.deepEqual(Object.values(h.store.getSnapshot().candidateTiles).map(t => t.status), ['ready', 'ready', 'ready']);
  }
  const calls = h.calls.analyze;
  for (const stage of ['raw', 'terrain', 'final'] as const) { h.store.setCandidateStage(stage); assert.equal(h.store.getSnapshot().candidateStage, stage); }
  assert.equal(h.calls.analyze, calls);
});
test('an ongoing analysis outlives screen subscriptions and retains its elapsed start time', async () => {
  const h = fixture(); await h.ready();
  const response = await h.dependencies.analyze(RESEARCH_IDS.before, RESEARCH_IDS.later), request = deferred<SarAnalysis>();
  h.dependencies.analyze = async () => request.promise;
  const unsubscribe = h.store.subscribe(() => {}), work = h.store.runAnalysis();
  const startedAt = h.store.getSnapshot().startedAt;
  unsubscribe(); h.advance(7000);
  assert.equal(h.store.getSnapshot().startedAt, startedAt); assert.equal(h.store.getSnapshot().busy, 'analysis');
  const remount = h.store.subscribe(() => {}); request.resolve(response); await work;
  assert.equal(h.store.getSnapshot().analysis, response); assert.equal(resultsDestination(h.store.getSnapshot(), 'AnalysisSetup'), 'AnalysisResults'); remount();
});
test('failed renewal preserves prior areas and overlay while exposing the provider error', async () => {
  const h = fixture(); await h.complete(); h.store.setCandidateStage('terrain'); const original = h.store.getSnapshot().analysis;
  h.advance(600001); h.dependencies.analyze = async () => { throw Error('Backend returned HTTP 504.'); };
  await h.store.renewCandidateTiles();
  const s = h.store.getSnapshot(); assert.equal(s.analysis, original); assert.equal(s.candidateStage, 'terrain'); assert.match(s.errors.analysis, /HTTP 504/); assert.equal(s.busy, null);
});

test('late original analysis tile failures cannot overwrite a successful tile-only retry', async () => {
  const h = fixture(); await h.ready();
  const pending = [deferred<void>(), deferred<void>()], signals: AbortSignal[] = [];
  h.dependencies.checkTile = async (layer, _point, signal) => {
    signals.push(signal!);
    if (layer.label === 'raw') throw Error('Original raw failure');
    await pending[layer.label === 'terrain' ? 0 : 1].promise;
  };
  await h.store.runAnalysis(); const areas = h.store.getSnapshot().analysis;
  assert.equal(h.store.getSnapshot().phase, 'tile-error');
  h.dependencies.checkTile = async () => {};
  await h.store.checkTiles('candidates');
  assert.ok(signals.every(s => s.aborted), 'Retry cancels every original stage check');
  pending.forEach(p => p.reject(Error('Late original failure')));
  await new Promise(resolve => setImmediate(resolve));
  const state = h.store.getSnapshot();
  assert.ok(Object.values(state.candidateTiles).every(t => t.status === 'ready'));
  assert.equal(state.phase, 'success'); assert.equal(state.errors.analysis, ''); assert.equal(state.analysis, areas);
  assert.equal(h.calls.analyze, 1);
});

test('late original tile successes cannot clear the active retry failure', async () => {
  const h = fixture(); await h.ready(); const pending = deferred<void>();
  h.dependencies.checkTile = async layer => { if (layer.label === 'raw') throw Error('Old raw failure'); await pending.promise; };
  await h.store.runAnalysis();
  h.dependencies.checkTile = async () => { throw Error('Active retry failure'); };
  await h.store.checkTiles('candidates');
  pending.resolve(); await new Promise(resolve => setImmediate(resolve));
  const state = h.store.getSnapshot();
  assert.ok(Object.values(state.candidateTiles).every(t => t.status === 'error' && t.error === 'Active retry failure'));
  assert.equal(state.phase, 'tile-error'); assert.equal(state.errors.analysis, 'Active retry failure');
});

test('overlapping candidate retries publish only the newest generation', async () => {
  const h = fixture(); await h.complete(); const old = deferred<void>();
  const signals: AbortSignal[] = [];
  h.dependencies.checkTile = async (_layer, _point, signal) => { signals.push(signal!); await old.promise; };
  const previous = h.store.checkTiles('candidates');
  h.dependencies.checkTile = async () => {};
  await h.store.checkTiles('candidates'); const latest = h.store.getSnapshot();
  old.reject(Error('Superseded retry')); await previous;
  assert.ok(signals.every(s => s.aborted)); assert.equal(h.store.getSnapshot(), latest);
});

test('preview renewal invalidates old tile checks before the replacement request completes', async () => {
  const h = fixture(); await h.ready(); const old = deferred<void>(), response = deferred<SarPreview>();
  const signals: AbortSignal[] = [];
  h.dependencies.checkTile = async (_layer, _point, signal) => { signals.push(signal!); await old.promise; };
  const checks = h.store.checkTiles('preview');
  h.dependencies.preview = async () => response.promise;
  const renewal = h.store.loadPreview();
  assert.ok(signals.every(s => s.aborted));
  old.reject(Error('Old preview failure')); await checks;
  assert.ok(Object.values(h.store.getSnapshot().previewTiles).every(t => t.status === 'idle'));
  h.dependencies.checkTile = async () => {};
  response.resolve(h.preview()); await renewal;
  assert.ok(Object.values(h.store.getSnapshot().previewTiles).every(t => t.status === 'ready'));
});

test('provider teardown cancels pending tile checks and prevents later state publication or work', async () => {
  const h = fixture(); await h.ready(); const pending = deferred<void>();
  const signals: AbortSignal[] = [];
  h.dependencies.checkTile = async (_layer, _point, signal) => { signals.push(signal!); await pending.promise; };
  let notifications = 0; h.store.subscribe(() => { notifications++; });
  const work = h.store.runAnalysis();
  await new Promise(resolve => setImmediate(resolve));
  h.store.dispose(); const snapshot = h.store.getSnapshot(), count = notifications, calls = h.calls.analyze;
  pending.reject(Error('Completed after teardown')); await work;
  await h.store.runAnalysis(); await h.store.checkTiles('candidates'); h.store.tick();
  assert.ok(signals.every(s => s.aborted)); assert.equal(h.store.getSnapshot(), snapshot);
  assert.equal(notifications, count); assert.equal(h.calls.analyze, calls);
});

test('scene or filter invalidation cancels pending candidate tile generations', async () => {
  for (const invalidate of [(h: ReturnType<typeof fixture>) => h.store.selectScene('before', otherBefore),
    (h: ReturnType<typeof fixture>) => h.store.setFilters({ ...INITIAL_FILTERS, slopeEnabled: true })]) {
    const h = fixture(); await h.complete(); const pending = deferred<void>(), signals: AbortSignal[] = [];
    h.dependencies.checkTile = async (_layer, _point, signal) => { signals.push(signal!); await pending.promise; };
    const checks = h.store.checkTiles('candidates'); invalidate(h); const snapshot = h.store.getSnapshot();
    pending.resolve(); await checks;
    assert.ok(signals.every(s => s.aborted)); assert.equal(h.store.getSnapshot(), snapshot); assert.equal(snapshot.analysis, null);
  }
});
