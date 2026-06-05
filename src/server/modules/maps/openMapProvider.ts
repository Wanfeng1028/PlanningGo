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

// --- Coordinate precision helper (fix #4: prevent URL overflow) ---

const TRUNCATE_DECIMALS = 6;

function truncateCoord(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(TRUNCATE_DECIMALS));
}

function truncatePoint(p: MapPoint): MapPoint {
  return { lng: truncateCoord(p.lng), lat: truncateCoord(p.lat) };
}

// --- Safe Overpass QL builder (fix #2: prevent QL injection) ---

/**
 * Whitelist of allowed Overpass element types for safety.
 * Only "node" and "way" are safe for around-queries; "relation" can be huge.
 */
const SAFE_OVERPASS_ELEMENT_TYPES = new Set(["node", "way"]);

/**
 * Whitelist of allowed OSM tag keys for POI type filtering.
 * These are common, well-known tag keys that are safe to use in ["key"] queries.
 */
const SAFE_OVERPASS_TAG_KEYS = new Set([
  "amenity", "bar", "bank", "bicycle_parking", "boat_rental", "bureau_de_change",
  "cafe", "cinema", "clinic", "college", "courthouse", "dentist", "doctor",
  "embassy", "fast_food", "ferry_terminal", "fire_station", "food_court",
  "fountain", "fuel", "grave_yard", "hospital", "ice_cream", "library",
  "marketplace", "monastery", "monument", "music", "nightclub", "nursing_home",
  "office", "parking", "pharmacy", "place_of_worship", "police", "post_box",
  "post_office", "prison", "pub", "public_building", "recycling", "restaurant",
  "school", "shelter", "studio", "theatre", "ticket", "tattoo", "theatre",
  "toilets", "townhall", "university", "veterinary", "waste_basket",
  "attraction", "banner", "boundary", "camp_site", "car_rental", "car_wash",
  "casino", "cemetery", "charging_station", "childcare", "clothes",
  "community_centre", "computer", "confectionery", "convenience",
  "courthouse", "dentist", "department_store", "doctors", "driving_school",
  "electronics", "embassy", "event_venue", "farm", "ferry_terminal",
  "financial_institution", "food", "fountain", "fuel", "gallery", "garden",
  "gift", "golf", "grocery", "hairdresser", "harbour", "health_check",
  "hobby", "hospital", "hotel", "information", "jewelry", "kiosk",
  "kindergarten", "laundry", "library", "liquor", "locker", "lottery",
  "mall", "marketplace", "mobile_phone", "motorcycle", "music", "museum",
  "nightclub", "nursing_home", "optician", "outdoor", "package_return",
  "parking", "payment_terminal", "perfumery", "pet", "photo", "pier",
  "place_of_worship", "police", "post_office", "prison", "pub", "pub",
  "public_building", "ranger_station", "recycling", "restaurant", "retail",
  "sanitary_dump_station", "shoe_repair", "shoe", "solar_energy", "spa",
  "stadium", "storage_rental", "supermarket", "swimming_pool", "table",
  "taxi", "tea", "theatre", "tobacco", "toilets", "tool_hire", "tower",
  "tradition", "travel_agent", "university", "vending_machine", "veterinary",
  "video", "waste_basket", "wheelchair", "yoga",
  "leisure", "garden", "golf", "hackerspace", "horse_riding", "ice_rink",
  "miniature_golf", "park", "pitch", "playground", "sports_centre",
  "stadium", "swimming_pool", "water_park", "winter_sports",
  "shop", "alcohol", "antique", "art", "bag", "bakery", "beauty",
  "bed", "beverages", "bicycle", "books", "boutique", "butcher",
  "car", "car_parts", "charity", "cheese", "chemist", "chocolate",
  "clothes", "coffee", "computer", "confectionery", "convenience",
  "copyshop", "cosmetics", "deli", "delicatessen", "department_store",
  "doityourself", "dry_cleaning", "economy", "electronics", "erotic",
  "fabric", "florist", "frame", "furniture", "garden_centre", "general",
  "gift", "greengrocer", "hairdresser", "hardware", "hearing_aids",
  "hifi", "ice_cream", "interior_decoration", "jewelry", "kiosk",
  "lamps", "laundry", "mall", "massage", "mobile_phone", "motorcycle",
  "music", "musical_instrument", "newsagent", "optician", "outdoor",
  "paint", "pastry", "perfumery", "pet", "photo", "seafood", "sewing",
  "shoe", "shoes", "sports", "stationery", "supermarket", "tailor",
  "tattoo", "ticket", "tobacco", "toys", "travel_agency", "video",
  "watch", "weapons", "wholesale", "wines",
  "tourism", "album", "alpine_hut", "aquarium", "artwork", "attraction",
  "bed_and_breakfast", "behind", "botanical_garden", "brothel", "camp_site",
  "caravan_site", "chalet", "gallery", "guest_house", "hostel", "hotel",
  "information", "motel", "museum", "picnic_site", "theme_park", "viewpoint",
  "zoo",
  "historic", "abbey", "aircraft", "aqueduct", "archaeological_site",
  "boundary_stone", "castle", "chronograph", "city_gate", "citywall",
  "church", "civic_building", "computer", "concrete", "crannog", "cross",
  "fort", "heritage", "historic", "house", "industrial", "manor",
  "memorial", "milestone", "mine", "monument", "office", "optician",
  "ruins", "rune_stone", "ship", "tower", "tomb", "wreck", "wayside_cross",
  "wayside_shrine", "weather_vane", "windmill", "wine_mill",
  "public_transport", "station",
]);

