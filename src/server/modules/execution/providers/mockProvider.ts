/**
 * Mock provider - provides mock implementations for testing
 */
export class MockProvider {
  /**
   * Mock navigation
   */
  async mockNavigation(_params: { points: string[] }): Promise<{ navigationUrl: string }> {
    return {
      navigationUrl: "https://mock-navigation.example.com",
    };
  }

  /**
   * Mock calendar event
   */
  async mockCalendar(_params: { title: string }): Promise<{ eventId: string }> {
    return {
      eventId: `mock_cal_${Date.now()}`,
    };
  }

  /**
   * Mock share
   */
  async mockShare(_params: { text: string }): Promise<{ shareUrl: string }> {
    return {
      shareUrl: "https://mock-share.example.com",
    };
  }

  /**
   * Mock reservation
   */
  async mockReservation(_params: { poiName: string }): Promise<{ reservationId: string }> {
    return {
      reservationId: `mock_res_${Date.now()}`,
    };
  }
}

// Singleton instance
let mockProviderInstance: MockProvider | null = null;

export function getMockProvider(): MockProvider {
  if (!mockProviderInstance) {
    mockProviderInstance = new MockProvider();
  }
  return mockProviderInstance;
}
