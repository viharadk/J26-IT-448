const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ARTIFACTS_ROOT = path.resolve(__dirname, '..', 'artifacts');
const RUN_PREFIX = 'phase5c-uncertainty-';
const MAX_RUNS = 20;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const EXPECTED_SCENES = Object.freeze({
  before: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20170524T002512_20170524T002537_016716_01BC28_3CCB',
  later: 'COPERNICUS/S1_GRD/S1B_IW_GRDH_1SDV_20170530T002430_20170530T002501_005820_00A340_FB2A',
});
const EXPECTED_BASINS = ['4100049050', '4101158680', '4101601920', '4101601930'];

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
function finite(value, label, minimum = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new Error(`Invalid ${label}.`);
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}.`);
  return value;
}
function iso(value, label) {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`Invalid ${label}.`);
  return result;
}
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function inside(root, candidate) { return candidate === root || candidate.startsWith(`${root}${path.sep}`); }

async function readJsonBounded(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_JSON_BYTES) throw new Error('Research artifact file is unavailable or unbounded.');
  const buffer = await fs.readFile(file);
  return { buffer, value: JSON.parse(buffer.toString('utf8')) };
}

function validateRows(rows, domainArea, candidateArea) {
  if (!Array.isArray(rows) || rows.length !== 4) throw new Error('Research class rows are incomplete.');
  const expected = [[1, 'Low'], [2, 'Moderate'], [3, 'High'], [4, 'Very High']];
  let domainSum = 0, candidateSum = 0;
  const result = rows.map((row, index) => {
    object(row, 'research class row');
    if (row.code !== expected[index][0] || row.label !== expected[index][1]) throw new Error('Research hazard classes are inconsistent.');
    const supportedAreaKm2 = finite(row.domainAreaKm2, 'class supported area');
    const classCandidateAreaKm2 = finite(row.candidateAreaKm2, 'class candidate area');
    const candidateRatePercent = finite(row.candidatePercent, 'class candidate rate');
    const expectedRate = supportedAreaKm2 > 0 ? classCandidateAreaKm2 / supportedAreaKm2 * 100 : 0;
    if (classCandidateAreaKm2 > supportedAreaKm2 + 1e-6 || candidateRatePercent > 100 || Math.abs(candidateRatePercent - expectedRate) > 1e-6) throw new Error('Research class accounting is inconsistent.');
    domainSum += supportedAreaKm2; candidateSum += classCandidateAreaKm2;
    return { classId: row.code, hazardClass: row.label, supportedAreaKm2, candidateAreaKm2: classCandidateAreaKm2, candidateRatePercent };
  });
  if (Math.abs(domainSum - domainArea) > 1e-6 || Math.abs(candidateSum - candidateArea) > 1e-6) throw new Error('Research class totals do not match their scenario.');
  return result;
}

function projectScenario(scenario, id, label) {
  object(scenario, 'research scenario');
  const commonValidAreaKm2 = finite(scenario.commonDomainAreaKm2, 'common valid area', Number.EPSILON);
  const candidateAreaKm2 = finite(scenario.candidateAreaKm2, 'candidate area');
  const candidateRatePercent = finite(scenario.candidateRatePercent, 'candidate rate');
  if (candidateAreaKm2 > commonValidAreaKm2 + 1e-6 || candidateRatePercent > 100 || Math.abs(candidateRatePercent - candidateAreaKm2 / commonValidAreaKm2 * 100) > 1e-6 || scenario.accounting?.passed !== true) throw new Error('Research scenario accounting failed.');
  const grouped = object(scenario.groupedComparison, 'grouped comparison');
  const lower = object(grouped.lower, 'lower-hazard group'), higher = object(grouped.higher, 'higher-hazard group');
  const ratio = finite(grouped.higherToLowerRateRatio, 'grouped candidate-rate ratio');
  const projected = {
    id, label, domainKind: scenario.domainKind, referenceMethod: scenario.referenceMethod,
    candidateStage: scenario.stage, commonValidAreaKm2, candidateAreaKm2, candidateRatePercent,
    groupedCandidateRateRatio: ratio,
    groupedRates: {
      lower: { classes: ['Low', 'Moderate'], supportedAreaKm2: finite(lower.domainAreaKm2, 'lower supported area'), candidateAreaKm2: finite(lower.candidateAreaKm2, 'lower candidate area'), candidateRate: finite(lower.candidateRate, 'lower candidate rate') },
      higher: { classes: ['High', 'Very High'], supportedAreaKm2: finite(higher.domainAreaKm2, 'higher supported area'), candidateAreaKm2: finite(higher.candidateAreaKm2, 'higher candidate area'), candidateRate: finite(higher.candidateRate, 'higher candidate rate') },
    },
    hazardClasses: validateRows(scenario.rows, commonValidAreaKm2, candidateAreaKm2),
  };
  if (Math.abs(projected.groupedRates.lower.supportedAreaKm2 + projected.groupedRates.higher.supportedAreaKm2 - commonValidAreaKm2) > 1e-6 ||
      Math.abs(projected.groupedRates.lower.candidateAreaKm2 + projected.groupedRates.higher.candidateAreaKm2 - candidateAreaKm2) > 1e-6) throw new Error('Grouped research denominators are inconsistent.');
  for (const group of [projected.groupedRates.lower, projected.groupedRates.higher]) {
    if (group.candidateAreaKm2 > group.supportedAreaKm2 + 1e-6 || Math.abs(group.candidateRate - group.candidateAreaKm2 / group.supportedAreaKm2) > 1e-9) throw new Error('Grouped research rates are inconsistent.');
  }
  if (projected.groupedRates.lower.candidateRate <= 0 || Math.abs(projected.groupedRates.higher.candidateRate / projected.groupedRates.lower.candidateRate - ratio) > 1e-9) throw new Error('Grouped research ratio is inconsistent.');
  return projected;
}

function findScenario(data, domainKind, referenceMethod) {
  const matches = data.scenarios.filter(item => item?.domainKind === domainKind && item?.referenceMethod === referenceMethod && item?.stage === 'final');
  if (matches.length !== 1) throw new Error('Required research comparison scenario is missing or duplicated.');
  return matches[0];
}

function validateAndProject({ measurement, execution, audit, baseline, measurementSha, baselineSha, experimentId }) {
  const data = object(measurement, 'research measurement');
  if (data.status !== 'completed' || data.scenarioCount !== 12 || !Array.isArray(data.scenarios) || data.scenarios.length !== 12) throw new Error('Research experiment is incomplete.');
  if (data.scientificValidationStatus !== 'DATA_NOT_READY') throw new Error('Research validation status is inconsistent.');
  const parameters = object(data.parameters, 'research parameters'), sceneIds = object(parameters.sceneIds, 'research scene IDs');
  if (sceneIds.before !== EXPECTED_SCENES.before || sceneIds.later !== EXPECTED_SCENES.later) throw new Error('Research scene pair does not match the verified May 2017 case study.');
  const filters = object(parameters.filters, 'research filters');
  if (filters.terrainFilter !== 'slope-v1' || filters.maxSlopeDegrees !== 5 || filters.clusterFilter !== 'connected-v1' || filters.minConnectedPixels !== 8) throw new Error('Research filtering configuration is not the verified final stage.');
  const pair = object(object(data.quality, 'research quality').pairAssessment, 'research pair assessment');
  if (pair.beforeSceneId !== EXPECTED_SCENES.before || pair.duringSceneId !== EXPECTED_SCENES.later || pair.status !== 'suitable') throw new Error('Research pair provenance is inconsistent.');
  const beforeAcquiredAt = iso(pair.beforeAcquiredAt, 'before acquisition time'), laterAcquiredAt = iso(pair.duringAcquiredAt, 'later acquisition time');
  if (!beforeAcquiredAt.startsWith('2017-05-24') || !laterAcquiredAt.startsWith('2017-05-30')) throw new Error('Research acquisition dates are not the verified case study.');
  const spatial = object(data.spatialMetadata, 'research spatial metadata');
  const basinIds = Array.isArray(spatial.basinIds) ? spatial.basinIds.map(String).sort() : [];
  if (JSON.stringify(basinIds) !== JSON.stringify(EXPECTED_BASINS)) throw new Error('Research study AOI is inconsistent.');
  if (execution.status !== 'completed' || execution.scenarioCount !== 12 || execution.executedAt !== data.executedAt || execution.priorRunComparison?.status !== 'REPRODUCED_WITHIN_TOLERANCE') throw new Error('Research execution manifest is not verified.');
  if (audit.status !== 'passed' || audit.resultsSha256 !== measurementSha || baselineSha !== execution.baselineSha256) throw new Error('Research artifact hashes are inconsistent.');
  const phase5a = object(baseline, 'Phase 5A baseline'), phase5aScenes = object(phase5a.parameters?.sceneIds, 'Phase 5A scene IDs'), phase5aFilters = object(phase5a.parameters?.filters, 'Phase 5A filters');
  if (phase5a.status !== 'completed' || phase5a.executedAt !== data.provenance?.baselineExecutedAt || !Array.isArray(phase5a.scenarios) || phase5a.scenarios.length !== 12 ||
      phase5aScenes.before !== EXPECTED_SCENES.before || phase5aScenes.later !== EXPECTED_SCENES.later || phase5aFilters.terrainFilter !== 'slope-v1' || phase5aFilters.maxSlopeDegrees !== 5 ||
      phase5aFilters.clusterFilter !== 'connected-v1' || phase5aFilters.minConnectedPixels !== 8) throw new Error('Phase 5A baseline schema or identity is inconsistent.');
  const executedAt = iso(data.executedAt, 'research execution time');
  const conservative = projectScenario(findScenario(data, 'native', 'yearly-conservative-v1'), 'conservative-native', 'Conservative native domain');
  const monthlyNative = projectScenario(findScenario(data, 'native', 'yearly-monthly-dry-v1'), 'monthly-native', 'Monthly native domain');
  const monthlyMatched = projectScenario(findScenario(data, 'fixed', 'yearly-monthly-dry-v1'), 'monthly-matched', 'Monthly matched common domain');
  const conservativeMatched = projectScenario(findScenario(data, 'fixed', 'yearly-conservative-v1'), 'conservative-matched-check', 'Conservative matched check');
  if (Math.abs(conservative.commonValidAreaKm2 - conservativeMatched.commonValidAreaKm2) > 1e-6 || Math.abs(conservative.candidateAreaKm2 - conservativeMatched.candidateAreaKm2) > 1e-6) throw new Error('Conservative native and fixed controls did not reproduce.');
  if (!Array.isArray(data.caveats) || data.caveats.length < 5 || !data.caveats.every(value => typeof value === 'string' && value.trim())) throw new Error('Research caveats are unavailable.');
  return {
    success: true, available: true,
    caseStudy: {
      id: 'lower-kelani-may-2017-phase5c',
      title: 'May 2017 GIS-AHP and SAR Research Comparison',
      researchQuestion: 'How does spatial observation support affect GIS-AHP and SAR agreement?',
      hypothesis: text(data.hypothesis, 'research hypothesis'),
      scientificValidationStatus: 'DATA_NOT_READY',
      studyArea: { name: 'Lower Kelani River Basin study AOI', basinIds, vectorAreaKm2: finite(spatial.aoiVectorAreaKm2, 'AOI vector area', Number.EPSILON) },
      scenes: {
        before: { sceneId: EXPECTED_SCENES.before, acquiredAt: beforeAcquiredAt },
        later: { sceneId: EXPECTED_SCENES.later, acquiredAt: laterAcquiredAt },
      },
      candidateStage: { id: 'final', terrainFilter: 'slope-v1', maxSlopeDegrees: 5, clusterFilter: 'connected-v1', minConnectedPixels: 8 },
      comparisons: [conservative, monthlyNative, monthlyMatched],
      interpretation: [
        text(data.sensitivity?.interpretation, 'support-sensitivity interpretation'),
        'Native-domain comparisons use different supported geography. The matched comparison restricts both methods to a common valid domain, so unequal native support is not mistaken for a response difference.',
        'Susceptibility describes relative predisposing conditions; experimental SAR candidates describe a radar response under one scene pair. They are not the same quantity.',
      ],
      caveats: [
        'Experimental SAR flood candidates only; not confirmed flood extent.',
        'One controlled May 2017 Sentinel-1 scene pair only.',
        ...data.caveats,
        'Not real-time flood forecasting. Shared-domain conclusions cannot be generalized to the whole basin.',
      ],
      provenance: {
        source: 'Completed and audited Phase 5C artifact derived from the reproduced Phase 5A baseline',
        experimentId, executedAt, phase5aBaselineExecutedAt: iso(data.provenance?.baselineExecutedAt, 'Phase 5A baseline execution time'),
        auditStatus: 'passed', auditedAt: iso(audit.auditedAt, 'research audit time'), scenarioCount: 12,
        priorRunComparison: 'REPRODUCED_WITHIN_TOLERANCE', measurementSha256: measurementSha,
        liveAnalysisExecuted: false,
      },
    },
  };
}

async function loadRun(runDir, artifactsRoot) {
  if (!inside(artifactsRoot, runDir)) throw new Error('Research run escaped the artifact root.');
  const [measurementFile, executionFile, auditFile] = await Promise.all([
    readJsonBounded(path.join(runDir, 'measurement-provenance.json')),
    readJsonBounded(path.join(runDir, 'execution.json')),
    readJsonBounded(path.join(runDir, 'additional-checks.json')),
  ]);
  const execution = object(executionFile.value, 'execution manifest');
  const relativeBaseline = text(execution.baselineFile, 'Phase 5A baseline').replace(/[\\/]+/g, path.sep);
  const baselinePath = path.resolve(path.dirname(artifactsRoot), relativeBaseline);
  if (!inside(artifactsRoot, baselinePath)) throw new Error('Phase 5A baseline escaped the artifact root.');
  const baselineStat = await fs.stat(baselinePath);
  if (!baselineStat.isFile() || baselineStat.size <= 0 || baselineStat.size > MAX_JSON_BYTES) throw new Error('Phase 5A baseline is unavailable or unbounded.');
  const baselineBuffer = await fs.readFile(baselinePath);
  const baseline = JSON.parse(baselineBuffer.toString('utf8'));
  return validateAndProject({ measurement: measurementFile.value, execution, audit: auditFile.value, baseline,
    measurementSha: sha256(measurementFile.buffer), baselineSha: sha256(baselineBuffer), experimentId: path.basename(runDir) });
}

async function loadResearchComparison({ artifactsRoot = ARTIFACTS_ROOT } = {}) {
  const root = path.resolve(artifactsRoot);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const runs = entries.filter(entry => entry.isDirectory() && entry.name.startsWith(RUN_PREFIX) && /^phase5c-uncertainty-[0-9TZ-]+$/.test(entry.name))
      .map(entry => path.join(root, entry.name)).sort().reverse().slice(0, MAX_RUNS);
    for (const run of runs) {
      try { return await loadRun(run, root); } catch { /* Try an older completed audited run. */ }
    }
  } catch { /* Explicit unavailable result below. */ }
  return { success: true, available: false, code: 'VERIFIED_RESEARCH_ARTIFACT_UNAVAILABLE',
    message: 'The verified May 2017 research comparison artifact is missing or invalid. No fallback scientific values are available.' };
}

module.exports = { EXPECTED_SCENES, loadResearchComparison, validateAndProject };
