import type { ToolBudget, ToolCallPlan } from "../../tools/types";

/**
 * Error when tool budget is exceeded
 */
export class ToolBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolBudgetExceededError";
  }
}

/**
 * Check if tool call is within budget
 */
export function checkToolBudget(
  toolCall: ToolCallPlan,
  budget: ToolBudget,
  currentCalls: number,
  currentRound: number,
): void {
  if (currentCalls >= budget.maxToolCalls) {
    throw new ToolBudgetExceededError(
      `Tool call budget exceeded: ${currentCalls}/${budget.maxToolCalls} calls`,
    );
  }

  if (currentRound >= budget.maxToolRounds) {
    throw new ToolBudgetExceededError(
      `Tool round budget exceeded: ${currentRound}/${budget.maxToolRounds} rounds`,
    );
  }
}

/**
 * Get remaining budget
 */
export function getRemainingBudget(budget: ToolBudget, currentCalls: number, currentRound: number): Partial<ToolBudget> {
  return {
    maxToolCalls: Math.max(0, budget.maxToolCalls - currentCalls),
    maxToolRounds: Math.max(0, budget.maxToolRounds - currentRound),
    maxParallelCalls: budget.maxParallelCalls,
    maxTotalLatencyMs: budget.maxTotalLatencyMs,
    maxAmapCalls: budget.maxAmapCalls,
    maxLlmCalls: budget.maxLlmCalls,
  };
}

/**
 * Check if budget is exhausted
 */
export function isBudgetExhausted(budget: ToolBudget, currentCalls: number, currentRound: number): boolean {
  return currentCalls >= budget.maxToolCalls || currentRound >= budget.maxToolRounds;
}
