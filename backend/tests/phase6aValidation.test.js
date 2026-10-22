const test = require('node:test');
const assert = require('node:assert/strict');
const { utcMillis, temporalAudit, provenanceRecord, qualifyReference, summarizeEvaluation,
  sarSupportedDomain, buildEvaluation } = require('../research/phase6a/validation');
const { FILTERS } = require('../services/ahpSarResearchService');

const qualified = mode => ({ status: 'QUALIFIED_FOR_RESEARCH', mode });
const full = { domain: 1000, tp: 100, fn: 200, fp: 50, tn: 650, positive: 300, negative: 700, labelConflict: null };

test('observation timestamps reject publication-only dates, missing timezone and invalid calendars; minute precision stays an interval', () => {
  for (const invalid of ['2017-05-30', '2017-05-30T00:24:00', '2017-02-29T00:24:00Z', '2017-05-32T00:00:00Z', null]) assert.throws(() => utcMillis(invalid));
  const result = temporalAudit('2017-05-30T00:24:00Z', '2017-05-30T00:24:59.999Z', '2017-05-30T00:24:30Z');
  assert.equal(result.sarInsideObservationInterval, true); assert.equal(result.temporalEquivalenceEstablished, false);
  assert.equal(result.offsetHoursRange[0], -30 / 3600);
  const prior = temporalAudit('2016-05-30T00:00:00Z', '2016-05-30T01:00:00Z', '2017-05-30T00:24:30Z');
  assert.equal(prior.sameCalendarDay, false);
  assert.throws(() => temporalAudit('2017-05-31T00:00:00Z', '2017-05-30T00:00:00Z', '2017-05-30T00:00:00Z'));
});
test('source provenance requires original URL, content checksum, filename and UTC retrieval time', () => {
  const record = { officialUrl: 'https://mapping.emergency.copernicus.eu/activations/EMSR205/', sha256: 'a'.repeat(64), filename: 'official.zip', acquiredAt: '2026-10-20T17:00:00Z' };
  assert.deepEqual(provenanceRecord(record), record);
  for (const patch of [{ sha256: null }, { filename: '' }, { acquiredAt: '2026-10-20' }, { officialUrl: 'https://user:secret@example.org/' }]) assert.throws(() => provenanceRecord({ ...record, ...patch }));
});
test('qualification requires independent processing evidence, real spatial support, observation time and licensing', () => {
  const reference = { commonSupportAreaKm2: 1, geometryAndCrsVerified: true, provenanceVerified: true,
    observationTimeVerified: true, temporalComparisonApproved: true, externalProcessingVerified: true,
    licenceVerified: true, positiveLabelsVerified: true, negativeLabelsVerified: true, observationFootprintVerified: true, sensorIndependent: false };
  assert.equal(qualifyReference().status, 'DATA_NOT_READY');
  assert.equal(qualifyReference({ ...reference, commonSupportAreaKm2: 0 }).status, 'REFERENCE_INCOMPATIBLE');
  assert.equal(qualifyReference({ ...reference, observationTimeVerified: false }).status, 'DATA_NOT_READY');
  assert.equal(qualifyReference(reference).mode, 'positive-and-negative');
  assert.equal(qualifyReference({ ...reference, observationFootprintVerified: false }).mode, 'positive-only');
  assert.equal(qualifyReference(reference).sensorIndependent, false);
  assert.throws(() => summarizeEvaluation(full, { status: 'DATA_NOT_READY' }));
});
test('area-weighted confusion matrix and metrics preserve flood and non-flood support', () => {
  const r = summarizeEvaluation(full, qualified('positive-and-negative'));
  assert.equal(r.precision, 2 / 3); assert.equal(r.recall, 1 / 3); assert.equal(r.f1, 200 / 450); assert.equal(r.iou, 100 / 350);
  assert.deepEqual(r.confusionMatrixKm2.values, [[0.0001, 0.0002], [0.00005, 0.00065]]);
  assert.equal(r.floodSupportKm2 + r.nonFloodSupportKm2, r.validComparisonAreaKm2);
  for (const patch of [{ domain: 1002 }, { positive: 302 }, { negative: 702 }, { tp: undefined }, { tn: -1 }, { labelConflict: 0.01 }]) {
    assert.throws(() => summarizeEvaluation({ ...full, ...patch }, qualified('positive-and-negative')));
  }
});
test('positive-only observations leave false-positive-dependent metrics and full confusion matrix unavailable', () => {
  const r = summarizeEvaluation({ domain: 300, positive: 300, tp: 100, fn: 200 }, qualified('positive-only'));
  assert.equal(r.positiveReferenceCoverage, 1 / 3);
  for (const key of ['precision', 'recall', 'f1', 'iou', 'fpKm2', 'tnKm2', 'nonFloodSupportKm2', 'confusionMatrixKm2']) assert.equal(r[key], null);
  assert.throws(() => summarizeEvaluation({ domain: 1000, positive: 300, tp: 100, fn: 200 }, qualified('positive-only')));
});
test('zero denominators, empty measured sets and missing results are distinct', () => {
  const empty = Object.fromEntries(Object.keys(full).map(k => [k, null]));
  const zero = summarizeEvaluation(empty, qualified('positive-and-negative'));
  for (const key of ['precision', 'recall', 'f1', 'iou']) assert.equal(zero[key], null);
  assert.equal(zero.validComparisonAreaKm2, 0);
  const noPositive = summarizeEvaluation({ domain: 10, positive: 0, negative: 10, tp: 0, fn: 0, fp: 0, tn: 10, labelConflict: 0 }, qualified('positive-and-negative'));
  assert.equal(noPositive.precision, null); assert.equal(noPositive.recall, null);
  assert.throws(() => summarizeEvaluation({}, qualified('positive-only')));
});

