// Metadata screening only. A suitable pair still needs pixel-quality checks and
// independent evidence of flood conditions before any inundation interpretation.
const SAR_POLARIZATIONS = ["VV", "VH", "HH", "HV"];
const ORBIT_DIRECTIONS = new Set(["ASCENDING", "DESCENDING"]);
const INSTRUMENT_MODES = new Set(["IW", "EW", "SM"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const JOINT_PENDING_REASON = "Joint study-area footprint coverage still requires verification.";

function checkThreshold(minCoveragePercent) {
  if (!Number.isFinite(minCoveragePercent) || minCoveragePercent < 0 || minCoveragePercent > 100) {
    throw new RangeError("minCoveragePercent must be a number between 0 and 100.");
  }
}

function isCoverage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function utcTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) return null;
  const timestamp = Date.parse(value);
  const canonical = `${match[1]}.${(match[2] || "").padEnd(3, "0")}Z`;
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === canonical
    ? timestamp : null;
}

function sharedBands(before, during) {
  const beforeBands = Array.isArray(before.polarizations) ? before.polarizations : [];
  const duringBands = Array.isArray(during.polarizations) ? during.polarizations : [];
  return SAR_POLARIZATIONS.filter(band => beforeBands.includes(band) && duringBands.includes(band));
}

function evaluatePair(before = {}, during = {}, minCoveragePercent = 90) {
  checkThreshold(minCoveragePercent);
  before = before || {};
  during = during || {};
  const reasons = [];
  const sharedPolarizations = sharedBands(before, during);
  const beforeTime = utcTimestamp(before.acquiredAt);
  const duringTime = utcTimestamp(during.acquiredAt);

  for (const [label, scene] of [["Before", before], ["During", during]]) {
    if (scene.timestampWarning) reasons.push(`${label} acquisition timestamp conflicts with the product ID; verify the source timing before comparison.`);
    if (typeof scene.sceneId !== "string" || !scene.sceneId.trim()) {
      reasons.push(`${label} scene ID is missing.`);
    }
  }

  const matchingFields = [
    ["orbitDirection", "orbit direction", value => ORBIT_DIRECTIONS.has(value)],
    ["relativeOrbitNumber", "relative orbit number", value => Number.isInteger(value) && value > 0],
    ["instrumentMode", "instrument mode", value => INSTRUMENT_MODES.has(value)],
    ["resolutionMeters", "resolution", isPositiveNumber]
  ];
  for (const [field, label, valid] of matchingFields) {
    if (!valid(before[field]) || !valid(during[field])) {
      reasons.push(`A known valid ${label} is required for both scenes.`);
    } else if (before[field] !== during[field]) {
      reasons.push(`The scenes have different ${label} values.`);
    }
  }

  if (!sharedPolarizations.length) {
    reasons.push("The scenes have no shared SAR polarization (VV, VH, HH or HV).");
  }
  for (const [label, scene] of [["Before", before], ["During", during]]) {
    if (!isCoverage(scene.coveragePercent)) {
      reasons.push(`${label} study-area footprint coverage is unavailable or invalid.`);
    } else if (scene.coveragePercent < minCoveragePercent) {
      reasons.push(`${label} study-area footprint coverage is below ${minCoveragePercent}%.`);
    }
  }
  if (beforeTime === null || duringTime === null) {
    reasons.push("Both scenes require valid acquisition timestamps in ISO UTC format.");
  } else if (duringTime <= beforeTime) {
    reasons.push("The during-period acquisition must be later than the before-period acquisition.");
  }

  const preferredConfiguration = before.instrumentMode === "IW"
    && during.instrumentMode === "IW" && sharedPolarizations.includes("VV");
  const status = reasons.length ? "incompatible" : "coverage-check-required";
  if (status === "coverage-check-required") {
    reasons.push("Orbit direction, relative orbit, instrument mode and resolution match.");
    reasons.push(`Shared SAR polarization: ${sharedPolarizations.join(", ")}.`);
    reasons.push(`Both scene footprints cover at least ${minCoveragePercent}% of the study area.`);
    reasons.push(JOINT_PENDING_REASON);
    reasons.push(preferredConfiguration
      ? "Preferred IW configuration with shared VV is available."
      : "This is an alternative configuration; IW with shared VV is preferred.");
  }

  return {
    beforeSceneId: before.sceneId ?? null,
    duringSceneId: during.sceneId ?? null,
    beforeAcquiredAt: before.acquiredAt ?? null,
    duringAcquiredAt: during.acquiredAt ?? null,
    orbitDirection: before.orbitDirection ?? null,
    relativeOrbitNumber: before.relativeOrbitNumber ?? null,
    instrumentMode: before.instrumentMode ?? null,
    sharedPolarizations,
    preferredConfiguration,
    beforeCoveragePercent: isCoverage(before.coveragePercent) ? before.coveragePercent : null,
    duringCoveragePercent: isCoverage(during.coveragePercent) ? during.coveragePercent : null,
    jointCoveragePercent: null,
    gapDays: beforeTime !== null && duringTime !== null ? (duringTime - beforeTime) / DAY_MS : null,
    status,
    reasons
  };
}

