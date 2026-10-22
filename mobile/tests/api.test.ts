import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, validateBaseUrl } from '../src/api/client';

const origin = 'http://192.168.1.100:5000';
const payload = { success: true, status: 'Flood API is working', component: 'GIS', function1: 'Hazard', function2: 'Scenario' };
test('requires a configured device-reachable origin', () => {
  for (const value of [undefined, '', 'bad', 'ftp://example.com', 'http://localhost:5000', 'http://127.0.0.1', 'http://[::1]', `${origin}/api`, `${origin}?x=1`]) assert.throws(() => validateBaseUrl(value));
  assert.equal(validateBaseUrl(`${origin}/`), origin);
});
test('uses the existing endpoint and validates success', async () => {
  const client = createApiClient(origin, async (url, options) => {
    assert.equal(url, `${origin}/api/flood/test`);
    assert.ok(options?.signal);
    return Response.json(payload);
  });
  assert.deepEqual(await client.testConnection(), payload);
});
test('rejects HTTP errors', async () => {
  await assert.rejects(createApiClient(origin, async () => new Response('', { status: 503 })).testConnection(), /HTTP 503/);
});
test('rejects malformed and unsuccessful payloads', async () => {
  for (const result of [null, {}, { ...payload, success: false }, { ...payload, status: 123 }]) {
    await assert.rejects(createApiClient(origin, async () => Response.json(result)).testConnection(), /Unexpected response/);
  }
  await assert.rejects(createApiClient(origin, async () => new Response('html')).testConnection(), /invalid JSON/);
});
test('explains network failure', async () => {
  await assert.rejects(createApiClient(origin, async () => { throw new TypeError('fetch failed'); }).testConnection(), /Cannot reach/);
});
test('aborts a stalled request', async () => {
  const client = createApiClient(origin, (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  }), 10);
  await assert.rejects(client.testConnection(), /timed out/);
});
