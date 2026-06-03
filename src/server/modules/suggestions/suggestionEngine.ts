/**
 * 上下文感知周边服务推荐引擎。
 * 根据步骤类型、时间段、同行人和位置，智能推荐周边服务。
 */

export interface SuggestionItem {
  id: string;
  category: string;
  label: string;
  description: string;
  action: SuggestionAction;
}

export interface SuggestionAction {
  type: "navigate" | "add_to_trip" | "view_deal" | "order_delivery";
  label: string;
  payload: Record<string, string>;
}

interface StepContext {
  type: string;
  title: string;
  poiName: string | null;
  startTime: string;
  endTime: string;
}

interface PlanContext {
  steps: StepContext[];
  participantMode: string;
  city: string;
}

/**
 * 场景推理引擎：根据步骤上下文生成推荐
 */
export function generateSuggestions(context: PlanContext): SuggestionItem[] {
  const suggestions: SuggestionItem[] = [];

  for (let i = 0; i < context.steps.length; i++) {
    const step = context.steps[i]!;
    const hour = extractHour(step.startTime);
    const stepSuggestions = inferSuggestions(step, context, hour, i);
    suggestions.push(...stepSuggestions);
  }

  // Deduplicate by label
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    if (seen.has(s.label)) return false;
    seen.add(s.label);
    return true;
  });
}

function extractHour(timeStr: string): number {
  const m = timeStr.match(/(\d{1,2})[：:]/);
  return m ? parseInt(m[1]!, 10) : 12;
}

function inferSuggestions(
  step: StepContext,
  context: PlanContext,
  hour: number,
  stepIndex: number,
): SuggestionItem[] {
  const results: SuggestionItem[] = [];
  const poiName = step.poiName || step.title;

  // 饭后推荐
  if (step.type === "meal") {
    results.push(
      makeSuggestion("饮品", `${poiName}附近的饮品店`, "去喝一杯", "navigate", poiName),
      makeSuggestion("甜品", `${poiName}附近的甜品店`, "看看甜品", "navigate", poiName),
    );
    if (hour >= 14 && hour <= 17) {
      results.push(
        makeSuggestion("散步", "附近公园或步行街", "散散步消食", "navigate", poiName),
      );
    }
  }

  // 游览后推荐
  if (step.type === "activity") {
    results.push(
      makeSuggestion("拍照", "附近打卡点", "找个好角度拍照", "navigate", poiName),
    );
    if (hour >= 11 || hour >= 17) {
      results.push(
        makeSuggestion("休息", "附近休息区或咖啡店", "休息一下", "navigate", poiName),
      );
    }
  }

  // 带娃推荐
  if (context.participantMode === "family") {
    if (step.type === "activity" && hour >= 14) {
      results.push(
        makeSuggestion("冰淇淋", "附近冰淇淋店", "给孩子买个冰淇淋", "navigate", poiName),
      );
    }
  }

  // 情侣推荐
  if (context.participantMode === "couple") {
    if (hour >= 18) {
      results.push(
        makeSuggestion("甜品", "附近氛围甜品店", "来个浪漫甜品", "navigate", poiName),
      );
    }
  }

  // 朋友推荐
  if (context.participantMode === "friends") {
    if (hour >= 14 && hour <= 22) {
      results.push(
        makeSuggestion("桌游", "附近桌游吧", "一起玩桌游", "navigate", poiName),
        makeSuggestion("密室", "附近密室逃脱", "挑战密室逃脱", "navigate", poiName),
      );
    }
  }

  // 晚间推荐
  if (hour >= 19) {
    results.push(
      makeSuggestion("夜市", "附近夜市或小吃街", "逛逛夜市", "navigate", poiName),
    );
  }

  // 等待/休息推荐
  if (step.type === "buffer" || step.type === "rest") {
    results.push(
      makeSuggestion("咖啡", "附近咖啡店", "坐下来喝杯咖啡", "navigate", poiName),
      makeSuggestion("便利店", "附近便利店", "买点水和零食", "navigate", poiName),
    );
  }

  return results.slice(0, 4); // Max 4 suggestions per step
}

function makeSuggestion(
  category: string,
  description: string,
  label: string,
  actionType: SuggestionAction["type"],
  poiName: string,
): SuggestionItem {
  return {
    id: `sug-${category}-${Date.now().toString(36)}`,
    category,
    label,
    description,
    action: {
      type: actionType,
      label,
      payload: { keyword: poiName, category },
    },
  };
}
