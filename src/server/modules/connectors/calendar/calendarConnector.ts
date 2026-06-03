/**
 * Calendar Connector — 日历事件连接器
 * V3: 复用 src/server/routes/calendar.ts 的 ICS 生成逻辑，支持多 step timeline
 */

import type {
  ConnectorCapability,
  ConnectorProvider,
  QuoteInput,
  QuoteResult,
  PreparedAction,
  CommitResult,
  ServiceConnector,
} from "../types.js";

const PROVIDER: ConnectorProvider = "calendar";
const CAPABILITIES: ConnectorCapability[] = ["calendar_event"];

// ============================================================================
// ICS 生成（与 /api/ics 路由共享逻辑）
// ============================================================================

function icsEscape(value: string): string {
  return value.replace(/[\\;,\n\r]/g, (ch) => {
    if (ch === "\n" || ch === "\r") return "";
    return `\\${ch}`;
  });
}

function icsFormatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function icsFormatTime(timeStr: string): string {
  const m = timeStr.match(/(\d{1,2})[:\uff1a](\d{2})/);
  if (!m) return "090000";
  return `${m[1]!.padStart(2, "0")}${m[2]!}00`;
}

function resolveRelativeDate(dateStr: string): Date {
  if (!dateStr) return getTomorrow();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const absMatch = dateStr.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (absMatch) {
    return new Date(parseInt(absMatch[1]!), parseInt(absMatch[2]!) - 1, parseInt(absMatch[3]!));
  }
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (/tomorrow/i.test(dateStr) || dateStr.includes("明天")) return tomorrow;
  if (/today/i.test(dateStr) || dateStr.includes("今天")) return today;
  return tomorrow;
}

function getTomorrow(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

function generateICSFromSteps(
  title: string,
  steps: Array<{
    startTime: string;
    endTime: string;
    title: string;
    poiName?: string | null;
    description?: string;
    estimatedCost?: string;
  }>,
  fallbackDate?: string,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PlanningGo//Weekend Agent//CN",
    "CALSCALE:GREGORIAN",
  ];

  for (const step of steps) {
    const datePart = step.startTime.split(" ")[0] ?? "";
    const stepDate = resolveRelativeDate(datePart || fallbackDate || "");
    const dateStr = icsFormatDate(stepDate);
    const startTime = icsFormatTime(step.startTime);
    const endTime = icsFormatTime(step.endTime);
    const summary = icsEscape(step.title);
    const location = step.poiName ? icsEscape(step.poiName) : "";
    const descParts = [
      step.description,
      step.estimatedCost ? `预计花费：${step.estimatedCost}` : "",
    ].filter(Boolean);
    const description = icsEscape(descParts.join(" | "));

    lines.push(
      "BEGIN:VEVENT",
      `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@planninggo.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;TZID=Asia/Shanghai:${dateStr}T${startTime}`,
      `DTEND;TZID=Asia/Shanghai:${dateStr}T${endTime}`,
      `SUMMARY:${summary}`,
      location ? `LOCATION:${location}` : "",
      description ? `DESCRIPTION:${description}` : "",
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION：即将开始：${summary}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

// ============================================================================
// Quote / Prepare / Commit
// ============================================================================

function quote(_input: QuoteInput): Promise<QuoteResult> {
  return Promise.resolve({
    quoteId: `cal-quote-${Date.now()}`,
    provider: PROVIDER,
    actionType: _input.actionType,
    status: "available",
  });
}

function prepare(input: QuoteInput): Promise<PreparedAction> {
  const poi = input.poi;
  const startTime = input.startTime || new Date().toISOString();
  const endTime = new Date(
    new Date(startTime).getTime() + 3600000,
  ).toISOString();

  // 优先使用 items 中的多 step 数据
  const steps = input.items?.map((item) => ({
    startTime: item.name, // 复用 name 字段传 startTime
    endTime: item.quantity ? `${item.quantity}` : "",
    title: item.name,
    poiName: poi?.name,
    description: poi?.address,
  })) ?? [];

  const icsContent = steps.length > 0
    ? generateICSFromSteps(poi?.name || "事件", steps)
    : generateICSFromSteps(poi?.name || "事件", [{
        startTime,
        endTime,
        title: poi?.name || "事件",
        poiName: poi?.name,
        description: poi?.address,
      }]);

  return Promise.resolve({
    preparedActionId: `cal-prepared-${Date.now()}`,
    provider: PROVIDER,
    actionType: "calendar_event",
    status: "prepared",
    title: poi?.name || "日历事件",
    description: `已生成 ICS 日历文件: ${poi?.name || "事件"}`,
    payload: {
      icsContent,
      startTime,
      endTime,
      poi: poi ? { name: poi.name, address: poi.address } : undefined,
    },
  });
}

function commit(_id: string): Promise<CommitResult> {
  return Promise.resolve({
    provider: PROVIDER,
    actionType: "calendar_event",
    status: "redirected_to_payment",
    message: "已生成 ICS 日历文件，请保存到本地日历",
  });
}

// ============================================================================
// Export Connector
// ============================================================================

export const calendarConnector: ServiceConnector = {
  provider: PROVIDER,
  capabilities: CAPABILITIES,
  quote,
  prepare,
  commit,
};
