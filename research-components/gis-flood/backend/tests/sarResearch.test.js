const test = require("node:test");
const assert = require("node:assert/strict");
const { createSarResearchService, rankAlternativePairs, TARGET_SCENE_ID } = require("../services/sarResearchService");

// Synthetic fixtures exercise research decisions; they are not scene-availability
// evidence. Only the target identifier comes from the already-preserved query.
function syntheticScene(label, overrides = {}) {
  return {
    sceneId: `SYNTHETIC_TEST_ONLY/${label}`, acquiredAt: "2016-01-10T00:00:00.000Z",
    orbitDirection: "ASCENDING", relativeOrbitNumber: 100, instrumentMode: "IW",
    polarizations: ["VV"], coveragePercent: 100, timestampWarning: null, ...overrides
  };
}

function period(scenes = [], truncated = false) {
  return { totalCount: scenes.length + (truncated ? 1 : 0), returnedCount: scenes.length, truncated, scenes };
}

function discovery2016({ january = [], april = [], event = [], truncatedPeriod } = {}) {
  return {
    periods: {
      januaryToMarch: period(january, truncatedPeriod === "januaryToMarch"),
      aprilToPreEvent: period(april, truncatedPeriod === "aprilToPreEvent"),
      eventDiscovery: period(event, truncatedPeriod === "eventDiscovery")
    }
  };
}

function syntheticPair(label, duringAcquiredAt, gapDays, overrides = {}) {
  return {
    beforeSceneId: `SYNTHETIC_TEST_ONLY/${label}/before`,
    duringSceneId: `SYNTHETIC_TEST_ONLY/${label}/during`, duringAcquiredAt, gapDays,
    jointCoveragePercent: 99, status: "suitable", ...overrides
  };
}

function fixture({ discovery = discovery2016(), pairs = { candidatePairs: [], summary: { incomplete: false, suitableOutputTruncated: false } } } = {}) {
  const calls = { discover: [], candidatePairs: [] };
  const service = createSarResearchService({ sarService: {
    async discover(options) { calls.discover.push(options); return discovery; },
    async candidatePairs(options) { calls.candidatePairs.push(options); return pairs; }
  } });
  return { service, calls };
}

test("2016 research queries bounded UTC windows through May 14 without an inclusive-end error", async () => {
  const h = fixture();
  await h.service.discover2016();
  assert.deepEqual(h.calls.discover, [{
    windows: {
      januaryToMarch: { start: "2016-01-01", endExclusive: "2016-04-01" },
      aprilToPreEvent: { start: "2016-04-01", endExclusive: "2016-05-15" },
      eventDiscovery: { start: "2016-05-15", endExclusive: "2016-06-01" }
    }, sceneLimit: 100
  }]);
  assert.deepEqual(h.calls.candidatePairs, []);
  for (const window of Object.values(h.calls.discover[0].windows)) {
    const spanDays = (Date.parse(window.endExclusive) - Date.parse(window.start)) / 86400000;
    assert.ok(spanDays > 0 && spanDays <= 93, "Each discovery window must stay bounded");
  }
});

test("2016 search considers every returned pre-event slice across both historical periods", async () => {
  const first = syntheticScene("january-slice-1");
  const second = syntheticScene("january-slice-2");
  const april = syntheticScene("april-slice", { acquiredAt: "2016-04-02T00:00:00.000Z" });
  const during = syntheticScene("event-observation", { acquiredAt: "2016-05-22T00:00:00.000Z" });
  const discovery = discovery2016({ january: [first, second], april: [april], event: [during] });
  const { service } = fixture({ discovery });
  const result = await service.discover2016();
  assert.deepEqual(result.matchingPreEventScenes, [first, second, april]);
  assert.deepEqual(result.adequatePreEventScenes, [first, second, april]);
  assert.equal(result.discovery, discovery);
  assert.equal(result.target, null);
  assert.equal(result.incomplete, false);
});

test("pre-event configuration requires known ASCENDING orbit 100, IW mode and shared VV", async () => {
  const good = syntheticScene("valid-vv-vh", { polarizations: ["VH", "VV"] });
  const invalid = [
    { orbitDirection: "DESCENDING" }, { orbitDirection: "ascending" }, { orbitDirection: null },
    { relativeOrbitNumber: 19 }, { relativeOrbitNumber: "100" }, { relativeOrbitNumber: null },
    { instrumentMode: "EW" }, { instrumentMode: null },
    { polarizations: ["VH"] }, { polarizations: ["HH", "HV"] },
    { polarizations: "VV" }, { polarizations: null }
  ].map((overrides, index) => syntheticScene(`wrong-configuration-${index}`, overrides));
  const { service } = fixture({ discovery: discovery2016({ january: [...invalid, good] }) });
  const result = await service.discover2016();
  assert.deepEqual(result.matchingPreEventScenes, [good]);
  assert.deepEqual(result.adequatePreEventScenes, [good]);
});

