import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { demoProfile, planOptions, trafficRoutes, weather } from "../data/mockData";
import type { AgentResult, PlanningRequest } from "../types";
import {
  getCurrentContext,
  searchLocalActivities,
  checkBookingStatus,
  toolDefinitions,
  type GetCurrentContextRequest,
  type SearchLocalActivitiesRequest,
  type CheckBookingStatusRequest,
} from "./tools";
import {
  finalResponseSchema,
  executionStepSchema,
  activityPlanSchema,
  safeValidateFinalResponse,
  type FinalResponse,
} from "./schemas";

// ============================================================================
// OpenAI Client Configuration
// ============================================================================

/**
 * OpenAI 客户端实例
 *
 * 配置说明：
 * - 如果使用 OpenAI API，设置 baseURL 为官方端点
 * - 如果使用兼容 OpenAI 协议的其他 LLM（如通义千问、GLM、本地 Ollama），
 *   需要修改 baseURL 为对应的 API 地址
 * - API Key 应通过环境变量 OPENAI_API_KEY 配置，不应硬编码
 */
const openaiApiKey = process.env.OPENAI_API_KEY ?? "demo_key_for_testing";
const openaiBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const defaultModel = process.env.LLM_MODEL ?? "gpt-4o";

/**
 * LLM 调用配置接口
 */
interface LlmConfig {
  /** 模型名称，默认使用环境变量 LLM_MODEL 或 "gpt-4o" */
  model?: string;
  /** 温度参数，控制输出随机性，0-2 之间，默认 0.7 */
  temperature?: number;
  /** 最大 token 数，默认 4096 */
  maxTokens?: number;
  /** 请求超时时间（毫秒），默认 120000（2 分钟） */
  timeout?: number;
}

/**
 * 默认 LLM 配置
 */
const defaultLlmConfig: Required<LlmConfig> = {
  model: defaultModel,
  temperature: 0.7,
  maxTokens: 4096,
  timeout: 120000,
};

// ============================================================================
// System Prompt
// ============================================================================

/**
 * Agent 系统提示词
 *
 * 该提示词定义了 Agent 的角色定位、行为规范和工具使用指南。
 * 大模型将根据此提示词扮演"美团本地生活规划专家"角色。
 */
