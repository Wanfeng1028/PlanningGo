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
    message.includes("NetworkError") ||
    message.includes("ERR_CONNECTION");

  const isServerError =
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("服务") ||
    message.includes("server");

  const isTimeout =
    message.includes("超时") ||
    message.includes("timeout") ||
    message.includes("TIMEOUT") ||
    message.includes("abort");

  // Show user-friendly message, never raw error
  const friendlyTitle = isNetworkError
    ? "⚠ 规划服务暂时不可用"
    : isTimeout
      ? "⚠ 请求超时了"
      : isServerError
        ? "⚠ 服务出了点问题"
        : "⚠ 出了点问题";

  const friendlyMessage = isNetworkError
    ? "无法连接到规划服务，请确认后端是否已启动。"
    : isTimeout
      ? "请求等待时间过长，服务可能正在忙碌，请稍后重试。"
      : isServerError
        ? "模型服务暂时不可用，已记录错误，请稍后重试。"
        : "遇到了一个意外问题，请重试或开始新的规划。";

  return (
    <>
      <div className={styles.errorCard}>
        <div className={styles.errorCardTitle}>{friendlyTitle}</div>
        <div className={styles.errorCardMessage}>{friendlyMessage}</div>

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