test("adequate pre-event coverage accepts 90 percent and rejects missing, nonfinite or subthreshold coverage", async () => {
  const adequate = [syntheticScene("exact-threshold", { coveragePercent: 90 }), syntheticScene("full-coverage")];
  const inadequate = [89.999, 0, null, undefined, "100", NaN, Infinity, -Infinity]
    .map((coveragePercent, index) => syntheticScene(`inadequate-${index}`, { coveragePercent }));
  const { service } = fixture({ discovery: discovery2016({ january: [...adequate, ...inadequate] }) });
  const result = await service.discover2016();
  assert.equal(result.matchingPreEventScenes.length, adequate.length + inadequate.length);
  assert.deepEqual(result.adequatePreEventScenes, adequate);
});

test("May 22 numeric time, product-ID time and timestamp warning remain unchanged", async () => {
  const target = Object.freeze(syntheticScene("target-metadata", {
    sceneId: TARGET_SCENE_ID, acquiredAt: "2016-05-22T00:56:51.950Z",
    productStartUtcFromId: "2016-05-22T12:56:51.000Z",
    timestampDifferenceSeconds: -43199.05,
    timestampWarning: "Synthetic test warning: numeric timestamp and product-ID timestamp disagree."
  }));
  const discovery = discovery2016({ event: [syntheticScene("another-event-slice"), target] });
  const snapshot = structuredClone(discovery);
  const { service } = fixture({ discovery });
  const result = await service.discover2016();
  assert.equal(result.target, target);
  assert.equal(result.target.acquiredAt, target.acquiredAt);
  assert.equal(result.target.productStartUtcFromId, target.productStartUtcFromId);
  assert.equal(result.target.timestampWarning, target.timestampWarning);
  assert.deepEqual(discovery, snapshot);
  assert.match(result.caution, /timestamp warnings are preserved/i);
});

test("no matching scenes produce empty results without substituting another configuration", async () => {
  const { service } = fixture({ discovery: discovery2016({
    january: [syntheticScene("different-orbit", { relativeOrbitNumber: 19 })],
    event: [syntheticScene("event-only-match")]
  }) });
  const result = await service.discover2016();
  assert.deepEqual(result.matchingPreEventScenes, []);
  assert.deepEqual(result.adequatePreEventScenes, []);
  assert.equal(result.target, null);
  assert.equal(result.incomplete, false);
  assert.match(result.caution, /not proof of dry baseline or floodwater/i);
});

test("a truncated 2016 period preserves empty matches while disclosing incomplete discovery", async () => {
  for (const truncatedPeriod of ["januaryToMarch", "aprilToPreEvent", "eventDiscovery"]) {
    const { service } = fixture({ discovery: discovery2016({ truncatedPeriod }) });
    const result = await service.discover2016();
    assert.equal(result.incomplete, true, truncatedPeriod);
    assert.deepEqual(result.matchingPreEventScenes, []);
    assert.equal(result.discovery.periods[truncatedPeriod].truncated, true);
  }
});

test("alternative event uses validated, bounded nonoverlapping 2017 windows for discovery and pair queries", async () => {
  const h = fixture();
  const result = await h.service.discoverAlternative2017();
  const expected = {
    windows: {
      before: { start: "2017-04-01", endExclusive: "2017-05-18" },
      flood: { start: "2017-05-25", endExclusive: "2017-05-31" },
      extended: { start: "2017-05-31", endExclusive: "2017-06-07" }
    }, sceneLimit: 100, pairLimit: 20, minCoveragePercent: 90
  };
  assert.deepEqual(h.calls.discover, [expected]);
  assert.deepEqual(h.calls.candidatePairs, [expected]);
  assert.equal(h.calls.discover[0], h.calls.candidatePairs[0]);
  assert.deepEqual(result.rankedRecommendations, []);
  assert.equal(result.incomplete, false);
  assert.match(result.event, /2017.*minor Kelani flood/i);
});

