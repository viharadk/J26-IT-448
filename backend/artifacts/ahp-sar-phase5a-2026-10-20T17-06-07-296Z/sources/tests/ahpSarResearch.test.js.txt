const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CLASSES, FILTERS, intersectMasks, prepareDomain, overlapComputation, summarizeOverlap,
  summarizeLedger, createAhpSarResearchService } = require('../services/ahpSarResearchService');
const { SETTINGS } = require('../services/sarCandidateService');
const { SCENES } = require('../services/sarPixelQuality');
const { referencePolicy } = require('../services/sarWaterReferenceService');
const { calculateAHP } = require('../services/ahpService');
const { csv, findings, safeError } = require('../scripts/run-ahp-sar-research');

// Tiny deterministic rasters exercise the actual production mask and area graph.
// Pixel areas vary to catch accidental counting rather than geographic summing.
function fixture(size = 12) {
  const calls = [], weights = Array.from({ length: size }, (_, i) => 100 + i);
  const raster = values => new Raster(values.map(v => v ?? 0), values.map(v => Number(v !== null)));
  const vector = value => value instanceof Raster ? value : new Raster(Array(size).fill(value));
  class Raster {
    constructor(values, masks = Array(size).fill(1), name = 'value') { this.values = values; this.masks = masks; this.name = name; }
    op(other, operation) { other = vector(other); return new Raster(this.values.map((v, i) => operation(v, other.values[i])), this.masks.map((m, i) => Number(!!(m && other.masks[i])))); }
    and(v) { return this.op(v, (a, b) => Number(!!(a && b))); } or(v) { return this.op(v, (a, b) => Number(!!(a || b))); }
    eq(v) { return this.op(v, (a, b) => Number(a === b)); } gt(v) { return this.op(v, (a, b) => Number(a > b)); }
    not() { return new Raster(this.values.map(v => Number(!v)), this.masks); }
    mask() { return new Raster(this.masks); }
    unmask(value) { return new Raster(this.values.map((v, i) => this.masks[i] ? v : value)); }
    updateMask(value) { value = vector(value); return new Raster(this.values, this.masks.map((m, i) => Number(!!(m && value.masks[i] && value.values[i]))), this.name); }
    remap(from, to, fallback) { return new Raster(this.values.map(v => from.includes(v) ? to[from.indexOf(v)] : fallback), this.masks); }
    rename(name) { return new Raster(this.values, this.masks, name); }
    reproject(grid) { calls.push(grid); return this; } clip() { return this; }
  }
  const ee = { Image: { constant: vector, pixelArea: () => new Raster(weights), cat: bands => ({
    reduceRegion: options => {
      assert.equal(options.crs, graph.grid); assert.equal(options.scale, undefined); assert.equal(options.bestEffort, undefined);
      return Object.fromEntries(bands.map(band => [band.name, band.masks.some(Boolean) ? band.values.reduce((n, v, i) => n + (band.masks[i] ? v : 0), 0) : null]));
    }
  }) }, Reducer: { sum: () => 'sum' } };
  const graph = { grid: { name: 'exact-before-affine' }, aoi: {}, gridOptions: {} };
  graph.gridOptions = { crs: graph.grid, geometry: graph.aoi };
  const hazard = { analysisProjection: { atScale: n => { assert.equal(n, 30); return 'native-ahp-30'; } }, landHazardClass: raster(Array(size).fill(1)) };
  Object.defineProperty(hazard, 'hazardClass', { get() { return this.landHazardClass; } });
  hazard.waterBoolean = vector(0);
  const masks = Object.fromEntries(['common', 'smoothing', 'valid', 'eligible', 'smoothedValues'].map(key => [key, vector(1)]));
  masks.permanent = vector(0); masks.terrainUnknown = vector(0);
  graph.commonMask = masks.common;
  return { ee, graph, hazard, masks, raster, weights, calls, active: image => image.values.flatMap((v, i) => image.masks[i] && v ? [i] : []) };
}

