import { describe, it, expect } from 'vitest'
import {
  applyCityGuard,
  buildCityContext,
  extractChineseCityNames,
  validateOutputCitySafety,
  CityRequiredError,
} from './cityGuard.js'
import type { ToolCallPlan, ToolExecutionContext } from '../../tools/types.js'

describe('buildCityContext', () => {
  it('should prioritize manual city selection', () => {
    const ctx = buildCityContext({ manualCity: '上海', profileCity: '北京' })
    expect(ctx.city).toBe('上海')
    expect(ctx.source).toBe('manual')
    expect(ctx.confidence).toBe('high')
    expect(ctx.needsConfirmation).toBe(false)
  })

  it('should use browser geolocation as second priority', () => {
    const ctx = buildCityContext({ browserLat: 31.23, browserLng: 121.47 })
    expect(ctx.lat).toBe(31.23)
    expect(ctx.lng).toBe(121.47)
    expect(ctx.source).toBe('browser_geo')
    expect(ctx.needsConfirmation).toBe(true)
  })

  it('should use profile city as third priority', () => {
    const ctx = buildCityContext({ profileCity: '广州' })
    expect(ctx.city).toBe('广州')
    expect(ctx.source).toBe('profile')
    expect(ctx.confidence).toBe('medium')
  })

  it('should use conversation city as fourth priority', () => {
    const ctx = buildCityContext({ conversationCity: '深圳' })
    expect(ctx.city).toBe('深圳')
    expect(ctx.source).toBe('fallback')
  })

  it('should return null city when no source available', () => {
    const ctx = buildCityContext({})
    expect(ctx.city).toBeNull()
    expect(ctx.needsConfirmation).toBe(true)
    expect(ctx.confidence).toBe('low')
  })

  it('should use fallback city if provided', () => {
    const ctx = buildCityContext({ fallbackCity: '成都' })
    expect(ctx.city).toBe('成都')
  })
})

describe('applyCityGuard', () => {
  const baseCtx: ToolExecutionContext & { cityContext: ReturnType<typeof buildCityContext> } = {
    traceId: 'test',
    cityContext: buildCityContext({ manualCity: '上海' }),
  }

  it('should inject city and adcode into tool input', () => {
    const toolCall: ToolCallPlan = { tool: 'search_poi', input: { keyword: '咖啡' } }
    const result = applyCityGuard(toolCall, baseCtx)
    expect(result.input).toMatchObject({ keyword: '咖啡', city: '上海' })
  })

  it('should throw CityRequiredError when city is null', () => {
    const ctxNoCity = { ...baseCtx, cityContext: buildCityContext({}) }
    const toolCall: ToolCallPlan = { tool: 'search_poi', input: { keyword: '咖啡' } }
    expect(() => applyCityGuard(toolCall, ctxNoCity)).toThrow(CityRequiredError)
  })

  it('should pass through non-object input unchanged', () => {
    const toolCall: ToolCallPlan = { tool: 'test', input: 'string-input' }
    const result = applyCityGuard(toolCall, baseCtx)
    expect(result.input).toBe('string-input')
  })
})

describe('extractChineseCityNames', () => {
  it('should extract city names from text', () => {
    const text = '今天去北京和上海旅游，明天去杭州'
    const cities = extractChineseCityNames(text)
    expect(cities).toContain('北京')
    expect(cities).toContain('上海')
    expect(cities).toContain('杭州')
  })

  it('should return empty array when no cities found', () => {
    expect(extractChineseCityNames('今天天气真好')).toEqual([])
  })

  it('should handle empty string', () => {
    expect(extractChineseCityNames('')).toEqual([])
  })
})

describe('validateOutputCitySafety (cityGuard)', () => {
  it('should return true when only allowed city appears', () => {
    expect(validateOutputCitySafety('去上海迪士尼玩', '上海')).toBe(true)
  })

  it('should return false when other city appears', () => {
    expect(validateOutputCitySafety('去北京故宫玩', '上海')).toBe(false)
  })

  it('should return true when no city mentioned', () => {
    expect(validateOutputCitySafety('去公园散步', '上海')).toBe(true)
  })
})
