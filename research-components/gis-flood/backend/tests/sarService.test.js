const test = require("node:test");
const assert = require("node:assert/strict");
const { createSarService } = require("../services/sarService");
const { normalizeScene } = require("../services/sarMetadata");
const { evaluatePair } = require("../services/sarPairs");
const { DATASET, parseSarQuery } = require("../services/sarValidation");

// Synthetic metadata fixtures are deliberately independent of the live results.
function rawScene(acquiredAt, overrides = {}) {
  const stamp = acquiredAt.slice(0, 19).replace(/[-:]/g, "");
  return {
    sceneIndex: `S1A_IW_GRDH_1SDV_${stamp}_${stamp}_TEST`,
    acquisitionTimeMillis: Date.parse(acquiredAt), platformNumber: "A",
    orbitDirection: "DESCENDING", relativeOrbitNumber: 5, relativeOrbitNumberStop: 5,
    polarizations: ["VV", "VH"], instrumentMode: "IW", resolutionMeters: 10,
    resolutionClass: "H", coveragePercent: 100, ...overrides
  };
}

class EeNumber {
  constructor(value) { this.value = value; }
  divide(value) { return new EeNumber(this.value / (value instanceof EeNumber ? value.value : value)); }
  multiply(value) { return new EeNumber(this.value * value); }
  max(value) { return new EeNumber(Math.max(this.value, value)); }
  min(value) { return new EeNumber(Math.min(this.value, value)); }
}
function unwrap(value) {
  if (value instanceof EeNumber) return value.value;
  if (Array.isArray(value)) return value.map(unwrap);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, unwrap(entry)]));
  return value;
}

function fixture({ scenes = [], jointCoverage = 100, onEvaluate, initialize, timeoutMs = 1000 } = {}) {
  const calls = { auth: 0, studyArea: 0, dates: [], bounds: [], limits: [], evaluations: [], imagesById: [], intersections: [] };
  let time = Date.parse("2026-10-20T00:00:00Z");
  function geometry(identity, area = 1000) {
    return {
      identity,
      intersection(other, tolerance) { calls.intersections.push({ identity, other: other.identity, tolerance }); return geometry(identity, area); },
      area() { return new EeNumber(area); }
    };
  }
  const aoi = geometry("existing-aoi");
  const properties = {
    "system:index": "sceneIndex", "system:time_start": "acquisitionTimeMillis",
    platform_number: "platformNumber", orbitProperties_pass: "orbitDirection",
    relativeOrbitNumber_start: "relativeOrbitNumber", relativeOrbitNumber_stop: "relativeOrbitNumberStop",
    transmitterReceiverPolarisation: "polarizations", instrumentMode: "instrumentMode",
    resolution_meters: "resolutionMeters", resolution: "resolutionClass"
  };
  const ee = {
    Dictionary: value => value,
    List: value => value,
    Image(item) {
      if (typeof item === "string") {
        // A short system:index is not a loadable asset path: regression of the
        // real Earth Engine image.id()/mapped-image identity failure.
        assert.ok(item.startsWith(`${DATASET}/`), `Expected a full asset ID: ${item}`);
        calls.imagesById.push(item);
        return { geometry: () => geometry(item) };
      }
      return {
        get: property => item[properties[property]],
        geometry: () => geometry(item.sceneIndex, item.coveragePercent * 10)
      };
    },
    ImageCollection(dataset) {
      assert.equal(dataset, DATASET);
      let selected = [...scenes];
      return {
        filterBounds(value) { calls.bounds.push(value); return this; },
        filterDate(start, endExclusive) {
          calls.dates.push([start, endExclusive]);
          selected = selected.filter(scene => scene.acquisitionTimeMillis >= Date.parse(start)
            && scene.acquisitionTimeMillis < Date.parse(endExclusive));
          return this;
        },
        sort(property) {
          assert.equal(property, "system:time_start");
          selected.sort((a, b) => a.acquisitionTimeMillis - b.acquisitionTimeMillis);
          return this;
        },
        toList(limit) { calls.limits.push(limit); return selected.slice(0, limit); },
        size() { return selected.length; }
      };
    }
  };
  async function evaluateDefault(computation) {
    return Array.isArray(computation)
      ? computation.map((_, index) => Array.isArray(jointCoverage) ? jointCoverage[index] : jointCoverage)
      : unwrap(computation);
  }
  const service = createSarService({
    engine: () => ({ ee, initializeEarthEngine: async () => { calls.auth++; if (initialize) await initialize(calls.auth); } }),
    getStudyArea: async () => {
      calls.studyArea++;
      return { aoi, studyBasins: { aggregate_array: key => { assert.equal(key, "HYBAS_ID"); return [4101158680, 4101601930, 4101601920, 4100049050]; } } };
    },
    now: () => time,
    timeoutMs,
    evaluateValue: async computation => {
      const kind = Array.isArray(computation) ? "pairs" : "scenes";
      calls.evaluations.push(kind);
      return onEvaluate ? onEvaluate(computation, evaluateDefault, kind, calls) : evaluateDefault(computation);
    }
  });
  return { service, calls, aoi, advance: milliseconds => { time += milliseconds; } };
}

