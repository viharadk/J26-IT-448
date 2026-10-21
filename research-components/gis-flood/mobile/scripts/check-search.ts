import assert from 'node:assert/strict';
import { searchPlaces } from '../src/api/geocoding';
import { inspectLocation, inspectionLabel } from '../src/api/flood';
import { parseCoordinates } from '../src/search/locationSearch';

async function main() {
  const signal = new AbortController().signal;
  // Opt-in user-triggered smoke check, never run automatically or as autocomplete.
  const places = await searchPlaces('Kelaniya', signal);
  assert.ok(places.length > 0, 'No real Kelaniya result returned');
  const place = places[0];
  assert.deepEqual(parseCoordinates(String(place.latitude), String(place.longitude)), { latitude: place.latitude, longitude: place.longitude });
  const inspection = await inspectLocation(place.latitude, place.longitude, signal);
  assert.equal(inspection.success, true);
  console.log('PASS mobile place proxy and inspection:', JSON.stringify({ place, result: inspectionLabel(inspection) }));
}
main().catch(error => { console.error('FAIL live search:', error.message); process.exitCode = 1; });
