/**
 * 每日全局预算追踪
 *
 * 使用 Redis 存储每日 LLM 和第三方 API 调用预算，
 * 超过预算后自动降级到 mock/rule 模式。
 *
 * OWASP API Security: Unrestricted Resource Consumption
 */

import type Redis from "ioredis";

// ============================================================================
// 预算类型
// ============================================================================

export type BudgetCategory = "llm" | "amap" | "weather" | "meituan";

export interface BudgetConfig {
  category: BudgetCategory;
  dailyLimit: number;
  /** 达到此比例时发送告警（0.8 = 80%） */
  alertThreshold?: number;
}

// ============================================================================
// 默认预算配置
// ============================================================================

export const DEFAULT_BUDGETS: Record<BudgetCategory, BudgetConfig> = {
  llm: { category: "llm", dailyLimit: 1000, alertThreshold: 0.8 },
  amap: { category: "amap", dailyLimit: 5000, alertThreshold: 0.8 },
  weather: { category: "weather", dailyLimit: 2000, alertThreshold: 0.8 },
  meituan: { category: "meituan", dailyLimit: 1000, alertThreshold: 0.8 },
};

// ============================================================================
// 预算追踪器
// ============================================================================

export class DailyBudgetTracker {
  constructor(
    private redis: Redis | null,
    private budgets: Record<BudgetCategory, BudgetConfig> = DEFAULT_BUDGETS,
  ) {}

  /**
   * 消费预算
   * @returns { allowed: false, reason: string } 如果超出预算
   * @returns { allowed: true, usage: number, limit: number } 如果允许
   */
  async consume(category: BudgetCategory, cost: number = 1): Promise<
    { allowed: false; reason: string } | { allowed: true; usage: number; limit: number; alert?: boolean }
  > {
    const config = this.budgets[category];
    if (!config) {
      // 未配置的类别不限制
      return { allowed: true, usage: 0, limit: Infinity };
    }

    if (!this.redis) {
      return { allowed: true, usage: 0, limit: config.dailyLimit };
    }

    const today = new Date().toISOString().slice(0, 10); // "2026-06-04"
    const key = `budget:${category}:${today}`;

    try {
      const current = await this.redis.incrby(key, cost);
      const limit = config.dailyLimit;
      const alertThreshold = config.alertThreshold ?? 0.8;

      // 设置 TTL 为第二天
      await this.redis.expire(key, 86400 * 2);

      if (current > limit) {
        return { allowed: false, reason: `${category} 每日预算已用完（${current}/${limit}）` };
      }

      const alert = current >= limit * alertThreshold && current <= limit;

      return {
        allowed: true,
        usage: current,
        limit,
        alert: alert ? true : undefined,
      };
    } catch {
      // Redis 出错时 fail-open
      return { allowed: true, usage: 0, limit: config.dailyLimit };
    }
  }

  /**
   * 检查是否超出预算（不消费）
   */
  async check(category: BudgetCategory): Promise<
    { exceeded: true; usage: number; limit: number } | { exceeded: false }
  > {
    const config = this.budgets[category];
    if (!config) return { exceeded: false };

    if (!this.redis) return { exceeded: false };

    const today = new Date().toISOString().slice(0, 10);
    const key = `budget:${category}:${today}`;

    try {
      const current = await this.redis.get(key);
      const usage = current ? parseInt(current, 10) : 0;
      if (usage >= config.dailyLimit) {
        return { exceeded: true, usage, limit: config.dailyLimit };
      }
      return { exceeded: false };
    } catch {
      return { exceeded: false };
    }
  }

  /**
   * 获取今日用量
   */
  async getUsage(category: BudgetCategory): Promise<number> {
    const config = this.budgets[category];
    if (!config) return 0;

    if (!this.redis) return 0;

    const today = new Date().toISOString().slice(0, 10);
    const key = `budget:${category}:${today}`;

    try {
      const current = await this.redis.get(key);
      return current ? parseInt(current, 10) : 0;
    } catch {
      return 0;
    }
  }
}

// 全局实例
let globalBudgetTracker: DailyBudgetTracker | null = null;

export function setBudgetTracker(tracker: DailyBudgetTracker): void {
  globalBudgetTracker = tracker;
}

export function getBudgetTracker(): DailyBudgetTracker | null {
  return globalBudgetTracker;
}
