const express = require('express');
const { loadResearchComparison } = require('../services/researchComparisonService');
const { createDynamicResearchComparisonService } = require('../services/dynamicResearchComparisonService');

function createResearchRouter(load = loadResearchComparison, dynamic = createDynamicResearchComparisonService()) {
  const router = express.Router();
  router.get('/ahp-sar-comparison', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, code: 'UNSUPPORTED_RESEARCH_QUERY', message: 'This historical case-study endpoint does not accept query parameters.' });
    try { return res.json(await load()); }
    catch { return res.status(500).json({ success: false, code: 'RESEARCH_COMPARISON_FAILED', message: 'Research comparison could not be loaded safely.' }); }
  });
  router.post('/dynamic-ahp-sar-comparisons', (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const response = dynamic.start(req.body);
      if (response.status === 202) res.set('Retry-After', '2');
      return res.status(response.status).json(response.body);
    } catch (error) {
      const status = [400, 404, 422, 429].includes(error.status) ? error.status : 500;
      if (status === 429) res.set('Retry-After', '5');
      return res.status(status).json({ success: false, code: status === 500 ? 'DYNAMIC_RESEARCH_START_FAILED' : error.code,
        message: status === 500 ? 'Dynamic research comparison could not be started safely.' : error.message });
    }
  });
  router.get('/dynamic-ahp-sar-comparisons/:jobId', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, code: 'DYNAMIC_RESEARCH_QUERY_INVALID', message: 'Dynamic job status does not accept query parameters.' });
    try { return res.json(dynamic.get(req.params.jobId)); }
    catch (error) {
      const status = error.status === 404 ? 404 : 500;
      return res.status(status).json({ success: false, code: status === 404 ? error.code : 'DYNAMIC_RESEARCH_STATUS_FAILED',
        message: status === 404 ? error.message : 'Dynamic research job status could not be loaded safely.' });
    }
  });
  return router;
}

module.exports = { createResearchRouter };
