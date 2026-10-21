require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { bounded, evaluate, buildGraph } = require('../services/sarPreviewService');
const { SCENES } = require('../services/sarPixelQuality');
const { buildInvestigation, validateInvestigation } = require('../services/sarWaterReferenceService');
async function main() {
  const folder = path.resolve(__dirname, '..', 'artifacts', `function2-phase4b-${Date.now()}`); await fs.mkdir(folder);
  const engine = require('../services/earthEngineService');
  await bounded(engine.initializeEarthEngine(), 120000, 'water investigation authentication');
  const { aoi } = await require('../services/hazardService').getCachedHazardAnalysis();
  const graph = buildGraph(engine.ee, aoi, SCENES);
  const investigation = buildInvestigation(engine.ee, graph), stage = process.argv[2];
  if (stage && !(stage in investigation)) throw Error('Unknown investigation stage.');
  const results = {};
  const keys = stage ? [stage] : Object.keys(investigation);
  // Evaluate bounded groups separately; persist partial evidence if a later
  // provider call fails. No lower-resolution/bestEffort fallback is used.
  for (const key of keys) {
    results[key] = await bounded(evaluate(investigation[key]), 120000, `historical-water ${key}`);
    await fs.writeFile(path.join(folder, 'partial.json'), JSON.stringify(results, null, 2));
    console.log('Measured', key);
  }
  if (!stage) validateInvestigation(results);
  await fs.writeFile(path.join(folder, 'investigation.json'), JSON.stringify({ queriedAt: new Date().toISOString(), sceneIds: SCENES,
    units: 'm² for all area reductions', temporalCutoffExclusive: '2017-05-01', results }, null, 2));
  console.log(JSON.stringify(results, null, 2)); console.log('EVIDENCE', folder);
}
main().catch(error => { console.error('HISTORICAL WATER INVESTIGATION FAILED', error, error.cause || ''); process.exitCode = 1; });
