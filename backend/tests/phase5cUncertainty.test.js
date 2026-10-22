const test = require('node:test');
const assert = require('node:assert/strict');
const { CLASSES, STAGES, intersectMasks, summarizeOverlap, overlapComputation } = require('../services/ahpSarResearchService');
const { SCENES } = require('../services/sarPixelQuality');
const { METHODS, LOSS_KEYS, area, close, buildSupports, classLossMasks, reduceMasks, symmetricDifference,
  summarizeClassLosses, summarizeResponsePartition, pattern, validateScenarioMatrix, deriveSensitivity } = require('../research/phase5c/uncertaintyService');
const { comparePrior, exportRows, csv } = require('../scripts/run-phase5c-uncertainty');

function reduction(domains, candidates) {
  return { domain: domains.reduce((a, b) => a + b), candidate: candidates.reduce((a, b) => a + b),
    unexpectedClass: null, candidateOutsideDomain: null,
    ...Object.fromEntries(CLASSES.flatMap((c, i) => [[`class_${c.code}`, domains[i]], [`candidate_${c.code}`, candidates[i]], [`nonCandidate_${c.code}`, domains[i] - candidates[i]]])) };
}
function matrix() {
  const c = [[0, 20, 60, 120], [0, 10, 50, 100], [0, 5, 40, 80]];
  const m = [c[0], c[1], [0, 6, 45, 85]];
  return ['native', 'fixed'].flatMap(domainKind => METHODS.flatMap((referenceMethod, methodIndex) => STAGES.map((stage, i) => {
    const factor = domainKind === 'native' && methodIndex === 1 ? 2 : 1;
    const s = summarizeOverlap(reduction([100, 200, 300, 400].map(n => n * factor), (methodIndex ? m : c)[i].map(n => n * factor)),
      { referenceMethod, stage, domainKind, domainId: domainKind === 'fixed' ? 'fixed-intersection-all-six-supports' : `native-${referenceMethod}` });
    return { ...s, candidateRatePercent: s.candidateRate * 100, patterns: pattern(s) };
  })));
}
function partitions() {
  return Object.fromEntries(STAGES.map((stage, i) => [stage, summarizeResponsePartition({ fixedDomain: 1000,
    bothCandidate: [200, 160, 125][i], conservativeOnlyCandidate: 0, monthlyOnlyCandidate: i === 2 ? 11 : 0,
    neitherCandidate: [800, 840, 864][i] })]));
}

