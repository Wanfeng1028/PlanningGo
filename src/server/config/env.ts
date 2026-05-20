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
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((item) => item.trim())
  .filter(Boolean);
