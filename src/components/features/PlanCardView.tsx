import type { PlanningOption, PlanningExecutableAction, PlanningAction } from "../../lib/api";
import type { ToastType } from "../GlassToast";
import { formatMatchScore } from "./formatMatchScore";
import styles from "../../pages/FeaturesPage.module.scss";
import { PlanCardServicePanel } from "./ExternalServicePanel";

type OnToast = (text: string, type?: ToastType) => void;
type OnTrackAction = (payload: {
  conversationId?: string;
  planId?: string;
  stepId: string;
  actionType: string;
  label: string;
  provider: string;
}) => void;
type OnShowDraft = (action: { id: string; provider: string; actionType: string; title: string; description: string; poiName?: string; recommendedItems?: Array<{ name: string; quantity: number; estimatedPrice?: number }>; estimatedTotalPrice?: number; priceNote?: string; riskNotice: string; copyText?: string }) => void;

/* ── Plan Card — structured view ── */
export function PlanCardView({
  plan,
  selected,
  onSelect,
  onAdjustPlan,
  onGenerateCalendar,
  onSavePlan,
  onViewReservations,
  onOpenNavigation,
  onToast,
  planActions,
  onExecuteAction,
  busyActionId,
  unifiedActions,
  onUnifiedAction,
  onTrackAction,
  onShowDraft,
  conversationId,
}: {
  plan: PlanningOption;
  selected: boolean;
  onSelect: (id: string) => void;
  onAdjustPlan?: (plan: PlanningOption) => void;
  onGenerateCalendar?: (plan: PlanningOption) => void;
  onSavePlan?: (plan: PlanningOption) => void;
  onViewReservations?: (plan: PlanningOption) => void;
  onOpenNavigation?: (plan: PlanningOption) => void;
  onToast?: OnToast;
  planActions?: PlanningExecutableAction[];
  onExecuteAction?: (action: PlanningExecutableAction) => void;
  busyActionId?: string | null;
  unifiedActions?: PlanningAction[];
  onUnifiedAction?: (action: PlanningAction) => void;
  onTrackAction?: OnTrackAction;
  onShowDraft?: OnShowDraft;
  conversationId?: string;
}) {
  /** Fallback toast when parent doesn't provide a callback */
  const fallback = (text: string) => {
    if (onToast) onToast(text, "info");
    else console.info("[PlanCardView]", text);
  };
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
          <span className={styles.planCardScore}>{formatMatchScore(plan.score)} 匹配</span>
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
              {/* Phase 2: description / cost / bookingHint (optional, render when present) */}
              {step.description && (
                <span className={styles.timelineDesc}>{step.description}</span>
              )}
              {step.estimatedCost && (
                <span className={styles.timelineCost}>💰 {step.estimatedCost}</span>
              )}
              {step.bookingHint && (
                <span className={styles.bookingHint}>🎫 {step.bookingHint}</span>
              )}
              {/* Suggestions chips (optional) */}
              {step.suggestions?.map((s, i) => (
                <span key={i} className={styles.suggestionChip}>💡 {s}</span>
              ))}
              {/* V3: service actions — external service entrances */}
              {step.serviceActions && step.serviceActions.length > 0 && (
                <PlanCardServicePanel
                  stepId={step.id}
                  serviceActions={step.serviceActions}
                  conversationId={conversationId}
                  planId={plan.planId}
                  onTrack={onTrackAction}
                  onShowDraft={onShowDraft}
                />
              )}
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
        {/* Select plan */}
        <button
          className={`${styles.actionBtn} ${selected ? styles.actionBtnPrimary : styles.actionBtnSecondary}`}
          onClick={() => onSelect(plan.id)}
          disabled={selected}
        >
          {selected ? "✓ 已选择" : "选这套方案"}
        </button>

        {/* Continue adjusting — input box focus + prefill */}
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => {
            if (onAdjustPlan) onAdjustPlan(plan);
            else fallback("功能开发中");
          }}
          title="继续调整此方案"
        >
          ✏️ 继续调整
        </button>

        {/* Generate calendar — confirm dialog → download ICS */}
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => {
            if (onGenerateCalendar) onGenerateCalendar(plan);
            else fallback("日历功能开发中");
          }}
          title="生成日历提醒"
        >
          📅 生成日历
        </button>

        {/* Save plan — API call + toast */}
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => {
            if (onSavePlan) onSavePlan(plan);
            else fallback("保存功能开发中");
          }}
          title="保存方案"
        >
          💾 保存方案
        </button>

        {/* Share — works now */}
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => {
            const text = `${plan.title}\n${plan.timeline.map(t => `${t.startTime}–${t.endTime} ${t.title}`).join("\n")}`;
            if (navigator.share) {
              navigator.share({ title: plan.title, text }).catch(() => {});
            } else {
              navigator.clipboard.writeText(text);
              onToast?.("已复制到剪贴板", "success");
            }
          }}
          title="分享方案"
        >
          📤 分享
        </button>

        {/* Open navigation — coordinate fallback */}
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => {
            if (onOpenNavigation) onOpenNavigation(plan);
            else fallback("导航功能开发中");
          }}
          title="打开高德导航"
        >
          🧭 打开导航
        </button>

        {/* View reservations — modal */}
        {plan.timeline.some((s) => s.bookingNeeded) && (
          <button
            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            onClick={() => {
              if (onViewReservations) onViewReservations(plan);
              else fallback("预约功能开发中");
            }}
            title="查看需要预约的步骤"
          >
            🎫 查看预约建议
          </button>
        )}
      </div>

      {/* Compact action chips */}
      {planActions && planActions.length > 0 && (
        <div className={styles.actionDock}>
          {planActions.map((action) => {
            // Mark unimplemented actions as coming soon
            // All action types are now implemented — no disabled chips
            const implemented = [
              "navigation", "calendar_event", "add_to_calendar", "share_message", "memory_save",
              "book_restaurant", "reserve_activity", "book_hotel", "book_transport", "buy_ticket",
            ].includes(action.type);
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

