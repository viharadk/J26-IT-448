
const {
  ee,
  initializeEarthEngine
} = require("../services/earthEngineService");

const {
  getCachedHazardAnalysis,
  getCachedPopulationExposure
} = require("../services/hazardService");

// ============================================
// KELANI GUARD - FUNCTION 1
// ADVANCED GIS FLOOD HAZARD CONTROLLER
//
// AHP-weighted hazard mapping
// Factor-by-factor location inspection
// Equal-weight baseline comparison
// ============================================

const CLASS_LABELS = {
  1: "Low",
  2: "Moderate",
  3: "High",
  4: "Very High"
};

const LANDCOVER_LABELS = {
  10: "Tree Cover",
  20: "Shrubland",
  30: "Grassland",
  40: "Cropland",
  50: "Built-up",
  60: "Bare / Sparse Vegetation",
  70: "Snow and Ice",
  80: "Permanent Water Bodies",
  90: "Herbaceous Wetland",
  95: "Mangroves",
  100: "Moss and Lichen"
};

const MAP_VISUALIZATION = {
  min: 1,
  max: 4,
  palette: [
    "2ca25f",
    "ffff66",
    "fd8d3c",
    "bd0026"
  ],
  format: "png"
};

const PERMANENT_WATER_VISUALIZATION = {
  min: 1,
  max: 1,
  palette: ["#2166AC"],
  format: "png"
};

const MODEL_STATUS = "Preliminary - Not Validated";
const WATER_MASK_METADATA = {
  source: "ESA WorldCover 2021 (ESA/WorldCover/v200)",
  class: 80,
  method: "waterBoolean = landcover.eq(80); permanentWaterOverlay = waterBoolean.selfMask(); landMask = waterBoolean.not().updateMask(landcover.mask())",
  limitations: [
    "WorldCover represents land cover for 2021, not live conditions.",
    "Class 80 may include seasonal or mapped water and may omit smaller water bodies.",
    "Land-cover classification and 10 m source resolution limit mask accuracy.",
    "The mask does not estimate flood depth, flood probability, or forecast flood events."
  ]
};

const LAYER_DEFINITIONS = [
  {
    id: "hazard",
    name: "Flood Hazard",
    description: "Existing AHP-weighted relative flood hazard classification.",
    units: "class",
    type: "categorical",
    visualization: MAP_VISUALIZATION,
    legend: [
      { label: "Low", color: "#2CA25F", value: 1 },
      { label: "Moderate", color: "#FFFF66", value: 2 },
      { label: "High", color: "#FD8D3C", value: 3 },
      { label: "Very High", color: "#BD0026", value: 4 }
    ],
    waterMask: WATER_MASK_METADATA
  },
  {
    id: "elevation",
    name: "Elevation",
    description: "Raw NASA SRTM terrain elevation.",
    units: "meters",
    type: "continuous",
    visualization: {
      min: 0,
      max: 1000,
      palette: ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"]
    },
    legend: { min: 0, max: 1000, units: "meters" }
  },
  {
    id: "slope",
    name: "Terrain Slope",
    description: "Raw terrain slope derived from NASA SRTM.",
    units: "degrees",
    type: "continuous",
    visualization: {
      min: 0,
      max: 45,
      palette: ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"]
    },
    legend: { min: 0, max: 45, units: "degrees" }
  },
  {
    id: "water-proximity",
    name: "Water Proximity",
    description: "Approximate distance to JRC historical surface water.",
    units: "meters",
    type: "continuous",
    visualization: {
      min: 0,
      max: 5000,
      palette: ["#08519c", "#3182bd", "#6baed6", "#bdd7e7", "#eff3ff"]
    },
    legend: {
      min: 0,
      max: 5000,
      units: "meters",
      note: "Approximate distance to historical surface water; not a validated river-network distance."
    }
  },
  {
    id: "land-cover",
    name: "Land Cover",
    description: "Raw ESA WorldCover land-cover classification.",
    units: "class code",
    type: "categorical",
    visualization: {
      min: 10,
      max: 100,
      palette: [
        "#006400", "#ffbb22", "#ffff4c", "#f096ff", "#fa0000",
        "#b4b4b4", "#f0f0f0", "#0064c8", "#0096a0", "#00cf75", "#fae6a0"
      ]
    },
    legend: [
      { label: "Tree Cover", color: "#006400", value: 10 },
      { label: "Shrubland", color: "#ffbb22", value: 20 },
      { label: "Grassland", color: "#ffff4c", value: 30 },
      { label: "Cropland", color: "#f096ff", value: 40 },
      { label: "Built-up", color: "#fa0000", value: 50 },
      { label: "Bare / Sparse Vegetation", color: "#b4b4b4", value: 60 },
      { label: "Snow and Ice", color: "#f0f0f0", value: 70 },
      { label: "Permanent Water Bodies", color: "#0064c8", value: 80 },
      { label: "Herbaceous Wetland", color: "#0096a0", value: 90 },
      { label: "Mangroves", color: "#00cf75", value: 95 },
      { label: "Moss and Lichen", color: "#fae6a0", value: 100 }
    ]
  },
  {
    id: "population",
    name: "Population Distribution",
    description: "Estimated residential population per GHSL 2020 source grid cell.",
    units: "people per 100 m cell",
    type: "continuous",
    visualization: {
      min: 0,
      max: 500,
      palette: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]
    },
    legend: {
      min: 0,
      max: 500,
      units: "people per 100 m cell",
      note: "Estimated residential population; not a flood probability or confirmed affected-population layer."
    }
  }
];

