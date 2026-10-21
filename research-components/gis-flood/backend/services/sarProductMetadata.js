// Independent PUBLIC product catalogues only; no credentials or SAFE download.
const PRODUCT_INDEX = "S1A_IW_GRDH_1SSV_20160522T125651_20160522T125720_011372_01146A_FD75";
const MAX_BYTES = 512 * 1024;

function publicRequests() {
  const copernicus = new URL("https://catalogue.dataspace.copernicus.eu/odata/v1/Products");
  copernicus.search = new URLSearchParams({ "$filter": `Name eq '${PRODUCT_INDEX}.SAFE'`, "$expand": "Attributes", "$top": "2" }).toString();
  const asf = new URL("https://api.daac.asf.alaska.edu/services/search/param");
  asf.search = new URLSearchParams({ granule_list: PRODUCT_INDEX, output: "json" }).toString();
  return { copernicus: copernicus.href, asf: asf.href };
}
async function boundedJson(response) {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Public metadata response exceeds the size bound.");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("Public metadata response exceeds the size bound.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function extractCopernicus(data) {
  const matches = data?.value?.filter(record => record.Name === `${PRODUCT_INDEX}.SAFE`) || [];
  if (matches.length !== 1) throw new Error("Exact Copernicus product identity was not uniquely confirmed.");
  const record = matches[0];
  const attributes = Object.fromEntries((record.Attributes || []).map(item => [item.Name, item.Value]));
  return {
    product: record.Name, catalogueId: record.Id, start: record.ContentDate?.Start, end: record.ContentDate?.End,
    orbitDirection: attributes.orbitDirection, relativeOrbitNumber: Number(attributes.relativeOrbitNumber),
    instrumentMode: attributes.operationalMode, polarization: attributes.polarisationChannels,
    platform: attributes.platformSerialIdentifier
  };
}
function extractAsf(data) {
  const matches = (Array.isArray(data) ? data.flat(2) : []).filter(record => record?.granuleName === PRODUCT_INDEX);
  const record = matches.find(item => item.processingLevel === "GRD_HS") || matches[0];
  if (!record) throw new Error("Exact ASF granule identity was not confirmed.");
  return {
    product: record.granuleName, processingLevel: record.processingLevel, start: record.startTime, end: record.stopTime,
    orbitDirection: record.flightDirection, relativeOrbitNumber: Number(record.relativeOrbit),
    instrumentMode: record.beamModeType || record.beamMode, polarization: record.polarization,
    platform: record.platform
  };
}
function validRecord(record) {
  return Boolean(record) && Number.isFinite(Date.parse(record.start)) && Number.isFinite(Date.parse(record.end)) &&
    Date.parse(record.end) > Date.parse(record.start) && record.orbitDirection === "ASCENDING" &&
    record.relativeOrbitNumber === 100 && record.instrumentMode === "IW" && record.polarization === "VV";
}
function assessTimestamp(eeScene, sources) {
  const copernicus = sources.copernicus?.record, asf = sources.asf?.record;
  const confirmed = sources.copernicus?.ok === true && sources.asf?.ok === true && validRecord(copernicus) && validRecord(asf) &&
    Math.abs(Date.parse(copernicus.start) - Date.parse(asf.start)) < 1000 &&
    Math.abs(Date.parse(copernicus.end) - Date.parse(asf.end)) < 1000;
  return {
    independentCataloguesAgree: confirmed,
    independentlyCorroboratedStart: confirmed ? copernicus.start : null,
    independentlyCorroboratedEnd: confirmed ? copernicus.end : null,
    originalEarthEngineAcquiredAt: eeScene?.acquiredAt || null,
    originalEarthEngineMillis: eeScene?.acquisitionTimeMillis ?? null,
    earthEngineMinusCatalogueSeconds: confirmed && Number.isFinite(eeScene?.acquisitionTimeMillis) ?
      (eeScene.acquisitionTimeMillis - Date.parse(copernicus.start)) / 1000 : null,
    conclusion: confirmed ? `Two independent public catalogue records support acquisition start ${copernicus.start}. The Earth Engine timestamp conflict remains in original evidence; no source values are overwritten.` :
      "Independent catalogue corroboration is incomplete. Preserve both time sources and their uncertainty.",
    limitations: ["The original SAFE manifest was not inspected; public manifest/ISO access attempts returned authentication requirements.",
      "The root cause of the Earth Engine metadata discrepancy is not established.",
      "Corroborating a timestamp does not provide a matching pre-event image or prove floodwater."]
  };
}
function createProductMetadataLookup({ fetcher = fetch, now = Date.now } = {}) {
  async function lookup(eeScene) {
    const urls = publicRequests();
    const sources = Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([name, url]) => {
      try {
        const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "KelaniFloodWatch-SARResearch/2A" }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) return [name, { url, ok: false, status: response.status, error: "Public metadata request failed." }];
        const data = await boundedJson(response);
        const record = name === "copernicus" ? extractCopernicus(data) : extractAsf(data);
        return [name, { url, ok: validRecord(record), status: response.status, record, data,
          ...(!validRecord(record) ? { error: "Public record configuration or acquisition times could not be validated." } : {}) }];
      } catch (error) { return [name, { url, ok: false, error: error.message }]; }
    })));
    return { queriedAt: new Date(now()).toISOString(), productIndex: PRODUCT_INDEX, sources, assessment: assessTimestamp(eeScene, sources) };
  }
  return { lookup };
}
module.exports = { PRODUCT_INDEX, publicRequests, extractCopernicus, extractAsf, assessTimestamp, createProductMetadataLookup };
