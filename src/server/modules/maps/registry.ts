import { env } from "../../config/env.js";
import { AmapUnifiedProvider } from "./amapUnifiedProvider.js";
import { OpenMapProvider } from "./openMapProvider.js";
import type { UnifiedMapProvider, UnifiedMapProviderClient } from "./types.js";

export function createMapProviders(): Record<UnifiedMapProvider, UnifiedMapProviderClient> {
  return {
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
}

export function selectMapProvider(provider: UnifiedMapProvider | undefined, providers = createMapProviders()) {
  if (provider) return providers[provider];
  const amap = providers.amap.status();
  return amap.configured ? providers.amap : providers.open;
}
