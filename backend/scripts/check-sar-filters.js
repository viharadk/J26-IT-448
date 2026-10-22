require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { createSarSelectionService } = require('../services/sarSelectionService');
const { createSarSelectionRouter } = require('../routes/sarSelectionRoutes');
const { SCENES } = require('../services/sarPixelQuality');

async function main() {
  const folder = path.resolve(__dirname, '..', 'artifacts', `function2-phase4c-${Date.now()}`);
  await fs.mkdir(folder, { recursive: true });
  const app = express(); app.use('/api/sar', createSarSelectionRouter(createSarSelectionService()));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/sar/analysis`;
  const results = { verifiedAt: new Date().toISOString(), sceneIds: SCENES, comparisons: [], status: 'running' };
  const save = () => fs.writeFile(path.join(folder, 'comparison.json'), JSON.stringify(results, null, 2));
  async function get(referenceMethod, filtered) {
    const query = new URLSearchParams({ beforeSceneId: SCENES.before, laterSceneId: SCENES.later, referenceMethod,
      ...(filtered ? { terrainFilter: 'slope-v1', maxSlopeDegrees: '5', clusterFilter: 'connected-v1', minConnectedPixels: '8' } : {}) });
    const response = await fetch(`${base}?${query}`, { signal: AbortSignal.timeout(360000) });
    const body = await response.json();
    if (response.status !== 200) throw Object.assign(new Error(body.message), { status: response.status, code: body.code });
    return body;
  }
  try {
    const engine = require('../services/earthEngineService');
    await engine.initializeEarthEngine();
    results.topology = await require('./check-sar-filter-topology').verifyTopology(engine.ee);
    console.log('Real EE topology cases passed');
    for (const [method, expected] of [['yearly-conservative-v1', 1.331792], ['yearly-monthly-dry-v1', 6.298303]]) {
      console.log('Querying', method, 'unfiltered');
      const raw = await get(method, false);
      assert.ok(Math.abs(raw.areas.candidateAreaKm2 - expected) < 0.000001, 'Raw May 2017 regression changed');
      assert.equal(raw.filtering.finalCandidateAreaKm2, raw.areas.candidateAreaKm2);
      console.log('Querying', method, 'slope + connected');
      const filtered = await get(method, true), f = filtered.filtering;
      assert.deepEqual(filtered.areas, raw.areas, 'Raw area properties changed with filters');
      assert.deepEqual(filtered.waterReference, raw.waterReference, 'Reference mask metadata changed');
      assert.ok(Math.abs(f.rawCandidateAreaKm2 - f.afterSlopeAreaKm2 - f.slopeExcludedAreaKm2 - f.terrainNoDataCandidateAreaKm2) < 1e-6);
      assert.ok(Math.abs(f.afterSlopeAreaKm2 - f.finalCandidateAreaKm2 - f.clusterRemovedAreaKm2) < 1e-6);
      const tiles = [];
      for (const [stage, layer] of Object.entries(filtered.layers)) {
        const [lon, lat] = filtered.candidateCoordinates[0], z = 13, n = 2 ** z;
        const x = Math.floor((lon + 180) / 360 * n), y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
        const response = await fetch(layer.tileUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y), { signal: AbortSignal.timeout(120000) });
        assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/);
        const png = Buffer.from(await response.arrayBuffer()); assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        await fs.writeFile(path.join(folder, `${method}-${stage}.png`), png);
        tiles.push({ stage, status: response.status, bytes: png.length });
      }
      results.comparisons.push({ referenceMethod: method, raw, filtered, tiles });
      console.log('LIVE FILTERING', method, JSON.stringify(f)); await save();
    }
    results.status = 'passed'; await save(); console.log('LIVE COMPARISON PASSED', folder);
  } catch (error) {
    results.status = 'failed'; results.error = { message: error.message || String(error), status: error.status, code: error.code };
    await save(); console.error('LIVE COMPARISON FAILED', JSON.stringify(results.error), folder); process.exitCode = 1;
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
