/**
 * Meituan Connector — 美团/大众点评连接器
 * V3: 提供餐厅搜索、预约、团购能力
 *
 * 当前状态: 占位实现，返回 deep link 供前端跳转
 * 后续: 对接美团开放平台 API
 *
 * 依赖: MEITUAN_API_KEY 环境变量（可选）
 *
 * 文案规范: 只写"去美团查看/去预约"，绝不写"已预约/已购买/预约成功"
 */

import type {
  ConnectorCapability,
  ConnectorProvider,
  ConnectorSearchInput,
  ConnectorSearchResult,
  QuoteInput,
  QuoteResult,
  PreparedAction,
  CommitResult,
  ServiceConnector,
} from "../types.js";

const PROVIDER: ConnectorProvider = "meituan";

const CAPABILITIES: ConnectorCapability[] = [
  "restaurant_search",
  "restaurant_reservation",
  "group_buy",
  "payment_redirect",
];

// ============================================================================
// POI 搜索 — 占位（返回 mock 数据，后续对接美团 API）
// ============================================================================

async function searchPoi(
  _input: ConnectorSearchInput,
): Promise<ConnectorSearchResult[]> {
  // TODO: 对接美团开放平台 API
  // https://open.meituan.com/api/doc?method=restaurant.search
  return [];
}

// ============================================================================
// Quote / Prepare / Commit — 占位，返回 deep link
// V3: 所有文案明确第三方确认，不模拟成功
// ============================================================================

function quote(_input: QuoteInput): Promise<QuoteResult> {
  return Promise.resolve({
    quoteId: `mt-quote-${Date.now()}`,
    provider: PROVIDER,
    actionType: _input.actionType,
    status: "unknown",
    warnings: ["美团 API 未配置，使用 deep link 跳转"],
  });
}

function prepare(input: QuoteInput): Promise<PreparedAction> {
  const poi = input.poi;
  const items = input.items;
  const serviceName = items?.[0]?.name || poi?.name || "服务";

  // 生成美团 deep link（通用格式，需根据实际业务调整）
  const deepLink = poi?.sourceUrl || `https://www.meituan.com/search/${encodeURIComponent(poi?.name || serviceName)}`;

  return Promise.resolve({
    preparedActionId: `mt-prepared-${Date.now()}`,
    provider: PROVIDER,
    actionType: input.actionType,
    status: "redirect_required",
    title: serviceName,
    description: `请在美团 App 中完成: ${serviceName} 的查看和预约`,
    confirmText: "去美团确认",
    redirectUrl: deepLink,
    payload: {
      provider: "meituan",
      actionType: input.actionType,
      poi: poi ? { name: poi.name, address: poi.address } : undefined,
      items: items?.map((i) => ({ name: i.name, quantity: i.quantity })) || [],
    },
  });
}

function commit(_id: string): Promise<CommitResult> {
  return Promise.resolve({
    provider: PROVIDER,
    actionType: "meituan_service",
    status: "redirected_to_payment",
    message: "已跳转到美团，请在 App 中完成查看和预约",
  });
}

// ============================================================================
// Export Connector
// ============================================================================

export const meituanConnector: ServiceConnector = {
  provider: PROVIDER,
  capabilities: CAPABILITIES,
  search: searchPoi,
  quote,
  prepare,
  commit,
};
