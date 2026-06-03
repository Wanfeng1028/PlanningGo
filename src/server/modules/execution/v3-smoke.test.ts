/**
 * V3 Execution System Smoke Test
 *
 * 验证 V3 执行系统核心闭环：
 * 1. Provider 断言 — 每个 action 类型对应正确的 provider
 * 2. Calendar payload 包含完整 timeline
 * 3. normalizeActionStatus 正确处理旧状态 → V3 状态映射
 * 4. V3 状态机验证 — 交易类动作初始状态是 waiting_user_confirm
 * 5. 端到端流程验证（不含 DB）
 */

import { describe, it, expect } from 'vitest';
import { createActionsForPlans } from './actionService.js';
import { normalizeActionStatus } from './statusNormalizer.js';
import { isValidTransition, isTerminalState } from './stateMachine.js';
import type { ActivityPlan, UserIntent } from '../planning/schemas.js';

const mockIntent: UserIntent = {
  raw: 'test',
  city: '北京',
  origin: { label: '家' },
  timeWindow: 'unknown',
  durationHours: [4, 6],
  participantMode: 'family',
  partySize: 2,
  budgetMax: 500,
  distanceLimitMinutes: 40,
  preferences: [],
  mustAsk: [],
  isPlanningRequest: true,
};

const mockPlan: ActivityPlan = {
  id: 'plan-1',
  planId: 'p-1',
  title: 'V3 Smoke Test Plan',
  targetGroup: 'family',
  score: 85,
  summary: '测试方案',
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
      startTime: '12:00',
      endTime: '13:00',
      type: 'meal',
      title: '午餐',
      poiId: 'poi-restaurant',
      poiName: '测试餐厅',
      durationMinutes: 60,
      transport: 'walk',
      reasoning: '测试',
      bookingNeeded: true,
      actionId: null,
    },
    {
      id: 'step-2',
      startTime: '14:00',
      endTime: '15:00',
      type: 'activity',
      title: '公园散步',
      poiId: 'poi-park',
      poiName: '世纪公园',
      durationMinutes: 60,
      transport: 'walk',
      reasoning: '适合亲子',
      bookingNeeded: false,
      actionId: null as string | null,
    },
  ],
  backupPlan: null as unknown as string | undefined,
  validationStatus: 'pending',
  validationReport: null as unknown as string | undefined,
};