test("scene normalization preserves UTC acquisition metadata and constructs loadable full asset IDs", () => {
  const raw = rawScene("2016-05-20T00:00:00.640Z");
  const scene = normalizeScene(raw);
  assert.equal(scene.sceneId, `${DATASET}/${raw.sceneIndex}`);
  assert.equal(scene.acquiredAt, "2016-05-20T00:00:00.640Z");
  assert.equal(scene.acquisitionTimeSource, "system:time_start");
  assert.equal(scene.platform, "Sentinel-1A");
  assert.equal(scene.productStartUtcFromId, "2016-05-20T00:00:00.000Z");
  assert.equal(scene.timestampDifferenceSeconds, 0.64);
  assert.equal(scene.timestampWarning, null);
  assert.equal(scene.preferredConfiguration, true);
  assert.equal(raw.sceneId, undefined);
  for (const invalid of [{ ...raw, sceneIndex: "" }, { ...raw, acquisitionTimeMillis: null }, { ...raw, acquisitionTimeMillis: "0" }, { ...raw, acquisitionTimeMillis: Infinity }]) {
    assert.throws(() => normalizeScene(invalid));
  }
});

test("12-hour timestamp discrepancies remain visible and prevent pair suitability", () => {
  const first = normalizeScene(rawScene("2016-05-01T00:00:00Z"));
  const original = rawScene("2016-05-20T00:00:00Z");
  for (const difference of [-12, 12]) {
    const scene = normalizeScene({ ...original, acquisitionTimeMillis: original.acquisitionTimeMillis + difference * 3600000 });
    assert.equal(scene.timestampDifferenceSeconds, difference * 3600);
    assert.equal(scene.productStartUtcFromId, "2016-05-20T00:00:00.000Z");
    assert.equal(scene.acquiredAt, new Date(original.acquisitionTimeMillis + difference * 3600000).toISOString());
    assert.match(scene.timestampWarning, /neither time has been silently corrected/);
    const pair = evaluatePair(first, scene);
    assert.equal(pair.status, "incompatible");
    assert.match(pair.reasons.join(" "), /timestamp conflicts with the product ID/);
  }
});

test("discovery queries exact end-exclusive UTC windows, the existing AOI, and retains alternate configurations", async () => {
  const h = fixture({ scenes: [
    rawScene("2016-04-01T00:00:00Z"),
    rawScene("2016-05-14T23:59:59Z", { instrumentMode: "EW", resolutionMeters: 40, polarizations: ["HH", "HV"] }),
    rawScene("2016-05-15T00:00:00Z"),
    rawScene("2016-06-01T00:00:00Z", { instrumentMode: "SM", polarizations: ["HH"] }),
    rawScene("2016-06-15T23:59:59Z"),
    rawScene("2016-06-16T00:00:00Z")
  ] });
  const result = await h.service.discover(parseSarQuery());
  assert.deepEqual(h.calls.dates, [["2016-04-01", "2016-05-15"], ["2016-05-15", "2016-06-01"], ["2016-06-01", "2016-06-16"]]);
  assert.ok(h.calls.bounds.every(value => value === h.aoi));
  assert.equal(h.calls.bounds.length, 3);
  assert.deepEqual(h.calls.limits, [100, 100, 100]);
  assert.deepEqual(Object.values(result.periods).map(period => period.totalCount), [2, 1, 2]);
  assert.equal(result.periods.before.scenes[1].instrumentMode, "EW");
  assert.deepEqual(result.periods.before.scenes[1].polarizations, ["HH", "HV"]);
  assert.equal(result.periods.before.scenes[1].preferredConfiguration, false);
  assert.equal(result.periods.extended.scenes[0].instrumentMode, "SM");
  assert.ok(Object.values(result.periods).flatMap(period => period.scenes).every(scene => scene.sceneId.startsWith(`${DATASET}/`)));
  assert.equal(result.dateConvention, "UTC start-inclusive, end-exclusive");
  assert.match(result.caveat, /do not confirm inundation/);
});

