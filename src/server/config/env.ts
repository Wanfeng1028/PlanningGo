import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),

  // ── 数据库 ──
  DATABASE_URL: z.string().default("postgresql://planninggo:planninggo@localhost:5432/planninggo?schema=public"),
  REDIS_URL: z.string().default("redis://localhost:6379/0"),

  // ── JWT ──
  JWT_ACCESS_SECRET: z.string().min(1, "JWT secret is required").default("test-jwt-access-secret-for-dev-only"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT secret is required").default("test-jwt-refresh-secret-for-dev-only"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().int().default(10),

  // ── Agent / LLM ──
  PLANNING_MODE: z.enum(["mock", "llm", "hybrid"]).default("mock"),
  ENABLE_LLM_FALLBACK: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o"),
  LLM_FLASH_MODEL: z.string().optional(),
  LLM_PRO_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // ── Agent Chat / Runtime ──
  AGENT_CHAT_MODE: z.enum(["auto","llm","rule"]).default("auto"),
  LLM_PROVIDER_PRIORITY: z.string().default("auto"),
  LLM_PROVIDER_FALLBACK: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  LLM_EXPOSE_DIAGNOSTICS: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // ── DeepSeek（可选）──
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_FLASH_MODEL: z.string().optional(),
  DEEPSEEK_PRO_MODEL: z.string().optional(),

  // ── Moonshot（可选）──
  MOONSHOT_API_KEY: z.string().optional(),
  MOONSHOT_BASE_URL: z.string().url().default("https://api.moonshot.cn/v1"),
  MOONSHOT_FLASH_MODEL: z.string().optional(),
  MOONSHOT_PRO_MODEL: z.string().optional(),

  // ── Groq（可选）──
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
  GROQ_FLASH_MODEL: z.string().optional(),
  GROQ_PRO_MODEL: z.string().optional(),

  // ── Gemini（可选，OpenAI 兼容入口或 adapter）──
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com/v1beta/openai"),
  GEMINI_FLASH_MODEL: z.string().optional(),
  GEMINI_PRO_MODEL: z.string().optional(),

  // ── 豆包/Doubao（可选，Volcengine OpenAI 兼容）──
  DOUBAO_API_KEY: z.string().optional(),
  DOUBAO_BASE_URL: z.string().url().default("https://ark.cn-beijing.volces.com/api/v3"),
  DOUBAO_FLASH_MODEL: z.string().optional(),
  DOUBAO_PRO_MODEL: z.string().optional(),

  // ── MiMo（可选，小米大模型 OpenAI 兼容）──
  MIMO_API_KEY: z.string().optional(),
  MIMO_BASE_URL: z.string().url().default("https://api.mimo.ai/v1"),
  MIMO_FLASH_MODEL: z.string().optional(),
  MIMO_PRO_MODEL: z.string().optional(),
  MIMO_SUPPORTS_TOOL_CALLING: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // ── LongCat（可选，美团大模型 OpenAI 兼容）──
  LONGCAT_API_KEY: z.string().optional(),
  LONGCAT_BASE_URL: z.string().url().default("https://api.longcat.ai/openai/v1"),
  LONGCAT_FLASH_MODEL: z.string().optional(),
  LONGCAT_PRO_MODEL: z.string().optional(),

  // ── Claude（可选，Anthropic API，需要 adapter）──
  CLAUDE_API_KEY: z.string().optional(),
  CLAUDE_BASE_URL: z.string().url().default("https://api.anthropic.com"),
  CLAUDE_MODEL: z.string().optional(),

  // ── Grok（可选，xAI API，需要 adapter）──
  GROK_API_KEY: z.string().optional(),
  GROK_BASE_URL: z.string().url().default("https://api.x.ai"),
  GROK_MODEL: z.string().optional(),

  // ── 外部工具 ──
  AMAP_WEB_SERVICE_KEY: z.string().optional(),
  AMAP_BASE_URL: z.string().url().default("https://restapi.amap.com"),
  AMAP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  AMAP_MAX_CALLS_FLASH: z.coerce.number().int().positive().default(8),
  AMAP_MAX_CALLS_PRO: z.coerce.number().int().positive().default(16),
  OPEN_MAP_TILE_URL: z.string().default("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
  OPEN_MAP_NOMINATIM_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  OPEN_MAP_OVERPASS_URL: z.string().url().default("https://overpass-api.de/api/interpreter"),
  OPEN_MAP_ROUTE_URL: z.string().url().default("https://router.project-osrm.org"),
  OPEN_MAP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  OPEN_MAP_PUBLIC_DEMO_OK: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  QWEATHER_API_KEY: z.string().optional(),

  // ── 美团 OAuth（可选）──
  MEITUAN_APP_KEY: z.string().optional(),
  MEITUAN_APP_SECRET: z.string().optional(),
  MEITUAN_REDIRECT_URI: z.string().optional(),
  MEITUAN_AUTH_URL: z.string().optional(),
  MEITUAN_TOKEN_URL: z.string().optional(),
  MEITUAN_USERINFO_URL: z.string().optional(),

  // ── 执行引擎 ──
  AUTO_EXECUTION_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  AUTO_EXECUTION_MAX_ACTIONS: z.coerce.number().int().positive().default(6),
  AUTO_EXECUTION_ALLOW_PAYMENT: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  ACTION_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),

  // ── 移动端接续 ──
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),
  HANDOFF_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  HANDOFF_QR_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  // ── 可观测性 ──
  ENABLE_TOOL_LOGS: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  ENABLE_USER_EVENTS: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  ENABLE_CLIENT_ERRORS: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  // ── Qwen（可选）──
  QWEN_API_KEY: z.string().optional(),
  QWEN_BASE_URL: z.string().url().default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
  QWEN_FLASH_MODEL: z.string().optional(),
  QWEN_PRO_MODEL: z.string().optional(),
  QWEN_ENABLE_THINKING: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // ── 演示模式 ──
  DEMO_MODE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  MOCK_BOOKING_FAILURES: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .refine(
      (arr) => arr.every((v) => ["no_seat", "no_ticket", "time_conflict"].includes(v)),
      { message: "MOCK_BOOKING_FAILURES 只允许: no_seat, no_ticket, time_conflict" },
    ),
  MOCK_LATENCY_MS: z
    .string()
    .default("0")
    .transform((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 ? n : 0;
    }),

  // ── 生产环境安全开关 ──
  ENABLE_DEMO_AUTH: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  ENABLE_DEV_SANDBOX: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  ALLOW_MOCK_PROVIDER_IN_PRODUCTION: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  REQUIRE_DB_IN_PRODUCTION: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  REQUIRE_REDIS_IN_PRODUCTION: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  COOKIE_SECRET: z.string().optional(),
});

