const DEM = 'USGS/SRTMGL1_003';
const FILTER_KEYS = ['terrainFilter', 'maxSlopeDegrees', 'clusterFilter', 'minConnectedPixels'];
function invalid(message) { return Object.assign(new Error(message), { status: 422, code: 'SAR_FILTER_INVALID' }); }
function parseFilters(query = {}) {
  const option = (key, allowed) => {
    const value = query[key] === undefined ? 'none' : query[key];
    if (!allowed.includes(value)) throw invalid(`${key} must be ${allowed.join(' or ')}.`);
    return value;
  };
  const number = (key, fallback, max, integer) => {
    if (query[key] === undefined) return fallback;
    const value = query[key];
    if (!['string', 'number'].includes(typeof value) || !/^\d+(?:\.\d+)?$/.test(String(value)) ||
        !Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > max || (integer && !Number.isInteger(Number(value)))) {
      throw invalid(`${key} must be ${integer ? 'an integer' : 'a number'} from 1 to ${max}.`);
    }
    return Number(value);
  };
  const terrainFilter = option('terrainFilter', ['none', 'slope-v1']);
  const clusterFilter = option('clusterFilter', ['none', 'connected-v1']);
  const slope = number('maxSlopeDegrees', 5, 45, false), cluster = number('minConnectedPixels', 8, 128, true);
  return { terrainFilter, maxSlopeDegrees: terrainFilter === 'none' ? null : slope,
    clusterFilter, minConnectedPixels: clusterFilter === 'none' ? null : cluster };
}

