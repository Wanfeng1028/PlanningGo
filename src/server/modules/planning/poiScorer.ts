/**
 * POI 评分与去重系统。
 * 对候选 POI 进行多维度评分，过滤不合适的候选，去除重复。
 */
import type { CandidatePoi, UserIntent } from "./schemas";
import type { CandidatePool } from "./candidateGenerator";

export interface ScoredPoi extends CandidatePoi {
  score: number;
  scoreDetails: ScoreDetails;
}

export interface ScoreDetails {
  distance: number;
  rating: number;
  budgetFit: number;
  participantFit: number;
  queueFit: number;
  indoorFit: number;
  routeFit: number;
  profileFit: number;
}

/**
 * 对候选 POI 池进行评分、去重和过滤
 */
export function scoreAndFilterCandidates(
  candidates: CandidatePool,
  intent: UserIntent,
): CandidatePool {
  return {
    activities: processCategory(candidates.activities, intent),
    restaurants: processCategory(candidates.restaurants, intent),
    movies: processCategory(candidates.movies, intent),
    events: processCategory(candidates.events, intent),
    cafes: processCategory(candidates.cafes ?? [], intent),
    cinemas: processCategory(candidates.cinemas ?? [], intent),
  };
}

function processCategory(pois: CandidatePoi[], intent: UserIntent): CandidatePoi[] {
  // 1. Deduplicate: same name + same coordinates
  const deduped = deduplicatePois(pois);

  // 2. Score each POI
  const scored = deduped.map((poi) => scorePoi(poi, intent));

  // 3. Filter out unsuitable POIs
  const filtered = scored.filter((poi) => shouldInclude(poi, intent));

  // 4. Sort by score descending
  filtered.sort((a, b) => b.score - a.score);

  return filtered;
}

function deduplicatePois(pois: CandidatePoi[]): CandidatePoi[] {
  const seen = new Set<string>();
  return pois.filter((poi) => {
    // Dedup by name (normalized)
    const nameKey = poi.name.replace(/\s+/g, "").toLowerCase();
    // Also check coordinate proximity (same place within 50m)
    const coordKey = poi.lat && poi.lng
      ? `${Math.round(poi.lat * 1000)}_${Math.round(poi.lng * 1000)}`
      : "";

    const key = coordKey ? `${nameKey}_${coordKey}` : nameKey;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scorePoi(poi: CandidatePoi, intent: UserIntent): ScoredPoi {
  const details: ScoreDetails = {
    distance: scoreDistance(poi, intent),
    rating: scoreRating(poi),
    budgetFit: scoreBudgetFit(poi, intent),
    participantFit: scoreParticipantFit(poi, intent),
    queueFit: scoreQueueFit(poi, intent),
    indoorFit: scoreIndoorFit(poi, intent),
    routeFit: 50, // Default neutral — needs route calculator context
    profileFit: scoreProfileFit(poi, intent),
  };

  // Weighted sum
  const score =
    details.distance * 0.2 +
    details.rating * 0.15 +
    details.budgetFit * 0.2 +
    details.participantFit * 0.1 +
    details.queueFit * 0.1 +
    details.indoorFit * 0.1 +
    details.routeFit * 0.05 +
    details.profileFit * 0.1;

  return { ...poi, score: Math.round(score), scoreDetails: details };
}

function scoreDistance(poi: CandidatePoi, intent: UserIntent): number {
  if (!poi.distanceMinutes) return 50;
  const limit = intent.distanceLimitMinutes;
  if (poi.distanceMinutes <= limit * 0.5) return 100;
  if (poi.distanceMinutes <= limit) return 80;
  if (poi.distanceMinutes <= limit * 1.5) return 40;
  return 10;
}

function scoreRating(poi: CandidatePoi): number {
  if (!poi.rating) return 50;
  if (poi.rating >= 4.5) return 100;
  if (poi.rating >= 4.0) return 80;
  if (poi.rating >= 3.5) return 60;
  if (poi.rating >= 3.0) return 40;
  return 20;
}

function scoreBudgetFit(poi: CandidatePoi, intent: UserIntent): number {
  if (!poi.avgPrice || !intent.budgetMax) return 50;
  // Per-person budget estimate: budgetMax / partySize / 2 (assuming 2 meals)
  const perPersonBudget = intent.budgetMax / Math.max(intent.partySize, 1);
  if (poi.avgPrice <= perPersonBudget * 0.5) return 100;
  if (poi.avgPrice <= perPersonBudget) return 80;
  if (poi.avgPrice <= perPersonBudget * 1.5) return 40;
  return 10;
}

function scoreParticipantFit(poi: CandidatePoi, intent: UserIntent): number {
  let score = 50;
  if (intent.participantMode === "family") {
    score = poi.kidFriendly ? 100 : 30;
  } else if (intent.participantMode === "couple") {
    // Romantic venues score higher for couples
    score = poi.indoor ? 70 : 60;
    if (poi.tags.some((t) => /浪漫|氛围|约会/.test(t))) score = 100;
  } else if (intent.participantMode === "friends") {
    score = 70; // Most venues are OK for friends
    if (poi.tags.some((t) => /聚会|团建|桌游/.test(t))) score = 100;
  }
  return score;
}

function scoreQueueFit(poi: CandidatePoi, intent: UserIntent): number {
  const avoidQueue = intent.preferences.some((p) => /少排队|不排队/.test(p));
  if (!avoidQueue) return 50;
  switch (poi.queueRisk) {
    case "low": return 100;
    case "medium": return 60;
    case "high": return 20;
    default: return 50;
  }
}

function scoreIndoorFit(poi: CandidatePoi, intent: UserIntent): number {
  const preferIndoor = intent.preferences.some((p) => /室内|少走路/.test(p));
  if (!preferIndoor) return 50;
  return poi.indoor ? 100 : 30;
}

function scoreProfileFit(poi: CandidatePoi, intent: UserIntent): number {
  let score = 50;
  // Diet preference matching
  if (intent.preferences.some((p) => /素食|减脂|清淡/.test(p)) && poi.dietFriendly) {
    score = Math.max(score, 80);
  }
  // Activity tag matching
  for (const pref of intent.preferences) {
    if (poi.tags.some((t) => t.includes(pref))) {
      score = Math.max(score, 90);
    }
  }
  return score;
}

function shouldInclude(poi: ScoredPoi, intent: UserIntent): boolean {
  // Filter out POIs with very low scores
  if (poi.score < 20) return false;
  // Filter out POIs that are way over budget
  if (poi.avgPrice && intent.budgetMax && poi.avgPrice > intent.budgetMax * 2) return false;
  // Filter out POIs that are too far
  if (poi.distanceMinutes && poi.distanceMinutes > intent.distanceLimitMinutes * 2) return false;
  return true;
}
