const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { FOLDER, SOURCES, LINKED } = require('./acquire-phase6b-reference');
const { classifyCombination, calendarWindowContains, verifySupportAreas, frozenParameters } = require('../research/phase6b/feasibility');
const ROOT = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFile(path.join(FOLDER, file), 'utf8');
async function json(file) { return JSON.parse(await read(file)); }
const quote = value => value === null || value === undefined ? '' : `"${String(value).replaceAll('"', '""')}"`;
function csv(rows, fields) { return fields.join(',') + '\n' + rows.map(row => fields.map(field => quote(row[field])).join(',')).join('\n') + '\n'; }

async function main() {
  const discovery = await json('sar-discovery.json'), geometry = await json('reference-geodata-audit.json'), support = await json('spatial-support.json');
  if (discovery.status !== 'completed' || discovery.incomplete || support.status !== 'FEASIBILITY_SUPPORT_COMPLETED') throw new Error('Complete live discovery and support results are required; do not substitute missing values.');
  const log = (await read('acquisition-log.jsonl')).trim().split('\n').map(JSON.parse);
  const phase5File = 'artifacts/ahp-sar-phase5a-2026-10-20T15-21-49-034Z/results.json';
  const phase5 = JSON.parse(await fs.readFile(path.join(ROOT, phase5File), 'utf8'));
  const productionFiles = ['services/hazardService.js', 'services/ahpService.js', 'services/sarCandidateService.js',
    'services/sarWaterReferenceService.js', 'services/sarFiltering.js', 'services/sarPreviewService.js', 'services/ahpSarResearchService.js'];
  const productionIntegrity = [];
  for (const file of productionFiles) {
    const hash = sha(await fs.readFile(path.join(ROOT, file)));
    const matches = hash === phase5.reproducibility.sourceHashes[file];
    productionIntegrity.push({ file, sha256: hash, matchesPriorCompletedResearch: matches });
    if (!matches) throw new Error('Frozen production/research source changed; repeat compatibility review: ' + file);
  }
  if (support.reference.sha256 !== geometry.nsdi.validSubsetSha256 || sha(await fs.readFile(path.join(FOLDER, geometry.nsdi.validSubsetFile))) !== geometry.nsdi.validSubsetSha256) throw new Error('Supported NSDI subset does not match the geometry audit.');
  const nsdi = { id: 'nsdi-2016', eventYear: 2016, file: geometry.nsdi.sourceFile,
    sourceUrl: 'https://gisapps.nsdi.gov.lk/server/rest/services/SLNSDI/Geo_Scientific_Information/MapServer/6',
    geometryAcquired: true, geometryAndCrsQualified: false, positiveLabelsVerified: false, provenanceVerified: false,
    observationTimeVerified: false, temporalComparisonApproved: false, observationInstantUtc: null,
    externalMethodIndependenceVerified: false, licenceVerified: false, negativeLabelsVerified: false, observationFootprintVerified: false,
    sourceCrs: geometry.nsdi.sourceCrs, originalResolution: null, originalFeatureCount: geometry.nsdi.originalFeatureCount,
    validGeometrySubsetCount: geometry.nsdi.validGeometryFeatures, invalidFeatures: geometry.nsdi.invalidFeatures,
    referenceGeometryAreaInsideAoiKm2: support.spatialReferenceAudit.validNsdiSubsetInsideAoiKm2,
    referenceAreaMeaning: '45-feature valid-geometry diagnostic subset; not qualified flood observations. Invalid feature 48912 excluded explicitly without repair.',
    sourceMethod: null, sourceObservationDate: 'Category says May 2016; exact dates/times unknown.',
    attribution: 'Sri Lanka NSDI, SLNSDI Geo_Scientific_Information layer 6. Licence and original data lineage unverified.',
    status: 'DATA_NOT_READY' };
  const maps = [];
  for (const pdf of geometry.surveyPdfs) {
    const bytes = await fs.readFile(path.join(FOLDER, pdf.file));
    if (sha(bytes) !== pdf.sha256) throw new Error('Audited PDF changed: ' + pdf.file);
    const text = await read(pdf.file.replace('.pdf', '.txt'));
    const kelani = pdf.file.includes('kelaniya');
    const pattern = kelani ? /23rd May\s*-\s*02nd June 2016/ : /23rd May\s*-\s*14th June 2016/;
    if (!pattern.test(text)) throw new Error('Survey field-date evidence changed; inspect original map: ' + pdf.file);
    const notes = text.slice(text.lastIndexOf('This map'));
    maps.push({ id: kelani ? 'survey-kelaniya-pdf' : 'survey-gampaha-pdf', file: pdf.file, eventYear: 2016,
      sourceUrl: LINKED.find(item => item.filename === pdf.file).url,
      collectionStartCalendarDate: '2016-05-23', collectionEndCalendarDate: kelani ? '2016-06-02' : '2016-06-14',
      observationTimeMeaning: 'Field collection interval, not a verified instantaneous or per-feature inundation observation.',
      rawMapNotes: notes, publicationAnomaly: kelani ? 'Map prints 03rd May 2016, before collection. Filename is June_03. Neither date has been silently corrected.' : null,
      geometryAcquired: false, geometryAndCrsQualified: false, positiveLabelsVerified: false,
      georeferencedPdfAcquired: true, namedFloodAreaLayerPresent: pdf.hasFloodAreaLayer, floodPolygonsExtracted: false,
      sourceCrs: pdf.viewports.map(v => v.sourceCrsAuthority), nativeResolutionMeters: null, cartographicScale: pdf.mapScale,
      coordinateUncertainty: pdf.viewports.map(v => ({ transformation: v.datumTransformation, accuracyMeters: v.datumTransformationAccuracyMeters })),
      cartographicExtentAoiKm2: support.spatialReferenceAudit[`${pdf.file}_cartographicExtentInsideAoiKm2`],
      footprintMeaning: 'Map viewport only, not assessed reference support or negative labels.',
      provenanceVerified: false, observationTimeVerified: false, temporalComparisonApproved: false, observationInstantUtc: null,
      externalMethodIndependenceVerified: false, sensorIndependent: null, licenceVerified: false, negativeLabelsVerified: false, observationFootprintVerified: false,
      fieldMethodEvidence: kelani ? 'PDF credits Hydrographic Survey Unit, Sri Lanka Navy; GIS Branch, Survey Department. Field verification is still in progress.' : 'PDF credits Survey Department and Hydrographic Survey Unit, Sri Lanka Navy; GIS Branch preparation. Field verification is still in progress.',
      independenceAssessment: 'Field-based source is potentially independent of SAR; per-feature method, water-state meaning, data lineage and provider confirmation are missing. Do not transfer this method to NSDI.',
      kmlAcquired: false,
      kmlManualUrl: kelani ? 'https://drive.google.com/file/d/0BwtHKWY5sCyVZzViVEdNTXZvekE/view' : 'https://drive.google.com/file/d/0BwtHKWY5sCyVUGNHZmZjVEotSkE/view',
      kmlAccessEvidence: log.filter(item => item.requestedUrl.includes(kelani ? '0BwtHKWY5sCyVZzViVEdNTXZvekE' : '0BwtHKWY5sCyVUGNHZmZjVEotSkE')).map(item => ({ requestedUrl: item.requestedUrl, resolvedUrl: item.resolvedUrl, status: item.status, contentType: item.contentType, datasetAcquisitionStatus: item.datasetAcquisitionStatus, filename: item.filename })),
      attribution: 'Survey Department of Sri Lanka / Sri Lanka Navy as printed; underlying geodata reuse licence not confirmed.',
      status: kelani ? 'DATA_NOT_READY' : 'REFERENCE_INCOMPATIBLE',
      statusMeaning: kelani ? 'Georeferencing and map notes acquired, but no qualified dated flood labels.' : 'The acquired Attanagalu map viewport has zero AOI overlap. Unacquired KML extent is not independently known.' });
  }
  const annual = await json('irrigation-event-extract.json');
  if (sha(await fs.readFile(path.join(FOLDER, annual.file))) !== annual.sha256) throw new Error('Hydrological evidence checksum changed.');
  const eventPage = annual.pages.find(page => page.pdfPageIndex === 85);
  if (!eventPage?.text.includes('Nagalagam') || !eventPage.text.includes('18hr22nd')) throw new Error('Documented flood-stage evidence needs reinspection.');
  const hydrology = { sourceUrl: LINKED.find(x => x.filename === annual.file).url, file: annual.file,
    actualArticle: 'Hydrological Report on Kelani River flood in May 2016, inside a 2014/15-titled annual.',
    evidencePdfPageIndex: 85, printedPage: 82, table: 4, majorStageEnd: '21 May 2016, 13 hr as printed', minorStageEnd: '22 May 2016, 18 hr as printed',
    timezone: 'Not explicitly verified; no conversion to UTC or exact elapsed hours is made.',
    interpretation: 'May 29 is after documented Nagalagam flood-stage periods. It is a post-peak/recession/residual-water inquiry, not a verified active/peak-flood observation or proof of dry land.' };
  const references = [nsdi, ...maps];
  const combinations = [], pairRows = [];
  for (const [index, pair] of discovery.pairs.entries()) {
    const supportPair = support.pairs.find(p => p.selection.before === pair.beforeSceneId && p.selection.later === pair.duringSceneId);
    pairRows.push({ id: index + 1, ...pair, reasons: pair.reasons.join(' | '),
      eventTiming: pair.duringAcquiredAt?.slice(0, 10) === '2016-05-29' ? 'Post-peak/recession candidate; active flood at SAR time unverified.' : 'May 22 event/recession inquiry; no compatible baseline and timestamp conflict preserved.' });
    if (supportPair) {
      if (supportPair.status !== 'SUPPORT_MEASURED_REFERENCE_NOT_QUALIFIED' || supportPair.policies.length !== 2) throw new Error('Incomplete pair support: ' + pair.beforeSceneId);
      for (const policy of supportPair.policies) verifySupportAreas(policy.areasKm2);
      const first = supportPair.policies[0].areasKm2, second = supportPair.policies[1].areasKm2;
      for (const key of ['identicalCrossPolicyDomain', 'referenceInsideIdenticalCrossPolicyDomain']) if (Math.abs(first[key] - second[key]) > 1e-6) throw new Error('Cross-policy domain accounting differs: ' + key);
    }
    for (const reference of references) for (const method of ['yearly-conservative-v1', 'yearly-monthly-dry-v1']) {
      const policy = supportPair?.policies.find(p => p.method === method);
      const refAoi = reference.id === 'nsdi-2016' ? nsdi.referenceGeometryAreaInsideAoiKm2 : reference.cartographicExtentAoiKm2;
      const refSar = reference.id === 'nsdi-2016' ? policy?.areasKm2.referenceInsideStageSharedDomain ?? null : null;
      const qualification = classifyCombination({ pair, reference, overlap: { referenceAoiKm2: refAoi, referenceSarSupportKm2: refSar } });
      combinations.push({ pairId: index + 1, beforeSceneId: pair.beforeSceneId, laterSceneId: pair.duringSceneId,
        beforeAcquiredAt: pair.beforeAcquiredAt, laterAcquiredAt: pair.duringAcquiredAt, referenceId: reference.id, referenceMethod: method,
        pairMetadataStatus: pair.status, qualificationStatus: qualification.status, qualificationReasons: qualification.reasons,
        referenceAoiEvidenceKm2: refAoi, referenceAoiEvidenceMeaning: reference.id === 'nsdi-2016' ? nsdi.referenceAreaMeaning : reference.footprintMeaning,
        referenceInsideActualCommonSarKm2: reference.id === 'nsdi-2016' ? policy?.areasKm2.referenceInsideCommonSar ?? null : null,
        referenceInsideSupportedDomainKm2: refSar,
        referenceInsideIdenticalCrossPolicyDomainKm2: reference.id === 'nsdi-2016' ? policy?.areasKm2.referenceInsideIdenticalCrossPolicyDomain ?? null : null,
        domainKind: 'Raw/terrain/final would share known-terrain eligible support. No candidate responses were evaluated.',
        calendarCollectionContainsLater: reference.collectionStartCalendarDate ? calendarWindowContains(reference.collectionStartCalendarDate, reference.collectionEndCalendarDate, pair.duringAcquiredAt) : null,
        observationOffsetHours: qualification.deltaHours ?? null,
        temporalMeaning: 'Unknown per-feature reference observation time. A calendar collection window containing SAR is not same-date flood truth.',
        accuracyMetrics: null, scientificValidationExecuted: false });
    }
  }
  const sceneRows = Object.entries(discovery.discovery.periods).flatMap(([period, p]) => p.scenes.map(s => ({ period, ...s,
    polarizations: s.polarizations.join('+'), chronologicalMeaning: period === 'before' ? 'Candidate baseline; dry land unverified' : 'Event/recession discovery; flooding unverified' })));
  const dmc = await read('dmc-reports.html');
  const dmcRows = [...dmc.matchAll(/<tr class="rowdate_[01]">([\s\S]*?)<\/tr>/g)].map(match => {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
    return { title: cells[0], listedDate: cells[1], listedTime: cells[2], downloadUrl: match[1].match(/href="([^"]+)"/)?.[1] };
  });
  const followupLog = log.filter(item => /iwmi-may30-2017|unspider-2017|dmc-search-2017/.test(item.filename));
  const result = { status: 'DATA_NOT_READY', executedAt: new Date().toISOString(), scientificValidationExecuted: false,
    accuracyMetrics: null, confusionMatrix: null,
    question: 'Can a dated, geographically compatible independent flood reference and SAR pair support historical Lower Kelani validation?',
    priorDocumentation: { removedAtUserRequest: ['PHASE5A_AHP_SAR_RESEARCH.md', 'PHASE6A_REFERENCE_DATA_AUDIT.md'],
      inspectedInstead: [phase5File, 'artifacts/ahp-sar-phase5a-2026-10-20T15-21-49-034Z/report.md', 'artifacts/phase6a-reference-acquisition/preliminary-summary.md', 'artifacts/phase6a-reference-acquisition/phase6a-status.json'] },
    conclusion: 'Spatial feasibility is established for a diagnostic subset of 2016 NSDI geometry, but reliable dated labels are not qualified. Available matched pairs end May 29, after documented flood-stage periods. No reference/pair combination is ready for independent event-date accuracy validation.',
    frozenParameters: frozenParameters(), productionIntegrity,
    search: { window: '[2016-04-01, 2016-07-01)', periods: Object.fromEntries(Object.entries(discovery.discovery.periods).map(([name, p]) => [name, { start: p.start, endExclusive: p.endExclusive, totalCount: p.totalCount, truncated: p.truncated }])),
      scenes: sceneRows, allPairComparisons: pairRows, discoveryIncomplete: discovery.incomplete,
      compatiblePairs: discovery.pairs.filter(p => p.status === 'suitable').length, minimumFootprintCoveragePercent: 90,
      externalTimestampAudit: discovery.externalTimestampAudit || null,
      caution: 'VV is shared. VH was not available for these matched single-polarization acquisitions. Suitable means metadata/footprint only. External catalogue timing is retained separately; it does not create an ascending/orbit-100 baseline or overwrite Earth Engine metadata.' },
    references, hydrology, spatialSupport: support,
    combinations, readinessCounts: Object.fromEntries([...new Set(combinations.map(c => c.qualificationStatus))].map(status => [status, combinations.filter(c => c.qualificationStatus === status).length])),
    dmcAudit: { sourceUrl: SOURCES[1].url, listedRecords: dmcRows,
      listedDate2016Count: dmcRows.filter(row => row.listedDate?.startsWith('2016')).length,
      keyword2016NoResults: (await read('dmc-search-2016.html')).includes('No Result Found.'),
      keywordKelaniNoResults: (await read('dmc-search-kelani.html')).includes('No Result Found.'),
      note: 'The queried inundation-map listing and keyword searches yielded no usable 2016 Lower Kelani geodata. The title North Western Province links a September-2016-named file with a 2017 listed date; neither filename nor listed date establishes source observation time. This is not proof that the DMC archive has no other data.' },
    followup2017: { status: 'DATA_NOT_READY', acquisitionRecords: followupLog, georeferencedLabelsAcquired: false,
      nextAction: 'Request original Lower Kelani georeferenced 2017 flood extents, source image UTC times, observed footprint/no-data and licence from IWMI/DMC. The rechecked May 30 folder returns sign-in HTML; no provider message was sent.' },
    limitations: ['No verified non-flood labels or assessed observation footprint.', 'NSDI per-feature observation time, method, event semantics and licence remain unverified.',
      'One invalid source polygon was excluded transparently for geometry-only feasibility; no geometry repair was made.',
      'Survey collection spans multiple days; the printed Kelaniya publication date is inconsistent. Interval inclusion cannot establish event-date compatibility.',
      'Georeferenced PDF frame is not observation support or a validated flood polygon mask; KML acquisition is blocked by sign-in.',
      'May 29 is a late/recession observation; hydrological stage timing is not proof of pixel-level dry or flooded states.',
      'Raster/vector discretization and geographic boundary weighting differ. Report their measured areas separately.',
      'Historical reference policies change support denominators; larger support is not greater accuracy.',
      'Passing tests and spatial overlap do not establish scientific validation or verified flood prediction accuracy.'] };
  if (combinations.some(row => row.qualificationStatus === 'READY_FOR_LIMITED_VALIDATION')) throw new Error('A reference now qualifies; run a separately reviewed frozen-parameter evaluation before concluding this feasibility phase.');
  const sourceFiles = ['scripts/acquire-phase6b-reference.js', 'scripts/discover-phase6b-sar.js', 'scripts/audit-phase6b-geodata.py',
    'scripts/check-phase6b-support.js', 'scripts/run-phase6b-feasibility.js', 'research/phase6b/feasibility.js'];
  result.sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await fs.readFile(path.join(ROOT, file)))])));
  result.evidenceHashes = Object.fromEntries(await Promise.all(['sar-discovery.json', 'spatial-support.json', 'reference-geodata-audit.json', 'nsdi-reuse-provenance.json', 'acquisition-log.jsonl'].map(async file => [file, sha(await fs.readFile(path.join(FOLDER, file)))])));
  await fs.writeFile(path.join(FOLDER, 'reference-inventory.json'), JSON.stringify({ references, dmc: result.dmcAudit, followup2017: result.followup2017 }, null, 2));
  await fs.writeFile(path.join(FOLDER, 'feasibility-results.json'), JSON.stringify(result, null, 2));
  await fs.writeFile(path.join(FOLDER, 'sar-scenes.csv'), csv(sceneRows, ['period', 'sceneId', 'acquiredAt', 'productStartUtcFromId', 'timestampDifferenceSeconds', 'timestampWarning', 'platform', 'orbitDirection', 'relativeOrbitNumber', 'polarizations', 'coveragePercent']));
  await fs.writeFile(path.join(FOLDER, 'candidate-pair-compatibility.csv'), csv(pairRows, ['id', 'beforeSceneId', 'duringSceneId', 'beforeAcquiredAt', 'duringAcquiredAt', 'orbitDirection', 'relativeOrbitNumber', 'sharedPolarizations', 'gapDays', 'jointCoveragePercent', 'status', 'reasons', 'eventTiming']));
  await fs.writeFile(path.join(FOLDER, 'geographic-temporal-combinations.csv'), csv(combinations.map(c => ({ ...c, qualificationReasons: c.qualificationReasons.join(' | ') })),
    ['pairId', 'beforeAcquiredAt', 'laterAcquiredAt', 'referenceId', 'referenceMethod', 'pairMetadataStatus', 'qualificationStatus', 'referenceAoiEvidenceKm2',
      'referenceAoiEvidenceMeaning', 'referenceInsideActualCommonSarKm2', 'referenceInsideSupportedDomainKm2', 'referenceInsideIdenticalCrossPolicyDomainKm2',
      'calendarCollectionContainsLater', 'observationOffsetHours', 'qualificationReasons']));
  const summary = `Phase 6B status: DATA_NOT_READY.\n\nFresh authenticated discovery found ${sceneRows.length} intersecting April-May 2016 scenes and no June scenes in the queried COPERNICUS/S1_GRD archive/AOI. Two descending-orbit-19, shared-VV pairs pass metadata/footprint screening, ending May 29; no suitable matched active/peak-flood pair was established. The 45 valid NSDI polygons overlap the original AOI by ${nsdi.referenceGeometryAreaInsideAoiKm2.toFixed(6)} km2, but their exact observation dates, source method, provenance and label semantics remain unqualified; one source feature is invalid. Survey Kelaniya data is potentially useful field-based evidence, but its multiday collection interval, inconsistent publication date and inaccessible KML prevent qualification. The Gampaha PDF maps Attanagalu and its georeferenced frame does not overlap the AOI. All ${combinations.length} checked combinations remain not ready or incompatible; no confusion matrix or accuracy metrics were calculated. Original SAR/AHP algorithms and parameters were preserved.\n`;
  await fs.writeFile(path.join(FOLDER, 'pp1-summary.txt'), summary);
  console.log(JSON.stringify({ status: result.status, scientificValidationExecuted: false, scenes: sceneRows.length, pairs: pairRows.length,
    compatiblePairs: result.search.compatiblePairs, combinations: combinations.length, readinessCounts: result.readinessCounts,
    productionSourceChanges: result.productionIntegrity.filter(p => !p.matchesPriorCompletedResearch).length, output: FOLDER }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
