// Opt-in, real authenticated metadata discovery; no SAR flood detection.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const { parseSarQuery } = require("../services/sarValidation");
const { createSarService } = require("../services/sarService");
const { createSarRouter } = require("../routes/sarRoutes");

async function main() {
  const queryString = process.argv[2] || "";
  const query = Object.fromEntries(new URLSearchParams(queryString));
  const options = parseSarQuery(query, "candidate-pairs");
  const service = createSarService();
  const scenes = await service.discover(options);
  console.log("LIVE AUTHENTICATED SAR DISCOVERY", scenes.queriedAt);
  console.log("Dataset:", scenes.dataset, "Study area km²:", scenes.studyArea.areaKm2);
  console.log("HydroBASINS IDs:", scenes.studyArea.basinIds.join(", "));
  for (const [name, period] of Object.entries(scenes.periods)) {
    console.log(`\n${name}: ${period.start} <= UTC acquisition < ${period.endExclusive}; ${period.totalCount} scenes (${period.returnedCount} returned${period.truncated ? ", TRUNCATED" : ""})`);
    for (const scene of period.scenes) {
      console.log(`${scene.sceneId}\n  ${scene.acquiredAt} | ${scene.platform} | ${scene.orbitDirection} orbit ${scene.relativeOrbitNumber} | ${scene.instrumentMode} | ${scene.polarizations.join("+")} | ${scene.resolutionMeters} m (${scene.resolutionClass}) | AOI footprint ${scene.coveragePercent.toFixed(4)}%`);
      if (scene.timestampWarning) console.log(`  TIMESTAMP WARNING: product ID start ${scene.productStartUtcFromId}; metadata difference ${scene.timestampDifferenceSeconds} seconds. ${scene.timestampWarning}`);
    }
    if (!period.totalCount) console.log("  No scenes in this discovery window.");
  }
  const pairs = await service.candidatePairs(options);
  console.log("\nPAIR SUMMARY", JSON.stringify(pairs.summary));
  console.log(pairs.message);
  for (const pair of pairs.candidatePairs) {
    console.log(`CANDIDATE ${pair.beforeAcquiredAt} -> ${pair.duringAcquiredAt} | ${pair.orbitDirection}/${pair.relativeOrbitNumber} | ${pair.sharedPolarizations.join("+")} | joint ${pair.jointCoveragePercent.toFixed(4)}%\n  ${pair.beforeSceneId}\n  ${pair.duringSceneId}\n  ${pair.reasons.join(" ")}`);
  }
  for (const pair of pairs.rejectedPairs) console.log(`REJECTED ${pair.beforeSceneId} -> ${pair.duringSceneId}: ${pair.reasons.join(" ")}`);
  console.log("\nLIMITATION:", pairs.caveat);

  // Also prove both Express endpoints return the verified cached results.
  const app = express();
  app.use("/api/sar", createSarRouter(service));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/sar`;
    const sceneQuery = new URLSearchParams(queryString);
    sceneQuery.delete("pairLimit"); sceneQuery.delete("minCoveragePercent");
    const sceneResponse = await fetch(`${base}/scenes?${sceneQuery}`);
    assert.equal(sceneResponse.status, 200);
    assert.deepEqual(await sceneResponse.json(), scenes);
    const pairResponse = await fetch(`${base}/candidate-pairs?${queryString}`);
    assert.equal(pairResponse.status, 200);
    assert.deepEqual(await pairResponse.json(), pairs);
    console.log("PASS both live HTTP endpoints; real EE results, cached repeat.");
  } finally { await new Promise(resolve => server.close(resolve)); }

  const output = path.resolve(__dirname, "..", "artifacts", process.argv[3] || "function2-phase1-2016.json");
  const artifactRoot = path.resolve(__dirname, "..", "artifacts");
  if (path.dirname(output) !== artifactRoot) throw new Error("Output must be a filename inside backend/artifacts.");
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(output, `${JSON.stringify({ verification: "Authenticated Earth Engine + both Express endpoints", scenes, pairs }, null, 2)}\n`);
  console.log("Saved evidence:", output);
}
main().catch(error => {
  console.error("FAIL real SAR verification:", error.code || "ERROR", error.message);
  const detail = typeof error.cause === "string" ? error.cause : error.cause?.message;
  if (detail) console.error("Earth Engine error:", String(detail).slice(0, 1500));
  process.exitCode = 1;
});
