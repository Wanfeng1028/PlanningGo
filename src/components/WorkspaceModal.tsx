import { useEffect, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./WorkspaceModal.module.scss";

interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  width?: "sm" | "md" | "lg";
  /** 危险操作确认时点击遮罩不关闭 */
  danger?: boolean;
}

export function WorkspaceModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "md",
  danger,
}: WorkspaceModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* ── Esc 关闭 ── */
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  /* ── 锁定背景滚动 ── */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ── 焦点管理：打开时聚焦 panel，关闭时恢复 ── */
  useEffect(() => {
    if (!open) return;
    const timer = requestAnimationFrame(() => {
      panelRef.current?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, [open]);

  if (!open) return null;

  const sizeClass =
    width === "sm" ? styles.panelSm : width === "lg" ? styles.panelLg : "";

  return createPortal(
    <div
      className={styles.layer}
      role="presentation"
      onMouseDown={danger ? undefined : onClose}
    >
      <div
        ref={panelRef}
        className={`${styles.panel} ${sizeClass}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          className={styles.closeBtn}
          type="button"
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        {title && (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        )}

        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
