const { SCENES } = require('./sarPixelQuality');
const { SETTINGS, buildCandidateGraph, referenceYear } = require('./sarCandidateService');
const { CONSERVATIVE, MONTHLY_DRY, referencePolicy } = require('./sarWaterReferenceService');
const { parseFilters } = require('./sarFiltering');
const { createSarPreviewService, evaluate, bounded } = require('./sarPreviewService');
const { validateSelectedQuality } = require('./sarSelectionService');

// Verified against hazardService.classifyHazard and floodController labels.
const CLASSES = Object.freeze([
  Object.freeze({ code: 1, label: 'Low' }), Object.freeze({ code: 2, label: 'Moderate' }),
  Object.freeze({ code: 3, label: 'High' }), Object.freeze({ code: 4, label: 'Very High' })
]);
const FILTERS = Object.freeze(parseFilters({ terrainFilter: 'slope-v1', maxSlopeDegrees: 5,
  clusterFilter: 'connected-v1', minConnectedPixels: 8 }));
const STAGES = Object.freeze(['raw', 'terrain', 'final']);
const TOLERANCE_M2 = 1; // absolute tolerance, applied to unrounded EE area sums
const CAVEATS = Object.freeze([
  'This is preliminary spatial agreement, not independent validation. No independent event flood labels are used.',
  'AHP susceptibility and event-date experimental SAR responses represent different concepts. Supported non-candidates are not confirmed dry or flood-free.',
  'Sentinel-1 May 30 observations are after the approximate May 2017 event peak; peak inundation cannot be inferred.',
  'The pair uses Sentinel-1A and Sentinel-1B; cross-platform consistency and subpixel co-registration have not been independently verified.',
  'Historical JRC water support has major limitations: sparse annual observations, seasonal water eligibility, retrospective processing, and optional monthly non-water inference do not establish event-date land or water.',
  'AHP uses demonstration judgments and preliminary class cutoffs. WorldCover 2021 and historical global water occurrence are not contemporaneous 2017 inputs; this is retrospective susceptibility comparison.',
  'The 10 m evaluation grid does not create independent 10 m measurements from 30 m SRTM/JRC inputs. Spatially dependent pixels provide no significance or causal evidence.',
  'Slope and connected-component screening can remove real flood responses. Agreement changes or expanded support do not imply improved accuracy.',
  'Neither function currently establishes verified flood prediction accuracy.'
]);
const DYNAMIC_CAVEATS = Object.freeze([
  'This is preliminary spatial agreement, not independent validation. No independent event flood labels are used.',
  'AHP susceptibility and experimental SAR responses represent different concepts. Supported non-candidates are not confirmed dry or flood-free.',
  'The selected acquisition dates do not establish flood timing, event peak, rainfall, water level or residual-water conditions.',
  'Cross-platform radiometric consistency and subpixel co-registration have not been independently verified.',
  'Historical JRC water support is retrospective. Conservative annual and optional monthly inference do not establish event-date land or water.',
  'AHP uses demonstration judgments and preliminary class cutoffs. WorldCover 2021 and historical global-water inputs may not be contemporaneous with the selected SAR dates.',
  'The evaluation grid does not increase the native information content of coarser AHP inputs. Spatially dependent pixels provide no significance or causal evidence.',
  'Slope and connected-component screening can remove real responses. Agreement changes or expanded support do not imply improved accuracy.',
  'Neither function currently establishes verified flood prediction accuracy.'
]);

