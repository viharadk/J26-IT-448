const crypto = require('crypto');
const { parseSelection } = require('./sarSelectionService');
const { FILTER_KEYS, parseFilters } = require('./sarFiltering');
const { CONSERVATIVE, MONTHLY_DRY, parseReferenceMethod, referencePolicy } = require('./sarWaterReferenceService');
const { referenceYear } = require('./sarCandidateService');
const { createAhpSarResearchService, CLASSES, STAGES, TOLERANCE_M2 } = require('./ahpSarResearchService');

const METHODS = Object.freeze([CONSERVATIVE, MONTHLY_DRY]);
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 8;

function failure(message, status, code) { return Object.assign(new Error(message), { status, code }); }
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid dynamic comparison ${label}.`);
  return value;
}
function close(a, b, label, tolerance = TOLERANCE_M2 / 1e6) {
  if (Math.abs(a - b) > tolerance) throw new Error(`Dynamic comparison ${label} does not reconcile.`);
}
function parseDynamicComparisonInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure('A JSON comparison request is required.', 400, 'DYNAMIC_RESEARCH_INPUT_INVALID');
  const allowed = new Set(['beforeSceneId', 'laterSceneId', 'sourceReferenceMethod', 'candidateStage', ...FILTER_KEYS]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw failure(`Unsupported dynamic comparison field: ${key}.`, 400, 'DYNAMIC_RESEARCH_INPUT_INVALID');
  const selection = parseSelection({ beforeSceneId: body.beforeSceneId, laterSceneId: body.laterSceneId });
  const sourceReferenceMethod = parseReferenceMethod(body.sourceReferenceMethod);
  if (!STAGES.includes(body.candidateStage)) throw failure(`candidateStage must be ${STAGES.join(', ')}.`, 400, 'DYNAMIC_RESEARCH_INPUT_INVALID');
  const rawFilters = {};
  for (const key of FILTER_KEYS) if (body[key] !== undefined) rawFilters[key] = body[key];
  const filters = parseFilters(rawFilters);
  const year = referenceYear(selection);
  // Fail before job creation if either documented sensitivity reference cannot be built.
  referencePolicy(selection, year, CONSERVATIVE);
  referencePolicy(selection, year, MONTHLY_DRY);
  return { selection, filters, sourceReferenceMethod, candidateStage: body.candidateStage };
}

function projectRows(rows, domainAreaKm2, candidateAreaKm2) {
  if (!Array.isArray(rows) || rows.length !== CLASSES.length) throw new Error('Dynamic hazard-class results are incomplete.');
  const projected = rows.map((row, index) => {
    const expected = CLASSES[index];
    if (row.code !== expected.code || row.label !== expected.label) throw new Error('Dynamic hazard-class identity changed.');
    const supportedAreaKm2 = finite(row.domainAreaKm2, 'class support');
    const classCandidateAreaKm2 = finite(row.candidateAreaKm2, 'class candidates');
    if (classCandidateAreaKm2 > supportedAreaKm2 + TOLERANCE_M2 / 1e6) throw new Error('Dynamic class candidates exceed support.');
    const candidateRatePercent = supportedAreaKm2 > 0 ? classCandidateAreaKm2 / supportedAreaKm2 * 100 : null;
    if (row.candidatePercent !== null) close(row.candidatePercent, candidateRatePercent, 'class rate', 1e-9);
    else if (candidateRatePercent !== null) throw new Error('Dynamic class rate is unexpectedly unavailable.');
    return { classId: row.code, hazardClass: row.label, supportedAreaKm2, candidateAreaKm2: classCandidateAreaKm2, candidateRatePercent };
  });
  close(projected.reduce((sum, row) => sum + row.supportedAreaKm2, 0), domainAreaKm2, 'class support total');
  close(projected.reduce((sum, row) => sum + row.candidateAreaKm2, 0), candidateAreaKm2, 'class candidate total');
  return projected;
}

function projectScenario(scenario, domainKind) {
  if (!scenario || scenario.domainKind !== (domainKind === 'native' ? 'reference-specific-stage-shared' : 'identical-cross-reference') ||
      !METHODS.includes(scenario.referenceMethod) || !STAGES.includes(scenario.stage) || scenario.accounting?.passed !== true) {
    throw new Error('Dynamic scenario identity or accounting is invalid.');
  }
  const commonValidAreaKm2 = finite(scenario.commonDomainAreaKm2, 'common domain');
  const candidateAreaKm2 = finite(scenario.candidateAreaKm2, 'candidate area');
  if (candidateAreaKm2 > commonValidAreaKm2 + TOLERANCE_M2 / 1e6) throw new Error('Dynamic candidates exceed their common domain.');
  const candidateRatePercent = commonValidAreaKm2 > 0 ? candidateAreaKm2 / commonValidAreaKm2 * 100 : null;
  const lower = scenario.groupedComparison?.lower, higher = scenario.groupedComparison?.higher;
  if (!lower || !higher) throw new Error('Dynamic grouped comparison is missing.');
  const group = (value, classes) => {
    const supportedAreaKm2 = finite(value.domainAreaKm2, 'group support');
    const groupCandidateAreaKm2 = finite(value.candidateAreaKm2, 'group candidates');
    if (groupCandidateAreaKm2 > supportedAreaKm2 + TOLERANCE_M2 / 1e6) throw new Error('Dynamic grouped candidates exceed support.');
    return { classes, supportedAreaKm2, candidateAreaKm2: groupCandidateAreaKm2,
      candidateRatePercent: supportedAreaKm2 > 0 ? groupCandidateAreaKm2 / supportedAreaKm2 * 100 : null };
  };
  const groups = { lower: group(lower, ['Low', 'Moderate']), higher: group(higher, ['High', 'Very High']) };
  close(groups.lower.supportedAreaKm2 + groups.higher.supportedAreaKm2, commonValidAreaKm2, 'group support total');
  close(groups.lower.candidateAreaKm2 + groups.higher.candidateAreaKm2, candidateAreaKm2, 'group candidate total');
  const ratio = groups.lower.candidateRatePercent !== null && groups.lower.candidateRatePercent > 0 && groups.higher.candidateRatePercent !== null
    ? groups.higher.candidateRatePercent / groups.lower.candidateRatePercent : null;
  if (scenario.groupedComparison.higherToLowerRateRatio !== null) close(scenario.groupedComparison.higherToLowerRateRatio, ratio, 'group ratio', 1e-9);
  else if (ratio !== null) throw new Error('Dynamic grouped ratio is unexpectedly unavailable.');
  return { id: `${scenario.referenceMethod}:${domainKind}:${scenario.stage}`, referenceMethod: scenario.referenceMethod,
    domainKind, candidateStage: scenario.stage, commonValidAreaKm2, candidateAreaKm2,
    nonCandidateAreaKm2: commonValidAreaKm2 - candidateAreaKm2, candidateRatePercent,
    groupedCandidateRateRatio: ratio, groupedRates: groups,
    hazardClasses: projectRows(scenario.rows, commonValidAreaKm2, candidateAreaKm2), estimability: scenario.estimability };
}

function projectDiagnostics(value) {
  if (!value || value.accountingPassed !== true) throw new Error('Dynamic support accounting is unavailable.');
  const losses = value.exclusiveLossesKm2;
  if (!losses || typeof losses !== 'object') throw new Error('Dynamic support losses are unavailable.');
  const exclusiveLossesKm2 = {};
  for (const key of ['missingSar', 'smoothingUnsupported', 'ahpNoData', 'ahpWorldCoverWaterExcluded', 'ahpLandClassUnavailable',
    'ahpUnexpectedCode', 'historicalUnknown', 'historicalPermanentExcluded', 'terrainUnknown']) {
    exclusiveLossesKm2[key] = finite(losses[key], `support loss ${key}`);
  }
  const rasterAoiAreaKm2 = finite(value.rasterAoiAreaKm2, 'raster AOI');
  const commonDomainAreaKm2 = finite(value.commonDomainAreaKm2, 'diagnostic common domain');
  close(commonDomainAreaKm2 + Object.values(exclusiveLossesKm2).reduce((sum, item) => sum + item, 0), rasterAoiAreaKm2, 'AOI loss ledger');
  return { rasterAoiAreaKm2, commonDomainAreaKm2, exclusiveLossesKm2, accountingToleranceM2: value.accountingToleranceM2 };
}

function projectDynamicComparison(result, input) {
  if (!result || result.status !== 'completed' || !Array.isArray(result.scenarios) || result.scenarios.length !== 12) throw new Error('Dynamic research execution is incomplete.');
  if (result.parameters?.sceneIds?.before !== input.selection.before || result.parameters?.sceneIds?.later !== input.selection.later) throw new Error('Dynamic research scenes do not match the request.');
  if (JSON.stringify(result.parameters.filters) !== JSON.stringify(input.filters)) throw new Error('Dynamic research filters do not match the request.');
  const scenarios = [];
  for (const domainKind of ['native', 'matched']) for (const referenceMethod of METHODS) {
    const internalKind = domainKind === 'native' ? 'reference-specific-stage-shared' : 'identical-cross-reference';
    const matches = result.scenarios.filter(item => item.domainKind === internalKind && item.referenceMethod === referenceMethod && item.stage === input.candidateStage);
    if (matches.length !== 1) throw new Error('Required dynamic scenario is missing or duplicated.');
    scenarios.push(projectScenario(matches[0], domainKind));
  }
  const matched = scenarios.filter(item => item.domainKind === 'matched');
  close(matched[0].commonValidAreaKm2, matched[1].commonValidAreaKm2, 'matched-domain identity');
  const quality = result.quality;
  if (!quality?.pairAssessment || quality.pairAssessment.status !== 'suitable') throw new Error('Dynamic pair compatibility was not established.');
  const before = quality.scenes?.before, later = quality.scenes?.later;
  if (!before || !later || before.sceneId !== input.selection.before || later.sceneId !== input.selection.later) throw new Error('Dynamic scene provenance is incomplete.');
  const crossPlatform = before.platform !== later.platform;
  const comparisonStatus = scenarios.every(item => item.commonValidAreaKm2 === 0) ? 'no-common-domain' : crossPlatform ? 'qualified' : 'comparable';
  return {
    success: true, kind: 'dynamic-ahp-sar-comparison', comparisonStatus,
    scientificValidationStatus: 'DATA_NOT_READY', question: result.question,
    scenes: {
      before: { sceneId: before.sceneId, acquiredAt: before.acquiredAt, platform: before.platform, orbitDirection: before.orbitDirection, relativeOrbitNumber: before.relativeOrbitNumber, instrumentMode: before.instrumentMode, polarizations: before.polarizations },
      later: { sceneId: later.sceneId, acquiredAt: later.acquiredAt, platform: later.platform, orbitDirection: later.orbitDirection, relativeOrbitNumber: later.relativeOrbitNumber, instrumentMode: later.instrumentMode, polarizations: later.polarizations },
    },
    compatibility: {
      status: crossPlatform ? 'qualified' : 'comparable', crossPlatform, sameNativeGrid: quality.alignment?.sameNativeGrid === true,
      jointFootprintCoveragePercent: finite(quality.common?.jointFootprintCoveragePercent, 'joint footprint coverage'),
      commonSarValidAreaKm2: finite(quality.common?.validPixelAreaKm2, 'common SAR valid area'),
      reasons: [...quality.pairAssessment.reasons,
        ...(crossPlatform ? ['The pair crosses Sentinel-1 platforms; radiometric equivalence and subpixel co-registration are not independently established.'] : []),
        quality.alignment?.caveat || 'Grid alignment does not establish independent spatial accuracy.'],
    },
    configuration: { sourceReferenceMethod: input.sourceReferenceMethod, comparedReferenceMethods: METHODS,
      candidateStage: input.candidateStage, filters: input.filters, rawCandidateSettings: result.parameters.rawCandidateSettings },
    studyArea: { basinIds: (result.spatialMetadata?.basinIds || []).map(String), vectorAreaKm2: finite(result.spatialMetadata?.aoiVectorAreaKm2, 'vector AOI') },
    supportByReference: {
      [CONSERVATIVE]: projectDiagnostics(result.diagnostics?.[CONSERVATIVE]),
      [MONTHLY_DRY]: projectDiagnostics(result.diagnostics?.[MONTHLY_DRY]),
    },
    scenarios,
    methodology: {
      area: result.methodology?.area, commonDomain: result.methodology?.commonDomain,
      referenceDomain: result.methodology?.referenceDomain, noData: result.methodology?.noData,
      accuracyMeaning: 'Candidate rates and grouped ratios are descriptive spatial agreement measures, not accuracy, validation, probability or flood depth.'
    },
    caveats: result.caveats,
    provenance: { computedAt: result.executedAt, executionMode: 'live-earth-engine', cachedHistoricalArtifact: false,
      ahpRaster: result.ahp?.raster, ahpEvaluation: result.ahp?.evaluation, sarDataset: 'COPERNICUS/S1_GRD', scenarioCount: result.scenarios.length },
  };
}

function safeJobError(error) {
  const known = ['SAR_PAIR_UNSUPPORTED', 'SAR_WATER_REFERENCE_UNAVAILABLE', 'SAR_MONTHLY_REFERENCE_UNAVAILABLE', 'SAR_PREVIEW_TIMEOUT',
    'SAR_PREVIEW_AUTH_FAILED', 'SAR_PIXEL_QUERY_FAILED'];
  return { code: known.includes(error?.code) ? error.code : 'DYNAMIC_RESEARCH_COMPUTATION_FAILED',
    message: known.includes(error?.code) ? error.message : 'Dynamic GIS-AHP/SAR comparison failed; no scientific result is available.' };
}

function createDynamicResearchComparisonService({ now = Date.now, maxJobs = MAX_JOBS, ttlMs = JOB_TTL_MS,
  runnerFactory = onProgress => createAhpSarResearchService({ onProgress }) } = {}) {
  const jobs = new Map(), keys = new Map();
  let activeJobId = null;
  const clean = () => {
    for (const [id, job] of jobs) if (now() - job.updatedAt > ttlMs && job.status !== 'running' && job.status !== 'queued') {
      jobs.delete(id); if (keys.get(job.key) === id) keys.delete(job.key);
    }
    while (jobs.size > maxJobs) {
      const removable = [...jobs.values()].find(job => !['queued', 'running'].includes(job.status));
      if (!removable) break;
      jobs.delete(removable.id); if (keys.get(removable.key) === removable.id) keys.delete(removable.key);
    }
  };
  const view = job => ({ success: true, job: { id: job.id, status: job.status, createdAt: job.createdAt, updatedAt: new Date(job.updatedAt).toISOString(),
    progress: job.progress, ...(job.status === 'completed' ? { result: job.result } : {}), ...(job.status === 'failed' ? { error: job.error } : {}) } });
  function start(rawInput) {
    clean();
    const input = parseDynamicComparisonInput(rawInput);
    const key = JSON.stringify(input);
    const existingId = keys.get(key), existing = existingId && jobs.get(existingId);
    if (existing && existing.status === 'failed') { jobs.delete(existing.id); keys.delete(key); }
    else if (existing && now() - existing.updatedAt <= ttlMs) return { status: existing.status === 'completed' ? 200 : 202,
      body: { ...view(existing), cache: { hit: existing.status === 'completed', deduplicated: ['queued', 'running'].includes(existing.status) } } };
    if (activeJobId) throw failure('Another dynamic research comparison is running. Retry after it completes.', 429, 'DYNAMIC_RESEARCH_BUSY');
    if (jobs.size >= maxJobs) {
      const removable = [...jobs.values()].find(job => !['queued', 'running'].includes(job.status));
      if (removable) { jobs.delete(removable.id); if (keys.get(removable.key) === removable.id) keys.delete(removable.key); }
    }
    const timestamp = now(), id = crypto.randomUUID();
    const job = { id, key, input, status: 'queued', progress: 'Queued for bounded Earth Engine processing.', createdAt: new Date(timestamp).toISOString(), updatedAt: timestamp };
    jobs.set(id, job); keys.set(key, id); activeJobId = id;
    Promise.resolve().then(async () => {
      job.status = 'running'; job.progress = 'Initializing verified GIS-AHP and Sentinel-1 processing.'; job.updatedAt = now();
      try {
        const runner = runnerFactory(label => { job.progress = String(label).slice(0, 160); job.updatedAt = now(); });
        const result = await runner.run({ monthly: true, sceneIds: input.selection, filters: input.filters });
        job.result = projectDynamicComparison(result, input); job.status = 'completed'; job.progress = 'Completed.'; job.updatedAt = now();
      } catch (error) {
        job.status = 'failed'; job.error = safeJobError(error); job.progress = 'Failed.'; job.updatedAt = now();
      } finally { if (activeJobId === id) activeJobId = null; clean(); }
    });
    return { status: 202, body: { ...view(job), cache: { hit: false, deduplicated: false } } };
  }
  function get(id) {
    clean();
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || !jobs.has(id)) throw failure('Dynamic comparison job was not found or has expired.', 404, 'DYNAMIC_RESEARCH_JOB_NOT_FOUND');
    return view(jobs.get(id));
  }
  return { start, get };
}

module.exports = { METHODS, parseDynamicComparisonInput, projectDynamicComparison, createDynamicResearchComparisonService };
