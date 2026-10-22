
const {
  ee,
  initializeEarthEngine
} = require("./earthEngineService");

const {
  calculateAHP
} = require("./ahpService");

const ANALYSIS_CACHE_TTL_MS = 5 * 60 * 1000;
let analysisCache = null;
let analysisCachePromise = null;
let populationExposureCache = null;
let populationExposureCachePromise = null;

// ==================================================
// KELANI GUARD - FUNCTION 1
// AHP-WEIGHTED GIS FLOOD HAZARD ESTIMATION
//
// Includes:
// - AHP weights and consistency
// - Equal-weight baseline
// - Factor-level images and contributions
// - Spatial hazard map and area statistics
//
// RESEARCH STATUS:
// Preliminary and not historically validated.
// Current AHP judgments are demonstrations only.
// ==================================================

async function buildHazardAnalysis() {

  // --------------------------------------------------
  // 0. INITIALIZE GOOGLE EARTH ENGINE
  // --------------------------------------------------

  await initializeEarthEngine();

  // --------------------------------------------------
  // 1. CALCULATE AHP WEIGHTS
  // --------------------------------------------------

  const ahp = calculateAHP();

  if (!ahp.consistencyAcceptable) {
    throw new Error(
      "AHP matrix failed the consistency check."
    );
  }

  const getWeight = (factorName) => {
    const factor = ahp.factorWeights.find(
      (item) => item.factor === factorName
    );

    if (!factor) {
      throw new Error(
        `Missing AHP weight for: ${factorName}`
      );
    }

    return factor.weight;
  };

  const weights = {
    elevation: getWeight("Elevation"),
    slope: getWeight("Slope"),
    waterDistance: getWeight("Distance to Water"),
    landcover: getWeight("Land Cover")
  };

  // --------------------------------------------------
  // 2. STUDY AREA - HYDROBASINS
  // --------------------------------------------------

  const basinIds = [
    4101158680,
    4101601930,
    4101601920,
    4100049050
  ];

  const basins = ee.FeatureCollection(
    "WWF/HydroSHEDS/v1/Basins/hybas_10"
  );

  const studyBasins = basins.filter(
    ee.Filter.inList("HYBAS_ID", basinIds)
  );

  const aoi = studyBasins.geometry();

  // --------------------------------------------------
  // 3. NASA SRTM ELEVATION
  // --------------------------------------------------

  const dem = ee.Image(
    "USGS/SRTMGL1_003"
  ).select("elevation");

  const elevation = dem
    .clip(aoi)
    .rename("elevation_m");

  // --------------------------------------------------
  // 4. TERRAIN SLOPE
  // --------------------------------------------------

  const slope = ee.Terrain
    .slope(dem)
    .clip(aoi)
    .rename("slope_degrees");

  // --------------------------------------------------
  // 5. ESA WORLDCOVER LAND COVER
  // --------------------------------------------------

  const landcover = ee
    .ImageCollection("ESA/WorldCover/v200")
    .first()
    .select("Map")
    .clip(aoi)
    .rename("landcover_code");

  // WorldCover class 80 is permanent water. Keep the source image mask so
  // unavailable WorldCover pixels remain unavailable in all derived products.
  const waterBoolean = landcover.eq(80);
  const permanentWaterOverlay = waterBoolean
    .selfMask()
    .rename("permanent_water_overlay");
  const landMask = waterBoolean.not()
    .updateMask(landcover.mask())
    .rename("land_mask");

  // --------------------------------------------------
  // 6. JRC HISTORICAL SURFACE WATER
  // --------------------------------------------------

  const surfaceWater = ee
    .Image("JRC/GSW1_4/GlobalSurfaceWater")
    .select("occurrence");

  const bufferedArea = aoi.buffer(10000);

  const waterMask = surfaceWater
    .unmask(0)
    .gte(50)
    .clip(bufferedArea)
    .unmask(0)
    .reproject({
      crs: dem.projection(),
      scale: 30
    });

  // Approximate distance based on 30m pixels.
  // This is proximity to JRC historical water,
  // NOT a surveyed river-channel distance.

  const distanceToWater = waterMask
    .fastDistanceTransform(256)
    .sqrt()
    .multiply(30)
    .rename("water_distance_m")
    .clip(aoi);

  // --------------------------------------------------
  // 7. RECLASSIFY FACTORS TO SCORES (1 TO 5)
  // All thresholds remain preliminary.
  // --------------------------------------------------

  const elevationScore = ee.Image(1)
    .where(elevation.lte(30), 2)
    .where(elevation.lte(20), 3)
    .where(elevation.lte(10), 4)
    .where(elevation.lte(5), 5)
    .updateMask(elevation.mask())
    .rename("elevation_score")
    .clip(aoi);

  const slopeScore = ee.Image(1)
    .where(slope.lte(15), 2)
    .where(slope.lte(10), 3)
    .where(slope.lte(5), 4)
    .where(slope.lte(2), 5)
    .updateMask(slope.mask())
    .rename("slope_score")
    .clip(aoi);

  const waterDistanceScore = ee.Image(1)
    .where(distanceToWater.lte(2000), 2)
    .where(distanceToWater.lte(1000), 3)
    .where(distanceToWater.lte(500), 4)
    .where(distanceToWater.lte(250), 5)
    .updateMask(distanceToWater.mask())
    .rename("water_distance_score")
    .clip(aoi);

  const landcoverScore = landcover
    .remap(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100],
      [2, 2, 3, 3, 5, 4, 1, 5, 5, 4, 2]
    )
    .rename("landcover_score")
    .clip(aoi);

  // --------------------------------------------------
  // 8. AHP WEIGHTED CONTRIBUTIONS
  // --------------------------------------------------

  const elevationContribution = elevationScore
    .multiply(weights.elevation)
    .rename("elevation_contribution");

  const slopeContribution = slopeScore
    .multiply(weights.slope)
    .rename("slope_contribution");

  const waterContribution = waterDistanceScore
    .multiply(weights.waterDistance)
    .rename("water_contribution");

  const landcoverContribution = landcoverScore
    .multiply(weights.landcover)
    .rename("landcover_contribution");

  // --------------------------------------------------
  // 9. FINAL AHP-WEIGHTED HAZARD INDEX
  // --------------------------------------------------

  const hazardIndex = elevationContribution
    .add(slopeContribution)
    .add(waterContribution)
    .add(landcoverContribution)
    .rename("hazard_index")
    .clip(aoi);

  // --------------------------------------------------
  // 10. EQUAL-WEIGHT BASELINE
  // Used for future sensitivity comparisons.
  // --------------------------------------------------

  const equalWeightIndex = elevationScore
    .multiply(0.25)
    .add(slopeScore.multiply(0.25))
    .add(waterDistanceScore.multiply(0.25))
    .add(landcoverScore.multiply(0.25))
    .rename("equal_weight_index")
    .clip(aoi);

  const indexDifference = hazardIndex
    .subtract(equalWeightIndex)
    .rename("ahp_minus_equal_index")
    .clip(aoi);

  // --------------------------------------------------
  // 11. FLOOD HAZARD CLASSIFICATION
  // These cutoffs are preliminary.
  // --------------------------------------------------

  function classifyHazard(indexImage, name) {
    return ee.Image(1)
      .where(indexImage.gt(2.0), 2)
      .where(indexImage.gt(3.0), 3)
      .where(indexImage.gt(4.0), 4)
      .rename(name)
      .updateMask(indexImage.mask())
      .clip(aoi);
  }

  const hazardClass = classifyHazard(
    hazardIndex,
    "hazard_class"
  );

  const landHazardIndex = hazardIndex
    .updateMask(landMask)
    .rename("land_hazard_index");
  const landHazardClass = hazardClass
    .updateMask(landMask)
    .rename("land_hazard_class");

  const equalWeightClass = classifyHazard(
    equalWeightIndex,
    "equal_weight_class"
  );

  // --------------------------------------------------
  // 12. AHP CLASSIFIED AREA STATISTICS
  // --------------------------------------------------

  const areaImage = ee.Image.pixelArea()
    .divide(1000000)
    .rename("area_km2")
    .addBands(landHazardClass);

  const areaStats = areaImage.reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: "hazard_class"
    }),
    geometry: aoi,
    scale: 30,
    maxPixels: 1e9,
    tileScale: 4
  });

  const permanentWaterAreaStats = ee.Image.pixelArea()
    .divide(1000000)
    .updateMask(waterBoolean)
    .rename("area_km2")
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 30,
      maxPixels: 1e9,
      tileScale: 4
    });

  const validRasterAreaStats = ee.Image.pixelArea()
    .divide(1000000)
    .updateMask(landcover.mask())
    .rename("area_km2")
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 30,
      maxPixels: 1e9,
      tileScale: 4
    });

  // --------------------------------------------------
  // 13. STUDY AREA
  // --------------------------------------------------

  const studyAreaKm2 = aoi.area(1)
    .divide(1000000);

  // --------------------------------------------------
  // 14. MULTI-BAND LOCATION ANALYSIS IMAGE
  //
  // This enables one GEE point query to return
  // raw spatial measurements, scores,
  // weighted contributions and comparisons.
  // --------------------------------------------------

  const inspectionImage = ee.Image.cat([
    elevation,
    slope,
    distanceToWater,
    landcover,

    elevationScore,
    slopeScore,
    waterDistanceScore,
    landcoverScore,

    elevationContribution,
    slopeContribution,
    waterContribution,
    landcoverContribution,

    hazardIndex,
    hazardClass,
    landHazardIndex,
    landHazardClass,
    equalWeightIndex,
    equalWeightClass,
    indexDifference,
    waterBoolean
  ]).clip(aoi);

  // --------------------------------------------------
  // 15. RETURN TO CONTROLLER
  // --------------------------------------------------

  return {
    aoi,
    studyBasins,
    analysisProjection: dem.projection(),
    studyAreaKm2,

    // Existing controller compatibility
    hazardIndex,
    hazardClass,
    landHazardIndex,
    landHazardClass,
    areaStats,
    permanentWaterAreaStats,
    validRasterAreaStats,
    waterBoolean,
    permanentWaterOverlay,
    landMask,

    // NEW AHP INFORMATION
    ahp,
    weights,

    // Raw GIS factor layers
    factorLayers: {
      elevation,
      slope,
      distanceToWater,
      landcover
    },

    // Factor scores
    factorScores: {
      elevationScore,
      slopeScore,
      waterDistanceScore,
      landcoverScore
    },

    // AHP weighted contributions
    contributions: {
      elevationContribution,
      slopeContribution,
      waterContribution,
      landcoverContribution
    },

    // Equal-weight comparison
    equalWeightIndex,
    equalWeightClass,
    indexDifference,

    // Combined location inspection layer
    inspectionImage,

    // Model metadata
    methodology: {
      name: "AHP-Weighted GIS Multi-Criteria Analysis",
      status: "Preliminary - Not Validated",
      weightStatus:
        "Demonstration AHP judgments - Not literature validated",
      classificationThresholds: {
        low: "index <= 2.0",
        moderate: "2.0 < index <= 3.0",
        high: "3.0 < index <= 4.0",
        veryHigh: "index > 4.0"
      }
    }
  };
}

