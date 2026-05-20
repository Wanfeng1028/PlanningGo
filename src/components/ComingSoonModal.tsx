import { X, Code2 } from "lucide-react";
import styles from "./AuthModal.module.scss";

interface ComingSoonModalProps {
  onClose: () => void;
}

export function ComingSoonModal({ onClose }: ComingSoonModalProps) {
  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.authCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coming-soon-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          className={styles.authClose}
          type="button"
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <span className={styles.modePill}>开发者中心</span>

        <div className={styles.authHeader}>
          <div style={{ marginBottom: 16 }}>
            <Code2 size={48} />
          </div>
          <h2 className={styles.authTitle} id="coming-soon-title">
            开发者模式
          </h2>
          <p className={styles.authSubtitle}>
            稍后开放，敬请期待
          </p>
        </div>

        <div className={styles.authForm}>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.65, margin: 0 }}>
            我们正在精心打磨 API 管理、Webhook 和调试工具等能力，上线后会第一时间通知你。
          </p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {["API Key 与 Webhook 管理", "请求日志与沙箱调试", "开放平台接入与文档"].map((item) => (
              <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--color-text-secondary)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-brand)", flexShrink: 0 }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
