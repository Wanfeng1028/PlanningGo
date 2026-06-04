/**
 * 高德地图 Provider — 真实 API 实现
 */

import type {
  MapProvider,
  PoiQuery,
  PoiResult,
  WeatherQuery,
  WeatherResult,
  RouteQuery,
  RouteResult,
} from "./types.js";

interface AmapProviderOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

export class AmapMapProvider implements MapProvider {
  constructor(private readonly options: AmapProviderOptions) {}

  async searchPois(query: PoiQuery, signal?: AbortSignal): Promise<PoiResult[]> {
    const url = new URL("/v5/place/text", this.options.baseUrl);
    url.searchParams.set("key", this.options.apiKey);
    url.searchParams.set("keywords", query.keywords);
    url.searchParams.set("city", query.city);
    url.searchParams.set("citylimit", "true");
    url.searchParams.set("offset", String(query.pageSize ?? 10));
    url.searchParams.set("page", String(query.page ?? 1));
    url.searchParams.set("extensions", "all");

    if (query.types) {
      url.searchParams.set("types", query.types);
    }

    // Merge external signal with internal timeout
    const timeoutSignal = AbortSignal.timeout(this.options.timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

    const res = await fetch(url, {
      signal: combinedSignal,
    });

    if (!res.ok) {
      throw new Error(`AMAP_SEARCH_FAILED_${res.status}`);
    }

    const data = (await res.json()) as {
      status: string;
      infocode?: string;
      pois?: Array<{
        id: string;
        name: string;
        address: string;
        type: string;
        location: string;
        biz_ext?: { rating?: string; cost?: string };
        photos?: Array<{ url: string }>;
        tel?: string;
        distance?: string;
        cityname?: string;
        adcode?: string;
      }>;
    };

    if (data.status !== "1") {
      throw new Error(`AMAP_SEARCH_ERROR_${data.infocode ?? "UNKNOWN"}`);
    }

    return (data.pois ?? []).map((poi) => {
      const [lng, lat] = poi.location.split(",").map(Number);
      return {
        id: poi.id,
        name: poi.name,
        address: poi.address || "",
        type: poi.type || "",
        location: { lng, lat },
        rating: poi.biz_ext?.rating ? parseFloat(poi.biz_ext.rating) : undefined,
        cost: poi.biz_ext?.cost ? parseFloat(poi.biz_ext.cost) : undefined,
        photos: poi.photos?.map((p) => p.url),
        tel: poi.tel,
        distance: poi.distance ? parseInt(poi.distance, 10) : undefined,
        source: "amap",
        city: poi.cityname,
        adcode: poi.adcode,
      };
    });
  }

  async getWeather(query: WeatherQuery): Promise<WeatherResult> {
    // 先通过城市名获取 adcode
    const geoUrl = new URL("/v3/geocode/geo", this.options.baseUrl);
    geoUrl.searchParams.set("key", this.options.apiKey);
    geoUrl.searchParams.set("city", query.city);

    const geoRes = await fetch(geoUrl, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    if (!geoRes.ok) {
      throw new Error(`AMAP_GEO_FAILED_${geoRes.status}`);
    }

    const geoData = (await geoRes.json()) as {
      status: string;
      geocodes?: Array<{ adcode: string }>;
    };

    const adcode = geoData.geocodes?.[0]?.adcode;
    if (!adcode) {
      throw new Error(`AMAP_GEO_NO_RESULT_${query.city}`);
    }

    // 获取天气
    const weatherUrl = new URL("/v3/weather/weatherInfo", this.options.baseUrl);
    weatherUrl.searchParams.set("key", this.options.apiKey);
    weatherUrl.searchParams.set("city", adcode);
    weatherUrl.searchParams.set("extensions", "all");

    const weatherRes = await fetch(weatherUrl, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    if (!weatherRes.ok) {
      throw new Error(`AMAP_WEATHER_FAILED_${weatherRes.status}`);
    }

    const weatherData = (await weatherRes.json()) as {
      status: string;
      forecasts?: Array<{
        casts?: Array<{
          date: string;
          daytemp: string;
          nighttemp: string;
          dayweather: string;
          daywind: string;
          daypower: string;
          nighthumidity?: string;
        }>;
      }>;
    };

    if (weatherData.status !== "1") {
      throw new Error("AMAP_WEATHER_ERROR");
    }

    const cast = weatherData.forecasts?.[0]?.casts?.[0];
    if (!cast) {
      throw new Error("AMAP_WEATHER_NO_DATA");
    }

    return {
      date: cast.date,
      tempMax: parseInt(cast.daytemp, 10),
      tempMin: parseInt(cast.nighttemp, 10),
      condition: cast.dayweather,
      windDir: cast.daywind,
      windScale: `${cast.daypower}级`,
      humidity: cast.nighthumidity ? parseInt(cast.nighthumidity, 10) : 50,
    };
  }

  async planRoute(query: RouteQuery): Promise<RouteResult> {
    const origin = query.from.lng && query.from.lat
      ? `${query.from.lng},${query.from.lat}`
      : "";
    const destination = query.to.lng && query.to.lat
      ? `${query.to.lng},${query.to.lat}`
      : "";

    if (!origin || !destination) {
      throw new Error("AMAP_ROUTE_MISSING_COORDINATES");
    }

    const url = new URL("/v3/direction/driving", this.options.baseUrl);
    url.searchParams.set("key", this.options.apiKey);
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("strategy", query.strategy === "最快到达" ? "0" : "10");

    if (query.waypoints?.length) {
      const waypoints = query.waypoints
        .filter((w) => w.lng && w.lat)
        .map((w) => `${w.lng},${w.lat}`)
        .join("|");
      if (waypoints) {
        url.searchParams.set("waypoints", waypoints);
      }
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`AMAP_ROUTE_FAILED_${res.status}`);
    }

    const data = (await res.json()) as {
      status: string;
      route?: {
        distance?: string;
        duration?: string;
        tolls?: string;
        polyline?: string;
        steps?: Array<{
          instruction: string;
          road: string;
          distance: string;
          duration: string;
        }>;
      };
    };

    if (data.status !== "1" || !data.route) {
      throw new Error("AMAP_ROUTE_ERROR");
    }

    return {
      distance: parseInt(data.route.distance ?? "0", 10),
      duration: parseInt(data.route.duration ?? "0", 10),
      cost: data.route.tolls ? parseFloat(data.route.tolls) : undefined,
      strategy: query.strategy || "最快到达",
      steps: (data.route.steps ?? []).map((step) => ({
        instruction: step.instruction,
        road: step.road,
        distance: parseInt(step.distance, 10),
        duration: parseInt(step.duration, 10),
      })),
      polyline: data.route.polyline,
    };
  }
}
