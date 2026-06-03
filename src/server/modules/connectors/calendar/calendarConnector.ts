/**
 * Calendar Connector — 日历事件连接器
 * V3: 封装 ICS 文件生成，支持 calendar_event 能力
 *
 * 复用: src/server/routes/calendar.ts 的 ICS 生成逻辑
 */

import { randomUUID } from "node:crypto";
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
// ICS 生成（内联，避免循环依赖）
// ============================================================================

function generateICS(
  title: string,
  options: {
    description?: string;
    location?: string;
    startTime: string; // ISO 8601
    endTime: string;
  },
): string {
  const dtFormat = (d: string) =>
    new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PlanningGo//CN",
    "BEGIN:VEVENT",
    `UID:${randomUUID()}@planninggo`,
    `DTSTAMP:${dtFormat(new Date().toISOString())}`,
    `DTSTART:${dtFormat(options.startTime)}`,
    `DTEND:${dtFormat(options.endTime)}`,
    `SUMMARY:${title}`,
    options.description ? `DESCRIPTION:${options.description}` : "",
    options.location ? `LOCATION:${options.location}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
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

  const icsContent = generateICS(input.items?.[0]?.name || poi?.name || "事件", {
    description: poi?.address,
    location: poi?.address,
    startTime,
    endTime,
  });

  return Promise.resolve({
    preparedActionId: `cal-prepared-${Date.now()}`,
    provider: PROVIDER,
    actionType: "calendar_event",
    status: "prepared",
    title: poi?.name || "日历事件",
    description: `已生成 ICS 文件: ${poi?.name || "事件"}`,
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
    status: "committed",
    message: "日历事件已生成",
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
