// Phase 4B reference handling. Conservative annual support remains the default.
const CONSERVATIVE = 'yearly-conservative-v1';
const MONTHLY_DRY = 'yearly-monthly-dry-v1';
function parseReferenceMethod(value) {
  if (value === undefined) return CONSERVATIVE;
  if (typeof value !== 'string' || ![CONSERVATIVE, MONTHLY_DRY].includes(value)) throw Object.assign(new Error(`referenceMethod must be ${CONSERVATIVE} or ${MONTHLY_DRY}.`), { status: 400, code: 'SAR_REFERENCE_INVALID' });
  return value;
}
function referencePolicy(selection, year, method = CONSERVATIVE) {
  parseReferenceMethod(method);
  const date = selection.before.match(/_(\d{4})(\d{2})\d{2}T/);
  const cutoff = date ? `${date[1]}-${date[2]}-01` : null;
  if (method === MONTHLY_DRY && (!cutoff || cutoff > '2022-01-01')) throw Object.assign(new Error('The optional monthly method requires a complete pre-event monthly window ending no later than 2022-01-01.'), { status: 422, code: 'SAR_MONTHLY_REFERENCE_UNAVAILABLE' });
  return { method, version: 'phase4b-v1', annualDataset: 'JRC/GSW1_4/YearlyHistory', annualYear: year,
    annualAssetId: `JRC/GSW1_4/YearlyHistory/${year}`, annualClassDefinitions: { 0: 'no observations', 1: 'not water', 2: 'seasonal water', 3: 'permanent water' },
    monthlyDataset: method === MONTHLY_DRY ? 'JRC/GSW1_4/MonthlyHistory' : null,
    monthlyStart: method === MONTHLY_DRY ? `${year}-01-01` : null, monthlyEndExclusive: method === MONTHLY_DRY ? cutoff : null,
    minimumNonWaterMonths: method === MONTHLY_DRY ? 3 : null, maximumWaterMonthsForFallback: method === MONTHLY_DRY ? 0 : null,
    nativeScaleMeters: 30, resampling: 'nearest neighbor on before-VV grid',
    eligibilityInferred: method === MONTHLY_DRY, currentWaterStateVerified: false, futureObservationsUsed: false,
    processingCaveat: 'No post-cutoff image entries are used. JRC v1.4 is a retrospective processed archive, not a product claimed to have been available contemporaneously in 2017.',
    seasonalWater: 'Annual class 2 remains separately identified and potentially eligible; seasonal refilling can be a false candidate.',
    inference: method === MONTHLY_DRY ? 'Only unknown annual pixels with >=3 observed monthly class-1 detections and zero observed monthly class-2 detections gain inferred eligibility. This is historical non-water evidence, not proof of event-date dry land or absence of permanent water.' : 'Only observed annual classes 1, 2 and 3 support analysis; all other states remain unknown.' };
}
function buildWaterReference(ee, graph, year, policy) {
  const annual = ee.Image(ee.ImageCollection(policy.annualDataset).filter(ee.Filter.eq('year', year)).first()).select('waterClass');
  const aligned = annual.reproject(graph.grid), sourceMask = aligned.mask().unmask(0, false).gt(0);
  const values = aligned.unmask(0, false);
  const known = sourceMask.and(values.gte(1)).and(values.lte(3));
  const notWater = known.and(values.eq(1)), seasonal = known.and(values.eq(2)), permanent = known.and(values.eq(3));
  let monthlyEligible = ee.Image.constant(0).reproject(graph.grid).clip(graph.aoi);
  let monthlyCount = ee.Number(0), monthlyIds = ee.List([]);
  if (policy.method === MONTHLY_DRY) {
    const monthly = ee.ImageCollection(policy.monthlyDataset).filterDate(policy.monthlyStart, policy.monthlyEndExclusive).sort('system:time_start').limit(24);
    const detections = value => monthly.map(image => {
      const band = image.select('water');
      return band.unmask(0, false).eq(value).and(band.mask().unmask(0, false).gt(0)).reproject(graph.grid).rename('count');
    }).sum().reproject(graph.grid);
    monthlyEligible = known.not().and(detections(1).gte(policy.minimumNonWaterMonths)).and(detections(2).eq(0)).clip(graph.aoi);
    monthlyCount = monthly.size(); monthlyIds = monthly.aggregate_array('system:index');
  }
  return { known, notWater, seasonal, permanent, monthlyEligible,
    supported: known.or(monthlyEligible), eligible: notWater.or(seasonal).or(monthlyEligible),
    metadata: ee.Dictionary({ ...policy, monthlyImageCount: monthlyCount, monthlyImageIds: monthlyIds,
      annualOriginalProjection: projection(ee, annual) }) };
}
function analysisSupport(ee, graph, radius = 30) {
  const kernel = ee.Kernel.circle({ radius, units: 'meters', normalize: false });
  return graph.commonMask.unmask(0, false).reduceNeighborhood({ reducer: ee.Reducer.min(), kernel, skipMasked: false })
    .gt(0).and(graph.commonMask).reproject(graph.grid).clip(graph.aoi);
}
function projection(ee, image) {
  return ee.Dictionary({ crs: image.projection().crs(), transform: image.projection().transform(), nominalScaleMeters: image.projection().nominalScale() });
}
function classAreas(ee, image, values, region, options) {
  const unmasked = image.mask().unmask(0, false).gt(0), fill = image.unmask(-999, false);
  const categories = { total: ee.Image.constant(1), unmasked, masked: unmasked.not() };
  let recognized = ee.Image.constant(0);
  for (const value of values) { categories[`class${value}`] = fill.eq(value).and(unmasked); recognized = recognized.or(fill.eq(value)); }
  categories.otherValues = unmasked.and(recognized.not());
  const area = ee.Image.pixelArea();
  return ee.Image.cat(Object.entries(categories).map(([name, mask]) => area.updateMask(mask).updateMask(region).rename(name)))
    .reduceRegion({ ...options, reducer: ee.Reducer.sum() });
}
function buildInvestigation(ee, graph) {
  const { aoi, grid, commonMask, gridOptions } = graph, support = analysisSupport(ee, graph);
  const years = ee.ImageCollection('JRC/GSW1_4/YearlyHistory').filter(ee.Filter.eq('year', 2016));
  const yearlyImage = ee.Image(years.first()), yearly = yearlyImage.select('waterClass');
  const aligned = yearly.reproject(grid);
  const monthly = ee.ImageCollection('JRC/GSW1_4/MonthlyHistory').filterDate('2016-01-01', '2017-05-01').sort('system:time_start');
  const counts = kind => monthly.map(image => {
    const band = image.select('water');
    const valid = band.mask().unmask(0, false).gt(0);
    const value = band.unmask(0, false);
    return (kind === 'observed' ? value.gt(0) : value.eq(kind === 'water' ? 2 : 1)).and(valid).reproject(grid).rename(kind);
  }).sum().reproject(grid).clip(aoi);
  const observedCount = counts('observed'), waterCount = counts('water'), dryCount = counts('dry');
  const global = ee.Image('JRC/GSW1_4/GlobalSurfaceWater');
  const annualKnown = aligned.mask().unmask(0, false).gt(0).and(aligned.unmask(0, false).gt(0));
  const fallbackDry = annualKnown.not().and(dryCount.gte(3)).and(waterCount.eq(0));
  const area = ee.Image.pixelArea();
  const diagnostics = {
    yearImageCount: years.size(), yearImageId: yearlyImage.id(), selectedYear: yearlyImage.get('year'),
    yearlyProjection: projection(ee, yearly), analysisProjection: projection(ee, graph.before),
    yearlyNativeAoi: classAreas(ee, yearly, [0, 1, 2, 3], ee.Image.constant(1), { ...gridOptions, crs: yearly.projection() }),
    yearlyAlignedAoi: classAreas(ee, aligned, [0, 1, 2, 3], ee.Image.constant(1), gridOptions),
    yearlyAlignedCommonSar: classAreas(ee, aligned, [0, 1, 2, 3], commonMask, gridOptions),
    yearlyAlignedSmoothed: classAreas(ee, aligned, [0, 1, 2, 3], support, gridOptions),
    yearlyOriginalMaskHistogram: yearly.mask().unmask(0, false).reduceRegion({ ...gridOptions, crs: yearly.projection(), reducer: ee.Reducer.frequencyHistogram() }),
    monthlyApril2017Smoothed: classAreas(ee, ee.Image('JRC/GSW1_4/MonthlyHistory/2017_04').select('water').reproject(grid), [0, 1, 2], support, gridOptions),
    // Compare the exact old fill/reprojection order to nearest-neighbor alignment.
    oldVersusAlignedDisagreementAreaM2: area.updateMask(yearly.unmask(0, false).reproject(grid).neq(aligned.unmask(0, false)))
      .reduceRegion({ ...gridOptions, reducer: ee.Reducer.sum() }),
    monthlyImageCount: monthly.size(), monthlyImageIds: monthly.aggregate_array('system:index'),
    monthlyProjection: projection(ee, ee.Image(monthly.first()).select('water')),
    monthlyHistorySupport: ee.Image.cat([
      area.updateMask(support).rename('support'), area.updateMask(support.and(observedCount.gt(0))).rename('observedAny'),
      area.updateMask(support.and(observedCount.eq(0))).rename('noObservedMonths'),
      area.updateMask(support.and(waterCount.gt(0))).rename('waterAny'),
      area.updateMask(support.and(dryCount.gte(3)).and(waterCount.eq(0))).rename('atLeastThreeDryNoWater'),
      area.updateMask(support.and(fallbackDry)).rename('additionalRepeatedDryOutsideAnnual'),
    ]).reduceRegion({ ...gridOptions, reducer: ee.Reducer.sum() }),
    monthlyFallbackEvidence: dryCount.rename('dryMonthCount').addBands(observedCount.rename('observedMonthCount')).addBands(waterCount.rename('waterMonthCount'))
      .updateMask(support.and(annualKnown.not())).reduceRegion({ ...gridOptions,
        reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), '', true) }),
    occurrenceProjection: projection(ee, global.select('occurrence')),
    occurrenceSmoothed: classAreas(ee, global.select('occurrence').reproject(grid), [0, 100], support, gridOptions),
    // The residual observed category is seasonal (1–11); keep band count bounded.
    seasonalitySmoothed: classAreas(ee, global.select('seasonality').reproject(grid), [0, 12], support, gridOptions),
    maximumExtentSmoothed: classAreas(ee, global.select('max_extent').reproject(grid), [0, 1], support, gridOptions),
  };
  return diagnostics;
}
function validateInvestigation(results) {
  if (results.yearImageCount !== 1 || results.selectedYear !== 2016 || results.yearImageId !== '2016') throw new Error('The diagnosed annual reference is not uniquely the 2016 image.');
  for (const key of ['yearlyNativeAoi', 'yearlyAlignedAoi', 'yearlyAlignedCommonSar', 'yearlyAlignedSmoothed']) {
    const areas = results[key];
    if (!areas || !['total', 'unmasked', 'masked', 'class0', 'class1', 'class2', 'class3', 'otherValues'].every(name => Number.isFinite(areas[name]) && areas[name] >= 0)) throw new Error('Incomplete class/mask diagnosis.');
    if (Math.abs(areas.total - areas.unmasked - areas.masked) > 1 || Math.abs(areas.unmasked - areas.class0 - areas.class1 - areas.class2 - areas.class3 - areas.otherValues) > 1) throw new Error('Annual class/mask categories fail to reconcile.');
  }
  const monthly = results.monthlyHistorySupport;
  if (!monthly || Math.abs(monthly.support - monthly.observedAny - monthly.noObservedMonths) > 1 || monthly.additionalRepeatedDryOutsideAnnual > results.yearlyAlignedSmoothed.masked + results.yearlyAlignedSmoothed.class0 + 1) throw new Error('Monthly support does not reconcile with unknown annual coverage.');
  return true;
}
module.exports = { CONSERVATIVE, MONTHLY_DRY, parseReferenceMethod, referencePolicy, buildWaterReference, analysisSupport, classAreas, buildInvestigation, validateInvestigation };
