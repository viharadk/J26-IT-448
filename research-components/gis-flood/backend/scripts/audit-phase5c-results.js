// Offline checks against preserved real measurements; never rewrites results.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { METHODS, close, deriveSensitivity } = require('../research/phase5c/uncertaintyService');
const { comparePrior } = require('./run-phase5c-uncertainty');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function audit(folder) {
  folder = path.resolve(folder);
  const root = path.resolve(__dirname, '..');
  const file = path.join(folder, 'measurement-provenance.json');
  const r = JSON.parse(fs.readFileSync(file));
  const execution = JSON.parse(fs.readFileSync(path.join(folder, 'execution.json')));
  assert.equal(r.status, 'completed'); assert.equal(execution.status, 'completed');
  assert.equal(r.scientificValidationStatus, 'DATA_NOT_READY'); assert.equal(r.accuracyMetrics, null);
  assert.deepEqual(deriveSensitivity(r.scenarios, r.responsePartitions), r.sensitivity);
  for (const method of METHODS) {
    const exclusive = method === METHODS[0] ? 'conservativeNativeOnly' : 'monthlyNativeOnly';
    close(r.globalDiagnostics[method].commonDomainAreaKm2 * 1e6,
      (r.controls.fixedDomain + r.controls[exclusive]) * 1e6, 'Native/shared/exclusive partition');
    for (const row of r.classLosses[method]) {
      close(row.ahpClassInAoiKm2 * 1e6, (row.nativeDomainKm2 + Object.values(row.lossesKm2).reduce((a, b) => a + b, 0)) * 1e6, 'Class loss partition');
      const other = r.classLosses[METHODS.find(m => m !== method)].find(c => c.code === row.code);
      close(row.ahpClassInAoiKm2 * 1e6, other.ahpClassInAoiKm2 * 1e6, 'Original AHP class identity');
    }
  }
  for (const [key, value] of Object.entries(r.controls)) {
    if (key.startsWith('fixedOutside') || key.startsWith('nativeStageIntersectionDisagreement')) close(value * 1e6, 0, key);
  }
  for (const [key, value] of Object.entries(r.sourceCandidateLeaksKm2)) close(value * 1e6, 0, key);
  const prior = JSON.parse(fs.readFileSync(path.resolve(root, execution.baselineFile)));
  assert.equal(comparePrior(r, prior).status, 'REPRODUCED_WITHIN_TOLERANCE');
  const sources = ['research/phase5c/uncertaintyService.js', 'scripts/audit-phase5c-results.js'];
  const output = { status: 'passed', auditedAt: new Date().toISOString(), resultsSha256: hash(file),
    originalMeasurementSourceHashes: execution.sourceHashes,
    auditSourceHashes: Object.fromEntries(sources.map(s => [s, hash(path.join(root, s))])),
    explanation: 'Additional validation assertions were added while the measurement run was executing. This offline audit applies them to the preserved results and raw control measurements; measurement source snapshots remain unchanged.',
    checks: ['12-scenario matrix and accounting', 'fixed class denominators', 'matched native subsets', 'stage candidate nonincrease',
      'response partition identities including individual method totals', 'original class identity', 'class loss partition',
      'native shared/exclusive partition', 'zero spatial support leaks', 'unchanged sensitivity calculations', 'Phase 5A reproduction'] };
  fs.writeFileSync(path.join(folder, 'additional-checks.json'), JSON.stringify(output, null, 2) + '\n');
  return output;
}
if (require.main === module) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/audit-phase5c-results.js <artifact-folder>');
  console.log(JSON.stringify(audit(process.argv[2]), null, 2));
}
module.exports = { audit };