const layerById = new Map(
  LAYER_DEFINITIONS.map((layer) => [layer.id, layer])
);

const round = (value, digits = 3) => {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? Number(number.toFixed(digits))
    : null;
};

function getTileUrl(mapInfo) {
  return (
    mapInfo?.urlFormat ||
    mapInfo?.tile_fetcher?.url_format ||
    mapInfo?.tileFetcher?.urlFormat ||
    null
  );
}

function getFactor(value, score, contribution, weight) {
  return {
    value: round(value),
    score: round(score),
    weight: round(weight, 6),
    weightPercentage: round(weight * 100, 2),
    contribution: round(contribution, 4)
  };
}

// ============================================
// FUNCTION: ELEVATION TEST
// Existing endpoint preserved
// ============================================

async function getElevationTest(req, res) {
  try {
    await initializeEarthEngine();

    const point = ee.Geometry.Point([
      79.92,
      6.96
    ]);

    const elevation = ee
      .Image("USGS/SRTMGL1_003")
      .select("elevation");

    elevation.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: point,
      scale: 30,
      maxPixels: 1000000
    }).evaluate((result, error) => {

      if (error) {
        console.error(
          "Elevation calculation error:",
          error
        );

        return res.status(500).json({
          success: false,
          message: "Failed to calculate elevation"
        });
      }

      if (
        !result ||
        typeof result.elevation !== "number"
      ) {
        return res.status(502).json({
          success: false,
          message: "Elevation data is unavailable"
        });
      }

      return res.json({
        success: true,
        location: {
          longitude: 79.92,
          latitude: 6.96
        },
        elevation: result.elevation,
        unit: "meters"
      });
    });

  } catch (error) {
    console.error("Earth Engine error:", error);

    return res.status(500).json({
      success: false,
      message: "Earth Engine connection failed"
    });
  }
}

// ============================================
// FUNCTION: ADVANCED GIS HAZARD ANALYSIS
//
// GET /api/flood/hazard
// ============================================

