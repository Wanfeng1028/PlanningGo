import type { MapPoint, MapProviderStatus, UnifiedMapProviderClient, UnifiedPoi, UnifiedRoute, UnifiedWeather } from "./types.js";

interface OpenMapOptions {
  tileUrl: string;
  nominatimUrl: string;
  overpassUrl: string;
  routeUrl: string;
  timeoutMs: number;
  publicDemoOk: boolean;
  nodeEnv: string;
}

function withSignal(timeoutMs: number, signal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
}

function distanceMeters(a: MapPoint, b: MapPoint) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * s2 * s2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa)));
}

function normalizeOsmPoi(item: {
  osm_type?: string;
  osm_id?: number;
  place_id?: number;
  display_name?: string;
  name?: string;
  lat?: string | number;
  lon?: string | number;
  type?: string;
  class?: string;
  address?: Record<string, string>;
}, fallbackName = "地点"): UnifiedPoi | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = item.display_name ?? Object.values(item.address ?? {}).filter(Boolean).join("");
  return {
    id: `open-${item.osm_type ?? "place"}-${item.osm_id ?? item.place_id ?? `${lng},${lat}`}`,
    name: item.name || address?.split(",")[0]?.trim() || fallbackName,
    address: address || "",
    type: item.type || item.class || "poi",
    location: { lng, lat },
    source: "open",
    raw: item,
  };
}

function overpassTagToName(tags: Record<string, string>) {
  return tags.name || tags["name:zh"] || tags.brand || tags.operator || tags.amenity || tags.tourism || tags.shop || "周边地点";
}

function overpassTagToType(tags: Record<string, string>) {
  return tags.tourism || tags.amenity || tags.shop || tags.leisure || tags.historic || tags.public_transport || "poi";
}

function osrmCoordinatesToPoints(coordinates: unknown): MapPoint[] | undefined {
  if (!Array.isArray(coordinates)) return undefined;
  return coordinates.flatMap((coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return [];
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [{ lng, lat }] : [];
  });
}

export class OpenMapProvider implements UnifiedMapProviderClient {
  constructor(private readonly options: OpenMapOptions) {}

  status(): MapProviderStatus {
    const publicDemo =
      this.options.nominatimUrl.includes("nominatim.openstreetmap.org") ||
      this.options.overpassUrl.includes("overpass-api.de") ||
      this.options.routeUrl.includes("router.project-osrm.org");
    return {
      provider: "open",
      configured: true,
      displayName: "开源地图",
      tileUrl: this.options.tileUrl,
      capabilities: ["tiles", "geocode", "reverseGeocode", "poiSearch", "nearbyPois", "route", "weatherFallback", "navigationUrl"],
      warnings: publicDemo && this.options.nodeEnv === "production" && !this.options.publicDemoOk
        ? ["当前使用公共演示端点，生产环境请切换自建或托管 OpenStreetMap 服务。"]
        : [],
    };
  }

  async geocode(query: { address: string; city?: string }, signal?: AbortSignal): Promise<UnifiedPoi[]> {
    const url = new URL("/search", this.options.nominatimUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "10");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("q", [query.city, query.address].filter(Boolean).join(" "));
    const res = await fetch(url, { signal: withSignal(this.options.timeoutMs, signal), headers: { "user-agent": "PlanningGo/0.1" } });
    if (!res.ok) throw new Error(`OPEN_MAP_GEOCODE_FAILED_${res.status}`);
    const data = await res.json() as unknown[];
    return data.flatMap((item) => {
      const poi = normalizeOsmPoi(item as Parameters<typeof normalizeOsmPoi>[0], query.address);
      return poi ? [poi] : [];
    });
  }

