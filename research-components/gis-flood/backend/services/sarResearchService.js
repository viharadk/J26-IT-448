// Phase 2A observation research. Phase 1 services, responses and evidence stay
// unchanged; this module adds explicitly bounded historical discovery only.
const { createSarService } = require("./sarService");
const { parseSarQuery } = require("./sarValidation");

const TARGET_SCENE_ID = "COPERNICUS/S1_GRD/S1A_IW_GRDH_1SSV_20160522T125651_20160522T125720_011372_01146A_FD75";
const WINDOWS_2016 = Object.freeze({
  januaryToMarch: Object.freeze({ start: "2016-01-01", endExclusive: "2016-04-01" }),
  aprilToPreEvent: Object.freeze({ start: "2016-04-01", endExclusive: "2016-05-15" }),
  eventDiscovery: Object.freeze({ start: "2016-05-15", endExclusive: "2016-06-01" })
});
const ALTERNATIVE_2017_QUERY = Object.freeze({
  beforeStart: "2017-04-01", beforeEnd: "2017-05-18",
  floodStart: "2017-05-25", floodEnd: "2017-05-31",
  extendedStart: "2017-05-31", extendedEnd: "2017-06-07"
});

function rankAlternativePairs(pairs) {
  // Approximate calendar-day proximity, not conversion of the report's
  // unstated clock/timezone into a claimed UTC flood-peak instant.
  return pairs.map(pair => ({
    ...pair,
    eventCalendarDistanceDays: Math.abs(Date.parse(`${pair.duringAcquiredAt.slice(0, 10)}T00:00:00Z`) - Date.parse("2017-05-26T00:00:00Z")) / 86400000,
    scientificStatus: "candidate-for-event-and-pixel-validation",
    limitations: ["Footprint coverage does not establish valid backscatter pixels or inundation.",
      "Pre-event date does not establish a dry baseline.",
      "May 26 is an event calendar-date reference; the hydrological report's peak clock timezone is unstated.",
      "The 2017 Kelani event was documented as minor, unlike the severe 2016 event."]
  })).sort((a, b) => a.eventCalendarDistanceDays - b.eventCalendarDistanceDays || a.gapDays - b.gapDays || a.beforeSceneId.localeCompare(b.beforeSceneId));
}

function isTargetConfiguration(scene) {
  return scene.orbitDirection === "ASCENDING" && scene.relativeOrbitNumber === 100 &&
    scene.instrumentMode === "IW" && Array.isArray(scene.polarizations) && scene.polarizations.includes("VV");
}
function createSarResearchService({ sarService = createSarService() } = {}) {
  async function discover2016() {
    const discovery = await sarService.discover({ windows: WINDOWS_2016, sceneLimit: 100 });
    const beforePeriods = [discovery.periods.januaryToMarch, discovery.periods.aprilToPreEvent];
    const before = beforePeriods.flatMap(period => period.scenes);
    const configurationMatches = before.filter(isTargetConfiguration);
    return {
      phase: "Function 2 Phase 2A", discovery,
      targetSceneId: TARGET_SCENE_ID,
      target: discovery.periods.eventDiscovery.scenes.find(scene => scene.sceneId === TARGET_SCENE_ID) || null,
      matchingPreEventScenes: configurationMatches,
      adequatePreEventScenes: configurationMatches.filter(scene => Number.isFinite(scene.coveragePercent) && scene.coveragePercent >= 90),
      incomplete: Object.values(discovery.periods).some(period => period.truncated),
      caution: "Matching metadata and footprint are not proof of dry baseline or floodwater. Original timestamp warnings are preserved."
    };
  }
  async function discoverAlternative2017({ nearEventBaseline = false } = {}) {
    // The Irrigation Department reports normal Kelani gauges at 09:00 May 25.
    // A separate bounded follow-up considers May 18-24 without claiming dry pixels.
    const query = nearEventBaseline ? { beforeStart: "2017-05-18", beforeEnd: "2017-05-25", floodStart: "2017-05-25", floodEnd: "2017-05-31" } : ALTERNATIVE_2017_QUERY;
    const options = parseSarQuery(query, "candidate-pairs");
    const discovery = await sarService.discover(options);
    const pairs = await sarService.candidatePairs(options);
    const rankedRecommendations = rankAlternativePairs(pairs.candidatePairs);
    return {
      phase: "Function 2 Phase 2A", event: "Documented late-May 2017 minor Kelani flood",
      baselineDiscovery: nearEventBaseline ? "Near-event follow-up: normal gauge evidence is not proof of a dry SAR baseline." : "Conservative earlier pre-event window.",
      eventEvidence: "Irrigation Department Hydrological Annual 2016/17; Hanwella annual peak reported May 26 at 21:00, timezone unstated.",
      discovery, pairs, rankedRecommendations,
      rankPolicy: "Among Phase 1 metadata/coverage-compatible candidates: acquisition calendar-day proximity to May 26, then temporal separation. This is not validated flood extent.",
      incomplete: pairs.summary.incomplete || pairs.summary.suitableOutputTruncated
    };
  }
  return { discover2016, discoverAlternative2017 };
}
module.exports = { createSarResearchService, isTargetConfiguration, rankAlternativePairs, WINDOWS_2016, ALTERNATIVE_2017_QUERY, TARGET_SCENE_ID };
