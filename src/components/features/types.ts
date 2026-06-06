/**
 * @fileoverview Shared types for plan card view and related components.
 */

export interface PlanOption {
  id: string;
  title: string;
  summary: string;
  score: number;
  totalDurationMinutes: number;
  totalCostMin: number;
  totalCostMax: number;
  walkingKm?: number;
  assumptions: string[];
  highlights: string[];
  risks: string[];
  timeline: PlanStep[];
  backupPlan?: string;
}

export interface PlanStep {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  title: string;
  poiId: string | null;
  poiName: string | null;
  durationMinutes: number;
  transport: string;
  reasoning: string;
  bookingNeeded: boolean;
  actionId: string | null;
  description?: string;
  estimatedCost?: string;
  bookingHint?: string;
  suggestions?: string[];
  whyRecommended?: string;
  recommendedItems?: string[];
  bookingAdvice?: string;
  queueRisk?: string;
  businessHours?: string;
  actionHints?: string[];
  fallbackPois?: string[];
}

export interface PlanCardData {
  options: PlanOption[];
  selectedOptionId?: string;
  intent?: Record<string, unknown>;
}
