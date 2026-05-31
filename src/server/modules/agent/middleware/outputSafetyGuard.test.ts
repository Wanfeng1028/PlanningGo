import { describe, it, expect } from 'vitest'
import { validateOutputCitySafety } from './outputSafetyGuard.js'

describe('validateOutputCitySafety', () => {
  it('should return safe when no cities in text', () => {
    const result = validateOutputCitySafety('去公园散步然后吃饭', '上海')
    expect(result.safe).toBe(true)
    expect(result.illegalCities).toBeUndefined()
  })

  it('should return safe when only allowed city in text', () => {
    const result = validateOutputCitySafety('去上海迪士尼乐园玩一天', '上海')
    expect(result.safe).toBe(true)
  })

  it('should return unsafe when other city found', () => {
    const result = validateOutputCitySafety('上午去北京故宫，下午去上海外滩', '上海')
    expect(result.safe).toBe(false)
    expect(result.illegalCities).toContain('北京')
  })

  it('should detect multiple illegal cities', () => {
    const result = validateOutputCitySafety('从杭州出发去南京和苏州', '上海')
    expect(result.safe).toBe(false)
    expect(result.illegalCities).toContain('杭州')
    expect(result.illegalCities).toContain('南京')
    expect(result.illegalCities).toContain('苏州')
  })

  it('should handle empty text', () => {
    const result = validateOutputCitySafety('', '上海')
    expect(result.safe).toBe(true)
  })

  it('should provide reason when unsafe', () => {
    const result = validateOutputCitySafety('去北京玩', '上海')
    expect(result.reason).toContain('非目标城市')
    expect(result.reason).toContain('北京')
  })
})