test("near-event follow-up uses an explicit end-exclusive May 18-24 baseline without changing the default", async () => {
  const h = fixture();
  const followUp = await h.service.discoverAlternative2017({ nearEventBaseline: true });
  const followUpOptions = {
    windows: {
      before: { start: "2017-05-18", endExclusive: "2017-05-25" },
      flood: { start: "2017-05-25", endExclusive: "2017-05-31" }
    }, sceneLimit: 100, pairLimit: 20, minCoveragePercent: 90
  };
  assert.deepEqual(h.calls.discover[0], followUpOptions);
  assert.deepEqual(h.calls.candidatePairs[0], followUpOptions);
  assert.equal(h.calls.discover[0].windows.extended, undefined);
  assert.match(followUp.baselineDiscovery, /normal gauge evidence is not proof of a dry SAR baseline/i);

  const defaultResult = await h.service.discoverAlternative2017();
  assert.deepEqual(h.calls.discover[1].windows, {
    before: { start: "2017-04-01", endExclusive: "2017-05-18" },
    flood: { start: "2017-05-25", endExclusive: "2017-05-31" },
    extended: { start: "2017-05-31", endExclusive: "2017-06-07" }
  });
  assert.deepEqual(h.calls.candidatePairs[1], h.calls.discover[1]);
  assert.match(defaultResult.baselineDiscovery, /conservative earlier pre-event window/i);
});

test("event-aware ranking prefers May 26 calendar proximity before shorter acquisition separation", () => {
  const shortGapFarFromEvent = syntheticPair("short-gap-late", "2017-05-30T00:00:00.000Z", 12);
  const longerGapOnEventDate = syntheticPair("longer-gap-event-date", "2017-05-26T23:59:59.000Z", 30);
  const shorterGapOnEventDate = syntheticPair("shorter-gap-event-date", "2017-05-26T00:00:00.000Z", 24);
  const dayBefore = syntheticPair("day-before", "2017-05-25T23:59:59.000Z", 12);
  const original = [shortGapFarFromEvent, longerGapOnEventDate, dayBefore, shorterGapOnEventDate];
  const snapshot = structuredClone(original);
  const ranked = rankAlternativePairs(original);
  assert.deepEqual(ranked.map(pair => pair.beforeSceneId), [
    shorterGapOnEventDate.beforeSceneId, longerGapOnEventDate.beforeSceneId,
    dayBefore.beforeSceneId, shortGapFarFromEvent.beforeSceneId
  ]);
  assert.deepEqual(ranked.map(pair => pair.eventCalendarDistanceDays), [0, 0, 1, 4]);
  assert.deepEqual(original, snapshot, "Research ranking must not rewrite the Phase 1 pair evidence");
});

test("recommendations remain observation candidates with dry-baseline, pixel, inundation and timing limitations", async () => {
  const candidate = syntheticPair("limitations", "2017-05-26T12:00:00.000Z", 24);
  const pairs = { candidatePairs: [candidate], summary: { incomplete: false, suitableOutputTruncated: false } };
  const { service } = fixture({ pairs });
  const result = await service.discoverAlternative2017();
  assert.equal(result.pairs, pairs, "Original metadata-compatibility evidence must remain available");
  const recommendation = result.rankedRecommendations[0];
  assert.equal(recommendation.scientificStatus, "candidate-for-event-and-pixel-validation");
  assert.match(recommendation.limitations.join(" "), /does not establish valid backscatter pixels or inundation/i);
  assert.match(recommendation.limitations.join(" "), /does not establish a dry baseline/i);
  assert.match(recommendation.limitations.join(" "), /timezone is unstated/i);
  assert.match(recommendation.limitations.join(" "), /2017.*minor.*2016/i);
  assert.match(result.rankPolicy, /not validated flood extent/i);
  assert.equal(candidate.scientificStatus, undefined);
});

test("alternative recommendations disclose evaluated subsets and output truncation as incomplete", async () => {
  for (const [incomplete, suitableOutputTruncated, expected] of [[false, false, false], [true, false, true], [false, true, true], [true, true, true]]) {
    const { service } = fixture({ pairs: { candidatePairs: [], summary: { incomplete, suitableOutputTruncated } } });
    const result = await service.discoverAlternative2017();
    assert.equal(result.incomplete, expected, JSON.stringify({ incomplete, suitableOutputTruncated }));
    assert.deepEqual(result.rankedRecommendations, []);
  }
});

test("authentication and query failures propagate instead of producing invented availability", async () => {
  const unavailable = Object.assign(new Error("Synthetic Earth Engine authentication failure"), { code: "SAR_EE_AUTH_FAILED", status: 503 });
  const service = createSarResearchService({ sarService: {
    async discover() { throw unavailable; },
    async candidatePairs() { assert.fail("Pair queries must not run after discovery fails"); }
  } });
  await assert.rejects(service.discover2016(), error => error === unavailable);
  await assert.rejects(service.discoverAlternative2017(), error => error === unavailable);
});
