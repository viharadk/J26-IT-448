// Public Nominatim policy: https://operations.osmfoundation.org/policies/nominatim/
// Explicit user submissions only. One process owns the app's upstream budget.
function createGeocodingService({
  fetcher = fetch,
  now = Date.now,
  baseUrl = process.env.GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org",
  userAgent = process.env.GEOCODING_USER_AGENT || "KelaniFloodWatch/1.0 (flood-hazard research location search)"
} = {}) {
  const cache = new Map();
  const pending = new Map();
  let lastStarted = -Infinity;
  let busy = false;
  let blockedUntil = 0;

  function failure(message, status) { return Object.assign(new Error(message), { status }); }
  async function search(input) {
    if (typeof input !== "string" || !input.trim()) throw failure("Please enter a location name.", 400);
    const query = input.trim().replace(/\s+/g, " ");
    if (query.length > 160) throw failure("Use a location name of at most 160 characters.", 400);
    const key = query.toLowerCase();
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.places;
    if (pending.has(key)) return pending.get(key);
    if (busy || now() - lastStarted < 1100 || now() < blockedUntil) {
      throw failure("Please wait a moment before searching again.", 429);
    }
    busy = true;
    lastStarted = now();
    const operation = (async () => {
      try {
        const url = new URL("search", `${baseUrl.replace(/\/$/, "")}/`);
        url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "5", countrycodes: "lk", "accept-language": "en" }).toString();
        const response = await fetcher(url, {
          headers: { "User-Agent": userAgent, Accept: "application/json" },
          signal: AbortSignal.timeout(12000)
        });
        if (response.status === 429) {
          const seconds = Number(response.headers.get("retry-after"));
          blockedUntil = now() + Math.max(60000, Number.isFinite(seconds) ? seconds * 1000 : 0);
          throw failure("Place search is temporarily rate limited. Try again later.", 429);
        }
        if (!response.ok) throw failure("Place search provider is unavailable. Try coordinates instead.", 502);
        const data = await response.json();
        if (!Array.isArray(data)) throw failure("Place search returned an invalid response.", 502);
        const places = data.slice(0, 5).flatMap(place => {
          if (!place || typeof place.display_name !== "string" || !place.display_name.trim()) return [];
          if (![place.lat, place.lon].every(value => (typeof value === "string" && value.trim()) || typeof value === "number")) return [];
          const latitude = Number(place.lat), longitude = Number(place.lon);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
          return [{ id: String(place.place_id ?? `${latitude},${longitude}`), name: place.display_name, latitude, longitude }];
        });
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(key, { places, expires: now() + 24 * 60 * 60 * 1000 });
        return places;
      } catch (error) {
        if (error.status) throw error;
        throw failure("Place search is unavailable or timed out. Try again or use coordinates.", 502);
      } finally { busy = false; }
    })();
    pending.set(key, operation);
    try { return await operation; } finally { pending.delete(key); }
  }
  return { search };
}

module.exports = { createGeocodingService };
