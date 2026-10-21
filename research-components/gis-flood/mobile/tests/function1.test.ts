import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionStore } from '../src/function1/selection';
import { areaLabel, getHazardSummary, parseHazardSummary, percentageLabel } from '../src/api/hazardSummary';
import { api } from '../src/api/client';
const point = { latitude: 6.95, longitude: 79.92, name: 'Kelaniya' };
const result = { success: true, insideClassifiedArea: true, isPermanentWater: false } as any;
test('direct entry has no invented point; loading, inspection parameters, error and retry preserve selection', async () => {
  let calls = 0;
  const store = createSelectionStore(async (lat, lon, signal) => {
    assert.equal(lat, point.latitude); assert.equal(lon, point.longitude); assert.ok(signal);
    if (++calls === 1) throw new Error('Offline'); return result;
  });
  assert.equal(store.getSnapshot().point, null); assert.equal(calls, 0);
  const request = store.select(point); assert.equal(store.getSnapshot().loading, true); await request;
  assert.equal(store.getSnapshot().error, 'Offline'); assert.equal(store.getSnapshot().point, point);
  await store.retry(); assert.equal(store.getSnapshot().inspection, result); assert.equal(store.getSnapshot().error, '');
  assert.equal(store.getSnapshot().loading, false); store.dispose();
});
test('late location response cannot overwrite newer selection or reset/disposed state', async () => {
  const pending: ((value: any) => void)[] = [];
  const store = createSelectionStore(() => new Promise(resolve => pending.push(resolve)));
  const first = store.select(point), second = store.select({ ...point, latitude: 7 });
  pending[1](result); await second; pending[0]({ ...result, hazardClass: 'Low' }); await first;
  assert.equal(store.getSnapshot().point?.latitude, 7); assert.equal(store.getSnapshot().inspection, result);
  const third = store.select(point); store.reset(); pending[2](result); await third; assert.equal(store.getSnapshot().point, null);
  const fourth = store.select(point); const before = store.getSnapshot(); store.dispose(); pending[3](result); await fourth;
  assert.equal(store.getSnapshot(), before);
});
test('hazard summary uses only matching backend classes and explicit backend denominator; no derived metrics', () => {
  const parsed = parseHazardSummary({ success: true, studyAreaKm2: 0, analyzedLandAreaKm2: 40,
    areaStatistics: { percentagesDenominator: 'analyzed classified land area' },
    hazardSummary: [{ classId: 1, hazardClass: 'Low', areaKm2: 12, percentage: 30 }, { classId: 2, hazardClass: 'High', areaKm2: 99, percentage: 70 }] });
  assert.equal(parsed.rows[0].percentage, 30); assert.equal(parsed.rows[0].area, 12);
  assert.equal(parsed.rows[1].area, null); assert.equal(parsed.rows[2].area, null);
  assert.equal(parsed.areas['Study AOI'], 0); assert.equal(parsed.areas['Analyzed classified land'], 40);
  assert.deepEqual(parsed.rows.map(row => row.label), ['Low', 'Moderate', 'High', 'Very High']);
  assert.equal(percentageLabel(null), 'Unavailable'); assert.equal(percentageLabel(0), '0%'); assert.equal(areaLabel(0), '0 km²');
});
test('missing or conflicting summary metadata never invents percentages or duplicate class values', () => {
  const row = { classId: 1, hazardClass: 'Low', areaKm2: 12, percentage: 30 };
  assert.equal(parseHazardSummary({ success: true, hazardSummary: [row] }).rows[0].percentage, null);
  assert.equal(parseHazardSummary({ success: true, analyzedLandAreaKm2: 0, areaStatistics: { percentagesDenominator: 'analyzed classified land area' }, hazardSummary: [row] }).rows[0].percentage, null);
  assert.equal(parseHazardSummary({ success: true, hazardSummary: [row, row] }).rows[0].area, null);
  assert.throws(() => parseHazardSummary({ success: false }));
  assert.ok(parseHazardSummary({ success: true }).rows.every(row => row.area === null));
});
test('summary request is whole-AOI with no selected coordinates and cancellation', async () => {
  const old = api.get, controller = new AbortController();
  api.get = async (path, signal) => { assert.equal(path, '/api/flood/hazard'); assert.equal(signal, controller.signal); return { success: true }; };
  try { await getHazardSummary(controller.signal); } finally { api.get = old; }
});
