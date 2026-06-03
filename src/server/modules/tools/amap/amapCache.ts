/**
 * Amap API 缓存、调用预算管理与降级策略。
 * POI 搜索和路线计算结果缓存 30 分钟，调用次数受预算管理。
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CallBudget {
  maxCalls: number;
  usedCalls: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const poiSearchCache = new Map<string, CacheEntry<unknown>>();
const routeCache = new Map<string, CacheEntry<unknown>>();

function buildCacheKey(parts: string[]): string {
  return parts.map((p) => encodeURIComponent(p.toLowerCase())).join("|");
}

function getFromCache<T>(cache: Map<string, CacheEntry<unknown>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(cache: Map<string, CacheEntry<unknown>>, key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * 创建 POI 搜索缓存包装器
 */
export function createPoiSearchCache() {
  return {
    get<T>(keyword: string, city: string, around?: string): T | null {
      const key = buildCacheKey(["poi", keyword, city, around ?? ""]);
      return getFromCache<T>(poiSearchCache, key);
    },
    set<T>(keyword: string, city: string, data: T, around?: string): void {
      const key = buildCacheKey(["poi", keyword, city, around ?? ""]);
      setCache(poiSearchCache, key, data);
    },
  };
}

/**
 * 创建路线计算缓存包装器
 */
export function createRouteCache() {
  return {
    get<T>(origin: string, destination: string, mode: string): T | null {
      const key = buildCacheKey(["route", origin, destination, mode]);
      return getFromCache<T>(routeCache, key);
    },
    set<T>(origin: string, destination: string, mode: string, data: T): void {
      const key = buildCacheKey(["route", origin, destination, mode]);
      setCache(routeCache, key, data);
    },
  };
}

/**
 * 调用预算管理：限制单次规划中的高德 API 调用次数
 */
export function createCallBudget(mode: "flash" | "pro"): CallBudget & {
  canCall: () => boolean;
  consume: () => void;
  remaining: () => number;
} {
  const maxCalls = mode === "flash" ? 12 : 30;
  const budget: CallBudget = { maxCalls, usedCalls: 0 };

  return {
    ...budget,
    canCall() {
      return budget.usedCalls < budget.maxCalls;
    },
    consume() {
      budget.usedCalls++;
    },
    remaining() {
      return Math.max(0, budget.maxCalls - budget.usedCalls);
    },
  };
}

/**
 * 降级标记：当高德不可用时，方案需要标注
 */
export interface DegradationInfo {
  degraded: boolean;
  reason?: string;
  hint?: string;
}

export function createDegradationInfo(reason?: string): DegradationInfo {
  if (!reason) return { degraded: false };
  return {
    degraded: true,
    reason,
    hint: "地图服务暂不可用，已切换为本地规划。POI 数据为参考，建议在高德确认。",
  };
}
