import { useState } from "react";

interface OrderDraftItem {
  name: string;
  quantity: number;
  estimatedPrice?: number;
}

interface OrderDraftModalProps {
  /** 是否打开弹窗 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 服务入口 action 数据 */
  action: {
    id: string;
    provider: string;
    actionType: string;
    title: string;
    description: string;
    poiName?: string;
    poiAddress?: string;
    recommendedItems?: OrderDraftItem[];
    estimatedTotalPrice?: number;
    priceNote?: string;
    riskNotice: string;
    copyText?: string;
    redirectUrl?: string;
  };
  /** 复制回调（由父组件处理 clipboard API） */
  onCopy?: () => Promise<void>;
  /** 跳转回调（由父组件处理 prepareServiceAction + window.open） */
  onRedirect?: () => Promise<void>;
}

/**
 * 下单草稿弹窗
 * 展示 AI 帮用户整理好的下单/预约草稿
 */
export function OrderDraftModal({
  open,
  onClose,
  action,
  onCopy,
  onRedirect,
}: OrderDraftModalProps) {
  const [copying, setCopying] = useState(false);

  if (!open) return null;

  const {
    title,
    description,
    poiName,
    poiAddress,
    recommendedItems,
    estimatedTotalPrice,
    priceNote,
    riskNotice,
    copyText,
    redirectUrl,
    provider,
  } = action;

  const totalPrice = estimatedTotalPrice
    ? `¥${estimatedTotalPrice}`
    : priceNote || "待定";

  const handleCopy = async () => {
    if (onCopy) {
      setCopying(true);
      try {
        await onCopy();
      } finally {
        setCopying(false);
      }
    } else if (copyText) {
      setCopying(true);
      try {
        await navigator.clipboard.writeText(copyText);
      } catch {
        console.error("Failed to copy to clipboard");
      } finally {
        setCopying(false);
      }
    }
  };

  const handleRedirect = async () => {
    if (onRedirect) {
      await onRedirect();
    } else if (redirectUrl) {
      window.open(redirectUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="order-draft-modal-overlay" onClick={onClose}>
      <div className="order-draft-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="order-draft-modal-header">
          <h3>{title}</h3>
          <button className="order-draft-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="order-draft-modal-body">
          {/* 门店信息 */}
          {(poiName || poiAddress) && (
            <div className="order-draft-modal-store">
              {poiName && <div className="order-draft-modal-store-name">{poiName}</div>}
              {poiAddress && <div className="order-draft-modal-store-address">{poiAddress}</div>}
              {provider && (
                <div className="order-draft-modal-provider">
                  平台：{provider}
                </div>
              )}
            </div>
          )}

          {/* 描述 */}
          {description && (
            <div className="order-draft-modal-description">{description}</div>
          )}

          {/* 推荐商品清单 */}
          {recommendedItems && recommendedItems.length > 0 && (
            <div className="order-draft-modal-items">
              <h4>推荐商品</h4>
              <table className="order-draft-modal-table">
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>数量</th>
                    <th>预估价格</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendedItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.estimatedPrice ? `¥${item.estimatedPrice}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="order-draft-modal-total">
                预估总价：<strong>{totalPrice}</strong>
              </div>
            </div>
          )}

          {/* 风险提示 */}
          <div className="order-draft-modal-risk">{riskNotice}</div>
        </div>

        {/* Footer */}
        <div className="order-draft-modal-footer">
          {copyText && (
            <button
              className="order-draft-modal-btn order-draft-modal-btn-copy"
              onClick={handleCopy}
              disabled={copying}
            >
              {copying ? "复制中..." : "📋 复制下单信息"}
            </button>
          )}
          {redirectUrl && (
            <button
              className="order-draft-modal-btn order-draft-modal-btn-redirect"
              onClick={handleRedirect}
            >
              🚀 去平台确认
            </button>
          )}
          <button className="order-draft-modal-btn order-draft-modal-btn-close" onClick={onClose}>
            稍后再说
          </button>
        </div>
      </div>
    </div>
  );
}