async function getHazardAnalysis(req, res) {
  try {
    const analysis = await getCachedHazardAnalysis();

    ee.Dictionary({
      areaStats: analysis.areaStats,
      permanentWaterAreaKm2: analysis.permanentWaterAreaStats.get("area_km2"),
      validRasterAreaKm2: analysis.validRasterAreaStats.get("area_km2"),
      studyAreaKm2: analysis.studyAreaKm2
    }).evaluate((result, error) => {

      if (error) {
        console.error(
          "Hazard calculation error:",
          error
        );

        return res.status(500).json({
          success: false,
          message: "Failed to calculate flood hazard"
        });
      }

      const groups = Array.isArray(result?.areaStats?.groups)
        ? result.areaStats.groups
        : [];

      const validGroups = groups.filter(
        (item) =>
          Number.isFinite(item?.sum) &&
          Number.isFinite(item?.hazard_class) &&
          CLASS_LABELS[item.hazard_class]
      );

      const analyzedLandArea = validGroups.reduce(
        (sum, item) => sum + item.sum,
        0
      );

      if (analyzedLandArea <= 0) {
        return res.status(502).json({
          success: false,
          message: "No classified hazard area was returned."
        });
      }

      // Always return all four hazard categories
      const summary = [1, 2, 3, 4].map(
        (classId) => {
          const item = validGroups.find(
            (group) =>
              Number(group.hazard_class) === classId
          );

          const area = item?.sum || 0;

          return {
            classId,
            hazardClass: CLASS_LABELS[classId],
            areaKm2: round(area, 2),
            percentage: round(
              (area / analyzedLandArea) * 100,
              2
            )
          };
        }
      );

      const permanentWaterArea = Number(result?.permanentWaterAreaKm2) || 0;
      const validRasterArea = Number(result?.validRasterAreaKm2) || 0;
      const studyAreaKm2 = Number(result?.studyAreaKm2) || 0;
      const noDataArea = Math.max(
        0,
        validRasterArea - permanentWaterArea - analyzedLandArea
      ) + Math.max(0, studyAreaKm2 - validRasterArea);

      // Generate the land-only hazard map and a separate water overlay.
      analysis.landHazardClass.getMapId(
        MAP_VISUALIZATION,
        (mapInfo, mapError) => {

          if (mapError) {
            console.error(
              "Map tile error:",
              mapError
            );

            return res.status(500).json({
              success: false,
              message: "Failed to generate hazard map tiles"
            });
          }

          const tileUrl = getTileUrl(mapInfo);

          if (!tileUrl) {
            return res.status(502).json({
              success: false,
              message: "Earth Engine did not return a tile URL"
            });
          }

          analysis.permanentWaterOverlay.getMapId(
            PERMANENT_WATER_VISUALIZATION,
            (waterMapInfo, waterMapError) => {
              if (waterMapError) {
                console.error(
                  "Permanent water map tile error:",
                  waterMapError
                );

                return res.status(500).json({
                  success: false,
                  message: "Failed to generate permanent-water map tiles"
                });
              }

              const permanentWaterTileUrl = getTileUrl(waterMapInfo);

              if (!permanentWaterTileUrl) {
                return res.status(502).json({
                  success: false,
                  message: "Earth Engine did not return a water tile URL"
                });
              }

              return res.json({
                success: true,

            component:
              "AHP-Weighted GIS Flood Hazard Estimation",

            status: MODEL_STATUS,

            // Existing field retained as the classified land area.
            totalAreaKm2: round(analyzedLandArea, 2),
            studyAreaKm2: round(studyAreaKm2, 2),
            permanentWaterAreaKm2: round(permanentWaterArea, 2),
            analyzedLandAreaKm2: round(analyzedLandArea, 2),
            noDataAreaKm2: round(noDataArea, 2),
            areaStatistics: {
              scaleMeters: 30,
              areaUnit: "km2",
              studyAreaSource: "HydroBASINS AOI geometry area",
              rasterAreaSource: "Earth Engine pixelArea reduced over the AOI",
              percentagesDenominator: "analyzed classified land area",
              reconciliationNote:
                "Raster and geometry totals can differ slightly because of rasterization and reduction tolerance."
            },

            hazardSummary: summary,

            map: {
              tileUrl,
              permanentWaterTileUrl,
              permanentWater: WATER_MASK_METADATA,
              legend: [
                { class: "Low", value: 1 },
                { class: "Moderate", value: 2 },
                { class: "High", value: 3 },
                { class: "Very High", value: 4 }
              ]
            },

            // NEW: AHP metadata
            ahp: analysis.ahp,

            weights: analysis.weights,

            methodology: analysis.methodology,

            waterMask: WATER_MASK_METADATA,

            datasets: {
              elevation: "NASA SRTM 30m",
              slope: "Derived from NASA SRTM",
              landcover: "ESA WorldCover 2021",
              water:
                "JRC Global Surface Water Occurrence"
            },

            note:
              "This map uses demonstration AHP weights " +
              "and preliminary classification thresholds. " +
              "The Lower Kelani boundary is provisional. " +
              "Historical flood validation is pending."
              });
            }
          );
        }
      );
    });

  } catch (error) {
    console.error("Hazard API error:", error);

    return res.status(500).json({
      success: false,
      message: "Flood hazard analysis failed"
    });
  }
}

