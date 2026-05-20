import { z } from "zod";

// ============================================================================
// Tool System Types
// ============================================================================

export type ToolRiskLevel = "read" | "write" | "external_action";

export interface ToolExecutionContext {
  traceId: string;
  userId?: string;
  guestId?: string;
  city?: string;
  adcode?: string;
  lat?: number;
  lng?: number;
}

export interface AgentTool<I = unknown, O = unknown> {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  budgetCost: number;
  timeoutMs: number;
  cacheTtlSec?: number;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  execute(input: I, ctx: ToolExecutionContext): Promise<O>;
}

export interface ToolCallPlan {
  tool: string;
  input: unknown;
  reason?: string;
}

export interface ToolExecutionResult {
  tool: string;
  success: boolean;
  output?: unknown;
  error?: string;
  latencyMs: number;
}

export interface ToolBatchResult {
  batchName: string;
  results: ToolExecutionResult[];
  totalLatencyMs: number;
  successCount: number;
  failureCount: number;
}

export interface ToolBudget {
  maxToolCalls: number;
  maxToolRounds: number;
  maxParallelCalls: number;
  maxTotalLatencyMs: number;
  maxAmapCalls: number;
  maxLlmCalls: number;
}

export interface ToolExecutionSummary {
  totalCalls: number;
  totalLatencyMs: number;
  successfulCalls: number;
  failedCalls: number;
  toolsUsed: string[];
  errors: Array<{ tool: string; error: string }>;
}

export interface CityContext {
  city: string | null;
  adcode?: string;
  province?: string;
  district?: string;
  lat?: number;
  lng?: number;
  source: "manual" | "browser_geo" | "amap_regeo" | "profile" | "fallback" | "unknown";
  confidence: "high" | "medium" | "low";
  needsConfirmation: boolean;
}
