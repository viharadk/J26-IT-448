// Explicit, opt-in live check: one upstream search, then an identical cached query.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const express = require("express");
const { createGeocodingRouter } = require("../routes/geocodingRoutes");

async function main() {
  const app = express();
  app.use("/api/geocoding", createGeocodingRouter());
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/geocoding/search?q=Kelaniya`;
  try {
    const response = await fetch(url);
    const body = await response.json();
    assert.equal(response.status, 200, body.message);
    assert.equal(body.success, true);
    assert.ok(body.places.length > 0, "No real Kelaniya results returned");
    for (const place of body.places) {
      assert.ok(Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90);
      assert.ok(Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180);
    }
    const cached = await fetch(url);
    assert.deepEqual(await cached.json(), body);
    console.log("PASS live proxy search and cached repeat:", JSON.stringify(body.places));
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error("FAIL live geocoding:", error.message); process.exitCode = 1; });