async function getPopulationExposure(req, res) {
  try {
    const exposure = await getCachedPopulationExposure();

    ee.Dictionary({
      stats: exposure.populationStats,
      nativeScaleMeters: exposure.populationProjection.nominalScale()
    }).evaluate((result, error) => {
      if (error) {
        console.error("Population exposure calculation error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to calculate population exposure."
        });
      }

      const stats = result?.stats || {};
      const totalPopulation = Number(stats.study_area_population);
      const classValues = [1, 2, 3, 4].map((classId) => ({
        classId,
        population: Number(stats[`population_class_${classId}`])
      }));

      if (
        !Number.isFinite(totalPopulation) ||
        totalPopulation < 0 ||
        classValues.some(
          (item) => !Number.isFinite(item.population) || item.population < 0
        )
      ) {
        console.error("Invalid population exposure values:", stats);
        return res.status(502).json({
          success: false,
          message: "Earth Engine returned invalid population exposure values."
        });
      }

      const classifiedLandPopulation = classValues.reduce(
        (sum, item) => sum + item.population,
        0
      );
      const highAndVeryHighExposure =
        classValues[2].population + classValues[3].population;
      const unallocatedPopulation = Math.max(
        0,
        totalPopulation - classifiedLandPopulation
      );
      const safePercentage = (value, denominator) =>
        denominator > 0 ? (value / denominator) * 100 : 0;

      return res.json({
        success: true,
        dataset: "JRC/GHSL/P2023A/GHS_POP/2020",
        year: 2020,
        nativeResolutionMeters: Number(result.nativeScaleMeters) || 100,
        studyAreaPopulation: totalPopulation,
        classifiedLandPopulation,
        populationByHazardClass: classValues.map((item) => ({
          classId: item.classId,
          hazardClass: CLASS_LABELS[item.classId],
          population: item.population,
          percentageOfStudyAreaPopulation: safePercentage(
            item.population,
            totalPopulation
          ),
          percentageOfClassifiedLandPopulation: safePercentage(
            item.population,
            classifiedLandPopulation
          )
        })),
        highAndVeryHighExposure,
        highAndVeryHighPercentage: safePercentage(
          highAndVeryHighExposure,
          totalPopulation
        ),
        unallocatedPopulation,
        methodology: {
          populationMeasure: "Estimated residential population per source grid cell",
          populationGrid: "GHSL 2020 population_count at native 100 m resolution",
          hazardGrid: "Existing 30 m land-only hazard class raster",
          allocation:
            "Each 100 m population-cell count is multiplied by the area-weighted fraction of each 30 m hazard class within that cell.",
          permanentWater: "Permanent-water pixels are absent from land hazard indicators and remain unallocated.",
          boundary:
            "Study-area totals use native population-cell reductions over the HydroBASINS study geometry; boundary-cell rasterization can create small reconciliation differences.",
          zeroPopulation:
            "Valid zero-population cells remain zero and are not treated as missing."
        },
        limitations: [
          "GHSL is an estimated population distribution, not an exact census count per building.",
          "Population exposure is not actual inundation or confirmed affected people.",
          "Population allocation within source cells introduces spatial uncertainty.",
          "The AHP hazard surface remains a preliminary research model with demonstration weights.",
          "This module does not estimate mortality, economic damage, flood depth, or real-time flooding."
        ]
      });
    });
  } catch (error) {
    console.error("Population exposure API error:", error);
    return res.status(500).json({
      success: false,
      message: "Population exposure analysis failed."
    });
  }
}

