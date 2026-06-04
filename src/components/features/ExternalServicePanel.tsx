import type { ServiceActionDraft } from "../../server/modules/connectors/types";
import type { ToastType } from "../GlassToast";
import styles from "../../pages/FeaturesPage.module.scss";

interface ServiceActionBtnProps {
  action: ServiceActionDraft;
  onTrack: (action: ServiceActionDraft) => void;
  onShowDraft?: (action: ServiceActionDraft) => void;
  onToast?: (text: string, type?: ToastType) => void;
}

const ACTION_LABEL: Record<string, string> = {
  restaurant_reservation: "预约",
  group_buy: "团购",
  food_delivery: "下单草稿",
  coffee_order: "点单草稿",
  movie_ticket: "购票",
  navigation: "导航",
  calendar_event: "日历",
  copy_booking_info: "复制",
};

function getActionLabel(action: ServiceActionDraft): string {
  return ACTION_LABEL[action.actionType] ?? "服务";
}

function ServiceActionBtn({ action, onTrack, onShowDraft, onToast }: ServiceActionBtnProps) {
  const handleClick = async () => {
    onTrack(action);

    if (
      onShowDraft &&
      (action.actionType === "food_delivery" || action.actionType === "coffee_order")
    ) {
      onShowDraft(action);
      return;
    }

    if (action.redirectUrl) {
      const confirmed = window.confirm(
        `即将跳转到第三方平台，请在对方页面确认价格、库存和支付。\n\n${action.riskNotice}`,
      );
      if (confirmed) {
        window.open(action.redirectUrl, "_blank", "noopener,noreferrer");
        onToast?.("已打开第三方平台，请在对方页面确认", "info");
      } else {
        onToast?.("已取消跳转", "info");
      }
      return;
    }

    if (action.copyText) {
      try {
        await navigator.clipboard.writeText(action.copyText);
        onToast?.("已复制服务信息", "success");
      } catch {
        onToast?.("复制失败，请手动复制", "error");
      }
      return;
    }

    onToast?.("当前平台暂未接入，已为你保留操作信息", "info");
  };

  return (
    <button
      className={styles.serviceActionBtn}
      onClick={handleClick}
      title={`${action.description}\n${action.riskNotice}`}
    >
      <span className={styles.serviceActionIcon}>{getActionLabel(action)}</span>
      <span className={styles.serviceActionLabel}>{action.title}</span>
    </button>
  );
}

interface DeepLink {
  provider: string;
  label: string;
  url: string;
  icon: string;
}

interface ExternalServiceStep {
  stepId: string;
  poiName: string;
  links: DeepLink[];
}

export function ExternalServicePanel({
  steps,
  expanded,
  onToggle,
}: {
  steps: ExternalServiceStep[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="external-service-panel">
      <details className="external-service-details" open={expanded}>
        <summary className="external-service-summary" onClick={onToggle}>
          外部服务 ({steps.length})
        </summary>
        <div className="external-service-body">
          {steps.map((step) => (
            <div key={step.stepId} className="external-service-group">
              <div className="external-service-poi">{step.poiName}</div>
              <div className="external-service-links">
                {step.links.map((link) => (
                  <a
                    key={link.provider}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="external-service-link"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

interface PlanCardServicePanelProps {
  stepId: string;
  serviceActions: ServiceActionDraft[];
  conversationId?: string;
  planId?: string;
  onTrack?: (payload: {
    conversationId?: string;
    planId?: string;
    stepId: string;
    actionType: string;
    label: string;
    provider: string;
  }) => void;
  onShowDraft?: (action: ServiceActionDraft) => void;
  onToast?: (text: string, type?: ToastType) => void;
}

export function PlanCardServicePanel({
  stepId,
  serviceActions,
  conversationId,
  planId,
  onTrack,
  onShowDraft,
  onToast,
}: PlanCardServicePanelProps) {
  if (!serviceActions || serviceActions.length === 0) return null;

  const handleTrack = (action: ServiceActionDraft) => {
    onTrack?.({
      conversationId,
      planId,
      stepId,
      actionType: action.actionType,
      label: action.title,
      provider: action.provider,
    });
  };

  return (
    <div className={styles.planCardServicePanel}>
      <details className={styles.serviceActionsDetails} open>
        <summary className={styles.serviceActionsSummary}>
          可执行入口 ({serviceActions.length})
        </summary>
        <div className={styles.serviceActionsBody}>
          {serviceActions.map((action) => (
            <ServiceActionBtn
              key={action.id}
              action={action}
              onTrack={handleTrack}
              onShowDraft={onShowDraft}
              onToast={onToast}
            />
          ))}
        </div>
      </details>
    </div>
  );
}
