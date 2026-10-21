const { DATASET } = require("./sarValidation");

function normalizeScene(scene) {
  if (typeof scene.sceneIndex !== "string" || !scene.sceneIndex || !Number.isFinite(scene.acquisitionTimeMillis)) {
    throw new Error("Scene identity or acquisition timestamp is unavailable.");
  }
  const acquiredAt = new Date(scene.acquisitionTimeMillis).toISOString();
  const match = /_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})_/.exec(scene.sceneIndex);
  const productStartUtcFromId = match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z` : null;
  // Product names encode whole-second start times; sub-second differences are
  // expected. Preserve both original metadata sources when they disagree.
  const timestampDifferenceSeconds = productStartUtcFromId ? (scene.acquisitionTimeMillis - Date.parse(productStartUtcFromId)) / 1000 : null;
  const timestampWarning = timestampDifferenceSeconds !== null && Math.abs(timestampDifferenceSeconds) >= 1 ?
    "Earth Engine system:time_start differs from the UTC start time encoded in the product ID. Verify the original product metadata; neither time has been silently corrected." : null;
  return {
    ...scene, sceneId: `${DATASET}/${scene.sceneIndex}`, acquiredAt, acquisitionTimeSource: "system:time_start",
    platform: scene.platformNumber ? `Sentinel-1${scene.platformNumber}` : null,
    preferredConfiguration: scene.instrumentMode === "IW" && Array.isArray(scene.polarizations) && scene.polarizations.includes("VV"),
    productStartUtcFromId, timestampDifferenceSeconds, timestampWarning
  };
}
module.exports = { normalizeScene };
