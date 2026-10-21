import { api } from './client';

export interface SarScene {
  sceneId: string; acquiredAt: string; platform: string; orbitDirection: string; relativeOrbitNumber: number;
  instrumentMode: string; polarizations: string[]; resolutionMeters: number; coveragePercent: number; timestampWarning: string | null;
}
export interface SarPair {
  beforeSceneId: string; duringSceneId: string; status: string; reasons: string[]; jointCoveragePercent: number | null; gapDays: number;
}
export interface SarDiscovery {
  success: true; periods: Record<'before' | 'flood', { scenes: SarScene[]; totalCount: number; truncated: boolean }>;
}
export interface SarPairs { success: true; candidatePairs: SarPair[]; rejectedPairs: SarPair[]; summary: { incomplete: boolean }; message: string }
export interface SarDates { beforeStart: string; beforeEnd: string; floodStart: string; floodEnd: string }
export const RESEARCH_DATES: SarDates = { beforeStart: '2017-05-20', beforeEnd: '2017-05-26', floodStart: '2017-05-26', floodEnd: '2017-06-02' };
export const RESEARCH_IDS = {
  before: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20170524T002512_20170524T002537_016716_01BC28_3CCB',
  later: 'COPERNICUS/S1_GRD/S1B_IW_GRDH_1SDV_20170530T002430_20170530T002501_005820_00A340_FB2A',
};
export interface SarLayer { label: string; tileUrl: string; visualization: { min: number; max: number; palette: string[] }; units: string; mask: string }
export interface SarQuality {
  scenes: Record<'before' | 'later', { sceneId: string; acquiredAt: string; platform: string; orbitDirection: string; relativeOrbitNumber: number; footprintCoveragePercent: number; validPixelCoveragePercent: number }>;
  studyArea: { center: [number, number]; rasterAreaKm2: number };
  common: { validPixelAreaKm2: number; validPixelCoveragePercent: number; jointFootprintCoveragePercent: number };
  alignment: { sameNativeGrid: boolean; caveat: string }; limitation: string;
  samples: { geometry: { coordinates: [number, number] } }[];
}
export interface SarPreview { success: true; generatedAt: string; renewAfterSeconds: number; quality: SarQuality; layers: Record<'before' | 'later' | 'change', SarLayer>; limitation: string }
export type SarReferenceMethod = 'yearly-conservative-v1' | 'yearly-monthly-dry-v1';
export interface SarFilters { terrainFilter: 'none' | 'slope-v1'; maxSlopeDegrees: number | null; clusterFilter: 'none' | 'connected-v1'; minConnectedPixels: number | null }
export interface SarFilterDraft { slopeEnabled: boolean; maxSlopeDegrees: string; clusterEnabled: boolean; minConnectedPixels: string }
export const INITIAL_FILTERS: SarFilterDraft = { slopeEnabled: false, maxSlopeDegrees: '5', clusterEnabled: false, minConnectedPixels: '8' };
export type SarCandidateStage = 'raw' | 'terrain' | 'final';
export interface SarFiltering {
  version: 'sar-filtering-v1'; configuration: SarFilters; referenceMethod: SarReferenceMethod;
  rawCandidateAreaKm2: number; afterSlopeAreaKm2: number; finalCandidateAreaKm2: number;
  slopeExcludedAreaKm2: number; clusterRemovedAreaKm2: number; clusterRemovedPixels: number;
  terrainNoDataCandidateAreaKm2: number | null; terrainNoDataSupportAreaKm2: number | null;
  commonSarSupportAreaKm2: number; referenceValidSupportAreaKm2: number;
}
export interface SarAnalysis {
  success: true; generatedAt: string; renewAfterSeconds?: number; label: string; layer: SarLayer;
  candidateCoordinates: [number, number][]; supportWarning: string;
  sceneIds: { before: string; later: string };
  areas: { validAnalysisAreaKm2: number; candidateAreaKm2: number; candidatePercentOfValid: number; excludedPermanentWaterAreaKm2: number; missingSarAreaKm2: number; ancillaryUnknownAreaKm2: number; smoothingEdgeExcludedAreaKm2: number; eligibleNonPermanentAreaKm2: number };
  methodology: { summary: string; waterReferenceYear: number; referenceMethod?: SarReferenceMethod; version?: string }; limitations: string[];
  waterReference?: { method?: SarReferenceMethod };
  filtering?: SarFiltering; layers?: Record<SarCandidateStage, SarLayer>;
}
export function filtersFromDraft(draft: SarFilterDraft): SarFilters {
  const threshold = (text: string, max: number, integer: boolean) => {
    const n = Number(text);
    if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(n) || n < 1 || n > max || (integer && !Number.isInteger(n))) throw new Error(`Enter ${integer ? 'whole pixels' : 'degrees'} from 1 to ${max}.`);
    return n;
  };
  return { terrainFilter: draft.slopeEnabled ? 'slope-v1' : 'none', maxSlopeDegrees: draft.slopeEnabled ? threshold(draft.maxSlopeDegrees, 45, false) : null,
    clusterFilter: draft.clusterEnabled ? 'connected-v1' : 'none', minConnectedPixels: draft.clusterEnabled ? threshold(draft.minConnectedPixels, 128, true) : null };
}
export function candidateLayer(analysis: SarAnalysis | null, stage: SarCandidateStage): SarLayer | undefined {
  return stage === 'raw' ? analysis?.layer : analysis?.layers?.[stage];
}
const object = (value: unknown): Record<string, any> => { if (!value || typeof value !== 'object') throw new Error('Unexpected SAR response.'); return value as Record<string, any>; };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function success(value: unknown) { const data = object(value); if (data.success !== true) throw new Error('SAR request did not succeed.'); return data; }
export function discoveryQuery(dates: SarDates): string {
  for (const value of Object.values(dates)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Enter valid YYYY-MM-DD dates. End dates are exclusive.');
    if (value < '2014-10-03' || value > '2100-01-01') throw new Error('Dates must be within Sentinel-1 discovery bounds (2014-10-03 to 2100-01-01).');
  }
  for (const [start, end] of [[dates.beforeStart, dates.beforeEnd], [dates.floodStart, dates.floodEnd]]) {
    const span = Date.parse(end) - Date.parse(start);
    if (span <= 0 || span > 93 * 86400000) throw new Error('Each window must contain 1–93 days. End dates are exclusive.');
  }
  if (dates.beforeEnd > dates.floodStart || Date.parse(dates.floodEnd) - Date.parse(dates.beforeStart) > 366 * 86400000) throw new Error('Use chronological, nonoverlapping windows within 366 days.');
  return Object.entries(dates).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}
