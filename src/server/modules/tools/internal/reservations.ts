import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolExecutionContext } from "../types";

/**
 * Check reservation availability
 */
registerTool({
  name: "internal.checkReservationAvailability",
  description: "Check availability for restaurant or activity reservations",
  riskLevel: "read",
  budgetCost: 0,
  timeoutMs: 2000,
  inputSchema: z.object({
    poiId: z.string(),
    poiName: z.string(),
    date: z.string(),
    time: z.string(),
    partySize: z.number(),
  }),
  outputSchema: z.object({
    available: z.boolean(),
    capacity: z.number(),
    estimatedWait: z.string().optional(),
  }),
  async execute(_input, _ctx: ToolExecutionContext) {
    // For now, return mock availability
    // In production, this would check with external APIs
    return {
      available: true,
      capacity: 20,
      estimatedWait: "5-10分钟",
    };
  },
});
