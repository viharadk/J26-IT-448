const SCENES = Object.freeze({
  before: "COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20170524T002512_20170524T002537_016716_01BC28_3CCB",
  later: "COPERNICUS/S1_GRD/S1B_IW_GRDH_1SDV_20170530T002430_20170530T002501_005820_00A340_FB2A"
});
const LIMITATION = "Research prototype: May 30 follows the documented event peak. Residual water is unverified. These are backscatter observations and exploratory radar change, not confirmed flood extent, depth, classification or detection accuracy.";
const DISPLAY = Object.freeze({
  before: { min: -25, max: 0, palette: ["000000", "ffffff"] },
  later: { min: -25, max: 0, palette: ["000000", "ffffff"] },
  change: { min: -6, max: 6, palette: ["2166ac", "f7f7f7", "b2182b"] }
});
function summarizeQuality(raw, queriedAt, sceneIds = SCENES) {
  if (!raw || !Number.isFinite(raw.areas?.aoi) || raw.areas.aoi <= 0) throw new Error("AOI raster area is unavailable.");
  if (!Number.isFinite(raw.vectorAreaKm2) || raw.vectorAreaKm2 <= 0) throw new Error("AOI vector area is unavailable.");
  for (const key of ["before", "later", "common"]) {
    if (!Number.isFinite(raw.areas[key]) || raw.areas[key] < 0 || raw.areas[key] > raw.areas.aoi * 1.000001) throw new Error(`Invalid ${key} valid-pixel area.`);
  }
  if (raw.areas.common > Math.min(raw.areas.before, raw.areas.later) + 1) throw new Error("Common mask exceeds an individual valid mask.");
  if (raw.areas.common <= 0 || !(raw.statistics?.before_count > 0) || !(raw.statistics?.later_count > 0)) throw new Error("No common valid SAR pixels were retrieved.");
  if (raw.statistics.before_count !== raw.statistics.later_count || raw.statistics.before_count !== raw.statistics.change_count) throw new Error("Backscatter statistics do not share the same pixel support.");
  for (const name of ["before", "later", "change"]) if (!Number.isFinite(raw.statistics[`${name}_mean`])) throw new Error("Backscatter statistics are unavailable.");
  const scenes = {};
  for (const key of ["before", "later"]) {
    const metadata = raw[key];
    if (!metadata?.bands?.includes("VV") || !metadata.bands.includes("angle") || !Number.isFinite(metadata.time)) throw new Error("Required VV/angle band or acquisition metadata is unavailable.");
    if (typeof metadata.projection?.crs !== "string" || typeof metadata.projection?.transformWkt !== "string" || !(metadata.projection.nominalScaleMeters > 0)) throw new Error("Native pixel projection is unavailable.");
    if (sceneIds === SCENES && (metadata.orbitDirection !== "DESCENDING" || metadata.relativeOrbitNumber !== 19 || metadata.instrumentMode !== "IW")) throw new Error("Fixed-scene acquisition configuration does not match verified evidence.");
    scenes[key] = { sceneId: sceneIds[key], acquiredAt: new Date(metadata.time).toISOString(), platform: `Sentinel-1${metadata.platform}`,
      orbitDirection: metadata.orbitDirection, relativeOrbitNumber: metadata.relativeOrbitNumber,
      instrumentMode: metadata.instrumentMode, polarizations: metadata.polarizations, bands: metadata.bands,
      nativeProjection: metadata.projection, angleProjection: metadata.angleProjection,
      catalogueResolutionMeters: metadata.resolutionMeters, footprintCoveragePercent: metadata.footprintCoveragePercent,
      validPixelAreaKm2: raw.areas[key] / 1e6, validPixelCoveragePercent: raw.areas[key] / raw.areas.aoi * 100,
      validPixelCoveragePercentOfVectorAoi: raw.areas[key] / (raw.vectorAreaKm2 * 1e6) * 100 };
  }
  const sameNativeGrid = raw.before.projection.crs === raw.later.projection.crs &&
    raw.before.projection.transformWkt === raw.later.projection.transformWkt;
  return {
    success: true, queriedAt, dataset: "COPERNICUS/S1_GRD", polarization: "VV", units: "dB",
    studyArea: { vectorAreaKm2: raw.vectorAreaKm2, rasterAreaKm2: raw.areas.aoi / 1e6, bounds: raw.bounds, outline: raw.outline, center: raw.center },
    scenes, common: { validPixelAreaKm2: raw.areas.common / 1e6, validPixelCoveragePercent: raw.areas.common / raw.areas.aoi * 100,
      validPixelCoveragePercentOfVectorAoi: raw.areas.common / (raw.vectorAreaKm2 * 1e6) * 100,
      jointFootprintCoveragePercent: raw.jointFootprintCoveragePercent, angleValidAreaKm2: (raw.areas.angleCommon || 0) / 1e6 },
    alignment: { sameNativeGrid, analysisProjection: raw.before.projection,
      strategy: "Both VV bands and binary masks are evaluated on the exact before-VV CRS and affine transform; explicit nearest-neighbor reprojection, no smoothing.",
      nativeGridMatchProvesRegistration: false,
      caveat: "Grid alignment is not measured subpixel co-registration, independent 10 m spatial accuracy or radiometric equivalence." },
    statistics: raw.statistics, samples: (Array.isArray(raw.samples) ? raw.samples : []).map(sample => ({ type: "Feature", geometry: { type: "Point", coordinates: sample.coordinates }, properties: sample.values })),
    computation: { domain: "Stored COPERNICUS/S1_GRD decibels; no linear-power averaging or ratio conversion.",
      change: "later_dB - before_dB on common valid pixels; a log-ratio display, not a flood classifier.",
      masks: "Original VV data masks > 0, nearest-neighbor aligned; common mask is their intersection clipped to the original AOI. No intensity threshold, speckle filter or flood/permanent-water mask is applied.",
      areaDenominator: "Valid-pixel percentages use AOI raster pixel area on the common grid; vector-AOI percentages are also reported. Footprint percentages use vector AOI area. Vector geometry and raster pixel-area calculation/discretization differ; neither denominator is silently substituted.",
      statisticsSupport: "All VV and change statistics use the same common valid pixel support; angle statistics additionally require both angle masks. Percentiles are EE reducer estimates.",
      maxPixels: 50000000, tileScale: 4 },
    comparability: { spatialComparisonReady: true, crossPlatformCalibrated: false, floodDetectionValidated: false,
      caveats: ["Sentinel-1A versus Sentinel-1B radiometric equivalence has not been validated.",
        "Compare incidence-angle distributions and stable targets before interpreting change.",
        "Speckle, wet soil, land cover, urban geometry and acquisition differences can alter backscatter.",
        "Masks establish available samples, not that every sample is free of border noise or other artifacts.",
        "Single-scene overlap omits part of the AOI; no AOI-wide flood-area claim is supported."] },
    limitation: sceneIds.before === SCENES.before && sceneIds.later === SCENES.later ? LIMITATION :
      "Selected historical observations; event timing and residual water require independent evidence. Radar change is exploratory, not confirmed flood extent, depth or detection accuracy."
  };
}
module.exports = { SCENES, DISPLAY, LIMITATION, summarizeQuality };
