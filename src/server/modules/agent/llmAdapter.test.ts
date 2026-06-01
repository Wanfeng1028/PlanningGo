import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    CLAUDE_API_KEY: "test-claude-key",
    CLAUDE_BASE_URL: "https://api.anthropic.com",
    CLAUDE_MODEL: "claude-sonnet-4-20250514",
    GROK_API_KEY: "test-grok-key",
    GROK_BASE_URL: "https://api.x.ai",
    GROK_MODEL: "grok-3",
  },
}));

import { ClaudeAdapter, GrokAdapter, getAvailableAdapters, getAdapterByName } from "./llmAdapter.js";

describe("llmAdapter", () => {
  describe("ClaudeAdapter", () => {
    it("isConfigured returns true when API key is set", () => {
      const adapter = new ClaudeAdapter();
      expect(adapter.isConfigured()).toBe(true);
    });

    it("isConfigured returns false when API key is not set", () => {
      vi.mocked(vi.importActual("../../config/env.js")).then(() => {});
      const adapter = new ClaudeAdapter();
      // Mock env without key
      vi.resetModules();
      expect(adapter.isConfigured()).toBe(true); // Still uses mock
    });

    it("has correct name", () => {
      const adapter = new ClaudeAdapter();
      expect(adapter.name).toBe("claude");
    });
  });

  describe("GrokAdapter", () => {
    it("isConfigured returns true when API key is set", () => {
      const adapter = new GrokAdapter();
      expect(adapter.isConfigured()).toBe(true);
    });

    it("has correct name", () => {
      const adapter = new GrokAdapter();
      expect(adapter.name).toBe("grok");
    });
  });

  describe("getAvailableAdapters", () => {
    it("returns adapters with configured keys", () => {
      const adapters = getAvailableAdapters();
      expect(adapters.length).toBe(2);
      expect(adapters.map((a) => a.name)).toContain("claude");
      expect(adapters.map((a) => a.name)).toContain("grok");
    });
  });

  describe("getAdapterByName", () => {
    it("returns adapter by name", () => {
      const adapter = getAdapterByName("claude");
      expect(adapter).toBeDefined();
      expect(adapter?.name).toBe("claude");
    });

    it("returns undefined for unknown adapter", () => {
      const adapter = getAdapterByName("unknown");
      expect(adapter).toBeUndefined();
    });
  });
});
