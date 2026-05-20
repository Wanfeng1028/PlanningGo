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
 * Validate that output doesn't contain cities other than the allowed city
 */
export function validateOutputCitySafety(text: string, allowedCity: string): OutputSafetyResult {
  const cityNames = extractChineseCityNames(text);
  const illegalCities = cityNames.filter((city) => city !== allowedCity);

  if (illegalCities.length > 0) {
    return {
      safe: false,
      reason: `输出包含非目标城市：${illegalCities.join(", ")}`,
      illegalCities,
    };
  }

  return { safe: true };
}

/**
 * Sanitize output by removing illegal city mentions
 * This is a simple implementation - in production you might want more sophisticated NLP
 */
export function sanitizeOutputCity(text: string, allowedCity: string): string {
  const cityNames = extractChineseCityNames(text);
  let sanitized = text;

  for (const city of cityNames) {
    if (city !== allowedCity) {
      // Replace city name with allowed city or remove
      sanitized = sanitized.replace(new RegExp(city, "g"), allowedCity);
    }
  }

  return sanitized;
}
