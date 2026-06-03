/**
 * Connector Registry — 注册和管理所有外部服务连接器
 * V3: 统一外部服务访问入口，支持 fallback 到 mock
 */

import type { ConnectorCapability, ConnectorRegistry, ServiceConnector } from "./types.js";

class DefaultConnectorRegistry implements ConnectorRegistry {
  private connectors: Map<string, ServiceConnector> = new Map();

  get(provider: string): ServiceConnector | undefined {
    return this.connectors.get(provider);
  }

  register(connector: ServiceConnector): void {
    this.connectors.set(connector.provider, connector);
  }

  getAll(): ServiceConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * 按 capability 过滤 connectors
   */
  findByCapability(capability: string | ConnectorCapability): ServiceConnector[] {
    return this.getAll().filter((c) => c.capabilities.includes(capability as ConnectorCapability));
  }
}

let registryInstance: ConnectorRegistry | null = null;

export function getConnectorRegistry(): ConnectorRegistry {
  if (!registryInstance) {
    registryInstance = new DefaultConnectorRegistry();
  }
  return registryInstance;
}

/**
 * 重置 registry（用于测试）
 */
export function resetConnectorRegistry(): void {
  registryInstance = null;
}