const SYSTEM_PROMPT = `你是美团本地生活规划专家，专注于为用户提供精准、高效的本地生活规划服务。

## 核心角色

你是一个专业的行程规划助手，能够理解用户的生活习惯、健康偏好、家庭构成等个性化需求，
并结合实时环境数据（天气、交通、排队状况）生成可落地执行的行程方案。

## 行为准则

1. **以用户为中心**：始终将用户的实际需求和约束放在首位
2. **数据驱动决策**：在做任何推荐前，必须先调用工具获取真实的上下文数据
3. **严谨可执行**：输出的方案必须是可以直接落地执行的，包含具体的时间、地点和操作
4. **透明可解释**：每个安排决定都需要说明理由，确保用户理解

## 工具使用规范

你必须按以下顺序使用工具：

### 第一步：获取环境上下文
在任何规划之前，必须调用 \`getCurrentContext\` 获取用户所在位置或目的地的：
- 当前时间
- 天气预报
- 交通路况
- 综合建议

### 第二步：搜索候选地点
根据用户需求调用 \`searchLocalActivities\` 搜索符合条件的兴趣点：
- 关键词：餐厅、景点、娱乐、购物等
- 筛选条件：亲子、低步行、无需排队、室内等
- 返回结果包含每个地点的详细信息

### 第三步：验证预约状态
对于需要预约的地点，调用 \`checkBookingStatus\` 确认：
- 当前排队人数
- 预计等待时间
- 可预约时段
- 预约建议

### 第四步：生成规划方案
基于上述数据，按照 FinalResponse 的 JSON Schema 输出最终结果。

## 用户约束识别

用户可能明确或隐含以下约束：

| 约束类型 | 识别关键词 | 处理方式 |
|---------|-----------|---------|
| 时间约束 | "4小时内"、"下午3点出发"、"周末一天" | 方案总时长不超过限制 |
| 预算约束 | "500元以内"、"不要太贵" | 预估花费不超过预算 |
| 成员构成 | "带孩子"、"一家三口"、"朋友聚会" | 选择 kidFriendly 场所，控制节奏 |
| 健康偏好 | "减肥"、"清淡"、"减脂" | 餐厅选择低油低盐菜品 |
| 特殊需求 | "不要排队"、"要室内"、"少走路" | 严格应用筛选条件 |

## 输出格式要求

你的最终输出必须严格符合以下 JSON Schema（FinalResponse）：

\`\`\`json
{
  "plans": [
    {
      "planTitle": "方案主题名称（20字以内）",
      "totalDurationHours": "总时长，如 4.5h",
      "totalEstimatedCost": "预估花费，如 ￥420",
      "steps": [
        {
          "timeSlot": "时间段，如 14:00-15:30",
          "actionType": "动作类型：就餐/游玩/交通/休息/购物/接送",
          "poiId": "地点ID，必须来自工具返回结果",
          "poiName": "地点名称",
          "reasoning": "安排理由，必须体现用户画像考量",
          "requiredBooking": true/false
        }
      ]
    }
  ]
}
\`\`\`

## 重要约束

1. **poiId 必须来自工具返回**：禁止凭空编造地点 ID，所有 ID 必须来自 searchLocalActivities 的结果
2. **时间不能重叠**：steps 中的时间必须按顺序排列，不能有时间冲突
3. **reasoning 必须具体**：说明该安排如何满足用户的具体需求（如"孩子5岁"）
4. **方案必须有差异**：多个方案应在主题、节奏或预算上有明显区别

## 响应格式

在完成所有工具调用后，直接输出符合 FinalResponse Schema 的 JSON 对象。
不要输出任何额外的解释性文字，只输出纯 JSON。`;

/**
 * 将 Zod Schema 转换为 JSON Schema，用于 LLM 的 structured output
 */
const outputJsonSchema = zodToJsonSchema(finalResponseSchema as unknown as Parameters<typeof zodToJsonSchema>[0], "FinalResponse");

// ============================================================================
// Tool Execution Map
// ============================================================================

/**
 * 工具函数映射表
 *
 * 根据工具名称动态调用对应的工具函数
 */
const toolFunctionMap = {
  getCurrentContext: async (args: unknown) => {
    const parsed = z.object({ location: z.string() }).parse(args);
    return getCurrentContext({ location: parsed.location } as GetCurrentContextRequest);
  },
  searchLocalActivities: async (args: unknown) => {
    const parsed = z
      .object({
        query: z.string(),
        requirements: z.array(z.string()).optional(),
        radius: z.number().optional(),
        sortBy: z.enum(["distance", "rating", "popularity"]).optional(),
      })
      .parse(args);
    return searchLocalActivities({
      query: parsed.query,
      requirements: parsed.requirements,
      radius: parsed.radius,
      sortBy: parsed.sortBy,
    } as SearchLocalActivitiesRequest);
  },
  checkBookingStatus: async (args: unknown) => {
    const parsed = z.object({ poiId: z.string() }).parse(args);
    return checkBookingStatus({ poiId: parsed.poiId } as CheckBookingStatusRequest);
  },
} as const;

/**
 * 工具名称类型
 */
type ToolName = keyof typeof toolFunctionMap;

// ============================================================================
// LLM Interaction Functions
// ============================================================================

/**
 * 调用 OpenAI兼容 API 执行对话
 *
 * @param messages - 对话消息历史
 * @param config - LLM 配置
 * @returns API 响应文本
 *
 * @throws Error 当 API 调用失败时抛出错误
 */
