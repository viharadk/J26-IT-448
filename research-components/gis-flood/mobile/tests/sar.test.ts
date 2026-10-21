import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSarTile, discoveryQuery, parseAnalysis, parseDiscovery, parsePreview, RESEARCH_DATES, RESEARCH_IDS, selectedPair, selectionQuery, validateLayer } from '../src/api/sar';
import { analysisQuery, analyzeSar, candidateLayer, filtersFromDraft, INITIAL_FILTERS, SarAnalysis } from '../src/api/sar';
import { api } from '../src/api/client';
import { responseReferenceMethod } from '../src/api/sar';
import { coverageRows } from '../src/sar/resultPresentation';
import { AnalysisContext, AnalysisPhase, analysisPrerequisite, executeAnalysis } from '../src/sar/analysisRun';

test('analysis query retains enabled filters and optional reference using the installed Expo native URLSearchParams', () => {
  // Expo 53 installs this implementation; it supports set/toString but has no
  // size getter. Node's global URLSearchParams previously hid this native bug.
  const ExpoSearchParams = require('whatwg-url-without-unicode').URLSearchParams;
  const previous = globalThis.URLSearchParams;
  globalThis.URLSearchParams = ExpoSearchParams;
  try {
    const filters = filtersFromDraft({ ...INITIAL_FILTERS, slopeEnabled: true, clusterEnabled: true });
    for (const method of ['yearly-conservative-v1', 'yearly-monthly-dry-v1'] as const) {
      const query = analysisQuery(RESEARCH_IDS.before, RESEARCH_IDS.later, filters, method);
      assert.match(query, /terrainFilter=slope-v1/); assert.match(query, /maxSlopeDegrees=5/);
      assert.match(query, /clusterFilter=connected-v1/); assert.match(query, /minConnectedPixels=8/);
      if (method === 'yearly-monthly-dry-v1') assert.match(query, /referenceMethod=yearly-monthly-dry-v1/);
    }
    assert.equal(analysisQuery(RESEARCH_IDS.before, RESEARCH_IDS.later), selectionQuery(RESEARCH_IDS.before, RESEARCH_IDS.later));
  } finally { globalThis.URLSearchParams = previous; }
});

test('native analysis request reaches response validation with the requested filters instead of unfiltered defaults', async () => {
  const previousParams = globalThis.URLSearchParams, previousGet = api.get;
  globalThis.URLSearchParams = require('whatwg-url-without-unicode').URLSearchParams;
  const filters = filtersFromDraft({ ...INITIAL_FILTERS, slopeEnabled: true, clusterEnabled: true });
  const requested: string[] = [];
  api.get = async path => {
    requested.push(path);
    const result = filteredResult();
    // Mirror the backend's conservative unfiltered fallback if optional query
    // parameters disappear. Before the fix, analyzeSar rejected this response.
    if (!path.includes('terrainFilter=slope-v1')) return { ...result, filtering: undefined, layers: undefined };
    return result;
  };
  try {
    const result = await analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, undefined, filters);
    assert.equal(result.filtering?.configuration.maxSlopeDegrees, 5); assert.equal(result.filtering?.configuration.minConnectedPixels, 8);
    assert.match(requested[0], /clusterFilter=connected-v1/);
  } finally { globalThis.URLSearchParams = previousParams; api.get = previousGet; }
});

