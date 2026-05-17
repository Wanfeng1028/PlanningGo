import { z } from "zod";

// ============================================================================
// ExecutionStep - 单个执行步骤
// ============================================================================

/**
 * ExecutionStep 定义了一个完整的、可落地执行的行程步骤。
 *
 * 每个 ExecutionStep 代表用户在行程中需要完成的最小执行单元，
 * 如在某餐厅就餐、游览某景点、乘坐某交通工具等。
 *
 * 大模型在生成 ExecutionStep 时必须满足以下约束：
 * - poild 必须来源于 tools.ts 中 searchLocalActivities 的返回值
 * - timeSlot 必须与前序步骤的时间衔接，不能有时间冲突
 * - reasoning 必须体现对用户画像（家庭成员、健康偏好等）的考量
 * - requiredBooking 为 true 时，agent 应自动调用预订工具
 */
export const executionStepSchema = z.object({
  /**
   * 时间段，格式为 "HH:MM-HH:MM"，24 小时制。
   *
   * 示例："14:00-15:30" 表示下午两点到三点半。
   *
   * 约束：
   * - 起始时间必须小于结束时间
   * - 连续步骤之间应保持合理间隔（如餐厅到景点至少间隔 10 分钟交通时间）
   * - 整个行程时间应落在用户指定的活动时间段内
   */
  timeSlot: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, {
    message: "timeSlot 格式必须为 HH:MM-HH:MM，如 '14:00-15:30'",
  }),

  /**
   * 动作类型，决定了该步骤的核心行为类别。
   *
   * 可选值：
   * - "就餐"：餐饮消费活动，包括早餐、午餐、晚餐、下午茶、宵夜等
   * - "游玩"：观光、游览、娱乐活动，包括景点打卡、展览参观、游乐设施等
   * - "交通"：位移活动，包括打车、地铁、步行、自驾等
   * - "休息"：停留、休整活动，如酒店休息、咖啡厅小憩、公园长椅等
   * - "购物"：商业消费活动，如逛街、特产购买等
   * - "接送"：接送人员，如接人、送孩子等
   *
   * 约束：
   * - 一个完整的行程应包含合理的动作类型分布
   * - 亲子类行程应控制"游玩"类步骤的持续时间，避免孩子疲劳
   */
  actionType: z.enum(["就餐", "游玩", "交通", "休息", "购物", "接送"], {
    errorMap: () => ({ message: "actionType 必须为 '就餐'、'游玩'、'交通'、'休息'、'购物' 或 '接送'" }),
  }),

  /**
   * 地点 ID，必须与 tools.ts 中 searchLocalActivities 返回的 LocalPoi.id 对应。
   *
   * 示例："poi_004" 对应海底捞湖滨店，"poi_005" 对应室内亲子展。
   *
   * 约束：
   * - 必须是有效的 POI ID，不允许凭空编造
   * - 建议在生成 Plan 前先调用 searchLocalActivities 获取可用 POI 列表
   * - 对于交通类步骤（如打车），poiId 可填写交通枢纽的 ID
   */
  poiId: z.string().min(1, { message: "poiId 不能为空" }),

  /**
   * 地点名称，应与 poiId 对应的 POI 名称一致。
   *
   * 示例："海底捞湖滨店"、"西湖断桥"、"浙大紫金港"。
   *
   * 约束：
   * - 应与 searchLocalActivities 返回的 LocalPoi.name 一致
   * - 便于用户理解和确认目的地
   */
  poiName: z.string().min(1, { message: "poiName 不能为空" }),

  /**
   * 安排此项的理由说明，必须体现对用户状态的考量。
   *
   * 内容要求：
   * - 必须提及具体的服务对象（如"孩子"、"老人"、"伴侣"、"全家"等）
   * - 必须说明该项选择如何满足用户的特定偏好（如"减脂友好"、"低步行"、"无需排队"）
   * - 必须包含对上下文信息的引用（如天气、交通状况、时间约束）
   *
   * 示例：
   * - "午餐选择海底捞湖滨店，步行 5 分钟可达，孩子可在儿童游乐区玩耍，大人可专心用餐，符合减脂友好偏好"
   * - "断桥为西湖标志性景点，拍照效果好，14:00 人流较少，适合亲子打卡，且距离餐厅步行 10 分钟"
   * - "考虑到下午有 65% 降雨概率，将原定户外活动调整为室内亲子展，孩子可在安全环境中活动"
   *
   * 约束：
   * - 不得为空字符串
   * - 理由应逻辑自洽，与前序步骤和后续步骤衔接合理
   */
  reasoning: z.string().min(10, { message: "reasoning 长度至少 10 个字符，必须说明安排理由" }),

  /**
   * 是否需要调用预订 API，标识该步骤是否需要 Agent 自动完成预约操作。
   *
   * 何时为 true：
   * - 餐厅需要提前预约座位（如海底捞、网红餐厅）
   * - 景点需要提前购票或预约时段（如博物馆、热门展览）
   * - 演出、活动需要锁定座位
   * - 需要预约专属服务（如专车接送、儿童托管）
   *
   * 何时为 false：
   * - 免费景点无需预约
   * - 随时可进入的场所（如商场、公园）
   * - 交通类步骤（打车随时可叫）
   * - 用户已自行预订的场所
   *
   * 注意：
   * - requiredBooking 为 true 时，Agent 应调用 reservations 相关 API
   * - 预订前应先调用 checkBookingStatus 确认可用性
   * - 如果 checkBookingStatus 返回 "not_available"，则该步骤应标记 requiredBooking 为 false 并调整方案
   */
  requiredBooking: z.boolean(),
});

