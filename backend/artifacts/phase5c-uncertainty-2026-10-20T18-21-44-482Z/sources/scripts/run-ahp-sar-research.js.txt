require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createAhpSarResearchService, CLASSES, FILTERS, CAVEATS } = require('../services/ahpSarResearchService');
const { SCENES } = require('../services/sarPixelQuality');
const { CONSERVATIVE } = require('../services/sarWaterReferenceService');

const format = (value, digits = 6) => value === null || value === undefined ? 'not estimable' : value.toFixed(digits);
function findings(result) {
  const p = result.scenarios.find(s => s.referenceMethod === CONSERVATIVE && s.stage === 'final' && s.domainKind === 'reference-specific-stage-shared');
  const g = p.groupedComparison;
  const comparison = g.higher.candidateRate === null || g.lower.candidateRate === null ? 'The grouped concentration comparison was not estimable.' :
    `The High/Very High candidate rate (${format(g.higher.candidateRate * 100, 3)}%) was ${g.higher.candidateRate > g.lower.candidateRate ? 'greater than' : g.higher.candidateRate < g.lower.candidateRate ? 'lower than' : 'equal to'} the Low/Moderate rate (${format(g.lower.candidateRate * 100, 3)}%); the rate ratio was ${format(g.higherToLowerRateRatio, 3)}.`;
  const rates = p.rows.map(row => row.candidatePercent);
  const ordering = rates.every(rate => rate !== null) ? ` Candidate rates across Low, Moderate, High and Very High were ${rates.map(rate => `${format(rate, 2)}%`).join(', ')}; ${rates.every((rate, i) => i === 0 || rate >= rates[i - 1]) ? 'rates increased monotonically' : 'rates did not increase monotonically'} across the hazard classes.` : '';
  return `Within ${format(p.commonDomainAreaKm2)} km² of common valid support, the conservative-reference final May 2017 experimental SAR response covered ${format(p.candidateAreaKm2)} km² (${format(p.candidateRate === null ? null : p.candidateRate * 100, 3)}% of that domain). ${comparison}${ordering} These descriptive results concern the supported Lower Kelani domain only and provide preliminary cross-method spatial agreement, not independent flood-map validation or prediction accuracy.`;
}
function report(result) {
  const lines = ['# Phase 5A: GIS-AHP / SAR spatial research', '', `Executed: ${result.executedAt}`, '',
    result.question, '', '## PP1 findings', '', findings(result), '', '## Actual methods and spatial support', '',
    'Function 1 landHazardClass is reused with its original four-class encoding and AHP weights. Function 2 reuses its linear-power smoothing, historical eligibility, -15 dB / -3 dB response thresholds, slope-v1 (≤5°) and connected-v1 (≥8 pixels, 8-neighbor) filtering.', '',
    `Actual AHP weights: ${JSON.stringify(result.ahp.weights)}. Class thresholds: ${JSON.stringify(result.ahp.methodology.classificationThresholds)}.`, '',
    `Existing Function 1 datasets: ${JSON.stringify(result.ahp.datasets)}. SAR dataset: COPERNICUS/S1_GRD, VV. Historical water: JRC/GSW1_4/YearlyHistory, year 2016; monthly sensitivity uses JRC/GSW1_4/MonthlyHistory from 2016-01-01 through 2017-05-01 exclusive.`, '',
    `Before: ${result.scenes.before.sceneId} (${result.scenes.before.acquiredAt}).`, '',
    `Later: ${result.scenes.later.sceneId} (${result.scenes.later.acquiredAt}).`, '',
    `AOI: existing Function 1 HydroBASINS level 10 union, HYBAS_ID ${result.spatialMetadata.basinIds.join(', ')}; vector area ${format(result.spatialMetadata.aoiVectorAreaKm2)} km². Exact geometry is retained in methodology.json.`, '',
    ...Object.entries(result.methodology).map(([key, value]) => `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`), '',
    'Nearest-neighbor sampling assigns existing classes to the evaluation grid; it does not establish independent measurement resolution. Non-candidate area means no response at that stage within supported data, never verified dry land.', '',
    '## Domain accounting', '',
    'Exclusive losses partition the raster AOI in the listed order. Marginal areas in JSON overlap; they must not be added.', ''];
  for (const [method, d] of Object.entries(result.diagnostics)) {
    lines.push(`### ${method}`, '', `Raster AOI: ${format(d.rasterAoiAreaKm2)} km²; common domain: ${format(d.commonDomainAreaKm2)} km².`, '',
      '| Exclusive loss | km² |', '|---|---:|', ...Object.entries(d.exclusiveLossesKm2).map(([key, value]) => `| ${key} | ${format(value)} |`), '',
      `AOI partition and intersection checks passed within ${d.accountingToleranceM2} m².`, '');
  }
  lines.push('## Hazard-class overlap and sensitivity', '',
    'All areas are km²; percentages and enrichment use each explicitly stated domain. Raw = original candidates; terrain = after slope; final = after connectivity. Ratios of reference-specific results conflate support differences and must not be interpreted as accuracy gains.', '');
  for (const s of result.scenarios) {
    lines.push(`### ${s.referenceMethod} / ${s.stage} / ${s.domainKind}`, '',
      `Domain ${format(s.commonDomainAreaKm2)}; candidates ${format(s.candidateAreaKm2)}; supported non-candidates ${format(s.nonCandidateAreaKm2)}.`, '',
      '| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |',
      '|---|---:|---:|---:|---:|---:|---:|---:|',
      ...s.rows.map(r => `| ${r.code}: ${r.label} | ${format(r.domainAreaKm2)} | ${format(r.candidateAreaKm2)} | ${format(r.nonCandidateAreaKm2)} | ${format(r.candidatePercent, 3)} | ${format(r.candidateSharePercent, 3)} | ${format(r.domainSharePercent, 3)} | ${format(r.enrichmentRatio, 3)} |`), '',
      `High/Very High to Low/Moderate rate ratio: ${format(s.groupedComparison.higherToLowerRateRatio, 3)}; rate difference: ${format(s.groupedComparison.rateDifferencePercentagePoints, 3)} percentage points.`, '',
      `${s.estimability} Class/domain, class/candidate and non-candidate accounting passed within ${s.accounting.toleranceM2} m².`, '');
  }
  lines.push('## Sensitivity interpretation', '');
  for (const method of Object.keys(result.diagnostics)) {
    const stages = ['raw', 'terrain', 'final'].map(stage => result.scenarios.find(s => s.referenceMethod === method && s.stage === stage && s.domainKind === 'reference-specific-stage-shared'));
    lines.push(`${method}: on the identical ${format(stages[0].commonDomainAreaKm2)} km² stage domain, candidate area changed from ${stages.map(s => `${format(s.candidateAreaKm2)} (${s.stage})`).join(' → ')} km². ` +
      `Higher/lower hazard rate ratios were ${stages.map(s => `${format(s.groupedComparison.higherToLowerRateRatio, 3)} (${s.stage})`).join(', ')}.`, '');
  }
  const shared = result.scenarios.filter(s => s.domainKind === 'identical-cross-reference' && s.stage === 'final');
  if (shared.length) lines.push(`On the identical cross-reference domain (${format(shared[0].commonDomainAreaKm2)} km²), final candidates were ${shared.map(s => `${format(s.candidateAreaKm2)} km² for ${s.referenceMethod} (higher/lower rate ratio ${format(s.groupedComparison.higherToLowerRateRatio, 3)})`).join('; ')}. Reference-specific domain differences are reported above. Connectivity can be affected by neighboring eligible support outside the measurement intersection.`, '');
  const estimable = result.scenarios.filter(s => s.groupedComparison.higher.candidateRate !== null && s.groupedComparison.lower.candidateRate !== null);
  const greater = estimable.filter(s => s.groupedComparison.higher.candidateRate > s.groupedComparison.lower.candidateRate);
  lines.push(`The pooled higher-hazard candidate rate exceeded the pooled lower-hazard rate in ${greater.length} of ${estimable.length} estimable scenarios (${result.scenarios.length} evaluated, including repeated common-domain controls). These scenarios are sensitivity checks, not independent replications.`, '');
  lines.push('Concentration direction is descriptive for each scenario; sensitivity of these area/rate measures is not evidence of improved accuracy or statistical significance.', '',
    '## Limits on conclusions', '', ...result.caveats.map(c => `- ${c}`), '',
    '## Reproduction', '', 'From backend: `node scripts/run-ahp-sar-research.js` (both references); add `--conservative-only` to omit monthly sensitivity.', '',
    'Requires the existing ignored service-account credentials and Earth Engine access. Source hashes, parameters, exact grid metadata, geometry and reference image provenance are saved in methodology.json. No map URLs or credentials are exported.', '');
  return lines.join('\n');
}
function csv(result) {
  const keys = ['referenceMethod', 'stage', 'domainKind', 'commonDomainAreaKm2', 'code', 'label', 'domainAreaKm2', 'candidateAreaKm2',
    'nonCandidateAreaKm2', 'candidatePercent', 'candidateSharePercent', 'domainSharePercent', 'enrichmentRatio'];
  const quote = value => value === null || value === undefined ? '' : `"${String(value).replaceAll('"', '""')}"`;
  return keys.join(',') + '\n' + result.scenarios.flatMap(s => s.rows.map(r => {
    const row = { ...s, ...r }; return keys.map(key => quote(row[key])).join(',');
  })).join('\n') + '\n';
}
function safeError(error) {
  const message = typeof error === 'string' ? error : error?.message || String(error);
  return message.replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, '[REDACTED KEY]')
    .replace(/(Bearer\s+)[\w.\-]+/gi, '$1[REDACTED]')
    .replace(/(["']?(?:access_token|refresh_token|private_key|client_secret)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,}]+)/gi, '$1[REDACTED]');
}
async function main(args = process.argv.slice(2)) {
  if (args.some(arg => !['--conservative-only', '--help'].includes(arg))) throw new Error('Supported options: --conservative-only, --help');
  if (args.includes('--help')) { console.log('node scripts/run-ahp-sar-research.js [--conservative-only]'); return; }
  const folder = path.resolve(__dirname, '..', 'artifacts', `ahp-sar-phase5a-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.mkdir(folder, { recursive: true });
  const write = (name, value) => fs.writeFile(path.join(folder, name), value, 'utf8');
  const partial = { status: 'running', startedAt: new Date().toISOString(), sceneIds: SCENES, filters: FILTERS, classes: CLASSES, scenarios: [] };
  const sourceFiles = ['services/hazardService.js', 'services/ahpService.js', 'controllers/floodController.js', 'services/sarPreviewService.js',
    'services/sarPixelQuality.js', 'services/sarCandidateService.js', 'services/sarFiltering.js', 'services/sarWaterReferenceService.js',
    'services/ahpSarResearchService.js', 'scripts/run-ahp-sar-research.js', 'tests/ahpSarResearch.test.js'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => {
    const source = await fs.readFile(path.resolve(__dirname, '..', file));
    // Text snapshots must not be discovered as runnable tests by node --test.
    const snapshot = path.join(folder, 'sources', `${file}.txt`);
    await fs.mkdir(path.dirname(snapshot), { recursive: true });
    await fs.writeFile(snapshot, source);
    return [file, crypto.createHash('sha256').update(source).digest('hex')];
  })));
  await write('execution.json', JSON.stringify({ ...partial, sourceHashes }, null, 2));
  console.log(`Research artifacts: ${folder}`);
  try {
    const result = await createAhpSarResearchService({ onProgress: label => console.log(label),
      onResult: async scenario => { partial.scenarios.push(scenario); await write('partial-results.json', JSON.stringify(partial, null, 2)); }
    }).run({ monthly: !args.includes('--conservative-only') });
    result.reproducibility = { sourceHashes, command: `node scripts/run-ahp-sar-research.js${args.includes('--conservative-only') ? ' --conservative-only' : ''}` };
    await write('results.json', JSON.stringify(result, null, 2));
    await write('overlap.csv', csv(result));
    await write('report.md', report(result));
    const { scenarios, quality, ...metadata } = result;
    await write('methodology.json', JSON.stringify(metadata, null, 2));
    await write('execution.json', JSON.stringify({ status: 'completed', executedAt: result.executedAt, sourceHashes, scenarioCount: scenarios.length }, null, 2));
    console.log(findings(result));
    console.log(`Completed ${scenarios.length} scenarios; artifacts: ${folder}`);
  } catch (error) {
    const errors = [];
    for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) errors.push(safeError(current));
    const failure = { ...partial, status: 'failed', failedAt: new Date().toISOString(), sourceHashes, errors };
    await write('execution.json', JSON.stringify(failure, null, 2));
    await write('report.md', `# Phase 5A execution failed\n\nNo completed experiment is claimed.\n\n${errors.join('\n\n')}\n\n${partial.scenarios.length} completed intermediate scenario(s) are retained in execution.json; they do not establish a completed sensitivity study.\n\n${CAVEATS.join('\n\n')}\n`);
    console.error(`Research failed: ${errors.join(' / ')}. Artifacts: ${folder}`);
    process.exitCode = 1;
  }
}
if (require.main === module) main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
module.exports = { main, csv, report, findings, safeError };
