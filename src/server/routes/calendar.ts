/**
 * Calendar ICS route -- backend ICS generation with full timeline + relative date parsing
 */

import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

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
  // Extract HH:MM from "09:00", "9:00", "2026-06-04 09:00", etc.
  const m = timeStr.match(/(\d{1,2})[:\uff1a](\d{2})/);
  if (!m) return "090000";
  return `${m[1]!.padStart(2, "0")}${m[2]!}00`;
}

/** Resolve relative Chinese date references to real Date objects */
function resolveRelativeDate(dateStr: string): Date {
  if (!dateStr) return getTomorrow();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Already absolute date (YYYY-MM-DD or YYYYMMDD)
  const absMatch = dateStr.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (absMatch) {
    return new Date(parseInt(absMatch[1]!), parseInt(absMatch[2]!) - 1, parseInt(absMatch[3]!));
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  if (/tomorrow/i.test(dateStr) || dateStr.includes("\u660e\u5929")) return tomorrow;
  if (/day.?after/i.test(dateStr) || dateStr.includes("\u540e\u5929")) return dayAfter;
  if (/today/i.test(dateStr) || dateStr.includes("\u4eca\u5929")) return today;

  // Weekend references -- find next Saturday/Sunday
  if (/saturday/i.test(dateStr) || dateStr.includes("\u5468\u516d")) {
    const d = new Date(today);
    const diff = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  if (/sunday/i.test(dateStr) || dateStr.includes("\u5468\u65e5")) {
    const d = new Date(today);
    const diff = (7 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  if (/weekend/i.test(dateStr) || dateStr.includes("\u5468\u672b")) {
    const d = new Date(today);
    const diff = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  // Fallback: tomorrow
  return tomorrow;
}

function getTomorrow(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

const timelineStepSchema = z.object({
  id: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  type: z.string().optional(),
  title: z.string(),
  poiName: z.string().nullable().optional(),
  description: z.string().optional(),
  estimatedCost: z.string().optional(),
});

const icsRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  date: z.string().optional(), // Fallback date if steps don't have dates
  steps: z.array(timelineStepSchema).optional(),
});

export async function registerCalendarRoutes(app: FastifyInstance) {
  app.post("/api/ics", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = icsRequestSchema.parse(request.body);
    const planTitle = icsEscape(body.title ?? "\u5468\u672b\u53bb\u54ea\u513f\u884c\u7a0b");
    const fallbackDate = resolveRelativeDate(body.date ?? "\u660e\u5929");

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PlanningGo//Weekend Agent//CN",
      "CALSCALE:GREGORIAN",
    ];

    if (body.steps && body.steps.length > 0) {
      // Generate one VEVENT per step
      for (const step of body.steps) {
        // Parse date from startTime, fallback to body.date or tomorrow
        const datePart = step.startTime.split(" ")[0] ?? "";
        const stepDate = resolveRelativeDate(datePart || body.date || "");

        const dateStr = icsFormatDate(stepDate);
        const startTime = icsFormatTime(step.startTime);
        const endTime = icsFormatTime(step.endTime);

        const uid = crypto.randomUUID();
        const summary = icsEscape(step.title);
        const location = step.poiName ? icsEscape(step.poiName) : "";
        const descParts = [step.description, step.estimatedCost ? `\u9884\u8ba1\u82b1\u8d39\uff1a${step.estimatedCost}` : ""].filter(Boolean);
        const description = icsEscape(descParts.join(" | "));

        lines.push(
          "BEGIN:VEVENT",
          `UID:${uid}@planninggo.local`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
          `DTSTART;TZID=Asia/Shanghai:${dateStr}T${startTime}`,
          `DTEND;TZID=Asia/Shanghai:${dateStr}T${endTime}`,
          `SUMMARY:${summary}`,
          location ? `LOCATION:${location}` : "",
          description ? `DESCRIPTION:${description}` : "",
          "BEGIN:VALARM",
          "TRIGGER:-PT30M",
          "ACTION:DISPLAY",
          `DESCRIPTION:\u5373\u5c06\u5f00\u59cb\uff1a${summary}`,
          "END:VALARM",
          "END:VEVENT",
        );
      }
    } else {
      // Legacy single VEVENT fallback
      const dateStr = icsFormatDate(fallbackDate);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${crypto.randomUUID()}@planninggo.local`,
        `DTSTART;TZID=Asia/Shanghai:${dateStr}T140000`,
        `DTEND;TZID=Asia/Shanghai:${dateStr}T183000`,
        `SUMMARY:${planTitle}`,
        "DESCRIPTION:\u7531\u5468\u672b\u53bb\u54ea\u513f Agent \u751f\u6210\u7684\u672c\u5730\u751f\u6d3b\u89c4\u5212\u3002",
        "END:VEVENT",
      );
    }

    lines.push("END:VCALENDAR");
    const ics = lines.filter(Boolean).join("\r\n");

    return reply
      .header("content-type", "text/calendar; charset=utf-8")
      .header("content-disposition", `attachment; filename="${encodeURIComponent(planTitle)}.ics"`)
      .send(ics);
  });
}
