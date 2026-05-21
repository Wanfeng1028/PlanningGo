import { extractChineseCityNames } from "./cityGuard";

/**
 * Output safety check result
 */
export interface OutputSafetyResult {
  safe: boolean;
  reason?: string;
  illegalCities?: string[];
}

/**
 * 校验输出是否包含非目标城市。
 * 发现非法城市直接返回不安全，不做文本替换。
 */
export function validateOutputCitySafety(text: string, allowedCity: string): OutputSafetyResult {
  const cityNames = extractChineseCityNames(text);
  const illegalCities = cityNames.filter((city) => city !== allowedCity);

  if (illegalCities.length > 0) {
    return {
      safe: false,
      reason: `输出包含非目标城市：${illegalCities.join(", ")}，需要重新规划`,
      illegalCities,
    };
  }

  return { safe: true };
}