test('custom years and exclusive date windows are validated without hardcoding the example', () => {
  assert.match(discoveryQuery(RESEARCH_DATES), /beforeStart=2017-05-20/);
  assert.match(discoveryQuery({ beforeStart: '2020-05-01', beforeEnd: '2020-05-15', floodStart: '2020-05-15', floodEnd: '2020-06-01' }), /2020-05-01/);
  for (const dates of [
    { ...RESEARCH_DATES, beforeStart: '2017-02-30' }, { ...RESEARCH_DATES, floodEnd: '2017-05-26' },
    { ...RESEARCH_DATES, beforeEnd: '2017-05-27' }, { ...RESEARCH_DATES, beforeStart: '2016-01-01' },
  ]) assert.throws(() => discoveryQuery(dates));
});
test('scene lists distinguish empty results from malformed results and preserve timestamp warnings', () => {
  const period = { scenes: [], totalCount: 0, truncated: false };
  const response = { success: true, periods: { before: period, flood: period } };
  assert.equal(parseDiscovery(response).periods.before.totalCount, 0);
  assert.throws(() => parseDiscovery({ ...response, periods: { before: period } }));
  const scene = { sceneId: RESEARCH_IDS.before, acquiredAt: '2017-05-24T00:25:12Z', polarizations: ['VV'], timestampWarning: 'conflict' };
  assert.equal(parseDiscovery({ success: true, periods: { before: { ...period, scenes: [scene] }, flood: period } }).periods.before.scenes[0].timestampWarning, 'conflict');
});
const layer = { tileUrl: 'https://earthengine.googleapis.com/v1/projects/example/maps/test/tiles/{z}/{x}/{y}', visualization: { min: -25, max: 0, palette: ['000000', 'ffffff'] } };
test('native tile layers require scoped HTTPS Earth Engine XYZ URLs and a usable legend', () => {
  assert.equal(validateLayer(layer).tileUrl, layer.tileUrl);
  for (const tileUrl of ['http://earthengine.googleapis.com/{z}/{x}/{y}', 'https://example.com/{z}/{x}/{y}', layer.tileUrl + '?access_token=secret', layer.tileUrl.replace('{z}', '11')]) assert.throws(() => validateLayer({ ...layer, tileUrl }));
  assert.throws(() => validateLayer({ ...layer, visualization: {} }));
});
test('a preview cannot be displayed for a stale pair or missing actual radar support', () => {
  const result = { success: true, generatedAt: new Date().toISOString(), renewAfterSeconds: 600, quality: {
    scenes: { before: { sceneId: RESEARCH_IDS.before }, later: { sceneId: RESEARCH_IDS.later } }, common: { validPixelAreaKm2: 10, validPixelCoveragePercent: 95 }, studyArea: { center: [80, 6.9] },
  }, layers: { before: layer, later: layer, change: layer } };
  assert.equal(parsePreview(result, RESEARCH_IDS.before, RESEARCH_IDS.later).success, true);
  assert.throws(() => parsePreview(result, RESEARCH_IDS.later, RESEARCH_IDS.before));
  assert.throws(() => parsePreview({ ...result, quality: { ...result.quality, common: { validPixelAreaKm2: 0 } } }, RESEARCH_IDS.before, RESEARCH_IDS.later));
});
test('selection encoding and pair lookup never substitute an unsupported combination', () => {
  assert.match(selectionQuery(RESEARCH_IDS.before, RESEARCH_IDS.later), /COPERNICUS%2FS1_GRD/);
  assert.equal(selectedPair(null, RESEARCH_IDS.before, RESEARCH_IDS.later), undefined);
  const pair = { beforeSceneId: RESEARCH_IDS.before, duringSceneId: RESEARCH_IDS.later, status: 'suitable', reasons: [], jointCoveragePercent: 93, gapDays: 6 };
  const pairs = { success: true as const, candidatePairs: [pair], rejectedPairs: [], summary: { incomplete: false }, message: '' };
  assert.equal(selectedPair(pairs, RESEARCH_IDS.before, RESEARCH_IDS.later), pair);
  assert.equal(selectedPair(pairs, RESEARCH_IDS.later, RESEARCH_IDS.before), undefined);
});
test('candidate output requires the exact unvalidated label, selected pair, finite support and correct subset denominator', () => {
  const result = { success: true, sceneIds: RESEARCH_IDS, label: 'Experimental SAR-Derived Flood Candidates — Unvalidated', layer,
    areas: { validAnalysisAreaKm2: 8, candidateAreaKm2: 1, candidatePercentOfValid: 12.5, excludedPermanentWaterAreaKm2: 3,
      missingSarAreaKm2: 39, ancillaryUnknownAreaKm2: 494, smoothingEdgeExcludedAreaKm2: 3, eligibleNonPermanentAreaKm2: 5 },
    limitations: ['Unvalidated'], supportWarning: 'Only a restricted subset.', candidateCoordinates: [[80, 6.9]] };
  assert.equal(parseAnalysis(result, RESEARCH_IDS.before, RESEARCH_IDS.later).areas.candidatePercentOfValid, 12.5);
  for (const bad of [{ ...result, label: 'Confirmed flood' }, { ...result, candidateCoordinates: [[Infinity, 7]] },
    { ...result, areas: { ...result.areas, candidatePercentOfValid: 50 } }, { ...result, sceneIds: { before: RESEARCH_IDS.later, later: RESEARCH_IDS.before } }]) assert.throws(() => parseAnalysis(bad, RESEARCH_IDS.before, RESEARCH_IDS.later));
});
test('device tile checks preserve XYZ order, detect expired sessions and forward cancellation', async () => {
  let url = '';
  await checkSarTile(layer as any, [80, 6.9], undefined, (async (input: string) => {
    url = input; return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'content-type': 'image/png' } });
  }) as typeof fetch);
  assert.match(url, /\/tiles\/12\/2958\/1969$/);
  await assert.rejects(checkSarTile(layer as any, [80, 6.9], undefined, (async () => new Response('expired', { status: 403 })) as typeof fetch), /refresh live maps/);
  const controller = new AbortController();
  const pending = checkSarTile(layer as any, [80, 6.9], controller.signal, ((_input, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(Error('cancelled'))))) as typeof fetch);
  controller.abort(); await assert.rejects(pending, /cancelled/);
});