test("scene bounds preserve total counts and flag truncated periods", async () => {
  const h = fixture({ scenes: [rawScene("2016-04-01T00:00:00Z"), rawScene("2016-04-02T00:00:00Z"), rawScene("2016-04-03T00:00:00Z")] });
  const result = await h.service.discover(parseSarQuery({ sceneLimit: "2" }));
  assert.equal(result.periods.before.totalCount, 3);
  assert.equal(result.periods.before.returnedCount, 2);
  assert.equal(result.periods.before.truncated, true);
  assert.equal(result.periods.before.scenes[1].acquiredAt, "2016-04-02T00:00:00.000Z");
  assert.equal(result.periods.flood.truncated, false);
  assert.deepEqual(h.calls.limits, [2, 2, 2]);
});

test("empty periods return honest empty discovery and no candidate pairs without joint queries", async () => {
  const h = fixture();
  const result = await h.service.candidatePairs(parseSarQuery({}, "candidate-pairs"));
  assert.deepEqual(result.candidatePairs, []);
  assert.deepEqual(result.rejectedPairs, []);
  assert.equal(result.summary.assessedCombinations, 0);
  assert.equal(result.summary.jointFootprintsChecked, 0);
  assert.equal(result.summary.incomplete, false);
  assert.deepEqual(h.calls.evaluations, ["scenes"]);
  assert.ok(Object.values(result.periods).every(period => period.totalCount === 0));
});

test("pair decisions use measured joint coverage instead of the smaller individual coverage", async () => {
  const h = fixture({ scenes: [
    rawScene("2016-05-01T00:00:00Z", { coveragePercent: 95 }),
    rawScene("2016-05-20T00:00:00Z", { coveragePercent: 98 }),
    rawScene("2016-05-21T00:00:00Z", { coveragePercent: 99 })
  ], jointCoverage: [89, 94] });
  const result = await h.service.candidatePairs(parseSarQuery({}, "candidate-pairs"));
  assert.equal(result.summary.jointFootprintsChecked, 2);
  assert.equal(result.candidatePairs.length, 1);
  assert.equal(result.candidatePairs[0].jointCoveragePercent, 94);
  assert.equal(result.candidatePairs[0].beforeCoveragePercent, 95);
  assert.equal(result.rejectedPairs.length, 1);
  assert.equal(result.rejectedPairs[0].jointCoveragePercent, 89);
  assert.equal(result.rejectedPairs[0].status, "unsuitable");
  assert.deepEqual(h.calls.evaluations, ["scenes", "pairs"]);
  assert.equal(h.calls.imagesById.length, 4);
  assert.ok(h.calls.intersections.some(value => value.identity.startsWith(`${DATASET}/`) && value.other.startsWith(`${DATASET}/`)));
  const again = await h.service.candidatePairs(parseSarQuery({}, "candidate-pairs"));
  assert.equal(again, result);
  assert.deepEqual(h.calls.evaluations, ["scenes", "pairs"]);
});

test("incompatible scenes never trigger joint queries and bounded discovery does not imply a dataset gap", async () => {
  const h = fixture({ scenes: [
    rawScene("2016-05-01T00:00:00Z"), rawScene("2016-05-02T00:00:00Z"),
    rawScene("2016-05-20T00:00:00Z", { relativeOrbitNumber: 6 })
  ] });
  const result = await h.service.candidatePairs(parseSarQuery({ sceneLimit: "1" }, "candidate-pairs"));
  assert.equal(result.candidatePairs.length, 0);
  assert.equal(result.rejectedPairs[0].status, "incompatible");
  assert.equal(result.summary.metadataCompatible, 0);
  assert.equal(result.summary.incomplete, true);
  assert.equal(result.periods.before.totalCount, 2);
  assert.equal(result.periods.before.returnedCount, 1);
  assert.match(result.message, /do not infer a dataset gap/);
  assert.deepEqual(h.calls.evaluations, ["scenes"]);
  assert.deepEqual(h.calls.imagesById, []);
});