function fixture() {
  const weights = [100, 200, 300, 400, 500, 600], calls = [];
  const vector = input => input instanceof Raster ? input : new Raster(Array(6).fill(input));
  class Raster {
    constructor(values, masks = Array(6).fill(1), name = '') { this.values = values; this.masks = masks; this.name = name; }
    op(other, fn) { other = vector(other); return new Raster(this.values.map((v, i) => fn(v, other.values[i])), this.masks.map((m, i) => Number(!!(m && other.masks[i])))); }
    and(v) { return this.op(v, (a, b) => Number(!!(a && b))); } or(v) { return this.op(v, (a, b) => Number(!!(a || b))); }
    gt(v) { return this.op(v, (a, b) => Number(a > b)); } not() { return new Raster(this.values.map(v => Number(!v)), this.masks); }
    unmask(value) { return new Raster(this.values.map((v, i) => this.masks[i] ? v : value)); }
    reproject(grid) { assert.equal(grid, graph.grid); return this; } clip(aoi) { assert.equal(aoi, graph.aoi); return this; }
    rename(name) { return new Raster(this.values, this.masks, name); }
    updateMask(v) { v = vector(v); return new Raster(this.values, this.masks.map((m, i) => Number(!!(m && v.masks[i] && v.values[i]))), this.name); }
  }
  const image = values => new Raster(values.map(v => v ?? 0), values.map(v => Number(v !== null)));
  const graph = { grid: {}, aoi: {}, gridOptions: {} }; graph.gridOptions = { crs: graph.grid, geometry: graph.aoi, tileScale: 4 };
  const candidate = { supportMasks: { common: vector(1), smoothing: vector(1), smoothedValues: vector(1), valid: vector(1), eligible: vector(1), terrainUnknown: vector(0) },
    stageImages: { raw: image([1, 0, 1, 0, 1, null]), terrain: image([1, 0, 0, 0, 1, null]), final: image([null, null, null, null, 1, null]) } };
  const ee = { Image: { pixelArea: () => new Raster(weights), cat: bands => ({ reduceRegion(options) {
    calls.push(options); assert.equal(options.crs, graph.grid); assert.equal(options.scale, undefined); assert.equal(options.bestEffort, undefined);
    return Object.fromEntries(bands.map(b => [b.name, b.values.reduce((total, v, i) => total + (b.masks[i] ? v : 0), 0)]));
  } }) }, Reducer: { sum: () => 'sum' } };
  return { candidate, graph, ee, image, calls };
}
test('production raster graph excludes unknown labels/SAR support and uses the same domain for all stages', () => {
  const f = fixture();
  f.candidate.supportMasks.common = f.image([1, 1, 1, 1, 0, 1]);
  const reference = { positive: f.image([1, 1, 0, 0, 1, null]), negative: f.image([0, 0, 1, 1, 0, null]), observed: f.image([1, 1, 1, 1, 1, null]) };
  const built = buildEvaluation(f.ee, f.graph, f.candidate, reference, qualified('positive-and-negative'));
  assert.equal(built.filters, FILTERS);
  for (const stage of ['raw', 'terrain', 'final']) {
    const result = summarizeEvaluation(built.computations[stage], qualified('positive-and-negative'));
    assert.equal(result.validComparisonAreaKm2, 0.001); // unknown sixth pixel and missing fifth SAR pixel excluded
  }
  assert.equal(built.computations.raw.fp, 300); assert.equal(built.computations.terrain.fp, 0);
  assert.equal(built.computations.final.fn, 300); assert.equal(f.calls.length, 3);
  assert.throws(() => buildEvaluation(f.ee, f.graph, f.candidate, reference, { status: 'DATA_NOT_READY' }));
});
test('historical unknown, smoothing gaps and missing terrain stay outside the comparison domain', () => {
  const f = fixture();
  f.candidate.supportMasks.valid = f.image([0, 1, 1, 1, 1, 1]);
  f.candidate.supportMasks.smoothing = f.image([1, 0, 1, 1, 1, 1]);
  f.candidate.supportMasks.terrainUnknown = f.image([0, 0, 1, 0, 0, 0]);
  f.candidate.supportMasks.smoothedValues = f.image([1, 1, 1, null, 1, 1]);
  assert.deepEqual(sarSupportedDomain(f.candidate).values, [0, 0, 0, 0, 1, 1]);
  const r = { positive: f.image([1, 1, 1, 1, 1, 1]) };
  const built = buildEvaluation(f.ee, f.graph, f.candidate, r, qualified('positive-only'), f.image([1, 1, 1, 1, 1, 0]));
  for (const stage of ['raw', 'terrain', 'final']) assert.equal(built.computations[stage].domain, 500);
});
