import {
  Bell,
  Bot,
  CalendarCheck,
  Code2,
  Compass,
  Database,
  Flag,
  HeartHandshake,
  Home,
  KeyRound,
  LayoutGrid,
  MapPinned,
  MessageCircle,
  Palette,
  Route,
  ShieldCheck,
  Sparkles,
  Star,
  TicketCheck,
  UserRound,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import type { CaseCard, SectionBlock, TimelineItem } from "../types";

export const heroStats = [
  { label: "规划主线", value: "100+" },
  { label: "移动端关键页", value: "60" },
  { label: "执行闭环", value: "10步" },
];

export const demoTimeline: TimelineItem[] = [
  {
    time: "09:00",
    title: "一句话输入",
    desc: "今天下午从浙大紫金港出发，带孩子去西湖附近玩一圈，晚饭别太油。",
    status: "done",
  },
  {
    time: "09:03",
    title: "Agent 拆解任务",
    desc: "合并家庭画像、交通、天气、餐厅库存和步行负担。",
    status: "done",
  },
  {
    time: "09:08",
    title: "生成 A/B/C 三方案",
    desc: "亲子低负担、朋友 Citywalk、雨天室内兜底。",
    status: "active",
  },
  {
    time: "09:12",
    title: "授权执行",
    desc: "定位、预约、锁票、日历和分享逐项授权，支付由用户本人确认。",
    status: "pending",
  },
];

export const featureBlocks: SectionBlock[] = [
  {
    id: "entry",
    eyebrow: "43 页核心入口 + 28 页需求构建器",
    title: "从一句话到可执行需求",
    intro: "把官网、先试试、对话收集、约束弹窗和首次画像归并到功能入口，用户不用在散乱页面里找下一步。",
    icon: MessageCircle,
    items: [
      {
        title: "功能入口 / 先试试",
        desc: "承接首页 CTA，进入小明西湖 Demo。",
        source: "D43-011 / I28-048 / V2-008",
        mode: "page",
      },
      {
        title: "一句话输入",
        desc: "支持自然语言输入时间、预算、同行人和目标区域。",
        source: "V2-009",
        mode: "page",
      },
      {
        title: "对话式需求收集",
        desc: "缺少关键信息时只追问必要问题。",
        source: "D43-012 / V2-010",
        mode: "page",
      },
      {
        title: "身份与同行人选择",
        desc: "家庭、朋友、情侣场景切换影响评分权重。",
        source: "D43-002 / V2-014",
        mode: "modal",
        modal: "identity",
      },
    ],
  },
  {
    id: "location",
    eyebrow: "定位、地图、距离边界",
    title: "先判断离家远不远",
    intro: "定位授权、起点确认和 POI 半径不单独占导航，作为功能流程里的必要弹窗和地图子视图。",
    icon: MapPinned,
    items: [
      {
        title: "定位授权",
        desc: "解释为什么需要位置，拒绝后进入手动起点。",
        source: "V2-011 / Mobile-003",
        mode: "modal",
        modal: "location",
      },
      {
        title: "起点确认：浙大紫金港",
        desc: "显示起点、交通方式和可接受半径。",
        source: "V2-012-013 / Mobile-004",
        mode: "page",
      },
      {
        title: "POI 半径与商圈范围",
        desc: "展示西湖、湖滨、餐厅和活动点。",
        source: "V2-019 / D43-025",
        mode: "page",
      },
      {
        title: "地图与交通数据读取",
        desc: "Mock 高德地图、天气和路线时长。",
        source: "V2-023 / I28-052",
        mode: "state",
      },
    ],
  },
  {
    id: "planning",
    eyebrow: "Agent 工作台",
    title: "不是推荐，是把方案推到可执行",
    intro: "预解析、工具调用、风险复核和多方案对比放到一个连续工作台里，适合演示 Agent 能力。",
    icon: Bot,
    items: [
      {
        title: "三套方案预解析",
        desc: "A 亲子西湖、B 朋友展览、C 雨天室内。",
        source: "D43-014 / I28-045 / V2-020",
        mode: "page",
      },
      {
        title: "工具调用栈",
        desc: "地图、天气、餐厅库存、票务和日历逐项展示。",
        source: "D43-015 / V2-021-026",
        mode: "page",
      },
      {
        title: "多方案对比",
        desc: "修复原稿中卡片和按钮溢出，改为自适应网格。",
        source: "D43-017 / I28-053 / V2-031-032",
        mode: "page",
      },
      {
        title: "选择最佳方案确认",
        desc: "合并优点后进入路线、预约和授权。",
        source: "V2-033-034",
        mode: "page",
      },
    ],
  },
  {
    id: "booking",
    eyebrow: "预订、票务、支付",
    title: "执行前边界清楚",
    intro: "餐厅预约、电影锁座、活动票务、配送加购和支付交接都做成可触达弹窗或 Drawer。",
    icon: TicketCheck,
    items: [
      {
        title: "海底捞餐厅详情",
        desc: "减脂友好、亲子友好、排队状态和距离说明。",
        source: "D43-025 / I28-063 / V2-038-042",
        mode: "page",
      },
      {
        title: "餐厅预约表单",
        desc: "Agent 代填，用户确认提交。",
        source: "D43-026 / V2-039",
        mode: "modal",
        modal: "reservation",
      },
      {
        title: "电影 / 活动票务",
        desc: "可选加餐，以 Drawer 展示座位和票务规则。",
        source: "V2-043-045",
        mode: "drawer",
        modal: "ticket",
      },
      {
        title: "支付交接",
        desc: "Agent 不能自动扣款，必须由用户本人付款。",
        source: "V2-051 / Mobile-016",
        mode: "modal",
        modal: "payment",
      },
    ],
  },
  {
    id: "execution",
    eyebrow: "执行闭环",
    title: "从授权到完成都有审计线",
    intro: "执行队列、失败兜底、日历通知和导航推送归为执行状态面板，避免散成孤立页。",
    icon: CalendarCheck,
    items: [
      {
        title: "授权总览",
        desc: "定位、预约、票务、日历、分享逐项授权。",
        source: "D43-019 / V2-047-052",
        mode: "modal",
        modal: "payment",
      },
      {
        title: "执行动作清单",
        desc: "预约、锁座、配送、通知和日历写入逐步完成。",
        source: "D43-020 / V2-053-057",
        mode: "page",
      },
      {
        title: "执行失败兜底",
        desc: "预约失败自动推荐相近餐厅或更晚时间。",
        source: "D43-027 / I28-065 / V2-073",
        mode: "state",
      },
      {
        title: "执行审计链路",
        desc: "用于答辩说明 Agent 做了什么和没做什么。",
        source: "V2-074",
        mode: "page",
      },
    ],
  },
  {
    id: "collaboration",
    eyebrow: "分享、协作、记忆",
    title: "计划不是结束，周末之后还会变聪明",
    intro: "分享给家人朋友、多人投票、反馈改版、评分和记忆沉淀构成完整闭环。",
    icon: UsersRound,
    items: [
      {
        title: "分享给老婆 / 朋友",
        desc: "生成可读行程卡和投票入口。",
        source: "D43-021-022 / V2-060-064",
        mode: "modal",
        modal: "vote",
      },
      {
        title: "协作后自动改版",
        desc: "少走一点、加咖啡点等反馈自动合并。",
        source: "V2-065-066",
        mode: "page",
      },
      {
        title: "What-if 模拟器",
        desc: "晚出发、下雨、预算压缩、交通延误实时重规划。",
        source: "D43-027 / V2-067-072",
        mode: "page",
      },
      {
        title: "评分与记忆沉淀",
        desc: "行程结束后写入家庭偏好和历史洞察。",
        source: "D43-023-024 / I28-055 / V2-075-077",
        mode: "page",
      },
    ],
  },
];

export const caseCards: CaseCard[] = [
  {
    title: "家庭西湖下午",
    desc: "从浙大紫金港出发，控制车程、步行和晚餐油腻程度。",
    tags: ["亲子", "西湖", "低负担"],
    metric: "4.5h",
  },
  {
    title: "朋友展览 Citywalk",
    desc: "适合 4 人轻社交，自动加咖啡点和雨天备选。",
    tags: ["朋友", "展览", "咖啡"],
    metric: "3.8h",
  },
  {
    title: "情侣减脂晚餐",
    desc: "兼顾约会氛围与菜单控制，避开排队高峰。",
    tags: ["情侣", "减脂", "晚餐"],
    metric: "￥360",
  },
  {
    title: "雨天室内兜底",
    desc: "天气变化时自动压缩户外路线，切换室内活动。",
    tags: ["雨天", "兜底", "亲子"],
    metric: "92%",
  },
  {
    title: "亲子低负担指标",
    desc: "以孩子年龄、步行距离、休息点和厕所可达性评分。",
    tags: ["家庭", "指标", "评分"],
    metric: "2.2km",
  },
  {
    title: "晚出发自动压缩",
    desc: "15:00 才出发时自动砍掉低价值节点，保留晚餐和核心散步。",
    tags: ["What-if", "压缩", "路线"],
    metric: "30min",
  },
];

export const designHighlights: SectionBlock[] = [
  {
    id: "visual",
    eyebrow: "设计亮点",
    title: "白黄底图、黑色粗体、胶囊导航",
    intro: "保留设计稿最稳定的视觉识别，同时修复文字溢出和按钮跑出卡片的问题。",
    icon: Palette,
    items: [
      { title: "颜色与字体", desc: "主色 #FFCC33、暖米白底、900 粗体标题。", source: "V2-085", mode: "page" },
      { title: "底图一致性", desc: "黄、灰、橄榄几何块贯穿桌面和移动端。", source: "V2-086", mode: "page" },
      { title: "组件库", desc: "按钮、卡片、标签、表单、地图和状态全部 token 化。", source: "D43-033 / V2-087", mode: "page" },
      { title: "弹窗库", desc: "授权、登录、预约、投票和隐私都统一弹窗规范。", source: "D43-037 / V2-088", mode: "modal" },
    ],
  },
  {
    id: "states",
    eyebrow: "设计系统",
    title: "状态、导航与数据矩阵",
    intro: "设计页本身也要变成可访问页面，帮助评委和开发者理解产品边界。",
    icon: LayoutGrid,
    items: [
      { title: "状态页库", desc: "Loading / Empty / Error / Offline / Privacy / Done。", source: "D43-038 / I28-070 / V2-089", mode: "state" },
      { title: "导航一致性", desc: "所有页面只归入六个主导航，不新增奇怪入口。", source: "V2-090", mode: "page" },
      { title: "数据需求矩阵", desc: "地图、天气、POI、库存、票务、日历、记忆。", source: "D43-036 / V2-091", mode: "page" },
      { title: "移动端关键流", desc: "底部五项导航：首页 / 规划 / 地图 / 消息 / 我的。", source: "D43-043 / I28-059 / Mobile-60", mode: "page" },
    ],
  },
];

export const developerBlocks: SectionBlock[] = [
  {
    id: "console",
    eyebrow: "开发者",
    title: "Agent 后台看得见、查得到、可回放",
    intro: "开发者页面不混入普通用户流程，专门承载 API Key、工具日志、Webhook 和质量看板。",
    icon: Code2,
    items: [
      { title: "API Key 控制台", desc: "创建、撤销、复制和权限说明。", source: "D43-030 / V2-092", mode: "modal", modal: "apiKey" },
      { title: "工具调用日志", desc: "地图、天气、餐厅、票务、日历调用可追踪。", source: "V2-093", mode: "page" },
      { title: "Webhook 监控", desc: "执行结果推送、失败重试和事件回放。", source: "I28-068 / V2-094", mode: "page" },
      { title: "质量看板", desc: "规划成功率、兜底率、用户确认率、支付交接率。", source: "D43-032 / I28-058 / V2-095", mode: "page" },
      { title: "测试数据集", desc: "杭州西湖 Demo Mock 数据和验收故事板。", source: "V2-096 / V2-084", mode: "page" },
    ],
  },
];

export const profileBlocks: SectionBlock[] = [
  {
    id: "account",
    eyebrow: "个人中心",
    title: "账号、画像、通知和隐私全部归到这里",
    intro: "43 页里的身份选择、登录、注册、画像设置，28 页里的登录注册合并稿，都归并为个人中心和弹窗流程。",
    icon: UserRound,
    items: [
      { title: "身份选择", desc: "游客、登录、注册三种入口。", source: "D43-002", mode: "modal", modal: "identity" },
      { title: "登录 / 注册", desc: "右上角固定入口，同时可在个人中心触发。", source: "D43-004-005 / I28-046 / V2-098", mode: "modal", modal: "login" },
      { title: "首次画像设置", desc: "城市、家庭成员、预算习惯三步。", source: "D43-007-009 / I28-047", mode: "drawer", modal: "register" },
      { title: "记忆与画像中心", desc: "历史偏好、家庭洞察、可编辑记忆。", source: "D43-010 / I28-056 / V2-097", mode: "page" },
      { title: "通知与账号设置", desc: "通知权限、账号安全和分享链接。", source: "D43-028 / D43-031 / V2-099", mode: "page" },
      { title: "隐私与记忆导出", desc: "数据导出、删除、权限撤回。", source: "D43-029 / I28-067 / V2-100", mode: "modal", modal: "privacy" },
    ],
  },
];

export const routeStops = ["浙大紫金港", "地铁/打车", "断桥", "白堤散步", "湖滨休息", "海底捞"];

export const mobileTabs = [
  { label: "首页", icon: Home },
  { label: "规划", icon: WandSparkles },
  { label: "地图", icon: Route },
  { label: "消息", icon: HeartHandshake },
  { label: "我的", icon: UserRound },
];

export const capabilityCards = [
  { icon: Compass, title: "距离判断", desc: "根据起点和同行人控制交通与步行负担。" },
  { icon: Sparkles, title: "方案生成", desc: "生成 A/B/C 三套方案并给出可信度。" },
  { icon: ShieldCheck, title: "授权边界", desc: "定位、预订、锁票、支付逐项确认。" },
  { icon: Bell, title: "执行提醒", desc: "导航、日历、排队和改版及时推送。" },
  { icon: Database, title: "记忆沉淀", desc: "行程反馈进入画像，下次少问更准。" },
  { icon: KeyRound, title: "开发者可观测", desc: "工具调用、Webhook、质量看板可回放。" },
];

export const scoreboard = [
  { label: "亲子负担", value: "低", icon: Star },
  { label: "步行距离", value: "2.2km", icon: Route },
  { label: "预算", value: "￥420", icon: Flag },
  { label: "成功率", value: "92%", icon: ShieldCheck },
];
