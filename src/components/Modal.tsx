import { X } from "lucide-react";
import { modalContent } from "../data/modals";
import type { ModalKey } from "../types";
import { Button } from "./Button";
import styles from "./Modal.module.scss";

interface ModalProps {
  modal: ModalKey | null;
  onClose: () => void;
}

export function Modal({ modal, onClose }: ModalProps) {
  if (!modal) {
    return null;
  }

  const content = modalContent[modal];

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
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
            <Button onClick={onClose}>{content.primary}</Button>
            <Button variant="ghost" onClick={onClose}>
              {content.secondary}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
