import { getPopulationExposure, PopulationExposure } from '../api/population';
import { createLatestRequest } from '../search/locationSearch';

export function formatPopulationCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return 'Unavailable';
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}
export function formatPopulationPercent(value: number | null | undefined, denominator: number | null | undefined): string {
  if (denominator == null || !Number.isFinite(denominator)) return 'Unavailable (denominator missing)';
  if (denominator === 0) return 'Not estimable (zero denominator)';
  if (value == null || !Number.isFinite(value) || value < 0) return 'Unavailable';
  return `${value > 0 && value < 0.01 ? '<0.01' : value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;
}
export function populationAvailability(data: PopulationExposure): 'available' | 'empty' | 'zero' {
  if (data.studyAreaPopulation === 0) return 'zero';
  const values = [data.studyAreaPopulation, data.classifiedLandPopulation, data.highAndVeryHighExposure, data.unallocatedPopulation,
    ...data.populationByHazardClass.map(row => row.population)];
  return values.every(v => v === null) ? 'empty' : 'available';
}
export interface PopulationState { status: 'idle' | 'loading' | 'success' | 'error'; data: PopulationExposure | null; error: string }

// This request state is separate from map/search/inspection state. Closing the
// native view cancels only its pending exposure request and retains prior data.
export function createPopulationController(load = getPopulationExposure) {
  let state: PopulationState = { status: 'idle', data: null, error: '' }, disposed = false;
  const requests = createLatestRequest(), listeners = new Set<() => void>();
  const update = (next: PopulationState) => { if (!disposed) { state = next; listeners.forEach(fn => fn()); } };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      if (disposed) return;
      const ticket = requests.start();
      update({ status: 'loading', data: state.data, error: '' });
      try {
        const data = await load(ticket.signal);
        if (ticket.isCurrent()) update({ status: 'success', data, error: '' });
      } catch (error) {
        if (ticket.isCurrent()) update({ status: 'error', data: state.data, error: error instanceof Error ? error.message : 'Population exposure request failed. Retry.' });
      }
    },
    close() { requests.cancel(); if (state.status === 'loading') update({ status: state.data ? 'success' : 'idle', data: state.data, error: '' }); },
    dispose() { requests.cancel(); disposed = true; listeners.clear(); },
  };
}
