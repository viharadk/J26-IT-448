import test from 'node:test';
import assert from 'node:assert/strict';
import { Inspection } from '../src/api/flood';
import { analysisState, factorRows, formatBoolean, formatValue, formatWeight, largestContributor } from '../src/analysis/locationAnalysis';

const land: Inspection = {
  success: true, insideClassifiedArea: true, isPermanentWater: false,
  landHazardClass: 'Low', landHazardIndex: 0,
  rawMeasurements: { elevationMeters: 0, slopeDegrees: 0, distanceToWaterMeters: 0, landcoverName: 'Built-up' },
  factors: {
    elevation: { value: 0, score: 0, weight: 0, contribution: 0 },
    slope: { value: 0, score: 1, weight: 0.2, contribution: 0.2 },
    distanceToWater: { value: 0, score: 2, weight: 0.3, contribution: 0.6 },
    landcover: { category: 'Built-up', score: 3, weight: 0.5, contribution: 1.5 },
  },
  ahp: { weights: { elevation: 0, slope: 0.2, waterDistance: 0.3, landcover: 0.5 }, consistencyRatio: 0, consistencyAcceptable: true },
};
test('formats zeros, missing values and false comparison flags distinctly', () => {
  assert.equal(formatValue(0, ' m'), '0 m');
  assert.equal(formatWeight(0), '0.0%');
  for (const value of [null, undefined, '', NaN, Infinity]) assert.equal(formatValue(value), 'Unavailable');
  assert.equal(formatWeight(null), 'Unavailable');
  assert.equal(formatBoolean(false), 'No');
  assert.equal(formatBoolean(undefined), 'Unavailable');
  assert.equal(formatValue(-0.25), '-0.25');
});
test('water takes precedence and absent hazard values do not become land results', () => {
  assert.equal(analysisState(land), 'land');
  assert.equal(analysisState({ ...land, isPermanentWater: true }), 'water');
  assert.equal(analysisState({ ...land, insideClassifiedArea: false }), 'no-data');
  assert.equal(analysisState({ ...land, landHazardIndex: null }), 'no-data');
  assert.equal(analysisState({ ...land, landHazardApplicable: false }), 'no-data');
});
test('maps backend fields and waterDistance methodology weight without recomputing contributions', () => {
  const rows = factorRows(land);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => row.value), [0, 0, 0, 'Built-up']);
  assert.equal(rows[2].methodologyWeight, 0.3);
  assert.equal(rows[2].factor?.contribution, 0.6);
  assert.equal(rows[2].barWidth, 12);
  assert.equal(largestContributor(land), 'landcover');
});
test('missing contributions are unavailable, while measured zero remains chart data', () => {
  const empty = { ...land, rawMeasurements: null, factors: null, ahp: null };
  assert.equal(largestContributor(empty), null);
  assert.ok(factorRows(empty).every(row => row.barWidth === 0 && row.value == null));
  const zero = { ...empty, factors: { elevation: { contribution: 0 } } };
  assert.equal(largestContributor(zero), 'elevation');
  assert.equal(factorRows(zero)[0].barWidth, 0);
});

test('all four cards retain backend scores, weights and contributions with raw-measurement fallbacks', () => {
  const rows = factorRows({ ...land, rawMeasurements: null });
  assert.deepEqual(rows.map(row => row.key), ['elevation', 'slope', 'distanceToWater', 'landcover']);
  assert.deepEqual(rows.map(row => row.value), [0, 0, 0, 'Built-up']);
  for (const row of rows) assert.equal(row.factor, land.factors?.[row.key]);
  assert.deepEqual(rows.map(row => row.barWidth), [0, 4, 12, 30]);
});

test('contribution bars clamp only the visual width on the shared 0 to 5 scale', () => {
  for (const [contribution, width] of [[-1, 0], [0, 0], [1.6, 32], [5, 100], [6, 100], [NaN, 0], [Infinity, 0]]) {
    const row = factorRows({ ...land, factors: { elevation: { contribution } } })[0];
    assert.equal(row.barWidth, width);
    assert.equal(row.factor?.contribution, contribution);
  }
});
