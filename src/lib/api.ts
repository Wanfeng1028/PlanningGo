export interface AgentPlanResponse {
  traceId: string;
  summary: string;
  selectedPlanId: string;
  nextActions: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

export async function requestAgentPlan(prompt: string): Promise<AgentPlanResponse> {
  const response = await fetch(`${API_BASE}/api/agent/plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      companions: "family",
      budget: 420,
      startPoint: "浙大紫金港",
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent API failed: ${response.status}`);
  }

  return response.json() as Promise<AgentPlanResponse>;
}
