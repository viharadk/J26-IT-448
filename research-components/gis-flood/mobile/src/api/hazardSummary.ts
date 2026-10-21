import { api } from './client';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
export function parseHazardSummary(value: unknown) {
  const data = object(value);
  if (data.success !== true) throw new Error('Unexpected study-area hazard response.');
  const rows = Array.isArray(data.hazardSummary) ? data.hazardSummary.map(object) : [];
  const statistics = object(data.areaStatistics), methodology = object(data.methodology);
  const denominator = text(statistics.percentagesDenominator);
  const classifiedArea = number(data.analyzedLandAreaKm2);
  return {
    rows: ['Low', 'Moderate', 'High', 'Very High'].map((label, index) => {
      const matches = rows.filter(row => row.classId === index + 1 && row.hazardClass === label);
      const row = matches.length === 1 ? matches[0] : {};
      const percentage = number(row.percentage);
      return { label, area: number(row.areaKm2), percentage: denominator === 'analyzed classified land area' && classifiedArea !== null && classifiedArea > 0 && percentage !== null && percentage <= 100 ? percentage : null };
    }),
    denominator,
    areas: { 'Study AOI': number(data.studyAreaKm2), 'Analyzed classified land': number(data.analyzedLandAreaKm2), 'Permanent water': number(data.permanentWaterAreaKm2), 'No-data area': number(data.noDataAreaKm2) },
    scale: number(statistics.scaleMeters), reconciliation: text(statistics.reconciliationNote),
    method: text(methodology.name), status: text(data.status), weightStatus: text(methodology.weightStatus), note: text(data.note),
    datasets: Object.entries(object(data.datasets)).flatMap(([key, value]) => text(value) ? [`${key}: ${text(value)}`] : []),
  };
}
export type HazardSummary = ReturnType<typeof parseHazardSummary>;
export async function getHazardSummary(signal?: AbortSignal): Promise<HazardSummary> {
  return parseHazardSummary(await api.get('/api/flood/hazard', signal, 180000));
}
export function areaLabel(value: number | null) { return value === null ? 'Unavailable' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} km²`; }
export function percentageLabel(value: number | null) { return value === null ? 'Unavailable' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`; }