async function getPopulationLayer(req, res) {
  try {
    const exposure = await getCachedPopulationExposure();
    exposure.population.getMapId(
      layerById.get("population").visualization,
      (mapInfo, mapError) => {
        if (mapError) {
          console.error("Population layer map error:", mapError);
          return res.status(502).json({
            success: false,
            message: "Failed to generate population visualization tiles."
          });
        }

        const tileUrl = getTileUrl(mapInfo);
        if (!tileUrl) {
          return res.status(502).json({
            success: false,
            message: "Earth Engine did not return population tile URL."
          });
        }

        const layer = layerById.get("population");
        return res.json({
          success: true,
          layer: {
            id: layer.id,
            name: layer.name,
            description: layer.description,
            units: layer.units,
            type: layer.type,
            tileUrl,
            legend: layer.legend,
            visualization: layer.visualization,
            dataset: "JRC/GHSL/P2023A/GHS_POP/2020",
            year: 2020,
            nativeResolutionMeters: 100
          }
        });
      }
    );
  } catch (error) {
    console.error("Population layer API error:", error);
    return res.status(500).json({
      success: false,
      message: "Population visualization processing failed."
    });
  }
}

// ============================================
// FUNCTION: ADVANCED LOCATION INSPECTION
//
// GET /api/flood/inspect?lat=6.96&lon=79.92
// ============================================

