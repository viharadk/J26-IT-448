const express = require("express");
const { createGeocodingService } = require("../services/geocodingService");

function createGeocodingRouter(service = createGeocodingService()) {
  const router = express.Router();
  router.get("/search", async (req, res) => {
    try { res.json({ success: true, places: await service.search(req.query.q) }); }
    catch (error) {
      if (error.status === 429) res.set("Retry-After", "60");
      res.status(error.status || 502).json({ success: false, message: error.message });
    }
  });
  return router;
}
module.exports = { createGeocodingRouter };