test('Phase 5C signed area decomposition separates matched responses and nonshared support', () => {
  const s = deriveSensitivity(matrix(), partitions());
  const d = s.decomposition[2];
  assert.ok(Math.abs(d.nativeCandidateAreaDifferenceKm2 * 1e6 - 147) < 1e-10);
  assert.ok(Math.abs(d.fixedResponseAreaDifferenceKm2 * 1e6 - 11) < 1e-10);
  assert.ok(Math.abs(d.nonsharedSupportContributionKm2 * 1e6 - 136) < 1e-10);
  assert.equal(s.representation[1].fixedFractionOfNativePercent, 50);
  assert.equal(s.filterChanges.length, 8);
  assert.equal(s.groupedDirectionPositiveScenarios, 12);
});
test('Phase 5C rejects duplicated scenarios and incorrectly identified fixed support', () => {
  const s = matrix(); s[0] = s[1]; assert.throws(() => validateScenarioMatrix(s), /duplicate/);
  const changed = matrix(); changed[6].domainId = 'different-geography';
  assert.throws(() => validateScenarioMatrix(changed), /one shared mask/);
});
test('Phase 5C rejects same-total but altered fixed class representation', () => {
  const s = matrix();
  const fixed = s[9];
  fixed.rows[0].domainAreaKm2 += .000002; fixed.rows[0].nonCandidateAreaKm2 += .000002;
  fixed.rows[1].domainAreaKm2 -= .000002; fixed.rows[1].nonCandidateAreaKm2 -= .000002;
  assert.throws(() => validateScenarioMatrix(s), /Fixed class representation/);
});
test('Phase 5C checks individual response totals, not only their difference', () => {
  const p = partitions();
  p.raw.bothCandidateKm2 += .000002; p.raw.neitherCandidateKm2 -= .000002;
  assert.throws(() => deriveSensitivity(matrix(), p), /Conservative partition/);
  assert.throws(() => summarizeResponsePartition({ fixedDomain: 1000, bothCandidate: 200, conservativeOnlyCandidate: 0, monthlyOnlyCandidate: 0, neitherCandidate: 798 }), /partition/);
});
test('Phase 5C filtering cannot increase class candidates, even when accounting balances', () => {
  const s = matrix();
  s[2] = { ...summarizeOverlap(reduction([100, 200, 300, 400], [0, 12, 40, 80]), s[2]), patterns: {} };
  assert.throws(() => validateScenarioMatrix(s), /Filtering increased/);
});
test('Phase 5C missing measurement is distinct from an actual empty sum', () => {
  assert.equal(area({ empty: null }, 'empty'), 0);
  assert.throws(() => area({}, 'missing'), /Missing/);
  for (const v of [undefined, -1, NaN, Infinity]) assert.throws(() => area({ invalid: v }, 'invalid'), /Invalid/);
});
test('Phase 5C zero support, absent classes and zero candidate rates remain explicitly estimable or null', () => {
  const empty = summarizeOverlap(reduction([0, 0, 0, 0], [0, 0, 0, 0]), {});
  assert.equal(pattern(empty).monotonicNondecreasingAcrossClasses, null);
  assert.equal(pattern(empty).higherGroupRateExceedsLower, null);
  assert.equal(empty.candidateRate, null);
  const absent = summarizeOverlap(reduction([0, 200, 300, 400], [0, 0, 30, 40]), {});
  assert.equal(absent.rows[0].candidatePercent, null);
  assert.equal(absent.rows[1].candidatePercent, 0);
  assert.equal(absent.groupedComparison.higherToLowerRateRatio, null);
  assert.equal(summarizeClassLosses(Object.fromEntries(['ahpClassInAoi', 'nativeDomain', ...LOSS_KEYS].map(k => [k, null]))).nativeRetentionPercent, null);
});
test('Phase 5C loss accounting rejects unassigned class area', () => {
  const raw = { ahpClassInAoi: 100, nativeDomain: 50, missingSar: 10, smoothingUnsupported: 10,
    historicalUnknown: 10, historicalPermanentExcluded: 10, terrainUnknown: 10 };
  assert.equal(summarizeClassLosses(raw).accountingPassed, true);
  assert.throws(() => summarizeClassLosses({ ...raw, terrainUnknown: 8 }), /partition/);
});
test('Phase 5C prior comparison preserves original domain identities and reports actual differences', () => {
  const scenarios = matrix();
  const prior = { scenarios: scenarios.map(s => ({ ...s, domainKind: s.domainKind === 'native' ? 'reference-specific-stage-shared' : 'identical-cross-reference' })) };
  assert.equal(comparePrior({ scenarios }, prior).status, 'REPRODUCED_WITHIN_TOLERANCE');
  const changed = structuredClone(prior); changed.scenarios[0].candidateAreaKm2 += .000002;
  assert.equal(comparePrior({ scenarios }, changed).differences.length, 1);
});
test('Phase 5C CSV exports retain scenes, thresholds, grid and validation status in every row', () => {
  const scenarios = matrix(), classLosses = Object.fromEntries(METHODS.map(m => [m, CLASSES.map(c => ({ ...c,
    ahpClassInAoiKm2: 1, nativeDomainKm2: .1, nativeRetentionPercent: 10, lossesKm2: { historicalUnknown: .9 } }))]));
  const parameters = { sceneIds: SCENES, filters: { maxSlopeDegrees: 5, minConnectedPixels: 8 } };
  const rows = exportRows({ scenarios, classLosses, parameters, responsePartitions: partitions(),
    sensitivity: deriveSensitivity(scenarios, partitions()), scientificValidationStatus: 'DATA_NOT_READY',
    methodology: { grid: { crs: 'EPSG:32644', transform: [10, 0, 0, 0, -10, 0] } },
    globalDiagnostics: Object.fromEntries(METHODS.map(m => [m, { exclusiveLossesKm2: { historicalUnknown: .9 } }])) });
  assert.equal(rows['scenario-results.csv'].length, 12);
  assert.equal(rows['hazard-class-overlap.csv'].length, 48);
  assert.equal(rows['fixed-matched-domain-comparison.csv'].length, 24);
  assert.equal(rows['filter-class-removals.csv'].length, 32);
  for (const entries of Object.values(rows)) for (const row of entries) {
    assert.equal(row.beforeSceneId, SCENES.before); assert.equal(row.laterSceneId, SCENES.later);
    assert.deepEqual(JSON.parse(row.parametersJson), parameters);
    assert.equal(row.independentValidationStatus, 'DATA_NOT_READY');
    assert.equal(JSON.parse(row.gridJson).crs, 'EPSG:32644');
  }
  assert.match(csv([{ value: null, note: 'comma, "quote"' }]), /"comma, ""quote"""/);
});

