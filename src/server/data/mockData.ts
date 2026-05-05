import type { MemoryItem, PlanOption, Reservation, ShareRoom, ToolLog, UserProfile } from "../types";

export const demoProfile: UserProfile = {
  id: "xiaoming",
  name: "小明",
  city: "杭州",
  startPoint: "浙大紫金港",
  family: ["老婆", "5 岁孩子"],
  preferences: ["低步行负担", "减脂友好晚餐", "不想排太久队", "优先 40 分钟内可达"],
  budgetRange: [300, 500],
  permissions: {
    location: true,
    reservation: false,
    ticket: false,
    calendar: false,
    share: true,
    memory: true,
  },
};

export const pois = [
  { id: "poi_001", name: "西湖断桥", type: "景点", distance: "38min", kidFriendly: true },
  { id: "poi_002", name: "白堤散步线", type: "路线", distance: "42min", kidFriendly: true },
  { id: "poi_003", name: "湖滨银泰", type: "休息点", distance: "45min", kidFriendly: true },
  { id: "poi_004", name: "海底捞湖滨店", type: "餐厅", distance: "46min", kidFriendly: true },
  { id: "poi_005", name: "室内亲子展", type: "雨天兜底", distance: "35min", kidFriendly: true },
];

export const weather = {
  city: "杭州",
  date: "2026-05-09",
  condition: "多云转小雨",
  rainProbability: 28,
  temperature: "21-27℃",
  suggestion: "保留室内亲子展作为兜底，主路线仍可执行。",
};

export const trafficRoutes = [
  { id: "route_taxi", name: "打车", duration: "38min", price: "约 ￥58", risk: "湖滨晚高峰可能拥堵" },
  { id: "route_metro", name: "地铁 + 步行", duration: "47min", price: "约 ￥12", risk: "孩子步行负担略高" },
  { id: "route_drive", name: "自驾", duration: "42min", price: "停车约 ￥20/h", risk: "湖滨停车紧张" },
];

export const reservations: Reservation[] = [
  {
    id: "res_restaurant_001",
    type: "restaurant",
    title: "海底捞湖滨店 17:40 桌位",
    status: "holding",
    price: "到店点餐",
    detail: "4 人桌，儿童椅备注，减脂友好菜单提醒。",
  },
  {
    id: "res_ticket_001",
    type: "ticket",
    title: "亲子电影可选锁座",
    status: "draft",
    price: "￥168",
    detail: "仅锁座 15 分钟，不自动付款。",
  },
  {
    id: "res_delivery_001",
    type: "delivery",
    title: "鲜花 / 蛋糕送到餐厅",
    status: "draft",
    price: "￥99 起",
    detail: "可作为纪念日加购，不进入默认方案。",
  },
];

export const baseToolLogs: ToolLog[] = [
  { id: "log_001", time: "09:03:12", tool: "map.route.query", status: "success", detail: "浙大紫金港到西湖断桥约 38 分钟。" },
  { id: "log_002", time: "09:03:18", tool: "weather.risk.check", status: "success", detail: "下午小雨概率低，保留室内兜底。" },
  { id: "log_003", time: "09:03:27", tool: "restaurant.availability", status: "retry", detail: "海底捞湖滨 18:00 紧张，推荐 17:40。" },
  { id: "log_004", time: "09:04:02", tool: "ticket.hold.preview", status: "mock", detail: "电影锁座仅作为可选加餐，不自动支付。" },
  { id: "log_005", time: "09:04:18", tool: "calendar.ics.generate", status: "success", detail: "可生成 ICS 日历提醒。" },
];

export const planOptions: PlanOption[] = [
  {
    id: "plan_a",
    title: "方案 A：亲子西湖低负担",
    score: 92,
    duration: "4.5h",
    budget: "￥420",
    walking: "2.2km",
    highlights: ["断桥 + 白堤短线", "湖滨休息点", "海底捞提前锁桌"],
    risks: ["18:00 餐厅紧张", "孩子疲劳时缩短白堤段"],
  },
  {
    id: "plan_b",
    title: "方案 B：朋友展览 Citywalk",
    score: 84,
    duration: "3.8h",
    budget: "￥360",
    walking: "3.1km",
    highlights: ["展览 + 咖啡", "轻社交节奏", "适合 4 人投票"],
    risks: ["亲子友好较弱", "雨天需要换室内"],
  },
  {
    id: "plan_c",
    title: "方案 C：雨天室内兜底",
    score: 88,
    duration: "4.0h",
    budget: "￥390",
    walking: "1.4km",
    highlights: ["室内活动", "交通稳定", "低步行负担"],
    risks: ["西湖体验减少", "票务库存需确认"],
  },
];

export const shareRooms: ShareRoom[] = [
  {
    id: "share_family_001",
    planId: "plan_a",
    title: "周六西湖亲子低负担方案",
    members: [
      { name: "小明", vote: "yes", comment: "我来确认付款和预约。" },
      { name: "老婆", vote: "pending", comment: "想少走一点，晚餐别太晚。" },
      { name: "小张", vote: "pending" },
    ],
  },
];

export const memories: MemoryItem[] = [
  {
    id: "mem_family_walk",
    category: "family",
    title: "孩子步行 2km 后需要休息",
    detail: "亲子路线中每 45-60 分钟安排休息点。",
    weight: 0.86,
  },
  {
    id: "mem_food_fitness",
    category: "food",
    title: "晚餐优先减脂友好",
    detail: "火锅、烤肉等场景需要自动补充低油菜单建议。",
    weight: 0.78,
  },
  {
    id: "mem_share_wife",
    category: "collaboration",
    title: "出发前发给老婆确认",
    detail: "家庭出行默认生成简版行程卡和可投票链接。",
    weight: 0.92,
  },
];
