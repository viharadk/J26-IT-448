const { SCENES } = require('../../services/sarPixelQuality');
const { SETTINGS, buildCandidateGraph, referenceYear } = require('../../services/sarCandidateService');
const { CONSERVATIVE, MONTHLY_DRY, referencePolicy } = require('../../services/sarWaterReferenceService');
const { createSarPreviewService, evaluate, bounded } = require('../../services/sarPreviewService');
const { validateSelectedQuality } = require('../../services/sarSelectionService');
const { CLASSES, FILTERS, STAGES, CAVEATS, TOLERANCE_M2, intersectMasks, prepareDomain,
  overlapComputation, summarizeOverlap, summarizeLedger } = require('../../services/ahpSarResearchService');
const METHODS = Object.freeze([CONSERVATIVE, MONTHLY_DRY]);
const LOSS_KEYS = Object.freeze(['missingSar', 'smoothingUnsupported', 'historicalUnknown', 'historicalPermanentExcluded', 'terrainUnknown']);
const bool = image => image.unmask(0, false).gt(0);
const symmetricDifference = (a, b) => bool(a).and(bool(b).not()).or(bool(b).and(bool(a).not()));
const divide = (a, b) => b > 0 ? a / b : null;
function area(raw, key) {
  if (!Object.hasOwn(raw, key)) throw new Error(`Missing Phase 5C measurement: ${key}`);
  if (raw[key] === null) return 0; // actual empty EE sum, never a missing result
  if (!Number.isFinite(raw[key]) || raw[key] < 0) throw new Error(`Invalid Phase 5C measurement: ${key}`);
  return raw[key];
}
function close(a, b, description) {
  if (Math.abs(a - b) > TOLERANCE_M2) throw new Error(`${description}: difference ${a - b} m2 exceeds ${TOLERANCE_M2} m2.`);
}
function reduceMasks(ee, graph, masks) {
  return ee.Image.cat(Object.entries(masks).map(([name, mask]) => ee.Image.pixelArea().updateMask(bool(mask)).rename(name)))
    .reduceRegion({ ...graph.gridOptions, maxPixels: 1e9, reducer: ee.Reducer.sum() });
}

function buildSupports(ee, graph, hazard, candidate) {
  const prepared = prepareDomain(ee, graph, hazard, candidate), m = candidate.supportMasks;
  const sarRaw = intersectMasks([m.common, m.smoothing, m.smoothedValues, m.valid, m.eligible]);
  if (!m.terrainUnknown) throw new Error('Controlled filters must expose terrain no-data support.');
  const terrainKnown = bool(m.terrainUnknown).not();
  const sarFiltered = intersectMasks([sarRaw, terrainKnown]);
  const recognized = CLASSES.map(c => prepared.classes.unmask(-999, false).eq(c.code)).reduce((a, b) => a.or(b));
  const ahpValid = intersectMasks([prepared.classes.mask(), recognized]);
  const raw = intersectMasks([sarRaw, ahpValid]);
  const filtered = intersectMasks([sarFiltered, ahpValid]);
  return { ...prepared, candidate,
    sarStageSupports: { raw: sarRaw, terrain: sarFiltered, final: sarFiltered },
    stageSupports: { raw, terrain: filtered, final: filtered },
    terrainKnown, ahpValid,
    stageSharedDomain: intersectMasks([raw, filtered, filtered]) };
}

