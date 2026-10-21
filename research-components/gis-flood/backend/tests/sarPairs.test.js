const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePair, finalizePair, rankPairs } = require("../services/sarPairs");

const before = {
  sceneId: "test-before",
  acquiredAt: "2016-05-01T00:00:00.000Z",
  platform: "Sentinel-1A",
  orbitDirection: "DESCENDING",
  relativeOrbitNumber: 5,
  instrumentMode: "IW",
  resolutionMeters: 10,
  polarizations: ["VV", "VH"],
  coveragePercent: 100
};
const during = { ...before, sceneId: "test-during", acquiredAt: "2016-05-25T00:00:00.000Z" };

test("matching metadata requires independent joint footprint verification", () => {
  const pair = evaluatePair(before, during);
  assert.equal(pair.status, "coverage-check-required");
  assert.equal(pair.jointCoveragePercent, null);
  assert.equal(pair.gapDays, 24);
  assert.equal(pair.preferredConfiguration, true);
  assert.deepEqual(pair.sharedPolarizations, ["VV", "VH"]);
  assert.equal(pair.beforeSceneId, before.sceneId);
  assert.equal(pair.duringSceneId, during.sceneId);
  assert.equal(pair.beforeCoveragePercent, 100);
  assert.match(pair.reasons.join(" "), /Joint study-area footprint coverage still requires verification/);
});

test("incompatible direction, relative orbit, instrument mode and resolution are explained", () => {
  for (const [field, replacement, expected] of [
    ["orbitDirection", "ASCENDING", /different orbit direction/],
    ["relativeOrbitNumber", 6, /different relative orbit number/],
    ["instrumentMode", "EW", /different instrument mode/],
    ["resolutionMeters", 40, /different resolution/]
  ]) {
    const pair = evaluatePair(before, { ...during, [field]: replacement });
    assert.equal(pair.status, "incompatible", field);
    assert.ok(pair.reasons.some(reason => expected.test(reason)), field);
    assert.ok(!pair.reasons.some(reason => /Preferred|alternative configuration/.test(reason)));
  }
});

test("missing or invalid metadata never creates a matching pair", () => {
  for (const [field, invalidValues] of [
    ["orbitDirection", [undefined, null, "", "descending", "SIDEWAYS"]],
    ["relativeOrbitNumber", [undefined, null, "5", 0, -1, 1.5, NaN, Infinity]],
    ["instrumentMode", [undefined, null, "", "iw", "UNKNOWN"]],
    ["resolutionMeters", [undefined, null, "10", 0, -10, NaN, Infinity]]
  ]) {
    for (const invalid of invalidValues) {
      const pair = evaluatePair({ ...before, [field]: invalid }, { ...during, [field]: invalid });
      assert.equal(pair.status, "incompatible", `${field}=${invalid}`);
      assert.match(pair.reasons.join(" "), /known valid/);
    }
  }
  assert.equal(evaluatePair(null, null).status, "incompatible");
  assert.equal(evaluatePair({ ...before, sceneId: " " }, during).status, "incompatible");
});

test("shared bands are SAR polarizations only, unique and in deterministic order", () => {
  const pair = evaluatePair(
    { ...before, polarizations: ["angle", "VH", "VV", "VV"] },
    { ...during, polarizations: ["VV", "VH", "angle"] }
  );
  assert.deepEqual(pair.sharedPolarizations, ["VV", "VH"]);
  assert.equal(pair.status, "coverage-check-required");
  for (const bands of [["HH", "HV"], ["angle"], [], null, "VV"]) {
    const incompatible = evaluatePair(before, { ...during, polarizations: bands });
    assert.equal(incompatible.status, "incompatible");
    assert.match(incompatible.reasons.join(" "), /no shared SAR polarization/);
  }
});

test("shared alternative modes and polarizations remain eligible and are clearly described", () => {
  const alternative = evaluatePair(
    { ...before, instrumentMode: "EW", resolutionMeters: 40, polarizations: ["HH", "HV"] },
    { ...during, platform: "Sentinel-1B", instrumentMode: "EW", resolutionMeters: 40, polarizations: ["HH"] }
  );
  assert.equal(alternative.status, "coverage-check-required");
  assert.equal(alternative.preferredConfiguration, false);
  assert.deepEqual(alternative.sharedPolarizations, ["HH"]);
  assert.match(alternative.reasons.join(" "), /alternative configuration/);
});

