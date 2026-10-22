# Phase 5A: GIS-AHP / SAR spatial research

Executed: 2026-10-20T17:08:15.816Z

How are experimental May 2017 SAR candidates distributed across existing GIS-AHP susceptibility classes within their common valid spatial support?

## PP1 findings

Within 2.413329 km² of common valid support, the conservative-reference final May 2017 experimental SAR response covered 0.937870 km² (38.862% of that domain). The High/Very High candidate rate (43.031%) was greater than the Low/Moderate rate (21.434%); the rate ratio was 2.008. Candidate rates across Low, Moderate, High and Very High were 0.00%, 22.06%, 46.63%, 21.74%; rates did not increase monotonically across the hazard classes. These descriptive results concern the supported Lower Kelani domain only and provide preliminary cross-method spatial agreement, not independent flood-map validation or prediction accuracy.

## Actual methods and spatial support

Function 1 landHazardClass is reused with its original four-class encoding and AHP weights. Function 2 reuses its linear-power smoothing, historical eligibility, -15 dB / -3 dB response thresholds, slope-v1 (≤5°) and connected-v1 (≥8 pixels, 8-neighbor) filtering.

Actual AHP weights: {"elevation":0.4,"slope":0.2,"waterDistance":0.3,"landcover":0.1}. Class thresholds: {"low":"index <= 2.0","moderate":"2.0 < index <= 3.0","high":"3.0 < index <= 4.0","veryHigh":"index > 4.0"}.

Existing Function 1 datasets: {"aoi":"WWF/HydroSHEDS/v1/Basins/hybas_10","elevationAndSlope":"USGS/SRTMGL1_003","landCover":"ESA/WorldCover/v200 (first image)","waterProximity":"JRC/GSW1_4/GlobalSurfaceWater occurrence >= 50%; 30 m fastDistanceTransform approximation"}. SAR dataset: COPERNICUS/S1_GRD, VV. Historical water: JRC/GSW1_4/YearlyHistory, year 2016; monthly sensitivity uses JRC/GSW1_4/MonthlyHistory from 2016-01-01 through 2017-05-01 exclusive.

Before: COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20170524T002512_20170524T002537_016716_01BC28_3CCB (2017-05-24T00:25:12.000Z).

Later: COPERNICUS/S1_GRD/S1B_IW_GRDH_1SDV_20170530T002430_20170530T002501_005820_00A340_FB2A (2017-05-30T00:24:30.000Z).

AOI: existing Function 1 HydroBASINS level 10 union, HYBAS_ID 4101601920, 4101601930, 4101158680, 4100049050; vector area 548.112332 km². Exact geometry is retained in methodology.json.

- area: ee.Image.pixelArea(), weighted sum within original AOI, exact before-VV Projection including affine origin; no bestEffort, scale override, or pixel-count area approximation.
- grid: {"crs":"EPSG:32644","nominalScaleMeters":10,"transformWkt":"PARAM_MT[\"Affine\", \n  PARAMETER[\"num_row\", 3], \n  PARAMETER[\"num_col\", 3], \n  PARAMETER[\"elt_0_0\", 10.0], \n  PARAMETER[\"elt_0_2\", 272884.0792622992], \n  PARAMETER[\"elt_1_1\", -10.0], \n  PARAMETER[\"elt_1_2\", 791670.4794724998]]"}
- commonDomain: AOI AND AHP land-class mask AND recognized codes 1..4 AND actual before/later VV support AND complete 30 m smoothing neighborhoods AND actual smoothed value masks AND historical supported/eligible non-permanent water domain AND known terrain.
- stageDomain: Raw, terrain and final use the identical domain for each reference method. Known steep pixels remain supported filter rejections; missing terrain is excluded at all stages.
- referenceDomain: Reference-specific denominators are reported separately; identical-cross-reference results use their intersection for all stages. Connectivity is computed by the existing graph on original SAR support before restricting measurement to AHP/common domains.
- noData: Only validity masks are filled false for set operations. Candidate transparency is filled false exclusively inside an independently established supported domain.
- diagnostics: Exclusive loss ledger partitions raster AOI in listed order. Marginal areas overlap and must not be summed.
- maxPixels: 1000000000
- tileScale: 4
- toleranceM2: 1
- statisticalInference: None; no independent ground truth or significance tests.

Nearest-neighbor sampling assigns existing classes to the evaluation grid; it does not establish independent measurement resolution. Non-candidate area means no response at that stage within supported data, never verified dry land.

## Domain accounting

