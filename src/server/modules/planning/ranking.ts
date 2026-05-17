import type { CandidatePoi, UserIntent } from "./schemas";
import type { CandidatePool } from "./candidateGenerator";

/**
 * 对候选 POI 池按用户意图进行评分排序。
 */
export function rankCandidates(intent: UserIntent, pool: CandidatePool): CandidatePool {
  const rank = (items: CandidatePoi[]) =>
    items
      .map((item) => ({ ...item, _score: scoreCandidate(intent, item) }))
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...item }) => item);

  return {
    activities: rank(pool.activities),
    restaurants: rank(pool.restaurants),
    movies: rank(pool.movies),
    events: rank(pool.events),
  };
}

function scoreCandidate(intent: UserIntent, item: CandidatePoi): number {
  let score = 50;

  // 距离
  if (item.distanceMinutes && item.distanceMinutes <= intent.distanceLimitMinutes) score += 18;
  // 可预约
  if (item.bookingAvailable) score += 12;
  // 营业中
  if (item.todayOpenStatus === "open") score += 10;
  // 排队风险低
  if (item.queueRisk === "low") score += 8;
  if (item.queueRisk === "high") score -= 12;

  // 人群适配
  if (intent.participantMode === "family" && item.kidFriendly) score += 18;
  if (intent.preferences.includes("减脂友好") && item.dietFriendly) score += 10;
  if (intent.preferences.includes("室内优先") && item.indoor) score += 10;
  if (intent.participantMode === "friends" && item.tags.some((tag) => ["可锁座", "适合多人"].includes(tag))) score += 10;

  // 预算超限惩罚
  if (intent.budgetMax && item.avgPrice && item.avgPrice * intent.partySize > intent.budgetMax) score -= 20;

  return Math.max(0, Math.min(100, score));
}
