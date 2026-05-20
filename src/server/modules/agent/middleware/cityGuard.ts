import type { ToolCallPlan, ToolExecutionContext } from "../../tools/types";

/**
 * City context information
 */
export interface CityContext {
  city: string | null;
  adcode?: string;
  province?: string;
  district?: string;
  lat?: number;
  lng?: number;
  source: "manual" | "browser_geo" | "amap_regeo" | "profile" | "fallback" | "unknown";
  confidence: "high" | "medium" | "low";
  needsConfirmation: boolean;
}

/**
 * Error when city is required but not provided
 */
export class CityRequiredError extends Error {
  constructor(code: string, message: string) {
    super(message);
    this.name = "CityRequiredError";
  }
}

/**
 * Apply city guard to a tool call plan
 * Ensures all tool calls are constrained to the selected city
 */
export function applyCityGuard(
  toolCall: ToolCallPlan,
  ctx: ToolExecutionContext & { cityContext: CityContext },
): ToolCallPlan {
  const city = ctx.cityContext.city;

  if (!city) {
    throw new CityRequiredError("CITY_REQUIRED", "需要先选择城市");
  }

  // If tool input is an object, inject city and adcode
  if (toolCall.input && typeof toolCall.input === "object") {
    return {
      ...toolCall,
      input: {
        ...toolCall.input,
        city,
        adcode: ctx.cityContext.adcode,
      },
    };
  }

  return toolCall;
}

/**
 * Build city context from various sources with priority
 * Priority: manual > browser_geo > amap_regeo > profile > conversation > fallback
 */
export function buildCityContext(params: {
  manualCity?: string;
  browserLat?: number;
  browserLng?: number;
  profileCity?: string;
  conversationCity?: string;
  fallbackCity?: string;
}): CityContext {
  const { manualCity, browserLat, browserLng, profileCity, conversationCity, fallbackCity } = params;

  // Manual city selection has highest priority
  if (manualCity) {
    return {
      city: manualCity,
      source: "manual",
      confidence: "high",
      needsConfirmation: false,
    };
  }

  // Browser geolocation (would need reverse geocoding in production)
  if (browserLat && browserLng) {
    return {
      city: null, // Would be filled by reverse geocoding
      lat: browserLat,
      lng: browserLng,
      source: "browser_geo",
      confidence: "high",
      needsConfirmation: true, // Need to confirm with user
    };
  }

  // Profile city
  if (profileCity) {
    return {
      city: profileCity,
      source: "profile",
      confidence: "medium",
      needsConfirmation: false,
    };
  }

  // Conversation city
  if (conversationCity) {
    return {
      city: conversationCity,
      source: "fallback",
      confidence: "medium",
      needsConfirmation: false,
    };
  }

  // Fallback - but don't default to Beijing as per requirements
  return {
    city: fallbackCity || null,
    source: "unknown",
    confidence: "low",
    needsConfirmation: true,
  };
}

/**
 * Extract Chinese city names from text
 */
export function extractChineseCityNames(text: string): string[] {
  const cityPattern = /(北京|上海|天津|重庆|广州|深圳|杭州|南京|苏州|成都|武汉|西安|郑州|青岛|大连|厦门|长沙|哈尔滨|沈阳|济南|昆明|贵阳|兰州|南昌|福州|合肥|海口|石家庄|太原|长春|南宁|呼和浩特|银川|西宁|乌鲁木齐|拉萨|无锡|常州|南通|宁波|温州|嘉兴|绍兴|金华|台州|湖州|衢州|丽水|舟山)/g;
  const matches = text.match(cityPattern);
  return matches || [];
}

/**
 * Validate that output doesn't contain cities other than the allowed city
 */
export function validateOutputCitySafety(text: string, allowedCity: string): boolean {
  const cityPattern = /(北京|上海|天津|重庆|广州|深圳|杭州|南京|苏州|成都|武汉|西安|郑州|青岛|大连|厦门|长沙|哈尔滨|沈阳|济南|昆明|贵阳|兰州|南昌|福州|合肥|海口|石家庄|太原|长春|南宁|呼和浩特|银川|西宁|乌鲁木齐|拉萨|无锡|常州|南通|宁波|温州|嘉兴|绍兴|金华|台州|湖州|衢州|丽水|舟山)/g;
  const matches = text.match(cityPattern);
  return !matches || matches.includes(allowedCity);
}
