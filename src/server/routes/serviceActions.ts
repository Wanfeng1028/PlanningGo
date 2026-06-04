/**
 * Service Actions 路由 — V3: 创建服务动作草稿
 *
 * 核心规则：
 * 1. 不执行真实下单/支付
 * 2. 所有 action status 只能是 prepared / redirect_required
 * 3. 不写 succeeded / confirmed
 * 4. 所有文案不包含"预约成功""下单成功""支付成功""已购买"
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { sendOk } from "../common/response.js";
import { optionalUserId } from "../common/uid.js";
import { createId } from "../common/id.js";
import { generateDeepLink } from "../modules/tools/deepLinks.js";

// ============================================================================
// Request / Response schemas
// ============================================================================

const prepareActionBodySchema = z.object({
  conversationId: z.string().optional(),
  planId: z.string().optional(),
  optionId: z.string().optional(),
  stepId: z.string().optional(),
  provider: z.enum(["meituan", "dianping", "eleme", "taobao_flash", "amap", "calendar", "mock"]),
  actionType: z.enum([
    "food_delivery",
    "restaurant_reservation",
    "group_buy",
    "navigation",
    "coffee_order",
    "movie_ticket",
    "calendar_event",
    "copy_booking_info",
  ]),
  poiName: z.string().optional(),
  poiAddress: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  userNote: z.string().optional(),
  recommendedItems: z.array(z.object({
    name: z.string(),
    quantity: z.number().int().positive(),
    estimatedPrice: z.number().optional(),
  })).optional(),
});

const prepareActionResponseSchema = z.object({
  actionId: z.string(),
  status: z.enum(["prepared", "redirect_required"]),
  title: z.string(),
  description: z.string(),
  redirectUrl: z.string().optional(),
  copyText: z.string().optional(),
  riskNotice: z.string(),
});

const RISK_NOTICE = "价格、库存、配送费、优惠券和预约结果以第三方平台最终页面为准。";

// ============================================================================
// Route registration
// ============================================================================

export async function registerServiceActionRoutes(app: FastifyInstance) {
  // ── POST /api/service-actions/prepare — 创建服务动作草稿 ──
  app.post("/api/service-actions/prepare", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = prepareActionBodySchema.parse(request.body ?? {});
    const userId = optionalUserId(request);

    // 生成 action ID
    const actionId = createId(`svc_action`);

    // 根据 provider 和 actionType 生成 redirectUrl
    let redirectUrl: string | undefined;
    let copyText: string | undefined;

    if (body.provider === "amap" || body.actionType === "navigation") {
      const deepLink = generateDeepLink({
        provider: "amap",
        poiName: body.poiName || "目的地",
        lat: body.lat,
        lng: body.lng,
        action: "navigate",
      });
      redirectUrl = deepLink.url;
    } else if (body.provider === "meituan" || body.actionType === "restaurant_reservation" || body.actionType === "group_buy") {
      const deepLink = generateDeepLink({
        provider: "meituan",
        poiName: body.poiName || "餐厅",
        action: "search",
      });
      redirectUrl = deepLink.url;
    } else if (body.provider === "dianping" || body.actionType === "movie_ticket") {
      const deepLink = generateDeepLink({
        provider: "dianping",
        poiName: body.poiName || "影院",
        action: "search",
      });
      redirectUrl = deepLink.url;
    } else if (body.provider === "eleme" || body.actionType === "food_delivery" || body.actionType === "coffee_order") {
      const deepLink = generateDeepLink({
        provider: "eleme",
        poiName: body.poiName || "商家",
        action: "search",
      });
      redirectUrl = deepLink.url;
    }

    // copy_booking_info 类型生成复制文案
    if (body.actionType === "copy_booking_info" && body.poiName) {
      const lines = [body.poiName];
      if (body.poiAddress) lines.push(`地址：${body.poiAddress}`);
      if (body.userNote) lines.push(`备注：${body.userNote}`);
      copyText = lines.join("\n");
    }

    // 确定状态：有 redirectUrl 则为 redirect_required，否则为 prepared
    const status: "prepared" | "redirect_required" = redirectUrl ? "redirect_required" : "prepared";

    // 标题和描述
    const titleMap: Record<string, string> = {
      restaurant_reservation: "查看美团",
      group_buy: "查看团购",
      food_delivery: "生成外卖下单草稿",
      coffee_order: "生成饮品下单草稿",
      movie_ticket: "查看电影票",
      navigation: "打开高德导航",
      calendar_event: "生成日历事件",
      copy_booking_info: "复制预约信息",
    };

    const descriptionMap: Record<string, string> = {
      restaurant_reservation: "查看该餐厅在美团上的团购、排队和预约信息",
      group_buy: "查看该地点的团购优惠和门票信息",
      food_delivery: "根据你的偏好生成外卖下单草稿，已为你选好推荐商品",
      coffee_order: "根据你的偏好生成饮品下单草稿",
      movie_ticket: "查看该影院在猫眼/淘票票上的排片和优惠票",
      navigation: "导航到目的地，方便你规划路线",
      calendar_event: "将活动写入日历，并在出发前提醒",
      copy_booking_info: "复制地点信息，方便你手动预约",
    };

    const title = titleMap[body.actionType] || "服务入口";
    const description = descriptionMap[body.actionType] || "已为你整理好服务信息";

    // 写入 DB Action 表
    const db = app.db;
    if (db && userId) {
      try {
        await db.action.create({
          data: {
            id: actionId,
            userId,
            planId: body.planId ?? null,
            planOptionId: body.optionId ?? null,
            type: body.actionType,
            provider: body.provider,
            status,
            confirmationRequired: true,
            idempotencyKey: createId(`idemp_${body.actionType}`),
            payload: {
              conversationId: body.conversationId ?? null,
              stepId: body.stepId ?? null,
              poiName: body.poiName ?? null,
              poiAddress: body.poiAddress ?? null,
              lat: body.lat ?? null,
              lng: body.lng ?? null,
              userNote: body.userNote ?? null,
              redirectUrl: redirectUrl ?? null,
              copyText: copyText ?? null,
              recommendedItems: body.recommendedItems ?? null,
              createdAt: new Date().toISOString(),
            } as unknown as Prisma.InputJsonValue,
            createdAt: new Date(),
          },
        });
      } catch (err) {
        app.log.warn({ err }, "[service-actions:prepare] failed to persist action to DB");
      }
    }

    // 记录埋点
    app.log.info(
      { userId, actionId, actionType: body.actionType, provider: body.provider },
      "[service-actions:prepare] action created",
    );

    return sendOk(reply, {
      actionId,
      status,
      title,
      description,
      redirectUrl,
      copyText,
      riskNotice: RISK_NOTICE,
    });
  });
}
