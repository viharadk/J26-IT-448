const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { CONSERVATIVE, MONTHLY_DRY, parseReferenceMethod, referencePolicy, buildWaterReference, validateInvestigation } = require('../services/sarWaterReferenceService');
const { SCENES } = require('../services/sarPixelQuality');
const { summarizeAreas } = require('../services/sarCandidateService');
const { createSarSelectionService } = require('../services/sarSelectionService');
const { createSarSelectionRouter } = require('../routes/sarSelectionRoutes');

test('reference selection is opt-in, scalar and bounded to named methods', () => {
  assert.equal(parseReferenceMethod(), CONSERVATIVE); assert.equal(parseReferenceMethod(MONTHLY_DRY), MONTHLY_DRY);
  for (const value of [null, [], [MONTHLY_DRY], 'unmask-dry', '', 1]) assert.throws(() => parseReferenceMethod(value), error => error.status === 400);
});
test('monthly provenance excludes the entire observation month and unsupported future reference windows', () => {
  const policy = referencePolicy(SCENES, 2016, MONTHLY_DRY);
  assert.equal(policy.monthlyStart, '2016-01-01'); assert.equal(policy.monthlyEndExclusive, '2017-05-01');
  assert.equal(policy.futureObservationsUsed, false); assert.equal(policy.eligibilityInferred, true); assert.equal(policy.currentWaterStateVerified, false);
  assert.equal(policy.minimumNonWaterMonths, 3); assert.equal(policy.maximumWaterMonthsForFallback, 0);
  assert.equal(referencePolicy(SCENES, 2016).monthlyDataset, null);
  assert.throws(() => referencePolicy({ before: SCENES.before.replace('20170524', '20220524') }, 2021, MONTHLY_DRY), error => error.status === 422);
});

