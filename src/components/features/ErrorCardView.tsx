import { useState } from "react";
import { WorkspaceModal } from "../../components/WorkspaceModal";
import styles from "../../pages/FeaturesPage.module.scss";

/* ── Error Card (inside message stream) ── */
export function ErrorCardView({
  message,
  onRetry,
  onNew,
}: {
  message: string;
  onRetry: () => void;
  onNew: () => void;
}) {
  const [showHint, setShowHint] = useState(false);
  const isNetworkError =
    message.includes("无法连接") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError");

  return (
    <>
      <div className={styles.errorCard}>
        <div className={styles.errorCardTitle}>
          {isNetworkError ? "⚠ 规划服务暂时不可用" : "⚠ 出了点问题"}
        </div>
        <div className={styles.errorCardMessage}>{message}</div>

        <div className={styles.errorCardActions}>
          <button
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={onRetry}
          >
            重试
          </button>
          {isNetworkError && (
            <button
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              onClick={() => setShowHint(true)}
            >
              查看启动说明
            </button>
          )}
          <button
            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            onClick={onNew}
          >
            新一轮
          </button>
        </div>
      </div>

      {/* Startup Instructions Modal */}
      <WorkspaceModal
        open={showHint}
        onClose={() => setShowHint(false)}
        title="本地服务启动说明"
        subtitle="确保前后端服务正常运行"
        width="sm"
      >
        <div className={styles.startupSteps}>
          <div className={styles.startupStep}>
            <span className={styles.startupStepNum}>1</span>
            <div className={styles.startupStepContent}>
              <strong>启动后端服务</strong>
              <code>npm run dev:api</code>
            </div>
          </div>
          <div className={styles.startupStep}>
            <span className={styles.startupStepNum}>2</span>
            <div className={styles.startupStepContent}>
              <strong>启动前端服务</strong>
              <code>npm run dev</code>
            </div>
          </div>
          <div className={styles.startupStep}>
            <span className={styles.startupStepNum}>3</span>
            <div className={styles.startupStepContent}>
              <strong>环境配置</strong>
              <span>在 .env.local 中设置</span>
              <code>VITE_API_BASE=http://127.0.0.1:3001</code>
            </div>
          </div>
        </div>
        <div className={styles.startupActions}>
          <button
            className={styles.startupBtn}
            onClick={() => setShowHint(false)}
          >
            知道了
          </button>
        </div>
      </WorkspaceModal>
    </>
  );
}
