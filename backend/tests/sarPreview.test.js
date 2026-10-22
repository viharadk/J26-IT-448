const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { summarizeQuality, DISPLAY } = require("../services/sarPixelQuality");
const { createSarPreviewService, tileTemplate } = require("../services/sarPreviewService");
const { createSarPreviewRouter } = require("../routes/sarPreviewRoutes");

// Synthetic reductions test behavior only; live values/images are independently
// recorded by scripts/check-sar-preview.js and are never replaced by these.
function rawQuality() {
  const metadata = { bands: ["VV", "VH", "angle"], time: Date.parse("2017-05-24T00:25:12Z"), platform: "A",
    orbitDirection: "DESCENDING", relativeOrbitNumber: 19, instrumentMode: "IW", polarizations: ["VV", "VH"], resolutionMeters: 10,
    projection: { crs: "EPSG:32644", nominalScaleMeters: 10, transformWkt: "synthetic-before-affine" },
    angleProjection: { crs: "EPSG:32644", nominalScaleMeters: 16000, transformWkt: "synthetic-angle-affine" }, footprintCoveragePercent: 95 };
  return {
    before: metadata, later: { ...structuredClone(metadata), platform: "B", time: Date.parse("2017-05-30T00:24:30Z"), projection: { ...metadata.projection, transformWkt: "synthetic-later-affine" } },
    vectorAreaKm2: 1.02, areas: { aoi: 1000000, before: 800000, later: 850000, common: 750000, angleCommon: 740000 },
    jointFootprintCoveragePercent: 94, bounds: {}, outline: {}, center: [80, 6.9],
    statistics: { before_count: 7500, later_count: 7500, change_count: 7500, before_mean: -12, later_mean: -11, change_mean: 1 },
    samples: [{ coordinates: [80, 6.9], values: { before: -13, later: -12, change: 1 } }]
  };
}
test("valid-pixel and footprint coverage retain distinct denominators and common support", () => {
  const result = summarizeQuality(rawQuality(), "2026-10-20T00:00:00Z");
  assert.equal(result.scenes.before.footprintCoveragePercent, 95);
  assert.equal(result.scenes.before.validPixelCoveragePercent, 80);
  assert.equal(result.common.validPixelCoveragePercent, 75);
  assert.equal(result.common.validPixelAreaKm2, 0.75);
  assert.equal(result.common.validPixelCoveragePercentOfVectorAoi, 750000 / 1020000 * 100);
  assert.equal(result.common.jointFootprintCoveragePercent, 94);
  assert.equal(result.scenes.later.platform, "Sentinel-1B");
  assert.equal(result.samples[0].properties.change, 1);
});
test("different native transforms require alignment and do not establish calibration or accuracy", () => {
  const raw = rawQuality(), result = summarizeQuality(raw);
  assert.equal(result.alignment.sameNativeGrid, false);
  assert.match(result.alignment.strategy, /nearest-neighbor/);
  assert.equal(result.alignment.nativeGridMatchProvesRegistration, false);
  assert.equal(result.comparability.crossPlatformCalibrated, false);
  assert.equal(result.comparability.floodDetectionValidated, false);
  assert.match(result.computation.change, /later_dB - before_dB/);
  assert.deepEqual(DISPLAY.before, DISPLAY.later);
  raw.later.projection = structuredClone(raw.before.projection);
  assert.equal(summarizeQuality(raw).alignment.sameNativeGrid, true);
  assert.equal(summarizeQuality(raw).alignment.nativeGridMatchProvesRegistration, false);
});
test("empty pixels, invalid areas and unequal pixel supports cannot become successful validation", () => {
  for (const mutate of [
    raw => { raw.areas.aoi = 0; }, raw => { raw.vectorAreaKm2 = null; }, raw => { raw.areas.common = 0; },
    raw => { raw.areas.common = 900000; }, raw => { raw.areas.before = Infinity; }, raw => { raw.areas.later = -1; },
    raw => { raw.statistics.change_count--; }, raw => { raw.statistics.before_mean = NaN; }
  ]) { const raw = rawQuality(); mutate(raw); assert.throws(() => summarizeQuality(raw)); }
});
test("required bands, projection, acquisition time and fixed scene configuration are checked", () => {
  for (const mutate of [raw => { raw.before.bands = ["VH"]; }, raw => { raw.before.time = null; },
    raw => { raw.later.projection = {}; }, raw => { raw.later.relativeOrbitNumber = 100; }, raw => { raw.before.instrumentMode = "EW"; }]) {
    const raw = rawQuality(); mutate(raw); assert.throws(() => summarizeQuality(raw));
  }
});
test("map templates accept scoped EE XYZ URLs while excluding credentials, OAuth tokens and other hosts", () => {
  const url = "https://earthengine.googleapis.com/v1/projects/example/maps/id/tiles/{z}/{x}/{y}";
  assert.equal(tileTemplate({ urlFormat: url }), url);
  assert.equal(tileTemplate({ mapid: "projects/example/maps/id" }), url);
  for (const invalid of [null, { urlFormat: "https://example.org/{z}/{x}/{y}" }, { urlFormat: url + "?access_token=secret" },
    { urlFormat: url.replace("https://", "http://") }, { urlFormat: "https://user:secret@earthengine.googleapis.com/{z}/{x}/{y}" }]) assert.throws(() => tileTemplate(invalid));
});
function fixture(overrides = {}) {
  let time = 0;
  const calls = { auth: 0, evaluations: 0, maps: 0, thumbs: 0 };
  const service = createSarPreviewService({
    engine: () => ({ ee: {}, initializeEarthEngine: async () => { calls.auth++; } }),
    getStudyArea: async () => ({ aoi: {} }), graphBuilder: () => ({ computation: rawQuality(), layers: { before: "before", later: "later", change: "change" }, region: {} }),
    evaluateValue: async raw => { calls.evaluations++; return raw; },
    mapImage: async () => { calls.maps++; return "https://earthengine.googleapis.com/v1/projects/test/maps/id/tiles/{z}/{x}/{y}"; },
    thumbnailImage: async () => { calls.thumbs++; return "https://earthengine.googleapis.com/v1/test/thumbnail"; },
    now: () => time, timeoutMs: 100, ...overrides
  });
  return { service, calls, advance: ms => { time += ms; } };
}
test("quality and preview calls deduplicate reductions, cache previews and renew tiles without recomputing pixels", async () => {
  const { service, calls, advance } = fixture();
  const [a, b, quality] = await Promise.all([service.preview(), service.preview(), service.pixelQuality()]);
  assert.deepEqual(a, b); assert.deepEqual(a.quality, quality);
  assert.deepEqual(calls, { auth: 1, evaluations: 1, maps: 3, thumbs: 3 });
  assert.match(a.layers.change.label, /not flood extent/);
  assert.equal(a.layers.before.mask, "Common valid AOI pixels");
  advance(10 * 60 * 1000 + 1); await service.preview();
  assert.equal(calls.maps, 6); assert.equal(calls.evaluations, 1);
});
test("pixel/authentication failures are sanitized and failed reductions can be retried", async () => {
  let attempt = 0;
  const { service } = fixture({ evaluateValue: async () => { if (++attempt === 1) throw Error("private upstream detail"); return rawQuality(); } });
  await assert.rejects(service.pixelQuality(), error => error.status === 502 && !error.message.includes("private"));
  assert.equal((await service.pixelQuality()).success, true);
  const failed = fixture({ engine: () => { throw Error("private credential detail"); } });
  await assert.rejects(failed.service.preview(), error => error.status === 503 && !error.message.includes("private"));
});
test("preview generation failure retains good pixel results and a timeout releases the pending state", async () => {
  let maps = 0;
  const { service, calls } = fixture({ mapImage: async () => { if (++maps === 1) throw Error("provider map failure"); return "https://earthengine.googleapis.com/v1/map/{z}/{x}/{y}"; } });
  await assert.rejects(service.preview(), error => error.status === 502);
  assert.equal((await service.preview()).success, true); assert.equal(calls.evaluations, 1);
  let attempts = 0;
  const timed = fixture({ timeoutMs: 5, evaluateValue: async () => ++attempts === 1 ? new Promise(() => {}) : rawQuality() });
  await assert.rejects(timed.service.pixelQuality(), error => error.status === 504);
  assert.equal((await timed.service.pixelQuality()).success, true);
});
async function withApi(service, run) {
  const app = express(); app.use("/api/sar", createSarPreviewRouter(service));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}/api/sar`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test("isolated endpoints return actual service payloads and reject unbounded client requests before work", async () => {
  let calls = 0;
  const respond = async () => { calls++; return { success: true, source: "synthetic-test-service" }; };
  await withApi({ pixelQuality: respond, preview: respond }, async base => {
    for (const endpoint of ["preview", "pixel-quality"]) {
      const response = await fetch(`${base}/${endpoint}`); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).success, true);
      for (const query of ["scene=arbitrary", "scale=1000", "band=VH", "refresh=1&refresh=2"]) assert.equal((await fetch(`${base}/${endpoint}?${query}`)).status, 400);
    }
  });
  assert.equal(calls, 2);
});
test("API failures preserve public status but never expose unexpected internal errors", async () => {
  for (const status of [502, 503, 504, 401]) {
    const fail = async () => { throw Object.assign(new Error(status === 401 ? "private" : "public failure"), { status, code: "INTERNAL_DETAIL" }); };
    await withApi({ pixelQuality: fail, preview: fail }, async base => {
      const response = await fetch(`${base}/preview`), data = await response.json();
      assert.equal(response.status, status === 401 ? 500 : status);
      if (status === 401) { assert.equal(data.code, "SAR_PREVIEW_INTERNAL_ERROR"); assert.equal(JSON.stringify(data).includes("private"), false); }
    });
  }
});
