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
  JWT_ACCESS_SECRET: z.string().default("dev-access-secret-change-me-in-production-32b"),
  JWT_REFRESH_SECRET: z.string().default("dev-refresh-secret-change-me-in-production-32b"),
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

  // ── 外部工具 ──
  AMAP_WEB_SERVICE_KEY: z.string().optional(),
  AMAP_BASE_URL: z.string().url().default("https://restapi.amap.com"),
  AMAP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  AMAP_MAX_CALLS_FLASH: z.coerce.number().int().positive().default(8),
  AMAP_MAX_CALLS_PRO: z.coerce.number().int().positive().default(16),
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

export function validateProductionRuntime(input: typeof env) {
  if (input.NODE_ENV !== "production") return;

  if (input.PLANNING_MODE === "mock" && !input.ALLOW_MOCK_PROVIDER_IN_PRODUCTION) {
    throw new Error("生产环境禁止使用 PLANNING_MODE=mock（除非显式设置 ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true）");
  }

  if (!input.DATABASE_URL || input.DATABASE_URL === insecureDefaultDatabaseUrl) {
    throw new Error("生产环境必须配置真实 DATABASE_URL，不能使用默认本地数据库");
  }

  if (!input.REDIS_URL || input.REDIS_URL.includes("localhost")) {
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
}

export const env = envSchema.parse(process.env);
validateProductionJwtSecrets(env);
validateProductionRuntime(env);

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((item) => item.trim())
  .filter(Boolean);
