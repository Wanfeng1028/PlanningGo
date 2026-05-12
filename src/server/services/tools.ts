import { demoProfile, pois, trafficRoutes, weather } from "../data/mockData";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 天气状况枚举
 */
export type WeatherCondition = "sunny" | "cloudy" | "overcast" | "light_rain" | "rainy" | "stormy";

/**
 * 交通拥堵等级枚举
 */
export type TrafficLevel = "smooth" | "moderate" | "congested" | "blocked";

/**
 * POI 类型枚举
 */
export type PoiType = "restaurant" | "scenic_spot" | "shopping" | "entertainment" | "hotel" | "transit" | "other";

/**
 * 预约建议枚举
 */
export type BookingAdvice = "walk_in" | "recommended" | "suggest_alternative" | "not_available";

/**
 * 获取当前位置上下文请求参数
 */
export interface GetCurrentContextRequest {
  /** 位置名称，如 "西湖断桥"、"海底捞湖滨店"、用户起点 "浙大紫金港" 等 */
  location: string;
}

/**
 * 天气信息结构
 */
export interface WeatherInfo {
  /** 城市名称 */
  city: string;
  /** 观测日期，格式为 YYYY-MM-DD */
  date: string;
  /** 天气状况英文标识 */
  condition: WeatherCondition;
  /** 天气状况中文描述 */
  conditionDescription: string;
  /** 降雨概率，范围 0-100 */
  rainProbability: number;
  /** 温度范围，格式为 "最低温-最高温℃" */
  temperature: string;
  /** 湿度百分比 */
  humidity: number;
  /** 风速，单位 km/h */
  windSpeed: number;
  /** 空气质量指数，数值越小越好 */
  aqi: number;
  /** 空气质量描述 */
  aqiDescription: string;
}

/**
 * 交通路况结构
 */
export interface TrafficInfo {
  /** 起点位置名称 */
  startPoint: string;
  /** 终点位置名称 */
  endPoint: string;
  /** 拥堵等级 */
  level: TrafficLevel;
  /** 拥堵等级中文描述 */
  levelDescription: string;
  /** 预计通行时间，单位分钟 */
  duration: number;
  /** 距离，单位公里 */
  distance: number;
  /** 主要风险提示（如果有） */
  riskWarning?: string;
}

/**
 * 当前时间信息
 */
export interface TimeInfo {
  /** 当前时间，格式为 HH:mm:ss */
  currentTime: string;
  /** 当前日期，格式为 YYYY-MM-DD */
  currentDate: string;
  /** 星期几，中文表示 */
  weekday: string;
  /** 是否为节假日 */
  isHoliday: boolean;
  /** 节假日名称（如果是节假日） */
  holidayName?: string;
}

/**
 * 获取当前位置上下文响应结构
 */
export interface GetCurrentContextResponse {
  /** 位置名称 */
  location: string;
  /** 天气信息 */
  weather: WeatherInfo;
  /** 交通信息列表（从该位置出发到常见目的地的交通状况） */
  traffic: TrafficInfo[];
  /** 当前时间信息 */
  time: TimeInfo;
  /** 综合建议，基于天气和交通状况给出 */
  suggestion: string;
}

// ============================================================================
// Type Definitions - searchLocalActivities
// ============================================================================

/**
 * 搜索本地活动请求参数
 */
export interface SearchLocalActivitiesRequest {
  /** 搜索关键词，如 "餐厅"、"儿童乐园"、"西湖景点" 等 */
  query: string;
  /** 特定要求筛选列表，支持的筛选标签包括：
   * - "亲子"：适合亲子活动
   * - "无需排队"：当前排队人数少
   * - "低步行"：距离较近或交通便利
   * - "室内"：室内场所
   * - "室外"：室外场所
   * - "低价"：人均消费较低
   * - "高价"：人均消费较高
   * - "快速"：适合快速消费
   * - "休闲"：适合长时间停留
   */
  requirements?: string[];
  /** 搜索半径，单位米，默认 5000 */
  radius?: number;
  /** 排序方式，默认 "distance"
   * - "distance"：按距离排序
   * - "rating"：按评分排序
   * - "popularity"：按热度排序
   */
  sortBy?: "distance" | "rating" | "popularity";
}

/**
 * POI 兴趣点基础信息
 */
