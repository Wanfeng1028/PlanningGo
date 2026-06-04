import { describe, it, expect } from 'vitest'
import { generateMockPlans } from './planner.js'
import type { PlannerInput } from './planner.js'
import type { UserIntent, CandidatePoi } from '../planning/schemas.js'
import type { PlanningContext } from '../planning/contextBuilder.js'
import type { CandidatePool } from '../planning/candidateGenerator.js'

const baseIntent: UserIntent = {
  raw: 'test',
  city: '上海',
  origin: { label: '家' },
  timeWindow: 'afternoon',
  durationHours: [4, 6],
  participantMode: 'family',
  partySize: 3,
  budgetMax: 500,
  distanceLimitMinutes: 40,
  preferences: [],
  routeStops: [],
  foodPreferences: [],
  mustAsk: [],
        isPlanningRequest: true,
}

const baseContext: PlanningContext = {
  traceId: 'trace-1',
  planId: 'plan-1',
  intent: baseIntent,
  userProfile: {
    id: 'user-1',
    name: 'Test',
    city: '上海',
    startPoint: '家',
    family: [],
    preferences: [],
    budgetRange: [200, 500],
    permissions: {},
  },
  environment: {
    weather: { city: '上海', date: '2026-05-31', condition: '晴', rainProbability: 0, temperature: '20-28', suggestion: '适宜出行' },
    routes: [],
  },
  policies: { paymentAutoExecute: false, requireConfirmForReservation: true, requireConfirmForShare: true, maxAutoPayAmount: 0 },
}

const mockCandidatePoi: CandidatePoi = {
  id: 'poi-1',
  source: 'mock',
  name: '世纪公园',
  category: 'activity',
  address: '上海',
  rating: 4.5,
  tags: ['亲子友好'],
  indoor: false,
  kidFriendly: true,
  dietFriendly: false,
  todayOpenStatus: 'open',
  bookingRequired: false,
  bookingAvailable: true,
  queueRisk: 'low',
  riskFlags: [],
}

const mockRestaurant: CandidatePoi = {
  id: 'poi-2',
  source: 'mock',
  name: '海底捞',
  category: 'restaurant',
  address: '上海',
  rating: 4.3,
  tags: ['餐饮'],
  indoor: true,
  kidFriendly: false,
  dietFriendly: true,
  todayOpenStatus: 'open',
  bookingRequired: true,
  bookingAvailable: true,
  queueRisk: 'medium',
  riskFlags: [],
}

const baseCandidates: CandidatePool = {
  activities: [mockCandidatePoi],
  restaurants: [mockRestaurant],
  movies: [],
  events: [],
  cafes: [],
  cinemas: [],
}

function makeInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    traceId: 'trace-1',
    planId: 'plan-1',
    intent: baseIntent,
    context: baseContext,
    candidates: baseCandidates,
    ...overrides,
  }
}

describe('generateMockPlans', () => {
  it('should generate plans for family mode', () => {
    const plans = generateMockPlans(makeInput())
    expect(plans.length).toBeGreaterThanOrEqual(2)
    expect(plans[0].timeline.length).toBeGreaterThanOrEqual(2)
  })

  it('should generate plans for friends mode', () => {
    const plans = generateMockPlans(makeInput({
      intent: { ...baseIntent, participantMode: 'friends' },
    }))
    expect(plans.length).toBeGreaterThanOrEqual(2)
    expect(plans[0].title).toContain('朋友')
  })

  it('should include indoor backup plan', () => {
    const plans = generateMockPlans(makeInput())
    const backup = plans.find((p) => p.title.includes('室内') || p.title.includes('兜底'))
    expect(backup).toBeDefined()
  })

  it('should use candidate POI names in timeline', () => {
    const plans = generateMockPlans(makeInput())
    const allPoiNames = plans.flatMap((p) => p.timeline.map((s) => s.poiName)).filter(Boolean)
    expect(allPoiNames.some((name) => name?.includes('世纪公园') || name?.includes('海底捞'))).toBe(true)
  })

  it('should have valid timeline structure', () => {
    const plans = generateMockPlans(makeInput())
    for (const plan of plans) {
      for (const step of plan.timeline) {
        expect(step.startTime).toMatch(/^\d{2}:\d{2}$/)
        expect(step.endTime).toMatch(/^\d{2}:\d{2}$/)
        expect(step.durationMinutes).toBeGreaterThan(0)
        expect(step.reasoning).toBeTruthy()
      }
    }
  })

  it('should set planId correctly', () => {
    const plans = generateMockPlans(makeInput())
    expect(plans[0].planId).toBe('plan-1')
  })

  it('generates a detailed route-first plan for the West Lake acceptance prompt', () => {
    const intent: UserIntent = {
      ...baseIntent,
      raw: '我明天下午两点要去西湖，从浙大紫金港出发，逛西湖喝咖啡去灵隐寺，然后去附近的海底捞，然后回浙大紫金港，就我一个人：小明。',
      city: '杭州',
      origin: { label: '浙大紫金港' },
      departAt: '明天下午2点',
      timeWindow: 'afternoon',
      participantMode: 'solo',
      partySize: 1,
      routeStops: ['西湖', '灵隐寺', '海底捞'],
      returnPoint: '浙大紫金港',
      foodPreferences: ['咖啡厅', '海底捞'],
      bookingIntent: 'needs_booking_check',
      orderingIntent: 'needs_order_draft',
      purchaseIntent: 'needs_ticket_check',
    }

    const plans = generateMockPlans(makeInput({ intent }))
    const primary = plans[0]
    const titles = primary.timeline.map((step) => step.title).join(' ')
    const poiNames = primary.timeline.map((step) => step.poiName).filter(Boolean)

    expect(primary.summary).toContain('西湖')
    expect(primary.timeline[0].startTime).toBe('14:00')
    expect(poiNames).toEqual(expect.arrayContaining(['西湖', '灵隐寺', '海底捞', '浙大紫金港']))
    expect(titles).toContain('返回浙大紫金港')
    expect(primary.timeline.some((step) => step.poiName === '灵隐寺' && step.bookingNeeded)).toBe(true)
    expect(primary.timeline.some((step) => step.poiName === '海底捞' && step.type === 'meal' && step.bookingNeeded)).toBe(true)
    expect(primary.timeline.some((step) => step.actionHints?.some((hint) => hint.includes('下单草稿') || hint.includes('确认支付')))).toBe(true)
    expect(primary.risks.join(' ')).toContain('平台')
    expect(plans.length).toBeGreaterThanOrEqual(2)
  })

  it('marks optional missing budget as an explicit assumption instead of blocking planning', () => {
    const plans = generateMockPlans(makeInput({
      intent: {
        ...baseIntent,
        budgetMax: undefined,
        preferences: ['咖啡厅'],
      },
    }))

    expect(plans[0].assumptions.join(' ')).toContain('未提供预算')
    expect(plans[0].assumptions.join(' ')).toContain('估算')
    expect(plans[0].timeline.length).toBeGreaterThan(0)
  })
})
