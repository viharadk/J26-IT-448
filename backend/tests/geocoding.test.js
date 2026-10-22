const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createGeocodingService } = require("../services/geocodingService");
const { createGeocodingRouter } = require("../routes/geocodingRoutes");

const sample = [{ place_id: 123, display_name: "Kelaniya, Sri Lanka", lat: "6.9553", lon: "79.9217" }];
const response = (data = sample) => ({ ok: true, status: 200, json: async () => data });

test("proxy identifies the app, restricts Sri Lanka, normalizes and caches identical submissions", async () => {
  let calls = 0;
  const service = createGeocodingService({ fetcher: async (url, options) => {
    calls++;
    assert.equal(url.origin, "https://nominatim.openstreetmap.org");
    assert.equal(url.searchParams.get("countrycodes"), "lk");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(url.searchParams.get("q"), "Kelaniya Sri Lanka");
    assert.match(options.headers["User-Agent"], /KelaniFloodWatch/);
    assert.ok(options.signal);
    return response();
  } });
  const places = await service.search(" Kelaniya   Sri Lanka ");
  assert.deepEqual(places, [{ id: "123", name: "Kelaniya, Sri Lanka", latitude: 6.9553, longitude: 79.9217 }]);
  assert.deepEqual(await service.search("kelaniya sri lanka"), places);
  assert.equal(calls, 1);
});

test("one app-wide upstream slot, identical in-flight deduplication and minimum request interval", async () => {
  let time = 0, calls = 0, release;
  const service = createGeocodingService({ now: () => time, fetcher: () => { calls++; return new Promise(done => { release = done; }); } });
  const first = service.search("Kelaniya");
  const duplicate = service.search("kelaniya");
  time = 2000;
  await assert.rejects(service.search("Colombo"), error => error.status === 429);
  release(response());
  assert.deepEqual(await duplicate, await first);
  assert.equal(calls, 1);
  const next = service.search("Colombo"); release(response()); await next;
  await assert.rejects(service.search("Wattala"), error => error.status === 429);
});

test("validates input, handles empty results and never invents invalid coordinates", async () => {
  const service = createGeocodingService({ fetcher: async () => response([
    ...sample, { ...sample[0], lat: "" }, { ...sample[0], lon: "181" }, { ...sample[0], lat: null }, null
  ]) });
  for (const input of [undefined, [], " ", "x".repeat(161)]) await assert.rejects(service.search(input), error => error.status === 400);
  assert.equal((await service.search("Kelaniya")).length, 1);
  const empty = createGeocodingService({ fetcher: async () => response([]) });
  assert.deepEqual(await empty.search("unknown"), []);
});

test("upstream failures and malformed payloads are not cached; provider cooldown is honored", async () => {
  for (const fetcher of [async () => { throw Error("private upstream detail"); }, async () => response({ error: "bad" }), async () => ({ ok: false, status: 503 })]) {
    const service = createGeocodingService({ fetcher });
    await assert.rejects(service.search("Kelaniya"), error => error.status === 502 && !error.message.includes("private"));
  }
  let time = 0, calls = 0;
  const limited = createGeocodingService({ now: () => time, fetcher: async () => {
    calls++; return { status: 429, headers: { get: () => "120" } };
  } });
  await assert.rejects(limited.search("Kelaniya"), error => error.status === 429);
  time = 61000;
  await assert.rejects(limited.search("Colombo"), error => error.status === 429);
  assert.equal(calls, 1);
});

test("cache expires and provider can be changed on the server", async () => {
  let time = 0, calls = 0;
  const service = createGeocodingService({ now: () => time, baseUrl: "https://geocoder.example/nominatim/", fetcher: async url => {
    calls++; assert.equal(url.pathname, "/nominatim/search"); return response();
  } });
  await service.search("Kelaniya");
  time = 24 * 60 * 60 * 1000 + 1;
  await service.search("Kelaniya");
  assert.equal(calls, 2);
});

test("HTTP route returns the search contract and useful validation/rate-limit statuses", async () => {
  const app = express();
  app.use("/api/geocoding", createGeocodingRouter(createGeocodingService({ fetcher: async () => response() })));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/geocoding/search`;
  try {
    assert.equal((await fetch(base)).status, 400);
    const found = await fetch(`${base}?q=Kelaniya`);
    assert.equal(found.status, 200);
    const body = await found.json();
    assert.equal(body.success, true); assert.equal(body.places[0].latitude, 6.9553);
    const limited = await fetch(`${base}?q=Colombo`);
    assert.equal(limited.status, 429); assert.ok(limited.headers.get("retry-after"));
    assert.equal((await fetch(`${base}?q=kelaniya`)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
