const assert = require('node:assert/strict');
const { filterMasks, parseFilters } = require('../services/sarFiltering');
const { evaluate } = require('../services/sarPreviewService');

// Small, real EE rasters verify capped connectedPixelCount semantics independently
// of the May 2017 measurements, including patches larger than maxSize.
async function verifyTopology(ee) {
  const grid = ee.Projection('EPSG:3857', [10, 0, 0, 0, -10, 100]);
  const aoi = ee.Geometry.Rectangle([0, 0, 3100, 100], 'EPSG:3857', false);
  const xy = ee.Image.pixelCoordinates(grid), x = xy.select('x').floor(), y = xy.select('y').floor();
  const valid = ee.Image.constant(1).reproject(grid).clip(aoi);
  const graph = { grid, aoi, valid };
  const query = { clusterFilter: 'connected-v1' }, cases = {};
  const line = n => x.gte(0).and(x.lt(n)).and(y.eq(1)).rename('candidates');
  const add = (name, candidates, minimum = 8, engine = ee, terrain = false) => {
    const images = filterMasks(engine, candidates, graph, parseFilters({ ...query, minConnectedPixels: minimum, ...(terrain ? { terrainFilter: 'slope-v1' } : {}) }));
    cases[name] = ee.Dictionary(Object.fromEntries(['raw', 'terrain', 'final', 'unknown', 'steep', 'clusterRemoved'].map(stage => [stage,
      images[stage].reduceRegion({ geometry: aoi, crs: grid, maxPixels: 10000, reducer: ee.Reducer.count() }).values().get(0)])));
  };
  add('tiny7', line(7)); add('exact8', line(8)); add('large300', line(300)); add('maximumThreshold', line(300), 128);
  add('empty', line(0)); add('fullyMasked', line(8).updateMask(ee.Image.constant(0)));
  add('diagonal', x.eq(0).and(y.eq(1)).or(x.eq(1).and(y.eq(2))), 2);
  add('gap', x.eq(0).or(x.eq(2)).and(y.eq(1)), 2);
  add('singleton', line(1), 1);
  const missingSlope = ee.Image.constant(0).rename('elevation').updateMask(ee.Image.constant(0)).reproject(grid);
  // Inject synthetic missing slope, while keeping real EE mask/count operations.
  add('terrainNoData', line(8), 8, { Image: () => missingSlope, Terrain: { slope: image => image } }, true);
  const result = await evaluate(ee.Dictionary(cases));
  const count = (name, stage = 'final') => result[name][stage] ?? 0;
  for (const [name, expected] of [['tiny7', 0], ['exact8', 8], ['large300', 300], ['maximumThreshold', 300], ['empty', 0], ['fullyMasked', 0], ['diagonal', 2], ['gap', 0], ['singleton', 1], ['terrainNoData', 0]]) assert.equal(count(name), expected, `${name}: ${JSON.stringify(result)}`);
  assert.equal(count('tiny7', 'clusterRemoved'), 7); assert.equal(count('terrainNoData', 'unknown'), 8);
  assert.equal(count('terrainNoData', 'steep'), 0);
  return result;
}
if (require.main === module) {
  const engine = require('../services/earthEngineService');
  engine.initializeEarthEngine().then(() => verifyTopology(engine.ee)).then(result => console.log('REAL EE TOPOLOGY PASSED', JSON.stringify(result))).catch(error => { console.error('REAL EE TOPOLOGY FAILED', error.message || String(error)); process.exitCode = 1; });
}
module.exports = { verifyTopology };
