import { describe, it, expect } from 'vitest'
import { extractIntent } from './intent.js'
import type { PlanningRequest } from '../../types.js'

describe('extractIntent', () => {
  const baseRequest: PlanningRequest = {
    prompt: '明天出去玩，预算300',
  }

  it('should extract city from request', async () => {
    const intent = await extractIntent({ ...baseRequest, city: '上海' })
    expect(intent.city).toBe('上海')
  })

  it('should default city when not provided', async () => {
    const intent = await extractIntent(baseRequest)
    expect(intent.city).toBeTruthy()
  })

  it('should extract budget from request', async () => {
    const intent = await extractIntent({ ...baseRequest, budget: 500 })
    expect(intent.budgetMax).toBe(500)
  })

  it('should detect family mode from prompt keywords', async () => {
    const intent = await extractIntent({ ...baseRequest, prompt: '带孩子去公园玩' })
    expect(intent.participantMode).toBe('family')
  })

  it('should detect friends mode from prompt keywords', async () => {
    const intent = await extractIntent({ ...baseRequest, prompt: '和朋友聚会' })
    expect(intent.participantMode).toBe('friends')
  })

  it('should detect couple mode from prompt keywords', async () => {
    const intent = await extractIntent({ ...baseRequest, prompt: '和女朋友约会' })
    expect(intent.participantMode).toBe('couple')
  })

  it('should detect solo mode from prompt keywords', async () => {
    const intent = await extractIntent({ ...baseRequest, prompt: '一个人出去逛逛' })
    expect(intent.participantMode).toBe('solo')
  })

  it('should extract companions from request', async () => {
    const intent = await extractIntent({ ...baseRequest, companions: 'family' })
    expect(intent.participantMode).toBe('family')
  })

  it('should extract start point', async () => {
    const intent = await extractIntent({ ...baseRequest, startPoint: '西湖文化广场' })
    expect(intent.origin.label).toBe('西湖文化广场')
  })

  it('should infer party size for family', async () => {
    const intent = await extractIntent({ ...baseRequest, prompt: '带孩子去公园' })
    expect(intent.partySize).toBeGreaterThanOrEqual(2)
  })

  it('should infer party size from prompt', async () => {
    const intent = await extractIntent({ ...baseRequest, prompt: '5人聚餐' })
    expect(intent.partySize).toBe(5)
  })

  it('should detect low-walk preference', async () => {
    const intent = await extractIntent({ ...baseRequest, prompt: '不要太累少走路' })
    expect(intent.preferences).toContain('低步行')
  })

  it('should detect indoor preference', async () => {
    const intent = await extractIntent({ ...baseRequest, prompt: '下雨天室内活动' })
    expect(intent.preferences).toContain('室内优先')
  })
})