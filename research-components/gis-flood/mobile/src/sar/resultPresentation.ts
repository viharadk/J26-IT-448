import { SarAnalysis } from '../api/sar';

// Presentation only: retain backend values, including the raw percentage and
// its actual reference-supported denominator. Do not derive filtered rates.
export function coverageRows(data: Pick<SarAnalysis, 'areas'>) {
  return [
    { label: 'Supported raw comparison area', value: data.areas.validAnalysisAreaKm2, unit: 'km²' },
    { label: 'Raw candidate area / supported raw comparison area', value: data.areas.candidatePercentOfValid, unit: '%' },
    { label: 'Eligible non-permanent support', value: data.areas.eligibleNonPermanentAreaKm2, unit: 'km²' },
    { label: 'Excluded permanent water', value: data.areas.excludedPermanentWaterAreaKm2, unit: 'km²' },
    { label: 'Missing / unobserved SAR area', value: data.areas.missingSarAreaKm2, unit: 'km²' },
    { label: 'Historical-water unknown area', value: data.areas.ancillaryUnknownAreaKm2, unit: 'km²' },
    { label: 'Smoothing edge exclusion', value: data.areas.smoothingEdgeExcludedAreaKm2, unit: 'km²' },
  ];
}
