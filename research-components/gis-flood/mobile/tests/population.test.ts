import test from 'node:test';
import assert from 'node:assert/strict';
import { createPopulationApi, parsePopulationExposure, PopulationExposure } from '../src/api/population';
import { createPopulationController, formatPopulationCount, formatPopulationPercent, populationAvailability } from '../src/population/exposure';

// Synthetic response follows the existing controller, not newly calculated
// mobile exposure. Values are test fixtures, never production defaults.
function response() {
  return { success: true, dataset: 'JRC/GHSL/P2023A/GHS_POP/2020', year: 2020, nativeResolutionMeters: 100,
    studyAreaPopulation: 1000, classifiedLandPopulation: 800, highAndVeryHighExposure: 400,
    highAndVeryHighPercentage: 40, unallocatedPopulation: 200,
    populationByHazardClass: [100, 300, 250, 150].map((population, i) => ({ classId: i + 1,
      hazardClass: ['Low', 'Moderate', 'High', 'Very High'][i], population,
      percentageOfStudyAreaPopulation: [10, 30, 25, 15][i],
      percentageOfClassifiedLandPopulation: [12.5, 37.5, 31.25, 18.75][i] })),
    methodology: { allocation: 'Backend area-weighted fractions', boundary: 'Boundary rasterization differences', zeroPopulation: 'Valid zero retained' },
    limitations: ['Estimated residential population, not confirmed affected people.'] };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('population request uses the real basin endpoint with no coordinate or invented query parameters', async () => {
  const controller = new AbortController(); let calls = 0;
  const load = createPopulationApi(async (path, signal, timeout) => {
    calls++; assert.equal(path, '/api/flood/exposure/population'); assert.equal(signal, controller.signal); assert.equal(timeout, 180000);
    return response();
  });
  assert.deepEqual(await load(controller.signal), response()); assert.equal(calls, 1);
});

test('population adapter retains both backend percentage denominators, aggregate totals and provenance', () => {
  const r = response(), data = parsePopulationExposure(r);
  assert.equal(data.populationByHazardClass[2].percentageOfStudyAreaPopulation, 25);
  assert.equal(data.populationByHazardClass[2].percentageOfClassifiedLandPopulation, 31.25);
  assert.equal(data.studyAreaPopulation, 1000); assert.equal(data.classifiedLandPopulation, 800);
  assert.equal(data.highAndVeryHighExposure, 400); assert.equal(data.highAndVeryHighPercentage, 40);
  assert.equal(data.unallocatedPopulation, 200); assert.equal(data.nativeResolutionMeters, 100);
  assert.equal(data.year, 2020); assert.deepEqual(data.methodology, r.methodology); assert.deepEqual(data.limitations, r.limitations);
  // Do not silently recalculate an upstream estimate or "fix" boundary totals.
  assert.equal(parsePopulationExposure({ ...r, highAndVeryHighExposure: 400.125 }).highAndVeryHighExposure, 400.125);
});

test('missing and null population values remain unavailable, not fabricated zeros or fallback class estimates', () => {
  const data = parsePopulationExposure({ success: true, studyAreaPopulation: null,
    populationByHazardClass: [{ classId: 3, hazardClass: 'High', population: null }] });
  assert.equal(data.studyAreaPopulation, null); assert.equal(data.classifiedLandPopulation, null);
  assert.equal(data.highAndVeryHighPercentage, null); assert.equal(data.unallocatedPopulation, null);
  assert.equal(data.populationByHazardClass.length, 1); assert.equal(data.populationByHazardClass[0].population, null);
  assert.equal(data.populationByHazardClass[0].percentageOfClassifiedLandPopulation, null);
  assert.equal(data.dataset, null); assert.equal(data.year, null); assert.equal(data.nativeResolutionMeters, null);
  assert.deepEqual(data.methodology, {}); assert.deepEqual(data.limitations, []);
  assert.equal(populationAvailability(data), 'empty');
});

test('invalid numeric values, unsuccessful responses and incompatible class encodings are rejected', () => {
  for (const value of [null, {}, { success: false }, { ...response(), studyAreaPopulation: '1000' },
    { ...response(), classifiedLandPopulation: -1 }, { ...response(), unallocatedPopulation: Infinity },
    { ...response(), populationByHazardClass: {} }, { ...response(), limitations: [5] },
    { ...response(), populationByHazardClass: [{ classId: 0, hazardClass: 'Low' }] },
    { ...response(), populationByHazardClass: [{ classId: 3, hazardClass: 'Low' }] },
    { ...response(), populationByHazardClass: [response().populationByHazardClass[0], response().populationByHazardClass[0]] }]) {
    assert.throws(() => parsePopulationExposure(value));
  }
});

test('counts preserve fractional estimates, readable groups, real zero and missing data distinctly', () => {
  assert.equal(formatPopulationCount(1234567.125), '1,234,567.13');
  assert.equal(formatPopulationCount(0), '0'); assert.equal(formatPopulationCount(0.004), '<0.01');
  for (const value of [null, undefined, NaN, Infinity, -1]) assert.equal(formatPopulationCount(value), 'Unavailable');
});

test('percent formatting uses returned percentages with the explicitly chosen population denominator', () => {
  const data = parsePopulationExposure(response()), row = data.populationByHazardClass[2];
  assert.equal(formatPopulationPercent(row.percentageOfStudyAreaPopulation, data.studyAreaPopulation), '25%');
  assert.equal(formatPopulationPercent(row.percentageOfClassifiedLandPopulation, data.classifiedLandPopulation), '31.25%');
  assert.equal(formatPopulationPercent(0, 1000), '0%'); assert.equal(formatPopulationPercent(0.001, 1000), '<0.01%');
  assert.equal(formatPopulationPercent(null, 1000), 'Unavailable');
  assert.equal(formatPopulationPercent(40, null), 'Unavailable (denominator missing)');
  assert.equal(formatPopulationPercent(0, 0), 'Not estimable (zero denominator)');
  assert.equal(formatPopulationPercent(75, 1000), '75%', 'Formatting must not derive another percentage');
});

test('zero population and absent estimates are different states, including no classified-land denominator', () => {
  const zero = parsePopulationExposure({ ...response(), studyAreaPopulation: 0, classifiedLandPopulation: 0,
    highAndVeryHighExposure: 0, highAndVeryHighPercentage: 0, unallocatedPopulation: 0,
    populationByHazardClass: response().populationByHazardClass.map(row => ({ ...row, population: 0, percentageOfStudyAreaPopulation: 0, percentageOfClassifiedLandPopulation: 0 })) });
  assert.equal(populationAvailability(zero), 'zero'); assert.equal(formatPopulationCount(zero.studyAreaPopulation), '0');
  assert.equal(formatPopulationPercent(zero.highAndVeryHighPercentage, zero.studyAreaPopulation), 'Not estimable (zero denominator)');
  const unallocated = parsePopulationExposure({ ...response(), classifiedLandPopulation: 0 });
  assert.equal(populationAvailability(unallocated), 'available');
  assert.equal(formatPopulationPercent(0, unallocated.classifiedLandPopulation), 'Not estimable (zero denominator)');
  assert.equal(populationAvailability(parsePopulationExposure({ success: true })), 'empty');
});

test('loading, error, retry and successful result states never substitute client estimates', async () => {
  const pending = deferred<PopulationExposure>(); let calls = 0;
  const store = createPopulationController(async () => { calls++; if (calls === 1) throw Error('Backend returned HTTP 502.'); return pending.promise; });
  const transitions: string[] = []; const off = store.subscribe(() => transitions.push(store.getSnapshot().status));
  assert.equal(store.getSnapshot().status, 'idle');
  await store.load(); assert.equal(store.getSnapshot().status, 'error'); assert.match(store.getSnapshot().error, /502/);
  assert.equal(store.getSnapshot().data, null);
  const retry = store.load(); assert.equal(store.getSnapshot().status, 'loading'); assert.equal(store.getSnapshot().error, '');
  const data = parsePopulationExposure(response()); pending.resolve(data); await retry;
  assert.equal(store.getSnapshot().data, data); assert.equal(store.getSnapshot().status, 'success');
  assert.deepEqual(transitions, ['loading', 'error', 'loading', 'success']); off(); store.dispose();
});

test('closing exposure cancels only its request, ignores late completion and permits reopening', async () => {
  const pending = deferred<PopulationExposure>(); let signal!: AbortSignal;
  const store = createPopulationController(async s => { signal = s; return pending.promise; });
  const load = store.load(); store.close(); const closed = store.getSnapshot();
  assert.equal(signal.aborted, true); assert.equal(closed.status, 'idle');
  pending.resolve(parsePopulationExposure(response())); await load; assert.equal(store.getSnapshot(), closed);
  await store.load(); assert.equal(store.getSnapshot().status, 'success');
  const retained = store.getSnapshot(); store.close(); assert.equal(store.getSnapshot(), retained);
});

test('loaded exposure results survive view unsubscribe, close and resubscribe without a request', async () => {
  const store = createPopulationController(async () => parsePopulationExposure(response()));
  const off = store.subscribe(() => {}); await store.load(); off();
  const saved = store.getSnapshot(); store.close(); const remount = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), saved); remount(); store.dispose();
});