function finalizePair(pair, jointCoveragePercent, minCoveragePercent = 90) {
  checkThreshold(minCoveragePercent);
  const jointIsValid = isCoverage(jointCoveragePercent);
  const reasons = Array.isArray(pair.reasons)
    ? pair.reasons.filter(reason => reason !== JOINT_PENDING_REASON) : [];
  let suitable = pair.status === "coverage-check-required" || pair.status === "suitable";

  if (!suitable && !reasons.length) reasons.push("Scene metadata compatibility has not been established.");
  if (!jointIsValid) {
    suitable = false;
    reasons.push("Joint study-area footprint coverage is unavailable or invalid.");
  } else if (jointCoveragePercent < minCoveragePercent) {
    suitable = false;
    reasons.push(`Joint study-area footprint coverage is below ${minCoveragePercent}%.`);
  } else if (suitable) {
    // The threshold can differ from the preliminary check, so verify it again.
    if (!isCoverage(pair.beforeCoveragePercent) || !isCoverage(pair.duringCoveragePercent)
      || pair.beforeCoveragePercent < minCoveragePercent || pair.duringCoveragePercent < minCoveragePercent) {
      suitable = false;
      reasons.push(`Both scene footprints must cover at least ${minCoveragePercent}% of the study area.`);
    } else {
      reasons.push(`Verified joint footprint covers ${jointCoveragePercent}% of the study area (minimum ${minCoveragePercent}%).`);
    }
  }

  return {
    ...pair,
    jointCoveragePercent: jointIsValid ? jointCoveragePercent : null,
    status: suitable ? "suitable" : "unsuitable",
    reasons
  };
}

function compareText(left, right) {
  const a = typeof left === "string" ? left : "";
  const b = typeof right === "string" ? right : "";
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDates(left, right) {
  const a = utcTimestamp(left) ?? Infinity;
  const b = utcTimestamp(right) ?? Infinity;
  return a === b ? 0 : a - b;
}

function rankPairs(pairs) {
  const statusRank = { suitable: 0, "coverage-check-required": 1, unsuitable: 2, incompatible: 3 };
  return [...pairs].sort((a, b) => {
    const statusDifference = (statusRank[a.status] ?? 4) - (statusRank[b.status] ?? 4);
    if (statusDifference) return statusDifference;
    if (Boolean(a.preferredConfiguration) !== Boolean(b.preferredConfiguration)) {
      return a.preferredConfiguration ? -1 : 1;
    }
    const aGap = Number.isFinite(a.gapDays) && a.gapDays > 0 ? a.gapDays : Infinity;
    const bGap = Number.isFinite(b.gapDays) && b.gapDays > 0 ? b.gapDays : Infinity;
    if (aGap !== bGap) return aGap - bGap;
    return compareDates(a.beforeAcquiredAt, b.beforeAcquiredAt)
      || compareDates(a.duringAcquiredAt, b.duringAcquiredAt)
      || compareText(a.beforeSceneId, b.beforeSceneId)
      || compareText(a.duringSceneId, b.duringSceneId);
  });
}

module.exports = { evaluatePair, finalizePair, rankPairs };
