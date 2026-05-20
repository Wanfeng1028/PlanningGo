/**
 * Share provider - generates shareable content
 */
export class ShareProvider {
  /**
   * Generate a shareable link for a plan
   */
  async generateShareLink(params: {
    planId: string;
    optionId: string;
    title: string;
  }): Promise<{ shareUrl: string; shareCode: string }> {
    // In production, this would create a share room and generate a unique code
    const shareCode = this.generateShareCode();
    const shareUrl = `https://your-domain.com/share/${shareCode}`;

    return {
      shareUrl,
      shareCode,
    };
  }

  /**
   * Generate share text for a plan
   */
  async generateShareText(params: {
    title: string;
    timeline: Array<{ startTime: string; endTime: string; title: string }>;
  }): Promise<{ text: string }> {
    const lines = params.timeline.map((step) => `${step.startTime}-${step.endTime} ${step.title}`);
    const text = [`我让周末有谱排了一个方案：${params.title}`, ...lines, "你看可以吗？"].join("\n");

    return { text };
  }

  /**
   * Generate a shareable image/card
   */
  async generateShareCard(params: {
    title: string;
    summary: string;
    timeline: Array<{ startTime: string; endTime: string; title: string }>;
  }): Promise<{ imageUrl: string }> {
    // In production, this would generate an actual image
    const imageUrl = `https://your-domain.com/api/share/card/${Date.now()}`;

    return { imageUrl };
  }

  /**
   * Generate a random share code
   */
  private generateShareCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

// Singleton instance
let shareProviderInstance: ShareProvider | null = null;

export function getShareProvider(): ShareProvider {
  if (!shareProviderInstance) {
    shareProviderInstance = new ShareProvider();
  }
  return shareProviderInstance;
}