export interface LocalPoi {
  /** POI 唯一标识符 */
  id: string;
  /** POI 名称 */
  name: string;
  /** POI 类型 */
  type: PoiType;
  /** POI 类型中文描述 */
  typeDescription: string;
  /** 距离，单位米 */
  distance: number;
  /** 距离描述，如 "约 500m"、"约 2km" */
  distanceDescription: string;
  /** 步行时间，单位分钟 */
  walkingTime: number;
  /** 驾车时间，单位分钟 */
  drivingTime: number;
  /** 纬度 */
  latitude: number;
  /** 经度 */
  longitude: number;
  /** 地址 */
  address: string;
  /** 评分，范围 1-5 */
  rating: number;
  /** 评分人数 */
  ratingCount: number;
  /** 人均消费，单位元（如果是消费场所） */
  avgPrice?: number;
  /** 标签列表 */
  tags: string[];
  /** 是否适合亲子 */
  kidFriendly: boolean;
  /** 营业时间 */
  businessHours: string;
  /** 联系电话 */
  phone?: string;
  /** 封面图片 URL */
  coverImage?: string;
  /** 详细描述 */
  description?: string;
}

/**
 * 搜索本地活动响应结构
 */
export interface SearchLocalActivitiesResponse {
  /** 搜索关键词 */
  query: string;
  /** 应用的筛选条件 */
  requirements: string[];
  /** 搜索半径（米） */
  radius: number;
  /** 符合条件的 POI 总数 */
  totalCount: number;
  /** 返回的 POI 列表（最多返回 20 条） */
  items: LocalPoi[];
  /** 搜索耗时（毫秒） */
  latency: number;
  /** 当前时间戳 */
  timestamp: string;
}

// ============================================================================
// Type Definitions - checkBookingStatus
// ============================================================================

/**
 * 查询预约状态请求参数
 */
export interface CheckBookingStatusRequest {
  /** POI 唯一标识符，对应 searchLocalActivities 返回的 id 字段 */
  poiId: string;
}

/**
 * 排队信息结构
 */
export interface QueueInfo {
  /** 当前排队人数 */
  currentQueue: number;
  /** 预计等待时间，单位分钟 */
  estimatedWaitTime: number;
  /** 当前叫号 */
  currentNumber: number;
  /** 最近的可用号码（如果需要取号） */
  nextAvailableNumber?: number;
  /** 排队状态："none" 无需排队，"light" 人数较少，"moderate" 正常，"busy" 繁忙 */
  status: "none" | "light" | "moderate" | "busy";
  /** 排队状态中文描述 */
  statusDescription: string;
}

/**
 * 预约时段信息
 */
export interface TimeSlot {
  /** 时段标识符 */
  id: string;
  /** 时段名称，如 "11:00-12:00"、"晚餐" */
  name: string;
  /** 日期，格式为 YYYY-MM-DD */
  date: string;
  /** 是否可预约 */
  available: boolean;
  /** 剩余可预约数量 */
  remainingCount?: number;
  /** 建议预约时间（如果是推荐时段） */
  recommended?: boolean;
}

/**
 * 预约状态详情
 */
export interface BookingDetail {
  /** 是否需要预约 */
  reservationRequired: boolean;
  /** 是否支持线上预约 */
  onlineReservationSupported: boolean;
  /** 是否支持线下取号 */
  offlineQueueSupported: boolean;
  /** 当前排队信息 */
  queueInfo: QueueInfo;
  /** 可预约时段列表（如果有） */
  availableSlots?: TimeSlot[];
  /** 预约规则说明 */
  bookingRules?: string[];
  /** 取消政策 */
  cancellationPolicy?: string;
}

/**
 * 价格区间信息
 */
export interface PriceRange {
  /** 最低消费或起价，单位元 */
  minPrice: number;
  /** 最高消费（如果有） */
  maxPrice?: number;
  /** 价格说明 */
  description: string;
}

/**
 * 查询预约状态响应结构
 */
export interface CheckBookingStatusResponse {
  /** POI 标识符 */
  poiId: string;
  /** POI 名称 */
  poiName: string;
  /** POI 类型 */
  poiType: PoiType;
  /** 当前预约状态 */
  bookingDetail: BookingDetail;
  /** 价格区间 */
  priceRange: PriceRange;
  /** 预约建议
   * - "walk_in"：可直接前往，无需预约
   * - "recommended"：建议提前预约
   * - "suggest_alternative"：建议选择其他场所
   * - "not_available"：当日已约满
   */
  advice: BookingAdvice;
  /** 建议信息 */
  adviceMessage: string;
  /** 备注信息（如果有） */
  notes?: string[];
  /** 当前时间戳 */
  timestamp: string;
}

