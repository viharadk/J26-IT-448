const { createSarPreviewService } = require('./sarPreviewService');
const { evaluatePair, finalizePair } = require('./sarPairs');
const { normalizeScene } = require('./sarMetadata');
const { parseReferenceMethod } = require('./sarWaterReferenceService');
const { parseFilters } = require('./sarFiltering');

const PRODUCT = /^COPERNICUS\/S1_GRD\/S1[AB]_IW_GRDH_1S(?:DV|SV)_\d{8}T\d{6}_\d{8}T\d{6}_\d{6}_[A-F0-9]{6}_[A-F0-9]{4}$/;
function invalid(message) { return Object.assign(new Error(message), { status: 400, code: 'SAR_SELECTION_INVALID' }); }
function parseSelection(query) {
  if (Object.keys(query).some(key => !['beforeSceneId', 'laterSceneId'].includes(key))) throw invalid('Only beforeSceneId and laterSceneId are accepted.');
  for (const key of ['beforeSceneId', 'laterSceneId']) {
    if (typeof query[key] !== 'string' || !PRODUCT.test(query[key])) throw invalid(`${key} must be a complete Sentinel-1A/B IW GRDH VV product asset ID.`);
  }
  const start = id => { const value = id.match(/_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})_/); return Date.parse(`${value[1]}-${value[2]}-${value[3]}T${value[4]}:${value[5]}:${value[6]}Z`); };
  const gap = start(query.laterSceneId) - start(query.beforeSceneId);
  if (!Number.isFinite(gap) || gap <= 0 || gap > 366 * 86400000) throw invalid('Select chronological observations separated by at most 366 days.');
  return { before: query.beforeSceneId, later: query.laterSceneId };
}
function validateSelectedQuality(quality) {
  const scene = metadata => normalizeScene({ sceneId: metadata.sceneId,
    sceneIndex: metadata.sceneId.split('/').pop(), acquisitionTimeMillis: Date.parse(metadata.acquiredAt),
    acquiredAt: metadata.acquiredAt, orbitDirection: metadata.orbitDirection, relativeOrbitNumber: metadata.relativeOrbitNumber,
    instrumentMode: metadata.instrumentMode, polarizations: metadata.polarizations,
    resolutionMeters: metadata.catalogueResolutionMeters, coveragePercent: metadata.footprintCoveragePercent });
  const pair = finalizePair(evaluatePair(scene(quality.scenes.before), scene(quality.scenes.later), 90), quality.common.jointFootprintCoveragePercent, 90);
  if (pair.status !== 'suitable' || !pair.sharedPolarizations.includes('VV') || pair.instrumentMode !== 'IW' ||
      Object.values(quality.scenes).some(metadata => metadata.catalogueResolutionMeters !== 10)) {
    throw Object.assign(new Error(`Selected pair cannot be compared: ${pair.reasons.join(' ')}`), { status: 422, code: 'SAR_PAIR_UNSUPPORTED' });
  }
  quality.pairAssessment = { ...pair, meaning: 'Metadata/pixel comparison only; flood conditions are not established.' };
  return quality;
}
function createSarSelectionService({ previewFactory = createSarPreviewService, analysisFactory, now = Date.now } = {}) {
  const entries = new Map(), pending = new Map();
  let active = null;
  async function run(selection, method, referenceMethod, filters) {
    const analysisKey = JSON.stringify([referenceMethod, filters]);
    const key = JSON.stringify(selection), request = `${key}:${method}:${analysisKey}`;
    if (pending.has(request)) return pending.get(request);
    if (active && active !== request) throw Object.assign(new Error('Another selected SAR operation is running. Retry shortly.'), { status: 429, code: 'SAR_SELECTION_BUSY' });
    active = request;
    const work = (async () => {
      let entry = entries.get(key);
      if (!entry || now() - entry.createdAt > 30 * 60000) {
        if (entries.size >= 4) entries.delete(entries.keys().next().value);
        const preview = previewFactory({ sceneIds: selection, validateQuality: validateSelectedQuality });
        entry = { preview, createdAt: now() }; entries.set(key, entry);
      }
      if (method === 'analysis') {
        if (!entry.analyses) entry.analyses = new Map();
        if (!entry.analyses.has(analysisKey)) {
          if (entry.analyses.size >= 8) entry.analyses.delete(entry.analyses.keys().next().value);
          entry.analyses.set(analysisKey, (analysisFactory || require('./sarCandidateService').createSarCandidateService)({ preview: entry.preview, selection, referenceMethod, filters }));
        }
        return entry.analyses.get(analysisKey).analyze();
      }
      return entry.preview[method]();
    })();
    pending.set(request, work);
    try { return await work; } finally { pending.delete(request); active = null; }
  }
  return { preview: selection => run(selection, 'preview'), pixelQuality: selection => run(selection, 'pixelQuality'),
    analyze: (selection, referenceMethod, filters) => run(selection, 'analysis', parseReferenceMethod(referenceMethod), parseFilters(filters)) };
}
module.exports = { parseSelection, validateSelectedQuality, createSarSelectionService };
