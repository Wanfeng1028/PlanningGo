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
    llmCallLog: {
      create: async () => ({ id: "mock" }),
    },
  };
}

/**
 * Log an LLM call to the database
 */
export async function logLlmCall(params: {
  userId?: string;
  traceId: string;
  provider: string;
  model: string;
  mode: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  status: "success" | "error";
  errorCode?: string;
}): Promise<void> {
  const prisma = getPrisma();

  try {
    await prisma.llmCallLog.create({
      data: {
        userId: params.userId,
        traceId: params.traceId,
        provider: params.provider,
        model: params.model,
        mode: params.mode,
        promptTokens: params.promptTokens || 0,
        completionTokens: params.completionTokens || 0,
        latencyMs: params.latencyMs,
        status: params.status,
        errorCode: params.errorCode,
      },
    });
  } catch (error) {
    console.error("Failed to log LLM call:", error);
    // Don't throw - logging failures shouldn't break the pipeline
  }
}
