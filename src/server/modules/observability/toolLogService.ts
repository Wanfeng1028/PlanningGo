import type { ToolExecutionResult, ToolExecutionContext } from "../tools/types";
import { env } from "../../config/env";
import { getPrismaClient } from "../../common/prisma";

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

  const prisma = getPrismaClient();
  if (!prisma) return;

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

  const prisma = getPrismaClient();
  if (!prisma) return;

  const logs = results.map((result) => ({
    userId: ctx.userId,
    traceId: ctx.traceId,
    toolName: result.tool,
    input: {} as any,
    output: (result.success ? result.output : undefined) as any,
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