/**
 * ExecutionStep 类型推断
 */
export type ExecutionStep = z.infer<typeof executionStepSchema>;

// ============================================================================
// ActivityPlan - 单套完整方案
// ============================================================================

/**
 * ActivityPlan 定义了一套完整的、可执行的本地生活规划方案。
 *
 * 每个 ActivityPlan 代表用户可以选择的一个完整行程选项，
 * 应包含从出发到返回（或活动结束）的全部步骤。
 *
 * 大模型在生成 ActivityPlan 时必须满足以下约束：
 * - 方案必须满足用户明确提出的约束条件（如预算、时间、成员构成）
 * - steps 数组必须按时间顺序排列，时间不得重叠
 * - 连续步骤之间必须有合理的交通时间或休息安排
 * - 必须包含至少一个"游玩"或"就餐"类核心活动
 */
export const activityPlanSchema = z.object({
  /**
   * 方案主题名称，用于向用户呈现方案的核心理念。
   *
   * 命名规范：
   * - 应简洁明了，控制在 20 个字符以内
   * - 应体现方案的核心特色（如"亲子"、"轻奢"、"快闪"等标签）
   * - 应包含目的地类型或主要活动类型
   *
   * 示例：
   * - "亲子西湖低负担一日游"
   * - "朋友 Citywalk 文艺之旅"
   * - "雨天室内遛娃备选方案"
   * - "浪漫西湖夕阳晚餐"
   *
   * 约束：
   * - 不得为空字符串
   * - 应与方案内容匹配，避免标题党
   */
  planTitle: z.string().min(1, { message: "planTitle 不能为空" }).max(50, { message: "planTitle 不宜超过 50 个字符" }),

  /**
   * 方案总耗时，格式为带单位的字符串。
   *
   * 格式规范：数字 + 单位，如 "4.5h"、"3h"、"2.5h"。
   *
   * 计算方式：
   * - 从第一个步骤的起始时间到最后一个步骤的结束时间
   * - 包含所有步骤之间的交通时间
   * - 不包含纯休息时间（如午休）除非用户明确要求
   *
   * 示例："4.5h" 表示方案总耗时 4.5 小时
   *
   * 约束：
   * - 应与 steps 中实际时间跨度一致
   * - 亲子类行程建议控制在 5 小时以内，避免孩子疲劳
   */
  totalDurationHours: z.string().regex(/^\d+(\.\d+)?h$/, {
    message: "totalDurationHours 格式必须为数字 + 'h'，如 '4.5h'、'3h'",
  }),

  /**
   * 预估总花费，包含方案中所有需要付费项目的合计金额。
   *
   * 格式规范：带货币符号的字符串，如 "￥420"、"￥350-500"。
   *
   * 计算范围：
   * - 餐厅就餐：按人均估算（应参考 searchLocalActivities 返回的 avgPrice）
   * - 门票演出：按人数和单价计算
   * - 交通费用：打车费、停车费等
   * - 预约服务费：如果适用
   *
   * 不包含：
   * - 购物消费（除非用户明确要求）
   * - 小费、额外服务费
   *
   * 示例："￥420" 表示预估花费 420 元，"￥350-500" 表示预估花费在 350 到 500 元之间
   *
   * 约束：
   * - 应与用户预算范围匹配（如果用户指定了预算上限）
   * - 应参考 POI 的实际价格信息计算
   */
  totalEstimatedCost: z.string().min(1, { message: "totalEstimatedCost 不能为空" }),

  /**
   * 行程步骤数组，包含该方案的所有执行步骤。
   *
   * 排序规则：
   * - 必须按时间顺序排列（第一个步骤在最前）
   * - 不得有时间重叠
   * - 连续步骤之间应考虑交通时间
   *
   * 内容要求：
   * - 至少包含 2 个步骤
   * - 建议包含 3-6 个步骤，覆盖完整的行程
   * - 应包含起点的出发步骤和终点/返程步骤
   *
   * 步骤连贯性要求：
   * - 前一步骤的结束时间应合理地早于后一步骤的开始时间
   * - 不同地点之间应考虑交通耗时（建议每个跨地点步骤预留 10-30 分钟交通时间）
   * - 亲子行程应安排适当的休息节点
   *
   * @see ExecutionStep
   */
  steps: z
    .array(executionStepSchema)
    .min(2, { message: "steps 至少需要 2 个步骤" })
    .refine(
      (steps) => {
        // 验证时间顺序
        for (let i = 1; i < steps.length; i++) {
          const prevEnd = steps[i - 1].timeSlot.split("-")[1];
          const currStart = steps[i].timeSlot.split("-")[0];
          if (prevEnd > currStart) {
            return false;
          }
        }
        return true;
      },
      { message: "steps 中的时间必须按顺序排列，不能有时间重叠" }
    ),
});

