import type { UnifiedMapProvider } from "./types.js";

export type NavigationMode = "walking" | "driving" | "transit";

function encodePoint(value: string | undefined): string {
  return encodeURIComponent(value?.trim() || "");
}

export function buildMapSearchUrl(input: {
  provider?: UnifiedMapProvider;
  query: string;
  city?: string;
}): string {
  const provider = input.provider ?? "open";
  const query = input.city ? `${input.city} ${input.query}` : input.query;
  if (provider === "amap") {
    const citySuffix = input.city ? `&city=${encodeURIComponent(input.city)}` : "";
    return `https://www.amap.com/search?query=${encodeURIComponent(input.query)}${citySuffix}`;
  }
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

export function buildNavigationUrl(input: {
  provider?: UnifiedMapProvider;
  origin?: string;
  destination: string;
  mode?: NavigationMode;
  city?: string;
  lat?: number;
  lng?: number;
}): string {
  const provider = input.provider ?? "open";
  const mode = input.mode ?? "driving";
  const destination = input.lat !== undefined && input.lng !== undefined
    ? `${input.lng},${input.lat},${input.destination}`
    : input.destination;

  if (provider === "amap") {
    const amapMode: Record<NavigationMode, string> = {
      walking: "walk",
      driving: "car",
      transit: "bus",
    };
    const parts = [
      input.origin ? `from=${encodePoint(input.origin)}` : "",
      `to=${encodePoint(destination)}`,
      `mode=${amapMode[mode]}`,
      "policy=1",
      input.city ? `city=${encodeURIComponent(input.city)}` : "",
      "src=PlanningGo",
      "coordinate=gaode",
      "callnative=1",
    ].filter(Boolean);
    return `https://uri.amap.com/navigation?${parts.join("&")}`;
  }

  const route = input.origin
    ? `${input.origin} to ${input.destination}`
    : input.destination;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
}