Exclusive losses partition the raster AOI in the listed order. Marginal areas in JSON overlap; they must not be added.

### yearly-conservative-v1

Raster AOI: 545.694694 km²; common domain: 2.413329 km².

| Exclusive loss | km² |
|---|---:|
| missingSar | 39.536301 |
| smoothingUnsupported | 3.264860 |
| ahpNoData | 0.000000 |
| ahpWorldCoverWaterExcluded | 8.376991 |
| ahpLandClassUnavailable | 0.000000 |
| ahpUnexpectedCode | 0.000000 |
| historicalUnknown | 491.912619 |
| historicalPermanentExcluded | 0.190594 |
| terrainUnknown | 0.000000 |

AOI partition and intersection checks passed within 1 m².

### yearly-monthly-dry-v1

Raster AOI: 545.694694 km²; common domain: 494.325947 km².

| Exclusive loss | km² |
|---|---:|
| missingSar | 39.536301 |
| smoothingUnsupported | 3.264860 |
| ahpNoData | 0.000000 |
| ahpWorldCoverWaterExcluded | 8.376991 |
| ahpLandClassUnavailable | 0.000000 |
| ahpUnexpectedCode | 0.000000 |
| historicalUnknown | 0.000000 |
| historicalPermanentExcluded | 0.190594 |
| terrainUnknown | 0.000000 |

AOI partition and intersection checks passed within 1 m².

## Hazard-class overlap and sensitivity

All areas are km²; percentages and enrichment use each explicitly stated domain. Raw = original candidates; terrain = after slope; final = after connectivity. Ratios of reference-specific results conflate support differences and must not be interpreted as accuracy gains.

### yearly-conservative-v1 / raw / reference-specific-stage-shared

Domain 2.413329; candidates 1.073141; supported non-candidates 1.340188.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000100 | 0.013107 | 0.758 | 0.009 | 0.547 | 0.017 |
| 2: Moderate | 0.452644 | 0.161286 | 0.291358 | 35.632 | 15.029 | 18.756 | 0.801 |
| 3: High | 1.665773 | 0.845022 | 0.820750 | 50.729 | 78.743 | 69.024 | 1.141 |
| 4: Very High | 0.281705 | 0.066733 | 0.214972 | 23.689 | 6.218 | 11.673 | 0.533 |

High/Very High to Low/Moderate rate ratio: 1.351; rate difference: 12.174 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-conservative-v1 / terrain / reference-specific-stage-shared

Domain 2.413329; candidates 0.970787; supported non-candidates 1.442542.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000000 | 0.013207 | 0.000 | 0.000 | 0.547 | 0.000 |
| 2: Moderate | 0.452644 | 0.105955 | 0.346689 | 23.408 | 10.914 | 18.756 | 0.582 |
| 3: High | 1.665773 | 0.798799 | 0.866974 | 47.954 | 82.284 | 69.024 | 1.192 |
| 4: Very High | 0.281705 | 0.066032 | 0.215672 | 23.440 | 6.802 | 11.673 | 0.583 |

High/Very High to Low/Moderate rate ratio: 1.952; rate difference: 21.663 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-conservative-v1 / final / reference-specific-stage-shared

Domain 2.413329; candidates 0.937870; supported non-candidates 1.475459.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000000 | 0.013207 | 0.000 | 0.000 | 0.547 | 0.000 |
| 2: Moderate | 0.452644 | 0.099852 | 0.352792 | 22.060 | 10.647 | 18.756 | 0.568 |
| 3: High | 1.665773 | 0.776788 | 0.888985 | 46.632 | 82.825 | 69.024 | 1.200 |
| 4: Very High | 0.281705 | 0.061230 | 0.220475 | 21.736 | 6.529 | 11.673 | 0.559 |

High/Very High to Low/Moderate rate ratio: 2.008; rate difference: 21.597 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-monthly-dry-v1 / raw / reference-specific-stage-shared

Domain 494.325947; candidates 5.935595; supported non-candidates 488.390353.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 144.349616 | 0.003602 | 144.346014 | 0.002 | 0.061 | 29.201 | 0.002 |
| 2: Moderate | 209.858995 | 1.211924 | 208.647071 | 0.577 | 20.418 | 42.454 | 0.481 |
| 3: High | 122.967327 | 4.345384 | 118.621943 | 3.534 | 73.209 | 24.876 | 2.943 |
| 4: Very High | 17.150009 | 0.374685 | 16.775324 | 2.185 | 6.313 | 3.469 | 1.819 |

