/**
 * placeTools.ts — search_places 工具
 *
 * 搜索真实地点/景点/餐厅，接入高德地图 POI 体系。
 */
import { getAmapClient } from "../tools/amap/client.js";

export interface SearchPlacesInput {
  keywords: string;
  city?: string;
  category?: string;
  radius?: number;
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  rating?: number;
  avgPrice?: number;
  distance?: string;
  location: string;
}

export interface SearchPlacesResult {
  places: PlaceResult[];
  total: number;
  message: string;
}

/**
 * Execute search_places: search POI via AMap API.
 */
export async function executeSearchPlaces(
  input: SearchPlacesInput,
  context?: { city?: string },
): Promise<SearchPlacesResult> {
  const client = getAmapClient();
  const city = input.city ?? context?.city ?? "北京";
  const keywords = input.category
    ? `${input.keywords} ${input.category}`
    : input.keywords;

  // If AMap not configured, return empty with helpful message
  if (!client.isConfigured()) {
    return {
      places: [],
      total: 0,
      message: `搜索"${keywords}"未返回结果（地图服务未配置）。建议用户自行在地图 App 搜索。`,
    };
  }

  try {
    const response = await client.searchPoiText({
      keywords,
      city,
      citylimit: true,
      offset: 10,
    });

    if (!response.pois || response.pois.length === 0) {
      return {
        places: [],
        total: 0,
        message: `在${city}搜索"${keywords}"没有找到匹配的地点，建议换个关键词试试。`,
      };
    }

    const places: PlaceResult[] = response.pois.map((poi) => ({
      id: poi.id,
      name: poi.name,
      address: poi.address,
      location: poi.location,
      distance: poi.distance,
      rating: poi.biz_ext?.rating ? parseFloat(poi.biz_ext.rating) : undefined,
      avgPrice: poi.biz_ext?.cost ? parseFloat(poi.biz_ext.cost) : undefined,
    }));

    const total = parseInt(response.count || "0", 10);

    return {
      places,
      total,
      message: `在${city}搜索"${keywords}"找到 ${total} 个结果，返回前 ${places.length} 个。`,
    };
  } catch (error) {
    return {
      places: [],
      total: 0,
      message: `搜索失败：${error instanceof Error ? error.message : String(error)}。建议用户稍后重试。`,
    };
  }
}

/**
 * OpenAI function definition for search_places
 */
export const searchPlacesToolDef = {
  type: "function" as const,
  function: {
    name: "search_places",
    description: "搜索真实地点（景点、餐厅、商场等）。返回 POI 列表，包含名称、地址、评分、人均消费等信息。用户问'推荐去哪'、'附近有什么好玩的'时调用。",
    parameters: {
      type: "object",
      properties: {
        keywords: {
          type: "string",
          description: "搜索关键词，如'亲子乐园'、'咖啡厅'、'博物馆'",
        },
        city: {
          type: "string",
          description: "搜索城市，如'杭州'。默认使用上下文中的城市。",
        },
        category: {
          type: "string",
          description: "可选分类标签，如'室内'、'免费'、'网红'",
        },
      },
      required: ["keywords"],
    },
  },
};