test('experimental toggles start off with 5 degrees and 8 pixels; enable, edit and disable independently', () => {
  assert.deepEqual(INITIAL_FILTERS, { slopeEnabled: false, maxSlopeDegrees: '5', clusterEnabled: false, minConnectedPixels: '8' });
  const disabled = filtersFromDraft(INITIAL_FILTERS);
  assert.deepEqual(disabled, { terrainFilter: 'none', maxSlopeDegrees: null, clusterFilter: 'none', minConnectedPixels: null });
  assert.equal(analysisQuery(RESEARCH_IDS.before, RESEARCH_IDS.later, disabled), selectionQuery(RESEARCH_IDS.before, RESEARCH_IDS.later));
  let draft = { ...INITIAL_FILTERS, slopeEnabled: true };
  assert.equal(filtersFromDraft(draft).maxSlopeDegrees, 5);
  draft = { ...draft, maxSlopeDegrees: '3.5', clusterEnabled: true, minConnectedPixels: '12' };
  const enabled = filtersFromDraft(draft);
  const query = analysisQuery(RESEARCH_IDS.before, RESEARCH_IDS.later, enabled, 'yearly-monthly-dry-v1');
  assert.match(query, /referenceMethod=yearly-monthly-dry-v1/); assert.match(query, /terrainFilter=slope-v1/);
  assert.match(query, /maxSlopeDegrees=3.5/); assert.match(query, /clusterFilter=connected-v1/); assert.match(query, /minConnectedPixels=12/);
  assert.equal(filtersFromDraft({ ...draft, slopeEnabled: false }).maxSlopeDegrees, null);
  for (const maxSlopeDegrees of ['', '0', '46', 'NaN', '5e0', '-1']) assert.throws(() => filtersFromDraft({ ...draft, maxSlopeDegrees }));
  for (const minConnectedPixels of ['', '0', '129', '1.5']) assert.throws(() => filtersFromDraft({ ...draft, minConnectedPixels }));
  assert.doesNotThrow(() => filtersFromDraft({ ...INITIAL_FILTERS, maxSlopeDegrees: '', minConnectedPixels: '' }), 'Disabled inputs are not submitted');
});
function filteredResult() {
  return { success: true, sceneIds: RESEARCH_IDS, label: 'Experimental SAR-Derived Flood Candidates — Unvalidated', layer,
    layers: { raw: layer, terrain: { ...layer, tileUrl: layer.tileUrl.replace('/test/', '/slope/') }, final: { ...layer, tileUrl: layer.tileUrl.replace('/test/', '/final/') } },
    areas: { validAnalysisAreaKm2: 8, candidateAreaKm2: 1, candidatePercentOfValid: 12.5, excludedPermanentWaterAreaKm2: 3,
      missingSarAreaKm2: 39, ancillaryUnknownAreaKm2: 494, smoothingEdgeExcludedAreaKm2: 3, eligibleNonPermanentAreaKm2: 5 },
    limitations: ['Unvalidated'], supportWarning: 'Restricted subset.', candidateCoordinates: [],
    filtering: { version: 'sar-filtering-v1', referenceMethod: 'yearly-conservative-v1', configuration: { terrainFilter: 'slope-v1', maxSlopeDegrees: 5, clusterFilter: 'connected-v1', minConnectedPixels: 8 },
      rawCandidateAreaKm2: 1, afterSlopeAreaKm2: 0.7, finalCandidateAreaKm2: 0.5, slopeExcludedAreaKm2: 0.2, clusterRemovedAreaKm2: 0.2, clusterRemovedPixels: 1998,
      terrainNoDataCandidateAreaKm2: 0.1, terrainNoDataSupportAreaKm2: 0.3, commonSarSupportAreaKm2: 10, referenceValidSupportAreaKm2: 8 } };
}