/**
 * Validate and sanitize a POI type string for use in Overpass queries.
 * Returns the sanitized string, or empty string if invalid.
 *
 * Supports:
 * - Single safe key: "amenity"
 * - Pipe-separated keys: "amenity|cafe|restaurant"
 * - NOT supported (and rejected): values, complex expressions, comments
 */
function sanitizeOverpassType(type: string): string {
  if (!type || typeof type !== "string") return "";

  const sanitized = type
    .trim()
    .split("|")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && SAFE_OVERPASS_TAG_KEYS.has(t))
    .join("|");

  return sanitized;
}

/**
 * Build a safe Overpass QL query for keyword-based POI search.
 * Uses Overpass API to search by name/keyword matching, not Nominatim.
 *
 * This query searches for elements within a radius that have a tag matching
 * the keyword in common name fields (name, name:zh, brand, operator).
 */
function buildOverpassKeywordQuery(
  keyword: string,
  lat: number,
  lng: number,
  radius: number,
): string {
  // Sanitize keyword: only allow safe characters (alphanumeric, spaces, common punctuation)
  const sanitizedKeyword = keyword
    .replace(/[^\w\s\u4e00-\u9fff\-\.\/\,\!\?\(\)]/g, "")
    .trim();

  if (!sanitizedKeyword) {
    return "[out:json][timeout:8];out;"; // no-op query
  }

  // Overpass QL: search for elements with keyword in name fields within radius
  // Uses regex matching on multiple name tags to support Chinese/English
  const body = `[out:json][timeout:8];
(
  node(around:${radius},${lat},${lng})["name"~"${sanitizedKeyword}",i];
  node(around:${radius},${lat},${lng})["name:zh"~"${sanitizedKeyword}",i];
  node(around:${radius},${lat},${lng})["brand"~"${sanitizedKeyword}",i];
  node(around:${radius},${lat},${lng})["operator"~"${sanitizedKeyword}",i];
  way(around:${radius},${lat},${lng})["name"~"${sanitizedKeyword}",i];
  way(around:${radius},${lat},${lng})["name:zh"~"${sanitizedKeyword}",i];
  way(around:${radius},${lat},${lng})["brand"~"${sanitizedKeyword}",i];
  way(around:${radius},${lat},${lng})["operator"~"${sanitizedKeyword}",i];
);
out center tags 30;`;

  return body;
}

/**
 * Build a safe Overpass QL query for type-based nearby POI search.
 * Uses whitelisted tag keys only.
 */
function buildOverpassTypeQuery(
  lat: number,
  lng: number,
  radius: number,
  types: string,
): string {
  const sanitizedTypes = sanitizeOverpassType(types);

  if (!sanitizedTypes) {
    // Default: search common amenity categories if no valid types provided
    return `[out:json][timeout:8];
(
  node(around:${radius},${lat},${lng})["amenity"];
  node(around:${radius},${lat},${lng})["tourism"];
  node(around:${radius},${lat},${lng})["shop"];
  node(around:${radius},${lat},${lng})["leisure"];
);
out center tags 30;`;
  }

  // Build query with whitelisted types only
  const typeKeys = sanitizedTypes.split("|");
  const nodeQueries = typeKeys.map((t) => `node(around:${radius},${lat},${lng})["${t}"];`).join("");
  const wayQueries = typeKeys.map((t) => `way(around:${radius},${lat},${lng})["${t}"];`).join("");

  return `[out:json][timeout:8];(${nodeQueries}${wayQueries});out center tags 30;`;
}

// --- Unified POI ID generator (fix #5: consistent ID across sources) ---

/**
 * Generate a consistent, dedup-friendly ID for any OSM element.
 * Works for both Nominatim results and Overpass API results.
 */
function generateOsmPoiId(osmType: string | undefined, osmId: number | string | undefined): string {
  const safeType = (osmType ?? "place").replace(/[^a-z0-9_-]/gi, "x");
  const safeId = String(osmId ?? 0).replace(/[^a-z0-9_-]/gi, "");
  return `open-${safeType}-${safeId}`;
}

