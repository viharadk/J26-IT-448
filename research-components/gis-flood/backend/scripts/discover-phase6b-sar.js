require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { createSarService } = require('../services/sarService');
const { parseSarQuery } = require('../services/sarValidation');
const { evaluatePair, finalizePair, rankPairs } = require('../services/sarPairs');
const { evaluate, bounded } = require('../services/sarPreviewService');
const { safeError } = require('./run-ahp-sar-research');
const { FOLDER } = require('./acquire-phase6b-reference');
async function main() {
  await fs.mkdir(FOLDER, { recursive: true });
  const output = { status: 'running', queriedAt: new Date().toISOString(),
    meaning: 'Metadata and footprint compatibility only. Event-date and pixel support qualification are separate.' };
  try {
    const service = createSarService({ timeoutMs: 180000 });
    const options = parseSarQuery({ beforeStart: '2016-04-01', beforeEnd: '2016-05-15',
      floodStart: '2016-05-15', floodEnd: '2016-06-01', extendedStart: '2016-06-01', extendedEnd: '2016-07-01',
      sceneLimit: '100' }, 'scenes');
    console.log('Discovering April-June 2016 through existing SAR service');
    output.discovery = await service.discover(options);
    await fs.writeFile(path.join(FOLDER, 'sar-discovery.json'), JSON.stringify(output, null, 2));
    const before = output.discovery.periods.before.scenes;
    const later = [...output.discovery.periods.flood.scenes, ...output.discovery.periods.extended.scenes];
    const comparisons = rankPairs(before.flatMap(a => later.map(b => evaluatePair(a, b, 90))));
    const pending = comparisons.filter(p => p.status === 'coverage-check-required');
    if (pending.length > 100) throw new Error('More than 100 joint checks; explicitly partition discovery before proceeding.');
    const engine = require('../services/earthEngineService');
    await engine.initializeEarthEngine();
    const { aoi } = await require('../services/hazardService').getCachedHazardAnalysis();
    const { ee } = engine;
    const coverage = pending.length ? await bounded(evaluate(ee.List(pending.map(p => ee.Image(p.beforeSceneId).geometry()
      .intersection(ee.Image(p.duringSceneId).geometry(), 1).intersection(aoi, 1).area(1).divide(aoi.area(1)).multiply(100).max(0).min(100)))), 180000, 'Phase 6B pair footprint coverage') : [];
    output.pairs = rankPairs([...comparisons.filter(p => p.status === 'incompatible'),
      ...pending.map((p, i) => finalizePair(p, coverage[i], 90))]);
    output.incomplete = Object.values(output.discovery.periods).some(p => p.truncated);
    output.status = output.incomplete ? 'INCOMPLETE_DISCOVERY' : 'completed';
    output.minimumCoveragePercent = 90;
    output.coverageDefinition = 'Actual pair footprint intersection within original AOI; not yet the valid-backscatter mask.';
    const { PRODUCT_INDEX, createProductMetadataLookup } = require('../services/sarProductMetadata');
    const conflicted = Object.values(output.discovery.periods).flatMap(p => p.scenes)
      .find(scene => scene.timestampWarning && scene.sceneId.endsWith(PRODUCT_INDEX));
    if (conflicted) {
      console.log('Checking the preserved May 22 timestamp conflict through existing public catalogue lookup');
      output.externalTimestampAudit = await createProductMetadataLookup().lookup(conflicted);
    }
    console.log(JSON.stringify({ status: output.status, periods: Object.fromEntries(Object.entries(output.discovery.periods).map(([name, p]) => [name, p.totalCount])),
      comparisons: output.pairs.length, metadataAndFootprintSuitable: output.pairs.filter(p => p.status === 'suitable').length,
      timestampWarnings: Object.values(output.discovery.periods).flatMap(p => p.scenes).filter(s => s.timestampWarning).map(s => ({ sceneId: s.sceneId, earthEngineTime: s.acquiredAt, productTime: s.productStartUtcFromId })) }, null, 2));
  } catch (error) { output.status = 'failed'; output.error = safeError(error); output.cause = error.cause ? safeError(error.cause) : undefined; process.exitCode = 1; }
  await fs.writeFile(path.join(FOLDER, 'sar-discovery.json'), JSON.stringify(output, null, 2));
}
if (require.main === module) main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
