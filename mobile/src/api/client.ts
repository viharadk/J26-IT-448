export interface ConnectivityResponse {
  success: true;
  component: string;
  function1: string;
  function2: string;
  status: string;
}

export function validateBaseUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error('Set EXPO_PUBLIC_API_URL in mobile/.env to your backend LAN address.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('The API base URL is invalid. Include http:// or https://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a backend origin such as http://192.168.1.100:3000, without a path or credentials.');
  }
  if (['localhost', '[::1]', '0.0.0.0'].includes(url.hostname) || url.hostname.startsWith('127.')) {
    throw new Error('Use your computer’s LAN IP address; loopback addresses cannot reach it from a phone.');
  }
  return url.origin;
}

export function createApiClient(baseUrl: string | undefined, fetcher: typeof fetch = fetch, timeoutMs = 10000) {
  async function get(path: string, signal?: AbortSignal, requestTimeoutMs = timeoutMs): Promise<unknown> {
    const origin = validateBaseUrl(baseUrl);
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('API paths must be relative to the backend.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetcher(`${origin}${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (controller.signal.aborted) throw new Error('Connection timed out. Check the backend, Wi-Fi and firewall.');
      if (error instanceof SyntaxError) throw new Error('Backend returned invalid JSON. Check the API address.');
      if (error instanceof TypeError) throw new Error('Cannot reach the backend. Check the LAN IP, Wi-Fi and port 3000.');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return {
    get,
    async testConnection(): Promise<ConnectivityResponse> {
      const result = await get('/api/flood/test');
      if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true ||
        !['component', 'function1', 'function2', 'status'].every(key => typeof (result as Record<string, unknown>)[key] === 'string')) {
        throw new Error('Unexpected response from the Flood API test endpoint.');
      }
      return result as ConnectivityResponse;
    },
  };
}

// Expo statically replaces this exact expression at bundle time. This is public configuration, never a secret.
export const api = createApiClient(process.env.EXPO_PUBLIC_API_URL);
