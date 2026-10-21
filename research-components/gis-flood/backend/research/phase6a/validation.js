// Isolated research utilities. No production routes, algorithms or thresholds.
const { intersectMasks, FILTERS, STAGES } = require('../../services/ahpSarResearchService');
const { SCENES } = require('../../services/sarPixelQuality');
const TOLERANCE_M2 = 1;

function utcMillis(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw new Error('An explicit UTC observation timestamp is required.');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19)) throw new Error('Invalid observation calendar date.');
  return time;
}
function temporalAudit(observedStartUtc, observedEndUtc, sarTimeUtc) {
  const start = utcMillis(observedStartUtc), end = utcMillis(observedEndUtc), sar = utcMillis(sarTimeUtc);
  if (end < start) throw new Error('Reference observation interval is reversed.');
  return { observedStartUtc, observedEndUtc, sarTimeUtc,
    offsetHoursRange: [(start - sar) / 3600000, (end - sar) / 3600000],
    sarInsideObservationInterval: sar >= start && sar <= end,
    sameCalendarDay: observedStartUtc.slice(0, 10) === sarTimeUtc.slice(0, 10) && observedEndUtc.slice(0, 10) === sarTimeUtc.slice(0, 10),
    temporalEquivalenceEstablished: false };
}
function provenanceRecord({ officialUrl, sha256, filename, acquiredAt }) {
  const url = new URL(officialUrl);
  if (url.protocol !== 'https:' || url.username || url.password || !/^[a-f0-9]{64}$/.test(sha256 || '') || !filename) throw new Error('Missing or invalid reference provenance.');
  utcMillis(acquiredAt);
  return { officialUrl, sha256, filename, acquiredAt };
}
function qualifyReference(reference) {
  const reasons = [];
  if (!reference) return { status: 'DATA_NOT_READY', reasons: ['No qualified reference dataset has been supplied.'] };
  if (!(Number.isFinite(reference.commonSupportAreaKm2) && reference.commonSupportAreaKm2 > 0)) reasons.push('No measured positive common reference/SAR support.');
  if (!reference.geometryAndCrsVerified) reasons.push('Geometry validity and declared CRS are not verified.');
  if (!reference.provenanceVerified) reasons.push('File provenance has not been verified.');
  if (!reference.observationTimeVerified) reasons.push('Imagery observation time is not verified.');
  if (!reference.temporalComparisonApproved) reasons.push('Temporal mismatch has not been scientifically accepted and documented.');
  if (!reference.externalProcessingVerified) reasons.push('Independence from this candidate algorithm has not been verified.');
  if (!reference.licenceVerified) reasons.push('Reference use and attribution terms are not verified.');
  if (!reference.positiveLabelsVerified) reasons.push('Reliable flood-positive labels are unavailable.');
  if (reasons.length) return { status: reference.commonSupportAreaKm2 === 0 ? 'REFERENCE_INCOMPATIBLE' : 'DATA_NOT_READY', reasons };
  return { status: 'QUALIFIED_FOR_RESEARCH', mode: reference.negativeLabelsVerified && reference.observationFootprintVerified ? 'positive-and-negative' : 'positive-only',
    sensorIndependent: reference.sensorIndependent === true,
    warning: reference.sensorIndependent === true ? 'Independent reference still has observation uncertainty.' : 'Common-sensor dependence must be disclosed; this is not sensor-independent validation.' };
}
function area(raw, key) {
  if (!Object.hasOwn(raw, key)) throw new Error(`Missing measured area: ${key}`);
  if (raw[key] === null) return 0; // explicitly evaluated empty EE sum
  if (!Number.isFinite(raw[key]) || raw[key] < 0) throw new Error(`Invalid measured area: ${key}`);
  return raw[key];
}
function close(a, b, name) {
  if (Math.abs(a - b) > TOLERANCE_M2) throw new Error(`Area accounting failed: ${name}`);
}
const divide = (a, b) => b > 0 ? a / b : null;
function summarizeEvaluation(raw, qualification) {
  if (qualification?.status !== 'QUALIFIED_FOR_RESEARCH' || !['positive-only', 'positive-and-negative'].includes(qualification.mode)) throw new Error('Reference must qualify before evaluation.');
  const domain = area(raw, 'domain'), tp = area(raw, 'tp'), fn = area(raw, 'fn'), positive = area(raw, 'positive');
  close(positive, tp + fn, 'positive = covered + missed');
  if (positive > domain + TOLERANCE_M2) throw new Error('Positive labels exceed domain');
  const base = { mode: qualification.mode, validComparisonAreaKm2: domain / 1e6,
    floodSupportKm2: positive / 1e6, coveredPositiveAreaKm2: tp / 1e6, missedPositiveAreaKm2: fn / 1e6,
    positiveReferenceCoverage: divide(tp, positive),
    tpKm2: tp / 1e6, fnKm2: fn / 1e6, fpKm2: null, tnKm2: null, nonFloodSupportKm2: null,
    precision: null, recall: null, f1: null, iou: null, confusionMatrixKm2: null, toleranceM2: TOLERANCE_M2 };
  if (qualification.mode === 'positive-only') {
    close(domain, positive, 'positive-only evaluated domain');
    return { ...base, limitations: ['Only flood-positive reference support was evaluated. Absence of flood polygons is unknown, not a non-flood label. Full confusion matrix and classification metrics are unavailable.'] };
  }
  const fp = area(raw, 'fp'), tn = area(raw, 'tn'), negative = area(raw, 'negative');
  if (area(raw, 'labelConflict') !== 0) throw new Error('Reference positive and negative labels conflict.');
  close(negative, fp + tn, 'negative = fp + tn');
  close(domain, positive + negative, 'evaluated domain = positive + negative');
  close(domain, tp + fn + fp + tn, 'confusion partition');
  return { ...base, fpKm2: fp / 1e6, tnKm2: tn / 1e6, nonFloodSupportKm2: negative / 1e6,
    precision: divide(tp, tp + fp), recall: divide(tp, tp + fn), f1: divide(2 * tp, 2 * tp + fp + fn), iou: divide(tp, tp + fp + fn),
    confusionMatrixKm2: { rows: ['referenceFlood', 'referenceNonFlood'], columns: ['candidate', 'nonCandidate'], values: [[tp / 1e6, fn / 1e6], [fp / 1e6, tn / 1e6]] } };
}

