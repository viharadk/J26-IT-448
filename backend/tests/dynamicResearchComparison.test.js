const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseDynamicComparisonInput, projectDynamicComparison, createDynamicResearchComparisonService } = require('../services/dynamicResearchComparisonService');
const { createResearchRouter } = require('../routes/researchRoutes');
const { SCENES } = require('../services/sarPixelQuality');

const FILTERS = { terrainFilter: 'slope-v1', maxSlopeDegrees: 5, clusterFilter: 'connected-v1', minConnectedPixels: 8 };
const REQUEST = { beforeSceneId: SCENES.before, laterSceneId: SCENES.later, sourceReferenceMethod: 'yearly-conservative-v1', candidateStage: 'final', ...FILTERS };
const METHODS = ['yearly-conservative-v1', 'yearly-monthly-dry-v1'];
const STAGES = ['raw', 'terrain', 'final'];

function scenario(referenceMethod, domainKind, stage, zero = false) {
  const domain = domainKind === 'reference-specific-stage-shared' && referenceMethod === METHODS[1] ? 120 : 90;
  const areas = [domain * 0.1, domain * 0.2, domain * 0.3, domain * 0.4];
  const candidates = zero ? [0, 0, 0, 0] : areas.map((area, index) => area * [0, 0.1, 0.2, 0.3][index]);
  const candidate = candidates.reduce((a, b) => a + b, 0);
  const group = indexes => {
    const supported = indexes.reduce((sum, index) => sum + areas[index], 0), overlap = indexes.reduce((sum, index) => sum + candidates[index], 0);
    return { domainAreaKm2: supported, candidateAreaKm2: overlap, candidateRate: overlap / supported };
  };
  const lower = group([0, 1]), higher = group([2, 3]);
  return { referenceMethod, domainKind, stage, commonDomainAreaKm2: domain, candidateAreaKm2: candidate,
    rows: areas.map((area, index) => ({ code: index + 1, label: ['Low', 'Moderate', 'High', 'Very High'][index], domainAreaKm2: area,
      candidateAreaKm2: candidates[index], nonCandidateAreaKm2: area - candidates[index], candidatePercent: candidates[index] / area * 100 })),
    groupedComparison: { lower, higher, higherToLowerRateRatio: lower.candidateRate > 0 ? higher.candidateRate / lower.candidateRate : null },
    accounting: { passed: true }, estimability: zero ? 'No candidates.' : 'Area-based descriptive measures only.' };
}
function diagnostics(common) {
  return { rasterAoiAreaKm2: 150, commonDomainAreaKm2: common, accountingPassed: true, accountingToleranceM2: 1,
    exclusiveLossesKm2: { missingSar: 10, smoothingUnsupported: 5, ahpNoData: 2, ahpWorldCoverWaterExcluded: 3,
      ahpLandClassUnavailable: 1, ahpUnexpectedCode: 0, historicalUnknown: 4,
      historicalPermanentExcluded: 150 - common - 25, terrainUnknown: 0 } };
}
function execution(input = parseDynamicComparisonInput(REQUEST), { crossPlatform = true, zero = false } = {}) {
  return { status: 'completed', executedAt: '2026-10-21T10:00:00.000Z', question: 'Dynamic question',
    parameters: { sceneIds: input.selection, filters: input.filters, rawCandidateSettings: { laterWaterThresholdDb: -15 } },
    scenarios: ['reference-specific-stage-shared', 'identical-cross-reference'].flatMap(kind => METHODS.flatMap(method => STAGES.map(stage => scenario(method, kind, stage, zero)))),
    quality: { scenes: {
      before: { sceneId: input.selection.before, acquiredAt: '2017-05-24T00:25:12.000Z', platform: 'Sentinel-1A', orbitDirection: 'DESCENDING', relativeOrbitNumber: 19, instrumentMode: 'IW', polarizations: ['VV', 'VH'] },
      later: { sceneId: input.selection.later, acquiredAt: '2017-05-30T00:24:30.000Z', platform: crossPlatform ? 'Sentinel-1B' : 'Sentinel-1A', orbitDirection: 'DESCENDING', relativeOrbitNumber: 19, instrumentMode: 'IW', polarizations: ['VV', 'VH'] },
    }, common: { jointFootprintCoveragePercent: 98, validPixelAreaKm2: 140 }, alignment: { sameNativeGrid: false, caveat: 'Alignment is not independent registration evidence.' },
      pairAssessment: { status: 'suitable', reasons: ['Orbit, mode, resolution and VV are compatible.'] } },
    diagnostics: { [METHODS[0]]: diagnostics(90), [METHODS[1]]: diagnostics(120) },
    spatialMetadata: { basinIds: [1, 2, 3, 4], aoiVectorAreaKm2: 151 },
    methodology: { area: 'pixelArea', commonDomain: 'intersection', referenceDomain: 'separate plus matched', noData: 'never filled as observed' },
    ahp: { raster: 'landHazardClass', evaluation: '30 m then nearest-neighbor to SAR grid' }, caveats: ['Not validation.'] };
}

test('dynamic input is bounded to valid scenes, reference, stage and existing filters', () => {
  const parsed = parseDynamicComparisonInput(REQUEST);
  assert.deepEqual(parsed.selection, { before: SCENES.before, later: SCENES.later });
  assert.deepEqual(parsed.filters, FILTERS); assert.equal(parsed.candidateStage, 'final');
  for (const patch of [{ extra: true }, { beforeSceneId: 'bad' }, { candidateStage: 'candidate' }, { sourceReferenceMethod: 'unknown' }, { maxSlopeDegrees: 99 }]) {
    assert.throws(() => parseDynamicComparisonInput({ ...REQUEST, ...patch }));
  }
});

