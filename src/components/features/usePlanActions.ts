import { useCallback } from "react";
import type { PlanningOption } from "../../lib/api";
import { runPlanAction } from "../../lib/runPlanAction";
import type { ToastType } from "../GlassToast";

type ShowToast = (text: string, type?: ToastType, duration?: number) => void;

export interface UsePlanActionsOptions {
  showToast: ShowToast;
  conversationId: string | null;
  city: string;
  setInputValue: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Called when save API is available (Phase 3+) */
  onSavePlanApi?: (input: { conversationId: string; planId: string; optionId: string }) => Promise<void>;
  /** Called when plan selection is needed (Phase 1 fallback) */
  onSelectPlan?: (input: { conversationId: string; optionId: string }) => Promise<void>;
}

export function usePlanActions(opts: UsePlanActionsOptions) {
  const { showToast, conversationId, city, setInputValue, textareaRef, onSavePlanApi, onSelectPlan } = opts;

  /** 继续调整：预填引导文字 + 聚焦输入框 */
  const handleAdjustPlan = useCallback((plan: PlanningOption) => {
    setInputValue(`我想调整「${plan.title}」，希望…`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [setInputValue, textareaRef]);

  /** 生成日历：下载 ICS 文件（每步 VEVENT + TZID + VALARM） */
  const handleGenerateCalendar = useCallback((plan: PlanningOption) => {
    runPlanAction({
      actionKey: `calendar-${plan.id}`,
      showToast,
      loadingText: "正在生成日历…",
      successText: "日历文件已下载",
      errorText: "日历生成失败",
      run: () => {
        const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PlanningGo//CN"];
        for (const step of plan.timeline) {
          const date = step.startTime?.split(" ")[0]?.replace(/-/g, "") ?? "";
          const stTime = step.startTime?.split(" ")[1]?.replace(/:/g, "") ?? "0900";
          const edTime = step.endTime?.split(" ")[1]?.replace(/:/g, "") ?? "1800";
          lines.push(
            "BEGIN:VEVENT",
            `UID:${plan.id}-${step.id}@planninggo`,
            `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
            `DTSTART;TZID=Asia/Shanghai:${date}T${stTime}00`,
            `DTEND;TZID=Asia/Shanghai:${date}T${edTime}00`,
            `SUMMARY:${step.title}`,
            step.poiName ? `LOCATION:${step.poiName}` : "",
            `DESCRIPTION:${step.description ?? step.title}`,
            step.estimatedCost ? `预计花费：${step.estimatedCost}` : "",
            "BEGIN:VALARM",
            "TRIGGER:-PT30M",
            "ACTION:DISPLAY",
            `DESCRIPTION:即将开始：${step.title}`,
            "END:VALARM",
            "END:VEVENT",
          );
        }
        lines.push("END:VCALENDAR");
        const content = lines.filter(Boolean).join("\r\n");
        const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${plan.title}.ics`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  }, [showToast]);

  /** 保存方案：调用 save API + toast */
  const handleSavePlan = useCallback(async (plan: PlanningOption) => {
    await runPlanAction({
      actionKey: `save-${plan.id}`,
      showToast,
      loadingText: "正在保存…",
      successText: "方案已保存",
      errorText: "保存失败，请重试",
      run: async () => {
        if (!conversationId) throw new Error("没有活跃的对话");
        if (onSavePlanApi) {
          await onSavePlanApi({ conversationId, planId: plan.planId, optionId: plan.id });
        } else if (onSelectPlan) {
          await onSelectPlan({ conversationId, optionId: plan.id });
        } else {
          throw new Error("保存功能不可用");
        }
      },
    });
  }, [showToast, conversationId, onSavePlanApi, onSelectPlan]);

  /** 打开导航：坐标优先 → poiName 搜索 → toast 提示 */
  const handleOpenNavigation = useCallback((plan: PlanningOption) => {
    const navPoints = plan.timeline
      .filter((step) => step.poiName)
      .map((step) => ({
        name: step.poiName!,
        lat: (step as Record<string, unknown>).lat as number | undefined,
        lng: (step as Record<string, unknown>).lng as number | undefined,
      }));

    if (navPoints.length === 0) {
      showToast("当前方案缺少可导航地点", "info");
      return;
    }

    const origin = navPoints[0];
    const destination = navPoints[navPoints.length - 1];
    const viaPoints = navPoints.slice(1, -1);

    // Build Amap navigation URL with coordinate fallback
    const parts: string[] = [];

    // Origin
    if (origin.lat && origin.lng) {
      parts.push(`from=${origin.lng},${origin.lat},${encodeURIComponent(origin.name)}`);
    } else {
      parts.push(`from=${encodeURIComponent(origin.name)}`);
    }

    // Via points (max 16 for Amap)
    if (viaPoints.length > 0) {
      const viaStrs = viaPoints.slice(0, 16).map((p) => {
        if (p.lat && p.lng) return `${p.lng},${p.lat},${encodeURIComponent(p.name)}`;
        return encodeURIComponent(p.name);
      });
      parts.push(`via=${viaStrs.join("|")}`);
    }

    // Destination
    if (destination.lat && destination.lng) {
      parts.push(`to=${destination.lng},${destination.lat},${encodeURIComponent(destination.name)}`);
    } else {
      parts.push(`to=${encodeURIComponent(destination.name)}`);
    }

    const url = `https://uri.amap.com/navigation?${parts.join("&")}&mode=car&coordinate=gaode`;
    window.open(url, "_blank");
    showToast("已打开高德导航", "success");
  }, [showToast]);

  /** 查看预约建议：提取 bookingNeeded 步骤信息 */
  const handleViewReservations = useCallback((plan: PlanningOption) => {
    const steps = plan.timeline.filter((s) => s.bookingNeeded);
    if (steps.length === 0) {
      showToast("该方案没有需要预约的步骤", "info");
      return;
    }
    // Return the steps for modal display by the parent
    return steps;
  }, [showToast]);

  return {
    handleAdjustPlan,
    handleGenerateCalendar,
    handleSavePlan,
    handleOpenNavigation,
    handleViewReservations,
  };
}