  async reverseGeocode(query: MapPoint, signal?: AbortSignal) {
    const url = new URL("/reverse", this.options.nominatimUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("lat", String(query.lat));
    url.searchParams.set("lon", String(query.lng));
    const res = await fetch(url, { signal: withSignal(this.options.timeoutMs, signal), headers: { "user-agent": "PlanningGo/0.1" } });
    if (!res.ok) throw new Error(`OPEN_MAP_REVERSE_FAILED_${res.status}`);
    const data = await res.json() as { display_name?: string; address?: Record<string, string> };
    const address = data.address ?? {};
    const city = address.city || address.town || address.county || address.state || "";
    const district = address.suburb || address.city_district || address.district || address.county || "";
    return {
      city,
      district,
      address: data.display_name ?? "",
      formattedAddress: data.display_name ?? `${city}${district}`,
      source: "open" as const,
      confidence: city ? "high" as const : "low" as const,
      needsConfirmation: !city,
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
    const pois = await this.geocode({ address: query.keywords, city: query.city }, signal);
    const sorted = query.location
      ? pois.map((poi) => ({ ...poi, distance: distanceMeters(query.location!, poi.location) })).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      : pois;
    return sorted.slice(0, query.pageSize ?? 10);
  }

  async nearbyPois(query: { location: MapPoint; radius?: number; types?: string }, signal?: AbortSignal): Promise<UnifiedPoi[]> {
    const radius = Math.min(Math.max(query.radius ?? 3000, 300), 10000);
    const tags = query.types
      ? `node(around:${radius},${query.location.lat},${query.location.lng})["${query.types}"];way(around:${radius},${query.location.lat},${query.location.lng})["${query.types}"];`
      : [
          `node(around:${radius},${query.location.lat},${query.location.lng})["amenity"];`,
          `node(around:${radius},${query.location.lat},${query.location.lng})["tourism"];`,
          `node(around:${radius},${query.location.lat},${query.location.lng})["shop"];`,
          `node(around:${radius},${query.location.lat},${query.location.lng})["leisure"];`,
        ].join("");
    const body = `[out:json][timeout:8];(${tags});out center tags 30;`;
    const res = await fetch(this.options.overpassUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: body }),
      signal: withSignal(this.options.timeoutMs, signal),
    });
    if (!res.ok) throw new Error(`OPEN_MAP_NEARBY_FAILED_${res.status}`);
    const data = await res.json() as {
      elements?: Array<{ id: number; type: string; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> }>;
    };
    const seen = new Set<string>();
    return (data.elements ?? []).flatMap((item): UnifiedPoi[] => {
      const tags = item.tags ?? {};
      const lat = Number(item.lat ?? item.center?.lat);
      const lng = Number(item.lon ?? item.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const name = overpassTagToName(tags);
      const id = `open-${item.type}-${item.id}`;
      if (seen.has(id) || !name) return [];
      seen.add(id);
      const location = { lng, lat };
      return [{
        id,
        name,
        address: tags["addr:full"] || [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
        type: overpassTagToType(tags),
        location,
        distance: distanceMeters(query.location, location),
        source: "open",
        tel: tags.phone,
        raw: item,
      }];
    }).sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999)).slice(0, 20);
  }

  async route(query: {
    from: { name?: string; location: MapPoint };
    to: { name?: string; location: MapPoint };
    waypoints?: Array<{ name?: string; location: MapPoint }>;
    mode?: "driving" | "walking" | "cycling";
    strategy?: string;
  }, signal?: AbortSignal): Promise<UnifiedRoute> {
    const mode = query.mode === "walking" ? "foot" : query.mode === "cycling" ? "bike" : "car";
    const profile = mode === "foot" ? "foot" : mode === "bike" ? "bike" : "driving";
    const points = [query.from.location, ...(query.waypoints ?? []).map((w) => w.location), query.to.location];
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = new URL(`/route/v1/${profile}/${coords}`, this.options.routeUrl);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "true");
    const res = await fetch(url, { signal: withSignal(this.options.timeoutMs, signal) });
    if (!res.ok) throw new Error(`OPEN_MAP_ROUTE_FAILED_${res.status}`);
    const data = await res.json() as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: unknown };
        legs?: Array<{ steps?: Array<{ name?: string; distance?: number; duration?: number; maneuver?: { instruction?: string; type?: string; modifier?: string } }> }>;
      }>;
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) throw new Error("OPEN_MAP_ROUTE_NO_RESULT");
    const steps = (route.legs ?? []).flatMap((leg) => leg.steps ?? []).map((step) => ({
      instruction: step.maneuver?.instruction || [step.maneuver?.type, step.name].filter(Boolean).join(" "),
      road: step.name,
      distance: Math.round(step.distance ?? 0),
      duration: Math.round(step.duration ?? 0),
    }));
    const navigationUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_${mode}&route=${query.from.location.lat}%2C${query.from.location.lng}%3B${query.to.location.lat}%2C${query.to.location.lng}`;
    return {
      distance: Math.round(route.distance ?? 0),
      duration: Math.round(route.duration ?? 0),
      strategy: query.strategy || "开源路线",
      steps,
      coordinates: osrmCoordinatesToPoints(route.geometry?.coordinates),
      navigationUrl,
      source: "open",
    };
  }

  async weather(query: { city: string; date?: string }, _signal?: AbortSignal): Promise<UnifiedWeather> {
    return {
      date: query.date ?? new Date().toISOString().slice(0, 10),
      condition: "天气服务未配置",
      suggestion: `${query.city} 的地图功能可用，天气信息暂未接入开源天气端点。`,
      source: "fallback",
    };
  }
}
