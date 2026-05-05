import type { NavKey, PageSpec } from "../types";

const navMap: Record<string, NavKey> = {
  首页: "home",
  功能页卡: "features",
  功能: "features",
  规划: "features",
  地图: "features",
  消息: "features",
  场景案例: "cases",
  设计亮点: "design",
  开发者: "developers",
  个人中心: "profile",
  我的: "profile",
};

const modalKeywords = ["弹窗", "授权", "登录", "注册", "画像", "预约表单", "支付", "投票", "权限", "导出", "删除", "API Key"];
const stateKeywords = ["状态", "加载", "空", "错误", "失败", "执行中", "预约中", "锁座中", "配送", "完成", "候位"];

function inferRender(title: string, platform: "desktop" | "mobile"): PageSpec["renderAs"] {
  if (platform === "mobile" && modalKeywords.some((word) => title.includes(word))) {
    return "sheet";
  }
  if (modalKeywords.some((word) => title.includes(word))) {
    return "modal";
  }
  if (stateKeywords.some((word) => title.includes(word))) {
    return "state";
  }
  if (["电影", "票务", "鲜花", "蛋糕", "Webhook"].some((word) => title.includes(word))) {
    return "drawer";
  }
  return "page";
}

function makePage(
  source: PageSpec["source"],
  platform: PageSpec["platform"],
  number: string,
  file: string,
  nav: string,
  title: string,
): PageSpec {
  return {
    id: `${source}-${platform}-${number}`,
    source,
    platform,
    number,
    file,
    nav: navMap[nav] ?? "features",
    title,
    renderAs: inferRender(title, platform),
    summary: `${title} 已按最终导航归入「${nav === "功能页卡" ? "功能" : nav}」，实现为可访问的${inferRender(title, platform)}视图。`,
  };
}

