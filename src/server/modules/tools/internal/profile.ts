import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolExecutionContext } from "../types";

/**
 * Read user profile
 */
registerTool({
  name: "internal.readProfile",
  description: "Read user profile and preferences",
  riskLevel: "read",
  budgetCost: 0,
  timeoutMs: 1000,
  inputSchema: z.object({
    userId: z.string().optional(),
    guestId: z.string().optional(),
  }),
  outputSchema: z.object({
    city: z.string(),
    startPoint: z.string(),
    companions: z.string(),
    budgetMin: z.number(),
    budgetMax: z.number(),
    preferences: z.array(z.string()),
  }),
  async execute(input, ctx: ToolExecutionContext) {
    // For now, return mock profile data
    // In production, this would query the database
    return {
      city: ctx.city || "杭州",
      startPoint: "家附近",
      companions: "family",
      budgetMin: 200,
      budgetMax: 300,
      preferences: ["亲子友好", "低排队风险"],
    };
  },
});
