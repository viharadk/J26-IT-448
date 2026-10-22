export interface SearchLocation { latitude: number; longitude: number; name?: string }
export interface Place extends SearchLocation { id: string; name: string }

function coordinate(input: string, label: string, maximum: number): number {
  const value = input.trim();
  if (!value) throw new Error(`Please enter ${label.toLowerCase()}.`);
  // Decimal degrees only: reject Number's empty/hexadecimal coercions.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) {
    throw new Error(`${label} must be a finite number in decimal degrees.`);
  }
  const number = Number(value);
  if (Math.abs(number) > maximum) throw new Error(`${label} must be between -${maximum} and ${maximum}.`);
  return number;
}
export function parseCoordinates(latitude: string, longitude: string): SearchLocation {
  return { latitude: coordinate(latitude, 'Latitude', 90), longitude: coordinate(longitude, 'Longitude', 180) };
}
export function normalizeQuery(input: string): string {
  const query = input.trim().replace(/\s+/g, ' ');
  if (!query) throw new Error('Please enter a location name.');
  if (query.length > 160) throw new Error('Use a location name of at most 160 characters.');
  return query;
}
export function parsePlaces(data: unknown): Place[] {
  const response = data as { success?: boolean; places?: unknown[] } | null;
  if (response?.success !== true || !Array.isArray(response.places)) throw new Error('Unexpected place search response.');
  return response.places.slice(0, 5).map(value => {
    const place = value as Place | null;
    if (!place || typeof place.id !== 'string' || typeof place.name !== 'string' || !place.name.trim() ||
      typeof place.latitude !== 'number' || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90 ||
      typeof place.longitude !== 'number' || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180) {
      throw new Error('Place search returned invalid coordinates.');
    }
    return { id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude };
  });
}

// Shared by search and inspection: cancellation plus identity guards also cover
// transports that complete after cancellation, and reset/unmount without a request.
export function createLatestRequest() {
  let current: AbortController | null = null;
  let version = 0;
  function cancel() { ++version; current?.abort(); current = null; }
  function start() {
    cancel();
    const id = version;
    const controller = new AbortController();
    current = controller;
    return { signal: controller.signal, isCurrent: () => version === id && !controller.signal.aborted };
  }
  return { start, cancel };
}
