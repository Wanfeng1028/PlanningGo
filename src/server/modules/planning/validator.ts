import type { ActivityPlan, CandidatePoi, UserIntent, ValidationReport } from "./schemas";
import type { CandidatePool } from "./candidateGenerator";

/**
 * 对生成的方案进行程序化校验。
 * 检查时间顺序、POI 来源、预算、人群适配、距离等。
 */
export function validatePlans(input: {
  intent: UserIntent;
  candidates: CandidatePool;
  options: ActivityPlan[];
}): ValidationReport {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  const repairHints: string[] = [];

  const candidateMap = buildCandidateMap(input.candidates);

  for (const option of input.options) {
    validateTimeline(option, blockingErrors, warnings, repairHints);
    validatePoiSources(option, candidateMap, blockingErrors, repairHints);
    validateDuration(option, input.intent, warnings, repairHints);
    validateBudget(option, input.intent, warnings, repairHints);
    validateParticipantFit(option, input.intent, candidateMap, warnings, repairHints);
    validateDistance(option, input.intent, candidateMap, warnings, repairHints);
    /* Phase 2: enhanced validators */
    validateMealCoverage(option, input.intent, warnings, repairHints);
    validatePoiDedup(option, blockingErrors, repairHints);
    validateStartTime(option, input.intent, warnings, repairHints);
    validateTransportTime(option, warnings, repairHints);
    validateWalkingDistance(option, input.intent, warnings, repairHints);
    validateFoodRestrictions(option, input.intent, candidateMap, warnings, repairHints);
    validateQueuePreference(option, input.intent, candidateMap, warnings, repairHints);
  }

  const status = blockingErrors.length > 0 ? "fail" : warnings.length > 0 ? "warning" : "pass";
  const score = Math.max(0, 100 - blockingErrors.length * 25 - warnings.length * 6);

  return {
    status,
    score,
    blockingErrors,
    warnings,
    repairHints,
  };
}

