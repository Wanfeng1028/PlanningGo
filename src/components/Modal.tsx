import { useEffect } from "react";
import { X } from "lucide-react";
import { modalContent } from "../data/modals";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { ModalKey } from "../types";
import { Button } from "./Button";
import styles from "./Modal.module.scss";

interface ModalProps {
  modal: ModalKey | null;
  onClose: () => void;
  onPrimary?: () => void;
  onSecondary?: () => void;
}

export function Modal({ modal, onClose, onPrimary, onSecondary }: ModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(!!modal);

  useEffect(() => {
    if (!modal) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = prev;
    };
  }, [modal, onClose]);

  if (!modal) {
    return null;
  }

  const content = modalContent[modal];

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
        ref={trapRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <span className={styles.eyebrow}>{content.eyebrow}</span>
          <button className={styles.close} type="button" aria-label="关闭弹窗" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={styles.body}>
          <h2 className={styles.title} id="modal-title">
            {content.title}
          </h2>
          <p className={styles.copy}>{content.body}</p>
          <ul className={styles.list}>
            {content.bullets.map((item) => (
              <li key={item}>
                <span className={styles.dot} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <Button onClick={onPrimary ?? onClose}>{content.primary}</Button>
            <Button variant="ghost" onClick={onSecondary ?? onClose}>
              {content.secondary}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