/**
 * ActivityPlan 类型推断
 */
export type ActivityPlan = z.infer<typeof activityPlanSchema>;

// ============================================================================
// FinalResponse - 最终输出结果
// ============================================================================

/**
 * FinalResponse 是大模型完成规划后的最终输出结构。
 *
 * 该结构用于向用户呈现 1 到 3 套可选的行程方案，
 * 每套方案从不同维度满足用户的规划需求。
 *
 * 大模型在生成 FinalResponse 时必须满足以下约束：
 * - plans 数组必须包含 1 到 3 个方案
 * - 多个方案之间应有明显的差异化（如主题、节奏、预算等）
 * - 应向用户说明推荐方案的推荐理由
 * - 应提供明确的决策引导
 *
 * 方案差异化指南：
 * - 方案 A（推荐）：最符合用户原始需求的方案
 * - 方案 B：提供不同的侧重点（如更轻松、更丰富、更经济等）
 * - 方案 C：兜底方案（如天气变化、预算调整、突发情况的备选）
 */
export const finalResponseSchema = z.object({
  /**
   * 方案数组，包含 1 到 3 套可选的行程规划。
   *
   * 数量约束：
   * - 至少 1 个方案
   * - 最多 3 个方案
   * - 建议提供 2-3 个方案供用户选择
   *
   * 差异化要求：
   * - 各方案应在主题、节奏、预算或体验上有明显区别
   * - 避免生成高度相似的重复方案
   * - 应覆盖不同的场景（如晴天/雨天、亲子/朋友、经济/轻奢等）
   *
   * 推荐标记：
   * - 应在 planTitle 中包含"推荐"字样标识最推荐的方案
   * - 推荐依据应基于用户需求匹配度最高
   *
   * @see ActivityPlan
   */
  plans: z
    .array(activityPlanSchema)
    .min(1, { message: "plans 至少需要 1 个方案" })
    .max(3, { message: "plans 最多 3 个方案" }),
});

