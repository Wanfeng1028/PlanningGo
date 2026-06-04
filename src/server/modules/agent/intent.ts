import type { PlanningRequest } from "../../types";
import type { UserIntent } from "../planning/schemas";


/**
 * 判断用户输入是否为出行规划请求。
 * 纯问候、闲聊等不触发规划流程。
 */
function detectPlanningRequest(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 3) return false;

  const greetings = /^(你好|hi|hello|hey|嗨|喂|哈喽|早上好|下午好|晚上好|test|测试)$/i;
  if (greetings.test(trimmed)) return false;

  const planningKeywords = /去|到|玩|游|旅|行程|计划|安排|攻略|周末|明天|下周|带娃|带孩子|约会|聚会|出发|景点|餐厅|吃饭|看电影|展览|博物馆|半天|一天|预算|trip|visit|travel|plan|go\s+to|hangzhou|beijing|shanghai|guangzhou|shenzhen|chengdu|xian|suzhou|nanjing|wuhan|chongqing|tianjin|qingdao|dali|xiamen|sanya|kunming/i;
  return planningKeywords.test(trimmed);
}
/**
 * 用规则从用户请求中抽取结构化意图。
 * 第一版不依赖 LLM，保证压测稳定。
 */
export async function extractIntent(input: PlanningRequest): Promise<UserIntent> {
  const prompt = input.prompt;
  const companions = input.companions ?? inferParticipantMode(prompt);
  const partySize = inferPartySize(prompt, companions);
  const routeStops = inferRouteStops(prompt);
  const returnPoint = inferReturnPoint(prompt);
  const preferences = inferPreferences(prompt, companions);
  const foodPreferences = preferences.filter((item) =>
    ["咖啡厅", "奶茶", "海底捞", "火锅", "午饭", "晚饭"].includes(item),
  );

  return {
    raw: prompt,
    city: input.city ?? "北京",
    origin: {
      label: input.startPoint ?? "",
    },
    departAt: input.departAt,
    timeWindow: inferTimeWindow(prompt),
    durationHours: inferDuration(prompt),
    participantMode: companions,
    partySize,
    budgetMax: input.budget ?? inferBudget(prompt),
    distanceLimitMinutes: 40,
    preferences,
    routeStops,
    returnPoint,
    transportMode: inferTransportMode(prompt),
    foodPreferences,
    bookingIntent: /预约|订座|排号|取号|订位|提前约|海底捞|预约需求/.test(prompt) ? "needs_booking_check" : undefined,
    orderingIntent: /下单|点单|奶茶|咖啡|外卖|支付|下单需求/.test(prompt) ? "needs_order_draft" : undefined,
    purchaseIntent: /门票|购票|买票|票价|灵隐寺|购票需求/.test(prompt) ? "needs_ticket_check" : undefined,
    mustAsk: input.startPoint ? [] : ["origin"],
    isPlanningRequest: detectPlanningRequest(prompt),
  };
}

function inferParticipantMode(prompt: string): UserIntent["participantMode"] {
  if (/老婆|孩子|一家|亲子|家庭|带娃|带孩子/.test(prompt)) return "family";
  if (/情侣|对象|女朋友|男朋友|约会/.test(prompt)) return "couple";
  if (/朋友|同学|同事|聚会/.test(prompt)) return "friends";
  if (/一个人|自己/.test(prompt)) return "solo";
  return "unknown";
}

function inferBudget(prompt: string): number | undefined {
  // 匹配 "预算300"、"300元"、"300块"、"budget 300" 等
  const match = prompt.match(/预算\s*(\d+)|(\d+)\s*[元块]|budget\s*(\d+)/i);
  if (match) return Number(match[1] ?? match[2] ?? match[3]);
  return undefined;
}

function inferPartySize(prompt: string, mode: UserIntent["participantMode"]): number {
  const match = prompt.match(/(\d+)\s*人/);
  if (match) return Number(match[1]);
  if (mode === "family") return 3;
  if (mode === "friends") return 4;
  if (mode === "couple") return 2;
  return 1;
}

