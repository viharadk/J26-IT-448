import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestRequest, normalizeQuery, parseCoordinates, parsePlaces } from '../src/search/locationSearch';
import { createPlaceSearch } from '../src/api/geocoding';

test('coordinate search accepts finite decimal degrees, zero, signed values and inclusive bounds', () => {
  assert.deepEqual(parseCoordinates(' 6.9553 ', '+79.9217'), { latitude: 6.9553, longitude: 79.9217 });
  assert.deepEqual(parseCoordinates('0', '0'), { latitude: 0, longitude: 0 });
  assert.deepEqual(parseCoordinates('-90', '180'), { latitude: -90, longitude: 180 });
  assert.deepEqual(parseCoordinates('90', '-180'), { latitude: 90, longitude: -180 });
  assert.deepEqual(parseCoordinates('-.5', '79.'), { latitude: -0.5, longitude: 79 });
});
test('coordinate search rejects blanks, non-decimal forms, nonfinite and out-of-range input', () => {
  assert.throws(() => parseCoordinates('', '79'), /enter latitude/);
  assert.throws(() => parseCoordinates('6', '  '), /enter longitude/);
  for (const invalid of ['NaN', 'Infinity', '1e999', '0x10', '6,955', '6.9north', '--1', '1 2']) {
    assert.throws(() => parseCoordinates(invalid, '79'), /finite number/);
    assert.throws(() => parseCoordinates('6', invalid), /finite number/);
  }
  assert.throws(() => parseCoordinates('90.001', '79'), /between -90 and 90/);
  assert.throws(() => parseCoordinates('6', '-180.001'), /between -180 and 180/);
});
test('place queries normalize whitespace and reject empty or excessive names', () => {
  assert.equal(normalizeQuery('  Kelaniya   Sri Lanka '), 'Kelaniya Sri Lanka');
  assert.throws(() => normalizeQuery(' '), /enter a location/);
  assert.throws(() => normalizeQuery('x'.repeat(161)), /160/);
});
test('place results preserve actual coordinates and ambiguity; malformed responses are rejected', () => {
  const places = [
    { id: '1', name: 'Kelaniya, Sri Lanka', latitude: 6.9553, longitude: 79.9217 },
    { id: '2', name: 'Kelaniya area', latitude: 6.96, longitude: 79.92 },
  ];
  assert.deepEqual(parsePlaces({ success: true, places }), places);
  assert.deepEqual(parsePlaces({ success: true, places: [] }), []);
  for (const invalid of [null, {}, { success: false, places }, { success: true, places: [{ ...places[0], latitude: '6.9' }] },
    { success: true, places: [{ ...places[0], longitude: 181 }] }, { success: true, places: [{ ...places[0], latitude: NaN }] }]) {
    assert.throws(() => parsePlaces(invalid));
  }
});
test('latest selection guards reject stale completion, errors and cleanup after new search or reset', async () => {
  const requests = createLatestRequest();
  const first = requests.start();
  let resolve!: (value: string) => void;
  let displayed = '';
  const oldTransport = new Promise<string>(done => { resolve = done; }).then(value => {
    if (first.isCurrent()) displayed = value;
  });
  const second = requests.start();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  displayed = 'new selection'; resolve('stale selection'); await oldTransport;
  assert.equal(displayed, 'new selection');
  requests.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(second.isCurrent(), false);
  assert.equal(requests.start().isCurrent(), true);
  requests.cancel();
});

test('place submission makes exactly one encoded proxy request and forwards cancellation', async () => {
  const controller = new AbortController();
  let calls = 0;
  const search = createPlaceSearch(async (path, signal, timeout) => {
    calls++;
    assert.equal(path, '/api/geocoding/search?q=Colombo%20%26%20Kelaniya');
    assert.equal(signal, controller.signal); assert.equal(timeout, 20000);
    return { success: true, places: [] };
  });
  await assert.rejects(search(' ', controller.signal));
  assert.equal(calls, 0);
  assert.deepEqual(await search(' Colombo & Kelaniya ', controller.signal), []);
  assert.equal(calls, 1);
});

test('proxy rate limits and provider outages give useful errors without fabricated results', async () => {
  for (const [status, message] of [[429, /temporarily limited/], [502, /use coordinates/]] as const) {
    const search = createPlaceSearch(async () => { throw new Error(`Backend returned HTTP ${status}.`); });
    await assert.rejects(search('Kelaniya', new AbortController().signal), message);
  }
});