const finalDesktopRows = [
  ["001", "001_home_landing_westlake_agent.svg", "首页", "周末有谱：本地生活活动规划 Agent"],
  ["002", "002_home_problem_not_search.svg", "首页", "这不是搜索推荐，是帮你把事做完"],
  ["003", "003_home_demo_story_xiaoming.svg", "首页", "小明的周六上午 9 点"],
  ["004", "004_home_scenario_switch.svg", "首页", "家庭 / 朋友双场景入口"],
  ["005", "005_home_capability_overview.svg", "首页", "核心能力总览"],
  ["006", "006_home_navigation_map.svg", "首页", "按照 43 页导航栏重排后的主流程"],
  ["007", "007_home_start_demo_logged_in.svg", "首页", "进入演示：小明已登录"],
  ["008", "008_feature_hub_agent_entry.svg", "功能页卡", "功能页卡：本地生活 Agent"],
  ["009", "009_feature_message_input_9am.svg", "功能页卡", "一句话输入：今天下午帮我安排一下"],
  ["010", "010_feature_demand_chat_collection.svg", "功能页卡", "对话式需求收集"],
  ["011", "011_feature_location_permission_modal.svg", "功能页卡", "定位授权弹窗"],
  ["012", "012_feature_location_detecting.svg", "功能页卡", "定位中：正在确定小明当前位置"],
  ["013", "013_feature_start_point_confirm.svg", "功能页卡", "起点确认：浙大紫金港"],
  ["014", "014_feature_scene_identity_family_friend.svg", "功能页卡", "选择本次是谁一起出门"],
  ["015", "015_feature_family_constraints.svg", "功能页卡", "家庭约束：孩子 5 岁 + 老婆减脂"],
  ["016", "016_feature_friend_constraints.svg", "功能页卡", "朋友约束：4 人轻社交"],
  ["017", "017_feature_profile_memory_merge.svg", "功能页卡", "画像记忆合并进本次规划"],
  ["018", "018_feature_time_budget_distance.svg", "功能页卡", "时间 / 预算 / 距离约束确认"],
  ["019", "019_feature_poi_radius_scope.svg", "功能页卡", "POI 半径与商圈范围"],
  ["020", "020_feature_preparse_three_plans.svg", "功能页卡", "预解析三套方案卡片"],
  ["021", "021_feature_agent_workbench_planning.svg", "功能页卡", "Agent 工作台：规划拆解"],
  ["022", "022_feature_tool_call_stack.svg", "功能页卡", "工具调用栈"],
  ["023", "023_feature_map_traffic_fetch.svg", "功能页卡", "地图与交通数据读取"],
  ["024", "024_feature_restaurant_availability.svg", "功能页卡", "餐厅可订库存检查"],
  ["025", "025_feature_queue_reservation_source.svg", "功能页卡", "排队与预约状态"],
  ["026", "026_feature_weather_indoor_risk.svg", "功能页卡", "天气风险与室内兜底"],
  ["027", "027_feature_result_overview.svg", "功能页卡", "结果总览"],
  ["028", "028_feature_plan_a_family_westlake.svg", "功能页卡", "方案 A：亲子西湖低负担"],
  ["029", "029_feature_plan_b_friend_citywalk.svg", "功能页卡", "方案 B：朋友展览轻社交"],
  ["030", "030_feature_plan_c_rainy_indoor.svg", "功能页卡", "方案 C：雨天室内兜底"],
  ["031", "031_feature_plan_compare_fixed.svg", "功能页卡", "多方案对比：修复溢出版"],
  ["032", "032_feature_compare_score_detail.svg", "功能页卡", "评分明细：可信度 / 风险 / 预算"],
  ["033", "033_feature_plan_merge_suggestion.svg", "功能页卡", "合并优点"],
  ["034", "034_feature_plan_select_confirm.svg", "功能页卡", "选择最佳方案确认"],
  ["035", "035_feature_route_map_overview.svg", "功能页卡", "路线地图总览"],
  ["036", "036_feature_transport_zijingang_westlake.svg", "功能页卡", "交通方案：浙大紫金港 → 西湖"],
  ["037", "037_feature_westlake_walk_route.svg", "功能页卡", "西湖散步路线"],
  ["038", "038_feature_haidilao_place_detail.svg", "功能页卡", "海底捞餐厅详情"],
  ["039", "039_feature_restaurant_booking_form.svg", "功能页卡", "餐厅预约表单"],
  ["040", "040_feature_queue_status.svg", "功能页卡", "排队候位状态"],
  ["041", "041_feature_healthy_menu.svg", "功能页卡", "减脂友好菜单建议"],
  ["042", "042_feature_kid_friendly_checks.svg", "功能页卡", "亲子友好检查"],
  ["043", "043_feature_movie_option_discovery.svg", "功能页卡", "电影作为可选加餐前活动"],
  ["044", "044_feature_movie_seat_selection.svg", "功能页卡", "电影锁座页面"],
  ["045", "045_feature_activity_ticket_booking.svg", "功能页卡", "活动票务预约"],
  ["046", "046_feature_addon_flower_cake.svg", "功能页卡", "鲜花 / 蛋糕送到餐厅"],
  ["047", "047_feature_authorization_overview.svg", "功能页卡", "授权总览弹窗"],
  ["048", "048_feature_location_auth_detail.svg", "功能页卡", "授权细分：定位"],
  ["049", "049_feature_reservation_auth_detail.svg", "功能页卡", "授权细分：餐厅预约"],
  ["050", "050_feature_ticket_lock_auth.svg", "功能页卡", "授权细分：票务锁单"],
  ["051", "051_feature_payment_handoff.svg", "功能页卡", "支付交接：用户本人付款"],
  ["052", "052_feature_calendar_notify_auth.svg", "功能页卡", "授权细分：日历与通知"],
  ["053", "053_feature_execution_checklist.svg", "功能页卡", "Agent 执行动作清单"],
  ["054", "054_feature_haidilao_reserving.svg", "功能页卡", "执行中：海底捞预约"],
  ["055", "055_feature_ticket_hold_executing.svg", "功能页卡", "执行中：电影票锁座"],
  ["056", "056_feature_addon_delivery_schedule.svg", "功能页卡", "执行中：鲜花蛋糕配送"],
  ["057", "057_feature_all_actions_completed.svg", "功能页卡", "执行完成状态"],
  ["058", "058_feature_payment_success.svg", "功能页卡", "支付成功/待支付状态"],
  ["059", "059_feature_navigation_push.svg", "功能页卡", "导航推送与到达提醒"],
  ["060", "060_feature_share_to_wife.svg", "功能页卡", "把计划递给老婆确认"],
  ["061", "061_feature_share_to_friend.svg", "功能页卡", "把计划发给小张"],
  ["062", "062_feature_group_vote.svg", "功能页卡", "多人投票"],
  ["063", "063_feature_wife_feedback.svg", "功能页卡", "老婆反馈：想少走一点"],
  ["064", "064_feature_friend_comment_edit.svg", "功能页卡", "朋友反馈：加一个咖啡点"],
  ["065", "065_feature_plan_revise_after_feedback.svg", "功能页卡", "协作后自动改版"],
  ["066", "066_feature_final_itinerary_card.svg", "功能页卡", "最终行程卡"],
  ["067", "067_feature_what_if_departure.svg", "功能页卡", "What-if：如果 15:00 才出发"],
  ["068", "068_feature_what_if_rain.svg", "功能页卡", "What-if：如果下午下雨"],
  ["069", "069_feature_what_if_budget.svg", "功能页卡", "What-if：预算压到 300"],
  ["070", "070_feature_budget_conflict.svg", "功能页卡", "预算冲突处理"],
  ["071", "071_feature_weather_risk_replan.svg", "功能页卡", "天气风险重规划"],
  ["072", "072_feature_traffic_delay_replan.svg", "功能页卡", "交通拥堵重规划"],
  ["073", "073_feature_execution_failure_fallback.svg", "功能页卡", "执行失败兜底"],
  ["074", "074_feature_execution_audit_trace.svg", "功能页卡", "执行审计链路"],
  ["075", "075_feature_trip_feedback_rating.svg", "功能页卡", "行程评分反馈"],
  ["076", "076_feature_memory_update_after_trip.svg", "功能页卡", "记忆沉淀"],
  ["077", "077_feature_history_insights.svg", "功能页卡", "历史与洞察"],
  ["078", "078_case_family_westlake_afternoon.svg", "场景案例", "场景案例：家庭西湖下午"],
  ["079", "079_case_friend_citywalk_exhibition.svg", "场景案例", "场景案例：朋友展览 Citywalk"],
  ["080", "080_case_couple_fitness_dinner.svg", "场景案例", "场景案例：情侣减脂晚餐"],
  ["081", "081_case_rainy_indoor_backup.svg", "场景案例", "场景案例：雨天室内兜底"],
  ["082", "082_case_parent_child_load.svg", "场景案例", "场景案例：亲子低负担指标"],
  ["083", "083_case_late_replan_story.svg", "场景案例", "场景案例：晚出发自动压缩"],
  ["084", "084_case_demo_storyboard.svg", "场景案例", "答辩故事板"],
  ["085", "085_design_system_colors_typography.svg", "设计亮点", "设计亮点：颜色与字体"],
  ["086", "086_design_background_consistency.svg", "设计亮点", "底图背景统一规范"],
  ["087", "087_design_component_library.svg", "设计亮点", "组件库"],
  ["088", "088_design_modal_library.svg", "设计亮点", "弹窗库"],
  ["089", "089_design_status_states.svg", "设计亮点", "状态页库"],
  ["090", "090_design_navigation_consistency.svg", "设计亮点", "导航一致性检查"],
  ["091", "091_design_data_requirement_matrix.svg", "设计亮点", "数据需求矩阵"],
  ["092", "092_developer_console_api_key.svg", "开发者", "开发者：API Key 控制台"],
  ["093", "093_developer_tool_call_logs.svg", "开发者", "开发者：工具调用日志"],
  ["094", "094_developer_webhook_monitor.svg", "开发者", "开发者：Webhook 监控"],
  ["095", "095_developer_quality_dashboard.svg", "开发者", "开发者：质量看板"],
  ["096", "096_developer_admin_dataset.svg", "开发者", "开发者：测试数据集"],
  ["097", "097_profile_center_public.svg", "个人中心", "个人中心：画像总览"],
  ["098", "098_profile_login_register_setup.svg", "个人中心", "登录 / 注册 / 首次画像"],
  ["099", "099_profile_notification_account.svg", "个人中心", "通知与账号设置"],
  ["100", "100_profile_privacy_memory_export.svg", "个人中心", "隐私安全与记忆导出"],
];

