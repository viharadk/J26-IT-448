
const FACTORS = [
  "Elevation",
  "Slope",
  "Distance to Water",
  "Land Cover"
];

// DEMONSTRATION MATRIX ONLY.
// These judgments must be justified using
// literature or expert assessment before
// being used in the research model.

const comparisonMatrix = [
  [1,     2,   4 / 3, 4],
  [1 / 2, 1,   2 / 3, 2],
  [3 / 4, 3 / 2, 1,   3],
  [1 / 4, 1 / 2, 1 / 3, 1]
];

const randomIndex = {
  1: 0,
  2: 0,
  3: 0.58,
  4: 0.90,
  5: 1.12,
  6: 1.24,
  7: 1.32,
  8: 1.41,
  9: 1.45,
  10: 1.49
};

function calculateAHP(matrix = comparisonMatrix) {
  const n = matrix.length;

  if (
    n < 2 ||
    n > 10 ||
    matrix.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== n ||
        row.some(
          (value) =>
            !Number.isFinite(value) || value <= 0
        )
    )
  ) {
    throw new Error("Invalid AHP comparison matrix.");
  }

  // Check pairwise reciprocal consistency
  const tolerance = 1e-6;

  for (let i = 0; i < n; i++) {
    if (Math.abs(matrix[i][i] - 1) > tolerance) {
      throw new Error("Matrix diagonal must equal 1.");
    }

    for (let j = i + 1; j < n; j++) {
      if (
        Math.abs(matrix[i][j] * matrix[j][i] - 1) >
        tolerance
      ) {
        throw new Error(
          "Matrix comparisons must be reciprocal."
        );
      }
    }
  }

  // Geometric mean method
  const geometricMeans = matrix.map((row) =>
    Math.exp(
      row.reduce(
        (sum, value) => sum + Math.log(value),
        0
      ) / n
    )
  );

  const total = geometricMeans.reduce(
    (sum, value) => sum + value,
    0
  );

  const weights = geometricMeans.map(
    (value) => value / total
  );

  // Weighted sum vector: A * w
  const weightedSums = matrix.map((row) =>
    row.reduce(
      (sum, value, j) =>
        sum + value * weights[j],
      0
    )
  );

  // Approximate principal eigenvalue
  const lambdaMax =
    weightedSums.reduce(
      (sum, value, i) =>
        sum + value / weights[i],
      0
    ) / n;

  const consistencyIndex =
    (lambdaMax - n) / (n - 1);

  const ri = randomIndex[n];

  const consistencyRatio =
    ri === 0
      ? 0
      : consistencyIndex / ri;

  const factorWeights = FACTORS.slice(0, n).map(
    (factor, index) => ({
      factor,
      weight: Number(weights[index].toFixed(6)),
      percentage: Number(
        (weights[index] * 100).toFixed(2)
      )
    })
  );

  return {
    method: "AHP - Geometric Mean Approximation",
    factorWeights,
    comparisonMatrix: matrix,
    lambdaMax: Number(lambdaMax.toFixed(6)),
    consistencyIndex: Number(
      consistencyIndex.toFixed(6)
    ),
    consistencyRatio: Number(
      consistencyRatio.toFixed(6)
    ),
    consistencyAcceptable:
      consistencyRatio <= 0.1,
    researchStatus:
      "Demonstration judgments - Not literature validated"
  };
}

module.exports = {
  FACTORS,
  comparisonMatrix,
  calculateAHP
};
