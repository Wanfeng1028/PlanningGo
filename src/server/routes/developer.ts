/**
 * Developer 路由 — 完整开发者控制台 API
 * Dashboard / Apps / API Keys / Usage / Request Logs / Webhooks / Sandbox / Security
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendOk, sendCreated, sendNoContent, sendError } from "../common/response.js";
import { UnauthorizedError } from "../common/errors.js";
import { DeveloperRepository } from "../repositories/developerRepository.js";

interface AuthenticatedRequest extends FastifyRequest {
  userId?: string;
  traceId?: string;
}

function uid(req: FastifyRequest): string {
  const id = (req as AuthenticatedRequest).userId;
  if (!id) throw new UnauthorizedError("未登录");
  return id;
}

/** 脱敏请求体：移除敏感字段 */
function toRecordOrEmpty(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function sanitizePreview(obj: unknown): Record<string, unknown> {
  const input = toRecordOrEmpty(obj);
  const sensitive = new Set(["password", "token", "authorization", "apiKey", "refreshToken", "accessToken", "secret", "keyHash"]);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (sensitive.has(k)) {
      result[k] = "***";
    } else {
      result[k] = v;
    }
  }
  return result;
}

export async function registerDeveloperRoutes(app: FastifyInstance) {
  if (!app.db) {
    app.log.warn("Developer routes disabled (no PostgreSQL)");
    return;
  }
  const db = app.db;
  const repo = new DeveloperRepository(db);

  // ── Dashboard ──
  app.get("/api/developer/dashboard", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const dashboard = await repo.getDashboardSummary(userId);
    return sendOk(reply, dashboard);
  });

  // ── Developer Apps ──
  app.get("/api/developer/apps", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const apps = await repo.listApps(userId);
    return sendOk(reply, apps);
  });

  app.post("/api/developer/apps", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const input = z.object({
      name: z.string().min(1).max(64),
      description: z.string().max(256).default(""),
      environment: z.enum(["sandbox", "production"]).default("sandbox"),
      callbackDomain: z.string().default(""),
    }).parse(request.body);

    const app = await repo.createApp(userId, input);
    return sendCreated(reply, app);
  });

  app.patch("/api/developer/apps/:id", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z.object({
      name: z.string().min(1).max(64).optional(),
      description: z.string().max(256).optional(),
      environment: z.enum(["sandbox", "production"]).optional(),
      callbackDomain: z.string().optional(),
      status: z.enum(["active", "paused"]).optional(),
    }).parse(request.body);

    const updated = await repo.updateApp(id, userId, input);
    if (!updated) return sendError(reply, 404, "APP_NOT_FOUND", "应用不存在");
    return sendOk(reply, updated);
  });

  app.delete("/api/developer/apps/:id", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const deleted = await repo.deleteApp(id, userId);
    if (!deleted) return sendError(reply, 404, "APP_NOT_FOUND", "应用不存在");
    return sendNoContent(reply);
  });

  // ── API Keys ──
  app.get("/api/developer/api-keys", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const keys = await repo.listApiKeys(userId);
    return sendOk(reply, keys.map(mapApiKey));
  });

  // 兼容旧路径
  app.get("/api/developer/apikeys", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const keys = await repo.listApiKeys(userId);
    return sendOk(reply, keys.map(mapApiKey));
  });

  app.post("/api/developer/api-keys", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const input = z.object({
      name: z.string().min(1).max(64),
      appId: z.string().optional(),
      scopes: z.array(z.string()).default(["plan:read"]),
      environment: z.enum(["sandbox", "production"]).default("sandbox"),
      expiresIn: z.enum(["30d", "90d", "never"]).default("90d"),
    }).parse(request.body);

    let expiresAt: Date | undefined;
    if (input.expiresIn === "30d") {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (input.expiresIn === "90d") {
      expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    }

    const { apiKey, rawKey } = await repo.createApiKey(userId, {
      name: input.name,
      appId: input.appId,
      scopes: input.scopes,
      environment: input.environment,
      expiresAt,
    });

    // 写审计日志
    await db.auditLog.create({
      data: {
        userId,
        action: "api_key.created",
        resourceType: "api_key",
        resourceId: apiKey.id,
        traceId: (request as AuthenticatedRequest).traceId ?? "",
      },
    });

    return sendCreated(reply, { ...mapApiKey(apiKey), key: rawKey });
  });

  // 兼容旧路径
  app.post("/api/developer/apikeys", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const input = z.object({
      name: z.string().default("Default Key"),
      scopes: z.array(z.string()).default(["plan:read"]),
    }).parse(request.body ?? {});

    const { apiKey, rawKey } = await repo.createApiKey(userId, {
      name: input.name,
      scopes: input.scopes,
    });

    return sendCreated(reply, { ...mapApiKey(apiKey), key: rawKey });
  });

  app.post("/api/developer/api-keys/:id/revoke", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const revoked = await repo.revokeApiKey(id, userId);
    if (!revoked) return sendError(reply, 404, "API_KEY_NOT_FOUND", "API Key 不存在");

    await db.auditLog.create({
      data: {
        userId,
        action: "api_key.revoked",
        resourceType: "api_key",
        resourceId: id,
        traceId: (request as AuthenticatedRequest).traceId ?? "",
      },
    });

    return sendOk(reply, mapApiKey(revoked));
  });

  // 兼容旧路径
  app.delete("/api/developer/apikeys/:id", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const revoked = await repo.revokeApiKey(id, userId);
    if (!revoked) return sendError(reply, 404, "API_KEY_NOT_FOUND", "API Key 不存在");
    return sendOk(reply, mapApiKey(revoked));
  });

  app.post("/api/developer/api-keys/revoke-all", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const count = await repo.revokeAllApiKeys(userId);

    await db.auditLog.create({
      data: {
        userId,
        action: "api_key.revoked_all",
        resourceType: "api_key",
        resourceId: "",
        metadata: { count },
        traceId: (request as AuthenticatedRequest).traceId ?? "",
      },
    });

    return sendOk(reply, { revokedCount: count });
  });

  // ── Usage ──
  app.get("/api/developer/usage", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const query = z.object({
      range: z.enum(["7d", "30d", "90d"]).default("7d"),
    }).parse(request.query);

    const days = query.range === "30d" ? 30 : query.range === "90d" ? 90 : 7;
    const usage = await repo.getUsageSummary(userId, days);
    return sendOk(reply, usage);
  });

  // ── Request Logs ──
  app.get("/api/developer/request-logs", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(["all", "success", "error"]).default("all"),
      path: z.string().optional(),
      traceId: z.string().optional(),
    }).parse(request.query);

    const result = await repo.listRequestLogs(userId, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status === "all" ? undefined : query.status,
      path: query.path,
      traceId: query.traceId,
    });

    return sendOk(reply, {
      ...result,
      items: result.items.map(mapRequestLog),
    });
  });

  app.get("/api/developer/request-logs/:id", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const log = await repo.findRequestLogById(id, userId);
    if (!log) return sendError(reply, 404, "LOG_NOT_FOUND", "请求记录不存在");

    return sendOk(reply, {
      ...mapRequestLog(log),
      requestPreview: sanitizePreview(log.requestPreview as Record<string, unknown>),
      responsePreview: sanitizePreview(log.responsePreview as Record<string, unknown>),
    });
  });

  // ── Webhooks ──
  app.get("/api/developer/webhooks", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const hooks = await repo.listWebhooks(userId);
    return sendOk(reply, hooks.map(mapWebhook));
  });

  app.post("/api/developer/webhooks", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const input = z.object({
      url: z.string().url(),
      events: z.array(z.string()).min(1),
      appId: z.string().optional(),
    }).parse(request.body);

    const { webhook, secret } = await repo.createWebhook(userId, input);

    await db.auditLog.create({
      data: {
        userId,
        action: "webhook.created",
        resourceType: "webhook",
        resourceId: webhook.id,
        traceId: (request as AuthenticatedRequest).traceId ?? "",
      },
    });

    return sendCreated(reply, { ...mapWebhook(webhook), secret });
  });

  app.patch("/api/developer/webhooks/:id", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z.object({
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      enabled: z.boolean().optional(),
      appId: z.string().optional(),
    }).parse(request.body);

    const updated = await repo.updateWebhook(id, userId, input);
    if (!updated) return sendError(reply, 404, "WEBHOOK_NOT_FOUND", "Webhook 不存在");
    return sendOk(reply, mapWebhook(updated));
  });

  app.delete("/api/developer/webhooks/:id", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const deleted = await repo.deleteWebhook(id, userId);
    if (!deleted) return sendError(reply, 404, "WEBHOOK_NOT_FOUND", "Webhook 不存在");
    return sendNoContent(reply);
  });

  app.post("/api/developer/webhooks/:id/test", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const webhook = await repo.findWebhookById(id, userId);
    if (!webhook) return sendError(reply, 404, "WEBHOOK_NOT_FOUND", "Webhook 不存在");

    const startTime = Date.now();
    const events = webhook.events as string[];
    const testEvent = events[0] ?? "plan.created";

    const delivery = await repo.recordDelivery({
      webhookId: id,
      event: testEvent,
      payload: {
        type: testEvent,
        data: { test: true, message: "这是一条测试投递" },
        timestamp: new Date().toISOString(),
      },
      status: "success",
      responseStatus: 200,
      latencyMs: Date.now() - startTime,
    });

    return sendOk(reply, delivery);
  });

  app.post("/api/developer/webhooks/:id/replay", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const webhook = await repo.findWebhookById(id, userId);
    if (!webhook) return sendError(reply, 404, "WEBHOOK_NOT_FOUND", "Webhook 不存在");

    const events = webhook.events as string[];
    const delivery = await repo.recordDelivery({
      webhookId: id,
      event: events[0] ?? "plan.created",
      payload: { replay: true, timestamp: new Date().toISOString() },
      status: "success",
      responseStatus: 200,
    });

    return sendOk(reply, delivery);
  });

  app.get("/api/developer/webhook-deliveries", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const query = z.object({
      webhookId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);

    if (query.webhookId) {
      const webhook = await repo.findWebhookById(query.webhookId, userId);
      if (!webhook) return sendError(reply, 404, "WEBHOOK_NOT_FOUND", "Webhook 不存在");
      const deliveries = await repo.getDeliveriesByWebhookId(query.webhookId, query.limit);
      return sendOk(reply, deliveries);
    }

    const deliveries = await repo.getAllDeliveries(userId, query.limit);
    return sendOk(reply, deliveries);
  });

  app.post("/api/developer/webhooks/:id/rotate-secret", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const result = await repo.rotateWebhookSecret(id, userId);
    if (!result) return sendError(reply, 404, "WEBHOOK_NOT_FOUND", "Webhook 不存在");

    return sendOk(reply, { ...mapWebhook(result.webhook), secret: result.secret });
  });

  // ── Sandbox ──
  app.post("/api/developer/sandbox/run", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const input = z.object({
      endpoint: z.string(),
      method: z.enum(["GET", "POST"]).default("POST"),
      body: z.record(z.string(), z.unknown()).optional(),
    }).parse(request.body);

    const startTime = Date.now();
    const traceId = (request as AuthenticatedRequest).traceId ?? `sbx_${Date.now()}`;

    try {
      // 转发到实际业务接口
      const response = await app.inject({
        method: input.method,
        url: input.endpoint,
        payload: input.body ?? {},
        headers: {
          authorization: request.headers.authorization ?? "",
          "content-type": "application/json",
        },
      });

      const latencyMs = Date.now() - startTime;
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(response.payload);
      } catch {
        responseBody = response.payload;
      }

      // 记录请求日志
      await repo.createRequestLog(userId, {
        method: input.method,
        path: input.endpoint,
        statusCode: response.statusCode,
        latencyMs,
        traceId,
        requestPreview: sanitizePreview(input.body),
        responsePreview: { statusCode: response.statusCode, body: responseBody },
      });

      return sendOk(reply, {
        traceId,
        statusCode: response.statusCode,
        latencyMs,
        body: responseBody,
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "请求失败";

      await repo.createRequestLog(userId, {
        method: input.method,
        path: input.endpoint,
        statusCode: 500,
        latencyMs,
        traceId,
        errorCode: "SANDBOX_ERROR",
        requestPreview: sanitizePreview(input.body),
        responsePreview: { error: errorMessage },
      });

      return sendOk(reply, {
        traceId,
        statusCode: 500,
        latencyMs,
        body: { error: errorMessage },
      });
    }
  });

  // ── Security ──
  app.get("/api/developer/security", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);

    const [apiKeys, webhooks, recentAudits] = await Promise.all([
      repo.listApiKeys(userId),
      repo.listWebhooks(userId),
      db.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { action: true, resourceType: true, createdAt: true, traceId: true },
      }),
    ]);

    return sendOk(reply, {
      activeKeys: apiKeys.filter((k) => k.status === "active").length,
      totalKeys: apiKeys.length,
      activeWebhooks: webhooks.filter((w) => w.enabled).length,
      totalWebhooks: webhooks.length,
      recentAudits,
      ipAllowlist: null,
      ipAllowlistEnabled: false,
    });
  });
}