High/Very High to Low/Moderate rate ratio: 9.816; rate difference: 3.025 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-monthly-dry-v1 / terrain / reference-specific-stage-shared

Domain 494.325947; candidates 5.284161; supported non-candidates 489.041787.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 144.349616 | 0.000000 | 144.349616 | 0.000 | 0.000 | 29.201 | 0.000 |
| 2: Moderate | 209.858995 | 0.889356 | 208.969640 | 0.424 | 16.831 | 42.454 | 0.396 |
| 3: High | 122.967327 | 4.031225 | 118.936101 | 3.278 | 76.289 | 24.876 | 3.067 |
| 4: Very High | 17.150009 | 0.363579 | 16.786430 | 2.120 | 6.881 | 3.469 | 1.983 |

High/Very High to Low/Moderate rate ratio: 12.492; rate difference: 2.885 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-monthly-dry-v1 / final / reference-specific-stage-shared

Domain 494.325947; candidates 5.232837; supported non-candidates 489.093110.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 144.349616 | 0.000000 | 144.349616 | 0.000 | 0.000 | 29.201 | 0.000 |
| 2: Moderate | 209.858995 | 0.874948 | 208.984047 | 0.417 | 16.720 | 42.454 | 0.394 |
| 3: High | 122.967327 | 3.999812 | 118.967515 | 3.253 | 76.437 | 24.876 | 3.073 |
| 4: Very High | 17.150009 | 0.358077 | 16.791932 | 2.088 | 6.843 | 3.469 | 1.972 |

High/Very High to Low/Moderate rate ratio: 12.591; rate difference: 2.863 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-conservative-v1 / raw / identical-cross-reference

Domain 2.413329; candidates 1.073141; supported non-candidates 1.340188.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000100 | 0.013107 | 0.758 | 0.009 | 0.547 | 0.017 |
| 2: Moderate | 0.452644 | 0.161286 | 0.291358 | 35.632 | 15.029 | 18.756 | 0.801 |
| 3: High | 1.665773 | 0.845022 | 0.820750 | 50.729 | 78.743 | 69.024 | 1.141 |
| 4: Very High | 0.281705 | 0.066733 | 0.214972 | 23.689 | 6.218 | 11.673 | 0.533 |

High/Very High to Low/Moderate rate ratio: 1.351; rate difference: 12.174 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-conservative-v1 / terrain / identical-cross-reference

Domain 2.413329; candidates 0.970787; supported non-candidates 1.442542.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000000 | 0.013207 | 0.000 | 0.000 | 0.547 | 0.000 |
| 2: Moderate | 0.452644 | 0.105955 | 0.346689 | 23.408 | 10.914 | 18.756 | 0.582 |
| 3: High | 1.665773 | 0.798799 | 0.866974 | 47.954 | 82.284 | 69.024 | 1.192 |
| 4: Very High | 0.281705 | 0.066032 | 0.215672 | 23.440 | 6.802 | 11.673 | 0.583 |

High/Very High to Low/Moderate rate ratio: 1.952; rate difference: 21.663 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-conservative-v1 / final / identical-cross-reference

Domain 2.413329; candidates 0.937870; supported non-candidates 1.475459.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000000 | 0.013207 | 0.000 | 0.000 | 0.547 | 0.000 |
| 2: Moderate | 0.452644 | 0.099852 | 0.352792 | 22.060 | 10.647 | 18.756 | 0.568 |
| 3: High | 1.665773 | 0.776788 | 0.888985 | 46.632 | 82.825 | 69.024 | 1.200 |
| 4: Very High | 0.281705 | 0.061230 | 0.220475 | 21.736 | 6.529 | 11.673 | 0.559 |

High/Very High to Low/Moderate rate ratio: 2.008; rate difference: 21.597 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-monthly-dry-v1 / raw / identical-cross-reference

Domain 2.413329; candidates 1.073141; supported non-candidates 1.340188.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000100 | 0.013107 | 0.758 | 0.009 | 0.547 | 0.017 |
| 2: Moderate | 0.452644 | 0.161286 | 0.291358 | 35.632 | 15.029 | 18.756 | 0.801 |
| 3: High | 1.665773 | 0.845022 | 0.820750 | 50.729 | 78.743 | 69.024 | 1.141 |
| 4: Very High | 0.281705 | 0.066733 | 0.214972 | 23.689 | 6.218 | 11.673 | 0.533 |

High/Very High to Low/Moderate rate ratio: 1.351; rate difference: 12.174 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-monthly-dry-v1 / terrain / identical-cross-reference

