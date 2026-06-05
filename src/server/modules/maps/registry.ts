import { env } from "../../config/env.js";
import { AmapUnifiedProvider } from "./amapUnifiedProvider.js";
import { OpenMapProvider } from "./openMapProvider.js";
import type { UnifiedMapProvider, UnifiedMapProviderClient } from "./types.js";

/**
 * Singleton instance of all map providers.
 * Fix #3: Providers are instantiated once at module load time to avoid:
 * - Repeated instantiation on every API call
 * - Lost connection pools, caches, and rate limiters
 * - Memory leaks from unbounded instance growth
 */
const providers: Record<UnifiedMapProvider, UnifiedMapProviderClient> = {
  open: new OpenMapProvider({
    tileUrl: env.OPEN_MAP_TILE_URL,
    nominatimUrl: env.OPEN_MAP_NOMINATIM_URL,
    overpassUrl: env.OPEN_MAP_OVERPASS_URL,
    routeUrl: env.OPEN_MAP_ROUTE_URL,
    timeoutMs: env.OPEN_MAP_TIMEOUT_MS,
    publicDemoOk: env.OPEN_MAP_PUBLIC_DEMO_OK,
    nodeEnv: env.NODE_ENV,
  }),
  amap: new AmapUnifiedProvider({
    apiKey: env.AMAP_WEB_SERVICE_KEY,
    baseUrl: env.AMAP_BASE_URL,
    timeoutMs: env.AMAP_TIMEOUT_MS,
  }),
};

/**
 * Return the singleton providers record.
 * For backward compatibility, also exported as createMapProviders().
 */
export function createMapProviders(): Record<UnifiedMapProvider, UnifiedMapProviderClient> {
  return providers;
}

export function selectMapProvider(provider: UnifiedMapProvider | undefined, providersRef = providers) {
  if (provider) return providersRef[provider];
  const amap = providersRef.amap.status();
  return amap.configured ? providersRef.amap : providersRef.open;
}
