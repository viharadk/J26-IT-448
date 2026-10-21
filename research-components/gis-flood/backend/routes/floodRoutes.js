
const express = require("express");

const {
  getElevationTest,
  getHazardAnalysis,
  getPopulationExposure,
  getPopulationLayer,
  inspectFloodHazard,
  listFloodLayers,
  getFloodLayer
} = require("../controllers/floodController");

const router = express.Router();

// Existing elevation test
router.get("/elevation", getElevationTest);

// Existing 2D flood hazard map
router.get("/hazard", getHazardAnalysis);
router.get("/exposure/population", getPopulationExposure);
router.get("/exposure/population/layer", getPopulationLayer);

// NEW: Inspect flood hazard at selected location
router.get("/inspect", inspectFloodHazard);
router.get("/layers", listFloodLayers);
router.get("/layers/:layerId", getFloodLayer);

module.exports = router;
