import type { MapProvider, PoiQuery, PoiResult, RouteQuery, RouteResult, WeatherQuery, WeatherResult } from "./types.js";
import { OpenMapProvider } from "../modules/maps/openMapProvider.js";

interface OpenMapMapProviderOptions {
  tileUrl: string;
  nominatimUrl: string;
  overpassUrl: string;
  routeUrl: string;
  timeoutMs: number;
  publicDemoOk: boolean;
  nodeEnv: string;
}

function toPoiResult(poi: Awaited<ReturnType<OpenMapProvider["searchPois"]>>[number]): PoiResult {
  return {
    id: poi.id,
    name: poi.name,
    address: poi.address,
    type: poi.type,
    location: poi.location,
    rating: poi.rating,
    cost: poi.cost,
    photos: poi.photos,
    tel: poi.tel,
    distance: poi.distance,
    source: "open",
  };
}

export class OpenMapMapProvider implements MapProvider {
  private readonly provider: OpenMapProvider;

  constructor(options: OpenMapMapProviderOptions) {
    this.provider = new OpenMapProvider(options);
  }

  async searchPois(query: PoiQuery, signal?: AbortSignal): Promise<PoiResult[]> {
    if (query.location && !query.keywords) {
      const pois = await this.provider.nearbyPois({
        location: query.location,
        radius: query.radius,
        types: query.types,
      }, signal);
      return pois.map(toPoiResult);
    }
    const pois = await this.provider.searchPois({
      keywords: query.keywords,
      city: query.city,
      types: query.types,
      location: query.location,
      radius: query.radius,
      page: query.page,
      pageSize: query.pageSize,
    }, signal);
    return pois.map(toPoiResult);
  }

  async getWeather(query: WeatherQuery, signal?: AbortSignal): Promise<WeatherResult> {
    const weather = await this.provider.weather({ city: query.city, date: query.date }, signal);
    return {
      date: weather.date,
      tempMax: weather.tempMax ?? 0,
      tempMin: weather.tempMin ?? 0,
      condition: weather.condition,
      windDir: weather.windDir ?? "",
      windScale: weather.windScale ?? "",
      humidity: weather.humidity ?? 0,
      suggestion: weather.suggestion,
    };
  }

  async planRoute(query: RouteQuery, signal?: AbortSignal): Promise<RouteResult> {
    const from = await this.resolvePoint(query.from, signal);
    const to = await this.resolvePoint(query.to, signal);
    const waypoints = await Promise.all((query.waypoints ?? []).map(async (waypoint) => ({
      name: waypoint.name,
      location: await this.resolvePoint(waypoint, signal),
    })));
    const route = await this.provider.route({
      from: { name: query.from.name, location: from },
      to: { name: query.to.name, location: to },
      waypoints,
      mode: "driving",
      strategy: query.strategy,
    }, signal);
    return {
      distance: route.distance,
      duration: route.duration,
      strategy: route.strategy,
      steps: route.steps.map((step) => ({
        instruction: step.instruction,
        road: step.road ?? "",
        distance: step.distance,
        duration: step.duration,
      })),
      polyline: route.coordinates?.map((point) => `${point.lng},${point.lat}`).join(";"),
    };
  }

  private async resolvePoint(point: { name: string; lng?: number; lat?: number }, signal?: AbortSignal) {
    if (Number.isFinite(point.lng) && Number.isFinite(point.lat)) {
      return { lng: point.lng!, lat: point.lat! };
    }
    const results = await this.provider.geocode({ address: point.name }, signal);
    const first = results[0];
    if (!first) throw new Error(`OPEN_MAP_ROUTE_GEOCODE_NO_RESULT_${point.name}`);
    return first.location;
  }
}
