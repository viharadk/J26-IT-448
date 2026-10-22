const express = require("express");
function createSarPreviewRouter(service = require("../services/sarPreviewService").createSarPreviewService()) {
  const router = express.Router();
  for (const [path, method] of [["preview", "preview"], ["pixel-quality", "pixelQuality"]]) {
    router.get(`/${path}`, async (req, res) => {
      try {
        if (Object.keys(req.query).length) return res.status(400).json({ success: false, code: "SAR_PREVIEW_INVALID_QUERY", message: "This bounded prototype uses the verified fixed pair and VV; query parameters are not accepted." });
        res.set("Cache-Control", "no-store");
        res.json(await service[method]());
      } catch (error) {
        const status = [502, 503, 504].includes(error.status) ? error.status : 500;
        res.status(status).json({ success: false, code: status === 500 ? "SAR_PREVIEW_INTERNAL_ERROR" : error.code,
          message: status === 500 ? "SAR preview failed unexpectedly." : error.message });
      }
    });
  }
  return router;
}
module.exports = { createSarPreviewRouter };
