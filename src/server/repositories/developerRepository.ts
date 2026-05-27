/**
 * Developer 仓库 — DeveloperApp + ApiKey + Webhook + RequestLog + Usage
 */

import crypto from "node:crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client.js";

export class DeveloperRepository {
  constructor(private db: PrismaClient) {}

  // ── Developer Apps ──

  async listApps(userId: string) {
    return this.db.developerApp.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findAppById(id: string, userId: string) {
    return this.db.developerApp.findFirst({ where: { id, userId } });
  }

  async createApp(userId: string, input: {
    name: string;
    description?: string;
    environment?: string;
    callbackDomain?: string;
  }) {
    return this.db.developerApp.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? "",
        environment: input.environment ?? "sandbox",
        callbackDomain: input.callbackDomain ?? "",
      },
    });
  }

  async updateApp(id: string, userId: string, input: {
    name?: string;
    description?: string;
    environment?: string;
    callbackDomain?: string;
    status?: string;
  }) {
    const existing = await this.db.developerApp.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return this.db.developerApp.update({ where: { id }, data: input });
  }

  async deleteApp(id: string, userId: string) {
    const existing = await this.db.developerApp.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await this.db.developerApp.delete({ where: { id } });
    return true;
  }

  // ── API Keys ──

  async listApiKeys(userId: string) {
    return this.db.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findApiKeyById(id: string, userId: string) {
    return this.db.apiKey.findFirst({ where: { id, userId } });
  }

  async createApiKey(userId: string, input: {
    name: string;
    appId?: string;
    scopes?: string[];
    environment?: string;
    expiresAt?: Date;
  }) {
    const rawKey = `pg_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const prefix = rawKey.slice(0, 10);

    const apiKey = await this.db.apiKey.create({
      data: {
        userId,
        appId: input.appId ?? null,
        name: input.name,
        keyHash,
        prefix,
        scopes: (input.scopes ?? ["plan:read"]) as unknown as Prisma.InputJsonValue,
        environment: input.environment ?? "sandbox",
        expiresAt: input.expiresAt ?? null,
      },
    });

    return { apiKey, rawKey, prefix };
  }

  async revokeApiKey(id: string, userId: string) {
    const key = await this.db.apiKey.findFirst({ where: { id, userId } });
    if (!key) return null;
    return this.db.apiKey.update({
      where: { id },
      data: { status: "revoked", revokedAt: new Date() },
    });
  }

  async revokeAllApiKeys(userId: string) {
    const result = await this.db.apiKey.updateMany({
      where: { userId, status: "active" },
      data: { status: "revoked", revokedAt: new Date() },
    });
    return result.count;
  }

  async findApiKeyByKeyHash(keyHash: string) {
    return this.db.apiKey.findFirst({
      where: { keyHash, status: "active" },
    });
  }

  async touchApiKey(id: string) {
    return this.db.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  // ── Webhooks ──

  async listWebhooks(userId: string) {
    return this.db.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findWebhookById(id: string, userId: string) {
    return this.db.webhook.findFirst({ where: { id, userId } });
  }

  async createWebhook(userId: string, input: {
    url: string;
    events: string[];
    appId?: string;
    secret?: string;
  }) {
    const secret = input.secret ?? crypto.randomBytes(24).toString("hex");
    const secretHash = crypto.createHash("sha256").update(secret).digest("hex");

    const webhook = await this.db.webhook.create({
      data: {
        userId,
        appId: input.appId ?? null,
        url: input.url,
        events: input.events as unknown as Prisma.InputJsonValue,
        secretHash,
      },
    });

    return { webhook, secret };
  }

  async updateWebhook(id: string, userId: string, input: {
    url?: string;
    events?: string[];
    enabled?: boolean;
    appId?: string;
  }) {
    const existing = await this.db.webhook.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.url !== undefined) data.url = input.url;
    if (input.events !== undefined) data.events = input.events;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.appId !== undefined) data.appId = input.appId;

    return this.db.webhook.update({ where: { id }, data });
  }

  async deleteWebhook(id: string, userId: string) {
    const existing = await this.db.webhook.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await this.db.webhook.delete({ where: { id } });
    return true;
  }

  async findActiveWebhooksByEvent(userId: string, event: string) {
    return this.db.webhook.findMany({
      where: {
        userId,
        enabled: true,
      },
    }).then((hooks) =>
      hooks.filter((h) => {
        const events = h.events as string[];
        return events.includes(event);
      }),
    );
  }

  async rotateWebhookSecret(id: string, userId: string) {
    const existing = await this.db.webhook.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const secret = crypto.randomBytes(24).toString("hex");
    const secretHash = crypto.createHash("sha256").update(secret).digest("hex");

    const webhook = await this.db.webhook.update({
      where: { id },
      data: { secretHash },
    });

    return { webhook, secret };
  }

  // ── Webhook Deliveries ──

  async recordDelivery(data: {
    webhookId: string;
    event: string;
    payload: Record<string, unknown>;
    status?: string;
    responseStatus?: number;
    latencyMs?: number;
    errorMessage?: string;
  }) {
    return this.db.webhookDelivery.create({
      data: {
        webhookId: data.webhookId,
        event: data.event,
        payload: data.payload as unknown as Prisma.InputJsonValue,
        status: data.status ?? "pending",
        responseStatus: data.responseStatus ?? null,
        latencyMs: data.latencyMs ?? null,
        errorMessage: data.errorMessage ?? null,
      },
    });
  }

  async updateDelivery(id: string, data: {
    status: string;
    responseStatus?: number;
    latencyMs?: number;
    errorMessage?: string;
    attemptCount?: number;
  }) {
    return this.db.webhookDelivery.update({
      where: { id },
      data,
    });
  }

  async getDeliveriesByWebhookId(webhookId: string, limit = 20) {
    return this.db.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async getAllDeliveries(userId: string, limit = 50) {
    return this.db.webhookDelivery.findMany({
      where: { webhook: { userId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { webhook: { select: { url: true } } },
    });
  }

  // ── Request Logs ──

  async createRequestLog(userId: string, data: {
    appId?: string;
    apiKeyPrefix?: string;
    method: string;
    path: string;
    statusCode: number;
    latencyMs: number;
    traceId: string;
    errorCode?: string;
    requestPreview?: Record<string, unknown>;
    responsePreview?: Record<string, unknown>;
  }) {
    return this.db.requestLog.create({
      data: {
        userId,
        appId: data.appId ?? null,
        apiKeyPrefix: data.apiKeyPrefix ?? "",
        method: data.method,
        path: data.path,
        statusCode: data.statusCode,
        latencyMs: data.latencyMs,
        traceId: data.traceId,
        errorCode: data.errorCode ?? null,
        requestPreview: (data.requestPreview ?? {}) as unknown as Prisma.InputJsonValue,
        responsePreview: (data.responsePreview ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async listRequestLogs(userId: string, params: {
    page?: number;
    pageSize?: number;
    status?: string;
    path?: string;
    traceId?: string;
  }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const where: Prisma.RequestLogWhereInput = { userId };

    if (params.status === "success") where.statusCode = { gte: 200, lt: 400 };
    if (params.status === "error") where.statusCode = { gte: 400 };
    if (params.path) where.path = { contains: params.path };
    if (params.traceId) where.traceId = params.traceId;

    const [items, total] = await Promise.all([
      this.db.requestLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.requestLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findRequestLogById(id: string, userId: string) {
    return this.db.requestLog.findFirst({ where: { id, userId } });
  }

  // ── Usage ──

  async getUsageSummary(userId: string, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayLogs, monthLogs, recentLogs, usageDaily] = await Promise.all([
      this.db.requestLog.count({ where: { userId, createdAt: { gte: today } } }),
      this.db.requestLog.count({ where: { userId, createdAt: { gte: monthStart } } }),
      this.db.requestLog.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { statusCode: true, latencyMs: true, path: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      this.db.developerUsageDaily.findMany({
        where: { userId, date: { gte: since } },
        orderBy: { date: "asc" },
      }),
    ]);

    const totalRequests = recentLogs.length;
    const errors = recentLogs.filter((l) => l.statusCode >= 400).length;
    const latencies = recentLogs.map((l) => l.latencyMs).sort((a, b) => a - b);
    const avgLatency = totalRequests > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / totalRequests) : 0;
    const p95Index = Math.floor(totalRequests * 0.95);
    const p95Latency = totalRequests > 0 ? (latencies[p95Index] ?? latencies[latencies.length - 1] ?? 0) : 0;
    const errorRate = totalRequests > 0 ? Math.round((errors / totalRequests) * 1000) / 10 : 0;
    const successRate = Math.round((100 - errorRate) * 10) / 10;

    // 接口分布
    const pathCounts: Record<string, number> = {};
    for (const log of recentLogs) {
      pathCounts[log.path] = (pathCounts[log.path] ?? 0) + 1;
    }
    const breakdown = Object.entries(pathCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);

    return {
      todayCalls: todayLogs,
      monthCalls: monthLogs,
      averageLatencyMs: avgLatency,
      p95LatencyMs: p95Latency,
      errorRate,
      successRate,
      breakdown,
      daily: usageDaily,
    };
  }

  // ── Dashboard Aggregation ──

  async getDashboardSummary(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayCalls, monthCalls, recentLogs, webhooks, apiKeys] = await Promise.all([
      this.db.requestLog.count({ where: { userId, createdAt: { gte: today } } }),
      this.db.requestLog.count({ where: { userId, createdAt: { gte: monthStart } } }),
      this.db.requestLog.findMany({
        where: { userId, createdAt: { gte: monthStart } },
        select: { statusCode: true, latencyMs: true },
      }),
      this.db.webhook.findMany({ where: { userId } }),
      this.db.apiKey.findMany({ where: { userId, status: "active" } }),
    ]);

    const totalRequests = recentLogs.length;
    const errors = recentLogs.filter((l) => l.statusCode >= 400).length;
    const latencies = recentLogs.map((l) => l.latencyMs).sort((a, b) => a - b);
    const avgLatency = totalRequests > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / totalRequests) : 0;
    const p95Index = Math.floor(totalRequests * 0.95);
    const p95Latency = totalRequests > 0 ? (latencies[p95Index] ?? 0) : 0;
    const errorRate = totalRequests > 0 ? Math.round((errors / totalRequests) * 1000) / 10 : 0;
    const successRate = Math.round((100 - errorRate) * 10) / 10;

    // Webhook 成功率
    const webhookIds = webhooks.map((w) => w.id);
    let webhookSuccessRate = 100;
    if (webhookIds.length > 0) {
      const deliveries = await this.db.webhookDelivery.findMany({
        where: { webhookId: { in: webhookIds }, createdAt: { gte: monthStart } },
        select: { status: true },
      });
      if (deliveries.length > 0) {
        const successDeliveries = deliveries.filter((d) => d.status === "success").length;
        webhookSuccessRate = Math.round((successDeliveries / deliveries.length) * 1000) / 10;
      }
    }

    // 最近成功和失败
    const [lastSuccess, lastError] = await Promise.all([
      this.db.requestLog.findFirst({
        where: { userId, statusCode: { gte: 200, lt: 400 } },
        orderBy: { createdAt: "desc" },
        select: { path: true, statusCode: true, latencyMs: true, createdAt: true },
      }),
      this.db.requestLog.findFirst({
        where: { userId, statusCode: { gte: 400 } },
        orderBy: { createdAt: "desc" },
        select: { path: true, statusCode: true, latencyMs: true, errorCode: true, createdAt: true },
      }),
    ]);

    return {
      summary: {
        todayCalls,
        monthCalls,
        remainingQuota: Math.max(0, 10000 - monthCalls),
        averageLatencyMs: avgLatency,
        p95LatencyMs: p95Latency,
        errorRate,
        successRate,
        webhookSuccessRate,
        activeKeys: apiKeys.length,
        activeWebhooks: webhooks.filter((w) => w.enabled).length,
        environment: "sandbox",
      },
      lastSuccess,
      lastError,
      metrics: [
        { label: "今日调用", value: String(todayCalls) },
        { label: "本月调用", value: String(monthCalls) },
        { label: "平均延迟", value: `${avgLatency}ms` },
        { label: "P95 延迟", value: `${p95Latency}ms` },
        { label: "成功率", value: `${successRate}%` },
        { label: "Webhook 成功率", value: `${webhookSuccessRate}%` },
      ],
      apiKeys,
      webhooks,
    };
  }
}