async function inspectFloodHazard(req, res) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);

    if (
      req.query.lat === undefined ||
      req.query.lon === undefined ||
      String(req.query.lat).trim() === "" ||
      String(req.query.lon).trim() === "" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid latitude and longitude are required."
      });
    }

    const analysis = await getCachedHazardAnalysis();

    const point = ee.Geometry.Point([
      lon,
      lat
    ]);

    // Sample WorldCover independently because land-only hazard bands are
    // intentionally masked over water pixels.
    const waterSample = analysis.factorLayers.landcover
      .reduceRegion({
        reducer: ee.Reducer.first(),
        geometry: point,
        scale: 30,
        maxPixels: 10000
      });

    waterSample.evaluate((waterResult, waterError) => {

      if (waterError) {
        console.error(
          "GEE WorldCover inspection error:",
          waterError
        );

        return res.status(500).json({
          success: false,
          message: "Could not inspect this location."
        });
      }

      const landcoverCode = waterResult?.landcover_code;

      if (!Number.isFinite(Number(landcoverCode))) {
        return res.json({
          success: true,
          insideClassifiedArea: false,
          isPermanentWater: null,
          landHazardApplicable: false,
          landHazardClass: null,
          landHazardIndex: null,
          latitude: lat,
          longitude: lon,
          status: MODEL_STATUS,
          message:
            "No valid WorldCover or land-hazard data is available at this location."
        });
      }

      const isPermanentWater = Number(landcoverCode) === 80;

      if (isPermanentWater) {
        return res.json({
          success: true,
          insideClassifiedArea: false,
          isPermanentWater: true,
          landHazardApplicable: false,
          landHazardClass: null,
          landHazardIndex: null,
          latitude: lat,
          longitude: lon,
          status: MODEL_STATUS,
          waterMask: WATER_MASK_METADATA,
          message:
            "This location is classified as permanent water. Land flood-hazard classification is not applicable."
        });
      }

      const sample = analysis.inspectionImage
        .reduceRegion({
          reducer: ee.Reducer.first(),
          geometry: point,
          scale: 30,
          maxPixels: 10000
        });

      sample.evaluate((result, error) => {
        if (error) {
          console.error(
            "GEE land inspection error:",
            error
          );

          return res.status(500).json({
            success: false,
            message: "Could not inspect this location."
          });
        }

        const classId = result?.land_hazard_class;
        const hazardIndex = result?.land_hazard_index;

        if (
          classId === null ||
          classId === undefined ||
          hazardIndex === null ||
          hazardIndex === undefined
        ) {
          return res.json({
            success: true,
            insideClassifiedArea: false,
            isPermanentWater: false,
            landHazardApplicable: false,
            landHazardClass: null,
            landHazardIndex: null,
            latitude: lat,
            longitude: lon,
            status: MODEL_STATUS,
            message:
              "WorldCover identifies this as non-water, but no valid land-hazard data is available at this location."
          });
        }

        const classNumber = Number(classId);

        if (
          !Number.isFinite(classNumber) ||
          !CLASS_LABELS[classNumber]
        ) {
          return res.status(502).json({
            success: false,
            message: "Invalid hazard classification returned."
          });
        }

        // ------------------------------------------
        // 1. RAW GIS MEASUREMENTS
        // ------------------------------------------

        const sampledLandcoverCode = round(
          result.landcover_code,
          0
        );

        const rawMeasurements = {
        elevationMeters: round(
          result.elevation_m,
          2
        ),

        slopeDegrees: round(
          result.slope_degrees,
          2
        ),

        distanceToWaterMeters: round(
          result.water_distance_m,
          2
        ),

          landcoverCode: sampledLandcoverCode,

          landcoverName:
            LANDCOVER_LABELS[sampledLandcoverCode] ||
            "Unknown"
        };

      // ------------------------------------------
      // 2. FACTOR SCORES AND CONTRIBUTIONS
      // ------------------------------------------

        const factors = {
        elevation: getFactor(
          result.elevation_m,
          result.elevation_score,
          result.elevation_contribution,
          analysis.weights.elevation
        ),

        slope: getFactor(
          result.slope_degrees,
          result.slope_score,
          result.slope_contribution,
          analysis.weights.slope
        ),

        distanceToWater: getFactor(
          result.water_distance_m,
          result.water_distance_score,
          result.water_contribution,
          analysis.weights.waterDistance
        ),

        landcover: {
          ...getFactor(
            result.landcover_code,
            result.landcover_score,
            result.landcover_contribution,
            analysis.weights.landcover
          ),

            category:
              rawMeasurements.landcoverName
          }
        };

      // ------------------------------------------
      // 3. BASELINE COMPARISON
      // ------------------------------------------

        const baselineClassId = round(
          result.equal_weight_class,
          0
        );

        const comparison = {
        ahpIndex: round(
          result.hazard_index,
          3
        ),

        equalWeightIndex: round(
          result.equal_weight_index,
          3
        ),

        difference: round(
          result.ahp_minus_equal_index,
          3
        ),

        ahpHazardClass:
          CLASS_LABELS[classNumber],

        equalWeightHazardClass:
          CLASS_LABELS[baselineClassId] ||
          "Unknown",

        classificationChanged:
          baselineClassId !== null &&
          baselineClassId !== classNumber
      };

      // ------------------------------------------
      // 4. FINAL RESPONSE
      // Keep old frontend fields unchanged
      // ------------------------------------------

        return res.json({
        success: true,

        insideClassifiedArea: true,
        isPermanentWater: false,
        landHazardApplicable: true,

        latitude: lat,
        longitude: lon,

        // Existing frontend compatibility
        classId: classNumber,

        hazardClass:
          CLASS_LABELS[classNumber],

        hazardIndex: round(
          hazardIndex,
          3
        ),
        landHazardClass: CLASS_LABELS[classNumber],
        landHazardIndex: round(hazardIndex, 3),

        status: MODEL_STATUS,

        // New advanced analysis
        model:
          "AHP-Weighted GIS Multi-Criteria Analysis",

        rawMeasurements,

        factors,

        comparison,

        ahp: {
          weights: analysis.weights,
          consistencyRatio:
            analysis.ahp.consistencyRatio,

          consistencyAcceptable:
            analysis.ahp.consistencyAcceptable,

          researchStatus:
            analysis.ahp.researchStatus
        },

        waterMask: WATER_MASK_METADATA,

        interpretation:
          "The hazard index is calculated from " +
          "four reclassified GIS factors using " +
          "demonstration AHP weights. " +
          "This is a relative hazard estimate, " +
          "not a prediction of flood depth or timing."
        });
      });
    });

  } catch (error) {
    console.error(
      "Inspection endpoint error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Flood hazard inspection failed."
    });
  }
}

