import { getTool } from "./registry";
import type {
  ToolCallPlan,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolBatchResult,
  ToolBudget,
  ToolExecutionSummary,
} from "./types";

/**
 * Tool Executor - handles parallel tool execution with budget control
 */
export class ToolExecutor {
  private budget: ToolBudget;
  private currentCalls = 0;
  private currentRound = 0;
  private amapCalls = 0;
  private startTime = 0;

  constructor(budget: ToolBudget) {
    this.budget = budget;
  }

  /**
   * Execute a single tool call
   */
  async executeOne(
    plan: ToolCallPlan,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const tool = getTool(plan.tool);
    if (!tool) {
      return {
        tool: plan.tool,
        success: false,
        error: `Tool not found: ${plan.tool}`,
        latencyMs: 0,
      };
    }

    // Check budget
    if (this.currentCalls >= this.budget.maxToolCalls) {
      return {
        tool: plan.tool,
        success: false,
        error: "Tool budget exceeded",
        latencyMs: 0,
      };
    }

    const startTime = Date.now();
    this.currentCalls++;

    try {
      // Validate input
      const validatedInput = tool.inputSchema.parse(plan.input);

      // Execute with timeout
      const output = await Promise.race([
        tool.execute(validatedInput, ctx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tool timeout")), tool.timeoutMs),
        ),
      ]);

      const latencyMs = Date.now() - startTime;

      return {
        tool: plan.tool,
        success: true,
        output,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        tool: plan.tool,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs,
      };
    }
  }

  /**
   * Execute a batch of tools in parallel
   */
  async runBatch(params: {
    batchName: string;
    parallel: boolean;
    maxConcurrency?: number;
    tools: ToolCallPlan[];
    ctx: ToolExecutionContext;
  }): Promise<ToolBatchResult> {
    const { batchName, parallel, maxConcurrency, tools, ctx } = params;
    this.startTime = Date.now();
    this.currentRound++;

    let results: ToolExecutionResult[];

    if (parallel) {
      // Parallel execution with optional concurrency limit
      if (maxConcurrency && maxConcurrency > 0) {
        results = await this.executeWithConcurrencyLimit(tools, maxConcurrency, ctx);
      } else {
        results = await Promise.allSettled(
          tools.map((plan) => this.executeOne(plan, ctx)),
        ).then((settled) =>
          settled.map((result) =>
            result.status === "fulfilled"
              ? result.value
              : {
                  tool: "unknown",
                  success: false,
                  error: result.reason instanceof Error ? result.reason.message : String(result.reason),
                  latencyMs: 0,
                },
          ),
        );
      }
    } else {
      // Sequential execution
      results = [];
      for (const plan of tools) {
        const result = await this.executeOne(plan, ctx);
        results.push(result);
      }
    }

    const totalLatencyMs = Date.now() - this.startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    return {
      batchName,
      results,
      totalLatencyMs,
      successCount,
      failureCount,
    };
  }

  /**
   * Execute tools with concurrency limit
   */
  private async executeWithConcurrencyLimit(
    plans: ToolCallPlan[],
    limit: number,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const executing: Promise<ToolExecutionResult>[] = [];

    for (const plan of plans) {
      const promise = this.executeOne(plan, ctx);
      executing.push(promise);

      if (executing.length >= limit) {
        const result = await Promise.race(executing);
        results.push(result);
        executing.splice(executing.indexOf(promise), 1);
      }
    }

    // Wait for remaining
    const remaining = await Promise.allSettled(executing);
    results.push(
      ...remaining.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : {
              tool: "unknown",
              success: false,
              error: r.reason instanceof Error ? r.reason.message : String(r.reason),
              latencyMs: 0,
            },
      ),
    );

    return results;
  }

  /**
   * Get execution summary
   */
  getSummary(results: ToolExecutionResult[]): ToolExecutionSummary {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    return {
      totalCalls: results.length,
      totalLatencyMs: results.reduce((sum, r) => sum + r.latencyMs, 0),
      successfulCalls: successful.length,
      failedCalls: failed.length,
      toolsUsed: Array.from(new Set(results.map((r) => r.tool))),
      errors: failed.map((r) => ({ tool: r.tool, error: r.error || "Unknown error" })),
    };
  }

  /**
   * Check if budget is exhausted
   */
  isBudgetExceeded(): boolean {
    return this.currentCalls >= this.budget.maxToolCalls || this.currentRound >= this.budget.maxToolRounds;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): Partial<ToolBudget> {
    return {
      maxToolCalls: this.budget.maxToolCalls - this.currentCalls,
      maxToolRounds: this.budget.maxToolRounds - this.currentRound,
      maxAmapCalls: this.budget.maxAmapCalls - this.amapCalls,
    };
  }
}

/**
 * Create tool executor with budget based on model mode
 */
export function createToolExecutor(modelMode: "flash" | "pro"): ToolExecutor {
  const budgetByModelMode = {
    flash: {
      maxToolCalls: 10,
      maxToolRounds: 2,
      maxParallelCalls: 5,
      maxTotalLatencyMs: 8000,
      maxAmapCalls: 8,
      maxLlmCalls: 1,
    },
    pro: {
      maxToolCalls: 20,
      maxToolRounds: 4,
      maxParallelCalls: 6,
      maxTotalLatencyMs: 20000,
      maxAmapCalls: 16,
      maxLlmCalls: 2,
    },
  };

  return new ToolExecutor(budgetByModelMode[modelMode]);
}
