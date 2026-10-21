const { utcMillis } = require('../phase6a/validation');
const { FILTERS, STAGES } = require('../../services/ahpSarResearchService');
const { SETTINGS } = require('../../services/sarCandidateService');

function calendarWindowContains(startDate, endDate, utc) {
  utcMillis(utc);
  for (const date of [startDate, endDate]) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(utcMillis(`${date}T00:00:00Z`)).toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar collection window.');
  }
  if (endDate < startDate) throw new Error('Collection interval is reversed.');
  return utc.slice(0, 10) >= startDate && utc.slice(0, 10) <= endDate;
}

function classifyCombination({ pair, reference, overlap }) {
  const reasons = [];
  if (reference.eventYear && Number(pair.duringAcquiredAt?.slice(0, 4)) !== reference.eventYear) return {
    status: 'TEMPORALLY_INCOMPATIBLE', mode: null, reasons: ['Reference and SAR refer to different event years.'] };
  if (pair.status !== 'suitable' || !pair.sharedPolarizations?.includes('VV')) return {
    status: 'REFERENCE_INCOMPATIBLE', mode: null,
    reasons: ['No production-compatible VV observation pair for this reference comparison.', ...(pair.reasons || [])] };
  if (overlap?.referenceAoiKm2 === 0 || overlap?.referenceSarSupportKm2 === 0) return {
    status: 'REFERENCE_INCOMPATIBLE', mode: null, reasons: ['Measured reference/AOI or reference/SAR common support is empty.'] };
  let deltaHours = null;
  if (reference.observationInstantUtc) {
    deltaHours = (utcMillis(pair.duringAcquiredAt) - utcMillis(reference.observationInstantUtc)) / 3600000;
    if (Number.isFinite(reference.acceptedMaxOffsetHours) && reference.acceptedMaxOffsetHours >= 0 &&
        Math.abs(deltaHours) > reference.acceptedMaxOffsetHours) return { status: 'TEMPORALLY_INCOMPATIBLE', mode: null,
      deltaHours, reasons: ['Observation mismatch exceeds the explicitly documented accepted offset.'] };
  }
  if (!reference.geometryAcquired) reasons.push('No usable georeferenced flood geometry acquired.');
  if (!reference.geometryAndCrsQualified) reasons.push('Source flood geometry/CRS is not fully qualified; a cartographic viewport is not a flood/observation mask.');
  if (!reference.positiveLabelsVerified) reasons.push('Reliable event-specific flood-positive semantics are not verified for the acquired geometry.');
  if (!reference.provenanceVerified) reasons.push('Dataset lineage is unverified; dates/methods from another similarly named map cannot be transferred.');
  if (!reference.observationInstantUtc || !reference.observationTimeVerified || !reference.temporalComparisonApproved) reasons.push('Per-label observation time and an accepted temporal comparison are unavailable. A multi-day collection interval does not prove simultaneous inundation.');
  if (!reference.externalMethodIndependenceVerified) reasons.push('Source method and independence from the candidate algorithm are not verified.');
  if (!reference.licenceVerified) reasons.push('Underlying geodata reuse/attribution terms need confirmation.');
  if (!(Number.isFinite(overlap?.referenceSarSupportKm2) && overlap.referenceSarSupportKm2 > 0)) reasons.push('Actual reference/SAR supported intersection is not established.');
  if (reasons.length) return { status: 'DATA_NOT_READY', mode: null, deltaHours, reasons };
  return { status: 'READY_FOR_LIMITED_VALIDATION', mode: reference.negativeLabelsVerified && reference.observationFootprintVerified ? 'positive-and-negative' : 'positive-only',
    deltaHours, sensorIndependent: reference.sensorIndependent === true,
    reasons: ['Only the verified common observations may be evaluated; no algorithm tuning is permitted on this reference.'] };
}

function verifySupportAreas(areas, toleranceKm2 = 1e-6) {
  const required = ['aoiRaster', 'referenceSubsetRaster', 'commonSar', 'smoothing', 'historicalSupported', 'historicalEligible',
    'terrainUnknown', 'stageSharedDomain', 'referenceInsideCommonSar', 'referenceInsideStageSharedDomain',
    'identicalCrossPolicyDomain', 'referenceInsideIdenticalCrossPolicyDomain'];
  for (const name of required) if (!Number.isFinite(areas?.[name]) || areas[name] < 0) throw new Error(`Missing/invalid spatial feasibility area: ${name}`);
  const below = (a, b) => { if (areas[a] > areas[b] + toleranceKm2) throw new Error(`Support subset failed: ${a} <= ${b}`); };
  for (const [a, b] of [['referenceSubsetRaster', 'aoiRaster'], ['commonSar', 'aoiRaster'], ['smoothing', 'commonSar'],
    ['historicalSupported', 'smoothing'], ['historicalEligible', 'historicalSupported'], ['stageSharedDomain', 'historicalEligible'],
    ['referenceInsideCommonSar', 'commonSar'], ['referenceInsideCommonSar', 'referenceSubsetRaster'],
    ['referenceInsideStageSharedDomain', 'stageSharedDomain'], ['referenceInsideStageSharedDomain', 'referenceInsideCommonSar'],
    ['identicalCrossPolicyDomain', 'stageSharedDomain'], ['referenceInsideIdenticalCrossPolicyDomain', 'identicalCrossPolicyDomain'],
    ['referenceInsideIdenticalCrossPolicyDomain', 'referenceInsideStageSharedDomain']]) below(a, b);
  return true;
}
function frozenParameters() { return { filters: FILTERS, candidateSettings: SETTINGS, stages: STAGES,
  tuningPerformed: false, timeToleranceDefault: null }; }
module.exports = { calendarWindowContains, classifyCombination, verifySupportAreas, frozenParameters };
