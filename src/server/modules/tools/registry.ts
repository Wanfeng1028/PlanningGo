import type { AgentTool, ToolExecutionContext } from "./types";

/**
 * Central registry for all tools
 * Tools can be registered and retrieved by name
 */
class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  register<T, O>(tool: AgentTool<T, O>): void {
    this.tools.set(tool.name, tool as AgentTool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  listAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  listByRiskLevel(riskLevel: "read" | "write" | "external_action"): AgentTool[] {
    return this.listAll().filter((tool) => tool.riskLevel === riskLevel);
  }
}

// Singleton instance
const registry = new ToolRegistry();

export function registerTool<T, O>(tool: AgentTool<T, O>): void {
  registry.register(tool);
}

export function getTool(name: string): AgentTool | undefined {
  return registry.get(name);
}

export function getAllTools(): AgentTool[] {
  return registry.listAll();
}

export function hasTool(name: string): boolean {
  return registry.has(name);
}
