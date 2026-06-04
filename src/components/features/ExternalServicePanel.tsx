import type { ServiceActionDraft } from "../../server/modules/connectors/types";

// ============================================================================
// ServiceActionBtn — 单个服务入口按钮
// ============================================================================

interface ServiceActionBtnProps {
  action: ServiceActionDraft;
  onTrack: (action: ServiceActionDraft) => void;
  onShowDraft?: (action: ServiceActionDraft) => void;
}

/**
 * 行为规则：
 * - 有 redirectUrl：弹确认弹窗 → window.open
 * - 有 copyText：复制到剪贴板
 * - 都没有：toast 提示"当前平台暂未接入，已为你保留下单信息"
 */
function ServiceActionBtn({ action, onTrack, onShowDraft }: ServiceActionBtnProps) {
  const handleClick = async () => {
    onTrack(action);

    // 优先使用 onShowDraft 处理 food_delivery / coffee_order 等需要展示草稿的 action
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
      }
    } else if (action.copyText) {
      try {
        await navigator.clipboard.writeText(action.copyText);
      } catch {
        console.error("Failed to copy to clipboard");
      }
    }
  };

  return (
    <button
      className="service-action-btn"
      onClick={handleClick}
      title={`${action.description}\n${action.riskNotice}`}
    >
      <span className="service-action-icon">{getActionIcon(action)}</span>
      <span className="service-action-label">{action.title}</span>
    </button>
  );
}

function getActionIcon(action: ServiceActionDraft): string {
  switch (action.actionType) {
    case "restaurant_reservation":
      return "🍽️";
    case "group_buy":
      return "🎫";
    case "food_delivery":
      return "🛵";
    case "coffee_order":
      return "☕";
    case "movie_ticket":
      return "🎬";
    case "navigation":
      return "🧭";
    case "calendar_event":
      return "📅";
    case "copy_booking_info":
      return "📋";
    default:
      return "🔗";
  }
}

// ============================================================================
// ExternalServicePanel — 折叠面板（旧接口，兼容 PlanCardView 使用）
// ============================================================================

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
          🔗 外部服务 ({steps.length})
        </summary>
        <div className="external-service-body">
          {steps.map((step) => (
            <div key={step.stepId} className="external-service-group">
              <div className="external-service-poi">📍 {step.poiName}</div>
              <div className="external-service-links">
                {step.links.map((link) => (
                  <a
                    key={link.provider}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="external-service-link"
                  >
                    {link.icon} {link.label}
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

// ============================================================================
// PlanCardServicePanel — 挂载到 PlanCardView 的 timeline step 上
// ============================================================================

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
}

export function PlanCardServicePanel({
  stepId,
  serviceActions,
  conversationId,
  planId,
  onTrack,
  onShowDraft,
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
    <div className="plan-card-service-panel">
      <details className="service-actions-details">
        <summary className="service-actions-summary">
          🔗 外部服务入口 ({serviceActions.length})
        </summary>
        <div className="service-actions-body">
          {serviceActions.map((action) => (
            <ServiceActionBtn
              key={action.id}
              action={action}
              onTrack={handleTrack}
              onShowDraft={onShowDraft}
            />
          ))}
        </div>
      </details>
    </div>
  );
}
