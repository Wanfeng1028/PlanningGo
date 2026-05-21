import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import styles from "./GlassToast.module.scss";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  text: string;
  type: ToastType;
  duration?: number;
}

interface GlassToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const ICON_CLASS = {
  success: styles.iconSuccess,
  error: styles.iconError,
  info: styles.iconInfo,
} as const;

const PROGRESS_CLASS = {
  success: styles.progressSuccess,
  error: styles.progressError,
  info: styles.progressInfo,
} as const;

export function GlassToast({ toast, onDismiss }: GlassToastProps) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, 240);
  }, [onDismiss]);

  useEffect(() => {
    if (!toast) return;
    setExiting(false);
    const duration = toast.duration ?? 2800;
    timerRef.current = setTimeout(dismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, [toast, dismiss]);

  if (!toast) return null;

  const Icon = ICONS[toast.type];

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={`${styles.card} ${exiting ? styles.cardExit : ""}`}>
        <span className={`${styles.icon} ${ICON_CLASS[toast.type]}`}>
          <Icon size={16} />
        </span>
        <span className={styles.text}>{toast.text}</span>
        <button
          type="button"
          className={styles.close}
          aria-label="关闭"
          onClick={dismiss}
        >
          <X size={14} />
        </button>
        <div className={styles.progress}>
          <div
            className={`${styles.progressBar} ${PROGRESS_CLASS[toast.type]}`}
            style={{ animationDuration: `${toast.duration ?? 2800}ms` }}
          />
        </div>
      </div>
    </div>
  );
}

/** 便捷 hook：返回 [currentToast, showToast] */
let _toastId = 0;
export function useGlassToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((text: string, type: ToastType = "success", duration?: number) => {
    clearTimeout(timerRef.current);
    const id = String(++_toastId);
    setToast({ id, text, type, duration });
  }, []);

  const dismiss = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, show, dismiss } as const;
}