// --- Nominatim result normalizer ---

function normalizeNominatimPoi(item: {
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
    id: generateOsmPoiId(item.osm_type, item.osm_id ?? item.place_id),
    name: item.name || address?.split(",")[0]?.trim() || fallbackName,
    address: address || "",
    type: item.type || item.class || "poi",
    location: { lng, lat },
    source: "open",
    raw: item,
  };
}

// --- Overpass result normalizer ---

function overpassTagToName(tags: Record<string, string>) {
  return tags.name || tags["name:zh"] || tags.brand || tags.operator || tags.amenity || tags.tourism || tags.shop || "周边地点";
}

function overpassTagToType(tags: Record<string, string>) {
  return tags.tourism || tags.amenity || tags.shop || tags.leisure || tags.historic || tags.public_transport || "poi";
}

function normalizeOverpassPoi(
  item: {
    id: number;
    type: string;
    lat?: number;
    lon?: number;
    center?: { lat?: number; lon?: number };
    tags?: Record<string, string>;
  },
  location: MapPoint,
): UnifiedPoi | null {
  const lat = Number(item.lat ?? item.center?.lat);
  const lng = Number(item.lon ?? item.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = item.tags ?? {};
  const name = overpassTagToName(tags);
  if (!name) return null;

  return {
    id: generateOsmPoiId(item.type, item.id),
    name,
    address: tags["addr:full"] || [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
    type: overpassTagToType(tags),
    location: { lng, lat },
    distance: distanceMeters(location, { lng, lat }),
    source: "open",
    tel: tags.phone,
    raw: item,
  };
}

function osrmCoordinatesToPoints(coordinates: unknown): MapPoint[] | undefined {
  if (!Array.isArray(coordinates)) return undefined;
  return coordinates.flatMap((coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return [];
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [truncatePoint({ lng, lat })] : [];
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
    // Fix #1: Use Overpass API for keyword POI search instead of Nominatim
    // Nominatim is for geocoding only, not POI search
    const radius = Math.min(Math.max(query.radius ?? 5000, 300), 10000);
    const center = query.location ?? { lng: 121.4737, lat: 31.2304 }; // default to Shanghai if no location
    const truncatedCenter = truncatePoint(center);

    const body = buildOverpassKeywordQuery(query.keywords, truncatedCenter.lat, truncatedCenter.lng, radius);

    const res = await fetch(this.options.overpassUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: body }),
      signal: withSignal(this.options.timeoutMs, signal),
    });
    if (!res.ok) throw new Error(`OPEN_MAP_SEARCH_FAILED_${res.status}`);
    const data = await res.json() as {
      elements?: Array<{ id: number; type: string; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> }>;
    };

    const seen = new Set<string>();
    const pois: UnifiedPoi[] = [];
    for (const item of data.elements ?? []) {
      const poi = normalizeOverpassPoi(item, truncatedCenter);
      if (poi && !seen.has(poi.id)) {
        seen.add(poi.id);
        pois.push(poi);
      }
    }

    // Sort by distance and return top pageSize
    pois.sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999));
    return pois.slice(0, query.pageSize ?? 10);
  }

  async nearbyPois(query: { location: MapPoint; radius?: number; types?: string }, signal?: AbortSignal): Promise<UnifiedPoi[]> {
    const radius = Math.min(Math.max(query.radius ?? 3000, 300), 10000);
    const truncatedLocation = truncatePoint(query.location);

    // Fix #2: Use safe Overpass QL builder with type whitelist
    const body = query.types
      ? buildOverpassTypeQuery(truncatedLocation.lat, truncatedLocation.lng, radius, query.types)
      : buildOverpassTypeQuery(truncatedLocation.lat, truncatedLocation.lng, radius, "");

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
    const pois: UnifiedPoi[] = [];
    for (const item of data.elements ?? []) {
      const poi = normalizeOverpassPoi(item, truncatedLocation);
      if (poi && !seen.has(poi.id)) {
        seen.add(poi.id);
        pois.push(poi);
      }
    }

    pois.sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999));
    return pois.slice(0, 20);
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

    // Fix #4: Truncate coordinates to 6 decimals (cm-level precision) to prevent URL overflow
    const points = [
      truncatePoint(query.from.location),
      ...(query.waypoints ?? []).map((w) => truncatePoint(w.location)),
      truncatePoint(query.to.location),
    ];
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
    const fromTruncated = truncatePoint(query.from.location);
    const toTruncated = truncatePoint(query.to.location);
    const navigationUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_${mode}&route=${fromTruncated.lat}%2C${fromTruncated.lng}%3B${toTruncated.lat}%2C${toTruncated.lng}`;
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
