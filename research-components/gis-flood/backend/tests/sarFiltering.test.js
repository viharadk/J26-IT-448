const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseFilters, filterMasks, summarizeFiltering, DEM } = require('../services/sarFiltering');
const { createSarSelectionRouter } = require('../routes/sarSelectionRoutes');
const { createSarSelectionService } = require('../services/sarSelectionService');
const { createSarCandidateService } = require('../services/sarCandidateService');
const { SCENES } = require('../services/sarPixelQuality');

test('filters are opt-in; options and even unused thresholds are scalar, finite and bounded', () => {
  assert.deepEqual(parseFilters(), { terrainFilter: 'none', maxSlopeDegrees: null, clusterFilter: 'none', minConnectedPixels: null });
  assert.deepEqual(parseFilters({ terrainFilter: 'slope-v1', clusterFilter: 'connected-v1' }),
    { terrainFilter: 'slope-v1', maxSlopeDegrees: 5, clusterFilter: 'connected-v1', minConnectedPixels: 8 });
  assert.equal(parseFilters({ terrainFilter: 'slope-v1', maxSlopeDegrees: '1.5' }).maxSlopeDegrees, 1.5);
  assert.equal(parseFilters({ clusterFilter: 'connected-v1', minConnectedPixels: '128' }).minConnectedPixels, 128);
  for (const query of [{ terrainFilter: 'slope' }, { clusterFilter: ['connected-v1'] }, { terrainFilter: null }, { maxSlopeDegrees: '' },
    { maxSlopeDegrees: '0' }, { maxSlopeDegrees: '46' }, { maxSlopeDegrees: 'Infinity' }, { maxSlopeDegrees: [] },
    { minConnectedPixels: '8.5' }, { minConnectedPixels: '129' }, { minConnectedPixels: '-1' }, { minConnectedPixels: 'NaN' }, { minConnectedPixels: {} }]) {
    assert.throws(() => parseFilters(query), error => error.status === 422 && error.code === 'SAR_FILTER_INVALID');
  }
});

