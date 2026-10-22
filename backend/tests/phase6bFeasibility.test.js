const test = require('node:test');
const assert = require('node:assert/strict');
const { calendarWindowContains, classifyCombination, verifySupportAreas, frozenParameters } = require('../research/phase6b/feasibility');
const { FILTERS, STAGES } = require('../services/ahpSarResearchService');
const { SETTINGS } = require('../services/sarCandidateService');
const pair = { status: 'suitable', sharedPolarizations: ['VV'], duringAcquiredAt: '2016-05-29T00:24:47.650Z', reasons: [] };
const reference = { geometryAcquired: true, geometryAndCrsQualified: true, positiveLabelsVerified: true,
  eventYear: 2016, observationInstantUtc: '2016-05-29T00:24:47.650Z',
  provenanceVerified: true, observationTimeVerified: true, temporalComparisonApproved: true,
  externalMethodIndependenceVerified: true, licenceVerified: true, sensorIndependent: true,
  negativeLabelsVerified: false, observationFootprintVerified: false };
const overlap = { referenceAoiKm2: 52, referenceSarSupportKm2: 0.8 };

test('collection calendar windows include observations but do not qualify their simultaneous flood state', () => {
  assert.equal(calendarWindowContains('2016-05-23', '2016-06-02', pair.duringAcquiredAt), true);
  assert.equal(calendarWindowContains('2016-05-23', '2016-06-02', '2016-05-22T12:56:51Z'), false);
  assert.throws(() => calendarWindowContains('2016-05-33', '2016-06-02', pair.duringAcquiredAt));
  assert.throws(() => calendarWindowContains('2016-06-02', '2016-05-23', pair.duringAcquiredAt));
  const result = classifyCombination({ pair, reference: { ...reference, observationInstantUtc: null, observationTimeVerified: false, temporalComparisonApproved: false }, overlap });
  assert.equal(result.status, 'DATA_NOT_READY'); assert.equal(result.deltaHours, null);
});
test('matching footprint alone cannot overcome different orbit/polarization or missing VV compatibility', () => {
  assert.equal(classifyCombination({ pair: { ...pair, status: 'incompatible', reasons: ['Different relative orbit.'] }, reference, overlap }).status, 'REFERENCE_INCOMPATIBLE');
  assert.equal(classifyCombination({ pair: { ...pair, sharedPolarizations: ['VH'] }, reference, overlap }).status, 'REFERENCE_INCOMPATIBLE');
});
test('unknown overlap is not empty overlap; measured zero and absent supported values stay distinct', () => {
  assert.equal(classifyCombination({ pair, reference, overlap: { ...overlap, referenceSarSupportKm2: 0 } }).status, 'REFERENCE_INCOMPATIBLE');
  assert.equal(classifyCombination({ pair, reference, overlap: { referenceAoiKm2: null, referenceSarSupportKm2: null } }).status, 'DATA_NOT_READY');
});
test('a map viewport, sign-in HTML or similarly named NSDI category cannot become qualified labels', () => {
  for (const flag of ['geometryAcquired', 'geometryAndCrsQualified', 'positiveLabelsVerified', 'provenanceVerified', 'externalMethodIndependenceVerified', 'licenceVerified']) {
    assert.equal(classifyCombination({ pair, reference: { ...reference, [flag]: false }, overlap }).status, 'DATA_NOT_READY');
  }
});
test('explicitly different dates are temporal incompatibility only against a justified supplied tolerance', () => {
  const dated = { ...reference, observationInstantUtc: '2016-05-19T00:24:47.650Z', acceptedMaxOffsetHours: 1 };
  const r = classifyCombination({ pair, reference: dated, overlap });
  assert.equal(r.status, 'TEMPORALLY_INCOMPATIBLE'); assert.equal(r.deltaHours, 240);
  assert.equal(frozenParameters().timeToleranceDefault, null);
  assert.equal(classifyCombination({ pair, reference: { ...reference, eventYear: 2017 }, overlap }).status, 'TEMPORALLY_INCOMPATIBLE');
});
test('ready mode is restricted to positive coverage unless negatives and assessed observation support are verified', () => {
  assert.equal(classifyCombination({ pair, reference, overlap }).mode, 'positive-only');
  assert.equal(classifyCombination({ pair, reference: { ...reference, negativeLabelsVerified: true }, overlap }).mode, 'positive-only');
  assert.equal(classifyCombination({ pair, reference: { ...reference, negativeLabelsVerified: true, observationFootprintVerified: true }, overlap }).mode, 'positive-and-negative');
});
function areas() { return { aoiRaster: 100, referenceSubsetRaster: 50, commonSar: 98, smoothing: 95,
  historicalSupported: 8, historicalEligible: 4, terrainUnknown: 0, stageSharedDomain: 4,
  referenceInsideCommonSar: 49, referenceInsideStageSharedDomain: 1, identicalCrossPolicyDomain: 4,
  referenceInsideIdenticalCrossPolicyDomain: 1 }; }
test('geographic area subset accounting rejects missing/negative/unsupported values', () => {
  assert.equal(verifySupportAreas(areas()), true);
  for (const patch of [{ commonSar: 101 }, { smoothing: 99 }, { historicalEligible: 9 }, { referenceInsideStageSharedDomain: 5 },
    { identicalCrossPolicyDomain: 5 }, { referenceInsideIdenticalCrossPolicyDomain: 2 }, { terrainUnknown: null }, { referenceSubsetRaster: -1 }]) {
    assert.throws(() => verifySupportAreas({ ...areas(), ...patch }));
  }
});
test('existing SAR thresholds, filtering parameters and three-stage definitions are reused without mutation', () => {
  const r = frozenParameters();
  assert.equal(r.filters, FILTERS); assert.equal(r.stages, STAGES); assert.equal(r.candidateSettings, SETTINGS);
  assert.deepEqual(r.filters, { terrainFilter: 'slope-v1', maxSlopeDegrees: 5, clusterFilter: 'connected-v1', minConnectedPixels: 8 });
  assert.equal(r.tuningPerformed, false);
});
