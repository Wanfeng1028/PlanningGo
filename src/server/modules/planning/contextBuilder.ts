import type { UserIntent, PlanningProviders } from "./schemas";
import { env } from "../../config/env";

export interface PlanningContextInput {
  traceId: string;
  planId: string;
  intent: UserIntent;
  providers?: PlanningProviders;
  userId?: string;
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
  /* Phase 5: extended profile fields */
  transportMode?: string;
  distanceLimitKm?: number;
  walkingTolerance?: string;
  queueTolerance?: string;
  dietPreference?: string[];
  avoidFoods?: string[];
  activityTags?: string[];
  avoidActivityTags?: string[];
  indoorPreference?: string;
  pace?: string;
  favoriteAreas?: string[];
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

  const [weather, dbProfile] = await Promise.all([
    fetchWeather(city, input.providers, isProd),
    input.userId ? loadProfileFromDb(input.userId) : Promise.resolve({}),
  ]);

  return {
    traceId: input.traceId,
    planId: input.planId,
    intent: input.intent,
    providers: input.providers,
    userProfile: buildUserProfile(input.intent, dbProfile),
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

function buildUserProfile(intent: UserIntent, dbProfile?: Partial<UserProfileInfo>): UserProfileInfo {
  return {
    ...DEFAULT_PROFILE,
    ...dbProfile,  // DB values as defaults
    city: intent.city || dbProfile?.city || "杭州",
    startPoint: intent.origin.label || dbProfile?.startPoint || "",
    family: intent.participantMode === "family" ? ["家人"] : (dbProfile?.family ?? []),
    preferences: intent.preferences.length > 0 ? intent.preferences : (dbProfile?.preferences ?? []),
    budgetRange: intent.budgetMax ? [0, intent.budgetMax] : (dbProfile?.budgetRange ?? DEFAULT_PROFILE.budgetRange),
    // Extended fields: prefer DB, fallback to undefined
    transportMode: dbProfile?.transportMode,
    distanceLimitKm: dbProfile?.distanceLimitKm,
    walkingTolerance: dbProfile?.walkingTolerance,
    queueTolerance: dbProfile?.queueTolerance,
    dietPreference: dbProfile?.dietPreference,
    avoidFoods: dbProfile?.avoidFoods,
    activityTags: dbProfile?.activityTags,
    avoidActivityTags: dbProfile?.avoidActivityTags,
    indoorPreference: dbProfile?.indoorPreference,
    pace: dbProfile?.pace,
    favoriteAreas: dbProfile?.favoriteAreas,
  };
}

/**
 * 从 DB 加载完整用户画像，与 intent 合并。
 * DB 字段作为默认值，intent 优先覆盖。
 */
async function loadProfileFromDb(userId: string): Promise<Partial<UserProfileInfo>> {
  try {
    const { getPrismaClient } = await import("../../common/prisma.js");
    const db = getPrismaClient();
    if (!db) return {};

    const profile = await db.userProfile.findFirst({
      where: { userId },
    });
    if (!profile) return {};

    // Read JSON fields directly from schema (no metadata column)
    const prefs = (profile.preferences ?? []) as string[];
    const dietPref = (profile.dietPreference ?? []) as string[];
    const avoidFoods = (profile.avoidFoods ?? []) as string[];
    const actTags = (profile.activityTags ?? []) as string[];
    const avoidActTags = (profile.avoidActivityTags ?? []) as string[];
    const favAreas = (profile.favoriteAreas ?? []) as string[];

    return {
      id: userId,
      name: "用户",
      city: profile.city ?? "",
      startPoint: profile.startPoint ?? "",
      preferences: prefs,
      budgetRange: profile.budgetMin && profile.budgetMax
        ? [profile.budgetMin, profile.budgetMax] as [number, number]
        : undefined,
      transportMode: profile.transportMode ?? undefined,
      distanceLimitKm: profile.distanceLimitKm ?? undefined,
      walkingTolerance: profile.walkingTolerance ?? undefined,
      queueTolerance: profile.queueTolerance ?? undefined,
      dietPreference: dietPref.length > 0 ? dietPref : undefined,
      avoidFoods: avoidFoods.length > 0 ? avoidFoods : undefined,
      activityTags: actTags.length > 0 ? actTags : undefined,
      avoidActivityTags: avoidActTags.length > 0 ? avoidActTags : undefined,
      indoorPreference: profile.indoorPreference ?? undefined,
      pace: profile.pace ?? undefined,
      favoriteAreas: favAreas.length > 0 ? favAreas : undefined,
    };
  } catch (err) {
    console.warn("[contextBuilder] Failed to load profile from DB:", err instanceof Error ? err.message : err);
    return {};
  }
}