test('reference identity verifies matching current metadata for both methods', async () => {
  const previous = api.get;
  try {
    for (const referenceMethod of ['yearly-conservative-v1', 'yearly-monthly-dry-v1'] as const) {
      const result = filteredResult();
      const response = { ...result, filtering: { ...result.filtering, referenceMethod },
        methodology: { referenceMethod, version: referenceMethod === 'yearly-conservative-v1' ? 'exploratory-v1' : 'exploratory-v2-monthly-dry', summary: 'Backend', waterReferenceYear: 2016 },
        waterReference: { method: referenceMethod } };
      api.get = async () => response;
      const verified = await analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, undefined, undefined, referenceMethod);
      assert.equal(responseReferenceMethod(verified), referenceMethod);
    }
  } finally { api.get = previous; }
});

test('missing or unsupported reference identity never inherits the requested method or default', async () => {
  const previous = api.get, base = { ...filteredResult(), filtering: undefined, layers: undefined };
  try {
    for (const referenceMethod of ['yearly-conservative-v1', 'yearly-monthly-dry-v1'] as const) {
      for (const metadata of [{}, { methodology: { version: 'unknown' } }, { methodology: { referenceMethod: null } }, { waterReference: { method: 'unknown' } }]) {
        api.get = async () => ({ ...base, ...metadata });
        await assert.rejects(analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, undefined, undefined, referenceMethod), /reference method.*(cannot be verified|metadata)|reference method cannot be verified/i);
      }
    }
  } finally { api.get = previous; }
});

test('conflicting reference claims are rejected even if one matches the request', async () => {
  const previous = api.get;
  try {
    for (const metadata of [{ methodology: { referenceMethod: 'yearly-monthly-dry-v1' } },
      { waterReference: { method: 'yearly-monthly-dry-v1' } }, { methodology: { version: 'exploratory-v2-monthly-dry' } }]) {
      api.get = async () => ({ ...filteredResult(), ...metadata });
      await assert.rejects(analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later), /Conflicting SAR reference method/);
    }
    api.get = async () => ({ ...filteredResult(), filtering: undefined, layers: undefined,
      methodology: { referenceMethod: 'yearly-conservative-v1' } });
    await assert.rejects(analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, undefined, filtersFromDraft(INITIAL_FILTERS), 'yearly-monthly-dry-v1'), /reference method does not match/);
  } finally { api.get = previous; }
});

test('legacy compatibility requires explicit identity or a recognized version and still enforces requested filters', async () => {
  const previous = api.get, base = { ...filteredResult(), filtering: undefined, layers: undefined };
  try {
    for (const method of ['yearly-conservative-v1', 'yearly-monthly-dry-v1'] as const) {
      for (const metadata of [{ methodology: { referenceMethod: method } }, { waterReference: { method } },
        { methodology: { version: method === 'yearly-conservative-v1' ? 'exploratory-v1' : 'exploratory-v2-monthly-dry' } }]) {
        api.get = async () => ({ ...base, ...metadata });
        const verified = await analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, undefined, filtersFromDraft(INITIAL_FILTERS), method);
        assert.equal(responseReferenceMethod(verified), method);
        await assert.rejects(analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, undefined,
          filtersFromDraft({ ...INITIAL_FILTERS, slopeEnabled: true }), method), /did not apply/);
      }
    }
    api.get = async () => ({ ...base, methodology: { version: 'exploratory-v1' } });
    await assert.rejects(analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, undefined, undefined, 'yearly-monthly-dry-v1'), /reference method does not match/);
  } finally { api.get = previous; }
});

