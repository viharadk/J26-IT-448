const { bounded, evaluate, mapId } = require('./sarPreviewService');
const { CONSERVATIVE, MONTHLY_DRY, referencePolicy, buildWaterReference } = require('./sarWaterReferenceService');
const { parseFilters, buildFiltering, summarizeFiltering } = require('./sarFiltering');
const LABEL = 'Experimental SAR-Derived Flood Candidates — Unvalidated';
const SETTINGS = Object.freeze({ smoothingRadiusMeters: 30, laterWaterThresholdDb: -15, decreaseThresholdDb: -3,
  beforeNonWaterThresholdDb: -15, slopeFilterApplied: false });
const STYLE = Object.freeze({ min: 1, max: 1, palette: ['ff4fd8'] });
const FILTER_STYLES = { terrain: { min: 1, max: 1, palette: ['ffad33'] }, final: { min: 1, max: 1, palette: ['00e5ff'] } };
const LIMITATIONS = Object.freeze([
  'This mask identifies an exploratory threshold response, not confirmed flood extent, depth, peak inundation or detection accuracy.',
  'The -15 dB and -3 dB thresholds are explicit exploratory defaults, not locally calibrated or transferred validation from another polarization or event.',
  'S1A/S1B calibration, subpixel co-registration, baseline wetness and later historical water conditions remain unverified. In the 2017 research example, May 30 follows the documented event peak.',
  'Urban double-bounce, vegetation, rough water, wet soil, speckle and radar shadow can cause omissions and false candidates. No terrain-shadow correction is applied.',
  'Optional slope exclusion is a terrain heuristic, not proof of flooding or non-flooding. Missing terrain remains unobserved. Small disconnected patches are not necessarily false positives; connected filtering can remove real narrow or isolated inundation.',
  'Prior-year JRC water classes are 30 m Landsat-derived observations resampled by nearest neighbor; permanent-water omission and seasonal water remain possible. Unknown reference pixels are excluded.',
  'A 30 m radius mean in linear power reduces speckle but blurs boundaries. The 10 m analysis grid does not establish independent 10 m mapping accuracy. Missing pixels are unobserved, never classified dry.',
]);
function referenceYear(selection) {
  const match = selection.before.match(/_(\d{4})\d{4}T/);
  const year = Number(match?.[1]) - 1;
  if (!Number.isInteger(year) || year < 1984 || year > 2021) throw Object.assign(new Error('Experimental analysis requires prior-year JRC YearlyHistory (1984–2021). Live SAR previews remain available for other years.'), { status: 422, code: 'SAR_WATER_REFERENCE_UNAVAILABLE' });
  return year;
}
function buildCandidateGraph(ee, graph, year, policy = null, filters = parseFilters()) {
  const { grid, aoi, commonMask, gridOptions } = graph;
  // Average sigma0 power, never dB values; convert the mean back to dB.
  const smooth = image => ee.Image.constant(10).pow(image.divide(10)).reproject(grid).focalMean({ radius: SETTINGS.smoothingRadiusMeters,
    kernelType: 'circle', units: 'meters', iterations: 1 }).reproject(grid).log10().multiply(10);
  const before = smooth(graph.layers.before), later = smooth(graph.layers.later);
  const kernel = ee.Kernel.circle({ radius: SETTINGS.smoothingRadiusMeters, units: 'meters', normalize: false });
  // Require a complete valid neighborhood to prevent edge/missing samples from
  // changing the smoothing support between dates.
  const support = commonMask.unmask(0, false).reduceNeighborhood({ reducer: ee.Reducer.min(), kernel, skipMasked: false })
    .gt(0).and(commonMask).reproject(grid).clip(aoi);
  const reference = buildWaterReference(ee, graph, year, policy || referencePolicy({ before: `_${year + 1}0101T` }, year));
  const valid = support.and(reference.supported), permanent = support.and(reference.permanent);
  const eligible = support.and(reference.eligible);
  const candidates = later.lt(SETTINGS.laterWaterThresholdDb).and(later.subtract(before).lt(SETTINGS.decreaseThresholdDb))
    .and(before.gte(SETTINGS.beforeNonWaterThresholdDb)).and(eligible).updateMask(eligible).rename('candidates');
  const pixelArea = ee.Image.pixelArea();
  const areaBands = [pixelArea.rename('aoi'), pixelArea.updateMask(commonMask).rename('common'),
    pixelArea.updateMask(support).rename('smoothedSupport'), pixelArea.updateMask(valid).rename('valid'),
    pixelArea.updateMask(permanent).rename('permanent'), pixelArea.updateMask(eligible).rename('eligible'),
    pixelArea.updateMask(candidates).rename('candidate'),
    pixelArea.updateMask(support.and(reference.known)).rename('annualKnown'),
    pixelArea.updateMask(support.and(reference.notWater)).rename('annualNotWater'),
    pixelArea.updateMask(support.and(reference.seasonal)).rename('annualSeasonal'),
    pixelArea.updateMask(support.and(reference.monthlyEligible)).rename('monthlyInferred'),
    pixelArea.updateMask(candidates.and(reference.known)).rename('candidateAnnual'),
    pixelArea.updateMask(candidates.and(reference.monthlyEligible)).rename('candidateMonthly')];
  // Keep each reducer within the existing pixel budget without changing scale.
  const reduce = bands => ee.Image.cat(bands).reduceRegion({ ...gridOptions, reducer: ee.Reducer.sum() });
  const areas = ee.Dictionary(reduce(areaBands.slice(0, 6))).combine(reduce(areaBands.slice(6)), true);
  const image = candidates.selfMask().clip(aoi);
  const points = image.toByte().stratifiedSample({ numPoints: 1, classBand: 'candidates', region: aoi, projection: grid, seed: 22, geometries: true, tileScale: 4 });
  const enabled = filters.terrainFilter !== 'none' || filters.clusterFilter !== 'none';
  const filtering = enabled ? buildFiltering(ee, candidates, { ...graph, valid }, filters) : null;
  return { computation: ee.Dictionary({ areas, reference: reference.metadata,
    ...(filtering ? { filtering: filtering.computation } : {}),
    candidateCoordinates: points.toList(1).map(item => ee.Feature(item).geometry().coordinates()) }), image,
    stageImages: filtering ? filtering.images : { raw: image, terrain: image, final: image },
    // Server-only research handoff. Candidate-only transparency cannot define
    // valid negative responses; retain the actual processing support separately.
    supportMasks: { common: commonMask, smoothing: support, valid, eligible, permanent,
      smoothedValues: before.mask().gt(0).and(later.mask().gt(0)),
      terrainUnknown: filtering ? filtering.images.unknownSupport : null },
    referenceMetadata: reference.metadata };
}
function summarizeAreas(raw) {
  for (const key of ['aoi', 'common', 'smoothedSupport', 'valid', 'permanent', 'eligible', 'candidate']) {
    // EE returns null for a fully masked sum, which is a measured empty set.
    if (raw?.[key] === null && ['permanent', 'candidate', 'eligible'].includes(key)) raw[key] = 0;
    if (!Number.isFinite(raw?.[key]) || raw[key] < 0) throw new Error(`Missing/invalid ${key} pixel area.`);
  }
  if (!raw.valid || raw.common > raw.aoi + 1 || raw.smoothedSupport > raw.common + 1 || raw.valid > raw.smoothedSupport + 1 || raw.candidate > raw.eligible + 1 || raw.eligible > raw.valid + 1 || Math.abs(raw.valid - raw.eligible - raw.permanent) > 1) throw new Error('Candidate support/area invariants failed.');
  const provenance = {};
  if ('annualKnown' in raw) {
    for (const key of ['annualKnown', 'annualNotWater', 'annualSeasonal', 'monthlyInferred']) {
      if (raw[key] === null) raw[key] = 0;
      if (!Number.isFinite(raw[key]) || raw[key] < 0) throw new Error('Invalid reference provenance area.');
    }
    if (Math.abs(raw.annualKnown + raw.monthlyInferred - raw.valid) > 1 || Math.abs(raw.annualNotWater + raw.annualSeasonal + raw.permanent - raw.annualKnown) > 1) throw new Error('Reference provenance partition failed.');
    Object.assign(provenance, { observedAnnualSupportAreaKm2: raw.annualKnown / 1e6, annualNotWaterAreaKm2: raw.annualNotWater / 1e6,
      annualSeasonalWaterAreaKm2: raw.annualSeasonal / 1e6, monthlyInferredEligibleAreaKm2: raw.monthlyInferred / 1e6 });
    if ('candidateAnnual' in raw) {
      for (const key of ['candidateAnnual', 'candidateMonthly']) {
        if (raw[key] === null) raw[key] = 0;
        if (!Number.isFinite(raw[key]) || raw[key] < 0) throw new Error('Invalid candidate provenance area.');
      }
      if (Math.abs(raw.candidateAnnual + raw.candidateMonthly - raw.candidate) > 1 ||
          raw.candidateAnnual > raw.annualNotWater + raw.annualSeasonal + 1 || raw.candidateMonthly > raw.monthlyInferred + 1) throw new Error('Candidate provenance partition failed.');
      Object.assign(provenance, { candidateObservedAnnualAreaKm2: raw.candidateAnnual / 1e6, candidateMonthlyInferredAreaKm2: raw.candidateMonthly / 1e6 });
    }
  }
  return { ...provenance, rasterAoiAreaKm2: raw.aoi / 1e6, commonSarAreaKm2: raw.common / 1e6,
    validAnalysisAreaKm2: raw.valid / 1e6, candidateAreaKm2: raw.candidate / 1e6,
    candidatePercentOfValid: raw.candidate / raw.valid * 100, excludedPermanentWaterAreaKm2: raw.permanent / 1e6,
    eligibleNonPermanentAreaKm2: raw.eligible / 1e6, missingSarAreaKm2: Math.max(0, raw.aoi - raw.common) / 1e6,
    smoothingEdgeExcludedAreaKm2: Math.max(0, raw.common - raw.smoothedSupport) / 1e6,
    ancillaryUnknownAreaKm2: Math.max(0, raw.smoothedSupport - raw.valid) / 1e6,
    denominator: 'Valid analysis area = complete common-SAR smoothing neighborhoods with known prior-year water class, including permanent water. Candidates exclude permanent water. AOI = missing SAR + smoothing edges + unknown ancillary + valid analysis; all areas use the before-VV raster grid.' };
}
function createSarCandidateService({ preview, selection, referenceMethod = CONSERVATIVE, filters = parseFilters(), engine = () => require('./earthEngineService'), graphBuilder = buildCandidateGraph,
  evaluateValue = evaluate, mapImage = mapId, now = Date.now, timeoutMs = 120000 } = {}) {
  const year = referenceYear(selection);
  const policy = referencePolicy(selection, year, referenceMethod);
  let computed = null, cache = null, pending = null;
  async function analyze() {
    if (cache && now() - cache.time < 10 * 60000) return cache.data;
    if (pending) return pending;
    pending = (async () => {
      try {
        const { data: quality, graph } = await preview.qualityState(); // auth + selection validation reused
        if (!computed) {
          const candidate = graphBuilder(engine().ee, graph, year, policy, filters);
          const raw = await bounded(evaluateValue(candidate.computation), timeoutMs, 'candidate pixel-area computation');
          const areas = summarizeAreas(raw.areas || raw);
          if (referenceMethod === MONTHLY_DRY) areas.denominator = 'Valid analysis area = observed annual support plus separately reported inferred monthly non-water eligibility, on complete common-SAR neighborhoods. Candidates exclude observed annual permanent water. Unknown/unobserved reference pixels remain excluded; inferred support is not verified event-date land.';
          if (Math.abs(areas.commonSarAreaKm2 - quality.common.validPixelAreaKm2) > 0.001) throw new Error('Candidate and preview SAR supports differ.');
          const coordinates = raw.candidateCoordinates || [];
          if (!Array.isArray(coordinates) || coordinates.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) throw new Error('Invalid candidate sample coordinates.');
          const filtering = summarizeFiltering(raw.filtering, filters, areas, referenceMethod);
          computed = { candidate, areas, coordinates, filtering, reference: raw.reference || policy };
        }
        const tileUrl = await bounded(mapImage(computed.candidate.image, STYLE), timeoutMs, 'candidate tile generation');
        const rawLayer = { label: LABEL, tileUrl, visualization: STYLE, units: 'binary experimental response', mask: 'Candidate pixels only; transparent remainder is not classified dry.' };
        const layers = { raw: rawLayer };
        for (const stage of ['terrain', 'final']) {
          const isAlias = stage === 'terrain' ? filters.terrainFilter === 'none' : filters.clusterFilter === 'none';
          layers[stage] = { ...rawLayer, label: `${stage === 'terrain' ? 'After slope stage' : 'Final connected-component stage'} — ${LABEL}`,
            visualization: isAlias && filters.terrainFilter === 'none' && filters.clusterFilter === 'none' ? STYLE : FILTER_STYLES[stage],
            tileUrl: isAlias && filters.terrainFilter === 'none' && filters.clusterFilter === 'none' ? tileUrl :
              await bounded(mapImage(computed.candidate.stageImages[stage], FILTER_STYLES[stage]), timeoutMs, `${stage} candidate tile generation`),
            filterApplied: stage === 'terrain' ? filters.terrainFilter !== 'none' : filters.clusterFilter !== 'none' };
        }
        const data = { success: true, generatedAt: new Date(now()).toISOString(), renewAfterSeconds: 600, label: LABEL,
          sceneIds: selection, polarization: 'VV', qualityQueriedAt: quality.queriedAt, areas: computed.areas,
          candidateCoordinates: computed.coordinates,
          waterReference: computed.reference,
          filtering: computed.filtering, layers,
          supportWarning: `Experimental results cover ${computed.areas.validAnalysisAreaKm2.toFixed(3)} km² of ${computed.areas.rasterAoiAreaKm2.toFixed(3)} km² raster AOI. ${computed.areas.ancillaryUnknownAreaKm2.toFixed(3)} km² has unknown historical-water support. ` +
            (referenceMethod === MONTHLY_DRY ? `${(computed.areas.monthlyInferredEligibleAreaKm2 || 0).toFixed(3)} km² is inferred eligibility from historical monthly non-water detections, not verified event-date land. ` : '') + 'Do not interpret this as AOI-wide flood extent.',
          layer: rawLayer,
          methodology: { version: referenceMethod === CONSERVATIVE ? 'exploratory-v1' : 'exploratory-v2-monthly-dry', referenceMethod, settings: { ...SETTINGS, slopeFilterApplied: filters.terrainFilter !== 'none', clusterFilterApplied: filters.clusterFilter !== 'none' }, waterDataset: 'JRC/GSW1_4/YearlyHistory', waterReferenceYear: year,
            waterAttribution: 'Source: EC JRC/Google; Pekel et al., Nature 540, 418–422 (2016), doi:10.1038/nature20584',
            summary: 'VV dB → 10^(dB/10) → 30 m radius circular mean → 10*log10(mean power). Require later < -15 dB AND later-before < -3 dB AND before >= -15 dB; common complete neighborhoods; prior-year waterClass 3 excluded. Raw areas/layer retain this response. Optional slope then connectivity stages are reported separately. ' + policy.inference,
            thresholdRationale: '-3 dB is approximately a halving of radar power; -15 dB is an exploratory dark-surface screen. The conjunction screens newly darkened surfaces, not all negative changes. Neither threshold is empirically calibrated for Lower Kelani.',
            maxPixels: 50000000, tileScale: 4, floodValidation: 'none' },
          limitations: [...LIMITATIONS, ...(referenceMethod === MONTHLY_DRY ? [
            'Optional monthly support is inferred eligibility from observed historical non-water months, not verified event-date land or confirmed absence of permanent water. Expanded support or candidate area does not imply better flood accuracy.',
            'Annual classifications retain priority. Seasonal class 2 remains eligible and can produce seasonal-refilling false positives; zero water detections in the fallback window is not proof that water never occurred.',
          ] : [])] };
        cache = { time: now(), data }; return data;
      } catch (cause) {
        if ([422, 503, 504].includes(cause.status)) throw cause;
        throw Object.assign(new Error('Experimental SAR candidate computation failed; no candidate result is available.'), { status: 502, code: 'SAR_CANDIDATE_FAILED', cause });
      }
    })();
    try { return await pending; } finally { pending = null; }
  }
  return { analyze };
}
module.exports = { LABEL, SETTINGS, referenceYear, buildCandidateGraph, summarizeAreas, createSarCandidateService };