function classLossMasks(classes, classCode, candidate, graph) {
  let remaining = intersectMasks([classes.mask(), classes.eq(classCode)]);
  const masks = { ahpClassInAoi: remaining };
  const m = candidate.supportMasks;
  const steps = { missingSar: m.common,
    smoothingUnsupported: intersectMasks([m.smoothing, m.smoothedValues]),
    historicalUnknown: m.valid, historicalPermanentExcluded: m.eligible,
    terrainUnknown: bool(m.terrainUnknown).not() };
  for (const [name, keep] of Object.entries(steps)) {
    masks[name] = remaining.and(bool(keep).not());
    remaining = remaining.and(bool(keep));
  }
  masks.nativeDomain = remaining;
  return masks;
}
function summarizeClassLosses(raw) {
  const total = area(raw, 'ahpClassInAoi'), native = area(raw, 'nativeDomain');
  const losses = Object.fromEntries(LOSS_KEYS.map(key => [key, area(raw, key)]));
  close(total, native + Object.values(losses).reduce((a, b) => a + b, 0), 'Class-level loss partition');
  return { ahpClassInAoiKm2: total / 1e6, nativeDomainKm2: native / 1e6,
    nativeRetentionPercent: total > 0 ? native / total * 100 : null,
    lossesKm2: Object.fromEntries(Object.entries(losses).map(([key, value]) => [key, value / 1e6])),
    toleranceM2: TOLERANCE_M2, accountingPassed: true,
    interpretation: 'Exclusive ordered losses within recognized AHP land class: SAR, smoothing, historical support, permanent water, terrain no-data. Outside-class AHP no-data/water remains globally unassigned.' };
}
function summarizeResponsePartition(raw) {
  const keys = ['fixedDomain', 'bothCandidate', 'conservativeOnlyCandidate', 'monthlyOnlyCandidate', 'neitherCandidate'];
  const v = Object.fromEntries(keys.map(key => [key, area(raw, key)]));
  close(v.fixedDomain, v.bothCandidate + v.conservativeOnlyCandidate + v.monthlyOnlyCandidate + v.neitherCandidate, 'Fixed-domain response partition');
  return { ...Object.fromEntries(Object.entries(v).map(([key, value]) => [`${key}Km2`, value / 1e6])),
    differentResponseAreaKm2: (v.conservativeOnlyCandidate + v.monthlyOnlyCandidate) / 1e6,
    signedMonthlyMinusConservativeAreaKm2: (v.monthlyOnlyCandidate - v.conservativeOnlyCandidate) / 1e6,
    interpretation: 'Experimental response partition on identical supported pixels, not a ground-truth confusion matrix or accuracy metric.' };
}
function pattern(summary) {
  const rates = summary.rows.map(row => row.candidatePercent);
  const complete = rates.every(value => value !== null);
  const grouped = summary.groupedComparison;
  return { allClassesRepresented: summary.rows.every(row => row.domainAreaKm2 > 0),
    monotonicNondecreasingAcrossClasses: complete ? rates.every((value, i) => i === 0 || value >= rates[i - 1]) : null,
    higherGroupRateExceedsLower: grouped.higher.candidateRate !== null && grouped.lower.candidateRate !== null ? grouped.higher.candidateRate > grouped.lower.candidateRate : null,
    highMinusVeryHighRatePercentagePoints: rates[2] !== null && rates[3] !== null ? rates[2] - rates[3] : null };
}

