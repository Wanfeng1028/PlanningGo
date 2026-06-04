/**
 * Demo Scenarios — 评审演示固定场景
 *
 * 三个高分场景，覆盖"周末去哪儿"核心能力：
 * 1. 两大一小亲子周末 — 打完整性、约束理解、无票兜底
 * 2. 情侣约会 — 打场景化、体验感、无座兜底
 * 3. 朋友聚会 — 打多人偏好、协同确认、时间冲突兜底
 */

export interface DemoScenario {
  /** 场景唯一标识 */
  id: string;
  /** 场景标题（显示在按钮/卡片上） */
  title: string;
  /** 用户 prompt（直接填入输入框即可触发完整链路） */
  prompt: string;
  /** 预期约束标签（用于展示工具链路面板） */
  expectedTags: string[];
  /** 场景描述（用于工具链路面板展示） */
  description: string;
}

export const demoScenarios: DemoScenario[] = [
  {
    id: 'family-weekend',
    title: '两大一小亲子周末',
    prompt: '周六下午上海，两大一小，孩子5岁，预算500元，从人民广场出发，希望少走路、别排队太久，最好有室内备选。',
    expectedTags: ['family', 'low-walking', 'indoor-backup', 'booking-fallback'],
    description: '识别：城市=上海，人群=两大一小，预算=500，偏好=少走路/少排队/室内备选。异常兜底：热门亲子馆无票后，自动换成儿童书店/室内乐园/商场亲子餐厅。',
  },
  {
    id: 'couple-date',
    title: '情侣约会',
    prompt: '明晚杭州情侣约会，预算600元，想要有氛围感的餐厅，饭后可以散步拍照，不想排队太久。',
    expectedTags: ['couple', 'romantic', 'low-queue', 'restaurant-fallback'],
    description: '识别：城市=杭州，人群=情侣，预算=600，偏好=氛围感/饭后散步/拍照/少排队。异常兜底：餐厅无座→换同商圈同预算同风格餐厅。',
  },
  {
    id: 'friends-gathering',
    title: '朋友聚会',
    prompt: '周日下午成都4个朋友聚会，人均150元，想先娱乐再吃饭，有人不吃辣，希望交通方便。',
    expectedTags: ['friends', 'budget', 'diet-conflict', 'share-confirm'],
    description: '识别：城市=成都，人群=4人朋友，预算=人均150，偏好=先娱乐后吃饭/不吃辣/交通方便。异常兜底：时间冲突→自动缩短停留时间或调整顺序。',
  },
];

/** 按 ID 查找场景 */
export function findDemoScenario(id: string): DemoScenario | undefined {
  return demoScenarios.find((s) => s.id === id);
}

/** 按 prompt 文本查找场景（用于自动匹配用户输入） */
export function matchScenarioByPrompt(prompt: string): DemoScenario | undefined {
  const trimmed = prompt.trim();
  return demoScenarios.find((s) => trimmed.includes(s.prompt.slice(0, 10)) || s.prompt.includes(trimmed.slice(0, 10)));
}