test('actual hazard classifier encodes Low/Moderate/High/Very High as 1/2/3/4 with boundary preservation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/hazardService.js'), 'utf8');
  const body = source.match(/function classifyHazard\(indexImage, name\) \{([\s\S]*?)\n  \}/)[1];
  const classify = vm.runInNewContext(`(function(indexImage, name) {${body}})`, { ee: { Image: value => ({
    value, where(condition, replacement) { if (condition) this.value = replacement; return this; },
    rename() { return this; }, updateMask() { return this; }, clip() { return this; }
  }) }, aoi: {} });
  for (const [index, code] of [[1, 1], [2, 1], [2.001, 2], [3, 2], [3.001, 3], [4, 3], [4.001, 4], [5, 4]]) {
    assert.equal(classify({ gt: threshold => index > threshold, mask: () => 1 }, 'test').value, code);
  }
  assert.deepEqual(CLASSES.map(c => [c.code, c.label]), [[1, 'Low'], [2, 'Moderate'], [3, 'High'], [4, 'Very High']]);
  assert.match(source, /landHazardClass = hazardClass\s*\.updateMask\(landMask\)/);
});

test('shared domain intersects every real validity mask; missing/unknown pixels cannot become negatives', () => {
  const f = fixture();
  const maskWithout = i => f.raster(Array.from({ length: 12 }, (_, j) => Number(j !== i)));
  f.graph.commonMask = maskWithout(0); f.masks.smoothing = maskWithout(1);
  f.hazard.landHazardClass = f.raster([1, 1, null, 99, 1, 1, 1, 1, 1, 1, 1, 1]);
  f.masks.valid = maskWithout(4); f.masks.eligible = maskWithout(5);
  f.masks.terrainUnknown = f.raster(Array.from({ length: 12 }, (_, i) => i === 6 ? 1 : 0));
  f.masks.smoothedValues = maskWithout(7);
  const p = prepareDomain(f.ee, f.graph, f.hazard, { supportMasks: f.masks });
  assert.deepEqual(f.active(p.domain), [8, 9, 10, 11]);
  assert.deepEqual(f.active(p.ledgerRemainder), [8, 9, 10, 11]);
  assert.deepEqual(f.calls.slice(0, 2), ['native-ahp-30', f.graph.grid]);
  const removed = Object.values(p.losses).flatMap(f.active);
  assert.deepEqual(removed.sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  const raw = overlapComputation(f.ee, f.graph, p.classes, p.domain, f.raster(Array(12).fill(0)));
  assert.equal(raw.nonCandidate_1, f.weights.slice(8).reduce((a, b) => a + b));
  assert.equal(raw.domain, raw.nonCandidate_1);
  assert.throws(() => intersectMasks([]));
  assert.deepEqual(f.active(intersectMasks([f.raster([1, null, ...Array(10).fill(1)]), maskWithout(2)])), [0, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

function reduction(domain = [100, 200, 300, 400], candidates = [0, 20, 60, 120]) {
  return { domain: domain.reduce((a, b) => a + b), candidate: candidates.reduce((a, b) => a + b), unexpectedClass: null, candidateOutsideDomain: null,
    ...Object.fromEntries(CLASSES.flatMap((c, i) => [[`class_${c.code}`, domain[i]], [`candidate_${c.code}`, candidates[i]], [`nonCandidate_${c.code}`, domain[i] - candidates[i]]])) };
}
test('class area, candidate area, distribution, enrichment and grouped comparisons account independently', () => {
  const s = summarizeOverlap(reduction(), {});
  assert.equal(s.commonDomainAreaKm2, 0.001); assert.equal(s.candidateAreaKm2, 0.0002);
  assert.equal(s.rows[1].candidatePercent, 10); assert.equal(s.rows[1].enrichmentRatio, 0.5);
  assert.equal(s.rows[3].candidateSharePercent, 60); assert.equal(s.rows[3].domainSharePercent, 40);
  assert.ok(Math.abs(s.groupedComparison.higherToLowerRateRatio - (180 / 700) / (20 / 300)) < 1e-12);
  for (const patch of [{ domain: 1002 }, { candidate: 202 }, { nonCandidate_1: 98 }, { class_4: undefined }, { unexpectedClass: 2 }, { candidateOutsideDomain: 2 }]) {
    assert.throws(() => summarizeOverlap({ ...reduction(), ...patch }, {}));
  }
});
test('zero area, absent class, zero candidates and zero lower-group rate are explicitly not estimable', () => {
  const empty = summarizeOverlap(reduction([0, 0, 0, 0], [0, 0, 0, 0]), {});
  assert.equal(empty.candidateRate, null); assert.equal(empty.groupedComparison.higherToLowerRateRatio, null);
  assert.ok(empty.rows.every(r => r.candidatePercent === null && r.enrichmentRatio === null && r.domainSharePercent === null));
  const zero = summarizeOverlap(reduction([100, 200, 300, 400], [0, 0, 0, 0]), {});
  assert.equal(zero.candidateRate, 0); assert.ok(zero.rows.every(r => r.enrichmentRatio === null && r.candidateSharePercent === null && r.candidatePercent === 0));
  const absent = summarizeOverlap(reduction([0, 0, 300, 400], [0, 0, 30, 40]), {});
  assert.equal(absent.rows[0].candidatePercent, null); assert.equal(absent.groupedComparison.higherToLowerRateRatio, null);
  const lowerZero = summarizeOverlap(reduction([100, 200, 300, 400], [0, 0, 30, 40]), {});
  assert.equal(lowerZero.groupedComparison.higherToLowerRateRatio, null);
  assert.ok(!JSON.stringify([empty, zero, absent, lowerZero]).includes('Infinity'));
});
test('actual raster graph sums geographic weights and retains every class including absent classes', () => {
  const f = fixture(4); f.hazard.landHazardClass = f.raster([1, 2, 3, 4]);
  const p = prepareDomain(f.ee, f.graph, f.hazard, { supportMasks: f.masks });
  const raw = overlapComputation(f.ee, f.graph, p.classes, p.domain, f.raster([null, 1, null, 1]));
  const s = summarizeOverlap(raw, {});
  assert.equal(s.commonDomainAreaKm2, 406 / 1e6); assert.equal(s.candidateAreaKm2, 204 / 1e6);
  assert.equal(s.rows[0].nonCandidateAreaKm2, 100 / 1e6);
});
test('different historical support denominators stay distinct and their shared intersection is explicit', () => {
  const f = fixture(4), annual = f.raster([1, 1, 0, null]), monthly = f.raster([1, 1, 1, null]);
  const candidate = f.raster([0, 1, 1, null]);
  const a = summarizeOverlap(overlapComputation(f.ee, f.graph, f.hazard.landHazardClass, annual, candidate), {});
  const m = summarizeOverlap(overlapComputation(f.ee, f.graph, f.hazard.landHazardClass, monthly, candidate), {});
  const shared = intersectMasks([annual, monthly]);
  assert.equal(a.commonDomainAreaKm2, 201 / 1e6); assert.equal(m.commonDomainAreaKm2, 303 / 1e6);
  assert.equal(a.candidateAreaKm2, 101 / 1e6); assert.equal(m.candidateAreaKm2, 203 / 1e6);
  assert.deepEqual(f.active(shared), [0, 1]);
});
test('loss ledger rejects unaccounted AOI and unknown class codes', () => {
  const raw = { aoi: 1000, commonDomain: 200, ledgerRemainder: 200, missingSar: 100, smoothingUnsupported: 100,
    ahpNoData: 100, ahpWorldCoverWaterExcluded: 0, ahpLandClassUnavailable: 0, ahpUnexpectedCode: 0, historicalUnknown: 300, historicalPermanentExcluded: 100, terrainUnknown: 100,
    marginal_ahpUnexpectedCode: null };
  assert.equal(summarizeLedger(raw).accountingPassed, true);
  assert.throws(() => summarizeLedger({ ...raw, commonDomain: 198 }));
  assert.throws(() => summarizeLedger({ ...raw, marginal_ahpUnexpectedCode: 2 }));
});
test('controlled experiment preserves current weights, exact scene IDs, thresholds and reference policies', () => {
  assert.deepEqual(FILTERS, { terrainFilter: 'slope-v1', maxSlopeDegrees: 5, clusterFilter: 'connected-v1', minConnectedPixels: 8 });
  assert.deepEqual(SETTINGS, { smoothingRadiusMeters: 30, laterWaterThresholdDb: -15, decreaseThresholdDb: -3, beforeNonWaterThresholdDb: -15, slopeFilterApplied: false });
  assert.match(SCENES.before, /20170524T002512/); assert.match(SCENES.later, /20170530T002430/);
  assert.deepEqual(calculateAHP().factorWeights.map(f => f.weight), [0.4, 0.2, 0.3, 0.1]);
  assert.equal(referencePolicy(SCENES, 2016).method, 'yearly-conservative-v1');
  const monthly = referencePolicy(SCENES, 2016, 'yearly-monthly-dry-v1');
  assert.equal(monthly.monthlyEndExclusive, '2017-05-01'); assert.equal(monthly.minimumNonWaterMonths, 3);
});
test('outputs retain denominator identity, safe nulls and credential redaction', () => {
  const scenario = summarizeOverlap(reduction(), { referenceMethod: 'yearly-conservative-v1', stage: 'final', domainKind: 'reference-specific-stage-shared' });
  const result = { scenarios: [scenario] };
  assert.equal(csv(result).trim().split('\n').length, 5); assert.match(csv(result), /domainKind/);
  assert.match(findings(result), /preliminary cross-method spatial agreement/);
  const clean = safeError('access_token=abc Bearer xyz "private_key":"secret"');
  assert.ok(!clean.includes('abc') && !clean.includes('xyz') && !clean.includes('secret'));
});

test('research orchestration preserves scene/parameter handoffs and evaluates all stages on explicit domains', async () => {
  const f = fixture(4), calls = [], saved = [];
  f.ee.Dictionary = value => value;
  f.graph.aoi.area = () => ({ divide: () => 0.000406 });
  f.hazard.studyBasins = { aggregate_array: key => { assert.equal(key, 'HYBAS_ID'); return [4101158680]; } };
  f.hazard.factorLayers = {}; f.hazard.weights = { elevation: 0.4, slope: 0.2, waterDistance: 0.3, landcover: 0.1 };
  f.hazard.ahp = calculateAHP(); f.hazard.methodology = {};
  const service = createAhpSarResearchService({ engine: () => ({ ee: f.ee, initializeEarthEngine: async () => calls.push('init') }),
    getHazard: async () => f.hazard, evaluateValue: async value => value,
    previewFactory: options => {
      assert.equal(options.sceneIds, SCENES); assert.equal(typeof options.validateQuality, 'function');
      return { qualityState: async () => ({ graph: f.graph, data: { scenes: {}, alignment: { analysisProjection: {} } } }) };
    },
    candidateBuilder: (ee, graph, year, policy, filters) => {
      assert.equal(ee, f.ee); assert.equal(graph, f.graph); assert.equal(year, 2016); assert.equal(filters, FILTERS);
      calls.push(policy.method);
      const eligible = f.raster(policy.method === 'yearly-conservative-v1' ? [1, 1, 0, null] : [1, 1, 1, null]);
      return { supportMasks: { ...f.masks, valid: eligible, eligible }, referenceMetadata: policy,
        stageImages: { raw: f.raster([0, 1, 1, null]), terrain: f.raster([0, 1, 0, null]), final: f.raster([0, 0, 0, null]) } };
    }, onResult: async scenario => saved.push(scenario) });
  const result = await service.run();
  assert.equal(result.status, 'completed'); assert.equal(saved.length, 12); assert.equal(result.scenarios.length, 12);
  assert.deepEqual(calls, ['init', 'yearly-conservative-v1', 'yearly-monthly-dry-v1']);
  for (const scenario of result.scenarios) {
    assert.equal(scenario.commonDomainAreaKm2, scenario.domainKind === 'reference-specific-stage-shared' && scenario.referenceMethod === 'yearly-monthly-dry-v1' ? 303 / 1e6 : 201 / 1e6);
    if (scenario.stage === 'final') assert.equal(scenario.candidateAreaKm2, 0);
  }
  assert.equal((await service.run({ monthly: false })).scenarios.length, 3);
});
