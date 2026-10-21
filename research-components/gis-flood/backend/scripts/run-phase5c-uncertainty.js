require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createUncertaintyService, METHODS, LOSS_KEYS } = require('../research/phase5c/uncertaintyService');
const { CLASSES, STAGES, TOLERANCE_M2 } = require('../services/ahpSarResearchService');
const { SCENES } = require('../services/sarPixelQuality');
const { safeError } = require('./run-ahp-sar-research');
const ROOT = path.resolve(__dirname, '..'), ARTIFACTS = path.join(ROOT, 'artifacts');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const quote = value => value === null || value === undefined ? '' : `"${String(value).replaceAll('"', '""')}"`;
function csv(rows) {
  if (!rows.length) throw new Error('No computed rows to export.');
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return keys.join(',') + '\n' + rows.map(row => keys.map(key => quote(row[key])).join(',')).join('\n') + '\n';
}
async function latestSuccessfulPhase5a() {
  const entries = await fs.readdir(ARTIFACTS, { withFileTypes: true });
  const attempts = await Promise.all(entries.filter(e => e.isDirectory() && e.name.startsWith('ahp-sar-phase5a-')).map(async e => {
    try {
      const file = path.join(ARTIFACTS, e.name, 'results.json'), bytes = await fs.readFile(file);
      const result = JSON.parse(bytes), execution = JSON.parse(await fs.readFile(path.join(ARTIFACTS, e.name, 'execution.json'), 'utf8'));
      if (result.status !== 'completed' || execution.status !== 'completed' || result.scenarios?.length !== 12 || !Number.isFinite(Date.parse(result.executedAt))) return null;
      return { file, sha256: sha(bytes), result };
    } catch { return null; }
  }));
  const successful = attempts.filter(Boolean).sort((a, b) => Date.parse(b.result.executedAt) - Date.parse(a.result.executedAt));
  if (!successful.length) throw new Error('No successfully completed real Phase 5A artifact is available.');
  return successful[0];
}
function comparePrior(result, prior) {
  const differences = [];
  for (const s of result.scenarios) {
    const previous = prior.scenarios.find(p => p.referenceMethod === s.referenceMethod && p.stage === s.stage &&
      p.domainKind === (s.domainKind === 'native' ? 'reference-specific-stage-shared' : 'identical-cross-reference'));
    if (!previous) throw new Error('Prior comparison matrix lacks a matching scenario.');
    const check = (name, a, b) => { const deltaM2 = (a - b) * 1e6;
      if (Math.abs(deltaM2) > TOLERANCE_M2) differences.push({ domainKind: s.domainKind, referenceMethod: s.referenceMethod, stage: s.stage, measurement: name, previousKm2: b, currentKm2: a, deltaM2 }); };
    check('domain', s.commonDomainAreaKm2, previous.commonDomainAreaKm2);
    check('candidate', s.candidateAreaKm2, previous.candidateAreaKm2);
    for (const row of s.rows) {
      const old = previous.rows.find(p => p.code === row.code);
      if (!old) throw new Error('Prior hazard encoding is incompatible.');
      check(`class_${row.code}_domain`, row.domainAreaKm2, old.domainAreaKm2);
      check(`class_${row.code}_candidate`, row.candidateAreaKm2, old.candidateAreaKm2);
    }
  }
  return { status: differences.length ? 'DIFFERENCES_REQUIRE_INVESTIGATION' : 'REPRODUCED_WITHIN_TOLERANCE', toleranceM2: TOLERANCE_M2, differences };
}
function summary(result) {
  const primary = result.scenarios.find(s => s.domainKind === 'native' && s.referenceMethod === METHODS[0] && s.stage === 'final');
  const monthlyNative = result.scenarios.find(s => s.domainKind === 'native' && s.referenceMethod === METHODS[1] && s.stage === 'final');
  const monthlyFixed = result.scenarios.find(s => s.domainKind === 'fixed' && s.referenceMethod === METHODS[1] && s.stage === 'final');
  const finalSplit = result.sensitivity.decomposition.find(d => d.stage === 'final');
  const monthlyFraction = result.sensitivity.representation.find(r => r.referenceMethod === METHODS[1]).fixedFractionOfNativePercent;
  const f = (n, d = 6) => n === null || n === undefined ? 'not estimable' : n.toFixed(d);
  return `Implemented methods reuse the unchanged GIS-AHP image, May 2017 Sentinel-1 pair, historical-water eligibility and SAR filters. In the completed ${result.scenarioCount}-scenario experiment, conservative final candidates covered ${f(primary.candidateAreaKm2)} km² of ${f(primary.commonDomainAreaKm2)} km² valid support; the grouped High/Very High versus Low/Moderate rate ratio was ${f(primary.groupedComparison.higherToLowerRateRatio, 3)}. The monthly native-domain ratio was ${f(monthlyNative.groupedComparison.higherToLowerRateRatio, 3)}, compared with ${f(monthlyFixed.groupedComparison.higherToLowerRateRatio, 3)} on fixed matched support. The fixed domain represented ${f(monthlyFraction, 3)}% of monthly native support. Of the signed final native candidate-area difference, ${f(finalSplit.nonsharedShareOfSignedAreaDifferencePercent, 3)}% lay in the nonshared-support contribution under the stated decomposition. The pooled higher-hazard rate exceeded the lower-hazard rate in ${result.sensitivity.groupedDirectionPositiveScenarios} scenarios, while ${result.sensitivity.monotonicScenarios} showed nondecreasing rates across every individual class. These scenarios are dependent sensitivity controls; the non-monotonic High/Very High pattern has no established hydrologic causal explanation. These are preliminary geographic response observations, not validated flood extent or prediction accuracy; independent validation remains DATA_NOT_READY.`;
}
function exportRows(result) {
  const meta = { beforeSceneId: SCENES.before, laterSceneId: SCENES.later,
    parametersJson: JSON.stringify(result.parameters), gridJson: JSON.stringify(result.methodology.grid),
    independentValidationStatus: result.scientificValidationStatus };
  const find = (method, stage, kind) => result.scenarios.find(s => s.referenceMethod === method && s.stage === stage && s.domainKind === kind);
  const scenarioRows = [], classRows = [], fixedRows = [];
  for (const s of result.scenarios) {
    const ledger = result.globalDiagnostics[s.referenceMethod], native = find(s.referenceMethod, s.stage, 'native');
    const row = { ...meta, domainKind: s.domainKind, domainId: s.domainId, referenceMethod: s.referenceMethod, stage: s.stage,
      validAnalysisAreaKm2: s.commonDomainAreaKm2, candidateAreaKm2: s.candidateAreaKm2, candidateRatePercent: s.candidateRatePercent,
      supportedNonCandidateAreaKm2: s.nonCandidateAreaKm2, groupedHigherToLowerRateRatio: s.groupedComparison.higherToLowerRateRatio,
      higherGroupRatePercent: s.groupedComparison.higher.candidateRate === null ? null : s.groupedComparison.higher.candidateRate * 100,
      lowerGroupRatePercent: s.groupedComparison.lower.candidateRate === null ? null : s.groupedComparison.lower.candidateRate * 100,
      monotonicAcrossClasses: s.patterns.monotonicNondecreasingAcrossClasses,
      matchedRestrictionExcludedKm2: s.domainKind === 'fixed' ? native.commonDomainAreaKm2 - s.commonDomainAreaKm2 : 0,
      ...Object.fromEntries(Object.entries(ledger.exclusiveLossesKm2).map(([key, value]) => [`nativeLedger_${key}Km2`, value])) };
    scenarioRows.push(row);
    for (const c of s.rows) {
      const classLoss = result.classLosses[s.referenceMethod].find(l => l.code === c.code);
      const classRow = { ...meta, domainKind: s.domainKind, domainId: s.domainId, referenceMethod: s.referenceMethod, stage: s.stage,
        totalValidDomainKm2: s.commonDomainAreaKm2, ...c,
        matchedRestrictionClassExcludedKm2: s.domainKind === 'fixed' ? native.rows.find(n => n.code === c.code).domainAreaKm2 - c.domainAreaKm2 : 0,
        ahpClassInAoiKm2: classLoss.ahpClassInAoiKm2,
        ...Object.fromEntries(Object.entries(classLoss.lossesKm2).map(([key, value]) => [`nativeClassLoss_${key}Km2`, value])) };
      classRows.push(classRow);
      if (s.domainKind === 'fixed') {
        const reference = find(METHODS[0], s.stage, 'fixed'), refClass = reference.rows.find(r => r.code === c.code);
        const previousStage = s.stage === 'raw' ? null : find(s.referenceMethod, s.stage === 'terrain' ? 'raw' : 'terrain', 'fixed');
        const previousClass = previousStage?.rows.find(r => r.code === c.code);
        fixedRows.push({ ...classRow,
          candidateAreaDifferenceVsConservativeSameStageKm2: c.candidateAreaKm2 - refClass.candidateAreaKm2,
          candidateRateDifferenceVsConservativePercentagePoints: c.candidatePercent !== null && refClass.candidatePercent !== null ? c.candidatePercent - refClass.candidatePercent : null,
          enrichmentDifferenceVsConservative: c.enrichmentRatio !== null && refClass.enrichmentRatio !== null ? c.enrichmentRatio - refClass.enrichmentRatio : null,
          areaRemovedAfterPreviousStageKm2: previousClass ? previousClass.candidateAreaKm2 - c.candidateAreaKm2 : null,
          groupedRatio: s.groupedComparison.higherToLowerRateRatio,
          groupedRatioDifferenceVsConservative: s.groupedComparison.higherToLowerRateRatio !== null && reference.groupedComparison.higherToLowerRateRatio !== null ? s.groupedComparison.higherToLowerRateRatio - reference.groupedComparison.higherToLowerRateRatio : null });
      }
    }
  }
  const lossRows = METHODS.flatMap(method => result.classLosses[method].map(row => ({ ...meta, referenceMethod: method,
    code: row.code, label: row.label, ahpClassInAoiKm2: row.ahpClassInAoiKm2, nativeDomainKm2: row.nativeDomainKm2,
    nativeRetentionPercent: row.nativeRetentionPercent, ...row.lossesKm2 })));
  const filterRows = result.sensitivity.filterChanges.flatMap(change => change.classes.map(c => ({ ...meta,
    referenceMethod: change.referenceMethod, domainKind: change.domainKind, fromStage: change.fromStage, toStage: change.toStage, ...c })));
  return { 'scenario-results.csv': scenarioRows, 'hazard-class-overlap.csv': classRows,
    'fixed-matched-domain-comparison.csv': fixedRows, 'hazard-class-support-losses.csv': lossRows,
    'domain-response-decomposition.csv': result.sensitivity.decomposition.map(row => ({ ...meta, ...row })),
    'filter-class-removals.csv': filterRows,
    'fixed-response-partitions.csv': STAGES.map(stage => ({ ...meta, stage, ...result.responsePartitions[stage] })) };
}

