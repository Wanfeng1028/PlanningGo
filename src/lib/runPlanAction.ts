import { useState, useCallback, useRef } from "react";
import type { ToastType } from "../components/GlassToast";

/* ── Types ── */
export type ActionStatus = "idle" | "loading" | "success" | "error";

export interface RunPlanActionOptions {
  actionKey: string;
  loadingText?: string;
  successText: string;
  errorText?: string;
  run: () => Promise<void> | void;
}

export interface PlanActionState {
  status: ActionStatus;
  execute: () => void;
  lastError?: string;
}

type ShowToast = (text: string, type?: ToastType, duration?: number) => void;

/* ── usePlanAction: per-button state management ── */
export function usePlanAction(showToast: ShowToast): {
  getAction: (opts: RunPlanActionOptions) => PlanActionState;
  isAnyLoading: boolean;
} {
  const [states, setStates] = useState<Record<string, ActionStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const loadingRef = useRef(new Set<string>());

  const getAction = useCallback(
    (opts: RunPlanActionOptions): PlanActionState => {
      const { actionKey, loadingText, successText, errorText, run } = opts;
      const status = states[actionKey] ?? "idle";

      const execute = () => {
        // Prevent double-click while loading
        if (loadingRef.current.has(actionKey)) return;

        loadingRef.current.add(actionKey);
        setStates((prev) => ({ ...prev, [actionKey]: "loading" }));

        if (loadingText) {
          showToast(loadingText, "info", 6000);
        }

        const handleResult = () => {
          loadingRef.current.delete(actionKey);
          setStates((prev) => ({ ...prev, [actionKey]: "success" }));
          showToast(successText, "success");
          // Reset to idle after a short delay so the button can be re-used
          setTimeout(() => {
            setStates((prev) => ({ ...prev, [actionKey]: "idle" }));
          }, 2000);
        };

        const handleError = (err: unknown) => {
          loadingRef.current.delete(actionKey);
          const message = err instanceof Error ? err.message : String(err);
          setStates((prev) => ({ ...prev, [actionKey]: "error" }));
          setErrors((prev) => ({ ...prev, [actionKey]: message }));
          showToast(errorText ?? `操作失败：${message}`, "error");
          setTimeout(() => {
            setStates((prev) => ({ ...prev, [actionKey]: "idle" }));
          }, 2000);
        };

        try {
          const result = run();
          if (result && typeof result.then === "function") {
            result.then(handleResult).catch(handleError);
          } else {
            handleResult();
          }
        } catch (err) {
          handleError(err);
        }
      };

      return {
        status,
        execute,
        lastError: errors[actionKey],
      };
    },
    [states, errors, showToast],
  );

  const isAnyLoading = loadingRef.current.size > 0;

  return { getAction, isAnyLoading };
}

/* ── Standalone helper (non-hook, for one-shot calls) ── */
export async function runPlanAction(
  opts: RunPlanActionOptions & { showToast: ShowToast },
): Promise<boolean> {
  const { showToast: toast, loadingText, successText, errorText, run } = opts;

  if (loadingText) toast(loadingText, "info", 6000);

  try {
    await run();
    toast(successText, "success");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    toast(errorText ?? `操作失败：${message}`, "error");
    return false;
  }
}
