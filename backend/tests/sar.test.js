const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { parseSarQuery } = require("../services/sarValidation");
const { createSarRouter } = require("../routes/sarRoutes");

const defaults = {
  before: { start: "2016-04-01", endExclusive: "2016-05-15" },
  flood: { start: "2016-05-15", endExclusive: "2016-06-01" },
  extended: { start: "2016-06-01", endExclusive: "2016-06-16" }
};
const custom = {
  beforeStart: "2017-04-01", beforeEnd: "2017-05-01",
  floodStart: "2017-05-01", floodEnd: "2017-06-01"
};
const invalidQuery = error => error.status === 400 && error.code === "SAR_INVALID_QUERY";

test("default discovery windows include the requested final calendar days using exclusive ends", () => {
  assert.deepEqual(parseSarQuery(), { windows: defaults, sceneLimit: 100 });
  assert.deepEqual(parseSarQuery({}, "candidate-pairs"), {
    windows: defaults, sceneLimit: 100, pairLimit: 20, minCoveragePercent: 90
  });
});

test("custom dates replace all default periods, with extended discovery optional", () => {
  assert.deepEqual(parseSarQuery(custom), {
    windows: {
      before: { start: "2017-04-01", endExclusive: "2017-05-01" },
      flood: { start: "2017-05-01", endExclusive: "2017-06-01" }
    }, sceneLimit: 100
  });
  const extended = parseSarQuery({ ...custom, extendedStart: "2017-06-01", extendedEnd: "2017-06-16" });
  assert.deepEqual(extended.windows.extended, { start: "2017-06-01", endExclusive: "2017-06-16" });
  for (const query of [
    { beforeStart: custom.beforeStart },
    { ...custom, beforeEnd: undefined },
    { ...custom, extendedStart: "2017-06-01" },
    { ...custom, extendedEnd: "2017-06-16" },
    { extendedStart: "2017-06-01", extendedEnd: "2017-06-16" }
  ]) assert.throws(() => parseSarQuery(query), invalidQuery);
});

test("date validation rejects normalized calendar mistakes, non-UTC-day forms and nonscalar values", () => {
  for (const invalidDate of [
    "2017-02-29", "2016-02-30", "2016-04-31", "2016-00-01", "2016-13-01", "2016-01-00",
    "2016-1-01", "2016-01-1", "2016-01-01T00:00:00Z", "2016-01-01 ", "", null,
    ["2016-01-01", "2016-01-02"], { value: "2016-01-01" }
  ]) {
    assert.throws(() => parseSarQuery({ ...custom, beforeStart: invalidDate }), invalidQuery, String(invalidDate));
  }
  const leapYear = parseSarQuery({ beforeStart: "2016-02-29", beforeEnd: "2016-03-01", floodStart: "2016-03-01", floodEnd: "2016-03-02" });
  assert.equal(leapYear.windows.before.start, "2016-02-29");
});

test("discovery date bounds admit the dataset start and 2100-01-01 exclusive limit", () => {
  const earliest = { beforeStart: "2014-10-03", beforeEnd: "2014-10-04", floodStart: "2014-10-04", floodEnd: "2014-10-05" };
  assert.equal(parseSarQuery(earliest).windows.before.start, "2014-10-03");
  assert.throws(() => parseSarQuery({ ...earliest, beforeStart: "2014-10-02" }), invalidQuery);
  const latest = { beforeStart: "2099-12-29", beforeEnd: "2099-12-30", floodStart: "2099-12-31", floodEnd: "2100-01-01" };
  assert.equal(parseSarQuery(latest).windows.flood.endExclusive, "2100-01-01");
  assert.throws(() => parseSarQuery({ ...latest, floodEnd: "2100-01-02" }), invalidQuery);
});

test("windows must be positive, at most 93 days, chronological and nonoverlapping", () => {
  const exactly93 = { beforeStart: "2017-01-01", beforeEnd: "2017-04-04", floodStart: "2017-04-04", floodEnd: "2017-04-05" };
  assert.equal(parseSarQuery(exactly93).windows.before.endExclusive, "2017-04-04");
  const invalid = [
    { ...exactly93, beforeEnd: "2017-04-05", floodStart: "2017-04-05", floodEnd: "2017-04-06" },
    { ...custom, beforeEnd: custom.beforeStart },
    { ...custom, beforeEnd: "2017-03-31" },
    { ...custom, floodStart: "2017-04-30" },
    { ...custom, beforeStart: "2017-05-02", beforeEnd: "2017-05-03" },
    { ...custom, extendedStart: "2017-05-31", extendedEnd: "2017-06-10" }
  ];
  for (const query of invalid) assert.throws(() => parseSarQuery(query), invalidQuery);
  assert.equal(parseSarQuery({ ...custom, extendedStart: custom.floodEnd, extendedEnd: "2017-06-02" }).windows.extended.start, custom.floodEnd);
});

test("combined discovery span is bounded even when short windows have a long gap", () => {
  const exactly366 = { beforeStart: "2016-01-01", beforeEnd: "2016-01-02", floodStart: "2016-12-31", floodEnd: "2017-01-01" };
  assert.equal(parseSarQuery(exactly366).windows.flood.endExclusive, "2017-01-01");
  assert.throws(() => parseSarQuery({ ...exactly366, floodEnd: "2017-01-02" }), invalidQuery);
  assert.throws(() => parseSarQuery({ ...exactly366, extendedStart: "2017-01-01", extendedEnd: "2017-01-02" }), invalidQuery);
});

