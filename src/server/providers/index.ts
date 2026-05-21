import type { MapProvider, LlmProvider, BookingProvider } from './types.js'
import { MockMapProvider } from './mockMapProvider.js'
import { MockLlmProvider } from './mockLlmProvider.js'
import { MockBookingProvider } from './mockBookingProvider.js'
import { AmapMapProvider } from './amapMapProvider.js'
import { QwenLlmProvider } from './qwenLlmProvider.js'
import { SafeBookingProvider } from './safeBookingProvider.js'
import { env } from '../config/env.js'

export interface ProviderContainer {
  map: MapProvider
  llm: LlmProvider
  booking: BookingProvider
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
  const apiKey = env.QWEN_API_KEY || env.OPENAI_API_KEY
  const baseUrl = env.QWEN_BASE_URL || env.OPENAI_BASE_URL
  const model = env.QWEN_FLASH_MODEL || env.LLM_MODEL

  if (apiKey && baseUrl) {
    return new QwenLlmProvider({
      apiKey,
      baseUrl,
      model,
      timeoutMs: env.LLM_TIMEOUT_MS,
    })
  }

  if (isProd && !allowMock) {
    throw new Error('[providers] 生产环境必须配置 QWEN_API_KEY 或 OPENAI_API_KEY，或显式设置 ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true')
  }

  if (isProd) {
    console.warn('[providers] ⚠️ LLM API key 未配置，生产环境使用 mock LLM provider')
  }

  return new MockLlmProvider()
}

function resolveBookingProvider(): BookingProvider {
  return new SafeBookingProvider()
}
