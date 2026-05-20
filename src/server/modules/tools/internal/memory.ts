import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolExecutionContext } from "../types";

/**
 * Read user memories
 */
registerTool({
  name: "internal.readMemory",
  description: "Read user memories and past preferences",
  riskLevel: "read",
  budgetCost: 0,
  timeoutMs: 1000,
  inputSchema: z.object({
    userId: z.string().optional(),
    guestId: z.string().optional(),
    category: z.string().optional(),
  }),
  outputSchema: z.object({
    memories: z.array(
      z.object({
        id: z.string(),
        category: z.string(),
        title: z.string(),
        detail: z.string(),
        weight: z.number(),
      }),
    ),
  }),
  async execute(input, ctx: ToolExecutionContext) {
    // For now, return mock memory data
    // In production, this would query the database
    return {
      memories: [
        {
          id: "mem_001",
          category: "preference",
          title: "喜欢湖滨商圈",
          detail: "用户多次选择湖滨商圈的活动",
          weight: 0.8,
        },
      ],
    };
  },
});

/**
 * Write user memory
 */
registerTool({
  name: "internal.writeMemory",
  description: "Write a new memory for the user",
  riskLevel: "write",
  budgetCost: 0,
  timeoutMs: 1000,
  inputSchema: z.object({
    userId: z.string().optional(),
    guestId: z.string().optional(),
    category: z.string(),
    title: z.string(),
    detail: z.string(),
    weight: z.number().default(0.5),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    memoryId: z.string(),
  }),
  async execute(input, ctx: ToolExecutionContext) {
    // For now, return mock success
    // In production, this would write to the database
    return {
      success: true,
      memoryId: `mem_${Date.now()}`,
    };
  },
});