// ============================================================================
// Mock Data
// ============================================================================

/**
 * Mock 天气数据映射表
 */
const mockWeatherData: Record<string, WeatherInfo> = {
  default: {
    city: "杭州",
    date: "2026-05-09",
    condition: "cloudy",
    conditionDescription: "多云",
    rainProbability: 28,
    temperature: "21-27",
    humidity: 65,
    windSpeed: 12,
    aqi: 42,
    aqiDescription: "优",
  },
  "西湖断桥": {
    city: "杭州",
    date: "2026-05-09",
    condition: "light_rain",
    conditionDescription: "小雨",
    rainProbability: 65,
    temperature: "19-24",
    humidity: 78,
    windSpeed: 15,
    aqi: 38,
    aqiDescription: "优",
  },
  海底捞: {
    city: "杭州",
    date: "2026-05-09",
    condition: "cloudy",
    conditionDescription: "多云",
    rainProbability: 25,
    temperature: "22-28",
    humidity: 60,
    windSpeed: 10,
    aqi: 45,
    aqiDescription: "优",
  },
};

/**
 * Mock 排队数据映射表
 */
const mockQueueData: Record<string, Omit<CheckBookingStatusResponse, "poiId" | "poiName" | "poiType" | "timestamp">> = {
  poi_004: {
    bookingDetail: {
      reservationRequired: true,
      onlineReservationSupported: true,
      offlineQueueSupported: true,
      queueInfo: {
        currentQueue: 8,
        estimatedWaitTime: 25,
        currentNumber: 156,
        nextAvailableNumber: 164,
        status: "moderate",
        statusDescription: "排队人数中等",
      },
      availableSlots: [
        { id: "slot_1", name: "17:00-18:00", date: "2026-05-09", available: true, remainingCount: 3 },
        { id: "slot_2", name: "17:30-18:30", date: "2026-05-09", available: true, remainingCount: 2 },
        { id: "slot_3", name: "18:00-19:00", date: "2026-05-09", available: false },
        { id: "slot_4", name: "18:30-19:30", date: "2026-05-09", available: true, remainingCount: 5 },
        { id: "slot_5", name: "19:00-20:00", date: "2026-05-09", available: true, remainingCount: 8, recommended: true },
      ],
      bookingRules: [
        "最多可预约未来 7 天的座位",
        "预约保留 15 分钟，超时自动取消",
        "4 人以下可预约小桌，4 人以上需预约大桌",
        "儿童椅请在备注中说明",
      ],
      cancellationPolicy: "可免费取消，取消后座位将释放给其他顾客",
    },
    priceRange: {
      minPrice: 150,
      description: "人均消费约 150-200 元",
    },
    advice: "recommended",
    adviceMessage: "海底捞湖滨店当前排队人数中等，建议提前线上预约 19:00 时段，届时人流量会有所下降。",
    notes: [
      "支持美甲、擦鞋等增值服务",
      "提供儿童游乐区",
      "可提前在 App 上选好锅底和小料",
    ],
  },
  poi_005: {
    bookingDetail: {
      reservationRequired: false,
      onlineReservationSupported: false,
      offlineQueueSupported: false,
      queueInfo: {
        currentQueue: 0,
        estimatedWaitTime: 0,
        currentNumber: 0,
        status: "none",
        statusDescription: "无需排队",
      },
    },
    priceRange: {
      minPrice: 68,
      maxPrice: 128,
      description: "亲子展门票 68-128 元/人不等",
    },
    advice: "walk_in",
    adviceMessage: "室内亲子展无需预约，可直接前往。周末建议提前到达，错开 10:00-11:00 高峰时段。",
    notes: [
      "3 岁以下儿童免费入场",
      "提供家长休息区",
      "场馆内禁止饮食",
    ],
  },
  poi_001: {
    bookingDetail: {
      reservationRequired: false,
      onlineReservationSupported: false,
      offlineQueueSupported: false,
      queueInfo: {
        currentQueue: 0,
        estimatedWaitTime: 0,
        currentNumber: 0,
        status: "none",
        statusDescription: "景点无排队概念",
      },
    },
    priceRange: {
      minPrice: 0,
      description: "西湖断桥免费开放",
    },
    advice: "walk_in",
    adviceMessage: "西湖断桥为免费景点，无需预约。建议工作日或清晨前往，避开周末人流高峰。",
    notes: [
      "建议游览时间 1-2 小时",
      "附近有公共卫生间和便利店",
      "雨天路面湿滑，请注意安全",
    ],
  },
};

