import { env } from "../../../config/env";
import type {
  AmapGeocodeResponse,
  AmapRegeocodeResponse,
  AmapPoiResponse,
  AmapRouteResponse,
  AmapWeatherLiveResponse,
  AmapWeatherForecastResponse,
} from "./types";

/**
 * Custom error for AMap API failures
 */
export class AmapError extends Error {
  constructor(
    public code: string,
    message: string,
    public infocode?: string,
  ) {
    super(message);
    this.name = "AmapError";
  }
}

/**
 * AMap Web Service API Client
 * Handles all HTTP requests to AMap APIs with proper error handling and timeout
 */
export class AmapClient {
  private readonly baseUrl: string;
  private readonly key: string | undefined;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = env.AMAP_BASE_URL;
    this.key = env.AMAP_WEB_SERVICE_KEY;
    this.timeoutMs = env.AMAP_TIMEOUT_MS;
  }

  /**
   * Check if AMap key is configured
   */
  isConfigured(): boolean {
    return Boolean(this.key && this.key.length > 0);
  }

  /**
   * Generic GET request to AMap API
   */
  async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    if (!this.isConfigured()) {
      throw new AmapError("AMAP_NOT_CONFIGURED", "AMAP_WEB_SERVICE_KEY is not configured");
    }

    const url = new URL(path, this.baseUrl);
    url.searchParams.set("key", this.key || "");

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new AmapError("AMAP_HTTP_ERROR", `AMap request failed: ${res.status}`);
      }

      const json: unknown = await res.json();

      // Check AMap API status
      if (typeof json === "object" && json !== null && "status" in json && json.status !== "1") {
        const apiResponse = json as { status: string; info?: string; infocode?: string };
        throw new AmapError(
          "AMAP_API_ERROR",
          apiResponse.info || "AMap API error",
          apiResponse.infocode,
        );
      }

      return json as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AmapError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AmapError("AMAP_TIMEOUT", `AMap request timeout after ${this.timeoutMs}ms`);
      }

      throw new AmapError("AMAP_NETWORK_ERROR", `Network error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Geocoding: address -> coordinates
   */
  async geocode(params: { address: string; city?: string }): Promise<AmapGeocodeResponse> {
    return this.get<AmapGeocodeResponse>("/v3/geocode/geo", {
      address: params.address,
      city: params.city,
    });
  }

  /**
   * Reverse geocoding: coordinates -> address
   */
  async reverseGeocode(params: { location: string }): Promise<AmapRegeocodeResponse> {
    return this.get<AmapRegeocodeResponse>("/v3/geocode/regeo", {
      location: params.location,
      extensions: "base",
    });
  }

  /**
   * POI text search
   */
  async searchPoiText(params: {
    keywords: string;
    city: string;
    citylimit?: boolean;
    offset?: number;
    page?: number;
  }): Promise<AmapPoiResponse> {
    return this.get<AmapPoiResponse>("/v5/place/text", {
      keywords: params.keywords,
      city: params.city,
      citylimit: params.citylimit ? "true" : "false",
      offset: params.offset,
      page: params.page,
    });
  }

  /**
   * POI around search
   */
  async searchPoiAround(params: {
    location: string;
    keywords: string;
    radius?: number;
    offset?: number;
  }): Promise<AmapPoiResponse> {
    return this.get<AmapPoiResponse>("/v5/place/around", {
      keywords: params.keywords,
      location: params.location,
      radius: params.radius,
      offset: params.offset,
    });
  }

  /**
   * Walking route planning
   */
  async routeWalking(params: { origin: string; destination: string }): Promise<AmapRouteResponse> {
    return this.get<AmapRouteResponse>("/v4/direction/walking", {
      origin: params.origin,
      destination: params.destination,
    });
  }

  /**
   * Driving route planning
   */
  async routeDriving(params: {
    origin: string;
    destination: string;
    strategy?: number;
  }): Promise<AmapRouteResponse> {
    return this.get<AmapRouteResponse>("/v4/direction/driving", {
      origin: params.origin,
      destination: params.destination,
      strategy: params.strategy,
    });
  }

  /**
   * Transit route planning
   */
  async routeTransit(params: {
    origin: string;
    destination: string;
    city?: string;
  }): Promise<AmapRouteResponse> {
    return this.get<AmapRouteResponse>("/v4/direction/transit/integrated", {
      origin: params.origin,
      destination: params.destination,
      city: params.city,
    });
  }

  /**
   * Live weather
   */
  async weatherLive(params: { city: string }): Promise<AmapWeatherLiveResponse> {
    return this.get<AmapWeatherLiveResponse>("/v3/weather/weatherInfo", {
      city: params.city,
      extensions: "base",
    });
  }

  /**
   * Weather forecast
   */
  async weatherForecast(params: { city: string }): Promise<AmapWeatherForecastResponse> {
    return this.get<AmapWeatherForecastResponse>("/v3/weather/weatherInfo", {
      city: params.city,
      extensions: "all",
    });
  }
}

// Singleton instance
let amapClientInstance: AmapClient | null = null;

export function getAmapClient(): AmapClient {
  if (!amapClientInstance) {
    amapClientInstance = new AmapClient();
  }
  return amapClientInstance;
}
