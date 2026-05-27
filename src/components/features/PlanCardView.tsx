import type { PlanningOption, PlanningExecutableAction } from "../../lib/api";
import styles from "../../pages/FeaturesPage.module.scss";

/* ── Plan Card ── */
export function PlanCardView({
  plan,
  selected,
  onSelect,
  planActions,
  onExecuteAction,
  busyActionId,
}: {
  plan: PlanningOption;
  selected: boolean;
  onSelect: (id: string) => void;
  planActions?: PlanningExecutableAction[];
  onExecuteAction?: (action: PlanningExecutableAction) => void;
  busyActionId?: string | null;
}) {
  return (
    <div className={styles.planCard}>
      <div className={styles.planCardTitle}>{plan.title}</div>
      {plan.summary && (
        <div className={styles.planCardReason}>{plan.summary}</div>
      )}

      {plan.timeline.length > 0 && (
        <ul className={styles.planCardTimeline}>
          {plan.timeline.map((step) => (
            <li key={step.id}>
              {step.startTime}–{step.endTime} {step.title}
              {step.poiName ? ` · ${step.poiName}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.planCardMeta}>
        {plan.totalCostMin > 0 && (
          <span className={`${styles.planMetaTag} ${styles.planMetaTagBudget}`}>
            ¥{plan.totalCostMin}–{plan.totalCostMax}
          </span>
        )}
        {plan.walkingKm && plan.walkingKm > 0 && (
          <span className={`${styles.planMetaTag} ${styles.planMetaTagRoute}`}>
            步行 {plan.walkingKm}km
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

      <div className={styles.planCardActions}>
        <button
          className={`${styles.actionBtn} ${selected ? styles.actionBtnPrimary : styles.actionBtnSecondary}`}
          onClick={() => onSelect(plan.id)}
        >
          {selected ? "✓ 已选择" : "选这套"}
        </button>
      </div>

      {/* Compact action chips */}
      {planActions && planActions.length > 0 && (
        <div className={styles.actionDock}>
          {planActions.map((action) => (
            <button
              key={action.id}
              className={styles.actionChipBtn}
              disabled={action.status !== "waiting_confirm" || busyActionId === action.id}
              onClick={() => onExecuteAction?.(action)}
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
                <span className={styles.actionChipTitle}>{action.title}</span>
                {action.description && <span className={styles.actionChipDesc}>{action.description}</span>}
              </span>
              {action.priceEstimate && (
                <span className={styles.actionChipPrice}>{action.priceEstimate}</span>
              )}
              {busyActionId === action.id && (
                <span className={styles.actionChipStatus} style={{ color: "#E6A817" }}>…</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
