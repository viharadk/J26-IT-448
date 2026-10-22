const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { SCENES } = require('../services/sarPixelQuality');
const { parseSelection, validateSelectedQuality, createSarSelectionService } = require('../services/sarSelectionService');
const { createSarSelectionRouter } = require('../routes/sarSelectionRoutes');
const { referenceYear, summarizeAreas, createSarCandidateService, LABEL } = require('../services/sarCandidateService');
const query = { beforeSceneId: SCENES.before, laterSceneId: SCENES.later };
function quality() {
  const metadata = { orbitDirection: 'DESCENDING', relativeOrbitNumber: 19, instrumentMode: 'IW', polarizations: ['VV', 'VH'], catalogueResolutionMeters: 10, footprintCoveragePercent: 95 };
  return { queriedAt: '2026-10-20T00:00:00Z', scenes: { before: { ...metadata, sceneId: SCENES.before, acquiredAt: '2017-05-24T00:25:12.750Z' }, later: { ...metadata, sceneId: SCENES.later, acquiredAt: '2017-05-30T00:24:30.100Z' } }, common: { jointFootprintCoveragePercent: 94, validPixelAreaKm2: 0.9 } };
}
test('selected assets are bounded real product IDs, chronological and not arbitrary EE assets', () => {
  assert.deepEqual(parseSelection(query), SCENES);
  for (const bad of [{}, { ...query, band: 'VH' }, { ...query, beforeSceneId: [SCENES.before] },
    { ...query, beforeSceneId: 'users/private/asset' }, { ...query, laterSceneId: SCENES.before },
    { beforeSceneId: SCENES.later, laterSceneId: SCENES.before }, { ...query, laterSceneId: SCENES.later.replace('20170530', '20200530') }]) {
    assert.throws(() => parseSelection(bad), error => error.status === 400);
  }
});
test('pair validation reuses timestamp, orbit, polarization and coverage checks instead of trusting client selections', () => {
  assert.equal(validateSelectedQuality(quality()).pairAssessment.status, 'suitable');
  for (const mutate of [q => { q.scenes.later.relativeOrbitNumber = 100; }, q => { q.scenes.later.polarizations = ['VH']; },
    q => { q.scenes.before.catalogueResolutionMeters = 40; }, q => { q.common.jointFootprintCoveragePercent = 89; },
    q => { q.scenes.later.acquiredAt = '2017-05-30T12:24:30Z'; }]) {
    const q = quality(); mutate(q); assert.throws(() => validateSelectedQuality(q), error => error.status === 422);
  }
});
test('selected worker deduplicates requests, bounds cache and concurrency, and releases failures', async () => {
  let resolve, calls = 0;
  const service = createSarSelectionService({ previewFactory: () => ({ preview: () => { calls++; return new Promise(done => { resolve = done; }); }, pixelQuality: async () => ({ success: true }) }) });
  const a = service.preview(SCENES), b = service.preview(SCENES);
  await assert.rejects(service.pixelQuality(SCENES), error => error.status === 429);
  resolve({ success: true }); assert.deepEqual(await a, await b); assert.equal(calls, 1);
  assert.equal((await service.pixelQuality(SCENES)).success, true);
  let attempts = 0;
  const failed = createSarSelectionService({ previewFactory: () => ({ preview: async () => { if (++attempts === 1) throw Error('synthetic failure'); return true; } }) });
  await assert.rejects(failed.preview(SCENES)); assert.equal(await failed.preview(SCENES), true);
});
const raw = () => ({ aoi: 1000000, common: 900000, smoothedSupport: 850000, valid: 800000, permanent: 100000, eligible: 700000, candidate: 40000 });
test('area partitions retain unknown pixels and permanent exclusions with an explicit denominator', () => {
  const a = summarizeAreas(raw());
  assert.equal(a.validAnalysisAreaKm2, 0.8); assert.equal(a.candidateAreaKm2, 0.04); assert.equal(a.candidatePercentOfValid, 5);
  assert.equal(a.excludedPermanentWaterAreaKm2, 0.1); assert.equal(a.missingSarAreaKm2, 0.1);
  assert.equal(a.ancillaryUnknownAreaKm2, 0.05); assert.equal(a.smoothingEdgeExcludedAreaKm2, 0.05);
  assert.equal(a.rasterAoiAreaKm2, a.missingSarAreaKm2 + a.ancillaryUnknownAreaKm2 + a.smoothingEdgeExcludedAreaKm2 + a.validAnalysisAreaKm2);
  assert.equal(summarizeAreas({ ...raw(), candidate: null }).candidateAreaKm2, 0);
  for (const bad of [{ ...raw(), candidate: 800000 }, { ...raw(), valid: 0 }, { ...raw(), common: 1100000 }, { ...raw(), permanent: null }, { ...raw(), candidate: undefined }]) assert.throws(() => summarizeAreas(bad));
});
test('prior-year permanent-water support is explicit; unsupported years do not silently reuse modern water', () => {
  assert.equal(referenceYear(SCENES), 2016);
  assert.throws(() => referenceYear({ before: SCENES.before.replace('20170524', '20240524') }), error => error.status === 422);
});
test('candidate service caches real computation separately from tile renewal and recovers from upstream failure', async () => {
  let time = 0, reductions = 0, maps = 0;
  const service = createSarCandidateService({ selection: SCENES, preview: { qualityState: async () => ({ data: quality(), graph: {} }) },
    engine: () => ({ ee: {} }), graphBuilder: () => ({ computation: raw(), image: {} }), evaluateValue: async value => { reductions++; return value; },
    mapImage: async () => { if (++maps === 1) throw Error('provider detail'); return 'https://earthengine.googleapis.com/{z}/{x}/{y}'; }, now: () => time });
  await assert.rejects(service.analyze(), error => error.status === 502 && !error.message.includes('provider detail'));
  const response = await service.analyze(); assert.equal(response.label, LABEL); assert.equal(response.methodology.floodValidation, 'none');
  await service.analyze(); assert.equal(maps, 2); assert.equal(reductions, 1);
  time += 600001; await service.analyze(); assert.equal(maps, 3); assert.equal(reductions, 1);
});
test('selected HTTP routes reject invalid inputs before processing, return bounded results and sanitize private errors', async () => {
  let calls = 0;
  const app = express(); app.use('/api/sar', createSarSelectionRouter({ preview: async () => { calls++; return { success: true }; },
    pixelQuality: async () => { throw Error('private credential detail'); }, analyze: async () => { throw Object.assign(Error('unsupported pair'), { status: 422, code: 'SAR_PAIR_UNSUPPORTED' }); } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/sar`, params = new URLSearchParams(query);
    assert.equal((await fetch(`${base}/selected-preview?beforeSceneId=arbitrary`)).status, 400); assert.equal(calls, 0);
    const result = await fetch(`${base}/selected-preview?${params}`); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
    const failure = await fetch(`${base}/selected-pixel-quality?${params}`); assert.equal(failure.status, 500); assert.ok(!(await failure.text()).includes('private'));
    assert.equal((await fetch(`${base}/analysis?${params}`)).status, 422);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
