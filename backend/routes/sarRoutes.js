const express = require("express");
const { parseSarQuery } = require("../services/sarValidation");

function createSarRouter(service = require("../services/sarService").createSarService()) {
  const router = express.Router();
  for (const endpoint of ["scenes", "candidate-pairs"]) {
    router.get(`/${endpoint}`, async (req, res) => {
      try {
        const options = parseSarQuery(req.query, endpoint);
        const result = await (endpoint === "scenes" ? service.discover(options) : service.candidatePairs(options));
        res.json(result);
      } catch (error) {
        const status = [400, 429, 502, 503, 504].includes(error.status) ? error.status : 500;
        if (status === 429) res.set("Retry-After", "5");
        res.status(status).json({ success: false, code: status === 500 ? "SAR_INTERNAL_ERROR" : error.code || "SAR_INTERNAL_ERROR",
          message: status === 500 ? "SAR discovery failed unexpectedly." : error.message });
      }
    });
  }
  return router;
}
module.exports = { createSarRouter };