test('displayed raw percentage retains its actual supported denominator and separates all area meanings', () => {
  const data = filteredResult(), rows = coverageRows(data), percent = rows.filter(row => row.unit === '%');
  assert.deepEqual(percent, [{ label: 'Raw candidate area / supported raw comparison area', value: 12.5, unit: '%' }]);
  assert.equal(rows.find(row => row.label === 'Supported raw comparison area')!.value, 8);
  assert.equal(rows.find(row => row.label === 'Historical-water unknown area')!.value, 494);
  assert.equal(rows.find(row => row.label === 'Missing / unobserved SAR area')!.value, 39);
  assert.notEqual(percent[0].value, data.filtering.finalCandidateAreaKm2 / data.areas.eligibleNonPermanentAreaKm2 * 100);
  assert.throws(() => parseAnalysis({ ...data, areas: { ...data.areas, candidatePercentOfValid: 20 } }, RESEARCH_IDS.before, RESEARCH_IDS.later), /inconsistent/);
  assert.equal(coverageRows({ areas: { ...data.areas, candidateAreaKm2: 0, candidatePercentOfValid: 0 } }).find(row => row.unit === '%')!.value, 0);
});
test('native response validates filter stages, no-data, version, reference and raw overlay compatibility', () => {
  const result = filteredResult();
  assert.equal(parseAnalysis(result, RESEARCH_IDS.before, RESEARCH_IDS.later).filtering?.finalCandidateAreaKm2, 0.5);
  for (const patch of [{ version: 'unknown' }, { referenceMethod: 'dry' }, { finalCandidateAreaKm2: 0.8 }, { slopeExcludedAreaKm2: -1 }, { terrainNoDataCandidateAreaKm2: null },
    { terrainNoDataSupportAreaKm2: 0 }, { clusterRemovedPixels: 1.5 }, { referenceValidSupportAreaKm2: 20 }, { configuration: { ...result.filtering.configuration, minConnectedPixels: 129 } }]) {
    assert.throws(() => parseAnalysis({ ...result, filtering: { ...result.filtering, ...patch } }, RESEARCH_IDS.before, RESEARCH_IDS.later));
  }
  assert.throws(() => parseAnalysis({ ...result, layers: { ...result.layers, final: {} } }, RESEARCH_IDS.before, RESEARCH_IDS.later));
  assert.throws(() => parseAnalysis({ ...result, layers: { ...result.layers, raw: result.layers.final } }, RESEARCH_IDS.before, RESEARCH_IDS.later));
  const noCandidates = { ...result, areas: { ...result.areas, candidateAreaKm2: 0, candidatePercentOfValid: 0 }, filtering: { ...result.filtering,
    rawCandidateAreaKm2: 0, afterSlopeAreaKm2: 0, finalCandidateAreaKm2: 0, slopeExcludedAreaKm2: 0, clusterRemovedAreaKm2: 0, clusterRemovedPixels: 0,
    terrainNoDataCandidateAreaKm2: 0, terrainNoDataSupportAreaKm2: 8 } };
  assert.equal(parseAnalysis(noCandidates, RESEARCH_IDS.before, RESEARCH_IDS.later).candidateCoordinates.length, 0);
});
test('native overlay selection retains raw and loads each stage URL, including transparent/no-candidate tiles', async () => {
  const result = parseAnalysis(filteredResult(), RESEARCH_IDS.before, RESEARCH_IDS.later), requested: string[] = [];
  for (const stage of ['raw', 'terrain', 'final'] as const) {
    const selected = candidateLayer(result, stage)!;
    assert.equal(selected, stage === 'raw' ? result.layer : result.layers![stage]);
    await checkSarTile(selected, [80, 6.9], undefined, (async (url: string) => { requested.push(url); return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'content-type': 'image/png' } }); }) as typeof fetch);
  }
  assert.equal(new Set(requested).size, 3); assert.equal(candidateLayer(null, 'final'), undefined);
  const legacy = { ...result, filtering: undefined, layers: undefined } as SarAnalysis;
  assert.equal(candidateLayer(legacy, 'raw'), legacy.layer); assert.equal(candidateLayer(legacy, 'final'), undefined);
  await assert.rejects(checkSarTile(result.layers!.final, [80, 6.9], undefined, (async () => new Response('expired', { status: 403 })) as typeof fetch), /refresh live maps/);
});