function inferTimeWindow(prompt: string): UserIntent["timeWindow"] {
  if (/上午|早上/.test(prompt)) return "morning";
  if (/下午|午后/.test(prompt)) return "afternoon";
  if (/晚上|夜晚|晚饭/.test(prompt)) return "evening";
  if (/一天|整天/.test(prompt)) return "full_day";
  return "afternoon";
}

function inferDuration(prompt: string): [number, number] {
  const match = prompt.match(/(\d+)\s*[-到至]?\s*(\d+)?\s*个?小时/);
  if (!match) return [4, 6];
  const first = Number(match[1]);
  const second = match[2] ? Number(match[2]) : first;
  return [Math.min(first, second), Math.max(first, second)];
}

function inferPreferences(prompt: string, mode: UserIntent["participantMode"]): string[] {
  const preferences: string[] = [];
  if (/别太远|不远|附近|近/.test(prompt)) preferences.push("短交通");
  if (/不要太累|少走|低负担/.test(prompt)) preferences.push("低步行");
  if (/减肥|减脂|清淡|健康/.test(prompt)) preferences.push("减脂友好");
  if (/下雨|雨天|室内/.test(prompt)) preferences.push("室内优先");
  if (/咖啡|咖啡厅|cafe/.test(prompt)) preferences.push("咖啡厅");
  if (/奶茶|茶饮|喜茶|奈雪|霸王茶姬/.test(prompt)) preferences.push("奶茶");
  if (/海底捞/.test(prompt)) preferences.push("海底捞");
  if (/火锅/.test(prompt)) preferences.push("火锅");
  if (/午饭|午餐|吃饭|吃午饭/.test(prompt)) preferences.push("午饭");
  if (/晚饭|晚餐|吃晚饭/.test(prompt)) preferences.push("晚饭");
  if (mode === "family") preferences.push("亲子友好", "低排队风险");
  if (mode === "friends") preferences.push("适合多人", "可分享投票");
  return preferences;
}

function inferRouteStops(prompt: string): string[] {
  const routeLine = prompt.match(/路线顺序：([^\n；]+)/);
  if (routeLine?.[1]) {
    return routeLine[1]
      .split(/→|->|、|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const stops: string[] = [];
  const push = (value: string | undefined) => {
    const clean = value?.replace(/[，,。.！!？?、；;\s]/g, "").replace(/^附近的?/, "");
    if (clean && clean.length >= 2 && clean.length <= 30 && !stops.includes(clean)) stops.push(clean);
  };
  const stopPattern = /(?:去|逛|游览|打卡|到|前往)([^，,。.！!？?、；;\s]{2,24})/g;
  for (const match of prompt.matchAll(stopPattern)) {
    let candidate = match[1]!;
    if (candidate.includes("去")) candidate = candidate.slice(candidate.lastIndexOf("去") + 1);
    if (candidate.includes("喝咖啡")) candidate = candidate.replace(/^.*喝咖啡/, "");
    if (!/^(吃|看|玩|逛|买|喝|坐|拍|找|选|试|听|学|做|体验|享受|参加|参观)/.test(candidate)) push(candidate);
  }
  for (const match of prompt.matchAll(/(海底捞|星巴克|瑞幸|喜茶|奈雪|霸王茶姬|麦当劳|肯德基|火锅店|咖啡店|咖啡厅|奶茶店|茶饮店)/g)) {
    push(match[1]);
  }
  return stops;
}

function inferReturnPoint(prompt: string): string | undefined {
  const explicit = prompt.match(/回程终点：([^\n；]+)/)?.[1];
  if (explicit) return explicit.trim();
  const match = prompt.match(/(?:回|返回|回到)([^，,。.！!？?、；;\s]{2,30})/);
  return match?.[1]?.replace(/[，,。.！!？?、]/g, "").trim();
}

function inferTransportMode(prompt: string): UserIntent["transportMode"] {
  if (/地铁|公交|公共交通|transit/.test(prompt)) return "subway";
  if (/打车|叫车|网约车|出租车|taxi/.test(prompt)) return "taxi";
  if (/自驾|开车|driving/.test(prompt)) return "driving";
  if (/步行|走路|walk/.test(prompt)) return "walk";
  return undefined;
}