test("pair response limits and the joint-check budget disclose incomplete results", async () => {
  const before = Array.from({ length: 11 }, (_, index) => rawScene(`2016-04-${String(index + 1).padStart(2, "0")}T00:00:00Z`));
  const flood = Array.from({ length: 10 }, (_, index) => rawScene(`2016-05-${String(index + 15).padStart(2, "0")}T00:00:00Z`));
  const h = fixture({ scenes: [...before, ...flood] });
  const result = await h.service.candidatePairs(parseSarQuery({ pairLimit: "2" }, "candidate-pairs"));
  assert.equal(result.summary.assessedCombinations, 110);
  assert.equal(result.summary.metadataCompatible, 110);
  assert.equal(result.summary.jointFootprintsChecked, 100);
  assert.equal(result.summary.incomplete, true);
  assert.equal(result.summary.suitableOutputTruncated, true);
  assert.equal(result.candidatePairs.length, 2);
});

test("identical in-flight discovery is deduplicated, cached and refreshed after expiry; other work is busy", async () => {
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const h = fixture({ onEvaluate: async (computation, evaluateDefault) => { entered(); await gate; return evaluateDefault(computation); } });
  const options = parseSarQuery();
  const first = h.service.discover(options);
  const duplicate = h.service.discover(parseSarQuery());
  await started;
  await assert.rejects(h.service.discover(parseSarQuery({ sceneLimit: "1" })), error => error.status === 429 && error.code === "SAR_BUSY");
  release();
  const [result, sameResult] = await Promise.all([first, duplicate]);
  assert.equal(result, sameResult);
  assert.equal(await h.service.discover(options), result);
  assert.deepEqual(h.calls.evaluations, ["scenes"]);
  h.advance(5 * 60 * 1000 + 1);
  assert.notEqual(await h.service.discover(options), result);
  assert.deepEqual(h.calls.evaluations, ["scenes", "scenes"]);
});

test("authentication failures are sanitized, release the slot and are not cached", async () => {
  const h = fixture({ initialize: async call => { if (call === 1) throw new Error("private key and project details"); } });
  await assert.rejects(h.service.discover(parseSarQuery()), error => error.status === 503
    && error.code === "SAR_EE_AUTH_FAILED" && !error.message.includes("private key"));
  const retry = await h.service.discover(parseSarQuery());
  assert.equal(retry.success, true);
  assert.equal(h.calls.auth, 2);
  assert.deepEqual(h.calls.evaluations, ["scenes"]);
});

test("scene and joint-query failures are sanitized and retries can succeed", async () => {
  for (const failedKind of ["scenes", "pairs"]) {
    let failed = false;
    const h = fixture({ scenes: [rawScene("2016-05-01T00:00:00Z"), rawScene("2016-05-20T00:00:00Z")],
      onEvaluate: async (computation, evaluateDefault, kind) => {
        if (kind === failedKind && !failed) { failed = true; throw new Error("private remote query detail"); }
        return evaluateDefault(computation);
      }
    });
    const options = parseSarQuery({}, "candidate-pairs");
    await assert.rejects(h.service.candidatePairs(options), error => error.status === 502
      && error.code === "SAR_EE_QUERY_FAILED" && !error.message.includes("private remote"));
    assert.equal((await h.service.candidatePairs(options)).candidatePairs.length, 1);
    assert.equal(h.calls.evaluations.filter(kind => kind === failedKind).length, 2);
  }
});

test("a timed-out Earth Engine query releases the busy slot and permits a fresh retry", async () => {
  let first = true;
  const h = fixture({ timeoutMs: 10, onEvaluate: async (computation, evaluateDefault) => {
    if (first) { first = false; return new Promise(() => {}); }
    return evaluateDefault(computation);
  } });
  await assert.rejects(h.service.discover(parseSarQuery()), error => error.status === 504 && error.code === "SAR_EE_TIMEOUT");
  assert.equal((await h.service.discover(parseSarQuery())).success, true);
  assert.deepEqual(h.calls.evaluations, ["scenes", "scenes"]);
});
