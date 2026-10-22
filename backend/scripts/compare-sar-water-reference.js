require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { createSarSelectionService } = require('../services/sarSelectionService');
const { createSarSelectionRouter } = require('../routes/sarSelectionRoutes');
const { CONSERVATIVE, MONTHLY_DRY } = require('../services/sarWaterReferenceService');
const { SCENES } = require('../services/sarPixelQuality');
async function main() {
  const folder = path.resolve(__dirname, '..', 'artifacts', `function2-phase4b-comparison-${Date.now()}`); await fs.mkdir(folder);
  const app = express(); app.use('/api/sar', createSarSelectionRouter(createSarSelectionService()));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/sar`, query = new URLSearchParams({ beforeSceneId: SCENES.before, laterSceneId: SCENES.later });
  async function get(endpoint) {
    const response = await fetch(`${base}/${endpoint}`, { signal: AbortSignal.timeout(300000) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body;
  }
  try {
    const conservative = await get(`analysis?${query}`);
    await fs.writeFile(path.join(folder, 'conservative.json'), JSON.stringify(conservative, null, 2));
    console.log('CONSERVATIVE', conservative.areas);
    const proposed = await get(`analysis?${query}&referenceMethod=${MONTHLY_DRY}`);
    await fs.writeFile(path.join(folder, 'monthly-supported.json'), JSON.stringify(proposed, null, 2));
    console.log('OPTIONAL MONTHLY', proposed.areas);
    const baseline = JSON.parse(await fs.readFile(path.resolve(__dirname, '../artifacts/function2-native-1792470311188/verification.json'), 'utf8')).analysis;
    for (const key of ['commonSarAreaKm2', 'validAnalysisAreaKm2', 'candidateAreaKm2', 'ancillaryUnknownAreaKm2']) assert.ok(Math.abs(conservative.areas[key] - baseline.areas[key]) < 1e-6, `${key}: published baseline changed`);
    for (const data of [conservative, proposed]) {
      const a = data.areas;
      assert.ok(Math.abs(a.rasterAoiAreaKm2 - a.validAnalysisAreaKm2 - a.ancillaryUnknownAreaKm2 - a.smoothingEdgeExcludedAreaKm2 - a.missingSarAreaKm2) < 1e-6);
      assert.ok(Math.abs(a.validAnalysisAreaKm2 - a.observedAnnualSupportAreaKm2 - a.monthlyInferredEligibleAreaKm2) < 1e-6);
      assert.ok(Math.abs(a.observedAnnualSupportAreaKm2 - a.annualNotWaterAreaKm2 - a.annualSeasonalWaterAreaKm2 - a.excludedPermanentWaterAreaKm2) < 1e-6);
      assert.ok(Math.abs(a.candidateAreaKm2 - a.candidateObservedAnnualAreaKm2 - a.candidateMonthlyInferredAreaKm2) < 1e-6);
    }
    assert.ok(Math.abs(proposed.areas.commonSarAreaKm2 - conservative.areas.commonSarAreaKm2) < 1e-6);
    assert.ok(Math.abs(proposed.areas.excludedPermanentWaterAreaKm2 - conservative.areas.excludedPermanentWaterAreaKm2) < 1e-6);
    assert.ok(Math.abs(proposed.areas.candidateObservedAnnualAreaKm2 - conservative.areas.candidateAreaKm2) < 1e-6);
    const defaultAgain = await get(`analysis?${query}`); assert.deepEqual(defaultAgain, conservative);
    const quality = await get(`selected-pixel-quality?${query}`), preview = await get(`selected-preview?${query}`);
    assert.equal(quality.pairAssessment.status, 'suitable'); assert.deepEqual(preview.quality, quality);
    const tiles = [];
    for (const [method, data] of [[CONSERVATIVE, conservative], [MONTHLY_DRY, proposed]]) {
      const [lon, lat] = data.candidateCoordinates[0], z = 13, n = 2 ** z;
      const x = Math.floor((lon + 180) / 360 * n), y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
      const response = await fetch(data.layer.tileUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y), { signal: AbortSignal.timeout(120000) });
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/);
      const png = Buffer.from(await response.arrayBuffer()); assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      await fs.writeFile(path.join(folder, `${method}-tile.png`), png); tiles.push({ method, status: response.status, bytes: png.length, z, x, y });
    }
    const comparison = { verifiedAt: new Date().toISOString(), sceneIds: SCENES, conservative, proposed,
      candidateAreaChangeKm2: proposed.areas.candidateAreaKm2 - conservative.areas.candidateAreaKm2,
      supportedAreaChangeKm2: proposed.areas.validAnalysisAreaKm2 - conservative.areas.validAnalysisAreaKm2,
      baselineReproduced: true, partitionsReconciled: true, defaultsRemainConservative: true, selectedPreviewAndQualityPassed: true, tiles,
      interpretation: 'Coverage comparison only. Expanded inferred eligibility or a larger candidate response does not establish improved flood accuracy.' };
    await fs.writeFile(path.join(folder, 'comparison.json'), JSON.stringify(comparison, null, 2));
    console.log('COMPARISON PASSED', folder, 'candidate delta km²', comparison.candidateAreaChangeKm2);
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error('COMPARISON FAILED', error, error.cause || ''); process.exitCode = 1; });