const legacyD43Rows = [
  "官网首页", "身份选择：游客 / 登录 / 注册", "游客默认画像弹窗", "独立登录页", "独立注册页", "个人中心入口", "画像设置：城市", "画像设置：家庭成员", "画像设置：预算习惯", "记忆与画像中心", "功能页卡 / 先试试", "对话式需求收集", "对话内约束弹窗", "预解析三套方案卡片", "Agent 工作台", "结果总览", "多方案对比", "路线与预订", "授权弹窗", "执行动作页", "分享与日历协作", "协作确认页", "行程评分反馈", "历史与洞察", "地点详情", "预订结算", "临时改约 / 重新规划", "通知中心", "隐私与安全", "开发者控制台 / API Key", "账号设置", "质量看板", "UI 设计系统", "产品流程亮点", "任务工作流亮点", "数据需求矩阵", "弹窗组件库", "状态页组件", "多人偏好设置", "方案版本历史", "团队定价页", "营销长页", "移动端关键流程总览",
];

const legacyI28Rows = [
  "官网首页", "方案卡片页", "登录注册合并原稿", "首次偏好设置", "功能页卡 / 先试试", "需求构建器", "Agent 工作台", "结果总览", "路线与预订", "多方案对比", "分享 / 日历", "历史收藏", "个人中心", "多人偏好设置", "质量看板", "移动端关键流程总览", "设计系统", "产品流程地图", "营销长页", "地点详情", "预订结算", "临时改约 / 重新规划", "notification center", "安全设置", "开发者控制台", "移动端方案详情总览", "空 / 加载 / 错误状态", "团队定价页",
];

