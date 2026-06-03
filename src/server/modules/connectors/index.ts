/**
 * Connector 初始化 — 注册所有外部服务连接器
 * V3: 在 server 启动时调用 initConnectors()
 */

import { getConnectorRegistry } from "./registry.js";
import { amapConnector } from "./amap/amapConnector.js";
import { calendarConnector } from "./calendar/calendarConnector.js";
import { meituanConnector } from "./meituan/meituanConnector.js";

export function initConnectors(): void {
  const registry = getConnectorRegistry();

  registry.register(amapConnector);
  registry.register(calendarConnector);
  registry.register(meituanConnector);
}

export { getConnectorRegistry } from "./registry.js";
export type {
  ConnectorProvider,
  ConnectorCapability,
  ConnectorSearchInput,
  ConnectorSearchResult,
  QuoteInput,
  QuoteResult,
  PreparedAction,
  CommitResult,
  ServiceConnector,
  ConnectorRegistry,
} from "./types.js";
