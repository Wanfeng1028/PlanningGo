/**
 * 固定测试语料 — E2E 验收数据
 */

export const TEST_PROMPTS = {
  A_solo_coffee_hotpot: {
    name: "A: 单人西湖咖啡火锅",
    input: "从杭师大仓前出发，明天上午9点，一个人，先找咖啡厅坐坐，中午吃火锅，预算200",
    checks: {
      planCount: 3,
      hasSpecificPoi: true,
      budgetMax: 200,
      buttonsHaveFeedback: true,
    },
  },
  B_friends_rainy: {
    name: "B: 朋友雨天杭州",
    input: "明天杭州下雨，和朋友吃饭逛逛，预算300，少走路，别排队",
    checks: {
      indoorPrimary: true,
      noQueueShops: true,
      budgetMax: 300,
    },
  },
  C_family_halfday: {
    name: "C: 亲子半日",
    input: "周末带娃半天，预算300，室内优先，别太累",
    checks: {
      kidFriendly: true,
      walkingLow: true,
      hasFamilyServices: true,
      budgetMax: 300,
    },
  },
  D_couple_date: {
    name: "D: 情侣约会",
    input: "周六晚上和对象约会，想吃饭看电影，预算500，氛围好一点",
    checks: {
      atmosphereRestaurant: true,
      hasCinema: true,
      coupleSuggestions: true,
      budgetMax: 500,
    },
  },
} as const;