async function getCachedHazardAnalysis() {
  if (
    analysisCache &&
    Date.now() - analysisCache.createdAt < ANALYSIS_CACHE_TTL_MS
  ) {
    return analysisCache.value;
  }

  if (analysisCachePromise) {
    return analysisCachePromise;
  }

  analysisCachePromise = buildHazardAnalysis()
    .then((value) => {
      analysisCache = {
        createdAt: Date.now(),
        value
      };
      return value;
    })
    .finally(() => {
      analysisCachePromise = null;
    });

  return analysisCachePromise;
}

async function buildPopulationExposure() {
  const analysis = await getCachedHazardAnalysis();
  const populationSource = ee.Image(
    "JRC/GHSL/P2023A/GHS_POP/2020"
  ).select("population_count");
  const populationProjection = populationSource.projection();
  const population = populationSource.clip(analysis.aoi).unmask(0);
  const classIds = [1, 2, 3, 4];
  const populationByHazardClass = {};
  const exposureBands = [population.rename("study_area_population")];
  const landHazardClassWithProjection = analysis.landHazardClass
    .setDefaultProjection(analysis.analysisProjection);

  classIds.forEach((classId) => {
    const classFraction = landHazardClassWithProjection
      .eq(classId)
      .unmask(0)
      .reduceResolution({
        reducer: ee.Reducer.mean(),
        maxPixels: 4096
      })
      .reproject({ crs: populationProjection })
      .rename(`class_${classId}_fraction`);

    const exposure = population
      .multiply(classFraction)
      .rename(`population_class_${classId}`);

    populationByHazardClass[classId] = exposure;
    exposureBands.push(exposure);
  });

  const exposureImage = ee.Image.cat(exposureBands);

  const populationStats = exposureImage.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: analysis.aoi,
    crs: populationProjection,
    scale: 100,
    maxPixels: 1e8,
    tileScale: 4
  });

  return {
    populationSource,
    population,
    populationProjection,
    populationByHazardClass,
    populationStats
  };
}

async function getCachedPopulationExposure() {
  if (
    populationExposureCache &&
    Date.now() - populationExposureCache.createdAt < ANALYSIS_CACHE_TTL_MS
  ) {
    return populationExposureCache.value;
  }

  if (populationExposureCachePromise) {
    return populationExposureCachePromise;
  }

  populationExposureCachePromise = buildPopulationExposure()
    .then((value) => {
      populationExposureCache = {
        createdAt: Date.now(),
        value
      };
      return value;
    })
    .finally(() => {
      populationExposureCachePromise = null;
    });

  return populationExposureCachePromise;
}

module.exports = {
  buildHazardAnalysis,
  getCachedHazardAnalysis,
  buildPopulationExposure,
  getCachedPopulationExposure
};