test('dynamic projection keeps native/matched denominators, area arithmetic, nullable ratios and provenance distinct from B1', () => {
  const input = parseDynamicComparisonInput(REQUEST), projected = projectDynamicComparison(execution(input), input);
  assert.equal(projected.kind, 'dynamic-ahp-sar-comparison'); assert.equal(projected.comparisonStatus, 'qualified');
  assert.equal(projected.provenance.executionMode, 'live-earth-engine'); assert.equal(projected.provenance.cachedHistoricalArtifact, false);
  assert.deepEqual(projected.scenarios.map(item => [item.referenceMethod, item.domainKind]), [
    [METHODS[0], 'native'], [METHODS[1], 'native'], [METHODS[0], 'matched'], [METHODS[1], 'matched']]);
  assert.equal(projected.scenarios[0].commonValidAreaKm2, 90); assert.equal(projected.scenarios[1].commonValidAreaKm2, 120);
  assert.equal(projected.scenarios[2].commonValidAreaKm2, projected.scenarios[3].commonValidAreaKm2);
  for (const item of projected.scenarios) {
    assert.ok(Math.abs(item.hazardClasses.reduce((sum, row) => sum + row.supportedAreaKm2, 0) - item.commonValidAreaKm2) < 1e-9);
    assert.ok(Math.abs(item.candidateRatePercent - item.candidateAreaKm2 / item.commonValidAreaKm2 * 100) < 1e-9);
  }
  const empty = projectDynamicComparison(execution(input, { zero: true, crossPlatform: false }), input);
  assert.equal(empty.scenarios[0].groupedCandidateRateRatio, null); assert.equal(empty.scenarios[0].candidateRatePercent, 0);
  assert.equal(empty.compatibility.status, 'comparable');
  const broken = execution(input); broken.scenarios.find(item => item.referenceMethod === METHODS[0] && item.domainKind === 'reference-specific-stage-shared' && item.stage === 'final').rows[0].candidateAreaKm2 += 1;
  assert.throws(() => projectDynamicComparison(broken, input), /class candidate total|class rate/);
});

test('dynamic jobs deduplicate active work, cache completed results, reject competing work and expose safe failures', async () => {
  let resolveRun, calls = 0, received;
  const service = createDynamicResearchComparisonService({ runnerFactory: progress => ({ run: input => {
    calls++; received = input; progress('Computing exact common domain.'); return new Promise(resolve => { resolveRun = resolve; });
  } }) });
  const first = service.start(REQUEST); assert.equal(first.status, 202); await new Promise(resolve => setImmediate(resolve));
  const duplicate = service.start(REQUEST); assert.equal(duplicate.body.cache.deduplicated, true); assert.equal(duplicate.body.job.id, first.body.job.id);
  assert.throws(() => service.start({ ...REQUEST, candidateStage: 'raw' }), error => error.status === 429);
  resolveRun(execution(parseDynamicComparisonInput(REQUEST))); await new Promise(resolve => setImmediate(resolve));
  const complete = service.get(first.body.job.id); assert.equal(complete.job.status, 'completed');
  assert.deepEqual(received.sceneIds, { before: SCENES.before, later: SCENES.later }); assert.deepEqual(received.filters, FILTERS);
  const cached = service.start(REQUEST); assert.equal(cached.status, 200); assert.equal(cached.body.cache.hit, true); assert.equal(calls, 1);

  const failed = createDynamicResearchComparisonService({ runnerFactory: () => ({ run: async () => { throw new Error('private_key secret'); } }) });
  const started = failed.start(REQUEST); await new Promise(resolve => setImmediate(resolve));
  const state = failed.get(started.body.job.id); assert.equal(state.job.status, 'failed');
  assert.equal(state.job.error.code, 'DYNAMIC_RESEARCH_COMPUTATION_FAILED'); assert.doesNotMatch(JSON.stringify(state), /private_key|secret/);
});

test('dynamic HTTP API separates job creation/status from immutable B1 and rejects invalid requests', async () => {
  const dynamic = { start: body => ({ status: 202, body: { success: true, job: { id: '11111111-1111-4111-8111-111111111111', status: 'queued' }, received: body } }),
    get: id => ({ success: true, job: { id, status: 'running' } }) };
  const app = express(); app.use(express.json()); app.use('/api/research', createResearchRouter(async () => ({ success: true, available: false }), dynamic));
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const start = await fetch(`${origin}/api/research/dynamic-ahp-sar-comparisons`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(REQUEST) });
    assert.equal(start.status, 202); assert.equal(start.headers.get('cache-control'), 'no-store'); assert.deepEqual((await start.json()).received, REQUEST);
    const status = await fetch(`${origin}/api/research/dynamic-ahp-sar-comparisons/11111111-1111-4111-8111-111111111111`);
    assert.equal((await status.json()).job.status, 'running');
    const query = await fetch(`${origin}/api/research/dynamic-ahp-sar-comparisons/11111111-1111-4111-8111-111111111111?scene=fake`);
    assert.equal(query.status, 400);
    const historical = await fetch(`${origin}/api/research/ahp-sar-comparison`); assert.equal(historical.status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
