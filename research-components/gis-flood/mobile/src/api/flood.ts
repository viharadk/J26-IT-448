import { api } from './client';

export const INITIAL_REGION = { latitude: 6.895, longitude: 79.99, latitudeDelta: 0.28, longitudeDelta: 0.40 };
export const LEGEND = [
  ['Low', '#2CA25F'], ['Moderate', '#FFFF66'], ['High', '#FD8D3C'],
  ['Very High', '#BD0026'], ['Permanent Water', '#2166AC'],
] as const;
export interface HazardTiles { tileUrl: string; permanentWaterTileUrl: string }
export type FactorKey = 'elevation' | 'slope' | 'distanceToWater' | 'landcover';
export interface AhpFactor {
  value?: number | null;
  score?: number | null;
  weight?: number | null;
  weightPercentage?: number | null;
  contribution?: number | null;
  category?: string | null;
}
export interface Inspection {
  success: true;
  insideClassifiedArea: boolean;
  isPermanentWater: boolean | null;
  landHazardApplicable?: boolean;
  landHazardClass?: string | null;
  landHazardIndex?: number | null;
  hazardClass?: string | null;
  hazardIndex?: number | null;
  latitude?: number;
  longitude?: number;
  locationName?: string | null;
  message?: string;
  interpretation?: string;
  rawMeasurements?: {
    elevationMeters?: number | null;
    slopeDegrees?: number | null;
    distanceToWaterMeters?: number | null;
    landcoverCode?: number | null;
    landcoverName?: string | null;
  } | null;
  factors?: Partial<Record<FactorKey, AhpFactor | null>> | null;
  comparison?: {
    ahpIndex?: number | null;
    equalWeightIndex?: number | null;
    difference?: number | null;
    ahpHazardClass?: string | null;
    equalWeightHazardClass?: string | null;
    classificationChanged?: boolean | null;
  } | null;
  ahp?: {
    weights?: Partial<Record<'elevation' | 'slope' | 'waterDistance' | 'landcover', number | null>> | null;
    consistencyRatio?: number | null;
    consistencyAcceptable?: boolean | null;
    researchStatus?: string | null;
  } | null;
}

export function validateTileTemplate(value: unknown): string {
  if (typeof value !== 'string' || !['{z}', '{x}', '{y}'].every(token => value.includes(token))) {
    throw new Error('The backend returned an invalid XYZ tile template.');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Raster tiles require an HTTPS URL.');
  return value; // Preserve the backend map ID, XYZ order and any query token exactly.
}

export function sampleTileUrl(template: string): string {
  const zoom = 12;
  const count = 2 ** zoom;
  const latitude = INITIAL_REGION.latitude * Math.PI / 180;
  const x = Math.floor((INITIAL_REGION.longitude + 180) / 360 * count);
  const y = Math.floor((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * count);
  return template.replaceAll('{z}', String(zoom)).replaceAll('{x}', String(x)).replaceAll('{y}', String(y));
}

// UrlTile has no tile callbacks. Check one representative tile per overlay;
// success confirms URL reachability, not completion of every visible tile.
export async function checkRasterTiles(tiles: HazardTiles, signal: AbortSignal): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 20000);
  try {
    await Promise.all(Object.values(tiles).map(async template => {
      const response = await fetch(sampleTileUrl(template), { signal: controller.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('image/')) throw new Error('Raster tile download failed. Refresh layers to renew Earth Engine URLs.');
      await response.arrayBuffer();
    }));
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted) throw new Error('Raster tile check timed out. Check connectivity and refresh layers.');
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); }
}

export async function getHazardTiles(signal: AbortSignal): Promise<HazardTiles> {
  const data = await api.get('/api/flood/layers/hazard', signal, 120000) as { success?: boolean; layer?: Partial<HazardTiles> };
  if (data?.success !== true || !data.layer) throw new Error('Hazard tiles are unavailable.');
  return { tileUrl: validateTileTemplate(data.layer.tileUrl), permanentWaterTileUrl: validateTileTemplate(data.layer.permanentWaterTileUrl) };
}

export async function inspectLocation(latitude: number, longitude: number, signal: AbortSignal): Promise<Inspection> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Invalid coordinates.');
  const data = await api.get(`/api/flood/inspect?lat=${latitude}&lon=${longitude}`, signal, 60000) as Inspection;
  if (data?.success !== true || typeof data.insideClassifiedArea !== 'boolean' || ![true, false, null].includes(data.isPermanentWater)) throw new Error('Unexpected inspection response.');
  return data;
}

export function inspectionLabel(data: Inspection): string {
  if (data.isPermanentWater === true) return 'Permanent Water Body';
  const index = data.landHazardIndex ?? data.hazardIndex;
  const label = data.landHazardClass ?? data.hazardClass;
  if (!data.insideClassifiedArea || data.landHazardApplicable === false || typeof index !== 'number' || !Number.isFinite(index) || !label) return 'No Data — outside the study area or no valid raster data.';
  return `${label} hazard · Index ${index.toFixed(3)}`;
}