const insecureJwtSecrets = new Set([
  "dev-access-secret-change-me-in-production-32b",
  "dev-refresh-secret-change-me-in-production-32b",
  "change-me-access-secret",
  "change-me-refresh-secret",
  "dev-access-secret",
  "dev-refresh-secret",
]);

export function isStrongJwtSecret(secret: string): boolean {
  return secret.length >= 32 && !insecureJwtSecrets.has(secret);
}

export function validateProductionJwtSecrets(input: {
  NODE_ENV: "development" | "test" | "production";
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
}) {
  if (input.NODE_ENV !== "production") return;
  const weak: string[] = [];
  if (!isStrongJwtSecret(input.JWT_ACCESS_SECRET)) weak.push("JWT_ACCESS_SECRET");
  if (!isStrongJwtSecret(input.JWT_REFRESH_SECRET)) weak.push("JWT_REFRESH_SECRET");
  if (weak.length > 0) {
    throw new Error(
      `生产环境检测到弱 JWT 密钥：${weak.join(", ")}。请使用至少 32 位随机强密钥（例如：openssl rand -hex 32）。`,
    );
  }
}

const insecureDefaultDatabaseUrl = "postgresql://planninggo:planninggo@localhost:5432/planninggo?schema=public";

/** 检查是否有任何 LLM API Key 配置 */
function hasAnyLlmKeyLocal(input: typeof env): boolean {
  return Boolean(
    input.OPENAI_API_KEY ||
    input.QWEN_API_KEY ||
    input.DEEPSEEK_API_KEY ||
    input.MOONSHOT_API_KEY ||
    input.GROQ_API_KEY ||
    input.GEMINI_API_KEY ||
    input.DOUBAO_API_KEY ||
    input.MIMO_API_KEY ||
    input.LONGCAT_API_KEY ||
    input.CLAUDE_API_KEY ||
    input.GROK_API_KEY,
  );
}

export function validateProductionRuntime(input: typeof env) {
  if (input.NODE_ENV !== "production") return;

  if (input.PLANNING_MODE === "mock" && !input.ALLOW_MOCK_PROVIDER_IN_PRODUCTION) {
    throw new Error("生产环境禁止使用 PLANNING_MODE=mock（除非显式设置 ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true）");
  }

  if (!input.DATABASE_URL || input.DATABASE_URL === insecureDefaultDatabaseUrl) {
    throw new Error("生产环境必须配置真实 DATABASE_URL，不能使用默认本地数据库");
  }

  if (!input.REDIS_URL || input.REDIS_URL.includes("localhost") || input.REDIS_URL.includes("127.0.0.1")) {
    throw new Error("生产环境必须配置真实 REDIS_URL，不能使用默认本地 Redis");
  }

  if (!input.COOKIE_SECRET || input.COOKIE_SECRET.length < 32) {
    throw new Error("生产环境必须配置至少 32 位 COOKIE_SECRET");
  }

  if (input.ENABLE_DEMO_AUTH) {
    throw new Error("生产环境禁止开启 ENABLE_DEMO_AUTH");
  }

  if (input.AUTO_EXECUTION_ALLOW_PAYMENT) {
    throw new Error("第一版生产环境禁止开启 AUTO_EXECUTION_ALLOW_PAYMENT");
  }

  const usesPublicOpenMapDefaults =
    input.OPEN_MAP_NOMINATIM_URL === "https://nominatim.openstreetmap.org" ||
    input.OPEN_MAP_OVERPASS_URL === "https://overpass-api.de/api/interpreter" ||
    input.OPEN_MAP_ROUTE_URL === "https://router.project-osrm.org";
  if (usesPublicOpenMapDefaults && !input.OPEN_MAP_PUBLIC_DEMO_OK) {
    throw new Error(
      "生产环境必须配置自建或托管的 OPEN_MAP_NOMINATIM_URL / OPEN_MAP_OVERPASS_URL / OPEN_MAP_ROUTE_URL；如仅演示请显式设置 OPEN_MAP_PUBLIC_DEMO_OK=true",
    );
  }

  // ── LLM 模式下必须有可用的 LLM Key ──
  if (input.AGENT_CHAT_MODE === "llm" && !hasAnyLlmKeyLocal(input)) {
    throw new Error("AGENT_CHAT_MODE=llm 但未配置任何 LLM API Key，请设置至少一个 Provider 的 Key");
  }

  if (input.PLANNING_MODE === "llm" && !hasAnyLlmKeyLocal(input)) {
    throw new Error("PLANNING_MODE=llm 但未配置任何 LLM Provider，请设置至少一个 Provider 的 Key");
  }
}

export const env = envSchema.parse(process.env);
validateProductionJwtSecrets(env);
validateProductionRuntime(env);

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((item) => item.trim())
  .filter(Boolean);