async function main() {
  const baseline = await latestSuccessfulPhase5a();
  const folder = path.join(ARTIFACTS, `phase5c-uncertainty-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.mkdir(path.join(folder, 'measurements'), { recursive: true });
  const write = (file, value) => fs.writeFile(path.join(folder, file), value, 'utf8');
  const execution = { status: 'running', startedAt: new Date().toISOString(),
    baselineFile: path.relative(ROOT, baseline.file), baselineSha256: baseline.sha256, completedMeasurements: [] };
  console.log(`Phase 5C artifacts: ${folder}`);
  const files = [...new Set([...Object.keys(baseline.result.reproducibility.sourceHashes),
    'research/phase5c/uncertaintyService.js', 'scripts/run-phase5c-uncertainty.js'])];
  try {
    for (const file of files) {
      const bytes = await fs.readFile(path.join(ROOT, file));
      const expected = baseline.result.reproducibility.sourceHashes[file];
      if (expected && sha(bytes) !== expected) throw new Error('Frozen Phase 5A source differs from latest successful run: ' + file);
      const copy = path.join(folder, 'sources', file + '.txt');
      await fs.mkdir(path.dirname(copy), { recursive: true }); await fs.writeFile(copy, bytes);
      if (!execution.sourceHashes) execution.sourceHashes = {};
      execution.sourceHashes[file] = sha(bytes);
    }
    if (JSON.stringify(baseline.result.parameters.sceneIds) !== JSON.stringify(SCENES)) throw new Error('Phase 5A scene pair differs from the controlled May 2017 pair.');
    await write('execution.json', JSON.stringify(execution, null, 2));
    const result = await createUncertaintyService({ onProgress: label => console.log(label),
      onMeasurement: async (label, value) => {
        const file = `measurements/${label}.json`;
        await write(file, JSON.stringify(value, null, 2)); execution.completedMeasurements.push(file);
        await write('execution.json', JSON.stringify(execution, null, 2));
      }
    }).run();
    result.provenance = { baselineFile: execution.baselineFile, baselineSha256: baseline.sha256,
      baselineExecutedAt: baseline.result.executedAt, sourceHashes: execution.sourceHashes,
      independentValidationEvidence: { phase6a: 'artifacts/phase6a-reference-acquisition/phase6a-status.json', phase6b: 'artifacts/phase6b-feasibility/feasibility-results.json' },
      command: 'node scripts/run-phase5c-uncertainty.js' };
    for (const [phase, file] of Object.entries(result.provenance.independentValidationEvidence)) {
      const prior = JSON.parse(await fs.readFile(path.join(ROOT, file), 'utf8'));
      if (prior.status !== 'DATA_NOT_READY' || prior.scientificValidationExecuted !== false) throw new Error(`Independent validation status changed in ${phase}; review before interpretation.`);
    }
    result.priorRunComparison = comparePrior(result, baseline.result);
    if (result.priorRunComparison.differences.length) result.status = 'completed-with-differences-needing-investigation';
    await write('measurement-provenance.json', JSON.stringify(result, null, 2));
    for (const [name, rows] of Object.entries(exportRows(result))) await write(name, csv(rows));
    await write('pp1-findings.txt', summary(result) + '\n');
    execution.status = result.status; execution.executedAt = result.executedAt; execution.scenarioCount = result.scenarioCount;
    execution.priorRunComparison = result.priorRunComparison;
    await write('execution.json', JSON.stringify(execution, null, 2));
    console.log(summary(result));
    console.log(`Phase 5C ${result.status}: ${folder}`);
    if (result.priorRunComparison.differences.length) process.exitCode = 1;
  } catch (error) {
    execution.status = 'failed'; execution.failedAt = new Date().toISOString();
    execution.errors = [];
    for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) execution.errors.push(safeError(current));
    await write('execution.json', JSON.stringify(execution, null, 2));
    await write('pp1-findings.txt', `INCOMPLETE REAL RUN. No completed Phase 5C experiment is claimed.\n${execution.errors.join('\n')}\nCompleted raw measurements are retained in this directory; no missing values are fabricated.\n`);
    console.error(execution.errors.join(' / ')); process.exitCode = 1;
  }
}
if (require.main === module) main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
module.exports = { latestSuccessfulPhase5a, comparePrior, summary, exportRows, csv };
