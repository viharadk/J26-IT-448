const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const { loadResearchComparison, EXPECTED_SCENES } = require('../services/researchComparisonService');
const { createResearchRouter } = require('../routes/researchRoutes');

test('verified Phase 5C artifact returns only the bounded May 2017 comparison projection', async () => {
  const response = await loadResearchComparison();
  assert.equal(response.success, true); assert.equal(response.available, true);
  const study = response.caseStudy;
  assert.equal(study.scientificValidationStatus, 'DATA_NOT_READY');
  assert.equal(study.scenes.before.sceneId, EXPECTED_SCENES.before);
  assert.equal(study.scenes.later.sceneId, EXPECTED_SCENES.later);
  assert.deepEqual(study.candidateStage, { id: 'final', terrainFilter: 'slope-v1', maxSlopeDegrees: 5, clusterFilter: 'connected-v1', minConnectedPixels: 8 });
  assert.deepEqual(study.comparisons.map(item => item.id), ['conservative-native', 'monthly-native', 'monthly-matched']);
  const [conservative, monthlyNative, monthlyMatched] = study.comparisons;
  assert.ok(Math.abs(conservative.commonValidAreaKm2 - 2.4133288499695422) < 1e-12);
  assert.ok(Math.abs(conservative.candidateAreaKm2 - 0.9378697991027832) < 1e-12);
  assert.ok(Math.abs(conservative.groupedCandidateRateRatio - 2.007574771589242) < 1e-12);
  assert.ok(Math.abs(monthlyNative.commonValidAreaKm2 - 494.3259474488042) < 1e-12);
  assert.ok(Math.abs(monthlyNative.candidateAreaKm2 - 5.232837089302063) < 1e-12);
  assert.ok(Math.abs(monthlyNative.groupedCandidateRateRatio - 12.591028192796738) < 1e-12);
  assert.ok(Math.abs(monthlyMatched.commonValidAreaKm2 - conservative.commonValidAreaKm2) < 1e-12);
  assert.ok(Math.abs(monthlyMatched.candidateAreaKm2 - 0.9635829000625611) < 1e-12);
  assert.ok(Math.abs(monthlyMatched.groupedCandidateRateRatio - 1.9738222522544904) < 1e-12);
  for (const comparison of study.comparisons) {
    assert.equal(comparison.candidateStage, 'final'); assert.equal(comparison.hazardClasses.length, 4);
    assert.deepEqual(comparison.hazardClasses.map(row => row.hazardClass), ['Low', 'Moderate', 'High', 'Very High']);
    assert.ok(Math.abs(comparison.hazardClasses.reduce((sum, row) => sum + row.supportedAreaKm2, 0) - comparison.commonValidAreaKm2) < 1e-6);
  }
  const serialized = JSON.stringify(response);
  for (const forbidden of ['baselineFile', 'sourceHashes', 'credentials', 'private_key', 'D:\\', '/Users/', '/home/']) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.equal(study.provenance.liveAnalysisExecuted, false);
  assert.match(study.provenance.measurementSha256, /^[a-f0-9]{64}$/);
});

test('missing and invalid artifacts return explicit unavailable data without fallback findings', async () => {
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'b1-empty-'));
  const invalid = await fs.mkdtemp(path.join(os.tmpdir(), 'b1-invalid-'));
  try {
    assert.deepEqual(await loadResearchComparison({ artifactsRoot: empty }), {
      success: true, available: false, code: 'VERIFIED_RESEARCH_ARTIFACT_UNAVAILABLE',
      message: 'The verified May 2017 research comparison artifact is missing or invalid. No fallback scientific values are available.',
    });
    const run = path.join(invalid, 'phase5c-uncertainty-2026-01-01T00-00-00-000Z');
    await fs.mkdir(run);
    await Promise.all(['measurement-provenance.json', 'execution.json', 'additional-checks.json'].map(name => fs.writeFile(path.join(run, name), '{invalid')));
    const result = await loadResearchComparison({ artifactsRoot: invalid });
    assert.equal(result.available, false); assert.equal('caseStudy' in result, false);
  } finally {
    await fs.rm(empty, { recursive: true, force: true });
    await fs.rm(invalid, { recursive: true, force: true });
  }
});

async function withServer(load, work) {
  const app = express(); app.use('/api/research', createResearchRouter(load));
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('read-only endpoint rejects query-based scene substitution and preserves unavailable payloads', async () => {
  let calls = 0;
  await withServer(async () => { calls++; return { success: true, available: false, code: 'VERIFIED_RESEARCH_ARTIFACT_UNAVAILABLE', message: 'No verified artifact.' }; }, async origin => {
    const good = await fetch(`${origin}/api/research/ahp-sar-comparison`);
    assert.equal(good.status, 200); assert.equal(good.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await good.json(), { success: true, available: false, code: 'VERIFIED_RESEARCH_ARTIFACT_UNAVAILABLE', message: 'No verified artifact.' });
    const rejected = await fetch(`${origin}/api/research/ahp-sar-comparison?beforeSceneId=fake`);
    assert.equal(rejected.status, 400); assert.equal((await rejected.json()).code, 'UNSUPPORTED_RESEARCH_QUERY');
    assert.equal(calls, 1, 'query rejection occurs before artifact access');
  });
});
