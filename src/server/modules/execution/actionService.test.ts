import { describe, it, expect } from 'vitest'
import { createActionsForPlans, createPlanningActions } from './actionService.js'
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

// ─── Mock data for createPlanningActions ────────────────────

const planningMockOption: ActivityPlan = {
  id: 'opt-1',
  planId: 'plan-1',
  title: '西湖咖啡火锅游',
  targetGroup: 'solo',
  score: 85,
  summary: '一天的轻松行程',
  totalDurationMinutes: 360,
  totalCostMin: 100,
  totalCostMax: 200,
  walkingKm: 2.5,
  assumptions: [],
  highlights: ['西湖风景'],
  risks: [],
  timeline: [
    {
      id: 'step-1',
      startTime: '09:00',
      endTime: '11:00',
      type: 'activity',
      title: '咖啡厅',
      poiId: 'poi-1',
      poiName: '西湖边咖啡厅',
      durationMinutes: 120,
      transport: 'walk',
      reasoning: '先坐坐',
      bookingNeeded: false,
      actionId: null,
    },
    {
      id: 'step-2',
      startTime: '12:00',
      endTime: '14:00',
      type: 'meal',
      title: '火锅午餐',
      poiId: 'poi-2',
      poiName: '西湖火锅店',
      durationMinutes: 120,
      transport: 'walk',
      reasoning: '满足火锅偏好',
      bookingNeeded: true,
      actionId: null,
    },
  ],
}

const planningMockIntent: UserIntent = {
  raw: '从杭师大仓前出发，一个人去西湖，咖啡厅坐坐，中午吃火锅，预算200',
  city: '杭州',
  origin: { label: '杭师大仓前' },
  participantMode: 'solo',
  partySize: 1,
  timeWindow: 'morning',
  preferences: ['咖啡厅', '火锅'],
  distanceLimitMinutes: 40,
  durationHours: [4, 6],
  isPlanningRequest: true,
  mustAsk: [],
}

describe('createPlanningActions', () => {
  it('generates map_search action', () => {
    const actions = createPlanningActions({
      planId: 'plan-1',
      conversationId: 'conv-1',
      options: [planningMockOption],
      intent: planningMockIntent,
    })
    const mapAction = actions.find((a) => a.type === 'map_search')
    expect(mapAction).toBeDefined()
    if (mapAction && mapAction.type === 'map_search') {
      expect(mapAction.provider).toBe('amap')
      expect(mapAction.query).toBe('杭州')
      expect(mapAction.label).toContain('高德')
    }
  })

  it('generates navigation action for first POI', () => {
    const actions = createPlanningActions({
      planId: 'plan-1',
      options: [planningMockOption],
      intent: planningMockIntent,
    })
    const navAction = actions.find((a) => a.type === 'navigation')
    expect(navAction).toBeDefined()
    if (navAction && navAction.type === 'navigation') {
      expect(navAction.destination).toBe('西湖边咖啡厅')
      expect(navAction.provider).toBe('amap')
    }
  })

  it('generates copy_text action', () => {
    const actions = createPlanningActions({
      planId: 'plan-1',
      options: [planningMockOption],
      intent: planningMockIntent,
    })
    const copyAction = actions.find((a) => a.type === 'copy_text')
    expect(copyAction).toBeDefined()
    if (copyAction && copyAction.type === 'copy_text') {
      expect(copyAction.text).toContain('西湖咖啡火锅游')
      expect(copyAction.label).toBe('复制完整行程')
    }
  })

  it('generates calendar action with time range', () => {
    const actions = createPlanningActions({
      planId: 'plan-1',
      options: [planningMockOption],
      intent: planningMockIntent,
    })
    const calAction = actions.find((a) => a.type === 'calendar')
    expect(calAction).toBeDefined()
    if (calAction && calAction.type === 'calendar') {
      expect(calAction.title).toBe('西湖咖啡火锅游')
      expect(calAction.startTime).toBe('09:00')
      expect(calAction.endTime).toBe('14:00')
    }
  })

  it('generates mobile_handoff when conversationId provided', () => {
    const actions = createPlanningActions({
      planId: 'plan-1',
      conversationId: 'conv-123',
      options: [planningMockOption],
      intent: planningMockIntent,
    })
    const handoffAction = actions.find((a) => a.type === 'mobile_handoff')
    expect(handoffAction).toBeDefined()
    if (handoffAction && handoffAction.type === 'mobile_handoff') {
      expect(handoffAction.conversationId).toBe('conv-123')
      expect(handoffAction.planId).toBe('plan-1')
    }
  })

  it('skips mobile_handoff when no conversationId', () => {
    const actions = createPlanningActions({
      planId: 'plan-1',
      options: [planningMockOption],
      intent: planningMockIntent,
    })
    const handoffAction = actions.find((a) => a.type === 'mobile_handoff')
    expect(handoffAction).toBeUndefined()
  })

  it('returns empty array when no options', () => {
    const actions = createPlanningActions({
      planId: 'plan-1',
      options: [],
      intent: planningMockIntent,
    })
    expect(actions).toEqual([])
  })
})
