import { useEffect, useCallback, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./FeatureModal.module.scss";

/* ── 全屏玻璃 Modal ── */
interface FeatureModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** 危险操作确认时点击遮罩不关闭 */
  danger?: boolean;
  width?: "sm" | "md" | "lg";
}

export function FeatureModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  danger,
  width = "md",
}: FeatureModalProps) {
  /* Esc 关闭 */
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

  if (!open) return null;

  const sizeClass =
    width === "sm" ? styles.modalSm : width === "lg" ? styles.modalLg : "";

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={danger ? undefined : onClose}
    >
      {/* 背景光球 */}
      <div className={styles.overlayOrb1} aria-hidden="true" />
      <div className={styles.overlayOrb2} aria-hidden="true" />

      <section
        className={`${styles.modal} ${sizeClass}`}
        role="dialog"
        aria-modal="true"
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
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>{title}</h2>
            {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
          </div>
        )}

        <div className={styles.modalBody}>{children}</div>
      </section>
    </div>
  );
}

/* ── 轻量 Popover（无遮罩，用于菜单/选择器） ── */
interface FeaturePopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  anchorRef?: React.RefObject<HTMLElement | null>;
  position?: "above" | "below";
}

export function FeaturePopover({
  open,
  onClose,
  children,
}: FeaturePopoverProps) {
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

  if (!open) return null;

  return (
    <>
      <div className={styles.popoverBackdrop} onMouseDown={onClose} />
      <div className={styles.popover} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </>
  );
}

/* ── Popover 菜单项 ── */
interface PopoverItemProps {
  icon?: string;
  label: string;
  desc?: string;
  active?: boolean;
  check?: boolean;
  onClick: () => void;
}

export function PopoverItem({
  icon,
  label,
  desc,
  active,
  check,
  onClick,
}: PopoverItemProps) {
  return (
    <button
      className={`${styles.popoverItem} ${active ? styles.popoverItemActive : ""}`}
      onClick={onClick}
    >
      {icon && <span className={styles.popoverItemIcon}>{icon}</span>}
      <span className={styles.popoverItemContent}>
        <span className={styles.popoverItemLabel}>{label}</span>
        {desc && <span className={styles.popoverItemDesc}>{desc}</span>}
      </span>
      {check && <span className={styles.popoverItemCheck}>✓</span>}
    </button>
  );
}

/* ── 确认按钮组 ── */
interface ConfirmActionsProps {
  cancelLabel?: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmActions({
  cancelLabel = "取消",
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: ConfirmActionsProps) {
  return (
    <div className={styles.confirmActions}>
      <button
        className={styles.btnSecondary}
        type="button"
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
      <button
        className={danger ? styles.btnDanger : styles.btnPrimary}
        type="button"
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