function validateScenarioMatrix(scenarios) {
  if (scenarios.length !== 12) throw new Error('Expected six native and six fixed measurements.');
  const used = new Set();
  for (const s of scenarios) {
    const key = `${s.domainKind}:${s.referenceMethod}:${s.stage}`;
    if (used.has(key) || !['native', 'fixed'].includes(s.domainKind) || !METHODS.includes(s.referenceMethod) || !STAGES.includes(s.stage)) throw new Error('Unexpected/duplicate scenario identity.');
    used.add(key);
    if (!s.rows || s.rows.length !== CLASSES.length || !s.accounting?.passed) throw new Error('Missing class accounting.');
    close(s.rows.reduce((n, row) => n + row.domainAreaKm2, 0) * 1e6, s.commonDomainAreaKm2 * 1e6, 'Scenario class/domain area');
    close(s.rows.reduce((n, row) => n + row.candidateAreaKm2, 0) * 1e6, s.candidateAreaKm2 * 1e6, 'Scenario class/candidate area');
    for (const [i, row] of s.rows.entries()) {
      if (row.code !== CLASSES[i].code) throw new Error('Hazard class encoding changed.');
      close((row.candidateAreaKm2 + row.nonCandidateAreaKm2) * 1e6, row.domainAreaKm2 * 1e6, 'Supported class partition');
      if (row.candidateAreaKm2 > row.domainAreaKm2 + TOLERANCE_M2 / 1e6) throw new Error('Class candidates exceed supported class.');
    }
  }
  const fixed = scenarios.filter(s => s.domainKind === 'fixed');
  const baseline = fixed[0];
  for (const s of fixed) {
    if (s.domainId !== 'fixed-intersection-all-six-supports') throw new Error('Fixed scenarios must reference the one shared mask.');
    close(s.commonDomainAreaKm2 * 1e6, baseline.commonDomainAreaKm2 * 1e6, 'Fixed area identity');
    for (const [i, row] of s.rows.entries()) close(row.domainAreaKm2 * 1e6, baseline.rows[i].domainAreaKm2 * 1e6, 'Fixed class representation');
  }
  for (const method of METHODS) for (const kind of ['native', 'fixed']) {
    const series = STAGES.map(stage => scenarios.find(s => s.referenceMethod === method && s.domainKind === kind && s.stage === stage));
    for (let i = 1; i < series.length; i++) {
      close(series[0].commonDomainAreaKm2 * 1e6, series[i].commonDomainAreaKm2 * 1e6, 'Stage-shared area');
      for (const [j, row] of series[i].rows.entries()) {
        close(row.domainAreaKm2 * 1e6, series[0].rows[j].domainAreaKm2 * 1e6, 'Stage-shared class domain');
        if (row.candidateAreaKm2 > series[i - 1].rows[j].candidateAreaKm2 + TOLERANCE_M2 / 1e6) throw new Error('Filtering increased supported candidates.');
      }
    }
  }
  for (const method of METHODS) for (const stage of STAGES) {
    const native = scenarios.find(s => s.domainKind === 'native' && s.referenceMethod === method && s.stage === stage);
    const matched = scenarios.find(s => s.domainKind === 'fixed' && s.referenceMethod === method && s.stage === stage);
    for (const [i, row] of matched.rows.entries()) {
      if (row.domainAreaKm2 > native.rows[i].domainAreaKm2 + TOLERANCE_M2 / 1e6 ||
          row.candidateAreaKm2 > native.rows[i].candidateAreaKm2 + TOLERANCE_M2 / 1e6) throw new Error('Matched class is not a native subset.');
    }
  }
  return true;
}

