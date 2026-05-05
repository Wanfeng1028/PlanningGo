export interface AgentPlanResponse {
  traceId: string;
  summary: string;
  selectedPlanId: string;
  nextActions: string[];
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    phone?: string;
    mode?: "guest" | "registered";
  };
  profile?: {
    city: string;
    startPoint: string;
  };
  onboardingSteps?: string[];
  expiresInMinutes?: number;
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

export async function login(phone: string, code: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  return response.json() as Promise<AuthResponse>;
}

export async function register(input: {
  name: string;
  phone: string;
  city: string;
  startPoint: string;
  companions: string;
  budgetMin: number;
  budgetMax: number;
}): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Register failed: ${response.status}`);
  return response.json() as Promise<AuthResponse>;
}

export async function enterAsGuest(input: { city: string; startPoint: string; companions: string }): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Guest failed: ${response.status}`);
  return response.json() as Promise<AuthResponse>;
}