const mobileRows = [
  ["001", "首页", "首页落地"], ["002", "规划", "9点一句话输入"], ["003", "规划", "定位授权"], ["004", "地图", "起点确认地图"], ["005", "规划", "家庭/朋友切换"], ["006", "规划", "家庭约束"], ["007", "规划", "朋友约束"], ["008", "规划", "预解析三方案"], ["009", "规划", "Agent 工作台"], ["010", "规划", "工具调用状态"], ["011", "地图", "地图路线总览"], ["012", "地图", "西湖散步路线"], ["013", "规划", "海底捞详情"], ["014", "规划", "餐厅预约授权"], ["015", "规划", "电影锁座授权"], ["016", "规划", "支付由用户确认"], ["017", "规划", "执行队列"], ["018", "规划", "海底捞预约中"], ["019", "规划", "票务锁座中"], ["020", "规划", "鲜花蛋糕配送"], ["021", "规划", "全部执行完成"], ["022", "地图", "导航推送"], ["023", "消息", "发给老婆"], ["024", "消息", "发给小张"], ["025", "消息", "朋友投票"], ["026", "消息", "老婆反馈修改"], ["027", "规划", "协作后改版"], ["028", "消息", "最终行程卡"], ["029", "规划", "What-if 晚出发"], ["030", "规划", "What-if 下雨"], ["031", "规划", "预算冲突"], ["032", "规划", "天气重规划"], ["033", "规划", "交通延误兜底"], ["034", "规划", "执行失败兜底"], ["035", "我的", "行程评分"], ["036", "我的", "记忆沉淀"], ["037", "我的", "历史洞察"], ["038", "我的", "通知中心"], ["039", "我的", "隐私安全"], ["040", "我的", "登录注册"], ["041", "首页", "场景案例家庭"], ["042", "首页", "场景案例朋友"], ["043", "首页", "设计系统"], ["044", "首页", "弹窗库"], ["045", "首页", "状态页库"], ["046", "首页", "开发者日志"], ["047", "首页", "Webhook 监控"], ["048", "首页", "质量看板"], ["049", "首页", "移动端导航规范"], ["050", "首页", "杭州 Mock 数据"], ["051", "首页", "答辩故事板"], ["052", "我的", "个人中心总览"], ["053", "我的", "账号设置"], ["054", "我的", "记忆导出"], ["055", "我的", "权限管理"], ["056", "消息", "最终 Demo 收束"], ["057", "规划", "备用方案选择"], ["058", "规划", "活动票务预约"], ["059", "规划", "排队候位"], ["060", "规划", "餐厅菜单建议"],
];

function legacyNav(title: string): string {
  if (/首页|营销/.test(title)) return "首页";
  if (/案例/.test(title)) return "场景案例";
  if (/设计|组件|状态|数据|流程|移动端/.test(title)) return "设计亮点";
  if (/开发者|API|质量|Webhook/.test(title)) return "开发者";
  if (/身份|登录|注册|画像|个人|通知|隐私|账号|安全|历史|收藏/.test(title)) return "个人中心";
  return "功能";
}

export const pageCatalog: PageSpec[] = [
  ...finalDesktopRows.map(([number, file, nav, title]) =>
    makePage("V2-100", "desktop", number, `desktop_pages_100/${file}`, nav, title),
  ),
  ...mobileRows.map(([number, nav, title]) =>
    makePage("Mobile-60", "mobile", number, `mobile_pages_60/${number}_mobile.svg`, nav, title),
  ),
  ...legacyD43Rows.map((title, index) =>
    makePage("D43", "desktop", String(index + 1).padStart(3, "0"), `desktop_svg-43/${index + 1}.svg`, legacyNav(title), title),
  ),
  ...legacyI28Rows.map((title, index) =>
    makePage("I28", "desktop", String(index + 1).padStart(3, "0"), `individual_svg-28/${index + 1}.svg`, legacyNav(title), title),
  ),
];

export function pagesByNav(nav: NavKey) {
  return pageCatalog.filter((page) => page.nav === nav);
}

export const pageCoverageStats = {
  total: pageCatalog.length,
  finalDesktop: finalDesktopRows.length,
  mobile: mobileRows.length,
  d43: legacyD43Rows.length,
  i28: legacyI28Rows.length,
};
