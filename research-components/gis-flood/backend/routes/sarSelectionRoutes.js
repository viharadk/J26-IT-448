const express = require('express');
const { parseSelection, createSarSelectionService } = require('../services/sarSelectionService');
const { parseReferenceMethod } = require('../services/sarWaterReferenceService');
const { FILTER_KEYS, parseFilters } = require('../services/sarFiltering');
function createSarSelectionRouter(service = createSarSelectionService()) {
  const router = express.Router();
  for (const [path, method] of [['selected-preview', 'preview'], ['selected-pixel-quality', 'pixelQuality'], ['analysis', 'analyze']]) {
    router.get(`/${path}`, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const query = { ...req.query };
        const referenceMethod = method === 'analyze' ? parseReferenceMethod(query.referenceMethod) : undefined;
        const filters = {};
        if (method === 'analyze') {
          for (const key of FILTER_KEYS) { if (key in query) filters[key] = query[key]; delete query[key]; }
          parseFilters(filters);
        }
        if (method === 'analyze') delete query.referenceMethod;
        const selection = parseSelection(query);
        res.json(await service[method](selection, referenceMethod, filters));
      }
      catch (error) {
        const status = [400, 422, 429, 502, 503, 504].includes(error.status) ? error.status : 500;
        res.status(status).json({ success: false, code: status === 500 ? 'SAR_SELECTION_FAILED' : error.code,
          message: status === 500 ? 'Selected SAR operation failed unexpectedly.' : error.message });
      }
    });
  }
  return router;
}
module.exports = { createSarSelectionRouter };
