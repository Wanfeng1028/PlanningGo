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
