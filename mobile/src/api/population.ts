import { api } from './client';

export const POPULATION_CLASSES = ['Low', 'Moderate', 'High', 'Very High'] as const;
export interface PopulationClass {
  classId: number; hazardClass: string; population: number | null;
  percentageOfStudyAreaPopulation: number | null;
  percentageOfClassifiedLandPopulation: number | null;
}
export interface PopulationExposure {
  success: true; dataset: string | null; year: number | null; nativeResolutionMeters: number | null;
  studyAreaPopulation: number | null; classifiedLandPopulation: number | null;
  highAndVeryHighExposure: number | null; highAndVeryHighPercentage: number | null; unallocatedPopulation: number | null;
  populationByHazardClass: PopulationClass[];
  methodology: Record<string, string>; limitations: string[];
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Unexpected population exposure response.');
  return value as Record<string, unknown>;
};
function number(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw Error('Invalid population exposure value. Retry the request.');
  return value;
}
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;

export function parsePopulationExposure(value: unknown): PopulationExposure {
  const r = record(value);
  if (r.success !== true) throw Error('Population exposure is unavailable. Retry the request.');
  if (r.populationByHazardClass != null && !Array.isArray(r.populationByHazardClass)) throw Error('Invalid population hazard-class breakdown.');
  const seen = new Set<number>();
  const rows = ((r.populationByHazardClass ?? []) as unknown[]).map(value => {
    const c = record(value), id = number(c.classId);
    if (id === null || !Number.isInteger(id) || id < 1 || id > 4 || seen.has(id) || c.hazardClass !== POPULATION_CLASSES[id - 1]) {
      throw Error('Unsupported or duplicate population hazard class.');
    }
    seen.add(id);
    return { classId: id, hazardClass: c.hazardClass as string, population: number(c.population),
      percentageOfStudyAreaPopulation: number(c.percentageOfStudyAreaPopulation),
      percentageOfClassifiedLandPopulation: number(c.percentageOfClassifiedLandPopulation) };
  });
  const methodology = r.methodology == null ? {} : record(r.methodology);
  if (r.limitations != null && (!Array.isArray(r.limitations) || r.limitations.some(v => typeof v !== 'string'))) throw Error('Invalid population limitations.');
  return { success: true, dataset: text(r.dataset), year: number(r.year), nativeResolutionMeters: number(r.nativeResolutionMeters),
    studyAreaPopulation: number(r.studyAreaPopulation), classifiedLandPopulation: number(r.classifiedLandPopulation),
    highAndVeryHighExposure: number(r.highAndVeryHighExposure), highAndVeryHighPercentage: number(r.highAndVeryHighPercentage),
    unallocatedPopulation: number(r.unallocatedPopulation), populationByHazardClass: rows,
    methodology: Object.fromEntries(Object.entries(methodology).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    limitations: (r.limitations ?? []) as string[] };
}

export function createPopulationApi(get: typeof api.get = api.get) {
  return async (signal: AbortSignal): Promise<PopulationExposure> =>
    parsePopulationExposure(await get('/api/flood/exposure/population', signal, 180000));
}
export const getPopulationExposure = createPopulationApi();
