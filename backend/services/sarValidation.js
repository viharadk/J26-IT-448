const DAY_MS = 86400000;
const DATASET = "COPERNICUS/S1_GRD";
const DEFAULT_WINDOWS = Object.freeze({
  before: Object.freeze({ start: "2016-04-01", endExclusive: "2016-05-15" }),
  flood: Object.freeze({ start: "2016-05-15", endExclusive: "2016-06-01" }),
  extended: Object.freeze({ start: "2016-06-01", endExclusive: "2016-06-16" })
});

function invalid(message) { return Object.assign(new Error(message), { status: 400, code: "SAR_INVALID_QUERY" }); }
function date(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid(`${label} must be a single YYYY-MM-DD date.`);
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw invalid(`${label} is not a valid calendar date.`);
  if (value < "2014-10-03" || value > "2100-01-01") throw invalid(`${label} must be between 2014-10-03 and 2100-01-01.`);
  return timestamp;
}
function numeric(query, key, fallback, minimum, maximum, integer = false) {
  if (query[key] === undefined) return fallback;
  const value = query[key];
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) ||
      Number(value) < minimum || Number(value) > maximum || (integer && !Number.isInteger(Number(value)))) {
    throw invalid(`${key} must be ${integer ? "an integer" : "a number"} from ${minimum} to ${maximum}.`);
  }
  return Number(value);
}
function parseSarQuery(query = {}, endpoint = "scenes") {
  const dateKeys = ["beforeStart", "beforeEnd", "floodStart", "floodEnd", "extendedStart", "extendedEnd"];
  const allowed = new Set([...dateKeys, "sceneLimit", ...(endpoint === "candidate-pairs" ? ["pairLimit", "minCoveragePercent"] : [])]);
  for (const key of Object.keys(query)) if (!allowed.has(key)) throw invalid(`Unknown SAR parameter: ${key}.`);
  const custom = dateKeys.some(key => query[key] !== undefined);
  let windows = DEFAULT_WINDOWS;
  if (custom) {
    for (const key of dateKeys.slice(0, 4)) if (query[key] === undefined) throw invalid("Custom dates require beforeStart, beforeEnd, floodStart and floodEnd together; all End dates are exclusive.");
    if ((query.extendedStart === undefined) !== (query.extendedEnd === undefined)) throw invalid("Provide both extendedStart and extendedEnd, or neither.");
    windows = {};
    for (const key of ["before", "flood", ...(query.extendedStart !== undefined ? ["extended"] : [])]) {
      const start = query[`${key}Start`], endExclusive = query[`${key}End`];
      const span = date(endExclusive, `${key}End`) - date(start, `${key}Start`);
      if (span <= 0 || span > 93 * DAY_MS) throw invalid(`${key} range must be positive and at most 93 days; end is exclusive.`);
      windows[key] = { start, endExclusive };
    }
    if (windows.before.endExclusive > windows.flood.start) throw invalid("Before and flood windows must be chronological and nonoverlapping.");
    if (windows.extended && windows.flood.endExclusive > windows.extended.start) throw invalid("Extended window must start at or after floodEnd.");
    const last = windows.extended || windows.flood;
    if (Date.parse(last.endExclusive) - Date.parse(windows.before.start) > 366 * DAY_MS) throw invalid("Combined discovery span must not exceed 366 days.");
  }
  return {
    windows, sceneLimit: numeric(query, "sceneLimit", 100, 1, 100, true),
    ...(endpoint === "candidate-pairs" ? {
      pairLimit: numeric(query, "pairLimit", 20, 1, 100, true),
      minCoveragePercent: numeric(query, "minCoveragePercent", 90, 1, 100)
    } : {})
  };
}
module.exports = { DATASET, DEFAULT_WINDOWS, parseSarQuery };
