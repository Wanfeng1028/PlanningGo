export type UnifiedMapProvider = "open" | "amap";

export interface MapPoint {
  lng: number;
  lat: number;
}

export interface UnifiedPoi {
  id: string;
  name: string;
  address: string;
  type: string;
  location: MapPoint;
  rating?: number;
  cost?: number;
  distance?: number;
  tel?: string;
  photos?: string[];
  source: UnifiedMapProvider;
  raw?: unknown;
}

export interface UnifiedRoute {
  distance: number;
  duration: number;
  strategy: string;
  steps: Array<{ instruction: string; road?: string; distance: number; duration: number }>;
  polyline?: string;
  coordinates?: MapPoint[];
  navigationUrl?: string;
  source: UnifiedMapProvider;
}

export interface UnifiedWeather {
  date: string;
  tempMax?: number;
  tempMin?: number;
  condition: string;
  windDir?: string;
  windScale?: string;
  humidity?: number;
  suggestion?: string;
  source: UnifiedMapProvider | "fallback";
}

export interface MapProviderStatus {
  provider: UnifiedMapProvider;
  configured: boolean;
  displayName: string;
  capabilities: string[];
  warnings: string[];
  tileUrl?: string;
}

export interface UnifiedMapProviderClient {
  status(): MapProviderStatus;
  geocode(query: { address: string; city?: string }, signal?: AbortSignal): Promise<UnifiedPoi[]>;
  reverseGeocode(query: MapPoint, signal?: AbortSignal): Promise<{
    city: string;
    district: string;
    address: string;
    formattedAddress: string;
    source: UnifiedMapProvider;
    confidence: "high" | "low";
    needsConfirmation: boolean;
  }>;
  searchPois(query: {
    keywords: string;
    city?: string;
    types?: string;
    location?: MapPoint;
    radius?: number;
    page?: number;
    pageSize?: number;
  }, signal?: AbortSignal): Promise<UnifiedPoi[]>;
  nearbyPois(query: { location: MapPoint; city?: string; radius?: number; types?: string }, signal?: AbortSignal): Promise<UnifiedPoi[]>;
  route(query: {
    from: { name?: string; location: MapPoint };
    to: { name?: string; location: MapPoint };
    waypoints?: Array<{ name?: string; location: MapPoint }>;
    mode?: "driving" | "walking" | "cycling";
    strategy?: string;
  }, signal?: AbortSignal): Promise<UnifiedRoute>;
  weather(query: { city: string; date?: string }, signal?: AbortSignal): Promise<UnifiedWeather>;
}
