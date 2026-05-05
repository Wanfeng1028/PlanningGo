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

export interface UserProfile {
  id: string;
  name: string;
  city: string;
  startPoint: string;
  family: string[];
  preferences: string[];
  budgetRange: [number, number];
  permissions: Record<string, boolean>;
}

export interface Reservation {
  id: string;
  type: "restaurant" | "ticket" | "activity" | "delivery";
  title: string;
  status: "draft" | "holding" | "confirmed" | "failed";
  price?: string;
  detail: string;
}

export interface ShareRoom {
  id: string;
  planId: string;
  title: string;
  members: Array<{ name: string; vote: "yes" | "no" | "pending"; comment?: string }>;
}

export interface MemoryItem {
  id: string;
  category: "family" | "food" | "route" | "collaboration";
  title: string;
  detail: string;
  weight: number;
}