Domain 2.413329; candidates 0.970787; supported non-candidates 1.442542.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000000 | 0.013207 | 0.000 | 0.000 | 0.547 | 0.000 |
| 2: Moderate | 0.452644 | 0.105955 | 0.346689 | 23.408 | 10.914 | 18.756 | 0.582 |
| 3: High | 1.665773 | 0.798799 | 0.866974 | 47.954 | 82.284 | 69.024 | 1.192 |
| 4: Very High | 0.281705 | 0.066032 | 0.215672 | 23.440 | 6.802 | 11.673 | 0.583 |

High/Very High to Low/Moderate rate ratio: 1.952; rate difference: 21.663 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

### yearly-monthly-dry-v1 / final / identical-cross-reference

Domain 2.413329; candidates 0.963583; supported non-candidates 1.449746.

| Class | Domain | Candidates | Non-candidates | Candidate % | Candidate share % | Domain share % | Enrichment |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1: Low | 0.013207 | 0.000000 | 0.013207 | 0.000 | 0.000 | 0.547 | 0.000 |
| 2: Moderate | 0.452644 | 0.104154 | 0.348490 | 23.010 | 10.809 | 18.756 | 0.576 |
| 3: High | 1.665773 | 0.794797 | 0.870976 | 47.713 | 82.484 | 69.024 | 1.195 |
| 4: Very High | 0.281705 | 0.064632 | 0.217073 | 22.943 | 6.707 | 11.673 | 0.575 |

High/Very High to Low/Moderate rate ratio: 1.974; rate difference: 21.773 percentage points.

Area-based descriptive measures only. Class/domain, class/candidate and non-candidate accounting passed within 1 m².

## Sensitivity interpretation

yearly-conservative-v1: on the identical 2.413329 km² stage domain, candidate area changed from 1.073141 (raw) → 0.970787 (terrain) → 0.937870 (final) km². Higher/lower hazard rate ratios were 1.351 (raw), 1.952 (terrain), 2.008 (final).

yearly-monthly-dry-v1: on the identical 494.325947 km² stage domain, candidate area changed from 5.935595 (raw) → 5.284161 (terrain) → 5.232837 (final) km². Higher/lower hazard rate ratios were 9.816 (raw), 12.492 (terrain), 12.591 (final).

On the identical cross-reference domain (2.413329 km²), final candidates were 0.937870 km² for yearly-conservative-v1 (higher/lower rate ratio 2.008); 0.963583 km² for yearly-monthly-dry-v1 (higher/lower rate ratio 1.974). Reference-specific domain differences are reported above. Connectivity can be affected by neighboring eligible support outside the measurement intersection.

The pooled higher-hazard candidate rate exceeded the pooled lower-hazard rate in 12 of 12 estimable scenarios (12 evaluated, including repeated common-domain controls). These scenarios are sensitivity checks, not independent replications.

Concentration direction is descriptive for each scenario; sensitivity of these area/rate measures is not evidence of improved accuracy or statistical significance.

## Limits on conclusions

- This is preliminary spatial agreement, not independent validation. No independent event flood labels are used.
- AHP susceptibility and event-date experimental SAR responses represent different concepts. Supported non-candidates are not confirmed dry or flood-free.
- Sentinel-1 May 30 observations are after the approximate May 2017 event peak; peak inundation cannot be inferred.
- The pair uses Sentinel-1A and Sentinel-1B; cross-platform consistency and subpixel co-registration have not been independently verified.
- Historical JRC water support has major limitations: sparse annual observations, seasonal water eligibility, retrospective processing, and optional monthly non-water inference do not establish event-date land or water.
- AHP uses demonstration judgments and preliminary class cutoffs. WorldCover 2021 and historical global water occurrence are not contemporaneous 2017 inputs; this is retrospective susceptibility comparison.
- The 10 m evaluation grid does not create independent 10 m measurements from 30 m SRTM/JRC inputs. Spatially dependent pixels provide no significance or causal evidence.
- Slope and connected-component screening can remove real flood responses. Agreement changes or expanded support do not imply improved accuracy.
- Neither function currently establishes verified flood prediction accuracy.

## Reproduction

From backend: `node scripts/run-ahp-sar-research.js` (both references); add `--conservative-only` to omit monthly sensitivity.

Requires the existing ignored service-account credentials and Earth Engine access. Source hashes, parameters, exact grid metadata, geometry and reference image provenance are saved in methodology.json. No map URLs or credentials are exported.
