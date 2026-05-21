import type { UserIntent, PlanningProviders } from "./schemas";
import { env } from "../../config/env";

export interface PlanningContextInput {
  traceId: string;
  planId: string;
  intent: UserIntent;
  providers?: PlanningProviders;
}

export interface WeatherInfo {
  city: string;
  date: string;
  condition: string;
  rainProbability: number;
  temperature: string;
  suggestion: string;
}

export interface RouteInfo {
  id: string;
  name: string;
  duration: string;
  price: string;
  risk: string;
}

export interface UserProfileInfo {
  id: string;
  name: string;
  city: string;
  startPoint: string;
  family: string[];
  preferences: string[];
  budgetRange: [number, number];
  permissions: Record<string, boolean>;
}

export interface PlanningContext {
  traceId: string;
  planId: string;
  intent: UserIntent;
  providers?: PlanningProviders;
  userProfile: UserProfileInfo;
  environment: {
    weather: WeatherInfo;
    routes: RouteInfo[];
  };
  policies: {
    paymentAutoExecute: false;
    requireConfirmForReservation: true;
    requireConfirmForShare: true;
    maxAutoPayAmount: 0;
  };
}

const DEFAULT_WEATHER: WeatherInfo = {
  city: "",
  date: new Date().toISOString().slice(0, 10),
  condition: "未知",
  rainProbability: 0,
  temperature: "--",
  suggestion: "未能获取天气数据，请注意出行安全。",
};

const DEFAULT_PROFILE: UserProfileInfo = {
  id: "unknown",
  name: "用户",
  city: "",
  startPoint: "",
  family: [],
  preferences: [],
  budgetRange: [200, 500],
  permissions: {},
};

/**
 * 构造规划上下文，聚合用户画像、环境数据和安全策略。
 * 生产环境必须通过 providers 获取真实天气；开发环境允许 fallback。
 */
export async function buildPlanningContext(input: PlanningContextInput): Promise<PlanningContext> {
  const city = input.intent.city || "杭州";
  const isProd = env.NODE_ENV === "production";

  const weather = await fetchWeather(city, input.providers, isProd);

  return {
    traceId: input.traceId,
    planId: input.planId,
    intent: input.intent,
    providers: input.providers,
    userProfile: buildUserProfile(input.intent),
    environment: {
      weather,
      routes: [],
    },
    policies: {
      paymentAutoExecute: false,
      requireConfirmForReservation: true,
      requireConfirmForShare: true,
      maxAutoPayAmount: 0,
    },
  };
}

async function fetchWeather(
  city: string,
  providers: PlanningProviders | undefined,
  isProd: boolean,
): Promise<WeatherInfo> {
  if (!providers?.map) {
    if (isProd) {
      throw new Error("[contextBuilder] 生产环境必须提供 map provider 以获取天气数据");
    }
    return { ...DEFAULT_WEATHER, city };
  }

  try {
    const result = await providers.map.getWeather({ city, date: new Date().toISOString().slice(0, 10) });
    return {
      city,
      date: result.date,
      condition: result.condition,
      rainProbability: result.humidity ?? 0,
      temperature: `${result.tempMin}-${result.tempMax}℃`,
      suggestion: buildWeatherSuggestion(result.condition, result.tempMax, result.tempMin),
    };
  } catch (error) {
    if (isProd) {
      throw new Error(`[contextBuilder] 生产环境获取天气失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.warn(`[contextBuilder] 天气获取失败，使用默认值: ${error instanceof Error ? error.message : String(error)}`);
    return { ...DEFAULT_WEATHER, city };
  }
}

function buildWeatherSuggestion(condition: string, tempMax: number, tempMin: number): string {
  const parts: string[] = [];
  if (condition.includes("雨")) {
    parts.push("有降雨，建议优先室内活动或携带雨具");
  }
  if (tempMax > 35) {
    parts.push("高温天气，注意防暑");
  }
  if (tempMin < 5) {
    parts.push("气温较低，注意保暖");
  }
  if (parts.length === 0) {
    parts.push("天气适宜出行");
  }
  return parts.join("；") + "。";
}

function buildUserProfile(intent: UserIntent): UserProfileInfo {
  return {
    ...DEFAULT_PROFILE,
    city: intent.city || "杭州",
    startPoint: intent.origin.label,
    family: intent.participantMode === "family" ? ["家人"] : [],
    preferences: intent.preferences,
    budgetRange: intent.budgetMax ? [0, intent.budgetMax] : DEFAULT_PROFILE.budgetRange,
  };
}