function deriveSensitivity(scenarios, responsePartitions) {
  validateScenarioMatrix(scenarios);
  const find = (method, stage, domainKind) => scenarios.find(s => s.referenceMethod === method && s.stage === stage && s.domainKind === domainKind);
  const representation = METHODS.map(method => {
    const native = find(method, 'raw', 'native'), fixed = find(method, 'raw', 'fixed');
    return { referenceMethod: method, nativeDomainKm2: native.commonDomainAreaKm2,
      fixedDomainKm2: fixed.commonDomainAreaKm2, fixedFractionOfNativePercent: native.commonDomainAreaKm2 > 0 ? fixed.commonDomainAreaKm2 / native.commonDomainAreaKm2 * 100 : null,
      classes: native.rows.map((row, i) => ({ code: row.code, label: row.label, nativeAreaKm2: row.domainAreaKm2,
        fixedAreaKm2: fixed.rows[i].domainAreaKm2, nativeDomainSharePercent: row.domainSharePercent,
        fixedDomainSharePercent: fixed.rows[i].domainSharePercent,
        fixedFractionOfNativeClassPercent: row.domainAreaKm2 > 0 ? fixed.rows[i].domainAreaKm2 / row.domainAreaKm2 * 100 : null })) };
  });
  const decomposition = STAGES.map(stage => {
    const cn = find(CONSERVATIVE, stage, 'native'), mn = find(MONTHLY_DRY, stage, 'native');
    const cf = find(CONSERVATIVE, stage, 'fixed'), mf = find(MONTHLY_DRY, stage, 'fixed');
    const delta = mn.candidateAreaKm2 - cn.candidateAreaKm2;
    const fixedDelta = mf.candidateAreaKm2 - cf.candidateAreaKm2;
    const cOutside = cn.candidateAreaKm2 - cf.candidateAreaKm2, mOutside = mn.candidateAreaKm2 - mf.candidateAreaKm2;
    const outsideDelta = mOutside - cOutside;
    if (Math.min(cOutside, mOutside) < -TOLERANCE_M2 / 1e6) throw new Error('Fixed candidate area is not a native subset.');
    close(delta * 1e6, (fixedDelta + outsideDelta) * 1e6, 'Native candidate area decomposition');
    close(responsePartitions[stage].fixedDomainKm2 * 1e6, cf.commonDomainAreaKm2 * 1e6, 'Response partition/fixed domain');
    close((responsePartitions[stage].bothCandidateKm2 + responsePartitions[stage].conservativeOnlyCandidateKm2) * 1e6, cf.candidateAreaKm2 * 1e6, 'Conservative partition/overlap');
    close((responsePartitions[stage].bothCandidateKm2 + responsePartitions[stage].monthlyOnlyCandidateKm2) * 1e6, mf.candidateAreaKm2 * 1e6, 'Monthly partition/overlap');
    close(fixedDelta * 1e6, responsePartitions[stage].signedMonthlyMinusConservativeAreaKm2 * 1e6, 'Matched response difference');
    const rateAvailable = [cn, mn, cf, mf].every(s => s.candidateRate !== null);
    const nativeRateDelta = rateAvailable ? (mn.candidateRate - cn.candidateRate) * 100 : null;
    const fixedRateDelta = rateAvailable ? (mf.candidateRate - cf.candidateRate) * 100 : null;
    return { stage, nativeCandidateAreaDifferenceKm2: delta, fixedResponseAreaDifferenceKm2: fixedDelta,
      conservativeCandidatesOutsideFixedKm2: Math.max(0, cOutside), monthlyCandidatesOutsideFixedKm2: Math.max(0, mOutside),
      nonsharedSupportContributionKm2: outsideDelta,
      nonsharedShareOfSignedAreaDifferencePercent: Math.abs(delta) > TOLERANCE_M2 / 1e6 ? outsideDelta / delta * 100 : null,
      fixedShareOfSignedAreaDifferencePercent: Math.abs(delta) > TOLERANCE_M2 / 1e6 ? fixedDelta / delta * 100 : null,
      nativeRateDifferencePercentagePoints: nativeRateDelta, fixedRateDifferencePercentagePoints: fixedRateDelta,
      nativeVersusFixedRateShiftDifferencePercentagePoints: rateAvailable ? nativeRateDelta - fixedRateDelta : null,
      caveat: 'Area accounting separates common-support responses from responses outside it. Rate accounting is fixed-domain-anchored algebra, not a unique causal attribution or accuracy improvement.' };
  });
  const filterChanges = [];
  for (const method of METHODS) for (const kind of ['native', 'fixed']) for (const [from, to] of [['raw', 'terrain'], ['terrain', 'final']]) {
    const a = find(method, from, kind), b = find(method, to, kind);
    const removed = a.candidateAreaKm2 - b.candidateAreaKm2;
    filterChanges.push({ referenceMethod: method, domainKind: kind, fromStage: from, toStage: to,
      candidateAreaRemovedKm2: removed, fractionOfPriorCandidatesRemovedPercent: a.candidateAreaKm2 > 0 ? removed / a.candidateAreaKm2 * 100 : null,
      candidateRateChangePercentagePoints: a.candidateRate !== null && b.candidateRate !== null ? (b.candidateRate - a.candidateRate) * 100 : null,
      groupedRatioChange: a.groupedComparison.higherToLowerRateRatio !== null && b.groupedComparison.higherToLowerRateRatio !== null ? b.groupedComparison.higherToLowerRateRatio - a.groupedComparison.higherToLowerRateRatio : null,
      classes: a.rows.map((row, i) => { const next = b.rows[i]; return { code: row.code, label: row.label,
        areaRemovedKm2: row.candidateAreaKm2 - next.candidateAreaKm2,
        fractionOfPriorClassCandidatesRemovedPercent: row.candidateAreaKm2 > 0 ? (row.candidateAreaKm2 - next.candidateAreaKm2) / row.candidateAreaKm2 * 100 : null,
        candidateRateChangePercentagePoints: row.candidatePercent !== null && next.candidatePercent !== null ? next.candidatePercent - row.candidatePercent : null,
        enrichmentChange: row.enrichmentRatio !== null && next.enrichmentRatio !== null ? next.enrichmentRatio - row.enrichmentRatio : null }; }) });
  }
  const patterns = scenarios.map(s => ({ referenceMethod: s.referenceMethod, stage: s.stage, domainKind: s.domainKind, ...pattern(s) }));
  return { representation, decomposition, filterChanges, patterns,
    groupedDirectionPositiveScenarios: patterns.filter(p => p.higherGroupRateExceedsLower === true).length,
    monotonicScenarios: patterns.filter(p => p.monotonicNondecreasingAcrossClasses === true).length,
    interpretation: 'Scenario counts describe sensitivity controls, not independent spatial replicates or statistical significance.' };
}