/**
 * FinalResponse 类型推断
 */
export type FinalResponse = z.infer<typeof finalResponseSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 根据 Zod schema 验证 ExecutionStep 数据
 *
 * @param data 待验证的数据
 * @returns 验证结果，如果验证失败会抛出 ZodError
 * @throws ZodError 验证失败时抛出
 *
 * @example
 * try {
 *   const validated = validateExecutionStep({
 *     timeSlot: "14:00-15:30",
 *     actionType: "就餐",
 *     poiId: "poi_004",
 *     poiName: "海底捞湖滨店",
 *     reasoning: "选择海底捞是因为孩子可以在儿童游乐区玩耍",
 *     requiredBooking: true,
 *   });
 *   console.log("验证通过", validated);
 * } catch (error) {
 *   console.error("验证失败", error.errors);
 * }
 */
export function validateExecutionStep(data: unknown): ExecutionStep {
  return executionStepSchema.parse(data);
}

/**
 * 根据 Zod schema 验证 ActivityPlan 数据
 *
 * @param data 待验证的数据
 * @returns 验证结果，如果验证失败会抛出 ZodError
 * @throws ZodError 验证失败时抛出
 */
export function validateActivityPlan(data: unknown): ActivityPlan {
  return activityPlanSchema.parse(data);
}

/**
 * 根据 Zod schema 验证 FinalResponse 数据
 *
 * @param data 待验证的数据
 * @returns 验证结果，如果验证失败会抛出 ZodError
 * @throws ZodError 验证失败时抛出
 */
export function validateFinalResponse(data: unknown): FinalResponse {
  return finalResponseSchema.parse(data);
}

/**
 * 安全地尝试验证 ExecutionStep，不会抛出异常
 *
 * @param data 待验证的数据
 * @returns 验证结果元组 [成功标志, 结果或错误信息]
 *
 * @example
 * const [ok, result] = safeValidateExecutionStep(data);
 * if (ok) {
 *   console.log("验证通过", result);
 * } else {
 *   console.error("验证失败", result);
 * }
 */
export function safeValidateExecutionStep(data: unknown): [true, ExecutionStep] | [false, string] {
  const result = executionStepSchema.safeParse(data);
  if (result.success) {
    return [true, result.data];
  }
  return [false, result.error.issues.map((e) => e.message).join("; ")];
}

/**
 * 安全地尝试验证 ActivityPlan，不会抛出异常
 *
 * @param data 待验证的数据
 * @returns 验证结果元组 [成功标志, 结果或错误信息]
 */
export function safeValidateActivityPlan(data: unknown): [true, ActivityPlan] | [false, string] {
  const result = activityPlanSchema.safeParse(data);
  if (result.success) {
    return [true, result.data];
  }
  return [false, result.error.errors.map((e) => e.message).join("; ")];
}

/**
 * 安全地尝试验证 FinalResponse，不会抛出异常
 *
 * @param data 待验证的数据
 * @returns 验证结果元组 [成功标志, 结果或错误信息]
 */
export function safeValidateFinalResponse(data: unknown): [true, FinalResponse] | [false, string] {
  const result = finalResponseSchema.safeParse(data);
  if (result.success) {
    return [true, result.data];
  }
  return [false, result.error.errors.map((e) => e.message).join("; ")];
}
