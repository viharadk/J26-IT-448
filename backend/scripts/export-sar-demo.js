// Publish only actual downloaded previews and scientific metadata to the
// isolated web demo. Ephemeral EE map/thumbnail URLs are omitted from snapshot.
const fs = require("node:fs/promises");
const path = require("node:path");
async function main() {
  const name = process.argv[2];
  if (!/^function2-phase2b-\d+$/.test(name || "")) throw new Error("Provide the successful function2-phase2b-<timestamp> evidence folder name.");
  const source = path.resolve(__dirname, "..", "artifacts", name);
  const evidence = JSON.parse(await fs.readFile(path.join(source, "verification.json"), "utf8"));
  if (!evidence.liveHttpEndpointsPassed || evidence.tileAndThumbnailChecks.length !== 9 || evidence.tileAndThumbnailChecks.some(check => check.visiblePixels <= 0)) throw new Error("Evidence did not pass real tile/thumbnail verification.");
  const output = path.resolve(__dirname, "..", "..", "frontend", "public", "sar-evidence");
  await fs.mkdir(output, { recursive: true });
  for (const name of ["before", "later", "change"]) await fs.copyFile(path.join(source, `${name}-preview.png`), path.join(output, `${name}-preview.png`));
  const summary = { ...evidence.preview, source: "verified-snapshot", evidenceFolder: `backend/artifacts/${name}`,
    layers: Object.fromEntries(Object.entries(evidence.preview.layers).map(([key, layer]) => [key, { label: layer.label, visualization: layer.visualization, units: layer.units, mask: layer.mask }])) };
  await fs.writeFile(path.join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log("Exported verified actual EE snapshot to:", output);
}
main().catch(error => { console.error("FAIL snapshot export:", error.message); process.exitCode = 1; });