// Vary pixel areas and masks independently to verify real geographic mask algebra.
function rasterFixture() {
  const n = 8, weights = [100, 200, 300, 400, 500, 600, 700, 800];
  const vec = v => v instanceof Raster ? v : new Raster(Array(n).fill(v));
  class Raster {
    constructor(values, masks = Array(n).fill(1), name = 'value') { this.values = values; this.masks = masks; this.name = name; }
    op(v, fn) { v = vec(v); return new Raster(this.values.map((x, i) => fn(x, v.values[i])), this.masks.map((m, i) => Number(!!(m && v.masks[i])))); }
    and(v) { return this.op(v, (a, b) => Number(!!(a && b))); }
    or(v) { return this.op(v, (a, b) => Number(!!(a || b))); }
    eq(v) { return this.op(v, (a, b) => Number(a === b)); }
    gt(v) { return this.op(v, (a, b) => Number(a > b)); }
    not() { return new Raster(this.values.map(v => Number(!v)), this.masks); }
    mask() { return new Raster(this.masks); }
    unmask(value) { return new Raster(this.values.map((v, i) => this.masks[i] ? v : value)); }
    updateMask(v) { v = vec(v); return new Raster(this.values, this.masks.map((m, i) => Number(!!(m && v.masks[i] && v.values[i]))), this.name); }
    rename(name) { return new Raster(this.values, this.masks, name); }
    remap(from, to, fallback) { return new Raster(this.values.map(v => from.includes(v) ? to[from.indexOf(v)] : fallback), this.masks); }
    reproject() { return this; } clip() { return this; }
  }
  const graph = { grid: { name: 'exact-affine' }, aoi: {} };
  graph.gridOptions = { crs: graph.grid, geometry: graph.aoi };
  const ee = { Image: { constant: vec, pixelArea: () => new Raster(weights), cat: bands => ({ reduceRegion: options => {
    assert.equal(options.crs, graph.grid); assert.equal(options.scale, undefined); assert.equal(options.bestEffort, undefined);
    return Object.fromEntries(bands.map(b => [b.name, b.values.reduce((s, v, i) => s + (b.masks[i] ? v : 0), 0)]));
  } }) }, Reducer: { sum: () => 'sum' } };
  const raster = a => new Raster(a);
  const classes = raster([1, 2, 3, 4, 4, 3, 2, 1]);
  const hazard = { analysisProjection: { atScale: v => { assert.equal(v, 30); return 'ahp-30'; } },
    landHazardClass: classes, hazardClass: classes, waterBoolean: vec(0) };
  const masks = { common: raster([0, 1, 1, 1, 1, 1, 1, 1]), smoothing: raster([1, 0, 1, 1, 1, 1, 1, 1]), smoothedValues: vec(1),
    valid: raster([1, 1, 0, 1, 1, 1, 1, 1]), eligible: raster([1, 1, 0, 0, 1, 1, 1, 1]),
    permanent: raster([0, 0, 0, 1, 0, 0, 0, 0]), terrainUnknown: raster([0, 0, 0, 0, 1, 0, 0, 0]) };
  graph.commonMask = masks.common;
  return { ee, graph, hazard, masks, raster, vec, active: image => image.values.flatMap((v, i) => image.masks[i] && v ? [i] : []) };
}
test('Phase 5C exact six-support intersection retains supported negatives, independent of candidate self masks', () => {
  const f = rasterFixture();
  const c = buildSupports(f.ee, f.graph, f.hazard, { supportMasks: f.masks, stageImages: { raw: f.vec(0), terrain: f.vec(0), final: f.vec(0) } });
  const m = buildSupports(f.ee, f.graph, f.hazard, { supportMasks: { ...f.masks, valid: f.vec(1), eligible: f.raster([1, 1, 1, 0, 1, 1, 1, 1]) } });
  const fixed = intersectMasks([c, m].flatMap(p => STAGES.map(s => p.stageSupports[s])));
  assert.deepEqual(f.active(c.stageSupports.raw), [4, 5, 6, 7]);
  assert.deepEqual(f.active(m.stageSupports.raw), [2, 4, 5, 6, 7]);
  assert.deepEqual(f.active(fixed), [5, 6, 7]);
  const measured = overlapComputation(f.ee, f.graph, c.classes, fixed, f.vec(0));
  assert.equal(measured.domain, 2100); assert.equal(measured.candidate, 0);
  assert.equal(measured.nonCandidate_1, 800); // supported negative is retained
});
test('Phase 5C real class-loss masks partition each geographic class without double counting', () => {
  const f = rasterFixture();
  const totals = Object.fromEntries(LOSS_KEYS.map(k => [k, 0]));
  for (const c of CLASSES) {
    const raw = reduceMasks(f.ee, f.graph, classLossMasks(f.hazard.landHazardClass, c.code, { supportMasks: f.masks }, f.graph));
    const s = summarizeClassLosses(raw); assert.equal(s.accountingPassed, true);
    for (const key of LOSS_KEYS) totals[key] += raw[key];
  }
  assert.deepEqual(totals, { missingSar: 100, smoothingUnsupported: 200, historicalUnknown: 300,
    historicalPermanentExcluded: 400, terrainUnknown: 500 });
});
test('Phase 5C geographic identity check detects masks with equal areas but different locations', () => {
  const f = rasterFixture();
  // 100 + 200 m² versus 300 m²: same area, disjoint locations.
  const a = f.raster([1, 1, 0, 0, 0, 0, 0, 0]), b = f.raster([0, 0, 1, 0, 0, 0, 0, 0]);
  const raw = reduceMasks(f.ee, f.graph, { a, b, disagreement: symmetricDifference(a, b) });
  assert.equal(raw.a, raw.b); assert.equal(raw.disagreement, 600);
  assert.throws(() => close(raw.disagreement, 0, 'Spatial identity'), /Spatial identity/);
});