// Offline mask algebra runs the actual production filterMasks. It checks topology
// and no-data semantics; it does not substitute for real EE projection validation.
function rasterFixture(rows, slopeRows = rows.map(row => row.map(() => 0))) {
  const height = rows.length, width = rows[0].length, size = height * width, calls = [];
  const vector = n => n instanceof Raster ? n : new Raster(Array(size).fill(n));
  class Raster {
    constructor(values, masks = Array(size).fill(1)) { this.values = values; this.masks = masks; }
    op(other, fn) { other = vector(other); return new Raster(this.values.map((v, i) => fn(v, other.values[i])), this.masks.map((m, i) => Number(!!(m && other.masks[i])))); }
    multiply(v) { return this.op(v, (a, b) => a * b); }
    gt(v) { return this.op(v, (a, b) => Number(a > b)); } gte(v) { return this.op(v, (a, b) => Number(a >= b)); }
    lte(v) { return this.op(v, (a, b) => Number(a <= b)); }
    not() { return new Raster(this.values.map(v => Number(!v)), this.masks); }
    mask() { return new Raster(this.masks); }
    updateMask(v) { v = vector(v); return new Raster(this.values, this.masks.map((m, i) => Number(!!(m && v.masks[i] && v.values[i])))); }
    selfMask() { return this.updateMask(this); }
    unmask(v) { return new Raster(this.values.map((n, i) => this.masks[i] ? n : v)); }
    toByte() { return this; } clip(aoi) { assert.equal(aoi, graph.aoi); return this; }
    reproject(grid) { assert.equal(grid, graph.grid); calls.push('reproject'); return this; }
    select(band) { assert.equal(band, 'elevation'); return this; }
    connectedPixelCount(options) {
      assert.equal(options.eightConnected, true); calls.push(options);
      const counts = Array(size).fill(0), visited = new Set();
      for (let i = 0; i < size; i++) {
        if (visited.has(i) || !this.masks[i]) continue;
        const component = [i]; visited.add(i);
        for (let k = 0; k < component.length; k++) {
          const p = component[k], x = p % width, y = Math.floor(p / width);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy, q = ny * width + nx;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(q) && this.masks[q] && this.values[q] === this.values[p]) { visited.add(q); component.push(q); }
          }
        }
        for (const p of component) counts[p] = Math.min(options.maxSize, component.length);
      }
      return new Raster(counts, this.masks);
    }
  }
  const from = input => new Raster(input.flat().map(v => v ?? 0), input.flat().map(v => Number(v !== null)));
  const graph = { grid: {}, aoi: {}, valid: from(rows.map(row => row.map(v => v === null ? null : 1))) };
  const slope = from(slopeRows);
  const ee = { Image: id => { assert.equal(id, DEM); calls.push('DEM'); return slope; }, Terrain: { slope: input => { assert.equal(input, slope); calls.push('nativeSlope'); return slope; } } };
  return { ee, graph, candidates: from(rows), calls, active: image => image.values.flatMap((v, i) => image.masks[i] && v ? [i] : []) };
}
function apply(rows, query, slope) {
  const f = rasterFixture(rows, slope); return { ...f, images: filterMasks(f.ee, f.candidates, f.graph, parseFilters(query)) };
}
const both = { terrainFilter: 'slope-v1', clusterFilter: 'connected-v1', minConnectedPixels: '2' };
test('disabled filters preserve candidate pixels and never query the DEM or connectivity', () => {
  const f = apply([[1, 0, null, 1]], {});
  assert.deepEqual(f.active(f.images.raw), [0, 3]); assert.deepEqual(f.active(f.images.final), [0, 3]);
  assert.equal(f.calls.includes('DEM'), false); assert.equal(f.calls.some(v => typeof v === 'object'), false);
});
test('fully masked, no-candidate and all terrain-no-data cases remain empty/unobserved', () => {
  for (const rows of [[[null, null]], [[0, 0]]]) {
    const f = apply(rows, both); assert.deepEqual(f.active(f.images.final), []); assert.deepEqual(f.active(f.images.clusterRemoved), []);
  }
  const f = apply([[1, 1]], both, [[null, null]]);
  assert.deepEqual(f.active(f.images.unknown), [0, 1]); assert.deepEqual(f.active(f.images.unknownSupport), [0, 1]);
  assert.deepEqual(f.active(f.images.steep), []); assert.deepEqual(f.active(f.images.final), []);
});
test('inclusive slope threshold separates steep and no-data pixels; slope happens before SAR alignment', () => {
  const f = apply([[1, 1, 1, 0]], { terrainFilter: 'slope-v1' }, [[5, 5.1, null, null]]);
  assert.deepEqual(f.active(f.images.terrain), [0]); assert.deepEqual(f.active(f.images.steep), [1]); assert.deepEqual(f.active(f.images.unknown), [2]);
  assert.deepEqual(f.active(f.images.unknownSupport), [2, 3]);
  assert.equal(f.calls[f.calls.indexOf('nativeSlope') + 1], 'reproject');
});
test('8-connectivity includes diagonals/current pixel and never connects through zero/invalid/terrain gaps', () => {
  const f = apply([[1, 0, 0, 0, 1], [0, 1, 0, 0, 0]], { clusterFilter: 'connected-v1', minConnectedPixels: '2' });
  assert.deepEqual(f.active(f.images.final), [0, 6]); assert.deepEqual(f.active(f.images.clusterRemoved), [4]);
  for (const gap of [0, null]) {
    const separated = apply([[1, gap, 1]], { clusterFilter: 'connected-v1', minConnectedPixels: '2' });
    assert.deepEqual(separated.active(separated.images.final), []);
  }
  const steep = apply([[1, 1, 1]], both, [[0, 6, 0]]); assert.deepEqual(steep.active(steep.images.final), []);
  const unknown = apply([[1, 1, 1]], both, [[0, null, 0]]); assert.deepEqual(unknown.active(unknown.images.final), []);
  const singleton = apply([[1]], { clusterFilter: 'connected-v1', minConnectedPixels: '1' }); assert.deepEqual(singleton.active(singleton.images.final), [0]);
  assert.equal(singleton.calls.find(v => typeof v === 'object').maxSize, 2);
});
test('exact-threshold and much larger connected patches survive capped counting', () => {
  for (const length of [8, 300]) {
    const f = apply([Array(length).fill(1)], { clusterFilter: 'connected-v1' });
    assert.equal(f.active(f.images.final).length, length); assert.equal(f.active(f.images.clusterRemoved).length, 0);
    assert.deepEqual(f.calls.find(v => typeof v === 'object'), { maxSize: 8, eightConnected: true });
  }
  const tiny = apply([Array(7).fill(1)], { clusterFilter: 'connected-v1' }); assert.equal(tiny.active(tiny.images.final).length, 0);
});
test('stage accounting uses actual areas, distinct no-data support and count, with both reference methods', () => {
  const areas = { candidateAreaKm2: 0.001, commonSarAreaKm2: 0.01, validAnalysisAreaKm2: 0.009 };
  const raw = { areas: { raw: 1000, terrain: 700, final: 450, steep: 200, unknown: 100, unknownSupport: 800, clusterRemoved: 250 }, removedPixels: 3 };
  for (const method of ['yearly-conservative-v1', 'yearly-monthly-dry-v1']) {
    const f = summarizeFiltering(raw, parseFilters(both), areas, method);
    assert.equal(f.referenceMethod, method); assert.equal(f.clusterRemovedAreaKm2, 0.00025); assert.equal(f.clusterRemovedPixels, 3);
    assert.equal(f.terrainNoDataSupportAreaKm2, 0.0008); assert.equal(f.finalCandidateAreaKm2, 0.00045);
  }
  for (const bad of [{ ...raw, areas: { ...raw.areas, final: 800 } }, { ...raw, removedPixels: -1 }, { ...raw, areas: { ...raw.areas, unknownSupport: 0 } }, { ...raw, areas: { ...raw.areas, raw: undefined } }]) assert.throws(() => summarizeFiltering(bad, parseFilters(both), areas, 'yearly-conservative-v1'));
  const zero = Object.fromEntries(Object.keys(raw.areas).map(k => [k, null]));
  assert.equal(summarizeFiltering({ areas: zero, removedPixels: null }, parseFilters(both), { ...areas, candidateAreaKm2: 0 }, 'yearly-conservative-v1').finalCandidateAreaKm2, 0);
  const disabled = summarizeFiltering(null, parseFilters(), areas, 'yearly-conservative-v1');
  assert.equal(disabled.rawCandidateAreaKm2, disabled.finalCandidateAreaKm2); assert.equal(disabled.terrainNoDataCandidateAreaKm2, null);
});
test('HTTP filter validation returns 422 before computation; previews reject analysis-only options', async () => {
  const calls = [], app = express();
  app.use('/api/sar', createSarSelectionRouter({ analyze: async (...args) => { calls.push(args); return { success: true }; } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/sar`, query = new URLSearchParams({ beforeSceneId: SCENES.before, laterSceneId: SCENES.later });
  try {
    for (const suffix of ['terrainFilter=bad', 'clusterFilter=bad', 'maxSlopeDegrees=0', 'minConnectedPixels=129', 'minConnectedPixels=8&minConnectedPixels=9', 'terrainFilter=none&terrainFilter=slope-v1']) assert.equal((await fetch(`${base}/analysis?${query}&${suffix}`)).status, 422);
    assert.equal(calls.length, 0);
    assert.equal((await fetch(`${base}/analysis?${query}&terrainFilter=slope-v1&clusterFilter=connected-v1`)).status, 200);
    assert.deepEqual(calls[0][2], { terrainFilter: 'slope-v1', clusterFilter: 'connected-v1' });
    assert.equal((await fetch(`${base}/selected-preview?${query}&terrainFilter=none`)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('analysis cache separates both reference methods and filters, canonicalizes defaults and stays bounded', async () => {
  const calls = [];
  const service = createSarSelectionService({ previewFactory: () => ({}), analysisFactory: options => { calls.push(options); return { analyze: async () => options.filters }; } });
  for (const method of ['yearly-conservative-v1', 'yearly-monthly-dry-v1']) {
    assert.equal((await service.analyze(SCENES, method)).terrainFilter, 'none');
    assert.equal((await service.analyze(SCENES, method, both)).terrainFilter, 'slope-v1');
    assert.equal((await service.analyze(SCENES, method, { terrainFilter: 'none' })).terrainFilter, 'none');
  }
  assert.equal(calls.length, 4);
  for (let i = 1; i <= 10; i++) await service.analyze(SCENES, undefined, { terrainFilter: 'slope-v1', maxSlopeDegrees: i });
  const count = calls.length; await service.analyze(SCENES); assert.equal(calls.length, count + 1, 'Old variants evicted at eight entries');
});
test('candidate service preserves legacy raw fields/layer while supplying separate filtered styles', async () => {
  const area = { aoi: 10000, common: 9000, smoothedSupport: 8500, valid: 8000, permanent: 1000, eligible: 7000, candidate: 1000 };
  const images = { raw: {}, terrain: {}, final: {} }, mapCalls = [];
  const service = createSarCandidateService({ selection: SCENES, filters: parseFilters(both),
    preview: { qualityState: async () => ({ data: { common: { validPixelAreaKm2: 0.009 } }, graph: {} }) }, engine: () => ({ ee: {} }),
    graphBuilder: (_ee, _graph, _year, _policy, filters) => { assert.equal(filters.maxSlopeDegrees, 5); return { image: images.raw, stageImages: images,
      computation: { areas: area, filtering: { areas: { raw: 1000, terrain: 700, final: 400, steep: 200, unknown: 100, unknownSupport: 800, clusterRemoved: 300 }, removedPixels: 3 } } }; },
    evaluateValue: async v => v, mapImage: async (image, style) => { mapCalls.push({ image, style }); return `https://earthengine.googleapis.com/${style.palette[0]}/{z}/{x}/{y}`; } });
  const result = await service.analyze();
  assert.equal(result.areas.candidateAreaKm2, 0.001); assert.equal(result.filtering.finalCandidateAreaKm2, 0.0004);
  assert.deepEqual(result.layer, result.layers.raw); assert.deepEqual(mapCalls.map(c => c.image), [images.raw, images.terrain, images.final]);
  assert.equal(new Set(mapCalls.map(c => c.style.palette[0])).size, 3);
});
