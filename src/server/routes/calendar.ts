/**
 * Calendar ICS 路由
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

function icsEscape(value: string): string {
  return value.replace(/[\\;,\n\r]/g, (ch) => {
    if (ch === "\n" || ch === "\r") return "";
    return `\\${ch}`;
  });
}

const icsSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  date: z.string().regex(/^\d{8}$/).optional(),
});

export async function registerCalendarRoutes(app: FastifyInstance) {
  app.post("/api/ics", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = icsSchema.parse(request.body);
    const title = icsEscape(body.title ?? "周末有谱行程");
    const date = body.date ?? "20260509";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PlanningGo//Weekend Agent//CN",
      "BEGIN:VEVENT",
      `UID:${crypto.randomUUID()}@planninggo.local`,
      `DTSTART:${date}T140000`,
      `DTEND:${date}T183000`,
      `SUMMARY:${title}`,
      "DESCRIPTION:由周末有谱 Agent 生成的本地生活规划。",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    return reply.header("content-type", "text/calendar; charset=utf-8").send(ics);
  });
}