test("individual coverage must be finite, valid and at or above the threshold", () => {
  assert.equal(evaluatePair({ ...before, coveragePercent: 90 }, during).status, "coverage-check-required");
  assert.equal(evaluatePair(before, { ...during, coveragePercent: 89.999 }).status, "incompatible");
  assert.equal(evaluatePair({ ...before, coveragePercent: 80 }, during, 80).status, "coverage-check-required");
  for (const coveragePercent of [undefined, null, "100", NaN, Infinity, -1, 100.01]) {
    const pair = evaluatePair({ ...before, coveragePercent }, during);
    assert.equal(pair.status, "incompatible", String(coveragePercent));
    assert.equal(pair.beforeCoveragePercent, null);
  }
});

test("acquisition timestamps are valid UTC instants and during must be later", () => {
  assert.equal(evaluatePair(before, { ...during, acquiredAt: before.acquiredAt }).status, "incompatible");
  assert.equal(evaluatePair(before, { ...during, acquiredAt: "2016-04-30T23:59:59Z" }).status, "incompatible");
  for (const acquiredAt of [undefined, null, "", "2016-05-25", "2016-02-30T00:00:00Z", "2016-05-25T25:00:00Z", "2016-05-25T00:00:00+05:30", "not a date"]) {
    const pair = evaluatePair(before, { ...during, acquiredAt });
    assert.equal(pair.status, "incompatible", String(acquiredAt));
    assert.equal(pair.gapDays, null);
  }
  const halfDay = evaluatePair(before, { ...during, acquiredAt: "2016-05-01T12:00:00Z" });
  assert.equal(halfDay.gapDays, 0.5);
  assert.equal(halfDay.status, "coverage-check-required");
});

test("joint coverage threshold is inclusive and never inferred from individual coverage", () => {
  const pending = evaluatePair(before, during);
  const suitable = finalizePair(pending, 90);
  assert.equal(suitable.status, "suitable");
  assert.ok(!suitable.reasons.some(reason => reason.includes("still requires verification")));
  assert.equal(finalizePair(pending, 100).status, "suitable");
  for (const jointCoveragePercent of [89.999, 0, null, undefined, NaN, Infinity, "100", -1, 101]) {
    const pair = finalizePair(pending, jointCoveragePercent);
    assert.equal(pair.status, "unsuitable", String(jointCoveragePercent));
    assert.ok(pair.reasons.some(reason => /Joint study-area footprint/.test(reason)));
  }
  assert.equal(pending.status, "coverage-check-required");
  assert.equal(pending.jointCoveragePercent, null);
});

test("high joint coverage cannot override incompatibility or a stricter individual threshold", () => {
  const incompatible = evaluatePair(before, { ...during, relativeOrbitNumber: 6 });
  const finalized = finalizePair(incompatible, 100);
  assert.equal(finalized.status, "unsuitable");
  assert.match(finalized.reasons.join(" "), /different relative orbit number/);
  const eligibleAt80 = evaluatePair({ ...before, coveragePercent: 85 }, during, 80);
  assert.equal(finalizePair(eligibleAt80, 95, 90).status, "unsuitable");
});

test("coverage thresholds reject programmer errors", () => {
  for (const threshold of [-1, 101, "90", null, NaN, Infinity]) {
    assert.throws(() => evaluatePair(before, during, threshold), RangeError);
    assert.throws(() => finalizePair(evaluatePair(before, during), 100, threshold), RangeError);
  }
});

test("pair ranking is deterministic by status, preference, gap, date and scene IDs", () => {
  const compatible = evaluatePair(before, during);
  const suitable = finalizePair(compatible, 100);
  const rejected = finalizePair(compatible, 0);
  const incompatible = evaluatePair(before, { ...during, instrumentMode: "EW" });
  const alternative = { ...compatible, preferredConfiguration: false, gapDays: 1 };
  const shorter = { ...compatible, gapDays: 12 };
  const idB = { ...suitable, beforeSceneId: "B" };
  const idA = { ...suitable, beforeSceneId: "A" };
  const input = [incompatible, alternative, rejected, compatible, idB, shorter, idA];
  const ranked = rankPairs(input);
  assert.deepEqual(ranked, [idA, idB, shorter, compatible, alternative, rejected, incompatible]);
  assert.equal(input[0], incompatible);
  const later = { ...suitable, beforeAcquiredAt: "2016-05-02T00:00:00.000Z" };
  assert.deepEqual(rankPairs([later, suitable]), [suitable, later]);
  const sameInstantIdA = { ...idA, beforeAcquiredAt: "2016-05-01T00:00:00Z" };
  assert.deepEqual(rankPairs([idB, sameInstantIdA]), [sameInstantIdA, idB]);
  assert.deepEqual(rankPairs([]), []);
});
