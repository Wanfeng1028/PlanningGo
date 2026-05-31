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
})
