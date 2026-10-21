// Opt-in authenticated Phase 2A discovery. Never writes Phase 1 evidence.
require("dotenv").config({ quiet: true });
const fs = require("node:fs/promises");
const path = require("node:path");
const { createSarResearchService } = require("../services/sarResearchService");

async function main() {
  const event = process.argv[2] || "2016";
  if (!["2016", "2017", "2017-near-event"].includes(event)) throw new Error("Choose bounded event discovery: 2016, 2017 or 2017-near-event.");
  const service = createSarResearchService();
  const research = await (event === "2016" ? service.discover2016() : service.discoverAlternative2017({ nearEventBaseline: event === "2017-near-event" }));
  console.log("LIVE PHASE 2A QUERY", research.discovery.queriedAt);
  for (const [period, data] of Object.entries(research.discovery.periods)) {
    console.log(`\n${period}: [${data.start}, ${data.endExclusive}) ${data.totalCount} total; ${data.returnedCount} returned; truncated=${data.truncated}`);
    for (const scene of data.scenes) console.log(`${scene.sceneId}\n  EE UTC ${scene.acquiredAt}; ID UTC ${scene.productStartUtcFromId}; ${scene.orbitDirection}/${scene.relativeOrbitNumber}; ${scene.instrumentMode}; ${scene.polarizations.join("+")}; ${scene.resolutionMeters}m; footprint ${scene.coveragePercent.toFixed(6)}%; timestampWarning=${Boolean(scene.timestampWarning)}`);
  }
  if (event === "2016") {
    console.log("\nASCENDING/100/IW/VV before scenes:", research.matchingPreEventScenes.length);
    console.log("At least 90% AOI coverage:", research.adequatePreEventScenes.length);
    console.log("Target present:", Boolean(research.target), "Incomplete:", research.incomplete);
  } else {
    console.log("\nPAIR SUMMARY", JSON.stringify(research.pairs.summary));
    for (const pair of research.rankedRecommendations) console.log(`RESEARCH CANDIDATE ${pair.beforeSceneId}\n  -> ${pair.duringSceneId}\n  ${pair.beforeAcquiredAt} -> ${pair.duringAcquiredAt}; ${pair.orbitDirection}/${pair.relativeOrbitNumber}; ${pair.sharedPolarizations.join("+")}; joint ${pair.jointCoveragePercent.toFixed(6)}%; event calendar distance ${pair.eventCalendarDistanceDays} days; separation ${pair.gapDays} days`);
    console.log("Incomplete:", research.incomplete);
  }
  const stem = `function2-phase2a-${event}-discovery`;
  let output = path.resolve(__dirname, "..", "artifacts", `${stem}.json`);
  try { await fs.writeFile(output, `${JSON.stringify(research, null, 2)}\n`, { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    output = path.resolve(__dirname, "..", "artifacts", `${stem}-${Date.now()}.json`);
    await fs.writeFile(output, `${JSON.stringify(research, null, 2)}\n`, { flag: "wx" });
  }
  console.log("Saved new evidence:", output);
}
main().catch(error => {
  console.error("FAIL Phase 2A:", error.code || "ERROR", error.message);
  const detail = typeof error.cause === "string" ? error.cause : error.cause?.message;
  if (detail) console.error("Upstream:", detail.slice(0, 1500));
  process.exitCode = 1;
});