function ratio(a, b) { return b > 0 ? a / b : null; }
function measuredArea(raw, key) {
  if (!(key in raw)) throw new Error(`Missing research area: ${key}.`);
  if (raw[key] === null) return 0; // EE sum over a genuinely empty masked set
  if (!Number.isFinite(raw[key]) || raw[key] < 0) throw new Error(`Invalid research area: ${key}.`);
  return raw[key];
}
function checkClose(a, b, label) {
  if (Math.abs(a - b) > TOLERANCE_M2) throw new Error(`${label}: ${a} versus ${b} m2 exceeds ${TOLERANCE_M2} m2 tolerance.`);
}
function summarizeOverlap(raw, identity) {
  const domain = measuredArea(raw, 'domain'), candidate = measuredArea(raw, 'candidate');
  if (candidate > domain + TOLERANCE_M2) throw new Error('Candidates exceed the comparison domain.');
  checkClose(measuredArea(raw, 'unexpectedClass'), 0, 'Unrecognized AHP encoding');
  checkClose(measuredArea(raw, 'candidateOutsideDomain'), 0, 'Candidate intersection leak');
  const baseRate = ratio(candidate, domain);
  const rows = CLASSES.map(({ code, label }) => {
    const area = measuredArea(raw, `class_${code}`), overlap = measuredArea(raw, `candidate_${code}`);
    const nonCandidate = measuredArea(raw, `nonCandidate_${code}`);
    checkClose(area, overlap + nonCandidate, `Class ${code} partition`);
    if (overlap > area + TOLERANCE_M2) throw new Error(`Class ${code} candidates exceed class area.`);
    const rate = ratio(overlap, area);
    return { code, label, domainAreaKm2: area / 1e6, candidateAreaKm2: overlap / 1e6,
      nonCandidateAreaKm2: nonCandidate / 1e6, candidatePercent: rate === null ? null : rate * 100,
      candidateSharePercent: candidate > 0 ? overlap / candidate * 100 : null,
      domainSharePercent: domain > 0 ? area / domain * 100 : null,
      enrichmentRatio: rate !== null && baseRate > 0 ? rate / baseRate : null };
  });
  const sum = key => rows.reduce((n, row) => n + row[key], 0) * 1e6;
  checkClose(sum('domainAreaKm2'), domain, 'Class/domain accounting');
  checkClose(sum('candidateAreaKm2'), candidate, 'Class/candidate accounting');
  checkClose(sum('nonCandidateAreaKm2') + candidate, domain, 'Non-candidate accounting');
  const group = codes => {
    const items = rows.filter(row => codes.includes(row.code));
    const area = items.reduce((n, row) => n + row.domainAreaKm2, 0);
    const overlap = items.reduce((n, row) => n + row.candidateAreaKm2, 0);
    return { codes, domainAreaKm2: area, candidateAreaKm2: overlap, candidateRate: ratio(overlap, area) };
  };
  const lower = group([1, 2]), higher = group([3, 4]);
  return { ...identity, commonDomainAreaKm2: domain / 1e6, candidateAreaKm2: candidate / 1e6,
    nonCandidateAreaKm2: (domain - candidate) / 1e6, candidateRate: baseRate, rows,
    groupedComparison: { lower, higher,
      higherToLowerRateRatio: higher.candidateRate !== null && lower.candidateRate > 0 ? higher.candidateRate / lower.candidateRate : null,
      rateDifferencePercentagePoints: higher.candidateRate !== null && lower.candidateRate !== null ? (higher.candidateRate - lower.candidateRate) * 100 : null },
    accounting: { toleranceM2: TOLERANCE_M2, passed: true,
      domainResidualM2: sum('domainAreaKm2') - domain, candidateResidualM2: sum('candidateAreaKm2') - candidate },
    estimability: domain === 0 ? 'No common valid domain; rates are not estimable.' : candidate === 0 ? 'No candidates; distribution shares and enrichment are not estimable.' : 'Area-based descriptive measures only.' };
}

