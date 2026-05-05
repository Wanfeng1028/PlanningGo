import type { PlanOption, ToolLog } from "../types";

export const demoProfile = {
  id: "xiaoming",
  name: "小明",
  city: "杭州",
  startPoint: "浙大紫金港",
  family: ["老婆", "5 岁孩子"],
  preferences: ["低步行负担", "减脂友好晚餐", "不想排太久队", "优先 40 分钟内可达"],
};

export const pois = [
  { id: "poi_001", name: "西湖断桥", type: "景点", distance: "38min", kidFriendly: true },
  { id: "poi_002", name: "白堤散步线", type: "路线", distance: "42min", kidFriendly: true },
  { id: "poi_003", name: "湖滨银泰", type: "休息点", distance: "45min", kidFriendly: true },
  { id: "poi_004", name: "海底捞湖滨店", type: "餐厅", distance: "46min", kidFriendly: true },
  { id: "poi_005", name: "室内亲子展", type: "雨天兜底", distance: "35min", kidFriendly: true },
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
