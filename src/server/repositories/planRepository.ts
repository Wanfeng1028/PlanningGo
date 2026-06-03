/**
 * Plan 仓库 — Plan + PlanOption + PlanStep 的 CRUD
 */

import type { PrismaClient, Prisma } from "../../generated/prisma/client.js";

export class PlanRepository {
  constructor(private db: PrismaClient) {}

  async findById(id: string) {
    return this.db.plan.findUnique({
      where: { id },
      include: { options: { include: { steps: { orderBy: { orderIndex: "asc" } } }, orderBy: { score: "desc" } } },
    });
  }

  async listByUserId(userId: string, limit = 20) {
    return this.db.plan.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { options: { include: { steps: { orderBy: { orderIndex: "asc" } } } } },
    });
  }

  async create(data: {
    userId: string;
    title: string;
    summary?: string;
    intent?: Record<string, unknown>;
    contextSnapshot?: Record<string, unknown>;
    traceId?: string;
  }) {
    return this.db.plan.create({
      data: {
        userId: data.userId,
        title: data.title,
        summary: data.summary ?? "",
        intent: (data.intent ?? {}) as unknown as Prisma.InputJsonValue,
        contextSnapshot: (data.contextSnapshot ?? {}) as unknown as Prisma.InputJsonValue,
        traceId: data.traceId ?? "",
      },
    });
  }

  async addOption(planId: string, data: {
    title: string;
    targetGroup?: string;
    score?: number;
    totalDurationMin?: number;
    costMin?: number;
    costMax?: number;
    summary?: string;
    assumptions?: unknown[];
    risks?: unknown[];
    backupPlan?: Record<string, unknown>;
    validationReport?: Record<string, unknown>;
  }) {
    return this.db.planOption.create({
      data: {
        planId,
        title: data.title,
        targetGroup: data.targetGroup ?? "unknown",
        score: data.score ?? 0,
        totalDurationMin: data.totalDurationMin ?? 0,
        costMin: data.costMin ?? 0,
        costMax: data.costMax ?? 0,
        summary: data.summary ?? "",
        assumptions: (data.assumptions ?? []) as unknown as Prisma.InputJsonValue,
        risks: (data.risks ?? []) as unknown as Prisma.InputJsonValue,
        backupPlan: (data.backupPlan ?? {}) as unknown as Prisma.InputJsonValue,
        validationReport: (data.validationReport ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async addStep(planOptionId: string, data: {
    orderIndex: number;
    startTime: string;
    endTime: string;
    type: string;
    placeId?: string;
    placeName?: string;
    action?: string;
    durationMin?: number;
    transport?: string;
    bookingNeeded?: boolean;
    /* Phase 2: enhanced detail fields */
    description?: string;
    estimatedCost?: string;
    bookingHint?: string;
    suggestions?: string[];
    metadata?: Record<string, unknown>;
  }) {
    // Phase 2 fields: use type assertion until Prisma client is regenerated
    // with the new schema fields (description, estimatedCost, bookingHint, suggestions)
    const stepData = {
      planOptionId,
      orderIndex: data.orderIndex,
      startTime: data.startTime,
      endTime: data.endTime,
      type: data.type,
      placeId: data.placeId ?? null,
      placeName: data.placeName ?? null,
      action: data.action ?? "",
      durationMin: data.durationMin ?? 0,
      transport: data.transport ?? "none",
      bookingNeeded: data.bookingNeeded ?? false,
      description: data.description ?? null,
      estimatedCost: data.estimatedCost ?? null,
      bookingHint: data.bookingHint ?? null,
      suggestions: (data.suggestions ?? []) as unknown as Prisma.InputJsonValue,
      metadata: (data.metadata ?? {}) as unknown as Prisma.InputJsonValue,
    } as Record<string, unknown>;
    return this.db.planStep.create({ data: stepData as Parameters<typeof this.db.planStep.create>[0]["data"] });
  }

  async selectOption(planId: string, optionId: string) {
    return this.db.plan.update({
      where: { id: planId },
      data: { selectedOptionId: optionId, status: "selected" },
    });
  }

  async updateStatus(planId: string, status: string) {
    return this.db.plan.update({
      where: { id: planId },
      data: { status },
    });
  }

  async deleteByUserId(userId: string) {
    return this.db.plan.deleteMany({ where: { userId } });
  }
}
