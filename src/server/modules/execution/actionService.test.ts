import { describe, it, expect } from 'vitest'
import { createActionsForPlans } from './actionService.js'
import type { ActivityPlan, UserIntent } from '../planning/schemas.js'

const mockIntent: UserIntent = {
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

const mockPlan: ActivityPlan = {
  id: 'plan-1',
  planId: 'p-1',
  title: '测试方案',
  targetGroup: 'family',
  score: 85,
  summary: '测试方案说明',
  totalDurationMinutes: 240,
  totalCostMin: 200,
  totalCostMax: 400,
  walkingKm: 2.0,
  assumptions: [],
  highlights: [],
  risks: [],
  timeline: [
    {
      id: 'step-1',
      startTime: '14:00',
      endTime: '15:00',
      type: 'activity',
      title: '去公园',
      poiId: 'poi-1',
      poiName: '世纪公园',
      durationMinutes: 60,
      transport: 'walk',
      reasoning: '适合亲子',
      bookingNeeded: false, actionId: null,
    },
    {
      id: 'step-2',
      startTime: '15:30',
      endTime: '16:30',
      type: 'meal',
      title: '午餐',
      poiId: 'poi-2',
      poiName: '海底捞',
      durationMinutes: 60,
      transport: 'none',
      reasoning: '家庭聚餐',
      bookingNeeded: true, actionId: null,
    },
  ],
}

describe('createActionsForPlans', () => {
  it('should create actions for each plan option', () => {
    const actions = createActionsForPlans({
      planId: 'p-1',
      options: [mockPlan],
      intent: mockIntent,
      userId: 'user-1',
    })
    expect(actions.length).toBeGreaterThan(0)
  })

  it('should create booking action for bookingNeeded steps', () => {
    const actions = createActionsForPlans({
      planId: 'p-1',
      options: [mockPlan],
      intent: mockIntent,
      userId: 'user-1',
    })
    const bookingActions = actions.filter((a) => a.type === 'restaurant_reservation')
    expect(bookingActions).toHaveLength(1)
    expect(bookingActions[0].title).toContain('海底捞')
  })

  it('should create navigation action', () => {
    const actions = createActionsForPlans({
      planId: 'p-1',
      options: [mockPlan],
      intent: mockIntent,
      userId: 'user-1',
    })
    const navActions = actions.filter((a) => a.type === 'navigation')
    expect(navActions).toHaveLength(1)
  })

  it('should create calendar action', () => {
    const actions = createActionsForPlans({
      planId: 'p-1',
      options: [mockPlan],
      intent: mockIntent,
      userId: 'user-1',
    })
    const calActions = actions.filter((a) => a.type === 'calendar_event')
    expect(calActions).toHaveLength(1)
  })

  it('should create share action', () => {
    const actions = createActionsForPlans({
      planId: 'p-1',
      options: [mockPlan],
      intent: mockIntent,
      userId: 'user-1',
    })
    const shareActions = actions.filter((a) => a.type === 'share_message')
    expect(shareActions).toHaveLength(1)
    expect(shareActions[0].title).toContain('家人')
  })

  it('should generate unique idempotency keys', () => {
    const actions = createActionsForPlans({
      planId: 'p-1',
      options: [mockPlan],
      intent: mockIntent,
      userId: 'user-1',
    })
    const keys = actions.map((a) => a.idempotencyKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('should set confirmationRequired for booking actions', () => {
    const actions = createActionsForPlans({
      planId: 'p-1',
      options: [mockPlan],
      intent: mockIntent,
      userId: 'user-1',
    })
    const booking = actions.find((a) => a.type === 'restaurant_reservation')
    expect(booking?.confirmationRequired).toBe(true)
  })

  it('should use anonymous userId when not provided', () => {
    const actions = createActionsForPlans({
      planId: 'p-1',
      options: [mockPlan],
      intent: mockIntent,
    })
    expect(actions[0].userId).toBe('anonymous')
  })
})