// Boolean masks are filled with false solely for set algebra. This never fills
// an unknown classification with a negative candidate response.
function booleanMask(image) { return image.unmask(0, false).gt(0); }
function intersectMasks(masks) {
  if (!masks.length) throw new Error('A comparison requires explicit validity masks.');
  return masks.map(booleanMask).reduce((a, b) => a.and(b));
}
function prepareDomain(ee, graph, hazard, candidate) {
  const masks = candidate.supportMasks;
  const ahpGrid = hazard.analysisProjection.atScale(30);
  // Fix the existing AHP graph at its intended 30 m SRTM evaluation grid first,
  // then nearest-neighbor sample the categorical result onto the SAR grid.
  const classes = hazard.landHazardClass.reproject(ahpGrid).reproject(graph.grid).clip(graph.aoi);
  const ahpValid = booleanMask(classes.mask());
  const originalAhpValid = booleanMask(hazard.hazardClass.reproject(ahpGrid).reproject(graph.grid).mask());
  const worldCoverWater = booleanMask(hazard.waterBoolean.reproject(ahpGrid).reproject(graph.grid));
  const recognized = CLASSES.map(item => classes.unmask(-999, false).eq(item.code)).reduce((a, b) => a.or(b));
  const smoothing = intersectMasks([masks.smoothing, masks.smoothedValues]);
  const terrainUnknown = masks.terrainUnknown ? booleanMask(masks.terrainUnknown) : ee.Image.constant(0);
  const components = [graph.commonMask, smoothing, ahpValid, recognized, masks.valid, masks.eligible, terrainUnknown.not()];
  const domain = intersectMasks(components).reproject(graph.grid).clip(graph.aoi);
  // Mutually exclusive, sequential loss ledger; other marginal masks overlap.
  const losses = {};
  let remaining = ee.Image.constant(1).reproject(graph.grid).clip(graph.aoi);
  const remove = (name, keep) => {
    keep = booleanMask(keep); losses[name] = remaining.and(keep.not()); remaining = remaining.and(keep);
  };
  remove('missingSar', graph.commonMask);
  remove('smoothingUnsupported', smoothing);
  remove('ahpNoData', originalAhpValid);
  remove('ahpWorldCoverWaterExcluded', worldCoverWater.not());
  remove('ahpLandClassUnavailable', ahpValid);
  remove('ahpUnexpectedCode', recognized);
  remove('historicalUnknown', masks.valid);
  remove('historicalPermanentExcluded', masks.eligible);
  remove('terrainUnknown', terrainUnknown.not());
  return { classes, domain, ahpGrid, losses, ledgerRemainder: remaining,
    marginalMasks: { ahpValid, ahpNoData: originalAhpValid.not(), ahpWorldCoverWater: worldCoverWater,
      ahpUnexpectedCode: ahpValid.and(recognized.not()),
      historicalUnknown: smoothing.and(booleanMask(masks.valid).not()),
      historicalPermanent: smoothing.and(booleanMask(masks.permanent)), terrainUnknown } };
}
function reduceMasks(ee, graph, masks) {
  return ee.Image.cat(Object.entries(masks).map(([key, mask]) => ee.Image.pixelArea().updateMask(booleanMask(mask)).rename(key)))
    // Whole-AOI diagnostic masks have a larger footprint than SAR-only images.
    // Raise only the research pixel budget; preserve the exact projection/scale.
    .reduceRegion({ ...graph.gridOptions, maxPixels: 1e9, reducer: ee.Reducer.sum() });
}
function overlapComputation(ee, graph, classes, domain, stageImage) {
  const candidate = booleanMask(stageImage).and(domain);
  const masks = { domain, candidate, unexpectedClass: domain.and(classes.unmask(-999, false).remap(CLASSES.map(c => c.code), [1, 1, 1, 1], 0).not()),
    candidateOutsideDomain: candidate.and(domain.not()) };
  for (const { code } of CLASSES) {
    const inClass = domain.and(classes.eq(code));
    masks[`class_${code}`] = inClass;
    masks[`candidate_${code}`] = inClass.and(candidate);
    masks[`nonCandidate_${code}`] = inClass.and(candidate.not());
  }
  return reduceMasks(ee, graph, masks);
}
function summarizeLedger(raw) {
  const aoi = measuredArea(raw, 'aoi'), common = measuredArea(raw, 'commonDomain');
  const exclusive = Object.fromEntries(['missingSar', 'smoothingUnsupported', 'ahpNoData', 'ahpWorldCoverWaterExcluded', 'ahpLandClassUnavailable',
    'ahpUnexpectedCode', 'historicalUnknown', 'historicalPermanentExcluded', 'terrainUnknown'].map(key => [key, measuredArea(raw, key)]));
  checkClose(aoi, common + Object.values(exclusive).reduce((a, b) => a + b, 0), 'AOI loss ledger');
  checkClose(measuredArea(raw, 'marginal_ahpUnexpectedCode'), 0, 'Unexpected AHP classes in SAR support');
  checkClose(measuredArea(raw, 'ledgerRemainder'), common, 'Mask intersection/ledger');
  return { rasterAoiAreaKm2: aoi / 1e6, commonDomainAreaKm2: common / 1e6,
    exclusiveLossesKm2: Object.fromEntries(Object.entries(exclusive).map(([k, v]) => [k, v / 1e6])),
    marginalAreasKm2: Object.fromEntries(Object.keys(raw).filter(k => k.startsWith('marginal_')).map(k => [k.slice(9), measuredArea(raw, k) / 1e6])),
    accountingToleranceM2: TOLERANCE_M2, accountingPassed: true };
}

