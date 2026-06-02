import { describe, expect, it, vi, beforeEach } from "vitest";
import { updateConversationTitle } from "./titleUtils.js";

// Mock memoryStore
vi.mock("../../services/memoryStore.js", () => ({
  updateConversationTitle: vi.fn(),
}));

import * as mem from "../../services/memoryStore.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
function createMockDb(existingTitle: string | null): any {
  const update = vi.fn().mockResolvedValue({});
  const findUnique = vi.fn().mockResolvedValue(existingTitle !== null ? { title: existingTitle } : null);
  return {
    conversation: { findUnique, update },
  };
}

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("updateConversationTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update title and updatedAt when title changes", async () => {
    const db = createMockDb("旧标题");
    await updateConversationTitle(db, "conv-1", "新标题", mockLog);

    expect(db.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      select: { title: true },
    });
    expect(db.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: {
        title: "新标题",
        updatedAt: expect.any(Date),
      },
    });
    expect(mem.updateConversationTitle).toHaveBeenCalledWith("conv-1", "新标题");
    expect(mockLog.info).toHaveBeenCalled();
  });

  it("should skip DB write when title is unchanged", async () => {
    const db = createMockDb("相同标题");
    await updateConversationTitle(db, "conv-1", "相同标题", mockLog);

    expect(db.conversation.findUnique).toHaveBeenCalled();
    expect(db.conversation.update).not.toHaveBeenCalled();
    expect(mem.updateConversationTitle).not.toHaveBeenCalled();
  });

  it("should skip when conversationId is missing", async () => {
    const db = createMockDb("旧标题");
    await updateConversationTitle(db, undefined, "新标题", mockLog);

    expect(db.conversation.findUnique).not.toHaveBeenCalled();
    expect(db.conversation.update).not.toHaveBeenCalled();
  });

  it("should skip when title is null/empty", async () => {
    const db = createMockDb("旧标题");
    await updateConversationTitle(db, "conv-1", null, mockLog);
    await updateConversationTitle(db, "conv-1", "  ", mockLog);
    await updateConversationTitle(db, "conv-1", undefined, mockLog);

    expect(db.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("should skip when conversation not found in DB", async () => {
    const db = createMockDb(null);
    await updateConversationTitle(db, "conv-1", "新标题", mockLog);

    expect(db.conversation.update).not.toHaveBeenCalled();
    expect(mem.updateConversationTitle).not.toHaveBeenCalled();
  });

  it("should handle DB errors gracefully and still update memory", async () => {
    const db = {
      conversation: {
        findUnique: vi.fn().mockRejectedValue(new Error("DB error")),
        update: vi.fn(),
      },
    } as unknown as Parameters<typeof updateConversationTitle>[0];

    await updateConversationTitle(db, "conv-1", "新标题", mockLog);

    expect(mockLog.warn).toHaveBeenCalled();
    expect(mem.updateConversationTitle).toHaveBeenCalledWith("conv-1", "新标题");
  });

  it("should work without log parameter", async () => {
    const db = createMockDb("旧标题");
    await updateConversationTitle(db, "conv-1", "新标题");

    expect(db.conversation.update).toHaveBeenCalled();
    expect(mem.updateConversationTitle).toHaveBeenCalled();
  });

  it("should trim whitespace from title", async () => {
    const db = createMockDb("旧标题");
    await updateConversationTitle(db, "conv-1", "  新标题  ", mockLog);

    expect(db.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: {
        title: "新标题",
        updatedAt: expect.any(Date),
      },
    });
  });
});
