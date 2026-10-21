import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client';
import { inspectionLabel, sampleTileUrl, validateTileTemplate } from '../src/api/flood';

test('preserves Earth Engine XYZ templates and query parameters', () => {
  const template = 'https://earthengine.googleapis.com/v1/projects/example/maps/id/tiles/{z}/{x}/{y}?token=example';
  assert.equal(validateTileTemplate(template), template);
  assert.match(sampleTileUrl(template), /\/tiles\/12\/2958\/1969\?token=example$/);
  for (const invalid of [null, '', 'https://example.com/{z}/{x}', 'http://example.com/{z}/{x}/{y}']) assert.throws(() => validateTileTemplate(invalid));
});
test('water takes precedence; missing data and a zero index remain distinct', () => {
  const base = { success: true as const, insideClassifiedArea: true, isPermanentWater: false };
  assert.equal(inspectionLabel({ ...base, landHazardClass: 'Low', landHazardIndex: 0 }), 'Low hazard · Index 0.000');
  assert.equal(inspectionLabel({ ...base, isPermanentWater: true }), 'Permanent Water Body');
  assert.match(inspectionLabel({ ...base, insideClassifiedArea: false }), /No Data/);
  assert.match(inspectionLabel({ ...base, hazardClass: 'Low', hazardIndex: null }), /No Data/);
});
test('caller cancellation reaches fetch without being reported as a timeout', async () => {
  const controller = new AbortController();
  const client = createApiClient('http://192.168.1.100:5000', (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('Selection cancelled')));
  }));
  const pending = client.get('/api/flood/inspect?lat=6.9&lon=79.95', controller.signal);
  controller.abort();
  await assert.rejects(pending, /Selection cancelled/);
});
