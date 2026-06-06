import type { ToolExecutionResult, ToolExecutionContext } from "../tools/types";
import { env } from "../../config/env";
import { getPrismaClient } from "../../common/prisma";
import type { Prisma } from "../../../generated/prisma/client.js";
import { sanitizeToolCallInput, sanitizeToolCallOutput } from "../../common/logSanitizer.js";

/**
 * Log a tool call to the database
 * 安全加固：input/output 在落库前统一脱敏
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
        input: sanitizeToolCallInput(params.input) as unknown as Prisma.InputJsonValue,
        output: sanitizeToolCallOutput(params.output) as unknown as Prisma.InputJsonValue,
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
 * 安全加固：input/output 在落库前统一脱敏
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
    // 安全：batch 模式下 input 为空对象（不记录完整 input），output 脱敏
    input: {} as unknown as Prisma.InputJsonValue,
    output: (result.success ? sanitizeToolCallOutput(result.output) : undefined) as unknown as Prisma.InputJsonValue,
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