function createUncertaintyService({ engine = () => require('../../services/earthEngineService'),
  getHazard = () => require('../../services/hazardService').getCachedHazardAnalysis(), evaluateValue = evaluate,
  previewFactory = createSarPreviewService, candidateBuilder = buildCandidateGraph, timeoutMs = 360000,
  onProgress = () => {}, onMeasurement = async () => {} } = {}) {
  async function run() {
    const instance = engine();
    await bounded(instance.initializeEarthEngine(), timeoutMs, 'Phase 5C initialization');
    const { ee } = instance, hazard = await getHazard();
    const preview = previewFactory({ engine, getStudyArea: async () => hazard, sceneIds: SCENES,
      validateQuality: validateSelectedQuality, evaluateValue, timeoutMs });
    const { data: quality, graph } = await preview.qualityState();
    const measure = async (value, label) => {
      onProgress(label); const result = await bounded(evaluateValue(value), timeoutMs, label);
      await onMeasurement(label, result); return result;
    };
    const prepared = Object.fromEntries(METHODS.map(method => [method, buildSupports(ee, graph, hazard,
      candidateBuilder(ee, graph, referenceYear(SCENES), referencePolicy(SCENES, referenceYear(SCENES), method), FILTERS))]));
    // All six valid classification supports; self-masked positive images are
    // deliberately NOT involved in defining supported negative observations.
    const fixed = intersectMasks(METHODS.flatMap(method => STAGES.map(stage => prepared[method].stageSupports[stage]))).reproject(graph.grid).clip(graph.aoi);
    const controlMasks = { fixedDomain: fixed,
      fixedOutsideConservative: fixed.and(prepared[CONSERVATIVE].domain.not()),
      fixedOutsideMonthly: fixed.and(prepared[MONTHLY_DRY].domain.not()),
      conservativeNativeOnly: prepared[CONSERVATIVE].domain.and(prepared[MONTHLY_DRY].domain.not()),
      monthlyNativeOnly: prepared[MONTHLY_DRY].domain.and(prepared[CONSERVATIVE].domain.not()) };
    for (const [i, method] of METHODS.entries()) {
      const p = prepared[method];
      controlMasks[`nativeStageIntersectionDisagreement_${i}`] = symmetricDifference(p.domain, p.stageSharedDomain);
      for (const stage of STAGES) {
        controlMasks[`fixedOutsideSupport_${i}_${stage}`] = fixed.and(bool(p.stageSupports[stage]).not());
      }
    }
    const controlRaw = await measure(reduceMasks(ee, graph, controlMasks), 'domain-mask-controls');
    const controls = Object.fromEntries(Object.keys(controlMasks).map(key => [key, area(controlRaw, key) / 1e6]));
    for (const [key, value] of Object.entries(controls)) if (/Outside|Disagreement/.test(key)) close(value * 1e6, 0, key);
    const globalDiagnostics = {}, classLosses = {}, references = {};
    for (const method of METHODS) {
      const p = prepared[method];
      const ledger = { aoi: ee.Image.constant(1), commonDomain: p.domain, ledgerRemainder: p.ledgerRemainder, ...p.losses,
        ...Object.fromEntries(Object.entries(p.marginalMasks).map(([key, value]) => [`marginal_${key}`, value])) };
      globalDiagnostics[method] = summarizeLedger(await measure(reduceMasks(ee, graph, ledger), `${method}-global-ledger`));
      references[method] = await measure(p.candidate.referenceMetadata, `${method}-reference-provenance`);
      classLosses[method] = [];
      for (const c of CLASSES) {
        const raw = await measure(reduceMasks(ee, graph, classLossMasks(p.classes, c.code, p.candidate, graph)), `${method}-class-${c.code}-losses`);
        classLosses[method].push({ ...c, ...summarizeClassLosses(raw) });
      }
    }
    const scenarios = [];
    for (const c of CLASSES) close(classLosses[CONSERVATIVE].find(row => row.code === c.code).ahpClassInAoiKm2 * 1e6,
      classLosses[MONTHLY_DRY].find(row => row.code === c.code).ahpClassInAoiKm2 * 1e6, 'Common original AHP class support');
    for (const kind of ['native', 'fixed']) for (const method of METHODS) for (const stage of STAGES) {
      const p = prepared[method], domain = kind === 'native' ? p.domain : fixed;
      const raw = await measure(overlapComputation(ee, graph, p.classes, domain, p.candidate.stageImages[stage]), `${kind}-${method}-${stage}-overlap`);
      const summary = summarizeOverlap(raw, { domainKind: kind, referenceMethod: method, stage,
        domainId: kind === 'fixed' ? 'fixed-intersection-all-six-supports' : `native-${method}-all-three-stage-supports` });
      for (const row of summary.rows) close(row.domainAreaKm2 * 1e6,
        (kind === 'native' ? classLosses[method].find(c => c.code === row.code).nativeDomainKm2 : scenarios.find(s => s.domainKind === 'fixed')?.rows.find(c => c.code === row.code)?.domainAreaKm2 ?? row.domainAreaKm2) * 1e6, 'Scenario/class-loss or fixed class area');
      close(summary.commonDomainAreaKm2 * 1e6, (kind === 'native' ? globalDiagnostics[method].commonDomainAreaKm2 : controls.fixedDomain) * 1e6, 'Evaluation/declared domain area');
      scenarios.push({ ...summary, candidateRatePercent: summary.candidateRate === null ? null : summary.candidateRate * 100,
        patterns: pattern(summary) });
    }
    const responsePartitions = {};
    for (const stage of STAGES) {
      const c = bool(prepared[CONSERVATIVE].candidate.stageImages[stage]);
      const m = bool(prepared[MONTHLY_DRY].candidate.stageImages[stage]);
      const masks = { fixedDomain: fixed, bothCandidate: fixed.and(c).and(m),
        conservativeOnlyCandidate: fixed.and(c).and(m.not()), monthlyOnlyCandidate: fixed.and(m).and(c.not()),
        neitherCandidate: fixed.and(c.not()).and(m.not()) };
      responsePartitions[stage] = summarizeResponsePartition(await measure(reduceMasks(ee, graph, masks), `${stage}-fixed-response-partition`));
    }
    const sourceLeaks = {};
    for (const [i, method] of METHODS.entries()) for (const stage of STAGES) {
      const p = prepared[method];
      sourceLeaks[`sourceCandidateOutsideSarSupport_${i}_${stage}`] = bool(p.candidate.stageImages[stage]).and(bool(p.sarStageSupports[stage]).not());
    }
    const leakRaw = await measure(reduceMasks(ee, graph, sourceLeaks), 'source-candidate-support-leaks');
    const leaks = Object.fromEntries(Object.keys(sourceLeaks).map(key => [key, area(leakRaw, key) / 1e6]));
    for (const [key, value] of Object.entries(leaks)) close(value * 1e6, 0, key);
    const spatialMetadata = await measure(ee.Dictionary({ basinIds: hazard.studyBasins.aggregate_array('HYBAS_ID'),
      aoiVectorAreaKm2: graph.aoi.area(1).divide(1e6), aoiGeoJson: graph.aoi,
      ahpEvaluationProjection: prepared[CONSERVATIVE].ahpGrid }), 'spatial-metadata');
    const sensitivity = deriveSensitivity(scenarios, responsePartitions);
    for (const [method, exclusiveKey] of [[CONSERVATIVE, 'conservativeNativeOnly'], [MONTHLY_DRY, 'monthlyNativeOnly']]) {
      close(globalDiagnostics[method].commonDomainAreaKm2 * 1e6, (controls.fixedDomain + controls[exclusiveKey]) * 1e6, 'Native/shared/exclusive domain partition');
    }
    return { status: 'completed', executedAt: new Date().toISOString(), scenarioCount: scenarios.length,
      scientificValidationStatus: 'DATA_NOT_READY', accuracyMetrics: null,
      hypothesis: 'Higher AHP susceptibility may concentrate experimental SAR responses, but support uncertainty and filtering may alter the descriptive relationship.',
      scenarios, globalDiagnostics, classLosses, controls, sourceCandidateLeaksKm2: leaks,
      responsePartitions, sensitivity, quality, spatialMetadata,
      ahp: { weights: hazard.weights, calculation: hazard.ahp, methodology: hazard.methodology, classes: CLASSES,
        image: 'Original landHazardClass, evaluated at existing analysisProjection.atScale(30), nearest-neighbor aligned to before-VV.' },
      parameters: { sceneIds: SCENES, rawCandidateSettings: SETTINGS, filters: FILTERS, references },
      methodology: { fixedMask: 'Exact intersection of both methods and all three stage-valid classification supports. Candidate self-masks are never used as supported-negative masks.',
        nativeMask: 'Each method uses its own reference eligibility, with common support across its three stages; known terrain required at all stages to control comparison.',
        connectivityContext: 'Existing components are computed on each original method support before restriction to fixed measurement domain. No refiltering on the small matched domain.',
        area: 'ee.Image.pixelArea geographic sums, original AOI, exact before-VV Projection including affine origin; maxPixels=1e9, tileScale=4; no scale override or bestEffort.',
        grid: quality.alignment.analysisProjection, toleranceM2: TOLERANCE_M2,
        classLosses: 'Ordered exclusive class-level losses partition recognized AHP land classes. Global AHP no-data and WorldCover water are unassigned to hazard classes.',
        sourceCandidateCheck: 'Candidate support is checked BEFORE AHP/fixed restriction against actual SAR stage-valid support. Candidates valid outside an evaluation domain are excluded from its statistics, not reclassified as unknown or dry.',
        statistics: 'Descriptive geographic areas and rates only; no independent pixel replicates, significance tests, causal hydrologic explanation or flood accuracy.' },
      caveats: CAVEATS };
  }
  return { run };
}
module.exports = { METHODS, LOSS_KEYS, area, close, bool, symmetricDifference, reduceMasks, buildSupports,
  classLossMasks, summarizeClassLosses, summarizeResponsePartition, pattern, validateScenarioMatrix, deriveSensitivity, createUncertaintyService };