// ============================================================================
// Tool Functions
// ============================================================================

/**
 * 获取指定位置的当前上下文信息，包括时间、天气和交通状况。
 *
 * 此工具用于获取用户出发地或目的地的实时信息，帮助大模型做出合理的行程规划决策。
 * 当用户询问"现在天气怎么样"、"堵不堵"等问题时，应调用此工具。
 *
 * @param request - 包含位置信息的请求对象
 * @param request.location - 位置名称，支持模糊匹配（如 "海底捞"、"西湖" 等）
 *
 * @returns 包含天气、交通、时间和综合建议的上下文信息
 *
 * @example
 * // 获取西湖断桥的当前上下文
 * const context = await getCurrentContext({ location: "西湖断桥" });
 * // 返回该位置的天气、交通和时间信息
 *
 * @example
 * // 获取用户当前位置的上下文
 * const context = await getCurrentContext({ location: "浙大紫金港" });
 * // 用于判断从用户当前位置出发的交通状况
 */
export async function getCurrentContext(
  request: GetCurrentContextRequest
): Promise<GetCurrentContextResponse> {
  const { location } = request;

  // 获取天气信息
  const weatherKey = Object.keys(mockWeatherData).find(
    (key) => key !== "default" && location.includes(key)
  ) ?? "default";
  const weatherData = mockWeatherData[weatherKey];

  // 生成时间信息
  const now = new Date();
  const weekdayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const timeInfo: TimeInfo = {
    currentTime: now.toLocaleTimeString("zh-CN", { hour12: false }),
    currentDate: now.toISOString().split("T")[0],
    weekday: weekdayNames[now.getDay()],
    isHoliday: false,
  };

  // 生成交通信息（基于 mockData 中的 trafficRoutes）
  const trafficData: TrafficInfo[] = trafficRoutes.map((route) => ({
    startPoint: demoProfile.startPoint,
    endPoint: location,
    level: route.risk.includes("拥堵") ? ("moderate" as TrafficLevel) : ("smooth" as TrafficLevel),
    levelDescription: route.risk.includes("拥堵") ? "轻度拥堵" : "畅通",
    duration: parseInt(route.duration.replace(/[^0-9]/g, "")),
    distance: 0,
    riskWarning: route.risk,
  }));

  // 生成综合建议
  const weatherSuggestion = weatherData.rainProbability > 50
    ? "天气有小雨或以上，请携带雨具，建议保留室内活动作为备选方案。"
    : "天气状况良好，适合户外活动。";
  const trafficSuggestion = trafficData.some((t) => t.level === "moderate")
    ? "部分路段存在拥堵，建议提前出发或选择公共交通。"
    : "交通状况良好，通行顺畅。";

  return {
    location,
    weather: weatherData,
    traffic: trafficData,
    time: timeInfo,
    suggestion: `${weatherSuggestion} ${trafficSuggestion}`,
  };
}

/**
 * 根据关键词和筛选条件搜索周边的兴趣点（POI），返回包含地点 ID、名称、距离、标签等信息的结构化数据。
 *
 * 此工具用于在用户规划行程时搜索合适的地点，如餐厅、景点、娱乐场所等。
 * 支持多维度筛选，包括亲子友好、无需排队、低步行等要求。
 *
 * @param request - 搜索请求参数
 * @param request.query - 搜索关键词，如 "餐厅"、"儿童乐园"、"西湖景点"、"咖啡厅" 等
 * @param request.requirements - 可选的筛选条件数组，支持以下标签：
 *   - "亲子"：适合亲子活动的场所
 *   - "无需排队"：当前排队人数较少的场所
 *   - "低步行"：距离较近或交通便利的场所
 *   - "室内"：室内场所
 *   - "室外"：室外场所
 *   - "低价"：人均消费较低的场所
 *   - "高价"：人均消费较高的场所
 *   - "快速"：适合快速消费的地方
 *   - "休闲"：适合长时间停留的地方
 * @param request.radius - 搜索半径，单位米，默认 5000（5 公里）
 * @param request.sortBy - 排序方式，可选值为 "distance"（按距离，默认）、"rating"（按评分）、"popularity"（按热度）
 *
 * @returns 符合条件的 POI 列表，每个 POI 包含详细信息
 *
 * @example
 * // 搜索亲子友好的餐厅
 * const result = await searchLocalActivities({
 *   query: "餐厅",
 *   requirements: ["亲子", "低步行"]
 * });
 *
 * @example
 * // 搜索无需排队的景点
 * const result = await searchLocalActivities({
 *   query: "景点",
 *   requirements: ["无需排队"],
 *   sortBy: "rating"
 * });
 */