async function listFloodLayers(req, res) {
  return res.json({
    success: true,
    layers: LAYER_DEFINITIONS.map(
      ({ id, name, description, units, type, legend, visualization, waterMask }) => ({
        id,
        name,
        description,
        units,
        type,
        legend,
        visualization,
        ...(waterMask ? { waterMask } : {}),
        ...(id === "population"
          ? {
              dataset: "JRC/GHSL/P2023A/GHS_POP/2020",
              year: 2020,
              nativeResolutionMeters: 100
            }
          : {})
      })
    )
  });
}

async function getFloodLayer(req, res) {
  const layer = layerById.get(req.params.layerId);

  if (!layer) {
    return res.status(404).json({
      success: false,
      message: "Unsupported flood layer.",
      supportedLayers: LAYER_DEFINITIONS.map((item) => item.id)
    });
  }

  try {
    if (layer.id === "population") {
      return getPopulationLayer(req, res);
    }

    const analysis = await getCachedHazardAnalysis();
    const images = {
      hazard: analysis.landHazardClass,
      elevation: analysis.factorLayers.elevation,
      slope: analysis.factorLayers.slope,
      "water-proximity": analysis.factorLayers.distanceToWater,
      "land-cover": analysis.factorLayers.landcover
    };
    const image = images[layer.id];

    if (!image) {
      return res.status(500).json({
        success: false,
        message: "Flood layer image is unavailable."
      });
    }

    image.getMapId(layer.visualization, (mapInfo, mapError) => {
      if (mapError) {
        console.error(`Flood layer ${layer.id} map error:`, mapError);
        return res.status(502).json({
          success: false,
          message: "Failed to generate flood layer tiles."
        });
      }

      const tileUrl = getTileUrl(mapInfo);

      if (!tileUrl) {
        return res.status(502).json({
          success: false,
          message: "Earth Engine did not return a tile URL."
        });
      }

      const sendLayer = (permanentWaterTileUrl = null) => res.json({
        success: true,
        layer: {
          id: layer.id,
          name: layer.name,
          description: layer.description,
          units: layer.units,
          type: layer.type,
          tileUrl,
          ...(permanentWaterTileUrl ? { permanentWaterTileUrl } : {}),
          legend: layer.legend,
          visualization: layer.visualization,
          ...(layer.id === "hazard" ? { waterMask: WATER_MASK_METADATA } : {})
        }
      });

      if (layer.id !== "hazard") {
        return sendLayer();
      }

      return analysis.permanentWaterOverlay.getMapId(
        PERMANENT_WATER_VISUALIZATION,
        (waterMapInfo, waterMapError) => {
          if (waterMapError) {
            console.error("Flood layer water map error:", waterMapError);
            return res.status(502).json({
              success: false,
              message: "Failed to generate permanent-water tiles."
            });
          }

          const permanentWaterTileUrl = getTileUrl(waterMapInfo);
          if (!permanentWaterTileUrl) {
            return res.status(502).json({
              success: false,
              message: "Earth Engine did not return a water tile URL."
            });
          }

          return sendLayer(permanentWaterTileUrl);
        }
      );
    });
  } catch (error) {
    console.error(`Flood layer ${layer.id} error:`, error);
    return res.status(500).json({
      success: false,
      message: "Flood layer processing failed."
    });
  }
}

// ============================================
// EXPORT ALL CONTROLLER FUNCTIONS
// ============================================

module.exports = {
  getElevationTest,
  getHazardAnalysis,
  inspectFloodHazard,
  getPopulationExposure,
  getPopulationLayer,
  listFloodLayers,
  getFloodLayer
};
