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

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`API failed: ${path} ${response.status}`);
  return response.json() as Promise<T>;
}

export async function sendAuthCode(phone: string) {
  return apiJson<{ phone: string; code: string; expiresInSeconds: number }>("/api/auth/code", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function login(phone: string, code: string): Promise<AuthResponse> {
  return apiJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export async function register(input: {
  name: string;
  phone: string;
  code: string;
  city: string;
  startPoint: string;
  companions: string;
  budgetMin: number;
  budgetMax: number;
}): Promise<AuthResponse> {
  return apiJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function enterAsGuest(input: { city: string; startPoint: string; companions: string }): Promise<AuthResponse> {
  return apiJson<AuthResponse>("/api/auth/guest", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPlans() {
  return apiJson<{ selectedPlanId: string; options: unknown[] }>("/api/plans/demo");
}

export async function selectPlan(planId: string) {
  return apiJson<{ selectedPlanId: string }>("/api/plans/select", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
}

export async function createReservation(input: { type: string; title: string; status?: string; price?: string; detail: string }) {
  return apiJson("/api/reservations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function advanceExecution() {
  return apiJson<{ traceId: string; steps: unknown[] }>("/api/execution/advance", { method: "POST" });
}

export async function updatePermission(key: string, allowed: boolean) {
  return apiJson<Record<string, boolean>>("/api/profile/demo/permissions", {
    method: "PATCH",
    body: JSON.stringify({ key, allowed }),
  });
}

export async function createShareRoom(input: { planId: string; title: string; members: Array<{ name: string; vote?: string; comment?: string }> }) {
  return apiJson("/api/share/rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function saveMemory(input: { category: string; title: string; detail: string; weight: number }) {
  return apiJson("/api/memories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function exportPrivacy() {
  return apiJson("/api/privacy/export");
}

export async function createApiKey(input: { name: string; scopes: string[] }) {
  return apiJson("/api/developer/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