export function parseDiscovery(value: unknown): SarDiscovery {
  const data = success(value);
  for (const key of ['before', 'flood']) {
    const period = object(object(data.periods)[key]);
    if (!Array.isArray(period.scenes) || period.scenes.length > 100 || !finite(period.totalCount) || typeof period.truncated !== 'boolean') throw new Error('Unexpected SAR scene list.');
    for (const item of period.scenes) {
      const s = object(item);
      if (typeof s.sceneId !== 'string' || !s.sceneId.startsWith('COPERNICUS/S1_GRD/') || typeof s.acquiredAt !== 'string' || !Number.isFinite(Date.parse(s.acquiredAt)) || !Array.isArray(s.polarizations)) throw new Error('Invalid SAR scene metadata.');
    }
  }
  return data as unknown as SarDiscovery;
}
export function parsePreview(value: unknown, before: string, later: string): SarPreview {
  const data = success(value), quality = object(data.quality), scenes = object(quality.scenes), common = object(quality.common), study = object(quality.studyArea);
  if (object(scenes.before).sceneId !== before || object(scenes.later).sceneId !== later) throw new Error('SAR preview does not match the selected pair.');
  if (!finite(common.validPixelAreaKm2) || common.validPixelAreaKm2 <= 0 || !finite(common.validPixelCoveragePercent) || common.validPixelCoveragePercent <= 0 || common.validPixelCoveragePercent > 100 || !validCoordinate(study.center)) throw new Error('SAR pixel coverage or map center is unavailable.');
  for (const key of ['before', 'later', 'change']) validateLayer(object(data.layers)[key]);
  if (typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt)) || !finite(data.renewAfterSeconds) || data.renewAfterSeconds <= 0) throw new Error('SAR preview expiry is unavailable.');
  return data as unknown as SarPreview;
}
function validCoordinate(point: unknown): point is [number, number] { return Array.isArray(point) && point.length === 2 && point.every(finite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90; }
export function validateLayer(value: unknown): SarLayer {
  const layer = object(value);
  if (typeof layer.tileUrl !== 'string') throw new Error('SAR tile URL is unavailable.');
  const url = new URL(layer.tileUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'earthengine.googleapis.com' || url.username || url.password || url.search || !['{x}', '{y}', '{z}'].every(key => layer.tileUrl.includes(key))) throw new Error('Invalid SAR tile URL.');
  if (!finite(layer.visualization?.min) || !finite(layer.visualization?.max) || !Array.isArray(layer.visualization?.palette)) throw new Error('SAR legend is unavailable.');
  return layer as SarLayer;
}
export function selectionQuery(before: string, later: string) { return `beforeSceneId=${encodeURIComponent(before)}&laterSceneId=${encodeURIComponent(later)}`; }
export async function discoverSar(dates: SarDates, signal?: AbortSignal) {
  const query = discoveryQuery(dates);
  // Sequential: discovery and footprint pairing share the backend's bounded worker.
  const scenes = parseDiscovery(await api.get(`/api/sar/scenes?${query}`, signal, 180000));
  const pairs = success(await api.get(`/api/sar/candidate-pairs?${query}&pairLimit=100`, signal, 180000));
  if (!Array.isArray(pairs.candidatePairs) || !Array.isArray(pairs.rejectedPairs) || typeof pairs.summary?.incomplete !== 'boolean') throw new Error('Unexpected SAR pair assessment.');
  return { scenes, pairs: pairs as unknown as SarPairs };
}
export async function previewSar(before: string, later: string, signal?: AbortSignal) {
  return parsePreview(await api.get(`/api/sar/selected-preview?${selectionQuery(before, later)}`, signal, 300000), before, later);
}
export function parseAnalysis(value: unknown, before: string, later: string): SarAnalysis {
  const data = success(value);
  validateLayer(data.layer);
  for (const key of ['validAnalysisAreaKm2', 'candidateAreaKm2', 'candidatePercentOfValid', 'excludedPermanentWaterAreaKm2', 'missingSarAreaKm2', 'ancillaryUnknownAreaKm2', 'smoothingEdgeExcludedAreaKm2', 'eligibleNonPermanentAreaKm2']) if (!finite(data.areas?.[key]) || data.areas[key] < 0) throw new Error('SAR area result is unavailable.');
  if (data.areas.validAnalysisAreaKm2 <= 0 || data.areas.candidateAreaKm2 > data.areas.eligibleNonPermanentAreaKm2 + 1e-6 || data.areas.eligibleNonPermanentAreaKm2 > data.areas.validAnalysisAreaKm2 + 1e-6 || data.areas.candidatePercentOfValid > 100 || Math.abs(data.areas.candidatePercentOfValid - data.areas.candidateAreaKm2 / data.areas.validAnalysisAreaKm2 * 100) > 1e-4 || data.label !== 'Experimental SAR-Derived Flood Candidates — Unvalidated' || !Array.isArray(data.limitations) || !Array.isArray(data.candidateCoordinates) || !data.candidateCoordinates.every(validCoordinate) || typeof data.supportWarning !== 'string') throw new Error('SAR candidate areas or support are inconsistent.');
  if (data.sceneIds?.before !== before || data.sceneIds?.later !== later) throw new Error('SAR analysis does not match the selected pair.');
  if (data.filtering !== undefined) {
    const f = object(data.filtering), config = object(f.configuration);
    if (f.version !== 'sar-filtering-v1' || !['yearly-conservative-v1', 'yearly-monthly-dry-v1'].includes(f.referenceMethod) ||
        !['none', 'slope-v1'].includes(config.terrainFilter) || !['none', 'connected-v1'].includes(config.clusterFilter)) throw new Error('Unsupported SAR filtering result.');
    const expected = filtersFromDraft({ slopeEnabled: config.terrainFilter === 'slope-v1', maxSlopeDegrees: String(config.maxSlopeDegrees),
      clusterEnabled: config.clusterFilter === 'connected-v1', minConnectedPixels: String(config.minConnectedPixels) });
    if (expected.maxSlopeDegrees !== config.maxSlopeDegrees || expected.minConnectedPixels !== config.minConnectedPixels) throw new Error('Invalid SAR filtering configuration.');
    for (const key of ['rawCandidateAreaKm2', 'afterSlopeAreaKm2', 'finalCandidateAreaKm2', 'slopeExcludedAreaKm2', 'clusterRemovedAreaKm2', 'clusterRemovedPixels', 'commonSarSupportAreaKm2', 'referenceValidSupportAreaKm2']) {
      if (!finite(f[key]) || f[key] < 0) throw new Error('SAR filtering area is unavailable.');
    }
    for (const key of ['terrainNoDataCandidateAreaKm2', 'terrainNoDataSupportAreaKm2']) {
      if (config.terrainFilter === 'none' ? f[key] !== null : !finite(f[key]) || f[key] < 0) throw new Error('SAR terrain no-data accounting is unavailable.');
    }
    const tolerance = 1e-6;
    if (!Number.isInteger(f.clusterRemovedPixels) || Math.abs(f.rawCandidateAreaKm2 - data.areas.candidateAreaKm2) > tolerance ||
        Math.abs(f.rawCandidateAreaKm2 - f.afterSlopeAreaKm2 - f.slopeExcludedAreaKm2 - (f.terrainNoDataCandidateAreaKm2 || 0)) > tolerance ||
        Math.abs(f.afterSlopeAreaKm2 - f.finalCandidateAreaKm2 - f.clusterRemovedAreaKm2) > tolerance ||
        Math.abs(f.referenceValidSupportAreaKm2 - data.areas.validAnalysisAreaKm2) > tolerance ||
        f.referenceValidSupportAreaKm2 > f.commonSarSupportAreaKm2 + tolerance ||
        f.terrainNoDataCandidateAreaKm2 > f.terrainNoDataSupportAreaKm2 + tolerance || f.terrainNoDataSupportAreaKm2 > f.referenceValidSupportAreaKm2 + tolerance ||
        (config.terrainFilter === 'none' && f.slopeExcludedAreaKm2 !== 0) ||
        (config.clusterFilter === 'none' && (f.clusterRemovedAreaKm2 !== 0 || f.clusterRemovedPixels !== 0))) throw new Error('SAR filtering stage accounting is inconsistent.');
    for (const stage of ['raw', 'terrain', 'final']) validateLayer(object(data.layers)[stage]);
    if (data.layers.raw.tileUrl !== data.layer.tileUrl) throw new Error('Raw SAR overlay was replaced.');
  }
  return data as unknown as SarAnalysis;
}
export function analysisQuery(before: string, later: string, filters?: SarFilters, referenceMethod: SarReferenceMethod = 'yearly-conservative-v1') {
  const query = new URLSearchParams();
  if (!['yearly-conservative-v1', 'yearly-monthly-dry-v1'].includes(referenceMethod)) throw new Error('Unsupported water reference method.');
  if (referenceMethod !== 'yearly-conservative-v1') query.set('referenceMethod', referenceMethod);
  if (filters) {
    if (!['none', 'slope-v1'].includes(filters.terrainFilter) || !['none', 'connected-v1'].includes(filters.clusterFilter)) throw new Error('Unsupported SAR filters.');
    filtersFromDraft({ slopeEnabled: filters.terrainFilter === 'slope-v1', maxSlopeDegrees: String(filters.maxSlopeDegrees), clusterEnabled: filters.clusterFilter === 'connected-v1', minConnectedPixels: String(filters.minConnectedPixels) });
    if (filters.terrainFilter !== 'none') { query.set('terrainFilter', filters.terrainFilter); query.set('maxSlopeDegrees', String(filters.maxSlopeDegrees)); }
    if (filters.clusterFilter !== 'none') { query.set('clusterFilter', filters.clusterFilter); query.set('minConnectedPixels', String(filters.minConnectedPixels)); }
  }
  // Expo 53's native URLSearchParams supports set/toString, but has no size
  // getter. Testing size silently discarded filters/reference on Android.
  const encoded = query.toString();
  return selectionQuery(before, later) + (encoded ? `&${encoded}` : '');
}
// Reconcile all supplied identities, including the known legacy methodology
// versions. Never infer a response's reference from the user's draft/default.
export function responseReferenceMethod(result: Pick<SarAnalysis, 'filtering' | 'methodology' | 'waterReference'>): SarReferenceMethod | null {
  const methods = [result.filtering?.referenceMethod, result.methodology?.referenceMethod, result.waterReference?.method];
  const version = result.methodology?.version;
  if (version === 'exploratory-v1') methods.push('yearly-conservative-v1');
  if (version === 'exploratory-v2-monthly-dry') methods.push('yearly-monthly-dry-v1');
  const present = methods.filter(value => value !== undefined);
  if (present.some(value => !['yearly-conservative-v1', 'yearly-monthly-dry-v1'].includes(value!))) {
    throw new Error('Unsupported SAR reference method metadata. Update the backend and retry.');
  }
  if (new Set(present).size > 1) throw new Error('Conflicting SAR reference method metadata. Results cannot be verified; update the backend and retry.');
  return present[0] ?? null;
}
export async function analyzeSar(before: string, later: string, signal?: AbortSignal, filters?: SarFilters, referenceMethod?: SarReferenceMethod): Promise<SarAnalysis> {
  const result = parseAnalysis(await api.get(`/api/sar/analysis?${analysisQuery(before, later, filters, referenceMethod)}`, signal, 300000), before, later);
  if (filters && (filters.terrainFilter !== 'none' || filters.clusterFilter !== 'none') && (!result.filtering ||
      Object.entries(filters).some(([key, value]) => result.filtering!.configuration[key as keyof SarFilters] !== value))) throw new Error('Backend did not apply the requested filters.');
  const effectiveReference = responseReferenceMethod(result);
  if (!effectiveReference) throw new Error('Unsupported SAR response: historical-water reference method cannot be verified. Update the backend and retry.');
  if (effectiveReference !== (referenceMethod || 'yearly-conservative-v1')) throw new Error('SAR reference method does not match the request.');
  return result;
}
export async function checkSarTile(layer: SarLayer, coordinate: [number, number], signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  validateLayer(layer);
  if (!validCoordinate(coordinate)) throw new Error('No valid SAR tile test location.');
  const z = 12, n = 2 ** z, x = Math.floor((coordinate[0] + 180) / 360 * n), y = Math.floor((1 - Math.asinh(Math.tan(coordinate[1] * Math.PI / 180)) / Math.PI) / 2 * n);
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 60000);
  try {
    const response = await fetcher(layer.tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), { signal: controller.signal });
    if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) throw new Error('SAR tile download failed. Refresh live maps / retry tiles.');
    const body = await response.arrayBuffer();
    if (body.byteLength < 8 || new Uint8Array(body)[0] !== 137) throw new Error('SAR tile response contains no PNG imagery. Refresh live maps.');
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Cannot retrieve a live SAR tile on this device. Check internet access and refresh live maps.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export function selectedPair(pairs: SarPairs | null, before: string, later: string) {
  return [...(pairs?.candidatePairs || []), ...(pairs?.rejectedPairs || [])].find(pair => pair.beforeSceneId === before && pair.duringSceneId === later);
}
