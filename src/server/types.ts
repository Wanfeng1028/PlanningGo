export interface PlanningRequest {
  prompt: string;
  city?: string;
  startPoint?: string;
  companions?: "family" | "friends" | "couple" | "solo";
  budget?: number;
  departAt?: string;
}

export interface ToolLog {
  id: string;
  time: string;
  tool: string;
  status: "success" | "retry" | "mock" | "warning";
  detail: string;
}

export interface PlanOption {
  id: string;
  title: string;
  score: number;
  duration: string;
  budget: string;
  walking: string;
  highlights: string[];
  risks: string[];
}

export interface AgentResult {
  traceId: string;
  summary: string;
  startPoint: string;
  destination: string;
  toolLogs: ToolLog[];
  options: PlanOption[];
  selectedPlanId: string;
  authorization: string[];
  nextActions: string[];
}
