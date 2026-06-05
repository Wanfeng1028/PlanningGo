import { z } from "zod";
import type { MapProvider, LlmProvider, BookingProvider } from "../../providers/types.js";

// ============================================================================
// PlanningProviders - 规划链路依赖注入
// ============================================================================

export interface PlanningProviders {
  map: MapProvider;
  llm: LlmProvider;
  booking: BookingProvider;
}

// ============================================================================
// UserIntent - 用户需求意图
// ============================================================================

export const participantModeSchema = z.enum(["family", "friends", "couple", "solo", "unknown"]);

export const userIntentSchema = z.object({
  raw: z.string(),
  city: z.string().default("杭州"),
  origin: z.object({
    label: z.string(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  date: z.string().optional(),
  departAt: z.string().optional(),
  timeWindow: z.enum(["morning", "afternoon", "evening", "full_day", "unknown"]).default("afternoon"),
  durationHours: z.tuple([z.number(), z.number()]).default([4, 6]),
  participantMode: participantModeSchema.default("unknown"),
  partySize: z.number().int().positive().default(3),
  budgetMax: z.number().positive().optional(),
  distanceLimitMinutes: z.number().positive().default(40),
  preferences: z.array(z.string()).default([]),
  routeStops: z.array(z.string()).default([]),
  returnPoint: z.string().optional(),
  transportMode: z.enum(["driving", "taxi", "subway", "walk", "mixed", "transit", "none"]).optional(),
  foodPreferences: z.array(z.string()).default([]),
  bookingIntent: z.string().optional(),
  orderingIntent: z.string().optional(),
  purchaseIntent: z.string().optional(),
  mustAsk: z.array(z.string()).default([]),
  isPlanningRequest: z.boolean().default(true),
});

export type UserIntent = z.infer<typeof userIntentSchema>;

// ============================================================================
// CandidatePoi - 候选兴趣点
// ============================================================================

export const candidatePoiSchema = z.object({
  id: z.string(),
  source: z.enum(["mock", "amap", "manual", "partner"]),
  name: z.string(),
  category: z.enum(["activity", "restaurant", "movie", "event", "shopping", "scenic", "transport", "other"]),
  address: z.string(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  rating: z.number().min(0).max(5).optional(),
  avgPrice: z.number().optional(),
  tags: z.array(z.string()).default([]),
  indoor: z.boolean().default(false),
  kidFriendly: z.boolean().default(false),
  dietFriendly: z.boolean().default(false),
  openingHours: z.string().optional(),
  todayOpenStatus: z.enum(["open", "closed", "unknown"]).default("unknown"),
  distanceMinutes: z.number().optional(),
  bookingRequired: z.boolean().default(false),
  bookingAvailable: z.boolean().default(true),
  queueRisk: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
  riskFlags: z.array(z.string()).default([]),
  city: z.string().optional(),
  adcode: z.string().optional(),
  /* V4: deep POI fields */
  tel: z.string().optional(),
  distanceMeters: z.number().optional(),
  deepLink: z.string().optional(),
  recommendedItems: z.array(z.string()).optional(),
  reservationHints: z.string().optional(),
});

export type CandidatePoi = z.infer<typeof candidatePoiSchema>;

// ============================================================================
// TimelineStep - 时间线步骤
// ============================================================================

export const timelineStepSchema = z.object({
  id: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  type: z.enum(["travel", "activity", "meal", "movie", "event", "buffer", "return", "rest"]),
  title: z.string(),
  poiId: z.string().nullable(),
  poiName: z.string().nullable(),
  durationMinutes: z.number().int().positive(),
  transport: z.enum(["driving", "taxi", "subway", "walk", "mixed", "none"]).default("none"),
  reasoning: z.string(),
  bookingNeeded: z.boolean().default(false),
  actionId: z.string().nullable().default(null),
  /* Phase 2: enhanced step detail fields */
  description: z.string().optional(),
  estimatedCost: z.string().optional(),
  bookingHint: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  /* V4: deep step detail — 具体店铺/商品/执行动作 */
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  whyRecommended: z.string().optional(),
  recommendedItems: z.array(z.string()).optional(),
  bookingAdvice: z.string().optional(),
  queueRisk: z.enum(["low", "medium", "high", "unknown"]).optional(),
  businessHours: z.string().optional(),
  actionHints: z.array(z.string()).optional(),
  fallbackPois: z.array(z.string()).optional(),
  /* V3: service actions — external service entrances */
  serviceActions: z.array(z.any()).optional(),
});

export type TimelineStep = z.infer<typeof timelineStepSchema>;

// ============================================================================
// ExecutionAction - 可执行动作
// ============================================================================

export const executionActionSchema = z.object({
  id: z.string(),
  planId: z.string(),
  optionId: z.string(),
  userId: z.string(),
  type: z.enum([
    "restaurant_reservation", "ticket_lock", "calendar_event", "share_message",
    "navigation", "memory_save", "book_hotel", "book_restaurant", "book_transport",
    "buy_ticket", "reserve_activity", "add_to_calendar", "set_reminder",
    /* V4: execution action types */
    "coffee_order_draft", "restaurant_reservation_draft", "open_taxi_deeplink",
    "open_meituan_search", "open_dianping_search", "call_restaurant",
  ]),
  provider: z.enum(["meituan", "open", "amap", "calendar", "mock", "dianping", "meituan_order"]).default("mock"),
  status: z.enum([
    "proposed", "quoted", "prepared", "waiting_user_confirm",
    "redirect_required", "waiting_external_confirm", "executing",
    "succeeded", "failed", "expired", "cancelled",
  ]),
  title: z.string(),
  description: z.string(),
  confirmationRequired: z.boolean(),
  idempotencyKey: z.string(),
  priceEstimate: z.string().optional(),
  expiresAt: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type ExecutionAction = z.infer<typeof executionActionSchema>;

// ============================================================================
// ActivityPlan - 单套活动方案
// ============================================================================

export const activityPlanSchema = z.object({
  id: z.string(),
  planId: z.string(),
  title: z.string(),
  targetGroup: participantModeSchema,
  score: z.number().min(0).max(100),
  summary: z.string(),
  totalDurationMinutes: z.number().int().positive(),
  totalCostMin: z.number().min(0),
  totalCostMax: z.number().min(0),
  walkingKm: z.number().min(0).optional(),
  assumptions: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]).optional(),
  recovery: z.object({
    applied: z.boolean(),
    reasons: z.array(z.string()).default([]),
    actions: z.array(z.string()).default([]),
  }).optional(),
  timeline: z.array(timelineStepSchema).min(2),
  backupPlan: z.string().optional(),
});

export type ActivityPlan = z.infer<typeof activityPlanSchema>;

// ============================================================================
// ValidationReport - 校验报告
// ============================================================================

export const validationReportSchema = z.object({
  status: z.enum(["pass", "warning", "fail"]),
  score: z.number().min(0).max(100),
  blockingErrors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  repairHints: z.array(z.string()).default([]),
});

export type ValidationReport = z.infer<typeof validationReportSchema>;

// ============================================================================
// ToolLog - 工具调用日志
// ============================================================================

export const toolLogSchema = z.object({
  id: z.string(),
  time: z.string(),
  tool: z.string(),
  status: z.enum(["success", "retry", "mock", "warning", "failed"]),
  detail: z.string(),
});

export type ToolLogEntry = z.infer<typeof toolLogSchema>;

// ============================================================================
// PlanningResponse - 规划完整响应
// ============================================================================

export const planningResponseSchema = z.object({
  traceId: z.string(),
  planId: z.string(),
  mode: z.enum(["mock", "llm", "hybrid"]),
  intent: userIntentSchema,
  options: z.array(activityPlanSchema),
  selectedOptionId: z.string().optional(),
  validation: validationReportSchema,
  executableActions: z.array(executionActionSchema).default([]),
  toolLogs: z.array(toolLogSchema).default([]),
  nextActions: z.array(z.string()).default([]),
  responseType: z.enum(["plan", "chat"]).optional(),
});

export type PlanningResponse = z.infer<typeof planningResponseSchema>;

