import { z } from "zod";

// ============================================================================
// AMap API Response Types
// ============================================================================

export interface AmapBaseResponse {
  status: string;
  info?: string;
  infocode?: string;
}

export interface AmapGeocodeResponse extends AmapBaseResponse {
  geocodes?: Array<{
    formatted_address: string;
    province: string;
    city: string;
    citycode: string;
    adcode: string;
    level: string;
    location: string; // "lng,lat"
  }>;
}

export interface AmapRegeocodeResponse extends AmapBaseResponse {
  regeocode?: {
    formatted_address: string;
    addressComponent: {
      country: string;
      province: string;
      city: string;
      citycode: string;
      district: string;
      adcode: string;
      township: string;
    };
  };
}

export interface AmapPoiResponse extends AmapBaseResponse {
  pois?: Array<{
    id: string;
    name: string;
    type: string;
    typecode: string;
    address: string;
    location: string; // "lng,lat"
    tel: string;
    distance: string;
    biz_ext?: {
      rating?: string;
      cost?: string;
    };
  }>;
  count?: string;
}

export interface AmapRouteResponse extends AmapBaseResponse {
  route?: {
    paths?: Array<{
      distance: string;
      duration: string;
      steps?: Array<{
        instruction: string;
        distance: string;
        duration: string;
        polyline: string;
      }>;
    }>;
  };
}

export interface AmapWeatherLiveResponse extends AmapBaseResponse {
  lives?: Array<{
    province: string;
    city: string;
    adcode: string;
    weather: string;
    temperature: string;
    winddirection: string;
    windpower: string;
    humidity: string;
    reporttime: string;
  }>;
}

export interface AmapWeatherForecastResponse extends AmapBaseResponse {
  forecasts?: Array<{
    city: string;
    adcode: string;
    province: string;
    reporttime: string;
    casts?: Array<{
      date: string;
      week: string;
      dayweather: string;
      nightweather: string;
      daytemp: string;
      nighttemp: string;
      daywind: string;
      nightwind: string;
      daypower: string;
      nightpower: string;
    }>;
  }>;
}

// ============================================================================
// Tool Input/Output Schemas
// ============================================================================

export const AmapGeocodeInputSchema = z.object({
  address: z.string(),
  city: z.string().optional(),
});

export const AmapReverseGeocodeInputSchema = z.object({
  location: z.string(), // "lng,lat"
});

export const AmapSearchPoiTextInputSchema = z.object({
  keywords: z.string(),
  city: z.string(),
  citylimit: z.boolean().default(true),
  offset: z.number().default(20),
  page: z.number().default(1),
});

export const AmapSearchPoiAroundInputSchema = z.object({
  location: z.string(), // "lng,lat"
  keywords: z.string(),
  radius: z.number().default(3000),
  offset: z.number().default(20),
});

export const AmapRouteInputSchema = z.object({
  origin: z.string(), // "lng,lat"
  destination: z.string(), // "lng,lat"
  city: z.string().optional(),
  strategy: z.number().default(0), // 0:速度优先, 1:费用优先, 2:距离优先
});

export const AmapWeatherLiveInputSchema = z.object({
  city: z.string(),
});

export const AmapWeatherForecastInputSchema = z.object({
  city: z.string(),
});

export type AmapGeocodeInput = z.infer<typeof AmapGeocodeInputSchema>;
export type AmapReverseGeocodeInput = z.infer<typeof AmapReverseGeocodeInputSchema>;
export type AmapSearchPoiTextInput = z.infer<typeof AmapSearchPoiTextInputSchema>;
export type AmapSearchPoiAroundInput = z.infer<typeof AmapSearchPoiAroundInputSchema>;
export type AmapRouteInput = z.infer<typeof AmapRouteInputSchema>;
export type AmapWeatherLiveInput = z.infer<typeof AmapWeatherLiveInputSchema>;
export type AmapWeatherForecastInput = z.infer<typeof AmapWeatherForecastInputSchema>;