function createAhpSarResearchService({ engine = () => require('./earthEngineService'),
  getHazard = () => require('./hazardService').getCachedHazardAnalysis(), evaluateValue = evaluate,
  previewFactory = createSarPreviewService, candidateBuilder = buildCandidateGraph, timeoutMs = 360000,
  onProgress = () => {}, onResult = async () => {} } = {}) {
  async function run({ monthly = true, sceneIds = SCENES, filters = FILTERS } = {}) {
    const instance = engine();
    await bounded(instance.initializeEarthEngine(), timeoutMs, 'research initialization');
    const hazard = await getHazard();
    const preview = previewFactory({ engine, getStudyArea: async () => hazard, sceneIds,
      validateQuality: validateSelectedQuality, evaluateValue, timeoutMs });
    const { data: quality, graph } = await preview.qualityState();
    const { ee } = instance;
    const methods = monthly ? [CONSERVATIVE, MONTHLY_DRY] : [CONSERVATIVE];
    const results = [], diagnostics = {}, references = {}, prepared = {};
    const query = async (value, label) => {
      onProgress(label); return bounded(evaluateValue(value), timeoutMs, label);
    };
    for (const method of methods) {
      const candidate = candidateBuilder(ee, graph, referenceYear(sceneIds), referencePolicy(sceneIds, referenceYear(sceneIds), method), filters);
      const p = prepareDomain(ee, graph, hazard, candidate);
      prepared[method] = { ...p, candidate };
      const ledgerMasks = { aoi: ee.Image.constant(1), commonDomain: p.domain, ledgerRemainder: p.ledgerRemainder, ...p.losses,
        ...Object.fromEntries(Object.entries(p.marginalMasks).map(([key, value]) => [`marginal_${key}`, value])) };
      diagnostics[method] = summarizeLedger(await query(reduceMasks(ee, graph, ledgerMasks), `${method}: support ledger`));
      references[method] = await query(candidate.referenceMetadata, `${method}: reference provenance`);
    }
    const metadata = await query(ee.Dictionary({ basinIds: hazard.studyBasins.aggregate_array('HYBAS_ID'),
      aoiVectorAreaKm2: graph.aoi.area(1).divide(1e6), aoiGeoJson: graph.aoi,
      ahpEvaluationProjection: prepared[CONSERVATIVE].ahpGrid,
      factorProjections: ee.Dictionary(Object.fromEntries(Object.entries(hazard.factorLayers).map(([name, image]) => [name, image.projection()]))) }), 'AHP/AOI metadata');
    for (const method of methods) {
      const p = prepared[method];
      for (const stage of STAGES) {
        const raw = await query(overlapComputation(ee, graph, p.classes, p.domain, p.candidate.stageImages[stage]), `${method}: ${stage} overlap`);
        const summary = summarizeOverlap(raw, { referenceMethod: method, stage, domainKind: 'reference-specific-stage-shared' });
        checkClose(summary.commonDomainAreaKm2 * 1e6, diagnostics[method].commonDomainAreaKm2 * 1e6, 'Scenario/ledger domain');
        results.push(summary); await onResult(summary);
      }
    }
    if (methods.length > 1) {
      const shared = intersectMasks(methods.map(method => prepared[method].domain));
      for (const method of methods) for (const stage of STAGES) {
        const p = prepared[method];
        const raw = await query(overlapComputation(ee, graph, p.classes, shared, p.candidate.stageImages[stage]), `${method}: ${stage} overlap on shared reference domain`);
        const summary = summarizeOverlap(raw, { referenceMethod: method, stage, domainKind: 'identical-cross-reference' });
        results.push(summary); await onResult(summary);
      }
    }
    // On each identical domain, existing screening must only remove responses.
    for (const method of methods) for (const kind of [...new Set(results.map(r => r.domainKind))]) {
      const stages = STAGES.map(stage => results.find(r => r.referenceMethod === method && r.domainKind === kind && r.stage === stage));
      if (stages.some(s => !s)) continue;
      for (let i = 1; i < stages.length; i++) {
        checkClose(stages[0].commonDomainAreaKm2 * 1e6, stages[i].commonDomainAreaKm2 * 1e6, 'Stage-shared domain');
        for (const [j, row] of stages[i].rows.entries()) if (row.candidateAreaKm2 > stages[i - 1].rows[j].candidateAreaKm2 + TOLERANCE_M2 / 1e6) throw new Error('Screened stage increased candidates.');
      }
    }
    return { status: 'completed', executedAt: new Date().toISOString(), primary: { referenceMethod: CONSERVATIVE, stage: 'final', domainKind: 'reference-specific-stage-shared' },
      question: sceneIds.before === SCENES.before && sceneIds.later === SCENES.later
        ? 'How are experimental May 2017 SAR candidates distributed across existing GIS-AHP susceptibility classes within their common valid spatial support?'
        : 'How are experimental selected-scene SAR candidates distributed across existing GIS-AHP susceptibility classes within their common valid spatial support?',
      scenes: quality.scenes, quality, ahp: { weights: hazard.weights, calculation: hazard.ahp, methodology: hazard.methodology, classes: CLASSES,
        datasets: { aoi: 'WWF/HydroSHEDS/v1/Basins/hybas_10', elevationAndSlope: 'USGS/SRTMGL1_003',
          landCover: 'ESA/WorldCover/v200 (first image)', waterProximity: 'JRC/GSW1_4/GlobalSurfaceWater occurrence >= 50%; 30 m fastDistanceTransform approximation' },
        raster: 'landHazardClass', excludes: 'WorldCover class 80 and original factor/index no-data masks',
        evaluation: 'Existing AHP image evaluated on analysisProjection.atScale(30), then nearest-neighbor sampled onto the exact before-VV grid.' },
      spatialMetadata: metadata, parameters: { sceneIds,
        settings: { ...SETTINGS, slopeFilterApplied: filters.terrainFilter !== 'none', clusterFilterApplied: filters.clusterFilter !== 'none' },
        rawCandidateSettings: SETTINGS, filters, references },
      methodology: { area: 'ee.Image.pixelArea(), weighted sum within original AOI, exact before-VV Projection including affine origin; no bestEffort, scale override, or pixel-count area approximation.',
        grid: quality.alignment.analysisProjection,
        commonDomain: 'AOI AND AHP land-class mask AND recognized codes 1..4 AND actual before/later VV support AND complete 30 m smoothing neighborhoods AND actual smoothed value masks AND historical supported/eligible non-permanent water domain AND known terrain.',
        stageDomain: 'Raw, terrain and final use the identical domain for each reference method. Known steep pixels remain supported filter rejections; missing terrain is excluded at all stages.',
        referenceDomain: 'Reference-specific denominators are reported separately; identical-cross-reference results use their intersection for all stages. Connectivity is computed by the existing graph on original SAR support before restricting measurement to AHP/common domains.',
        noData: 'Only validity masks are filled false for set operations. Candidate transparency is filled false exclusively inside an independently established supported domain.',
        diagnostics: 'Exclusive loss ledger partitions raster AOI in listed order. Marginal areas overlap and must not be summed.',
        maxPixels: 1e9, tileScale: graph.gridOptions.tileScale,
        toleranceM2: TOLERANCE_M2, statisticalInference: 'None; no independent ground truth or significance tests.' },
      diagnostics, scenarios: results,
      caveats: sceneIds.before === SCENES.before && sceneIds.later === SCENES.later ? CAVEATS : DYNAMIC_CAVEATS };
  }
  return { run };
}
module.exports = { CLASSES, FILTERS, STAGES, CAVEATS, DYNAMIC_CAVEATS, TOLERANCE_M2, ratio, intersectMasks, prepareDomain,
  overlapComputation, summarizeOverlap, summarizeLedger, createAhpSarResearchService };