// Tiny deterministic raster algebra exercises the production reference graph's
// mask/state decisions offline. Real GEE projections and areas are checked by
// check-sar-water-reference.js and compare-sar-water-reference.js independently.
function rasterEngine() {
  const length = 8, vector = value => value instanceof Raster ? value : new Raster(Array(length).fill(value));
  class Raster {
    constructor(values, masks = Array(length).fill(1)) { this.values = values; this.masks = masks; }
    operation(other, fn) { other = vector(other); return new Raster(this.values.map((value, i) => fn(value, other.values[i]) ? 1 : 0), this.masks.map((m, i) => m && other.masks[i] ? 1 : 0)); }
    eq(other) { return this.operation(other, (a, b) => a === b); } gt(other) { return this.operation(other, (a, b) => a > b); }
    gte(other) { return this.operation(other, (a, b) => a >= b); } lte(other) { return this.operation(other, (a, b) => a <= b); }
    and(other) { return this.operation(other, (a, b) => a && b); } or(other) { return this.operation(other, (a, b) => a || b); }
    not() { return new Raster(this.values.map(value => value ? 0 : 1), this.masks); }
    mask() { return new Raster(this.masks); }
    unmask(value) { return new Raster(this.values.map((v, i) => this.masks[i] ? v : value)); }
    reproject() { return this; } clip() { return this; } select() { return this; } rename() { return this; }
    projection() { return { crs: () => 'synthetic-30m', transform: () => 'synthetic-affine', nominalScale: () => 30 }; }
  }
  const annual = new Raster([3, 2, 1, 0, 0, 1, 0, 0], [1, 1, 1, 1, 1, 0, 0, 0]);
  const monthly = [
    new Raster([1, 2, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 0]),
    new Raster([1, 2, 1, 1, 1, 2, 1, 0]), new Raster([1, 2, 1, 1, 0, 1, 1, 0]),
    new Raster(Array(length).fill(1)),
  ];
  ['2016-01-01', '2016-02-01', '2017-04-01', '2017-05-01'].forEach((date, i) => { monthly[i].date = date; monthly[i].id = date.slice(0, 7).replace('-', '_'); });
  class Collection {
    constructor(items) { this.items = items; }
    filter() { return this; } first() { return this.items[0]; } sort() { return this; }
    filterDate(start, end) { return new Collection(this.items.filter(item => item.date >= start && item.date < end)); }
    limit(n) { return new Collection(this.items.slice(0, n)); } size() { return this.items.length; }
    aggregate_array() { return this.items.map(item => item.id); } map(fn) { return new Collection(this.items.map(fn)); }
    sum() { return new Raster(Array.from({ length }, (_, i) => this.items.reduce((sum, item) => sum + (item.masks[i] ? item.values[i] : 0), 0))); }
  }
  return { Image: Object.assign(value => vector(value), { constant: vector }),
    ImageCollection: name => new Collection(name.includes('Yearly') ? [annual] : monthly),
    Filter: { eq: () => ({}) }, Dictionary: value => value, Number: value => value, List: value => value };
}
test('unknown/zero/masked monthly states cannot become dry; observed annual permanence and seasonal classes retain priority', () => {
  const ee = rasterEngine(), graph = { grid: {}, aoi: {} };
  const original = buildWaterReference(ee, graph, 2016, referencePolicy(SCENES, 2016));
  assert.deepEqual(original.supported.values, [1, 1, 1, 0, 0, 0, 0, 0]);
  const proposed = buildWaterReference(ee, graph, 2016, referencePolicy(SCENES, 2016, MONTHLY_DRY));
  assert.deepEqual(proposed.permanent.values, [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(proposed.seasonal.values, [0, 1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(proposed.monthlyEligible.values, [0, 0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual(proposed.eligible.values, [0, 1, 1, 1, 0, 0, 1, 0]);
  assert.equal(proposed.metadata.monthlyImageCount, 3); // event-month image excluded
  assert.equal(proposed.metadata.monthlyImageIds.includes('2017_05'), false);
});
test('area provenance must partition annual observations, seasonal water and inferred eligibility without overlap', () => {
  const raw = { aoi: 1000000, common: 900000, smoothedSupport: 850000, valid: 800000, permanent: 100000, eligible: 700000, candidate: 40000,
    annualKnown: 300000, annualNotWater: 150000, annualSeasonal: 50000, monthlyInferred: 500000 };
  const result = summarizeAreas({ ...raw }); assert.equal(result.monthlyInferredEligibleAreaKm2, 0.5); assert.equal(result.annualSeasonalWaterAreaKm2, 0.05);
  for (const invalid of [{ ...raw, monthlyInferred: 600000 }, { ...raw, annualNotWater: 500000 }, { ...raw, annualKnown: NaN }]) assert.throws(() => summarizeAreas(invalid));
  const split = { ...raw, candidateAnnual: 10000, candidateMonthly: 30000 };
  assert.equal(summarizeAreas(split).candidateMonthlyInferredAreaKm2, 0.03);
  assert.throws(() => summarizeAreas({ ...split, candidateMonthly: 50000 }));
});
test('diagnostic partitions preserve class 0 separately from masked pixels and reject inconsistent category sums', () => {
  const areas = { total: 100, unmasked: 20, masked: 80, class0: 2, class1: 3, class2: 5, class3: 10, otherValues: 0 };
  const input = { yearImageCount: 1, selectedYear: 2016, yearImageId: '2016',
    yearlyNativeAoi: areas, yearlyAlignedAoi: areas, yearlyAlignedCommonSar: areas, yearlyAlignedSmoothed: areas,
    monthlyHistorySupport: { support: 100, observedAny: 90, noObservedMonths: 10, additionalRepeatedDryOutsideAnnual: 70 } };
  assert.equal(validateInvestigation(input), true);
  assert.throws(() => validateInvestigation({ ...input, selectedYear: 2017 }));
  assert.throws(() => validateInvestigation({ ...input, yearlyAlignedSmoothed: { ...areas, masked: 82 } }));
});
test('method-specific caches never replace the conservative default or leak inferred results between requests', async () => {
  const calls = [];
  const service = createSarSelectionService({ previewFactory: () => ({}), analysisFactory: ({ referenceMethod }) => {
    calls.push(referenceMethod); return { analyze: async () => ({ referenceMethod }) };
  } });
  assert.equal((await service.analyze(SCENES)).referenceMethod, CONSERVATIVE);
  assert.equal((await service.analyze(SCENES, MONTHLY_DRY)).referenceMethod, MONTHLY_DRY);
  assert.equal((await service.analyze(SCENES)).referenceMethod, CONSERVATIVE);
  assert.deepEqual(calls, [CONSERVATIVE, MONTHLY_DRY]);
  assert.throws(() => service.analyze(SCENES, 'unmask-dry'), error => error.status === 400);
});
test('only analysis accepts the optional reference method; invalid/repeated methods fail before service work', async () => {
  const calls = [];
  const app = express(); app.use('/api/sar', createSarSelectionRouter({ analyze: async (_selection, method) => { calls.push(method); return { success: true, method }; }, preview: async () => ({ success: true }) }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/sar`, query = new URLSearchParams({ beforeSceneId: SCENES.before, laterSceneId: SCENES.later });
  try {
    assert.equal((await (await fetch(`${base}/analysis?${query}`)).json()).method, CONSERVATIVE);
    assert.equal((await (await fetch(`${base}/analysis?${query}&referenceMethod=${MONTHLY_DRY}`)).json()).method, MONTHLY_DRY);
    for (const suffix of ['referenceMethod=unmask-dry', `referenceMethod=${MONTHLY_DRY}&referenceMethod=${CONSERVATIVE}`, `referenceMethod=${MONTHLY_DRY}&extra=1`]) assert.equal((await fetch(`${base}/analysis?${query}&${suffix}`)).status, 400);
    assert.equal((await fetch(`${base}/selected-preview?${query}&referenceMethod=${MONTHLY_DRY}`)).status, 400);
    assert.deepEqual(calls, [CONSERVATIVE, MONTHLY_DRY]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
