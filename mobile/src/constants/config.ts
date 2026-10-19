// ---------------------------------------------------------------------------
// API and Sensor Configuration
// ---------------------------------------------------------------------------

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://192.168.8.178:3000';

/** Maximum measurable water level (sensor mounting height, in cm). */
export const SENSOR_HEIGHT_CM = 200;
