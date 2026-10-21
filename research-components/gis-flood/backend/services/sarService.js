const { DATASET } = require("./sarValidation");
const { evaluatePair, finalizePair, rankPairs } = require("./sarPairs");
const { normalizeScene } = require("./sarMetadata");

const MAX_JOINT_CHECKS = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;
const QUERY_TIMEOUT_MS = 60000;
const CAVEAT = "Discovery windows do not confirm inundation. Coverage is scene-footprint intersection, not valid SAR pixels, and suitable pairs still need event-date and image-quality verification.";

function failure(message, status, code, cause) { return Object.assign(new Error(message), { status, code, cause }); }
function bounded(promise, milliseconds, stage) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(failure(`Earth Engine ${stage} timed out. Retry later.`, 504, "SAR_EE_TIMEOUT")), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}
function evaluate(object) {
  return new Promise((resolve, reject) => object.evaluate((result, error) => error ? reject(error) : resolve(result)));
}

// Obtain the actual, unchanged Function 1 AOI; unused lazy raster expressions
// are not sent/evaluated by our geometry-only Earth Engine computations.
async function getExistingStudyArea() {
  return require("./hazardService").getCachedHazardAnalysis();
}
function defaultEngine() { return require("./earthEngineService"); }

function createSarService({ engine = defaultEngine, getStudyArea = getExistingStudyArea, now = Date.now,
  timeoutMs = QUERY_TIMEOUT_MS, evaluateValue = evaluate } = {}) {
  const cache = new Map();
  const pairCache = new Map();
  const pending = new Map();
  let activeKey = null;

  async function withCache(key, target, operation) {
    const cached = target.get(key);
    if (cached && cached.expires > now()) return cached.value;
    if (pending.has(key)) return pending.get(key);
    if (activeKey !== null) throw failure("Another SAR discovery query is running. Retry shortly.", 429, "SAR_BUSY");
    activeKey = key;
    const promise = operation().then(value => {
      if (target.size >= 8) target.delete(target.keys().next().value);
      target.set(key, { value, expires: now() + CACHE_TTL_MS });
      return value;
    });
    pending.set(key, promise);
    try { return await promise; }
    finally { pending.delete(key); activeKey = null; }
  }
  async function initialized() {
    try {
      const instance = engine();
      await bounded(instance.initializeEarthEngine(), timeoutMs, "initialization");
      return instance.ee;
    }
    catch (cause) {
      if (cause.code === "SAR_EE_TIMEOUT") throw cause;
      throw failure("Earth Engine authentication/initialization failed. Check the existing server credentials and project access.", 503, "SAR_EE_AUTH_FAILED", cause);
    }
  }

  async function discover(options) {
    const key = `scenes:${JSON.stringify({ windows: options.windows, sceneLimit: options.sceneLimit })}`;
    return withCache(key, cache, async () => {
      const ee = await initialized();
      try {
        const { aoi, studyBasins } = await bounded(getStudyArea(), timeoutMs, "study-area lookup");
        const area = aoi.area(1);
        const periods = {};
        for (const [name, window] of Object.entries(options.windows)) {
          const collection = ee.ImageCollection(DATASET).filterBounds(aoi)
            .filterDate(window.start, window.endExclusive).sort("system:time_start");
          const scenes = collection.toList(options.sceneLimit).map(function (item) {
            const image = ee.Image(item);
            return ee.Dictionary({
              sceneIndex: image.get("system:index"), acquisitionTimeMillis: image.get("system:time_start"),
              platformNumber: image.get("platform_number"), orbitDirection: image.get("orbitProperties_pass"),
              relativeOrbitNumber: image.get("relativeOrbitNumber_start"),
              relativeOrbitNumberStop: image.get("relativeOrbitNumber_stop"),
              polarizations: image.get("transmitterReceiverPolarisation"), instrumentMode: image.get("instrumentMode"),
              resolutionMeters: image.get("resolution_meters"), resolutionClass: image.get("resolution"),
              coveragePercent: image.geometry().intersection(aoi, 1).area(1).divide(area).multiply(100).max(0).min(100)
            });
          });
          periods[name] = ee.Dictionary({ totalCount: collection.size(), scenes });
        }
        const computation = ee.Dictionary({
          areaKm2: area.divide(1000000), basinIds: studyBasins.aggregate_array("HYBAS_ID"), periods: ee.Dictionary(periods)
        });
        const result = await bounded(evaluateValue(computation), timeoutMs, "scene query");
        if (!result || !Number.isFinite(result.areaKm2) || result.areaKm2 <= 0 || !result.periods) throw new Error("Invalid study-area or scene response.");
        const output = {};
        for (const [name, window] of Object.entries(options.windows)) {
          const period = result.periods[name];
          if (!period || !Number.isInteger(period.totalCount) || !Array.isArray(period.scenes)) throw new Error("Invalid scene response.");
          const scenes = period.scenes.map(normalizeScene)
            .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt) || a.sceneId.localeCompare(b.sceneId));
          output[name] = { ...window, totalCount: period.totalCount, returnedCount: scenes.length, truncated: period.totalCount > scenes.length, scenes };
        }
        return {
          success: true, dataset: DATASET, queriedAt: new Date(now()).toISOString(), dateConvention: "UTC start-inclusive, end-exclusive",
          studyArea: { source: "Existing Function 1 HydroBASINS hybas_10 AOI", basinIds: result.basinIds, areaKm2: result.areaKm2 },
          sceneLimitPerPeriod: options.sceneLimit, periods: output,
          coverageDefinition: "100 × area(scene footprint ∩ study area) / area(study area); spherical geometry with 1 m error tolerance",
          caveat: CAVEAT
        };
      } catch (cause) {
        if (cause.code === "SAR_EE_TIMEOUT") throw cause;
        throw failure("Earth Engine SAR scene query failed. No scene availability result was produced.", 502, "SAR_EE_QUERY_FAILED", cause);
      }
    });
  }

  async function candidatePairs(options) {
    // Finish scene lookup before taking a separate cache/concurrency slot.
    const discovery = await discover(options);
    const key = `pairs:${JSON.stringify(options)}:${discovery.queriedAt}`;
    return withCache(key, pairCache, async () => {
      const before = discovery.periods.before, flood = discovery.periods.flood;
      const comparisons = rankPairs(before.scenes.flatMap(first => flood.scenes.map(second => evaluatePair(first, second, options.minCoveragePercent))));
      const compatible = comparisons.filter(pair => pair.status === "coverage-check-required");
      const toCheck = compatible.slice(0, MAX_JOINT_CHECKS);
      let checked = [];
      if (toCheck.length) {
        const ee = await initialized();
        try {
          const { aoi } = await bounded(getStudyArea(), timeoutMs, "study-area lookup");
          const area = aoi.area(1);
          const overlap = ee.List(toCheck.map(pair => ee.Image(pair.beforeSceneId).geometry()
            .intersection(ee.Image(pair.duringSceneId).geometry(), 1).intersection(aoi, 1)
            .area(1).divide(area).multiply(100).max(0).min(100)));
          const coverage = await bounded(evaluateValue(overlap), timeoutMs, "pair footprint query");
          if (!Array.isArray(coverage) || coverage.length !== toCheck.length) throw new Error("Invalid pair coverage response.");
          checked = rankPairs(toCheck.map((pair, index) => finalizePair(pair, coverage[index], options.minCoveragePercent)));
        } catch (cause) {
          if (cause.code === "SAR_EE_TIMEOUT") throw cause;
          throw failure("Earth Engine pair footprint query failed. No pair suitability result was produced.", 502, "SAR_EE_QUERY_FAILED", cause);
        }
      }
      const suitable = checked.filter(pair => pair.status === "suitable");
      const rejected = rankPairs([...checked.filter(pair => pair.status !== "suitable"), ...comparisons.filter(pair => pair.status === "incompatible")]);
      const incomplete = before.truncated || flood.truncated || compatible.length > toCheck.length;
      return {
        success: true, dataset: DATASET, queriedAt: discovery.queriedAt, dateConvention: discovery.dateConvention,
        studyArea: discovery.studyArea, windows: options.windows,
        periods: Object.fromEntries(Object.entries(discovery.periods).map(([name, period]) => [name, {
          start: period.start, endExclusive: period.endExclusive, totalCount: period.totalCount, returnedCount: period.returnedCount, truncated: period.truncated
        }])),
        minCoveragePercent: options.minCoveragePercent, pairLimit: options.pairLimit,
        summary: { assessedCombinations: comparisons.length, metadataCompatible: compatible.length, jointFootprintsChecked: toCheck.length,
          suitableFound: suitable.length, rejectedFound: rejected.length, incomplete,
          suitableOutputTruncated: suitable.length > options.pairLimit, rejectedOutputTruncated: rejected.length > options.pairLimit },
        candidatePairs: suitable.slice(0, options.pairLimit), rejectedPairs: rejected.slice(0, options.pairLimit),
        message: suitable.length ? "Comparable observation candidates found; inundation is not established." : incomplete ?
          "No suitable pair in the bounded evaluated subset. Discovery is incomplete; do not infer a dataset gap." :
          "No suitable before/flood pair in these windows under the stated metadata and coverage criteria.",
        selectionPolicy: "Matching known orbit direction, relative orbit, instrument mode and resolution; shared polarization; both individual and joint AOI footprint coverage meet the threshold. Prefer IW/VV, then shorter acquisition gap. Extended scenes are discovery only, not substituted for flood-period observations.",
        bounds: { sceneLimitPerPeriod: options.sceneLimit, maxJointFootprintChecks: MAX_JOINT_CHECKS }, caveat: CAVEAT
      };
    });
  }
  return { discover, candidatePairs };
}
module.exports = { createSarService };
