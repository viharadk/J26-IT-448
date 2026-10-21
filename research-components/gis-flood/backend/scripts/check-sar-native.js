require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { SCENES } = require('../services/sarPixelQuality');
const { createSarSelectionService } = require('../services/sarSelectionService');
const { createSarSelectionRouter } = require('../routes/sarSelectionRoutes');
const { createSarRouter } = require('../routes/sarRoutes');

async function main() {
  const folder = path.resolve(__dirname, '..', 'artifacts', `function2-native-${Date.now()}`); await fs.mkdir(folder);
  const service = createSarSelectionService();
  const app = express(); app.use('/api/sar', createSarSelectionRouter(service)); app.use('/api/sar', createSarRouter());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/sar`, params = new URLSearchParams({ beforeSceneId: SCENES.before, laterSceneId: SCENES.later });
  async function json(endpoint) {
    const response = await fetch(`${base}/${endpoint}`, { signal: AbortSignal.timeout(300000) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); assert.equal(result.success, true); return result;
  }
  try {
    const dates = 'beforeStart=2017-05-20&beforeEnd=2017-05-26&floodStart=2017-05-26&floodEnd=2017-06-02';
    const discovery = await json(`scenes?${dates}`), pairs = await json(`candidate-pairs?${dates}&pairLimit=100`);
    assert.ok(discovery.periods.before.scenes.some(s => s.sceneId === SCENES.before));
    assert.ok(pairs.candidatePairs.some(p => p.beforeSceneId === SCENES.before && p.duringSceneId === SCENES.later));
    console.log('Live discovery', Object.fromEntries(Object.entries(discovery.periods).map(([key, value]) => [key, value.totalCount])));
    const preview = await json(`selected-preview?${params}`);
    const quality = await json(`selected-pixel-quality?${params}`); assert.deepEqual(quality, preview.quality);
    await fs.writeFile(path.join(folder, 'preview.json'), JSON.stringify(preview, null, 2));
    console.log('Live common pixels', quality.common);
    const analysis = await json(`analysis?${params}`);
    console.log('ACTUAL EXPERIMENTAL PIXEL AREAS', analysis.areas);
    const checks = [];
    const coordinate = quality.samples[0].geometry.coordinates, z = 13, n = 2 ** z;
    const x = Math.floor((coordinate[0] + 180) / 360 * n), y = Math.floor((1 - Math.asinh(Math.tan(coordinate[1] * Math.PI / 180)) / Math.PI) / 2 * n);
    for (const [name, layer] of Object.entries({ ...preview.layers, candidates: analysis.layer })) {
      const target = name === 'candidates' ? analysis.candidateCoordinates[0] : coordinate;
      const tileX = target ? Math.floor((target[0] + 180) / 360 * n) : x;
      const tileY = target ? Math.floor((1 - Math.asinh(Math.tan(target[1] * Math.PI / 180)) / Math.PI) / 2 * n) : y;
      const response = await fetch(layer.tileUrl.replace('{z}', z).replace('{x}', tileX).replace('{y}', tileY), { signal: AbortSignal.timeout(120000) });
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/);
      const buffer = Buffer.from(await response.arrayBuffer()); assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      await fs.writeFile(path.join(folder, `${name}-z13.png`), buffer); checks.push({ layer: name, status: response.status, bytes: buffer.length, z, x: tileX, y: tileY });
    }
    // Positive candidate areas use an actual candidate sample for tile testing.
    // A genuine zero-candidate result may correctly produce a transparent tile.
    await fs.writeFile(path.join(folder, 'verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), discovery, pairs, preview, analysis, tileChecks: checks, endpointsPassed: ['scenes', 'candidate-pairs', 'selected-preview', 'selected-pixel-quality', 'analysis'] }, null, 2));
    console.log('LIVE VERIFICATION PASSED', folder);
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error('LIVE VERIFICATION FAILED', error, error.cause || ''); process.exitCode = 1; });