test('native run forwards current controls and rejects stale or silently ignored filter responses', async () => {
  const previous = api.get, controller = new AbortController();
  const config = filtersFromDraft({ ...INITIAL_FILTERS, slopeEnabled: true, clusterEnabled: true });
  let response: unknown = filteredResult(), requested = '';
  api.get = async (path, signal, timeout) => { requested = path; assert.equal(signal, controller.signal); assert.equal(timeout, 300000); return response; };
  try {
    await analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, controller.signal, config);
    assert.match(requested, /terrainFilter=slope-v1&maxSlopeDegrees=5&clusterFilter=connected-v1&minConnectedPixels=8/);
    const result = filteredResult(); response = { ...result, filtering: undefined, layers: undefined };
    await assert.rejects(analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, controller.signal, config), /did not apply/);
    response = { ...result, filtering: { ...result.filtering, configuration: { ...result.filtering.configuration, maxSlopeDegrees: 6 } } };
    await assert.rejects(analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, controller.signal, config), /did not apply/);
    response = filteredResult();
    await assert.rejects(analyzeSar(RESEARCH_IDS.before, RESEARCH_IDS.later, controller.signal, config, 'yearly-monthly-dry-v1'), /reference method does not match/);
  } finally { api.get = previous; }
});

function analysisContext(): AnalysisContext {
  return { ...RESEARCH_IDS, supported: true, expired: false,
    preview: parsePreview({ success: true, generatedAt: new Date().toISOString(), renewAfterSeconds: 600, quality: {
      scenes: { before: { sceneId: RESEARCH_IDS.before }, later: { sceneId: RESEARCH_IDS.later } },
      common: { validPixelAreaKm2: 10, validPixelCoveragePercent: 95 }, studyArea: { center: [80, 6.9] },
    }, layers: { before: layer, later: layer, change: layer } }, RESEARCH_IDS.before, RESEARCH_IDS.later) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function analysisHarness() {
  const phases: { phase: AnalysisPhase; detail?: string }[] = [], results: SarAnalysis[] = [];
  const controller = new AbortController();
  return { phases, results, options: { context: analysisContext(), filters: { ...INITIAL_FILTERS, slopeEnabled: true, clusterEnabled: true },
    referenceMethod: 'yearly-conservative-v1' as const, ticket: { signal: controller.signal, isCurrent: () => !controller.signal.aborted },
    onPhase: (phase: AnalysisPhase, detail?: string) => { phases.push({ phase, detail }); }, onResult: (result: SarAnalysis) => { results.push(result); } }, controller };
}
test('Run Analysis shows running before a pending request, reports received areas before tile checks, then completes', async () => {
  const h = analysisHarness(), request = deferred<SarAnalysis>(), tile = deferred<void>();
  const result = parseAnalysis(filteredResult(), RESEARCH_IDS.before, RESEARCH_IDS.later);
  let checks = 0;
  const work = executeAnalysis(h.options, {
    analyze: async (before, later, signal, filters, method) => {
      assert.equal(before, RESEARCH_IDS.before); assert.equal(later, RESEARCH_IDS.later); assert.equal(signal, h.options.ticket.signal);
      assert.equal(method, 'yearly-conservative-v1'); assert.equal(filters?.maxSlopeDegrees, 5); assert.equal(filters?.minConnectedPixels, 8);
      return request.promise;
    }, checkTile: async () => { checks++; return tile.promise; },
  });
  assert.deepEqual(h.phases, [{ phase: 'running', detail: undefined }]); assert.equal(h.results.length, 0);
  request.resolve(result); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.results[0], result); assert.equal(h.phases.at(-1)?.phase, 'tiles'); assert.equal(checks, 3);
  tile.resolve(); await work;
  assert.deepEqual(h.phases.map(p => p.phase), ['running', 'tiles', 'success']);
});
test('missing, mismatched or expired prerequisites explain the problem before making an analysis request', async () => {
  assert.equal(analysisPrerequisite(analysisContext()), null);
  for (const [patch, explanation] of [
    [{ before: '' }, /Select both/], [{ supported: false }, /compatible IW\/VV/], [{ preview: null }, /Load live/],
    [{ later: RESEARCH_IDS.before }, /this selected pair/], [{ expired: true }, /expired/],
  ] as [Partial<AnalysisContext>, RegExp][]) {
    const h = analysisHarness();
    await executeAnalysis({ ...h.options, context: { ...h.options.context, ...patch } }, {
      analyze: async () => { assert.fail('Prerequisites must stop network work'); }, checkTile: async () => assert.fail('No tile check'),
    });
    assert.equal(h.results.length, 0); assert.equal(h.phases.length, 1); assert.equal(h.phases[0].phase, 'error');
    assert.match(h.phases[0].detail!, explanation);
  }
});
test('invalid parameters and request failures become visible errors without inventing results', async () => {
  const invalid = analysisHarness();
  await executeAnalysis({ ...invalid.options, filters: { ...invalid.options.filters, maxSlopeDegrees: '' } }, {
    analyze: async () => assert.fail('Invalid filter should stop request'), checkTile: async () => assert.fail('No tile check'),
  });
  assert.equal(invalid.phases[0].phase, 'error'); assert.match(invalid.phases[0].detail!, /degrees from 1 to 45/);
  for (const detail of ['Backend returned HTTP 422.', 'Backend returned HTTP 503.', 'Cannot reach the backend.', 'Connection timed out.']) {
    const h = analysisHarness();
    await executeAnalysis(h.options, { analyze: async () => { throw Error(detail); }, checkTile: async () => assert.fail('No tile check') });
    assert.deepEqual(h.phases.map(p => p.phase), ['running', 'error']); assert.equal(h.phases.at(-1)?.detail, detail); assert.equal(h.results.length, 0);
  }
});
test('tile errors preserve completed area results and are distinguished from analysis request errors', async () => {
  const h = analysisHarness(), result = parseAnalysis(filteredResult(), RESEARCH_IDS.before, RESEARCH_IDS.later);
  await executeAnalysis(h.options, { analyze: async () => result, checkTile: async () => { throw Error('Cannot retrieve a live SAR tile on this device.'); } });
  assert.equal(h.results[0], result); assert.deepEqual(h.phases.map(p => p.phase), ['running', 'tiles', 'tile-error']);
  assert.match(h.phases.at(-1)?.detail!, /Cannot retrieve/);
});
test('empty candidate samples still check all stage tiles at the study-area center and complete', async () => {
  const h = analysisHarness(), result = parseAnalysis(filteredResult(), RESEARCH_IDS.before, RESEARCH_IDS.later), coordinates: unknown[] = [];
  result.candidateCoordinates = [];
  await executeAnalysis(h.options, { analyze: async () => result, checkTile: async (_layer, coordinate) => { coordinates.push(coordinate); } });
  assert.deepEqual(coordinates, [[80, 6.9], [80, 6.9], [80, 6.9]]); assert.equal(h.phases.at(-1)?.phase, 'success');
});
test('cancellation and stale responses cannot overwrite results or feedback after reset or selection changes', async () => {
  const result = parseAnalysis(filteredResult(), RESEARCH_IDS.before, RESEARCH_IDS.later);
  const h = analysisHarness(), request = deferred<SarAnalysis>();
  const work = executeAnalysis(h.options, { analyze: async () => request.promise, checkTile: async () => assert.fail('Stale result must not load tiles') });
  h.controller.abort(); request.resolve(result); await work;
  assert.equal(h.results.length, 0); assert.deepEqual(h.phases.map(p => p.phase), ['running']);
  const tiles = analysisHarness(), tile = deferred<void>();
  const loading = executeAnalysis(tiles.options, { analyze: async () => result, checkTile: async () => tile.promise });
  await new Promise(resolve => setImmediate(resolve)); tiles.controller.abort(); tile.resolve(); await loading;
  assert.deepEqual(tiles.phases.map(p => p.phase), ['running', 'tiles']);
});
