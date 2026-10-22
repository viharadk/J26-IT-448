const fs = require("node:fs/promises");
const path = require("node:path");
const { createProductMetadataLookup } = require("../services/sarProductMetadata");

async function main() {
  const evidence = JSON.parse(await fs.readFile(path.resolve(__dirname, "..", "artifacts", "function2-phase2a-2016-discovery.json"), "utf8"));
  const result = await createProductMetadataLookup().lookup(evidence.target);
  for (const [source, data] of Object.entries(result.sources)) console.log(source, JSON.stringify({ url: data.url, ok: data.ok, status: data.status, record: data.record, error: data.error }));
  console.log("TIMESTAMP ASSESSMENT", JSON.stringify(result.assessment));
  let output = path.resolve(__dirname, "..", "artifacts", "function2-phase2a-product-metadata.json");
  try { await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    output = path.resolve(__dirname, "..", "artifacts", `function2-phase2a-product-metadata-${Date.now()}.json`);
    await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  }
  console.log("Saved independent catalogue evidence:", output);
  if (!result.assessment.independentCataloguesAgree) process.exitCode = 1;
}
main().catch(error => { console.error("FAIL public metadata verification:", error.message); process.exitCode = 1; });
