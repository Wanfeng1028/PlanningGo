import type { PlanningOption, PlanningExecutableAction, PlanningAction } from "../../lib/api";
import styles from "../../pages/FeaturesPage.module.scss";

/* ── Plan Card — structured view ── */
export function PlanCardView({
  plan,
  selected,
  onSelect,
  planActions,
  onExecuteAction,
  busyActionId,
  unifiedActions,
  onUnifiedAction,
}: {
  plan: PlanningOption;
  selected: boolean;
  onSelect: (id: string) => void;
  planActions?: PlanningExecutableAction[];
  onExecuteAction?: (action: PlanningExecutableAction) => void;
  busyActionId?: string | null;
  unifiedActions?: PlanningAction[];
  onUnifiedAction?: (action: PlanningAction) => void;
}) {
  // Format duration nicely
  const formatDuration = (minutes: number) => {
    if (minutes <= 0) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}分钟`;
    if (m === 0) return `${h}小时`;
    return `${h}小时${m}分钟`;
  };

  const duration = formatDuration(plan.totalDurationMinutes);

  return (
    <div className={`${styles.planCard} ${selected ? styles.planCardSelected : ""}`}>
      {/* Header: title + score */}
      <div className={styles.planCardHeader}>
        <div className={styles.planCardTitle}>{plan.title}</div>
        {plan.score > 0 && (
          <span className={styles.planCardScore}>{Math.round(plan.score * 100)}%匹配</span>
        )}
      </div>

      {/* Target group */}
      {plan.targetGroup && (
        <div className={styles.planCardTarget}>
          👥 适合：{plan.targetGroup}
        </div>
      )}

      {/* Summary */}
      {plan.summary && (
        <div className={styles.planCardReason}>{plan.summary}</div>
      )}

      {/* Timeline */}
      {plan.timeline.length > 0 && (
        <ul className={styles.planCardTimeline}>
          {plan.timeline.map((step) => (
            <li key={step.id}>
              <span className={styles.timelineTime}>{step.startTime}–{step.endTime}</span>
              <span className={styles.timelineTitle}>{step.title}</span>
              {step.poiName && <span className={styles.timelinePoi}>· {step.poiName}</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Meta tags */}
      <div className={styles.planCardMeta}>
        {duration && (
          <span className={`${styles.planMetaTag} ${styles.planMetaTagRoute}`}>
            ⏱ {duration}
          </span>
        )}
        {plan.totalCostMin > 0 && (
          <span className={`${styles.planMetaTag} ${styles.planMetaTagBudget}`}>
            💰 ¥{plan.totalCostMin}–{plan.totalCostMax}
          </span>
        )}
        {plan.walkingKm && plan.walkingKm > 0 && (
          <span className={`${styles.planMetaTag} ${styles.planMetaTagRoute}`}>
            🚶 步行 {plan.walkingKm}km
          </span>
        )}
        {plan.risks.map((r) => (
          <span
            key={r}
            className={`${styles.planMetaTag} ${styles.planMetaTagRisk}`}
          >
            ⚠ {r}
          </span>
        ))}
        {plan.highlights.map((h) => (
          <span
            key={h}
            className={`${styles.planMetaTag} ${styles.planMetaTagDefault}`}
          >
            ✦ {h}
          </span>
        ))}
      </div>

      {/* Backup plan hint */}
      {plan.backupPlan && (
        <div className={styles.planCardBackup}>
          🔄 备选：{plan.backupPlan}
        </div>
      )}

      {/* Assumptions */}
      {plan.assumptions && plan.assumptions.length > 0 && (
        <div className={styles.planCardAssumptions}>
          {plan.assumptions.map((a, i) => (
            <span key={i} className={styles.assumptionTag}>📋 {a}</span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className={styles.planCardActions}>
        <button
          className={`${styles.actionBtn} ${selected ? styles.actionBtnPrimary : styles.actionBtnSecondary}`}
          onClick={() => onSelect(plan.id)}
        >
          {selected ? "✓ 已选择" : "选这套方案"}
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => onSelect(plan.id)}
          title="继续调整此方案"
        >
          继续调整
        </button>
        {/* Calendar — implemented */}
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => {
            // Trigger calendar generation via parent
            onSelect(plan.id);
          }}
          title="添加到日历"
        >
          📅 生成日历
        </button>
        {/* Share — implemented */}
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => {
            const text = `${plan.title}\n${plan.timeline.map(t => `${t.startTime}–${t.endTime} ${t.title}`).join("\n")}`;
            if (navigator.share) {
              navigator.share({ title: plan.title, text }).catch(() => {});
            } else {
              navigator.clipboard.writeText(text);
            }
          }}
          title="分享方案"
        >
          📤 分享
        </button>
      </div>

      {/* Compact action chips */}
      {planActions && planActions.length > 0 && (
        <div className={styles.actionDock}>
          {planActions.map((action) => {
            // Mark unimplemented actions as coming soon
            const implemented = ["navigation", "calendar_event", "add_to_calendar", "share_message", "memory_save"].includes(action.type);
            const isComingSoon = !implemented && action.status === "waiting_confirm";

            return (
              <button
                key={action.id}
                className={`${styles.actionChipBtn} ${isComingSoon ? styles.actionChipDisabled : ""}`}
                disabled={action.status !== "waiting_confirm" || busyActionId === action.id || isComingSoon}
                onClick={() => onExecuteAction?.(action)}
                title={isComingSoon ? "即将支持" : undefined}
              >
                <span className={styles.actionChipIcon}>{
                  action.type === "book_hotel" ? "🏨" :
                  action.type === "book_restaurant" ? "🍽️" :
                  action.type === "book_transport" ? "🚆" :
                  action.type === "buy_ticket" ? "🎫" :
                  action.type === "reserve_activity" ? "🎯" :
                  action.type === "add_to_calendar" ? "📅" :
                  action.type === "set_reminder" ? "⏰" : "✅"
                }</span>
                <span className={styles.actionChipBody}>
                  <span className={styles.actionChipTitle}>
                    {action.title}
                    {isComingSoon && <span className={styles.comingSoonBadge}>即将支持</span>}
                  </span>
                  {action.description && <span className={styles.actionChipDesc}>{action.description}</span>}
                </span>
                {action.priceEstimate && (
                  <span className={styles.actionChipPrice}>{action.priceEstimate}</span>
                )}
                {busyActionId === action.id && (
                  <span className={styles.actionChipStatus} style={{ color: "#E6A817" }}>…</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Unified planning actions */}
      {unifiedActions && unifiedActions.length > 0 && (
        <div className={styles.actionDock}>
          {unifiedActions.map((action, idx) => (
            <button
              key={`${action.type}-${idx}`}
              className={styles.actionChipBtn}
              onClick={() => onUnifiedAction?.(action)}
            >
              <span className={styles.actionChipIcon}>
                {action.type === "map_search" ? "🗺️" :
                 action.type === "navigation" ? "🧭" :
                 action.type === "copy_text" ? "📋" :
                 action.type === "calendar" ? "📅" :
                 action.type === "mobile_handoff" ? "📱" :
                 action.type === "open_url" ? "🔗" : "⚡"}
              </span>
              <span className={styles.actionChipBody}>
                <span className={styles.actionChipTitle}>{action.label}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