test("scene and pair limits are bounded integers and coverage accepts bounded decimal percentages", () => {
  for (const endpoint of ["scenes", "candidate-pairs"]) {
    assert.equal(parseSarQuery({ sceneLimit: "1" }, endpoint).sceneLimit, 1);
    assert.equal(parseSarQuery({ sceneLimit: "100" }, endpoint).sceneLimit, 100);
    for (const sceneLimit of ["0", "101", "1.1", "-1", "1e2", " 1", "", null, ["1", "2"], {}]) {
      assert.throws(() => parseSarQuery({ sceneLimit }, endpoint), invalidQuery, String(sceneLimit));
    }
  }
  for (const pairLimit of ["1", "100"]) assert.equal(parseSarQuery({ pairLimit }, "candidate-pairs").pairLimit, Number(pairLimit));
  for (const pairLimit of ["0", "101", "2.5", ["1", "2"], null]) assert.throws(() => parseSarQuery({ pairLimit }, "candidate-pairs"), invalidQuery);
  for (const minCoveragePercent of ["1", "90.5", "100"]) assert.equal(parseSarQuery({ minCoveragePercent }, "candidate-pairs").minCoveragePercent, Number(minCoveragePercent));
  for (const minCoveragePercent of ["0", "0.99", "100.01", "Infinity", ["90", "95"], null]) assert.throws(() => parseSarQuery({ minCoveragePercent }, "candidate-pairs"), invalidQuery);
});

test("unknown and endpoint-inappropriate query parameters are rejected", () => {
  for (const query of [{ dataset: "other" }, { limit: "1" }, { pairLimit: "1" }, { minCoveragePercent: "90" }]) {
    assert.throws(() => parseSarQuery(query, "scenes"), invalidQuery);
  }
  assert.throws(() => parseSarQuery({ unexpected: "yes" }, "candidate-pairs"), invalidQuery);
});

async function withApi(service, run) {
  const app = express();
  app.use("/api/sar", createSarRouter(service));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}/api/sar`;
  try { await run(base); }
  finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("HTTP endpoints forward validated options and return the service contracts unchanged", async () => {
  const calls = [];
  const scenes = { success: true, dataset: "COPERNICUS/S1_GRD", periods: { before: { totalCount: 0, returnedCount: 0, truncated: false, scenes: [] } } };
  const pairs = { success: true, dataset: "COPERNICUS/S1_GRD", candidatePairs: [], rejectedPairs: [], summary: { suitableFound: 0, incomplete: false } };
  await withApi({
    discover: async options => { calls.push(["scenes", options]); return scenes; },
    candidatePairs: async options => { calls.push(["pairs", options]); return pairs; }
  }, async base => {
    const sceneResponse = await fetch(`${base}/scenes`);
    assert.equal(sceneResponse.status, 200);
    assert.deepEqual(await sceneResponse.json(), scenes);
    const params = new URLSearchParams({ ...custom, sceneLimit: "25", pairLimit: "4", minCoveragePercent: "90.5" });
    const pairResponse = await fetch(`${base}/candidate-pairs?${params}`);
    assert.equal(pairResponse.status, 200);
    assert.deepEqual(await pairResponse.json(), pairs);
  });
  assert.deepEqual(calls, [
    ["scenes", parseSarQuery()],
    ["pairs", parseSarQuery({ ...custom, sceneLimit: "25", pairLimit: "4", minCoveragePercent: "90.5" }, "candidate-pairs")]
  ]);
});

test("HTTP validation rejects invalid, repeated and array parameters before any Earth Engine service call", async () => {
  let calls = 0;
  const unexpectedlyCalled = async () => { calls++; throw new Error("should not run"); };
  await withApi({ discover: unexpectedlyCalled, candidatePairs: unexpectedlyCalled }, async base => {
    for (const path of [
      "/scenes?sceneLimit=0", "/scenes?sceneLimit=1&sceneLimit=2", "/scenes?sceneLimit[]=1",
      "/scenes?pairLimit=2", "/scenes?unknown=value", "/candidate-pairs?pairLimit=101",
      "/candidate-pairs?minCoveragePercent=80&minCoveragePercent=90",
      "/candidate-pairs?beforeStart=2017-01-01&beforeStart=2017-01-02&beforeEnd=2017-02-01&floodStart=2017-02-01&floodEnd=2017-03-01"
    ]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 400, path);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.equal(body.code, "SAR_INVALID_QUERY");
      assert.equal(typeof body.message, "string");
    }
  });
  assert.equal(calls, 0);
});

test("HTTP routes preserve known service status and code, including Retry-After for busy queries", async () => {
  for (const status of [400, 429, 502, 503, 504]) {
    const error = Object.assign(new Error(`Public error for ${status}`), { status, code: `SAR_TEST_${status}` });
    const fail = async () => { throw error; };
    await withApi({ discover: fail, candidatePairs: fail }, async base => {
      for (const endpoint of ["scenes", "candidate-pairs"]) {
        const response = await fetch(`${base}/${endpoint}`);
        assert.equal(response.status, status);
        assert.deepEqual(await response.json(), { success: false, code: error.code, message: error.message });
        if (status === 429) assert.match(response.headers.get("retry-after"), /^\d+$/);
        else assert.equal(response.headers.get("retry-after"), null);
      }
    });
  }
});

test("unexpected route failures return a sanitized 500 without internal details", async () => {
  for (const error of [new Error("private credential or stack detail"), Object.assign(new Error("private upstream detail"), { status: 401, code: "PRIVATE_INTERNAL_CODE" })]) {
    const fail = async () => { throw error; };
    await withApi({ discover: fail, candidatePairs: fail }, async base => {
      for (const endpoint of ["scenes", "candidate-pairs"]) {
        const response = await fetch(`${base}/${endpoint}`);
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), {
          success: false, code: "SAR_INTERNAL_ERROR", message: "SAR discovery failed unexpectedly."
        });
      }
    });
  }
});
