const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { temporalAudit } = require('../research/phase6a/validation');
const { SOURCES } = require('./acquire-phase6a-reference');
const ROOT = path.resolve(__dirname, '..');
const FOLDER = path.join(ROOT, 'artifacts/phase6a-reference-acquisition');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
async function json(name) { return JSON.parse(await fs.readFile(path.join(FOLDER, name), 'utf8')); }

async function main() {
  const geo = await json('geodata-audit.json');
  const live = await json('earth-engine-support-audit.json');
  const log = (await fs.readFile(path.join(FOLDER, 'acquisition-log.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const phase5 = JSON.parse(await fs.readFile(path.join(ROOT, geo.aoiProvenance.file), 'utf8'));
  if (sha(await fs.readFile(path.join(ROOT, geo.aoiProvenance.file))) !== geo.aoiProvenance.sha256) throw new Error('AOI provenance file hash changed.');
  const vectorSources = [];
  for (const pkg of geo.packages) {
    if (sha(await fs.readFile(path.join(FOLDER, pkg.file))) !== pkg.sha256) throw new Error('Vector source checksum changed: ' + pkg.file);
    const flood = pkg.layers.find(layer => layer.member.includes('crisis_information_poly'));
    const aoi = pkg.layers.find(layer => layer.member.includes('area_of_interest'));
    const pdf = geo.pdfs.find(item => item.file.replace('_200dpi.pdf', '_vector.zip') === pkg.file);
    if (!flood || !aoi || !pdf) throw new Error('Missing product flood/AOI/PDF evidence: ' + pkg.file);
    if (sha(await fs.readFile(path.join(FOLDER, pdf.file))) !== pdf.sha256) throw new Error('Map source checksum changed: ' + pdf.file);
    const text = await fs.readFile(path.join(FOLDER, pdf.textFile), 'utf8');
    if (!text.includes('30/05/2017 00:24 UTC') || !/Post-event image: Copernicus Sentinel-1B/.test(text)) throw new Error('Map acquisition evidence needs review: ' + pdf.file);
    const eeFlood = live.results.find(row => row.member === flood.member);
    const eeAoi = live.results.find(row => row.member === aoi.member);
    const verifiedZero = live.status === 'REFERENCE_INCOMPATIBLE' && eeFlood?.lowerKelaniAreaKm2 === 0 && eeAoi?.lowerKelaniAreaKm2 === 0;
    vectorSources.push({ file: pkg.file, sha256: pkg.sha256, map: pdf.file,
      sourceUrl: log.find(item => item.filename === pkg.file && item.ok)?.requestedUrl,
      status: verifiedZero ? 'REFERENCE_INCOMPATIBLE' : 'DATA_NOT_READY',
      sourceCrs: flood.crsAuthority, convertedCrs: flood.exportCrs,
      floodFeatureCount: flood.featureCount, invalidFloodFeatures: flood.invalidFeatures.length,
      duplicateFloodFeatures: flood.normalizedDuplicateGeometries,
      floodAreaInProductKm2: flood.unionAreaKm2, lowerKelaniFloodAreaKm2: eeFlood?.lowerKelaniAreaKm2 ?? null,
      lowerKelaniProductAoiAreaKm2: eeAoi?.lowerKelaniAreaKm2 ?? null,
      commonSarSupportIntersectionKm2: verifiedZero ? 0 : null,
      observation: { sensor: 'Sentinel-1B', sourcePrintedTime: '2017-05-30 00:24 UTC', precision: 'minute',
        // Minute interval expresses printed precision; seconds are not invented.
        ...temporalAudit('2017-05-30T00:24:00Z', '2017-05-30T00:24:59.999Z', phase5.scenes.later.acquiredAt),
        exactSourceSceneIdVerified: false },
      processing: 'Map states semi-automatic derivation from post-event imagery. Externally produced; shared Sentinel-1B sensor and acquisition minute imply potential common-image dependence. Exact source scene ID and algorithm independence are not fully documented.',
      positiveSemantics: 'interpret=Flooded Area, subtype=EM009 - Flood. Generic grading=Not Affected in two packages does not supply negative labels.',
      reliableNegativeLabelsVerified: false, assessmentFootprintVerified: false,
      unknownHandling: 'Product area_of_interest is not an assessed non-flood mask. General-information polygons include named locations and, in some products, Clouds/void areas; absent flood polygons remain unassessed for validation.',
      attributeAnomalies: flood.attributeValues.ext_date?.includes('3017-05-30') ? ['Source ext_date contains year 3017; retained verbatim. src_date and map imagery text identify 2017.'] : [],
      reasons: verifiedZero ? ['No flood polygon or product AOI intersects the Lower Kelani AOI; therefore no intersection with any SAR stage support.', 'Shared Sentinel-1B imagery prevents a sensor-independent ground-truth claim.', 'No verified negative labels/independent assessed footprint.'] : ['Spatial compatibility is not established.'] });
  }
  const categories = await json('nsdi-categories.json');
  if (categories.error || !Array.isArray(categories.features)) throw new Error('NSDI distinct-category query failed or changed schema.');
  const nsdiGeo = await json('nsdi-kelani-may2016.geojson');
  const inventory = { officialEntryPoints: SOURCES, products: vectorSources,
    nsdi: { status: 'REFERENCE_INCOMPATIBLE', categories: categories.features.map(f => f.attributes.layer_name_riskinfo),
      downloadedGeojson: 'nsdi-kelani-may2016.geojson', featureCount: nsdiGeo.features?.length ?? null,
      eventDate: 'May 2016 (category label only)', exactAcquisitionTime: null, crs: 'EPSG:4326 requested via outSR=4326',
      lowerKelaniIntersectionKm2: null, overlapStatus: 'Not evaluated: event-year mismatch independently disqualifies this source.',
      sensor: null, method: null, licenceVerified: false, attribution: 'Sri Lanka NSDI / SLNSDI Geo_Scientific_Information layer 6; metadata copyrightText is empty.',
      reasons: ['May 2016 cannot validate May 2017.', 'Other Kelani category names have no verified observation time, source sensor, assessment footprint or label semantics.', 'No explicit 2017 category was returned by the distinct-value query.'] },
    unspider: { status: 'DATA_NOT_READY', overviewImage: 'iwmi-overview.png', source: SOURCES[2].url,
      sourceObservationDate: '2017-05-28', sourceObservationTimeUtc: null, mapDate: '2017-05-29', sensor: 'TerraSAR-X (overview map)',
      eventPageAlsoMentions: ['TerraSAR-X May 28/30 comparison for Matara', 'RADARSAT-2 map for Gin Ganga/Galle', 'Sentinel-2 products'],
      dateMismatch: 'Overview observation is two calendar days before the May 30 SAR. Exact elapsed hours cannot be determined without the source acquisition time.',
      lowerKelaniIntersectionKm2: null, geometryCrs: null, assessmentFootprintVerified: false, reliableNegativeLabelsVerified: false,
      licenceVerified: false, attribution: 'IWMI/CGIAR; source data DLR / International Charter, distributed via UN-SPIDER. Confirm geodata reuse and sensor licensing with the provider.',
      reasons: ['Downloaded overview is a rendered multi-panel PNG without georeferencing or class labels. No reference pixels were digitized from its colours.',
        'May 29, 30 and 31 Drive folder requests redirect to Google sign-in; HTML is not geodata.',
        'The overview mentions Colombo/Gampaha totals, but these do not establish usable Lower Kelani geometries or observation support.'] } };
  const sources = ['scripts/acquire-phase6a-reference.js', 'scripts/audit-phase6a-geodata.py', 'scripts/check-phase6a-support.js',
    'scripts/run-phase6a-reference-audit.js', 'research/phase6a/validation.js', 'research/phase6a/requirements.txt',
    'services/hazardService.js', 'services/sarPixelQuality.js', 'services/sarPreviewService.js',
    'services/sarCandidateService.js', 'services/sarWaterReferenceService.js', 'services/sarFiltering.js',
    'services/ahpSarResearchService.js'];
  const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async file => [file, sha(await fs.readFile(path.join(ROOT, file)))])));
  const result = { status: 'DATA_NOT_READY', executedAt: new Date().toISOString(),
    scientificValidationExecuted: false, accuracyMetrics: null, confusionMatrix: null,
    researchQuestion: 'Can externally produced historical flood observations support independent evaluation of the unchanged May 2017 SAR candidates?',
    conclusion: 'All five acquired EMSR205 products are spatially incompatible. The remaining inspected sources do not provide qualified May 2017 Lower Kelani labels. No flood accuracy results are estimable.',
    inventory, acquisitionLog: 'acquisition-log.jsonl', geodataAudit: 'geodata-audit.json', liveSpatialAudit: 'earth-engine-support-audit.json', sourceHashes,
    aoiPlanarTopology: geo.aoiProvenance.planarValidityReason,
    aoiHandling: 'Saved Earth Engine AOI has a planar self-intersection under Shapely. It was not repaired. Disjoint bounding boxes independently establish zero overlap, confirmed by native Earth Engine intersection with the original live AOI.',
    nextActions: [
      'Use the UN-SPIDER linked May 29/30/31 IWMI folders in a signed-in browser. If unavailable, request historical May 2017 Lower Kelani TerraSAR-X/RADARSAT-2 flood vectors or a georeferenced classified raster from IWMI/DMC.',
      'Request the source image IDs and UTC acquisition times, observed footprint, no-data/cloud/shadow exclusions, positive-label semantics, any explicitly assessed negatives, mapping method, CRS/resolution and reuse licence.',
      'Confirm genuine overlap with the exact Lower Kelani AOI and SAR valid support. Approve a scientifically justified temporal comparison; retain different-date uncertainty.',
      'If only positive polygons qualify, evaluate positive-reference coverage only. Full TP/FP/FN/TN and precision/F1/IoU require verified non-flood labels and observation support.',
      'Preserve the exact scene pair, thresholds and stage-shared domains; do not tune filters on the eventual test reference.' ] };
  await fs.writeFile(path.join(FOLDER, 'reference-source-inventory.json'), JSON.stringify(inventory, null, 2));
  await fs.writeFile(path.join(FOLDER, 'phase6a-status.json'), JSON.stringify(result, null, 2));
  const header = 'product,status,flood_features,lower_kelani_flood_km2,lower_kelani_product_aoi_km2,sar_intersection_km2\n';
  await fs.writeFile(path.join(FOLDER, 'spatial-compatibility.csv'), header + vectorSources.map(p => [p.file, p.status, p.floodFeatureCount,
    p.lowerKelaniFloodAreaKm2, p.lowerKelaniProductAoiAreaKm2, p.commonSarSupportIntersectionKm2].join(',')).join('\n') + '\n');
  const report = ['# Phase 6A preliminary research summary', '', `Status: ${result.status}`, '', result.conclusion, '',
    'A real Earth Engine spatial compatibility audit confirmed 0 km² AOI and SAR support intersection for every EMSR205 flood layer and product AOI. This is source rejection evidence, not a flood accuracy measurement.', '',
    'All five maps state Sentinel-1B observation on 30 May 2017 at 00:24 UTC (minute precision). Our later observation is 00:24:30 UTC, inside that printed minute. Exact EMS source scene identity is unverified; shared-sensor/common-image dependence remains.', '',
    'The May 2016 NSDI category is rejected by event date. UN-SPIDER provides an IWMI TerraSAR-X map for 28 May, but its rendered PNG is not georeferenced validation data and all three day-folder links require sign-in. No qualified flood-negative assessment domain was found.', '',
    'No confusion matrix, precision, recall, F1 or IoU is reported. Software tests do not establish scientific validation. Production Function 1, Function 2, filtering parameters and mobile/web interfaces were not changed.', '',
    ...result.nextActions.map(step => '- ' + step), ''].join('\n');
  await fs.writeFile(path.join(FOLDER, 'preliminary-summary.md'), report);
  console.log(JSON.stringify({ status: result.status, scientificValidationExecuted: false,
    downloadedVectorPackages: vectorSources.length, spatiallyCompatibleProducts: vectorSources.filter(p => p.status !== 'REFERENCE_INCOMPATIBLE').length,
    output: FOLDER, conclusion: result.conclusion }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
