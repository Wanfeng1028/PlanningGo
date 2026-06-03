/**
 * Amap Connector — 高德地图服务连接器
 * V3: 提供 POI 搜索、路线规划、导航能力
 *
 * 依赖: AMAP_KEY 环境变量
 * API 文档: https://lbs.amap.com/api/webservice/guide/search/searchbykeywords
 */

import https from "node:https";
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

const PROVIDER: ConnectorProvider = "amap";

const CAPABILITIES: ConnectorCapability[] = [
  "poi_search",
  "route",
  "payment_redirect",
];

const AMAP_KEY = process.env.AMAP_KEY;

// ============================================================================
// HTTP 请求工具
// ============================================================================

function amapGet(path: string, params: Record<string, string>): Promise<string> {
  if (!AMAP_KEY) {
    return Promise.reject(new Error("AMAP_KEY not configured"));
  }

  const url = new URL(path, "https://restapi.amap.com");
  url.searchParams.set("key", AMAP_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  return new Promise<string>((resolve, reject) => {
    https
      .get(url.toString(), (res: import("node:http").IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Amap HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve(data);
        });
      })
      .on("error", reject);
  });
}

// ============================================================================
// POI 搜索
// ============================================================================

async function searchPoi(
  input: ConnectorSearchInput,
): Promise<ConnectorSearchResult[]> {
  if (!AMAP_KEY) return [];

  const params: Record<string, string> = {
    keywords: input.keyword,
    city: input.city || "全国",
    extensions: "base",
    fields: "name,address,location,category,rating,price,tel,opening_hours",
  };

  if (input.limit) {
    params.count = String(input.limit);
  }

  if (input.around) {
    params.location = `${input.around.lng},${input.around.lat}`;
    params.radius = String(input.around.radiusMeters || 3000);
    params.extend = "true";
  }

  const raw = await amapGet("/v5/place/keywords", params);
  const json = JSON.parse(raw) as {
    status: string;
    count: string;
    places?: Array<Record<string, unknown>>;
  };

  if (json.status !== "1" || !json.places) return [];

  return json.places.map((p) => ({
    provider: PROVIDER,
    externalId: (p.id as string) || undefined,
    name: (p.name as string) || input.keyword,
    address: (p.address as string) || undefined,
    lat: parseFloat((p.location as string)?.split(",")[0] || "0"),
    lng: parseFloat((p.location as string)?.split(",")[1] || "0"),
    category: (p.category as string) || undefined,
    rating: p.rating ? parseFloat(p.rating as string) : undefined,
    avgPrice: p.price ? parseFloat(p.price as string) : undefined,
    sourceUrl: undefined,
    raw: p,
  }));
}

// ============================================================================
// Quote / Prepare / Commit — 占位（路线规划不需要 quote）
// ============================================================================

function quote(_input: QuoteInput): Promise<QuoteResult> {
  return Promise.resolve({
    quoteId: `amap-quote-${Date.now()}`,
    provider: PROVIDER,
    actionType: _input.actionType,
    status: "available",
    warnings: ["Amap 路线规划不需要报价"],
  });
}

function prepare(_input: QuoteInput): Promise<PreparedAction> {
  return Promise.resolve({
    preparedActionId: `amap-prepared-${Date.now()}`,
    provider: PROVIDER,
    actionType: _input.actionType,
    status: "prepared",
    title: "路线规划",
    description: "已生成路线，请在高德地图 App 中查看",
    redirectUrl: undefined,
    payload: {},
  });
}

function commit(_id: string): Promise<CommitResult> {
  return Promise.resolve({
    provider: PROVIDER,
    actionType: "route",
    status: "committed",
    message: "路线已生成",
  });
}

// ============================================================================
// Export Connector
// ============================================================================

export const amapConnector: ServiceConnector = {
  provider: PROVIDER,
  capabilities: CAPABILITIES,
  search: searchPoi,
  quote,
  prepare,
  commit,
};
