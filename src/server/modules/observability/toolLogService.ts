import type { ToolExecutionResult, ToolExecutionContext } from "../tools/types";
import { env } from "../../config/env";

// Use a lazy-loaded Prisma client to avoid initialization issues
let prismaInstance: any = null;

function getPrisma() {
  if (!prismaInstance) {
    try {
      const { PrismaClient } = require("../../generated/prisma/client.js");
      prismaInstance = new PrismaClient();
    } catch (error) {
      console.warn("Prisma client not available, using mock implementation");
      prismaInstance = createMockPrisma();
    }
  }
  return prismaInstance;
}

function createMockPrisma() {
  return {
    toolCallLog: {
      create: async () => ({ id: "mock" }),
      createMany: async () => ({ count: 0 }),
    },
  };
}

/**
 * Log a tool call to the database
 */
export async function logToolCall(params: {
  userId?: string;
  traceId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  status: "success" | "error";
  errorCode?: string;
}): Promise<void> {
  if (!env.ENABLE_TOOL_LOGS) {
    return;
  }

  const prisma = getPrisma();

  try {
    await prisma.toolCallLog.create({
      data: {
        userId: params.userId,
        traceId: params.traceId,
        toolName: params.toolName,
        input: params.input as any,
        output: params.output as any,
        latencyMs: params.latencyMs,
        status: params.status,
        errorCode: params.errorCode,
      },
    });
  } catch (error) {
    console.error("Failed to log tool call:", error);
    // Don't throw - logging failures shouldn't break the pipeline
  }
}

/**
 * Log multiple tool calls in batch
 */
export async function logToolCallsBatch(
  results: ToolExecutionResult[],
  ctx: ToolExecutionContext,
): Promise<void> {
  if (!env.ENABLE_TOOL_LOGS) {
    return;
  }

  const prisma = getPrisma();

  const logs = results.map((result) => ({
    userId: ctx.userId,
    traceId: ctx.traceId,
    toolName: result.tool,
    input: {}, // Would need to track input separately
    output: result.success ? result.output : undefined,
    latencyMs: result.latencyMs,
    status: (result.success ? "success" : "error") as "success" | "error",
    errorCode: result.success ? undefined : result.error,
  }));

  try {
    await prisma.toolCallLog.createMany({
      data: logs,
    });
  } catch (error) {
    console.error("Failed to log tool calls batch:", error);
  }
}
