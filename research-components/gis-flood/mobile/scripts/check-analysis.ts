import assert from 'node:assert/strict';
import { inspectLocation } from '../src/api/flood';
import { analysisState, factorRows, finiteNumber } from '../src/analysis/locationAnalysis';

async function main() {
  const signal = new AbortController().signal;
  const land = await inspectLocation(6.925, 79.95, signal);
  assert.equal(analysisState(land), 'land');
  for (const row of factorRows(land)) {
    assert.ok(row.value != null, `${row.key} raw value missing`);
    for (const key of ['score', 'weight', 'contribution'] as const) assert.ok(finiteNumber(row.factor?.[key]), `${row.key}.${key} missing`);
    assert.ok(finiteNumber(row.methodologyWeight), `${row.key} methodology weight missing`);
  }
  for (const value of [land.comparison?.ahpIndex, land.comparison?.equalWeightIndex, land.comparison?.difference, land.ahp?.consistencyRatio]) assert.ok(finiteNumber(value));
  assert.equal(typeof land.comparison?.classificationChanged, 'boolean');
  console.log('PASS valid land:', JSON.stringify({ latitude: 6.925, longitude: 79.95, hazard: land.landHazardClass, index: land.landHazardIndex, rawMeasurements: land.rawMeasurements, factors: land.factors, comparison: land.comparison, ahp: land.ahp }));

  // Located from the existing water raster and independently confirmed by inspect.
  const latitude = 6.908192778752052, longitude = 80.05514144897461;
  const water = await inspectLocation(latitude, longitude, signal);
  assert.equal(water.isPermanentWater, true);
  assert.equal(analysisState(water), 'water');
  assert.equal(water.landHazardApplicable, false);
  assert.equal(water.landHazardIndex, null);
  console.log('PASS permanent water:', JSON.stringify({ latitude, longitude, isPermanentWater: water.isPermanentWater, message: water.message }));
  const noData = await inspectLocation(0, 0, signal);
  assert.equal(analysisState(noData), 'no-data');
  console.log('PASS no-data point (0, 0):', noData.message);
}
main().catch(error => { console.error('FAIL AHP integration:', error.message); process.exitCode = 1; });