describe('V3 Execution System Smoke Test', () => {
  // ─── Task 1 + 6: Provider 断言 + Calendar timeline ───────────────────
  describe('1. Provider 断言 — 每个 action 类型对应正确的 provider', () => {
    it('restaurant_reservation 应该有 provider="meituan"', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const reservationAction = actions.find((a) =>
        a.type === 'restaurant_reservation'
      );
      expect(reservationAction).toBeDefined();
      expect(reservationAction!.provider).toBe('meituan');
      // 不应该有 _provider 在 payload 里
      expect((reservationAction!.payload as Record<string, unknown>)._provider).toBeUndefined();
    });

    it('navigation 应该有 provider="amap"', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const navAction = actions.find((a) => a.type === 'navigation');
      expect(navAction).toBeDefined();
      expect(navAction!.provider).toBe('amap');
    });

    it('calendar_event 应该有 provider="calendar"', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const calendarAction = actions.find((a) =>
        a.type === 'calendar_event'
      );
      expect(calendarAction).toBeDefined();
      expect(calendarAction!.provider).toBe('calendar');
    });

    it('share_message 应该有 provider="mock"', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const shareAction = actions.find((a) => a.type === 'share_message');
      expect(shareAction).toBeDefined();
      expect(shareAction!.provider).toBe('mock');
    });

    it('所有 action 的 provider 都应该是有效值', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const validProviders = new Set(['meituan', 'amap', 'calendar', 'mock']);

      for (const action of actions) {
        expect(validProviders.has(action.provider)).toBe(true);
      }
    });
  });

  // ─── Task 6: Calendar payload 包含完整 timeline ──────────────────────
  describe('2. Calendar action payload 包含完整 timeline', () => {
    it('calendar_event 的 payload 应该包含 timeline 数组', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const calendarAction = actions.find((a) =>
        a.type === 'calendar_event'
      );
      expect(calendarAction).toBeDefined();
      const payload = calendarAction!.payload as Record<string, unknown>;
      expect(payload.timeline).toBeDefined();
      expect(Array.isArray(payload.timeline)).toBe(true);
      expect((payload.timeline as unknown[]).length).toBe(mockPlan.timeline.length);

      // 验证 timeline 每个 step 的字段
      const timeline = payload.timeline as Array<Record<string, unknown>>;
      for (const step of timeline) {
        expect(step.id).toBeDefined();
        expect(step.title).toBeDefined();
        expect(step.startTime).toBeDefined();
        expect(step.endTime).toBeDefined();
      }
    });

    it('calendar_event 不应该有 fake calendarEventId', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const calendarAction = actions.find((a) =>
        a.type === 'calendar_event'
      );
      const payload = calendarAction!.payload as Record<string, unknown>;
      expect(payload.calendarEventId).toBeUndefined();
    });
  });

  // ─── Task 3: normalizeActionStatus 完整映射 ──────────────────────────
  describe('3. normalizeActionStatus 完整映射', () => {
    it('应该将旧 ExecutionAction 状态映射到 V3 状态', () => {
      // 旧小写状态
      expect(normalizeActionStatus('draft')).toBe('proposed');
      expect(normalizeActionStatus('waiting_confirm')).toBe('waiting_user_confirm');
      expect(normalizeActionStatus('success')).toBe('succeeded');
      // 旧大写状态
      expect(normalizeActionStatus('DRAFT')).toBe('proposed');
      expect(normalizeActionStatus('PENDING')).toBe('proposed');
      expect(normalizeActionStatus('CONFIRMED')).toBe('prepared');
      expect(normalizeActionStatus('EXECUTED')).toBe('succeeded');
      // V3 状态直接透传
      expect(normalizeActionStatus('proposed')).toBe('proposed');
      expect(normalizeActionStatus('waiting_user_confirm')).toBe('waiting_user_confirm');
      expect(normalizeActionStatus('redirect_required')).toBe('redirect_required');
      expect(normalizeActionStatus('succeeded')).toBe('succeeded');
    });

    it('未知状态应该降级为 proposed', () => {
      expect(normalizeActionStatus('unknown_state')).toBe('proposed');
      expect(normalizeActionStatus('')).toBe('proposed');
      expect(normalizeActionStatus(undefined)).toBe('proposed');
    });
  });

  // ─── Task 5: 状态机验证 ─────────────────────────────────────────────
  describe('4. V3 状态机验证', () => {
    it('交易类动作的初始状态应该是 waiting_user_confirm', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const reservationAction = actions.find((a) =>
        a.type === 'restaurant_reservation'
      );
      expect(reservationAction!.status).toBe('waiting_user_confirm');

      const shareAction = actions.find((a) => a.type === 'share_message');
      expect(shareAction!.status).toBe('waiting_user_confirm');
    });

    it('navigation 动作的初始状态应该是 proposed', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      const navAction = actions.find((a) => a.type === 'navigation');
      expect(navAction!.status).toBe('proposed');
    });

    it('waiting_user_confirm 可以转换到 redirect_required', () => {
      expect(isValidTransition('waiting_user_confirm', 'redirect_required')).toBe(true);
    });

    it('proposed 不能直接 confirm（需要先到 waiting_user_confirm）', () => {
      // proposed → redirect_required 是非法转换
      expect(isValidTransition('proposed', 'redirect_required')).toBe(false);
      // proposed 只能到 quoted/prepared/cancelled/expired
      expect(isValidTransition('proposed', 'quoted')).toBe(true);
    });

    it('terminal 状态不能转换', () => {
      expect(isTerminalState('succeeded')).toBe(true);
      expect(isTerminalState('cancelled')).toBe(true);
      expect(isTerminalState('expired')).toBe(true);
      expect(isTerminalState('waiting_user_confirm')).toBe(false);
    });
  });

  // ─── 综合：生成方案 → 保存 → 查 Action → quote → confirm 流程 ──────
  describe('5. 端到端流程验证（不含 DB）', () => {
    it('生成方案 → 所有 action 有正确 provider + V3 状态', () => {
      const actions = createActionsForPlans({
        planId: 'p-1',
        options: [mockPlan],
        intent: mockIntent,
        userId: 'user-test',
      });

      // 验证每个 action
      for (const action of actions) {
        // provider 有效
        const validProviders = new Set(['meituan', 'amap', 'calendar', 'mock']);
        expect(validProviders.has(action.provider)).toBe(true);

        // status 是 V3 状态（不是旧状态）
        expect(['draft', 'waiting_confirm', 'success']).not.toContain(action.status);

        // 交易类动作需要确认
        if (action.type === 'restaurant_reservation') {
          expect(action.confirmationRequired).toBe(true);
          expect(action.status).toBe('waiting_user_confirm');
        }
      }

      // 验证 action 数量：reservation + navigation + calendar + share = 4
      expect(actions.length).toBe(4);
    });
  });
});