// ── Helpers ──

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: unknown;
  status: string;
  environment?: string | null;
  appId?: string | null;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
}

interface WebhookRecord {
  id: string;
  url: string;
  events?: unknown;
  event?: string;
  enabled: boolean;
  appId?: string | null;
  secretHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RequestLogRecord {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  traceId?: string | null;
  errorCode?: string | null;
  apiKeyPrefix?: string | null;
  appId?: string | null;
  createdAt: Date;
}

function mapApiKey(key: ApiKeyRecord) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: toStringArray(key.scopes),
    status: key.status,
    environment: key.environment ?? "sandbox",
    appId: nullToUndefined(key.appId),
    expiresAt: nullToUndefined(key.expiresAt),
    lastUsedAt: nullToUndefined(key.lastUsedAt),
    createdAt: key.createdAt,
  };
}

function mapWebhook(hook: WebhookRecord) {
  const events = toStringArray(hook.events);
  return {
    id: hook.id,
    url: hook.url,
    events: events.length > 0 ? events : hook.event ? [hook.event] : [],
    enabled: hook.enabled,
    appId: nullToUndefined(hook.appId),
    secret: hook.secretHash ? "••••••••" : undefined,
    createdAt: hook.createdAt,
    updatedAt: hook.updatedAt,
  };
}

function mapRequestLog(log: RequestLogRecord) {
  return {
    id: log.id,
    method: log.method,
    path: log.path,
    statusCode: log.statusCode,
    latencyMs: log.latencyMs,
    traceId: log.traceId,
    errorCode: nullToUndefined(log.errorCode),
    apiKeyPrefix: log.apiKeyPrefix,
    appId: nullToUndefined(log.appId),
    createdAt: log.createdAt,
  };
}
