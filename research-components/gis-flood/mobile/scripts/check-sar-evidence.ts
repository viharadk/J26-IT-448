import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSarTile, parseAnalysis, parseDiscovery, parsePreview, RESEARCH_IDS } from '../src/api/sar';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pass a fresh backend/scripts/check-sar-native.js verification.json path. This check uses real saved responses and live tile downloads.');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const discovery = parseDiscovery(data.discovery), preview = parsePreview(data.preview, RESEARCH_IDS.before, RESEARCH_IDS.later), analysis = parseAnalysis(data.analysis, RESEARCH_IDS.before, RESEARCH_IDS.later);
  assert.ok(discovery.periods.before.scenes.find(scene => scene.sceneId === RESEARCH_IDS.before));
  assert.ok(discovery.periods.flood.scenes.find(scene => scene.sceneId === RESEARCH_IDS.later));
  const coordinate = preview.quality.samples[0].geometry.coordinates;
  await Promise.all(Object.values(preview.layers).map(layer => checkSarTile(layer, coordinate)));
  if (analysis.candidateCoordinates[0]) await checkSarTile(analysis.layer, analysis.candidateCoordinates[0]);
  console.log('PASS: actual discovery, matching previews, candidate support and four live tile downloads through mobile TypeScript parsers.');
  console.log('Candidate km²:', analysis.areas.candidateAreaKm2, 'valid subset km²:', analysis.areas.validAnalysisAreaKm2);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