// Production raster operations, also exercised with deterministic rasters in tests.
function filterMasks(ee, candidates, graph, config) {
  const { grid, aoi, valid } = graph;
  const raw = candidates.selfMask().toByte().reproject(grid).clip(aoi);
  let terrain = raw, steep = raw.multiply(0).selfMask(), unknown = steep, unknownSupport = steep;
  if (config.terrainFilter === 'slope-v1') {
    // Calculate derivatives on the native DEM BEFORE resampling eligibility to SAR.
    // Do not clip DEM first: slope uses four neighbors and has missing edge pixels.
    const slope = ee.Terrain.slope(ee.Image(DEM).select('elevation')).reproject(grid).clip(aoi);
    const known = slope.mask().gt(0).unmask(0, false).reproject(grid).clip(aoi);
    terrain = raw.updateMask(slope.lte(config.maxSlopeDegrees)).selfMask();
    steep = raw.updateMask(slope.gt(config.maxSlopeDegrees)).selfMask();
    unknown = raw.updateMask(known.not()).selfMask();
    unknownSupport = valid.updateMask(known.not()).selfMask();
  }
  let final = terrain;
  if (config.clusterFilter === 'connected-v1') {
    // Only candidate 1s participate. Count includes the center pixel, with diagonal
    // adjacency. EE requires maxSize >= 2, including for a minimum of one.
    // maxSize >= threshold; capped counts suffice for this predicate.
    const counts = terrain.connectedPixelCount({ maxSize: Math.max(2, config.minConnectedPixels), eightConnected: true });
    final = terrain.updateMask(counts.gte(config.minConnectedPixels)).selfMask().reproject(grid).clip(aoi);
  }
  const clusterRemoved = terrain.updateMask(final.mask().unmask(0, false).not()).selfMask();
  return { raw, terrain, final, steep, unknown, unknownSupport, clusterRemoved };
}
function buildFiltering(ee, candidates, graph, config) {
  const images = filterMasks(ee, candidates, graph, config), pixelArea = ee.Image.pixelArea();
  const bands = Object.entries(images).map(([key, image]) => pixelArea.updateMask(image).rename(key));
  // As in the original reducer, preserve full before-VV Projection (including
  // affine origin) rather than specifying scale and shifting the grid. No bestEffort.
  const reduce = items => ee.Image.cat(items).reduceRegion({ ...graph.gridOptions, reducer: ee.Reducer.sum() });
  const areas = ee.Dictionary(reduce(bands.slice(0, 4))).combine(reduce(bands.slice(4)), true);
  // Count pixel centers, unweighted by fractional AOI boundaries. This count is
  // deliberately distinct from the geographically weighted pixelArea sums above.
  const counts = images.clusterRemoved.reduceRegion({ ...graph.gridOptions, reducer: ee.Reducer.count() });
  return { images, computation: ee.Dictionary({ areas, removedPixels: counts.values().get(0),
    grid: ee.Dictionary({ crs: graph.grid.crs(), transformWkt: graph.grid.transform(), nominalScaleMeters: graph.grid.nominalScale() }) }) };
}
function summarizeFiltering(raw, config, areas, referenceMethod) {
  const enabled = config.terrainFilter !== 'none' || config.clusterFilter !== 'none';
  const values = enabled ? { ...raw?.areas } : { raw: areas.candidateAreaKm2 * 1e6, terrain: areas.candidateAreaKm2 * 1e6,
    final: areas.candidateAreaKm2 * 1e6, steep: 0, unknown: 0, unknownSupport: 0, clusterRemoved: 0 };
  for (const key of ['raw', 'terrain', 'final', 'steep', 'unknown', 'unknownSupport', 'clusterRemoved']) {
    if (values[key] === null) values[key] = 0;
    if (!Number.isFinite(values[key]) || values[key] < 0) throw new Error(`Invalid filter area: ${key}.`);
  }
  const v = values, removedPixels = enabled ? raw?.removedPixels ?? 0 : 0;
  if ((enabled && raw?.removedPixels === undefined) || !Number.isInteger(removedPixels) || removedPixels < 0 || Math.abs(v.raw - areas.candidateAreaKm2 * 1e6) > 1 ||
      Math.abs(v.raw - v.terrain - v.steep - v.unknown) > 1 || Math.abs(v.terrain - v.final - v.clusterRemoved) > 1 ||
      v.unknown > v.unknownSupport + 1 || v.unknownSupport > areas.validAnalysisAreaKm2 * 1e6 + 1 ||
      (config.terrainFilter === 'none' && (v.steep || v.unknown || v.unknownSupport)) ||
      (config.clusterFilter === 'none' && (v.clusterRemoved || removedPixels))) throw new Error('Filtering area/count invariants failed.');
  return { version: 'sar-filtering-v1', configuration: config, referenceMethod,
    rawCandidateAreaKm2: v.raw / 1e6, afterSlopeAreaKm2: v.terrain / 1e6, finalCandidateAreaKm2: v.final / 1e6,
    slopeExcludedAreaKm2: v.steep / 1e6, clusterRemovedAreaKm2: v.clusterRemoved / 1e6, clusterRemovedPixels: removedPixels,
    terrainNoDataCandidateAreaKm2: config.terrainFilter === 'none' ? null : v.unknown / 1e6,
    terrainNoDataSupportAreaKm2: config.terrainFilter === 'none' ? null : v.unknownSupport / 1e6,
    commonSarSupportAreaKm2: areas.commonSarAreaKm2, referenceValidSupportAreaKm2: areas.validAnalysisAreaKm2,
    terrain: config.terrainFilter === 'none' ? null : { dataset: DEM, nativeResolutionMeters: 30, operation: 'ee.Terrain.slope',
      units: 'degrees', resampling: 'nearest neighbor from native DEM slope to before-VV grid', maxSlopeDegrees: config.maxSlopeDegrees },
    connectivity: config.clusterFilter === 'none' ? null : { neighborhood: 8, includesCurrentPixel: true, maxSize: Math.max(2, config.minConnectedPixels),
      minConnectedPixels: config.minConnectedPixels, nominalMinimumAreaM2: config.minConnectedPixels * 100,
      countMeaning: 'Nominal 10 m SAR grid pixels, not independent observations or measured physical area; removed count uses pixel centers inside AOI.' },
    measurement: { grid: raw?.grid || null, area: 'ee.Image.pixelArea() summed on full before-VV projection/affine grid within AOI; weighted boundary areas; no bestEffort or scale change.',
      accounting: 'raw = afterSlope + slopeExcluded + terrainNoDataCandidate; afterSlope = final + clusterRemoved. Null terrain statistics mean not queried.' } };
}
module.exports = { DEM, FILTER_KEYS, parseFilters, filterMasks, buildFiltering, summarizeFiltering };
