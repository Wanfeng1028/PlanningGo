import { buildNavigationUrl } from "../../maps/navigationLinks.js";

/**
 * Navigation provider - generates navigation links
 */
export class NavigationProvider {
  /**
   * Generate a navigation link for multiple points
   */
  async generateNavigation(params: {
    points: string[];
    origin?: string;
    destination?: string;
  }): Promise<{ navigationUrl: string; points: string[] }> {
    const _pointsStr = params.points.join("|");
    const navigationUrl = buildNavigationUrl({
      provider: "open",
      origin: params.origin,
      destination: params.destination || params.points[0] || "",
      mode: "driving",
    });

    return {
      navigationUrl,
      points: params.points,
    };
  }

  /**
   * Generate a walking navigation link
   */
  async generateWalkingNavigation(params: {
    origin: string;
    destination: string;
  }): Promise<{ navigationUrl: string }> {
    const navigationUrl = buildNavigationUrl({
      provider: "open",
      origin: params.origin,
      destination: params.destination,
      mode: "walking",
    });

    return { navigationUrl };
  }

  /**
   * Generate a driving navigation link
   */
  async generateDrivingNavigation(params: {
    origin: string;
    destination: string;
  }): Promise<{ navigationUrl: string }> {
    const navigationUrl = buildNavigationUrl({
      provider: "open",
      origin: params.origin,
      destination: params.destination,
      mode: "driving",
    });

    return { navigationUrl };
  }

  /**
   * Generate a transit navigation link
   */
  async generateTransitNavigation(params: {
    origin: string;
    destination: string;
    city: string;
  }): Promise<{ navigationUrl: string }> {
    const navigationUrl = buildNavigationUrl({
      provider: "open",
      origin: params.origin,
      destination: params.destination,
      mode: "transit",
      city: params.city,
    });

    return { navigationUrl };
  }
}

// Singleton instance
let navigationProviderInstance: NavigationProvider | null = null;

export function getNavigationProvider(): NavigationProvider {
  if (!navigationProviderInstance) {
    navigationProviderInstance = new NavigationProvider();
  }
  return navigationProviderInstance;
}
