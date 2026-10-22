import { FactorKey, Inspection } from '../api/flood';

// Field names and the chart's 0–5 scale follow the existing web panel.
export const FACTOR_DEFINITIONS = [
  { key: 'elevation', label: 'Elevation', measurement: 'elevationMeters', weightKey: 'elevation', unit: ' m' },
  { key: 'slope', label: 'Slope', measurement: 'slopeDegrees', weightKey: 'slope', unit: '°' },
  { key: 'distanceToWater', label: 'Water Proximity', measurement: 'distanceToWaterMeters', weightKey: 'waterDistance', unit: ' m' },
  { key: 'landcover', label: 'Land Cover', measurement: 'landcoverName', weightKey: 'landcover', unit: '' },
] as const;

export function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
export function formatValue(value: unknown, unit = ''): string {
  if (finiteNumber(value)) return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${unit}`;
  if (typeof value === 'string' && value.trim()) return `${value}${unit}`;
  return 'Unavailable';
}
export function formatWeight(value: unknown): string {
  return finiteNumber(value) ? `${(value * 100).toFixed(1)}%` : 'Unavailable';
}
export function formatBoolean(value: unknown): string {
  return value === true ? 'Yes' : value === false ? 'No' : 'Unavailable';
}
export function analysisState(data: Inspection): 'water' | 'land' | 'no-data' {
  if (data.isPermanentWater === true) return 'water';
  if (data.insideClassifiedArea && data.landHazardApplicable !== false &&
    finiteNumber(data.landHazardIndex ?? data.hazardIndex) && (data.landHazardClass ?? data.hazardClass)) return 'land';
  return 'no-data';
}
export function factorRows(data: Inspection) {
  return FACTOR_DEFINITIONS.map(definition => {
    const factor = data.factors?.[definition.key];
    const contribution = factor?.contribution;
    return {
      ...definition, factor,
      value: data.rawMeasurements?.[definition.measurement] ??
        (definition.key === 'landcover' ? factor?.category : factor?.value),
      methodologyWeight: data.ahp?.weights?.[definition.weightKey] ?? factor?.weight,
      // Visual scaling only; never recompute the contribution or hazard index.
      barWidth: finiteNumber(contribution) ? Math.max(0, Math.min(100, contribution / 5 * 100)) : 0,
    };
  });
}
export function largestContributor(data: Inspection): FactorKey | null {
  let largest: FactorKey | null = null;
  let maximum = -Infinity;
  for (const { key } of FACTOR_DEFINITIONS) {
    const value = data.factors?.[key]?.contribution;
    if (finiteNumber(value) && value > maximum) { largest = key; maximum = value; }
  }
  return largest;
}
