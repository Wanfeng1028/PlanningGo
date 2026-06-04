import { memories, reservations, shareRooms } from "../data/mockData";
import type { ApiKeyRecord, ExecutionStep, MemoryItem, Reservation, ShareRoom, WebhookRecord } from "../types";
import type { ExecutionAction } from "../modules/planning/schemas";

const reservationStore = new Map(reservations.map((item) => [item.id, item]));
const shareStore = new Map(shareRooms.map((item) => [item.id, item]));
const memoryStore = new Map(memories.map((item) => [item.id, item]));
const selectedPlanStore = new Map<string, string>();

// ── 容量限制配置 ──
const MAX_STORE_ENTRIES = 5000;
const CLEANUP_BATCH = 500;

function enforceCapacity<T>(store: Map<string, T>, maxEntries = MAX_STORE_ENTRIES): void {
  if (store.size <= maxEntries) return;
  const iter = store.keys();
  for (let i = 0; i < CLEANUP_BATCH; i++) {
    const next = iter.next();
    if (next.done) break;
    store.delete(next.value);
  }
}
const permissionStore = new Map<string, boolean>([
  ["location", true],
  ["reservation", false],
  ["ticket", false],
  ["calendar", false],
  ["share", true],
  ["memory", true],
]);

const executionStore = new Map<string, ExecutionStep>(
  [
    { key: "location", title: "定位确认", status: "done", detail: "浙大紫金港已确认。" },
    { key: "restaurant", title: "海底捞预约", status: "running", detail: "正在尝试 17:40 桌位。" },
    { key: "ticket", title: "电影票锁座", status: "pending", detail: "可选加餐，等待用户授权。" },
    { key: "calendar", title: "日历提醒", status: "pending", detail: "确认后写入日历。" },
    { key: "share", title: "分享给家人", status: "pending", detail: "生成简版行程卡。" },
  ].map((step) => [step.key, step as ExecutionStep]),
);

const apiKeyStore = new Map<string, ApiKeyRecord>([
  [
    "key_demo",
    {
      id: "key_demo",
      name: "Hackathon Demo Key",
      keyPreview: "pg_live_****_demo",
      scopes: ["plan:read", "tool:read", "webhook:write"],
      createdAt: "2026-05-05T09:00:00.000Z",
      revoked: false,
    },
  ],
]);

const webhookStore = new Map<string, WebhookRecord>([
  [
    "wh_demo",
    {
      id: "wh_demo",
      url: "https://example.com/planning-go/webhook",
      event: "reservation.updated",
      enabled: true,
      lastDelivery: "success",
    },
  ],
]);

export function getSelectedPlanId(userId: string) {
  return selectedPlanStore.get(userId) ?? "plan_a";
}

export function selectPlan(userId: string, planId: string) {
  selectedPlanStore.set(userId, planId);
  enforceCapacity(selectedPlanStore);
  return { selectedPlanId: planId };
}

export function listPermissions() {
  return Object.fromEntries(permissionStore.entries());
}

export function setPermission(key: string, allowed: boolean) {
  permissionStore.set(key, allowed);
  enforceCapacity(permissionStore);
  return listPermissions();
}

export function listExecutionSteps() {
  return Array.from(executionStore.values());
}

export function updateExecutionStep(key: string, status: ExecutionStep["status"]) {
  const step = executionStore.get(key);
  if (!step) return null;
  const next = { ...step, status };
  executionStore.set(key, next);
  return next;
}

export function advanceExecution() {
  const steps = listExecutionSteps();
  const running = steps.find((step) => step.status === "running");
  if (running) executionStore.set(running.key, { ...running, status: "done" });
  const next = listExecutionSteps().find((step) => step.status === "pending");
  if (next) executionStore.set(next.key, { ...next, status: "running" });
  return listExecutionSteps();
}

export function createApiKey(name: string, scopes: string[]) {
  const id = `key_${Date.now()}`;
  const record: ApiKeyRecord = {
    id,
    name,
    keyPreview: `pg_live_****_${String(Date.now()).slice(-4)}`,
    scopes,
    createdAt: new Date().toISOString(),
    revoked: false,
  };
  apiKeyStore.set(id, record);
  enforceCapacity(apiKeyStore);
  return { ...record, secret: `pg_live_demo_${Date.now()}` };
}

export function listApiKeys() {
  return Array.from(apiKeyStore.values());
}

export function revokeApiKey(id: string) {
  const key = apiKeyStore.get(id);
  if (!key) return null;
  const next = { ...key, revoked: true };
  apiKeyStore.set(id, next);
  return next;
}

export function listWebhooks() {
  return Array.from(webhookStore.values());
}

export function upsertWebhook(input: Omit<WebhookRecord, "id" | "lastDelivery"> & { id?: string }) {
  const id = input.id ?? `wh_${Date.now()}`;
  const record: WebhookRecord = { ...input, id, lastDelivery: "pending" };
  webhookStore.set(id, record);
  enforceCapacity(webhookStore);
  return record;
}

