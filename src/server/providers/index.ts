import type { MapProvider, LlmProvider, BookingProvider } from './types.js'
import { MockMapProvider } from './mockMapProvider.js'
import { MockLlmProvider } from './mockLlmProvider.js'
import { AmapMapProvider } from './amapMapProvider.js'
import { OpenAICompatibleLlmProvider } from './openAICompatibleLlmProvider.js'
import { SafeBookingProvider } from './safeBookingProvider.js'
import { env } from '../config/env.js'

export interface ProviderContainer {
  map: MapProvider
  llm: LlmProvider
  booking: BookingProvider
}

/** 单个 LLM Provider 候选配置 */
interface LlmCandidate {
  name: string
  apiKey: string | undefined
  baseUrl: string
  flashModel: string
  proModel: string
}

/** 构建所有 LLM Provider 候选列表 */
function buildLlmCandidates(): LlmCandidate[] {
  return [
    {
      name: "mimo",
      apiKey: env.MIMO_API_KEY,
      baseUrl: env.MIMO_BASE_URL,
      flashModel: env.MIMO_FLASH_MODEL ?? "mimo-v2.5-pro",
      proModel: env.MIMO_PRO_MODEL ?? "mimo-v2.5-pro",
    },
    {
      name: "qwen",
      apiKey: env.QWEN_API_KEY,
      baseUrl: env.QWEN_BASE_URL,
      flashModel: env.QWEN_FLASH_MODEL ?? "qwen-plus",
      proModel: env.QWEN_PRO_MODEL ?? "qwen-max",
    },
    {
      name: "openai",
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      flashModel: env.LLM_FLASH_MODEL ?? env.LLM_MODEL,
      proModel: env.LLM_PRO_MODEL ?? env.LLM_MODEL,
    },
    {
      name: "deepseek",
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL,
      flashModel: env.DEEPSEEK_FLASH_MODEL ?? "deepseek-chat",
      proModel: env.DEEPSEEK_PRO_MODEL ?? "deepseek-chat",
    },
    {
      name: "moonshot",
      apiKey: env.MOONSHOT_API_KEY,
      baseUrl: env.MOONSHOT_BASE_URL,
      flashModel: env.MOONSHOT_FLASH_MODEL ?? "moonshot-v1-8k",
      proModel: env.MOONSHOT_PRO_MODEL ?? "moonshot-v1-32k",
    },
    {
      name: "groq",
      apiKey: env.GROQ_API_KEY,
      baseUrl: env.GROQ_BASE_URL,
      flashModel: env.GROQ_FLASH_MODEL ?? "llama-3.3-70b-versatile",
      proModel: env.GROQ_PRO_MODEL ?? "llama-3.3-70b-versatile",
    },
    {
      name: "gemini",
      apiKey: env.GEMINI_API_KEY,
      baseUrl: env.GEMINI_BASE_URL,
      flashModel: env.GEMINI_FLASH_MODEL ?? "gemini-2.0-flash",
      proModel: env.GEMINI_PRO_MODEL ?? "gemini-2.5-pro-preview-05-06",
    },
    {
      name: "doubao",
      apiKey: env.DOUBAO_API_KEY,
      baseUrl: env.DOUBAO_BASE_URL,
      flashModel: env.DOUBAO_FLASH_MODEL ?? "doubao-1.5-pro-32k",
      proModel: env.DOUBAO_PRO_MODEL ?? "doubao-1.5-pro-256k",
    },
    {
      name: "longcat",
      apiKey: env.LONGCAT_API_KEY,
      baseUrl: env.LONGCAT_BASE_URL,
      flashModel: env.LONGCAT_FLASH_MODEL ?? "longcat-chat",
      proModel: env.LONGCAT_PRO_MODEL ?? "longcat-chat",
    },
  ]
}

/**
 * 按照 LLM_PROVIDER_PRIORITY 解析优先级排序的 Provider 列表。
 * 与 modelClient.ts 的 resolveProviders() 保持一致的优先级逻辑。
 */
function resolvePrimaryProvider(): LlmCandidate | null {
  const all = buildLlmCandidates()
  const withKeys = all.filter((p) => Boolean(p.apiKey))

  if (withKeys.length === 0) return null

  const priority = env.LLM_PROVIDER_PRIORITY.trim().toLowerCase()
  if (priority === "auto" || priority === "") {
    // auto 模式：按默认顺序（mimo 在前）
    return withKeys[0]
  }

  const names = priority.split(",").map((s) => s.trim()).filter(Boolean)
  for (const name of names) {
    const found = withKeys.find((p) => p.name === name)
    if (found) return found
  }

  // 优先级列表中没有匹配的，返回第一个有 key 的
  return withKeys[0]
}

export function createProviders(): ProviderContainer {
  const isProd = env.NODE_ENV === 'production'
  const allowMock = isProd ? env.ALLOW_MOCK_PROVIDER_IN_PRODUCTION : true

  const map = resolveMapProvider(isProd, allowMock)
  const llm = resolveLlmProvider(isProd, allowMock)
  const booking = resolveBookingProvider()

  return { map, llm, booking }
}

function resolveMapProvider(isProd: boolean, allowMock: boolean): MapProvider {
  if (env.AMAP_WEB_SERVICE_KEY) {
    return new AmapMapProvider({
      apiKey: env.AMAP_WEB_SERVICE_KEY,
      baseUrl: env.AMAP_BASE_URL,
      timeoutMs: env.AMAP_TIMEOUT_MS,
    })
  }

  if (isProd && !allowMock) {
    throw new Error('[providers] 生产环境必须配置 AMAP_WEB_SERVICE_KEY，或显式设置 ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true')
  }

  if (isProd) {
    console.warn('[providers] ⚠️ AMAP_WEB_SERVICE_KEY 未配置，生产环境使用 mock 地图 provider')
  }

  return new MockMapProvider()
}

function resolveLlmProvider(isProd: boolean, allowMock: boolean): LlmProvider {
  const candidate = resolvePrimaryProvider()

  if (candidate) {
    console.log(`[providers] ✅ LLM provider=${candidate.name} model=${candidate.flashModel}`)
    return new OpenAICompatibleLlmProvider({
      provider: candidate.name,
      apiKey: candidate.apiKey!,
      baseUrl: candidate.baseUrl,
      model: candidate.flashModel,
      timeoutMs: env.LLM_TIMEOUT_MS,
    })
  }

  if (isProd && !allowMock) {
    throw new Error(
      '[providers] 生产环境必须配置真实 LLM provider（MIMO_API_KEY / QWEN_API_KEY / OPENAI_API_KEY 等），' +
      '或显式设置 ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true',
    )
  }

  if (isProd) {
    console.warn('[providers] ⚠️ LLM API key 未配置，生产环境使用 mock LLM provider')
  }

  return new MockLlmProvider()
}

function resolveBookingProvider(): BookingProvider {
  return new SafeBookingProvider()
}
