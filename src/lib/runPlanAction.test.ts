import { describe, expect, it, vi } from "vitest";
import { runPlanAction } from "./runPlanAction";

describe("runPlanAction", () => {
  it("shows a clear fallback error toast when an action fails", async () => {
    const showToast = vi.fn();

    const ok = await runPlanAction({
      actionKey: "copy-itinerary",
      showToast,
      successText: "已完成",
      run: () => {
        throw new Error("剪贴板不可用");
      },
    });

    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith("操作失败：剪贴板不可用", "error");
  });

  it("uses the action-specific error text when provided", async () => {
    const showToast = vi.fn();

    const ok = await runPlanAction({
      actionKey: "save-plan",
      showToast,
      successText: "已保存",
      errorText: "保存失败，请重试",
      run: async () => {
        throw new Error("network");
      },
    });

    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith("保存失败，请重试", "error");
  });
});