function sarSupportedDomain(candidate) {
  const m = candidate.supportMasks;
  if (!m?.terrainUnknown) throw new Error('The controlled slope filter must expose terrain validity.');
  return intersectMasks([m.common, m.smoothing, m.smoothedValues, m.valid, m.eligible,
    m.terrainUnknown.unmask(0, false).gt(0).not()]);
}
// For future qualified references. Footprint must represent actual observations;
// an activation AOI must never be passed as an assessed footprint.
function buildEvaluation(ee, graph, candidate, reference, qualification, sharedSarDomain = null) {
  if (qualification?.status !== 'QUALIFIED_FOR_RESEARCH') throw new Error('Unqualified reference cannot be rasterized for validation.');
  const positive = reference.positive, negative = reference.negative;
  if (!positive || (qualification.mode === 'positive-and-negative' && (!negative || !reference.observed))) throw new Error('Verified label/observation masks are missing.');
  const referenceDomain = qualification.mode === 'positive-only' ? positive : intersectMasks([
    reference.observed, positive.unmask(0, false).gt(0).or(negative.unmask(0, false).gt(0))]);
  const domain = intersectMasks([sarSupportedDomain(candidate), referenceDomain,
    ...(sharedSarDomain ? [sharedSarDomain] : [])]).reproject(graph.grid).clip(graph.aoi);
  const computations = {};
  for (const stage of STAGES) {
    const response = candidate.stageImages[stage].unmask(0, false).gt(0);
    const flood = intersectMasks([domain, positive]);
    const masks = { domain, positive: flood, tp: flood.and(response), fn: flood.and(response.not()) };
    if (qualification.mode === 'positive-and-negative') {
      const nonFlood = intersectMasks([domain, negative]);
      masks.negative = nonFlood; masks.fp = nonFlood.and(response); masks.tn = nonFlood.and(response.not());
      masks.labelConflict = flood.and(nonFlood);
    }
    computations[stage] = ee.Image.cat(Object.entries(masks).map(([name, mask]) => ee.Image.pixelArea().updateMask(mask).rename(name)))
      .reduceRegion({ ...graph.gridOptions, maxPixels: 1e9, reducer: ee.Reducer.sum() });
  }
  return { computations, domain, filters: FILTERS, sceneIds: SCENES,
    gridRule: 'Exact before-VV CRS and affine transform; categorical masks sampled by nearest neighbor; ee.Image.pixelArea weighted area. Vector rasterization must document boundary assignment and native reference resolution.' };
}
module.exports = { TOLERANCE_M2, utcMillis, temporalAudit, provenanceRecord, qualifyReference,
  summarizeEvaluation, sarSupportedDomain, buildEvaluation };
