/**
 * Format a match score to a human-readable percentage string.
 * - If score is 0–1 (e.g. 0.9), multiply by 100 → "90%"
 * - If score is 1–100 (e.g. 90), keep as-is → "90%"
 * - If score > 100 (anomalous, e.g. 8600), clamp to 100 → "100%"
 * - null / undefined / NaN → ""
 */
export function formatMatchScore(score: number | undefined | null): string {
  if (score == null || Number.isNaN(score)) return "";
  const normalized = score <= 1 ? score * 100 : score;
  const clamped = Math.max(0, Math.min(100, Math.round(normalized)));
  return `${clamped}%`;
}
