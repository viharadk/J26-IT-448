import { api } from './client';
import { normalizeQuery, parsePlaces } from '../search/locationSearch';

export function createPlaceSearch(get: typeof api.get = api.get) {
  return async (input: string, signal: AbortSignal) => {
    const query = normalizeQuery(input);
    try {
      return parsePlaces(await get(`/api/geocoding/search?q=${encodeURIComponent(query)}`, signal, 20000));
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof Error && error.message.includes('HTTP 429')) throw new Error('Place search is temporarily limited. Wait a minute and try again.');
      if (error instanceof Error && error.message.includes('HTTP 502')) throw new Error('Place search is unavailable. Try again later or use coordinates.');
      throw error;
    }
  };
}
export const searchPlaces = createPlaceSearch();
