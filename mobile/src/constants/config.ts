// ---------------------------------------------------------------------------
// API and Sensor Configuration
// ---------------------------------------------------------------------------

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://192.168.8.178:3000';

/** Maximum measurable water level (sensor mounting height, in cm). */
export const SENSOR_HEIGHT_CM = 200;

// ---------------------------------------------------------------------------
// Pilot / demo risk thresholds — fallback used when backend omits thresholds
// ---------------------------------------------------------------------------
export type RiskLevel = 'NORMAL' | 'WATCH' | 'WARNING' | 'DANGER' | null;

export interface RiskThresholds {
  watch: number;   // % of sensor height
  warning: number;
  danger: number;
}

/** Default matches backend RISK_THRESHOLDS_PERCENT */
export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  watch: 40,
  warning: 60,
  danger: 80,
};

/** Compute risk level client-side from water level cm + sensor height cm. */
export function computeRiskLevel(
  waterLevelCm: number | null | undefined,
  sensorHeightCm: number,
  thresholds: RiskThresholds = DEFAULT_RISK_THRESHOLDS
): RiskLevel {
  if (typeof waterLevelCm !== 'number' || isNaN(waterLevelCm)) return null;
  const pct = (waterLevelCm / sensorHeightCm) * 100;
  if (pct >= thresholds.danger)  return 'DANGER';
  if (pct >= thresholds.warning) return 'WARNING';
  if (pct >= thresholds.watch)   return 'WATCH';
  return 'NORMAL';
}