export async function searchLocalActivities(
  request: SearchLocalActivitiesRequest
): Promise<SearchLocalActivitiesResponse> {
  const { query, requirements = [], radius = 5000, sortBy = "distance" } = request;

  // 模拟搜索延迟
  const startTime = Date.now();

  // 过滤 mock POI 数据
  let filteredPois = pois.filter((poi) => {
    const matchQuery = query === "" ||
      poi.name.includes(query) ||
      poi.type.includes(query) ||
      (query === "景点" && poi.type === "景点") ||
      (query === "餐厅" && poi.type === "餐厅");
    return matchQuery;
  });

  // 应用筛选条件
  if (requirements.includes("亲子")) {
    filteredPois = filteredPois.filter((poi) => "kidFriendly" in poi && poi.kidFriendly);
  }

  if (requirements.includes("无需排队")) {
    // 模拟：标记为"无需排队"的 POI（基于 mock 数据中的一些条件）
    filteredPois = filteredPois.filter(
      (poi) => poi.type === "景点" || poi.type === "休息点" || !poi.name.includes("海底捞")
    );
  }

  if (requirements.includes("低步行")) {
    // 模拟：距离小于 40 分钟的为低步行
    filteredPois = filteredPois.filter(
      (poi) => !poi.distance.includes("45") && !poi.distance.includes("47")
    );
  }

  if (requirements.includes("室内")) {
    filteredPois = filteredPois.filter((poi) => poi.type === "餐厅" || poi.type === "雨天兜底");
  }

  if (requirements.includes("室外")) {
    filteredPois = filteredPois.filter((poi) => poi.type === "景点" || poi.type === "路线");
  }

  // 转换 POI 类型
  const poiTypeMap: Record<string, PoiType> = {
    景点: "scenic_spot",
    路线: "scenic_spot",
    休息点: "shopping",
    餐厅: "restaurant",
    雨天兜底: "entertainment",
  };

  const poiTypeDescriptionMap: Record<string, string> = {
    景点: "景点",
    路线: "观光路线",
    休息点: "购物休闲",
    餐厅: "餐厅",
    雨天兜底: "室内活动",
  };

  // 构建完整的 POI 数据
  const localPois: LocalPoi[] = filteredPois.slice(0, 20).map((poi) => {
    const distanceNum = parseInt(poi.distance.replace(/[^0-9]/g, ""));
    return {
      id: poi.id,
      name: poi.name,
      type: poiTypeMap[poi.type] ?? "other",
      typeDescription: poiTypeDescriptionMap[poi.type] ?? poi.type,
      distance: distanceNum * 100,
      distanceDescription: poi.distance,
      walkingTime: distanceNum,
      drivingTime: Math.ceil(distanceNum * 0.8),
      latitude: 30.25 + Math.random() * 0.02,
      longitude: 120.15 + Math.random() * 0.02,
      address: `杭州市西湖区${poi.name}附近`,
      rating: 4.0 + Math.random(),
      ratingCount: Math.floor(Math.random() * 500) + 100,
      avgPrice: poi.type === "餐厅" ? Math.floor(Math.random() * 150) + 80 : undefined,
      tags: poi.kidFriendly ? ["亲子友好", "适合家庭"] : [],
      kidFriendly: poi.kidFriendly,
      businessHours: poi.type === "餐厅" ? "10:00-22:00" : "全天开放",
      phone: "0571-xxxx-xxxx",
      coverImage: undefined,
      description: poi.type === "餐厅"
        ? `提供${poi.name}的本地特色美食，环境优雅，适合家庭聚餐。`
        : `杭州知名${poi.type}，景色优美，是游客和本地居民休闲的好去处。`,
    };
  });

  // 排序
  if (sortBy === "rating") {
    localPois.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === "popularity") {
    localPois.sort((a, b) => b.ratingCount - a.ratingCount);
  }

  return {
    query,
    requirements,
    radius,
    totalCount: localPois.length,
    items: localPois,
    latency: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 根据地点 ID 查询当前的排队人数、等待时间和是否需要提前预约。
 *
 * 此工具用于查询特定场所（如餐厅、景区、娱乐设施）的实时预约状态，
 * 帮助大模型判断是否需要帮助用户预约或建议其他方案。
 * 当用户确定要前往某个地点或询问某个地方是否需要排队时，应调用此工具。
 *
 * @param request - 查询请求参数
 * @param request.poiId - POI 唯一标识符，对应 searchLocalActivities 返回的 id 字段
 *   - "poi_001"：西湖断桥
 *   - "poi_002"：白堤散步线
 *   - "poi_003"：湖滨银泰
 *   - "poi_004"：海底捞湖滨店
 *   - "poi_005"：室内亲子展
 *
 * @returns 包含排队信息、预约时段和建议的完整预约状态
 *
 * @example
 * // 查询海底捞的预约状态
 * const status = await checkBookingStatus({ poiId: "poi_004" });
 * if (status.advice === "recommended") {
 *   console.log(`建议预约${status.poiName}，${status.adviceMessage}`);
 * }
 *
 * @example
 * // 查询亲子展的预约状态
 * const status = await checkBookingStatus({ poiId: "poi_005" });
 * if (status.bookingDetail.queueInfo.status === "none") {
 *   console.log("无需排队，可直接前往");
 * }
 */
export async function checkBookingStatus(
  request: CheckBookingStatusRequest
): Promise<CheckBookingStatusResponse> {
  const { poiId } = request;

  // 查找对应的 POI 信息
  const poi = pois.find((p) => p.id === poiId);

  // 获取 mock 排队数据（如果没有则生成默认数据）
  const mockData = mockQueueData[poiId];

  if (!mockData) {
    // 为未定义的数据生成通用响应
    return {
      poiId,
      poiName: poi?.name ?? "未知地点",
      poiType: (poi?.type === "景点" ? "scenic_spot" : "restaurant") as PoiType,
      bookingDetail: {
        reservationRequired: false,
        onlineReservationSupported: false,
        offlineQueueSupported: false,
        queueInfo: {
          currentQueue: 0,
          estimatedWaitTime: 0,
          currentNumber: 0,
          status: "none",
          statusDescription: "无需排队",
        },
      },
      priceRange: {
        minPrice: 0,
        description: "免费或无固定价格",
      },
      advice: "walk_in",
      adviceMessage: `${poi?.name ?? "该地点"}无需特别预约，可直接前往。`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    poiId,
    poiName: poi?.name ?? "未知地点",
    poiType: (poi?.type === "景点" ? "scenic_spot" : "restaurant") as PoiType,
    ...mockData,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Tool Registry for LLM Function Calling
// ============================================================================

/**
 * 工具注册表，用于大模型的 Function Calling 规范
 * 这些定义用于告诉 LLM 可以调用哪些工具及其参数格式
 */
export const toolDefinitions = [
  {
    name: "getCurrentContext",
    description: "获取指定位置的当前时间、天气和交通状况。当用户询问天气、交通或需要了解当前环境信息时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "位置名称，如 '西湖断桥'、'海底捞湖滨店'、'浙大紫金港' 等",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "searchLocalActivities",
    description: "根据关键词和筛选条件搜索周边的兴趣点（POI）。当用户询问附近有什么餐厅、景点或需要搜索特定类型场所时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词，如 '餐厅'、'儿童乐园'、'西湖景点'、'咖啡厅' 等",
        },
        requirements: {
          type: "array",
          items: {
            type: "string",
            enum: ["亲子", "无需排队", "低步行", "室内", "室外", "低价", "高价", "快速", "休闲"],
          },
          description: "筛选条件数组，如 ['亲子', '无需排队']",
        },
        radius: {
          type: "number",
          description: "搜索半径，单位米，默认 5000",
          default: 5000,
        },
        sortBy: {
          type: "string",
          enum: ["distance", "rating", "popularity"],
          description: "排序方式：distance 按距离，rating 按评分，popularity 按热度",
          default: "distance",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "checkBookingStatus",
    description: "根据地点 ID 查询当前的排队人数、等待时间和是否需要提前预约。当用户确定要前往某个地点或询问是否需要排队/预约时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        poiId: {
          type: "string",
          description: "POI 唯一标识符，如 'poi_004'（海底捞湖滨店）、'poi_005'（室内亲子展）等",
        },
      },
      required: ["poiId"],
    },
  },
] as const;