function buildCandidateMap(pool: CandidatePool): Map<string, CandidatePoi> {
  const items: CandidatePoi[] = [
    ...pool.activities,
    ...pool.restaurants,
    ...pool.movies,
    ...pool.events,
    ...(pool.cafes ?? []),
    ...(pool.cinemas ?? []),
  ];
  return new Map(items.map((item) => [item.id, item]));
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function validateTimeline(
  option: ActivityPlan,
  blockingErrors: string[],
  warnings: string[],
  repairHints: string[],
): void {
  for (let i = 0; i < option.timeline.length; i += 1) {
    const step = option.timeline[i];
    const start = toMinutes(step.startTime);
    const end = toMinutes(step.endTime);

    if (end <= start) {
      blockingErrors.push(`${option.title} 中「${step.title}」结束时间早于或等于开始时间。`);
      repairHints.push("重新生成该步骤时间，确保 startTime < endTime。");
    }

    const next = option.timeline[i + 1];
    if (next && toMinutes(next.startTime) < end) {
      blockingErrors.push(`${option.title} 中「${step.title}」与「${next.title}」时间重叠。`);
      repairHints.push("增加转场缓冲或压缩前一项活动。");
    }
  }

  if (option.timeline.length < 3) {
    warnings.push(`${option.title} 时间线步骤过少，可能不像完整行程。`);
  }
}

function validatePoiSources(
  option: ActivityPlan,
  candidateMap: Map<string, CandidatePoi>,
  blockingErrors: string[],
  repairHints: string[],
): void {
  for (const step of option.timeline) {
    if (["travel", "buffer", "return", "rest"].includes(step.type)) continue;
    if (!step.poiId) {
      blockingErrors.push(`${option.title} 中「${step.title}」缺少 poiId。`);
      repairHints.push("只能使用候选池中的地点生成活动/餐饮/电影步骤。");
      continue;
    }
    if (!candidateMap.has(step.poiId)) {
      blockingErrors.push(`${option.title} 中「${step.title}」使用了不存在的 poiId: ${step.poiId}。`);
      repairHints.push("替换为 CandidatePool 中存在的 poiId。");
    }
  }
}

function validateDuration(
  option: ActivityPlan,
  intent: UserIntent,
  warnings: string[],
  repairHints: string[],
): void {
  const [minHours, maxHours] = intent.durationHours;
  const minMinutes = minHours * 60;
  const maxMinutes = maxHours * 60;

  if (option.totalDurationMinutes < minMinutes * 0.75) {
    warnings.push(
      `${option.title} 总时长偏短，可能不满足用户想玩 ${minHours}-${maxHours} 小时的预期。`,
    );
  }

  if (option.totalDurationMinutes > maxMinutes) {
    warnings.push(`${option.title} 总时长超过用户期望上限。`);
    repairHints.push("压缩活动时长或减少一个转场。");
  }
}

function validateBudget(
  option: ActivityPlan,
  intent: UserIntent,
  warnings: string[],
  repairHints: string[],
): void {
  if (!intent.budgetMax) return;

  if (option.totalCostMax > intent.budgetMax * 1.2) {
    warnings.push(`${option.title} 预算明显超过用户上限。`);
    repairHints.push("替换低价餐厅、取消可选电影/活动票，或询问用户是否接受超预算。");
  } else if (option.totalCostMax > intent.budgetMax) {
    warnings.push(`${option.title} 预算略超用户上限（${intent.budgetMax}元），实际花费可能偏高。`);
    repairHints.push("调整餐厅或活动以控制在预算内。");
  }
}

function validateParticipantFit(
  option: ActivityPlan,
  intent: UserIntent,
  candidateMap: Map<string, CandidatePoi>,
  warnings: string[],
  repairHints: string[],
): void {
  const pois = option.timeline
    .map((step) => (step.poiId ? candidateMap.get(step.poiId) : undefined))
    .filter(Boolean) as CandidatePoi[];

  if (intent.participantMode === "family" && !pois.some((poi) => poi.kidFriendly)) {
    warnings.push(`${option.title} 缺少明确亲子友好地点。`);
    repairHints.push("加入亲子展、儿童乐园、商场亲子活动或亲子友好餐厅。");
  }

  if (intent.preferences.includes("减脂友好") && !pois.some((poi) => poi.dietFriendly)) {
    warnings.push(`${option.title} 没有体现减脂/清淡餐饮适配。`);
  }
}

function validateDistance(
  option: ActivityPlan,
  intent: UserIntent,
  candidateMap: Map<string, CandidatePoi>,
  warnings: string[],
  repairHints: string[],
): void {
  for (const step of option.timeline) {
    if (!step.poiId) continue;
    const poi = candidateMap.get(step.poiId);
    if (!poi?.distanceMinutes) continue;

    if (poi.distanceMinutes > intent.distanceLimitMinutes + 10) {
      warnings.push(`${option.title} 中「${poi.name}」距离偏远，约 ${poi.distanceMinutes} 分钟。`);
      repairHints.push("优先选择 40 分钟交通圈内的同类地点。");
    }
  }
}

/* ─── Phase 2: Enhanced Validators ─────────────────────── */

function validateMealCoverage(
  option: ActivityPlan,
  intent: UserIntent,
  warnings: string[],
  repairHints: string[],
): void {
  // Plans over 4 hours should include at least 1 meal
  if (option.totalDurationMinutes >= 240) {
    const mealCount = option.timeline.filter((s) => s.type === "meal").length;
    if (mealCount === 0) {
      warnings.push(`${option.title} 行程超过 4 小时但未包含用餐步骤。`);
      repairHints.push("在行程中插入至少一个用餐步骤（午餐或晚餐）。");
    }
  }
}

function validatePoiDedup(
  option: ActivityPlan,
  blockingErrors: string[],
  repairHints: string[],
): void {
  const seenPoiIds = new Set<string>();
  for (const step of option.timeline) {
    if (!step.poiId) continue;
    if (seenPoiIds.has(step.poiId)) {
      blockingErrors.push(`${option.title} 中「${step.title}」重复使用了地点 ${step.poiId}。`);
      repairHints.push("每个步骤应使用不同的地点。");
    }
    seenPoiIds.add(step.poiId);
  }
}

function validateStartTime(
  option: ActivityPlan,
  intent: UserIntent,
  warnings: string[],
  repairHints: string[],
): void {
  if (option.timeline.length === 0) return;
  const firstStep = option.timeline[0];
  const startMin = toMinutes(firstStep.startTime);

  // Warn if start time is before 7:00 or after 20:00 for a typical weekend plan
  if (startMin < 7 * 60) {
    warnings.push(`${option.title} 行程开始时间过早（${firstStep.startTime}），周末出行建议 9:00 后出发。`);
    repairHints.push("调整出发时间到 9:00 以后。");
  }
  if (startMin > 20 * 60) {
    warnings.push(`${option.title} 行程开始时间过晚（${firstStep.startTime}），大部分场所可能已关闭。`);
    repairHints.push("调整出发时间或选择夜间活动。");
  }
}

function validateTransportTime(
  option: ActivityPlan,
  warnings: string[],
  repairHints: string[],
): void {
  for (let i = 0; i < option.timeline.length - 1; i++) {
    const current = option.timeline[i];
    const next = option.timeline[i + 1];
    if (!current || !next) continue;

    const currentEnd = toMinutes(current.endTime);
    const nextStart = toMinutes(next.startTime);
    const gap = nextStart - currentEnd;

    // If gap between steps is less than 10 minutes, transport time may be insufficient
    if (gap >= 0 && gap < 10 && current.type !== "buffer" && next.type !== "buffer") {
      warnings.push(
        `${option.title} 中「${current.title}」到「${next.title}」间仅有 ${gap} 分钟转场时间，可能不够。`,
      );
      repairHints.push("增加转场缓冲时间或调整步骤顺序。");
    }

    // If gap is negative (already caught by timeline overlap), skip
    if (gap < 0) continue;

    // If transport is "walk" and gap is over 60 minutes, walking might be too long
    if (next.transport === "walk" && gap > 60) {
      warnings.push(
        `${option.title} 中「${next.title}」步行转场约 ${gap} 分钟，可能过长。`,
      );
      repairHints.push("考虑换用公共交通或打车，或选择更近的地点。");
    }
  }
}

function validateWalkingDistance(
  option: ActivityPlan,
  intent: UserIntent,
  warnings: string[],
  repairHints: string[],
): void {
  // If user specified a distance limit in minutes, check walking steps
  const maxWalkMinutes = intent.distanceLimitMinutes || 40;

  for (const step of option.timeline) {
    if (step.transport !== "walk") continue;
    // Estimate: walking step duration should not exceed a reasonable threshold
    if (step.durationMinutes > maxWalkMinutes) {
      warnings.push(
        `${option.title} 中「${step.title}」步行 ${step.durationMinutes} 分钟，超过用户偏好上限 ${maxWalkMinutes} 分钟。`,
      );
      repairHints.push("选择更近的地点或改用其他交通方式。");
    }
  }

  // Also check total walking km if available
  if (option.walkingKm && option.walkingKm > 5) {
    warnings.push(`${option.title} 总步行距离 ${option.walkingKm}km，可能偏多。`);
    repairHints.push("减少步行转场或选择更集中的区域。");
  }
}

function validateFoodRestrictions(
  option: ActivityPlan,
  intent: UserIntent,
  candidateMap: Map<string, CandidatePoi>,
  warnings: string[],
  repairHints: string[],
): void {
  // Check if user has food-related preferences that might indicate restrictions
  const foodPrefs = intent.preferences.filter((p) =>
    /素食|清真|无麸质|减脂|低卡|清淡|过敏|忌口/.test(p),
  );
  if (foodPrefs.length === 0) return;

  const mealSteps = option.timeline.filter((s) => s.type === "meal");
  for (const step of mealSteps) {
    if (!step.poiId) continue;
    const poi = candidateMap.get(step.poiId);
    if (!poi) continue;

    // If user prefers vegetarian and POI doesn't have diet-friendly tag
    if (foodPrefs.some((p) => /素食|减脂|清淡/.test(p)) && !poi.dietFriendly) {
      warnings.push(
        `${option.title} 中「${poi.name}」可能不完全符合用户饮食偏好（${foodPrefs.join("、")}）。`,
      );
      repairHints.push("选择有健康/素食/清淡选项的餐厅。");
    }
  }
}

function validateQueuePreference(
  option: ActivityPlan,
  intent: UserIntent,
  candidateMap: Map<string, CandidatePoi>,
  warnings: string[],
  repairHints: string[],
): void {
  // Check if user has queue-avoidance preference
  const avoidQueue = intent.preferences.some((p) =>
    /少排队|不排队|免排队|少排队/.test(p),
  );
  if (!avoidQueue) return;

  for (const step of option.timeline) {
    if (!step.poiId) continue;
    const poi = candidateMap.get(step.poiId);
    if (!poi) continue;

    if (poi.queueRisk === "high") {
      warnings.push(
        `${option.title} 中「${poi.name}」排队风险较高，不符合用户"少排队"偏好。`,
      );
      repairHints.push("替换为排队风险较低的同类地点，或建议错峰前往。");
    }
  }
}
