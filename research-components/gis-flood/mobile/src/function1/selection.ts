import { inspectLocation, Inspection } from '../api/flood';
import { createLatestRequest, SearchLocation } from '../search/locationSearch';
export interface SelectionState { point: SearchLocation | null; inspection: Inspection | null; loading: boolean; error: string; version: number }
export function createSelectionStore(inspect = inspectLocation) {
  let state: SelectionState = { point: null, inspection: null, loading: false, error: '', version: 0 };
  const listeners = new Set<() => void>(), requests = createLatestRequest();
  function publish(next: SelectionState) { state = next; listeners.forEach(listener => listener()); }
  async function select(point: SearchLocation) {
    const ticket = requests.start();
    publish({ point, inspection: null, loading: true, error: '', version: state.version + 1 });
    try {
      const inspection = await inspect(point.latitude, point.longitude, ticket.signal);
      if (ticket.isCurrent()) publish({ ...state, inspection, loading: false });
    } catch (error) {
      if (ticket.isCurrent()) publish({ ...state, loading: false, error: error instanceof Error ? error.message : 'Could not inspect this location.' });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select,
    retry() { if (state.point) return select(state.point); },
    reset() { requests.cancel(); publish({ point: null, inspection: null, loading: false, error: '', version: state.version + 1 }); },
    dispose() { requests.cancel(); listeners.clear(); },
  };
}
