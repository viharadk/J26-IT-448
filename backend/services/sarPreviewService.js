const { SCENES, DISPLAY, LIMITATION, summarizeQuality } = require("./sarPixelQuality");
const TIMEOUT_MS = 120000;
const QUALITY_TTL = 30 * 60 * 1000;
const PREVIEW_TTL = 10 * 60 * 1000;
function failure(message, status, code, cause) { return Object.assign(new Error(message), { status, code, cause }); }
function bounded(promise, ms, stage) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(failure(`SAR ${stage} timed out. Retry later.`, 504, "SAR_PREVIEW_TIMEOUT")), ms); })]).finally(() => clearTimeout(timer));
}
function evaluate(object) { return new Promise((resolve, reject) => object.evaluate((result, error) => error ? reject(error) : resolve(result))); }
function tileTemplate(info) {
  const value = info?.urlFormat || info?.url_format || info?.tileFetcher?.urlFormat || (info?.mapid ? `https://earthengine.googleapis.com/v1/${info.mapid}/tiles/{z}/{x}/{y}` : null);
  if (!value || !["{z}", "{x}", "{y}"].every(key => value.includes(key))) throw new Error("EE returned no valid XYZ map template.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "earthengine.googleapis.com" || url.username || url.password || url.searchParams.has("access_token")) throw new Error("Unsafe EE map template.");
  return value;
}
function mapId(image, style) { return new Promise((resolve, reject) => image.getMapId({ ...style, format: "png" }, (result, error) => {
  if (error) return reject(error);
  try { resolve(tileTemplate(result)); } catch (cause) { reject(cause); }
})); }
function thumbnail(image, style, region) {
  return new Promise((resolve, reject) => image.visualize(style).getThumbURL({ region, dimensions: 1200, format: "png", crs: "EPSG:3857" }, (result, error) => {
    if (error) return reject(error);
    try {
      const url = new URL(result);
      if (url.protocol !== "https:" || url.hostname !== "earthengine.googleapis.com" || url.username || url.password || url.searchParams.has("access_token")) throw new Error("Unsafe thumbnail URL.");
      resolve(result);
    } catch (cause) { reject(cause); }
  }));
}
function buildGraph(ee, aoi, sceneIds = SCENES) {
  const beforeImage = ee.Image(sceneIds.before), laterImage = ee.Image(sceneIds.later);
  const grid = beforeImage.select("VV").projection();
  // ee.Projection.transform() is affine WKT, not the numeric list accepted by
  // reduceRegion.crsTransform. Passing the Projection preserves its full grid.
  const gridOptions = { geometry: aoi, crs: grid, maxPixels: 50000000, tileScale: 4 };
  const before = beforeImage.select("VV").reproject(grid), later = laterImage.select("VV").reproject(grid);
  const mask = image => image.mask().gt(0).unmask(0, false).reproject(grid).clip(aoi);
  const beforeMask = mask(before), laterMask = mask(later), commonMask = beforeMask.and(laterMask);
  const b = before.updateMask(commonMask).clip(aoi).rename("before");
  const l = later.updateMask(commonMask).clip(aoi).rename("later");
  const change = l.subtract(b).rename("change");
  const ba = beforeImage.select("angle").reproject(grid), la = laterImage.select("angle").reproject(grid);
  const angleMask = commonMask.and(mask(ba)).and(mask(la));
  const beforeAngle = ba.updateMask(angleMask).clip(aoi).rename("beforeAngle");
  const laterAngle = la.updateMask(angleMask).clip(aoi).rename("laterAngle");
  const angleChange = laterAngle.subtract(beforeAngle).rename("angleChange");
  const analysis = ee.Image.cat([b, l, change, beforeAngle, laterAngle, angleChange]);
  const pixelArea = ee.Image.pixelArea();
  const areaImage = ee.Image.cat([pixelArea.rename("aoi"), pixelArea.updateMask(beforeMask).rename("before"),
    pixelArea.updateMask(laterMask).rename("later"), pixelArea.updateMask(commonMask).rename("common"), pixelArea.updateMask(angleMask).rename("angleCommon")]);
  const reducer = ee.Reducer.minMax().combine(ee.Reducer.mean(), "", true).combine(ee.Reducer.stdDev(), "", true)
    .combine(ee.Reducer.percentile([2, 25, 50, 75, 98]), "", true).combine(ee.Reducer.count(), "", true);
  const area = aoi.area(1);
  const projection = image => ee.Dictionary({ crs: image.projection().crs(), transformWkt: image.projection().transform(), nominalScaleMeters: image.projection().nominalScale() });
  const metadata = image => ee.Dictionary({ bands: image.bandNames(), time: image.get("system:time_start"), platform: image.get("platform_number"),
    orbitDirection: image.get("orbitProperties_pass"), relativeOrbitNumber: image.get("relativeOrbitNumber_start"),
    instrumentMode: image.get("instrumentMode"), polarizations: image.get("transmitterReceiverPolarisation"), resolutionMeters: image.get("resolution_meters"),
    projection: projection(image.select("VV")), angleProjection: projection(image.select("angle")),
    footprintCoveragePercent: image.geometry().intersection(aoi, 1).area(1).divide(area).multiply(100).min(100) });
  const sampled = analysis.addBands(ee.Image.constant(1).rename("validSampleClass").updateMask(commonMask)).stratifiedSample({
    numPoints: 12, classBand: "validSampleClass", region: aoi, projection: grid, seed: 22, geometries: true, tileScale: 4 }).limit(12);
  const computation = ee.Dictionary({ before: metadata(beforeImage), later: metadata(laterImage), vectorAreaKm2: area.divide(1e6),
    bounds: aoi.bounds(1), outline: aoi.simplify(100), center: aoi.centroid(1).coordinates(),
    jointFootprintCoveragePercent: beforeImage.geometry().intersection(laterImage.geometry(), 1).intersection(aoi, 1).area(1).divide(area).multiply(100).min(100),
    areas: areaImage.reduceRegion({ ...gridOptions, reducer: ee.Reducer.sum() }),
    statistics: analysis.reduceRegion({ ...gridOptions, reducer }),
    samples: sampled.toList(12).map(function (item) {
      const feature = ee.Feature(item);
      return ee.Dictionary({ coordinates: feature.geometry().coordinates(), values: feature.toDictionary(["before", "later", "change", "beforeAngle", "laterAngle", "angleChange"]) });
    }) });
  return { computation, layers: { before: b, later: l, change }, region: aoi.bounds(1),
    aoi, grid, gridOptions, before, later, commonMask };
}
function createSarPreviewService({ engine = () => require("./earthEngineService"),
  getStudyArea = () => require("./hazardService").getCachedHazardAnalysis(), evaluateValue = evaluate,
  graphBuilder = buildGraph, mapImage = mapId, thumbnailImage = thumbnail, now = Date.now, timeoutMs = TIMEOUT_MS,
  sceneIds = SCENES, validateQuality = () => {} } = {}) {
  let qualityCache = null, qualityPending = null, previewCache = null, previewPending = null;
  async function qualityState() {
    if (qualityCache && now() - qualityCache.createdAt < QUALITY_TTL) return qualityCache;
    if (qualityPending) return qualityPending;
    qualityPending = (async () => {
      let instance;
      try { instance = engine(); await bounded(instance.initializeEarthEngine(), timeoutMs, "initialization"); }
      catch (cause) { if (cause.code === "SAR_PREVIEW_TIMEOUT") throw cause; throw failure("Existing Earth Engine authentication/initialization failed.", 503, "SAR_PREVIEW_AUTH_FAILED", cause); }
      try {
        const { aoi } = await bounded(getStudyArea(), timeoutMs, "study-area lookup");
        const graph = graphBuilder(instance.ee, aoi, sceneIds);
        const raw = await bounded(evaluateValue(graph.computation), timeoutMs, "pixel-quality computation");
        const data = summarizeQuality(raw, new Date(now()).toISOString(), sceneIds);
        validateQuality(data);
        qualityCache = { data, graph, createdAt: now() };
        return qualityCache;
      } catch (cause) { if (cause.code === "SAR_PREVIEW_TIMEOUT" || cause.status === 422) throw cause; throw failure("SAR pixel-quality computation failed; no pixel result was produced.", 502, "SAR_PIXEL_QUERY_FAILED", cause); }
    })();
    try { return await qualityPending; } finally { qualityPending = null; }
  }
  async function pixelQuality() { return (await qualityState()).data; }
  async function preview() {
    if (previewCache && now() - previewCache.createdAt < PREVIEW_TTL) return previewCache.data;
    if (previewPending) return previewPending;
    previewPending = (async () => {
      const { data: quality, graph } = await qualityState();
      try {
        const layers = Object.fromEntries(await Promise.all(Object.entries(graph.layers).map(async ([key, image]) => [key, {
          label: key === "change" ? "Exploratory VV radar change (later − before), not flood extent" : `${key === "before" ? "Before" : "Later"} VV backscatter`,
          tileUrl: await bounded(mapImage(image, DISPLAY[key]), timeoutMs, "map generation"),
          thumbnailUrl: await bounded(thumbnailImage(image, DISPLAY[key], graph.region), timeoutMs, "thumbnail generation"),
          visualization: DISPLAY[key], units: "dB", mask: "Common valid AOI pixels"
        }])));
        const data = { success: true, generatedAt: new Date(now()).toISOString(), renewAfterSeconds: PREVIEW_TTL / 1000, quality,
          layers, limitation: quality.limitation };
        previewCache = { data, createdAt: now() }; return data;
      } catch (cause) { if (cause.code === "SAR_PREVIEW_TIMEOUT") throw cause; throw failure("Earth Engine SAR preview generation failed.", 502, "SAR_PREVIEW_FAILED", cause); }
    })();
    try { return await previewPending; } finally { previewPending = null; }
  }
  // qualityState is a server-only graph handoff for isolated candidate processing.
  return { pixelQuality, preview, qualityState };
}
module.exports = { createSarPreviewService, buildGraph, tileTemplate, mapId, bounded, evaluate };
