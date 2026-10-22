require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { FOLDER } = require('./acquire-phase6b-reference');
const { createSarPreviewService, evaluate, bounded } = require('../services/sarPreviewService');
const { validateSelectedQuality } = require('../services/sarSelectionService');
const { buildCandidateGraph, referenceYear } = require('../services/sarCandidateService');
const { referencePolicy, CONSERVATIVE, MONTHLY_DRY } = require('../services/sarWaterReferenceService');
const { FILTERS, intersectMasks } = require('../services/ahpSarResearchService');
const { sarSupportedDomain } = require('../research/phase6a/validation');
const { safeError } = require('./run-ahp-sar-research');
const { verifySupportAreas } = require('../research/phase6b/feasibility');
async function main() {
  const discovery = JSON.parse(await fs.readFile(path.join(FOLDER, 'sar-discovery.json'), 'utf8'));
  const geodata = JSON.parse(await fs.readFile(path.join(FOLDER, 'reference-geodata-audit.json'), 'utf8'));
  if (discovery.status !== 'completed' || discovery.incomplete) throw new Error('Complete actual scene discovery is required.');
  const subsetBytes = await fs.readFile(path.join(FOLDER, geodata.nsdi.validSubsetFile));
  if (crypto.createHash('sha256').update(subsetBytes).digest('hex') !== geodata.nsdi.validSubsetSha256) throw new Error('NSDI subset checksum changed.');
  const subset = JSON.parse(subsetBytes.toString('utf8'));
  const result = { status: 'running', executedAt: new Date().toISOString(), scientificValidationExecuted: false,
    reference: { file: geodata.nsdi.validSubsetFile, sha256: geodata.nsdi.validSubsetSha256,
      includedValidFeatures: subset.features.length, excludedInvalidFeatures: geodata.nsdi.invalidFeatures,
      geometryOnly: true, positiveLabelSemanticsVerified: false, observationDateVerified: false },
    spatialReferenceAudit: null, pairs: [] };
  const save = () => fs.writeFile(path.join(FOLDER, 'spatial-support.json'), JSON.stringify(result, null, 2));
  try {
    const { ee, initializeEarthEngine } = require('../services/earthEngineService');
    await bounded(initializeEarthEngine(), 120000, 'Phase 6B initialization');
    const hazard = await require('../services/hazardService').getCachedHazardAnalysis();
    const collection = ee.FeatureCollection(subset.features.map(f => ee.Feature(ee.Geometry(f.geometry, 'EPSG:4326', false), f.properties)));
    const referenceGeometry = collection.geometry(1);
    const refInAoi = referenceGeometry.intersection(hazard.aoi, 1);
    const spatial = { validNsdiSubsetAreaKm2: referenceGeometry.area(1).divide(1e6),
      validNsdiSubsetInsideAoiKm2: refInAoi.area(1).divide(1e6), aoiAreaKm2: hazard.aoi.area(1).divide(1e6) };
    for (const pdf of geodata.surveyPdfs) {
      const geometries = pdf.viewports.map(v => ee.Geometry(v.geographicFootprint.geometry, 'EPSG:4326', false));
      if (geometries.length !== 1) throw new Error('Expected one audited map viewport.');
      spatial[`${pdf.file}_cartographicExtentInsideAoiKm2`] = geometries[0].intersection(hazard.aoi, 1).area(1).divide(1e6);
    }
    result.spatialReferenceAudit = await bounded(evaluate(ee.Dictionary(spatial)), 180000, 'Phase 6B reference geometry intersection');
    await save();
    for (const pair of discovery.pairs.filter(p => p.status === 'suitable')) {
      const selection = { before: pair.beforeSceneId, later: pair.duringSceneId };
      console.log('Actual SAR mask support for', pair.beforeAcquiredAt, 'to', pair.duringAcquiredAt);
      const entry = { selection, beforeAcquiredAt: pair.beforeAcquiredAt, laterAcquiredAt: pair.duringAcquiredAt,
        filters: FILTERS, historicalReferenceYear: referenceYear(selection), status: 'running', policies: [] };
      result.pairs.push(entry);
      try {
        const preview = createSarPreviewService({ getStudyArea: async () => hazard, sceneIds: selection,
          validateQuality: validateSelectedQuality, timeoutMs: 180000 });
        const { data: quality, graph } = await preview.qualityState();
        entry.quality = quality;
        const methods = [CONSERVATIVE, MONTHLY_DRY];
        const candidates = methods.map(method => buildCandidateGraph(ee, graph, referenceYear(selection), referencePolicy(selection, referenceYear(selection), method), FILTERS));
        const domains = candidates.map(sarSupportedDomain), shared = intersectMasks(domains);
        for (const [i, method] of methods.entries()) {
          console.log('  Support policy', method);
          const candidate = candidates[i], m = candidate.supportMasks;
          const masks = { aoiRaster: ee.Image.constant(1),
            commonSar: m.common, smoothing: m.smoothing, historicalSupported: m.valid, historicalEligible: m.eligible,
            terrainUnknown: m.terrainUnknown, stageSharedDomain: domains[i], identicalCrossPolicyDomain: shared };
          const refMasks = { referenceSubsetRaster: ee.Image.constant(1), referenceInsideCommonSar: m.common,
            referenceInsideStageSharedDomain: domains[i], referenceInsideIdenticalCrossPolicyDomain: shared };
          // Use the actual vector intersection as reducer geometry, with weighted
          // boundary pixels. Do not rasterize a coarse constant-image clip into
          // a binary reference footprint and silently lose boundary weighting.
          const reduce = (items, geometry) => ee.Image.cat(Object.entries(items).map(([key, mask]) => ee.Image.pixelArea()
            .updateMask(mask.unmask(0, false).gt(0)).rename(key))).reduceRegion({ ...graph.gridOptions,
            geometry, maxPixels: 1e9, reducer: ee.Reducer.sum() });
          const [whole, withinReference] = await Promise.all([
            bounded(evaluate(reduce(masks, graph.aoi)), 240000, `Phase 6B ${method} valid support`),
            bounded(evaluate(reduce(refMasks, refInAoi)), 240000, `Phase 6B ${method} reference support`)
          ]);
          const areas = { ...whole, ...withinReference };
          for (const key of [...Object.keys(masks), ...Object.keys(refMasks)]) {
            if (!Object.hasOwn(areas, key) || (areas[key] !== null && (!Number.isFinite(areas[key]) || areas[key] < 0))) throw new Error(`Missing support measurement: ${key}`);
          }
          const areasKm2 = Object.fromEntries(Object.entries(areas).map(([key, value]) => [key, value === null ? 0 : value / 1e6]));
          verifySupportAreas(areasKm2);
          entry.policies.push({ method, areasKm2,
            referenceMetadata: await bounded(evaluate(candidate.referenceMetadata), 120000, 'Phase 6B historical reference provenance') });
          await save();
        }
        entry.status = 'SUPPORT_MEASURED_REFERENCE_NOT_QUALIFIED';
        entry.grid = quality.alignment.analysisProjection;
        entry.method = 'Existing before-VV exact CRS/affine grid; pixelArea geographic sums with the exact reference/AOI vector intersection as reducer geometry and weighted boundary pixels; recognized SAR masks, complete smoothing, historical eligibility and known terrain. Reference is only the 45-feature valid-geometry diagnostic subset, not qualified labels. Raw/terrain/final would share this domain. No stage response or accuracy metric was evaluated.';
      } catch (error) { entry.status = 'DATA_NOT_READY'; entry.error = safeError(error); if (error.cause) entry.cause = safeError(error.cause); }
      await save();
    }
    result.status = result.pairs.every(p => p.status === 'SUPPORT_MEASURED_REFERENCE_NOT_QUALIFIED') ? 'FEASIBILITY_SUPPORT_COMPLETED' : 'PARTIAL_SUPPORT_FAILURE';
  } catch (error) { result.status = 'DATA_NOT_READY'; result.error = safeError(error); }
  await save();
  console.log(JSON.stringify({ status: result.status, spatial: result.spatialReferenceAudit, pairs: result.pairs.map(p => ({ before: p.beforeAcquiredAt, status: p.status, policies: p.policies, error: p.error })) }, null, 2));
  if (!['FEASIBILITY_SUPPORT_COMPLETED'].includes(result.status)) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
