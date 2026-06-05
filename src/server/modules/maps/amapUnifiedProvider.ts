import type { MapPoint, MapProviderStatus, UnifiedMapProviderClient, UnifiedPoi, UnifiedRoute, UnifiedWeather } from "./types.js";

interface AmapOptions {
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
}

function timeoutSignal(ms: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

function requireKey(key?: string): string {
  if (!key) throw new Error("AMAP_NOT_CONFIGURED");
  return key;
}

function parseLocation(value?: string): MapPoint | null {
  if (!value) return null;
  const [lng, lat] = value.split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

function amapNavigationUrl(from: MapPoint, to: MapPoint, toName?: string) {
  const destName = encodeURIComponent(toName || "目的地");
  return `https://uri.amap.com/navigation?from=${from.lng},${from.lat},出发地&to=${to.lng},${to.lat},${destName}&mode=car&coordinate=gaode`;
}

export class AmapUnifiedProvider implements UnifiedMapProviderClient {
  constructor(private readonly options: AmapOptions) {}

  status(): MapProviderStatus {
    const configured = Boolean(this.options.apiKey);
    return {
      provider: "amap",
      configured,
      displayName: "高德地图",
      capabilities: configured
        ? ["tiles", "geocode", "reverseGeocode", "poiSearch", "nearbyPois", "route", "weather", "navigationUrl"]
        : [],
      warnings: configured ? [] : ["未配置高德 Web 服务 Key，高德地图服务暂不可用。"],
    };
  }

  async geocode(query: { address: string; city?: string }, signal?: AbortSignal): Promise<UnifiedPoi[]> {
    const key = requireKey(this.options.apiKey);
    const url = new URL("/v3/geocode/geo", this.options.baseUrl);
    url.searchParams.set("key", key);
    url.searchParams.set("address", query.address);
    if (query.city) url.searchParams.set("city", query.city);
    const res = await fetch(url, { signal: timeoutSignal(this.options.timeoutMs, signal) });
    if (!res.ok) throw new Error(`AMAP_GEOCODE_FAILED_${res.status}`);
    const data = await res.json() as {
      status?: string;
      geocodes?: Array<{ formatted_address?: string; country?: string; province?: string; city?: string; district?: string; township?: string; adcode?: string; location?: string }>;
    };
    if (data.status !== "1") throw new Error("AMAP_GEOCODE_ERROR");
    return (data.geocodes ?? []).flatMap((item, index): UnifiedPoi[] => {
      const location = parseLocation(item.location);
      if (!location) return [];
      return [{
        id: `amap-geocode-${item.adcode ?? index}-${location.lng},${location.lat}`,
        name: item.formatted_address || query.address,
        address: item.formatted_address || "",
        type: "geocode",
        location,
        source: "amap",
        raw: item,
      }];
    });
  }

  async reverseGeocode(query: MapPoint, signal?: AbortSignal) {
    const key = requireKey(this.options.apiKey);
    const url = new URL("/v3/geocode/regeo", this.options.baseUrl);
    url.searchParams.set("key", key);
    url.searchParams.set("location", `${query.lng},${query.lat}`);
    url.searchParams.set("extensions", "base");
    const res = await fetch(url, { signal: timeoutSignal(this.options.timeoutMs, signal) });
    if (!res.ok) throw new Error(`AMAP_REVERSE_FAILED_${res.status}`);
    const data = await res.json() as {
      status?: string;
      regeocode?: { formatted_address?: string; addressComponent?: { city?: string | string[]; district?: string; province?: string } };
    };
    if (data.status !== "1" || !data.regeocode) throw new Error("AMAP_REVERSE_ERROR");
    const ac = data.regeocode.addressComponent ?? {};
    const city = Array.isArray(ac.city) ? ac.city[0] ?? ac.province ?? "" : ac.city || ac.province || "";
    return {
      city,
      district: ac.district ?? "",
      address: data.regeocode.formatted_address ?? "",
      formattedAddress: data.regeocode.formatted_address ?? `${city}${ac.district ?? ""}`,
      source: "amap" as const,
      confidence: "high" as const,
      needsConfirmation: false,
    };
  }

  async searchPois(query: {
    keywords: string;
    city?: string;
    types?: string;
    location?: MapPoint;
    radius?: number;
    page?: number;
    pageSize?: number;
  }, signal?: AbortSignal): Promise<UnifiedPoi[]> {
    const key = requireKey(this.options.apiKey);
    const url = new URL(query.location ? "/v5/place/around" : "/v5/place/text", this.options.baseUrl);
    url.searchParams.set("key", key);
    url.searchParams.set("keywords", query.keywords);
    url.searchParams.set("offset", String(query.pageSize ?? 10));
    url.searchParams.set("page", String(query.page ?? 1));
    url.searchParams.set("extensions", "all");
    if (query.city) url.searchParams.set("city", query.city);
    if (query.types) url.searchParams.set("types", query.types);
    if (query.location) {
      url.searchParams.set("location", `${query.location.lng},${query.location.lat}`);
      url.searchParams.set("radius", String(query.radius ?? 3000));
      url.searchParams.set("sortrule", "distance");
    } else {
      url.searchParams.set("citylimit", "true");
    }
    const res = await fetch(url, { signal: timeoutSignal(this.options.timeoutMs, signal) });
    if (!res.ok) throw new Error(`AMAP_POI_FAILED_${res.status}`);
    const data = await res.json() as {
      status?: string;
      pois?: Array<{ id?: string; name?: string; address?: string | string[]; type?: string; location?: string; distance?: string; biz_ext?: { rating?: string; cost?: string }; photos?: Array<{ url?: string }>; tel?: string }>;
    };
    if (data.status !== "1") throw new Error("AMAP_POI_ERROR");
    return (data.pois ?? []).flatMap((poi): UnifiedPoi[] => {
      const location = parseLocation(poi.location);
      if (!location || !poi.id || !poi.name) return [];
      return [{
        id: poi.id,
        name: poi.name,
        address: Array.isArray(poi.address) ? poi.address.join("") : poi.address || "",
        type: poi.type || "poi",
        location,
        rating: poi.biz_ext?.rating ? Number.parseFloat(poi.biz_ext.rating) : undefined,
        cost: poi.biz_ext?.cost ? Number.parseFloat(poi.biz_ext.cost) : undefined,
        distance: poi.distance ? Number.parseInt(poi.distance, 10) : undefined,
        tel: poi.tel,
        photos: poi.photos?.flatMap((p) => p.url ? [p.url] : []),
        source: "amap",
        raw: poi,
      }];
    });
  }

  async nearbyPois(query: { location: MapPoint; city?: string; radius?: number; types?: string }, signal?: AbortSignal): Promise<UnifiedPoi[]> {
    return this.searchPois({
      keywords: "",
      city: query.city,
      types: query.types || "餐饮服务|风景名胜|购物服务|生活服务|体育休闲服务|科教文化服务",
      location: query.location,
      radius: query.radius,
      pageSize: 20,
    }, signal);
  }

  async route(query: {
    from: { name?: string; location: MapPoint };
    to: { name?: string; location: MapPoint };
    waypoints?: Array<{ name?: string; location: MapPoint }>;
    mode?: "driving" | "walking" | "cycling";
    strategy?: string;
  }, signal?: AbortSignal): Promise<UnifiedRoute> {
    const key = requireKey(this.options.apiKey);
    const path = query.mode === "walking" ? "/v3/direction/walking" : query.mode === "cycling" ? "/v4/direction/bicycling" : "/v3/direction/driving";
    const url = new URL(path, this.options.baseUrl);
    url.searchParams.set("key", key);
    url.searchParams.set("origin", `${query.from.location.lng},${query.from.location.lat}`);
    url.searchParams.set("destination", `${query.to.location.lng},${query.to.location.lat}`);
    if (query.mode !== "walking" && query.waypoints?.length) {
      url.searchParams.set("waypoints", query.waypoints.map((w) => `${w.location.lng},${w.location.lat}`).join("|"));
    }
    const res = await fetch(url, { signal: timeoutSignal(this.options.timeoutMs, signal) });
    if (!res.ok) throw new Error(`AMAP_ROUTE_FAILED_${res.status}`);
    const data = await res.json() as {
      status?: string;
      route?: {
        distance?: string;
        duration?: string;
        paths?: Array<{ distance?: string; duration?: string; steps?: Array<{ instruction?: string; road?: string; distance?: string; duration?: string; polyline?: string }> }>;
        paths_count?: string;
      };
      data?: { paths?: Array<{ distance?: number; duration?: number; steps?: Array<{ instruction?: string; road?: string; distance?: number; duration?: number; polyline?: string }> }> };
    };
    if (data.status !== "1") throw new Error("AMAP_ROUTE_ERROR");
    const pathResult = data.route?.paths?.[0] ?? data.data?.paths?.[0];
    if (!pathResult) throw new Error("AMAP_ROUTE_NO_RESULT");
    const steps = (pathResult.steps ?? []).map((step) => ({
      instruction: step.instruction ?? "",
      road: step.road,
      distance: Number(step.distance ?? 0),
      duration: Number(step.duration ?? 0),
    }));
    return {
      distance: Number(pathResult.distance ?? data.route?.distance ?? 0),
      duration: Number(pathResult.duration ?? data.route?.duration ?? 0),
      strategy: query.strategy || "高德路线",
      steps,
      polyline: (pathResult.steps ?? []).flatMap((s) => s.polyline ? [s.polyline] : []).join(";"),
      navigationUrl: amapNavigationUrl(query.from.location, query.to.location, query.to.name),
      source: "amap",
    };
  }

  async weather(query: { city: string; date?: string }, signal?: AbortSignal): Promise<UnifiedWeather> {
    const key = requireKey(this.options.apiKey);
    const geo = await this.geocode({ address: query.city, city: query.city }, signal);
    const first = geo[0];
    const url = new URL("/v3/weather/weatherInfo", this.options.baseUrl);
    url.searchParams.set("key", key);
    url.searchParams.set("city", first?.id.split("-")[2] || query.city);
    url.searchParams.set("extensions", "all");
    const res = await fetch(url, { signal: timeoutSignal(this.options.timeoutMs, signal) });
    if (!res.ok) throw new Error(`AMAP_WEATHER_FAILED_${res.status}`);
    const data = await res.json() as {
      status?: string;
      forecasts?: Array<{ casts?: Array<{ date?: string; daytemp?: string; nighttemp?: string; dayweather?: string; daywind?: string; daypower?: string }> }>;
    };
    if (data.status !== "1") throw new Error("AMAP_WEATHER_ERROR");
    const cast = data.forecasts?.[0]?.casts?.[0];
    if (!cast) throw new Error("AMAP_WEATHER_NO_RESULT");
    return {
      date: cast.date ?? query.date ?? new Date().toISOString().slice(0, 10),
      tempMax: cast.daytemp ? Number.parseInt(cast.daytemp, 10) : undefined,
      tempMin: cast.nighttemp ? Number.parseInt(cast.nighttemp, 10) : undefined,
      condition: cast.dayweather ?? "未知",
      windDir: cast.daywind,
      windScale: cast.daypower ? `${cast.daypower}级` : undefined,
      source: "amap",
    };
  }
}