async function callLlm(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  config: Required<LlmConfig>
): Promise<string> {
  // 构建 OpenAI 请求体
  const requestBody = {
    model: config.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    // 强制结构化输出
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "FinalResponse",
        schema: outputJsonSchema,
        strict: true,
      },
    },
  };

  try {
    // 调用 OpenAI 兼容 API
    // 注意：在生产环境中应使用 openai SDK 的官方客户端
    const response = await fetch(`${openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API 调用失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    // 提取 assistant 的回复内容
    const assistantMessage = data.choices?.[0]?.message?.content;
    if (!assistantMessage) {
      throw new Error("LLM 响应格式异常，未找到有效内容");
    }

    return assistantMessage;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TimeoutError") {
        throw new Error(`LLM 请求超时（${config.timeout}ms）`);
      }
      throw error;
    }
    throw new Error(`LLM 调用失败: ${String(error)}`);
  }
}

/**
 * 解析 LLM 的 Function Calling 请求并执行
 *
 * @param toolCall - LLM 返回的工具调用请求
 * @returns 工具执行结果
 *
 * @throws Error 当工具名称未知或执行失败时抛出错误
 */
async function executeToolCall(toolCall: { name: string; arguments: string }): Promise<unknown> {
  const { name, arguments: argsString } = toolCall;

  // 解析 JSON 参数
  let args: unknown;
  try {
    args = JSON.parse(argsString);
  } catch {
    throw new Error(`工具 ${name} 的参数格式错误，无法解析为 JSON`);
  }

  // 查找对应的工具函数
  const toolFunction = toolFunctionMap[name as ToolName];
  if (!toolFunction) {
    const availableTools = Object.keys(toolFunctionMap).join(", ");
    throw new Error(`未知工具: ${name}，可用工具: ${availableTools}`);
  }

  // 执行工具函数
  try {
    const result = await toolFunction(args);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`工具 ${name} 执行失败: ${message}`);
  }
}

// ============================================================================
// Main Planning Agent
// ============================================================================

/**
 * 构建用户消息
 *
 * 将用户的请求和上下文信息格式化为发送给 LLM 的消息
 *
 * @param request - 用户的规划请求
 * @returns 格式化的用户消息
 */
function buildUserMessage(request: PlanningRequest): string {
  const constraints: string[] = [];

  // 城市
  const city = request.city ?? demoProfile.city;
  constraints.push(`城市: ${city}`);

  // 起点
  const startPoint = request.startPoint ?? demoProfile.startPoint;
  constraints.push(`起点: ${startPoint}`);

  // 同行人
  const companions = request.companions ?? "family";
  constraints.push(`同行人: ${companions}`);

  // 预算
  if (request.budget) {
    constraints.push(`预算上限: ${request.budget}元`);
  }

  // 出发时间
  if (request.departAt) {
    constraints.push(`出发时间: ${request.departAt}`);
  }

  // 同行人详情
  let memberDetails = "";
  if (companions === "family" || companions === "friends") {
    memberDetails = demoProfile.family.map((m) => `- ${m}`).join("\n");
    if (memberDetails) {
      memberDetails = `\n家庭成员:\n${memberDetails}`;
    }
  }

  // 用户偏好
  let preferenceDetails = "";
  if (demoProfile.preferences.length > 0) {
    preferenceDetails = `\n用户偏好:\n${demoProfile.preferences.map((p) => `- ${p}`).join("\n")}`;
  }

  return `## 用户需求

原始需求: ${request.prompt}

## 约束条件

${constraints.join("\n")}
${memberDetails}
${preferenceDetails}

## 任务

请根据上述需求和约束，执行以下步骤：

1. 调用 getCurrentContext 获取 ${startPoint} 的当前环境信息
2. 调用 searchLocalActivities 搜索符合用户需求的兴趣点
3. 对需要预约的地点调用 checkBookingStatus 确认状态
4. 综合所有信息，生成 1-3 套差异化的行程方案

## 输出要求

请严格按照 FinalResponse Schema 输出 JSON 结果，不要输出任何额外文字。`;
}

/**
 * 运行基于 LLM 的规划 Agent
 *
 * 这是新的核心规划函数，使用 OpenAI API 进行自然语言理解和规划生成。
 * 它会自主调用工具获取上下文数据，并生成符合 schema 的结构化输出。
 *
 * @param request - 用户的规划请求
 * @param config - LLM 配置（可选）
 * @returns 结构化的规划结果
 *
 * @throws Error 当 LLM 调用失败、工具执行失败或输出格式错误时抛出错误
 *
 * @example
 * const result = await runLlmPlanningAgent({
 *   prompt: "周六带孩子去西湖玩",
 *   companions: "family",
 *   budget: 500
 * });
 * console.log(result.plans);
 */
export async function runLlmPlanningAgent(
  request: PlanningRequest,
  config?: LlmConfig
): Promise<FinalResponse> {
  // 合并配置
  const llmConfig: Required<LlmConfig> = { ...defaultLlmConfig, ...config };

  // 构建消息历史
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(request) },
  ];

  // 追踪已使用的工具，避免重复调用
  const usedTools = new Set<string>();
  const maxToolCalls = 10; // 防止无限循环

  try {
    // 循环调用 LLM，处理 function calling
    for (let iteration = 0; iteration < maxToolCalls; iteration++) {
      // 调用 LLM
      const response = await callLlm(messages, llmConfig);

      // 将 LLM 的响应添加到消息历史
      messages.push({ role: "assistant", content: response });

      // 尝试解析为 JSON
      try {
        const parsed = JSON.parse(response);

        // 检查是否为最终结果（包含 plans 字段）
        if ("plans" in parsed) {
          // 验证输出格式
          const [ok, resultOrError] = safeValidateFinalResponse(parsed);

          if (ok) {
            return resultOrError;
          } else {
            // 输出不符合 schema，追加纠正消息
            messages.push({
              role: "user",
              content: `你刚才的输出不符合 FinalResponse Schema 的要求:\n${resultOrError}\n\n请重新生成，严格按照 Schema 格式输出 JSON。`,
            });
            continue;
          }
        }

        // 如果 LLM 返回了函数调用请求（兼容旧版格式）
        if ("tool_calls" in parsed && Array.isArray(parsed.tool_calls)) {
          // 执行所有工具调用
          const toolResults = await Promise.all(
            parsed.tool_calls.map(async (toolCall: { id?: string; function?: { name?: string; arguments?: string }; name?: string; arguments?: string }) => {
              const toolName = toolCall.function?.name ?? toolCall.name ?? "unknown";
              const argsString = toolCall.function?.arguments ?? toolCall.arguments ?? "{}";

              usedTools.add(toolName);

              // 执行工具
              const result = await executeToolCall({ name: toolName, arguments: argsString });

              // 返回工具结果，格式兼容 OpenAI function calling
              return {
                tool_call_id: toolCall.id,
                role: "tool" as const,
                name: toolName,
                content: JSON.stringify(result, null, 2),
              };
            })
          );

          // 将工具结果添加到消息历史
          messages.push({
            role: "assistant",
            content: JSON.stringify({ tool_calls: parsed.tool_calls }),
          });

          for (const toolResult of toolResults) {
            messages.push(toolResult as { role: "system" | "user" | "assistant"; content: string });
          }

          continue;
        }

        // 如果既不是最终结果也不是工具调用，继续循环
        // LLM 可能还在思考
      } catch (parseError) {
        // JSON 解析失败，可能是 LLM 还在思考过程
        // 追加提示让 LLM 完成规划
        messages.push({
          role: "user",
          content: "请继续完成规划。如果你已经收集到足够的信息，请直接输出符合 FinalResponse Schema 的 JSON 结果。",
        });
      }
    }

    // 达到最大迭代次数仍未得到有效结果
    throw new Error(`规划过程超过最大迭代次数（${maxToolCalls}），请检查工具调用或 LLM 响应`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 记录错误日志
    console.error("[runLlmPlanningAgent] 错误:", message, {
      request: request.prompt,
      usedTools: Array.from(usedTools),
      messageCount: messages.length,
    });

    throw new Error(`规划失败: ${message}`);
  }
}

// ============================================================================
// Legacy Functions (保持向后兼容)
// ============================================================================

/**
 * @deprecated 请使用 runLlmPlanningAgent 代替
 *
 * 原有 Mock 实现的请求验证 Schema
 */
export const planningRequestSchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  city: z.string().optional(),
  startPoint: z.string().optional(),
  companions: z.enum(["family", "friends", "couple", "solo"]).optional(),
  budget: z.number().positive().optional(),
  departAt: z.string().optional(),
});

/**
 * @deprecated 请使用 runLlmPlanningAgent 代替
 *
 * 原有 Mock 实现，保留用于开发测试
 */
export function runPlanningAgent(input: PlanningRequest): AgentResult {
  const startPoint = input.startPoint ?? demoProfile.startPoint;
  const city = input.city ?? demoProfile.city;
  const budget = input.budget ? `预算约 ￥${input.budget}` : "预算约 ￥420";
  const selectedPlanId = input.companions === "friends" ? "plan_b" : "plan_a";

  return {
    traceId: `trace_${Date.now()}`,
    startPoint,
    destination: `${city}西湖 / 湖滨`,
    summary: `已根据「${input.prompt}」生成三套周末方案。当前推荐亲子低负担路线，${budget}，支付需用户本人确认。`,
    toolLogs: [],
    options: planOptions,
    selectedPlanId,
    authorization: ["定位用于距离判断", "餐厅预约需用户确认", "票务仅锁单不付款", "日历和分享可单独授权"],
    nextActions: ["确认起点", "选择方案", "授权预约", "发送给家人确认", "写入日历提醒"],
  };
}

/**
 * 解析用户需求，提取约束条件
 *
 * @deprecated 此函数保留用于解析用户输入，具体规划请使用 runLlmPlanningAgent
 */
export function parseDemand(input: PlanningRequest) {
  return {
    raw: input.prompt,
    city: input.city ?? demoProfile.city,
    startPoint: input.startPoint ?? demoProfile.startPoint,
    companions: input.companions ?? "family",
    constraints: [
      "40 分钟内优先",
      "孩子步行负担低",
      "晚餐减脂友好",
      input.budget ? `预算上限 ￥${input.budget}` : "预算 300-500",
    ],
    missingSlots: input.startPoint ? [] : ["location-confirmation"],
  };
}

/**
 * What-If 场景模拟
 *
 * @deprecated 此函数保留用于 What-If 分析，具体规划请使用 runLlmPlanningAgent
 */
export function simulateWhatIf(planId: string, scenario: "rain" | "late" | "budget" | "traffic") {
  const base = planOptions.find((plan) => plan.id === planId) ?? planOptions[0];
  const strategies = {
    rain: {
      title: "雨天室内兜底",
      changes: ["缩短白堤散步", "切换室内亲子展", "保留海底捞晚餐"],
      score: 88,
    },
    late: {
      title: "晚出发压缩",
      changes: ["取消断桥停留", "湖滨休息前置", "晚餐时间延后 20 分钟"],
      score: 84,
    },
    budget: {
      title: "预算压缩",
      changes: ["地铁替代打车", "取消可选电影", "餐厅换为轻餐"],
      score: 81,
    },
    traffic: {
      title: "交通拥堵重规划",
      changes: ["切换地铁路线", "调整入口到龙翔桥", "推迟餐厅预约"],
      score: 86,
    },
  };

  return {
    basePlan: base.title,
    weather,
    trafficRoutes,
    scenario,
    ...strategies[scenario],
  };
}

// ============================================================================
// Export Tool Definitions for External Use
// ============================================================================

/**
 * 导出工具定义，供外部系统（如 Vercel AI SDK）使用
 */
export { toolDefinitions };

/**
 * 导出 output schema，供外部系统使用
 */
export { outputJsonSchema };
