const test = require("node:test");
const assert = require("node:assert/strict");
const { PRODUCT_INDEX, publicRequests, extractCopernicus, extractAsf, assessTimestamp, createProductMetadataLookup } = require("../services/sarProductMetadata");

// Synthetic catalogue responses test source handling; actual verification is
// separately saved in artifacts/function2-phase2a-product-metadata.json.
function cdse() {
  return { value: [{ Name: `${PRODUCT_INDEX}.SAFE`, Id: "synthetic-uuid",
    ContentDate: { Start: "2016-05-22T12:56:51.949493Z", End: "2016-05-22T12:57:20.974269Z" },
    Attributes: Object.entries({ orbitDirection: "ASCENDING", relativeOrbitNumber: 100, operationalMode: "IW", polarisationChannels: "VV", platformSerialIdentifier: "A" }).map(([Name, Value]) => ({ Name, Value }))
  }] };
}
function asf() {
  return [[{ granuleName: PRODUCT_INDEX, processingLevel: "METADATA_GRD_HS", startTime: "2016-05-22T12:56:51Z", stopTime: "2016-05-22T12:57:20Z", flightDirection: "ASCENDING", relativeOrbit: 100, beamModeType: "IW", polarization: "VV", platform: "Sentinel-1A" },
    { granuleName: PRODUCT_INDEX, processingLevel: "GRD_HS", startTime: "2016-05-22T12:56:51Z", stopTime: "2016-05-22T12:57:20Z", flightDirection: "ASCENDING", relativeOrbit: 100, beamModeType: "IW", polarization: "VV", platform: "Sentinel-1A" }]];
}
const eeScene = { sceneIndex: PRODUCT_INDEX, acquiredAt: "2016-05-22T00:56:51.950Z", acquisitionTimeMillis: Date.parse("2016-05-22T00:56:51.950Z"), timestampWarning: "original warning retained" };

test("public requests are fixed exact-product lookups without credentials or user-supplied hosts", () => {
  const urls = publicRequests();
  const copernicus = new URL(urls.copernicus), alaska = new URL(urls.asf);
  assert.equal(copernicus.hostname, "catalogue.dataspace.copernicus.eu");
  assert.equal(copernicus.searchParams.get("$filter"), `Name eq '${PRODUCT_INDEX}.SAFE'`);
  assert.equal(copernicus.searchParams.get("$top"), "2");
  assert.equal(alaska.searchParams.get("granule_list"), PRODUCT_INDEX);
  assert.equal(alaska.hostname, "api.daac.asf.alaska.edu");
});
test("exact product identity is required and catalogue timestamp precision is retained", () => {
  const record = extractCopernicus(cdse());
  assert.equal(record.start, "2016-05-22T12:56:51.949493Z");
  assert.equal(record.relativeOrbitNumber, 100);
  assert.equal(extractAsf(asf()).processingLevel, "GRD_HS");
  assert.throws(() => extractCopernicus({ value: [] }), /identity/);
  const wrong = cdse(); wrong.value[0].Name = "different-product.SAFE";
  assert.throws(() => extractCopernicus(wrong), /identity/);
  assert.throws(() => extractCopernicus({ value: [...cdse().value, ...cdse().value] }), /uniquely/);
  assert.throws(() => extractAsf([[{ granuleName: "different-product" }]]), /identity/);
});
test("two agreeing independent catalogue records corroborate time while original EE evidence stays unchanged", () => {
  const original = structuredClone(eeScene);
  const result = assessTimestamp(eeScene, { copernicus: { ok: true, record: extractCopernicus(cdse()) }, asf: { ok: true, record: extractAsf(asf()) } });
  assert.equal(result.independentCataloguesAgree, true);
  assert.equal(result.independentlyCorroboratedStart, "2016-05-22T12:56:51.949493Z");
  assert.equal(result.originalEarthEngineAcquiredAt, original.acquiredAt);
  assert.equal(result.earthEngineMinusCatalogueSeconds, -43199.999);
  assert.deepEqual(eeScene, original);
  assert.match(result.limitations.join(" "), /root cause.*not established/);
});
test("one source, missing fields, wrong configuration, or conflicting times never resolve the uncertainty", () => {
  const sources = { copernicus: { ok: true, record: extractCopernicus(cdse()) }, asf: { ok: true, record: extractAsf(asf()) } };
  for (const invalid of [
    { ...sources, asf: { ok: false } },
    { ...sources, asf: { ok: true } },
    { ...sources, asf: { ok: true, record: { ...sources.asf.record, start: "2016-05-22T00:56:51Z" } } },
    { ...sources, asf: { ok: true, record: { ...sources.asf.record, relativeOrbitNumber: 19 } } },
    { ...sources, asf: { ok: true, record: { ...sources.asf.record, end: "invalid" } } }
  ]) {
    const result = assessTimestamp(eeScene, invalid);
    assert.equal(result.independentCataloguesAgree, false);
    assert.equal(result.independentlyCorroboratedStart, null);
    assert.equal(result.earthEngineMinusCatalogueSeconds, null);
    assert.match(result.conclusion, /uncertainty/);
  }
});
test("lookup preserves raw public responses, validates configuration and forwards timeout without Authorization", async () => {
  let calls = 0;
  const lookup = createProductMetadataLookup({ now: () => 0, fetcher: async (url, options) => {
    calls++;
    assert.ok(options.signal); assert.equal(options.headers.Authorization, undefined);
    return new Response(JSON.stringify(url.includes("copernicus") ? cdse() : asf()), { status: 200, headers: { "content-type": "application/json" } });
  } });
  const result = await lookup.lookup(eeScene);
  assert.equal(calls, 2);
  assert.deepEqual(result.sources.copernicus.data, cdse());
  assert.equal(result.assessment.independentCataloguesAgree, true);
  assert.equal(result.queriedAt, "1970-01-01T00:00:00.000Z");
});
test("HTTP failure, malformed JSON, timeout and oversized response remain explicit failed sources", async () => {
  const fetchers = [
    async () => new Response("", { status: 401 }),
    async () => new Response("not json", { status: 200 }),
    async () => { throw new Error("network timeout"); },
    async () => new Response("{}", { headers: { "content-length": String(513 * 1024) } }),
    async () => new Response(" ".repeat(513 * 1024))
  ];
  for (const fetcher of fetchers) {
    const result = await createProductMetadataLookup({ fetcher }).lookup(eeScene);
    assert.equal(result.assessment.independentCataloguesAgree, false);
    assert.equal(result.sources.copernicus.ok, false); assert.equal(result.sources.asf.ok, false);
    assert.ok(result.sources.copernicus.error);
  }
});
