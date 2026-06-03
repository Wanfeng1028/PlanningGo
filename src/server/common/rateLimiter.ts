/**
 * Redis 限流器
 *
 * 基于 Redis INCR + EXPIRE 实现分布式限流，支持多实例部署。
 * 替代 @fastify/rate-limit 的内存 store，确保跨进程一致性。
 *
 * OWASP API Security: Unrestricted Resource Consumption
 */

import type Redis from "ioredis";

// ============================================================================
// 限流规则定义
// ============================================================================

export interface RateLimitRule {
  /** 窗口秒数 */
  windowSeconds: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
}

// ============================================================================
// 限流器实例
// ============================================================================

export class RedisRateLimiter {
  constructor(private redis: Redis | null) {}

  /**
   * 检查请求是否被限流
   * @returns { allowed: false, retryAfter: number } 如果被限流
   * @returns { allowed: true } 如果允许
   */
  async check(key: string, rule: RateLimitRule): Promise<
    { allowed: false; retryAfter: number } | { allowed: true }
  > {
    if (!this.redis) {
      // Redis 不可用时，返回允许（fail-open，避免服务不可用）
      return { allowed: true };
    }

    const now = Math.floor(Date.now() / 1000);
    const windowKey = `rl:${key}:${now - (now % rule.windowSeconds)}`;

    try {
      const current = await this.redis.incr(windowKey);
      if (current === 1) {
        // 第一次请求，设置 TTL
        await this.redis.expire(windowKey, rule.windowSeconds + 1);
      }
      if (current > rule.maxRequests) {
        const ttl = await this.redis.ttl(windowKey);
        return { allowed: false, retryAfter: Math.max(1, ttl) };
      }
      return { allowed: true };
    } catch {
      // Redis 出错时 fail-open
      return { allowed: true };
    }
  }

  /**
   * 重置指定 key 的限流计数
   */
  async reset(key: string): Promise<void> {
    if (!this.redis) return;
    const pattern = `rl:${key}:*`;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      // ignore
    }
  }
}

// 全局实例（由 app 启动时注入）
let globalLimiter: RedisRateLimiter | null = null;

export function setRateLimiter(limiter: RedisRateLimiter): void {
  globalLimiter = limiter;
}

export function getRateLimiter(): RedisRateLimiter | null {
  return globalLimiter;
}

// ============================================================================
// 预定义限流规则
// ============================================================================

/** 游客注册/登录 */
export const GUEST_LOGIN_RULE: RateLimitRule = {
  windowSeconds: 600, // 10 分钟
  maxRequests: 5,
};

/** 游客规划接口 */
export const GUEST_PLAN_RULE: RateLimitRule = {
  windowSeconds: 3600, // 1 小时
  maxRequests: 10,
};

/** 游客聊天接口 */
export const GUEST_CHAT_RULE: RateLimitRule = {
  windowSeconds: 3600, // 1 小时
  maxRequests: 10,
};

/** 登录用户 flash 模式 */
export const FLASH_USER_RULE: RateLimitRule = {
  windowSeconds: 3600, // 1 小时
  maxRequests: 30,
};

/** 登录用户 pro 模式 */
export const PRO_USER_RULE: RateLimitRule = {
  windowSeconds: 3600, // 1 小时
  maxRequests: 10,
};

/** 分享投票 */
export const VOTE_RULE: RateLimitRule = {
  windowSeconds: 60, // 1 分钟
  maxRequests: 5,
};

/** Handoff code claim */
export const HANDOFF_CLAIM_RULE: RateLimitRule = {
  windowSeconds: 60, // 1 分钟
  maxRequests: 5,
};

/** 事件提交 */
export const EVENT_SUBMIT_RULE: RateLimitRule = {
  windowSeconds: 60, // 1 分钟
  maxRequests: 30,
};
