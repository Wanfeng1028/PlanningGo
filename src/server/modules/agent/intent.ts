import type { PlanningRequest } from "../../types";
import type { UserIntent } from "../planning/schemas";
import { demoProfile } from "../../data/mockData";

/**
 * 用规则从用户请求中抽取结构化意图。
 * 第一版不依赖 LLM，保证压测稳定。
 */
export async function extractIntent(input: PlanningRequest): Promise<UserIntent> {
  const prompt = input.prompt;
  const companions = input.companions ?? inferParticipantMode(prompt);
  const partySize = inferPartySize(prompt, companions);

  return {
    raw: prompt,
    city: input.city ?? demoProfile.city,
    origin: {
      label: input.startPoint ?? demoProfile.startPoint,
    },
    departAt: input.departAt,
    timeWindow: inferTimeWindow(prompt),
    durationHours: inferDuration(prompt),
    participantMode: companions,
    partySize,
    budgetMax: input.budget,
    distanceLimitMinutes: 40,
    preferences: inferPreferences(prompt, companions),
    mustAsk: input.startPoint ? [] : ["origin"],
  };
}

function inferParticipantMode(prompt: string): UserIntent["participantMode"] {
  if (/老婆|孩子|一家|亲子|家庭/.test(prompt)) return "family";
  if (/朋友|同学|同事|聚会/.test(prompt)) return "friends";
  if (/情侣|对象|女朋友|男朋友|约会/.test(prompt)) return "couple";
  if (/一个人|自己/.test(prompt)) return "solo";
  return "unknown";
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
  if (mode === "family") preferences.push("亲子友好", "低排队风险");
  if (mode === "friends") preferences.push("适合多人", "可分享投票");
  return preferences;
}
