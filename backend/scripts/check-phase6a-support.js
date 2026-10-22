require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { evaluate, bounded } = require('../services/sarPreviewService');

// Compatibility audit only. A disjoint reference cannot justify computing
// classification metrics. Uses the original Earth Engine AOI, without repair.
async function main() {
  const folder = path.resolve(__dirname, '..', 'artifacts/phase6a-reference-acquisition');
  const audit = JSON.parse(await fs.readFile(path.join(folder, 'geodata-audit.json'), 'utf8'));
  const output = { status: 'running', executedAt: new Date().toISOString(), results: [] };
  try {
    const { ee, initializeEarthEngine } = require('../services/earthEngineService');
    const hazardHash = crypto.createHash('sha256').update(await fs.readFile(path.resolve(__dirname, '../services/hazardService.js'))).digest('hex');
    if (hazardHash !== audit.aoiProvenance.hazardServiceSha256) throw new Error('Production AOI source changed; repeat the geodata audit.');
    await bounded(initializeEarthEngine(), 120000, 'Phase 6A audit initialization');
    const { aoi } = await require('../services/hazardService').getCachedHazardAnalysis();
    const values = {};
    for (const pkg of audit.packages) for (const layer of pkg.layers) {
      if (!/area_of_interest|crisis_information_poly/.test(layer.member)) continue;
      if (layer.invalidFeatures.length) throw new Error(`Invalid source geometry: ${layer.member}`);
      const bytes = await fs.readFile(path.join(folder, layer.geojsonFile));
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== layer.geojsonSha256) throw new Error('Converted geometry checksum changed: ' + layer.geojsonFile);
      const geojson = JSON.parse(bytes.toString('utf8'));
      // Vertices were transformed using declared EPSG:32644 source .prj.
      // Edges are short planar WGS84 segments, not global geodesic arcs.
      const fc = ee.FeatureCollection(geojson.features.map(feature => ee.Feature(ee.Geometry(feature.geometry, 'EPSG:4326', false), feature.properties)));
      values[layer.member] = fc.geometry(1).intersection(aoi, 1).area(1).divide(1e6);
    }
    const intersections = await bounded(evaluate(ee.Dictionary(values)), 240000, 'Phase 6A reference/AOI intersection');
    for (const [member, area] of Object.entries(intersections)) {
      if (!Number.isFinite(area) || area < 0) throw new Error(`Missing intersection result: ${member}`);
      output.results.push({ member, lowerKelaniAreaKm2: area,
        commonSarSupportIntersectionKm2: area === 0 ? 0 : null,
        sarIntersectionBasis: area === 0 ? 'Exact AOI intersection is zero; all SAR support is clipped to that AOI, so its intersection is also zero.' : 'SAR support must be measured separately before validation.' });
    }
    output.status = output.results.every(r => r.lowerKelaniAreaKm2 === 0) ? 'REFERENCE_INCOMPATIBLE' : 'FURTHER_SUPPORT_AUDIT_REQUIRED';
    output.method = 'Original live Function 1 Earth Engine AOI; converted official vector geometries; intersection.area(maxError=1 m). No candidate or accuracy evaluation.';
  } catch (error) { output.status = 'DATA_NOT_READY'; output.error = error.message || String(error); process.exitCode = 1; }
  await fs.writeFile(path.join(folder, 'earth-engine-support-audit.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