export function replayWebhook(id: string) {
  const webhook = webhookStore.get(id);
  if (!webhook) return null;
  const next: WebhookRecord = { ...webhook, lastDelivery: "success" };
  webhookStore.set(id, next);
  return next;
}

export function listReservations() {
  return Array.from(reservationStore.values());
}

export function upsertReservation(input: Omit<Reservation, "id"> & { id?: string }) {
  const id = input.id ?? `res_${Date.now()}`;
  const reservation: Reservation = { ...input, id };
  reservationStore.set(id, reservation);
  enforceCapacity(reservationStore);
  return reservation;
}

export function updateReservationStatus(id: string, status: Reservation["status"]) {
  const reservation = reservationStore.get(id);
  if (!reservation) return null;
  const next = { ...reservation, status };
  reservationStore.set(id, next);
  return next;
}

export function listShareRooms() {
  return Array.from(shareStore.values());
}

export function createShareRoom(input: Omit<ShareRoom, "id"> & { id?: string }) {
  const id = input.id ?? `share_${Date.now()}`;
  const room: ShareRoom = { ...input, id };
  // 确保 userId 被保留
  shareStore.set(id, room);
  enforceCapacity(shareStore);
  return room;
}

export function vote(roomId: string, memberName: string, value: "yes" | "no", comment?: string) {
  const room = shareStore.get(roomId);
  if (!room) return null;
  const members = room.members.map((member) =>
    member.name === memberName ? { ...member, vote: value, comment: comment ?? member.comment } : member,
  );
  const next = { ...room, members };
  shareStore.set(roomId, next);
  return next;
}

export function listMemories() {
  return Array.from(memoryStore.values());
}

export function upsertMemory(input: Omit<MemoryItem, "id"> & { id?: string }) {
  const id = input.id ?? `mem_${Date.now()}`;
  const memory: MemoryItem = { ...input, id };
  memoryStore.set(id, memory);
  enforceCapacity(memoryStore);
  return memory;
}

export function deleteMemory(id: string) {
  return memoryStore.delete(id);
}

export function exportPrivacyBundle(userId?: string) {
  return {
    generatedAt: new Date().toISOString(),
    selectedPlanId: userId ? getSelectedPlanId(userId) : "plan_a",
    permissions: listPermissions(),
    reservations: listReservations(),
    shareRooms: listShareRooms(),
    memories: listMemories(),
  };
}

export function clearLongTermMemory() {
  memoryStore.clear();
  return { ok: true, memories: [] };
}

// ============================================================================
// Action Store - 可执行动作状态管理
// ============================================================================

const actionStore = new Map<string, ExecutionAction>();

export function listActions(planId?: string, userId?: string): ExecutionAction[] {
  const all = Array.from(actionStore.values());
  let filtered = planId ? all.filter((a) => a.planId === planId) : all;
  if (userId) {
    // 只返回属于该用户的 action（没有 userId 的 action 不可见）
    filtered = filtered.filter((a) => a.userId === userId);
  }
  return filtered;
}

export function getAction(id: string): ExecutionAction | undefined {
  return actionStore.get(id);
}

export function saveActions(actions: ExecutionAction[]): void {
  for (const action of actions) {
    actionStore.set(action.id, action);
  }
  enforceCapacity(actionStore);
}

export function updateActionStatus(id: string, status: ExecutionAction["status"]): ExecutionAction | null {
  const action = actionStore.get(id);
  if (!action) return null;
  const next = { ...action, status };
  actionStore.set(id, next);
  return next;
}

function assertActionOwnership(action: ExecutionAction, userId: string): void {
  if (!action.userId || action.userId !== userId) {
    throw new Error("FORBIDDEN: action does not belong to this user");
  }
}

function assertActionNotExpired(action: ExecutionAction): void {
  if (action.expiresAt && new Date(action.expiresAt) < new Date()) {
    throw new Error("ACTION_EXPIRED");
  }
}

// assertActionTypeAllowed + PAYMENT_TYPES removed: were only called by removed confirmAction

export function quoteAction(id: string, userId: string): ExecutionAction | null {
  const action = actionStore.get(id);
  if (!action) return null;
  assertActionOwnership(action, userId);
  assertActionNotExpired(action);
  const next: ExecutionAction = { ...action, status: "quoted" };
  actionStore.set(id, next);
  return next;
}

// ── Legacy in-memory store (deprecated — not used in production) ──
// confirmAction has been removed: replaced by ActionExecutor.confirmAction()
// which uses Prisma DB + V3 state machine + Connector Registry.

export function cancelAction(id: string, userId: string): ExecutionAction | null {
  const action = actionStore.get(id);
  if (!action) return null;
  assertActionOwnership(action, userId);
  const next: ExecutionAction = { ...action, status: "cancelled" };
  actionStore.set(id, next);
  return next;
}

export function clearActions(): void {
  actionStore.clear();
}