test('overlapping retry, failed refresh and unmount cleanup protect the current exposure result', async () => {
  const old = deferred<PopulationExposure>(), fresh = parsePopulationExposure(response()); let calls = 0;
  const store = createPopulationController(async () => { calls++; if (calls === 1) return old.promise; if (calls === 3) throw Error('Offline'); return fresh; });
  const first = store.load(); await store.load(); const newest = store.getSnapshot(); old.reject(Error('Late failure')); await first;
  assert.equal(store.getSnapshot(), newest);
  await store.load(); assert.equal(store.getSnapshot().status, 'error'); assert.equal(store.getSnapshot().data, fresh);
  store.dispose(); const disposed = store.getSnapshot(); await store.load(); assert.equal(store.getSnapshot(), disposed);
});

test('unmount aborts pending exposure and blocks late transport updates to data or subscribers', async () => {
  const pending = deferred<PopulationExposure>(); let signal!: AbortSignal, notifications = 0;
  const store = createPopulationController(async s => { signal = s; return pending.promise; });
  store.subscribe(() => { notifications++; });
  const loading = store.load(); store.dispose(); const snapshot = store.getSnapshot(), count = notifications;
  pending.resolve(parsePopulationExposure(response())); await loading;
  assert.equal(signal.aborted, true); assert.equal(store.getSnapshot(), snapshot); assert.equal(notifications, count);
});
