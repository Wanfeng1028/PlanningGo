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
  { label: "规划节点", value: "100+" },
  { label: "关键页面", value: "60" },
  { label: "执行闭环", value: "10类" },
];

export const demoTimeline: TimelineItem[] = [
  {
    time: "09:00",
    title: "输入一句话需求",
    desc: "想带家人在徐家汇附近走走，顺便吃顿轻松一点的晚饭。",
    status: "done",
  },
  {
    time: "09:03",
    title: "整理出行条件",
    desc: "系统合并同行人、交通方式、天气和预算等信息。",
    status: "done",
  },
  {
    time: "09:08",
    title: "生成多套方案",
    desc: "给出轻松散步、展览漫游和雨天室内等不同安排。",
    status: "active",
  },
  {
    time: "09:12",
    title: "进入确认与执行",
    desc: "涉及定位、预约、票务或支付时，再请用户逐步确认。",
    status: "pending",
  },
];

export const featureBlocks: SectionBlock[] = [
  {
    id: "entry",
    eyebrow: "开始规划",
    title: "从一句话需求到完整安排",
    intro: "把输入、追问、条件补足和推荐结果收在一条顺畅路径里，避免用户在多个页面之间来回跳转。",
    icon: MessageCircle,
    items: [
      {
        title: "首页入口与行动按钮",
        desc: "从首页直接进入规划，也能先以游客方式快速体验。",
        source: "入口设计",
        mode: "page",
      },
      {
        title: "一句话输入",
        desc: "支持自然描述时间、预算、同行人和想去的区域。",
        source: "输入体验",
        mode: "page",
      },
      {
        title: "对话式补充信息",
        desc: "缺少关键条件时，只追问真正需要的内容。",
        source: "补充信息",
        mode: "page",
      },
      {
        title: "同行人与场景选择",
        desc: "家庭、朋友或情侣场景会影响推荐的节奏与重点。",
        source: "场景切换",
        mode: "modal",
        modal: "identity",
      },
    ],
  },
  {
    id: "location",
    eyebrow: "位置与范围",
    title: "先判断从哪里出发，再决定去哪儿",
    intro: "出发点、可接受步行距离和目标区域会直接影响推荐内容，所以位置判断需要尽量清楚但不打扰。",
    icon: MapPinned,
    items: [
      {
        title: "位置授权说明",
        desc: "清楚告诉用户为什么需要定位，以及不授权时的替代方式。",
        source: "定位说明",
        mode: "modal",
        modal: "location",
      },
      {
        title: "出发点确认",
        desc: "展示当前出发地、交通方式和可接受活动半径。",
        source: "出发点",
        mode: "page",
      },
      {
        title: "周边可选去处",
        desc: "把餐饮、散步、展览和活动点位整合在同一范围内展示。",
        source: "周边推荐",
        mode: "page",
      },
      {
        title: "路线与时间估算",
        desc: "结合距离与交通状况，提前判断整趟行程是否轻松。",
        source: "路线判断",
        mode: "state",
      },
    ],
  },
  {
    id: "planning",
    eyebrow: "方案生成",
    title: "不是只给推荐，而是给可执行的周末方案",
    intro: "系统会把路线、餐饮、节奏和备选安排放在一起比较，方便用户快速决定下一步。",
    icon: Bot,
    items: [
      {
        title: "多方案预览",
        desc: "同时给出几套风格不同的安排，方便比较轻松度和预算。",
        source: "方案列表",
        mode: "page",
      },
      {
        title: "推荐理由说明",
        desc: "把天气、距离、排队风险和同行偏好解释清楚。",
        source: "理由说明",
        mode: "page",
      },
      {
        title: "方案对比",
        desc: "用统一结构展示时长、预算、路线和适合人群。",
        source: "对比视图",
        mode: "page",
      },
      {
        title: "选中后继续推进",
        desc: "确认主方案后，再进入预约、票务和执行节点。",
        source: "确认动作",
        mode: "page",
      },
    ],
  },
  {
    id: "booking",
    eyebrow: "预约与票务",
    title: "执行前把关键确认交还给用户",
    intro: "餐厅预约、活动票务和费用确认都能衔接在同一流程里，但真正提交前始终保留用户确认。",
    icon: TicketCheck,
    items: [
      {
        title: "餐厅候选与可约情况",
        desc: "展示口味、排队情况、预算和是否需要提前预约。",
        source: "餐厅信息",
        mode: "page",
      },
      {
        title: "预约确认弹窗",
        desc: "整理好时间、人数和备注后，再由用户决定是否提交。",
        source: "预约确认",
        mode: "modal",
        modal: "reservation",
      },
      {
        title: "活动票务补充",
        desc: "把电影、展览或其他活动作为可选项插入整体安排。",
        source: "票务补充",
        mode: "drawer",
        modal: "ticket",
      },
      {
        title: "支付边界",
        desc: "系统帮忙整理订单，但不会跳过用户直接支付。",
        source: "支付确认",
        mode: "modal",
        modal: "payment",
      },
    ],
  },
  {
    id: "execution",
    eyebrow: "执行过程",
    title: "确认之后，继续把安排推进下去",
    intro: "从通知、日历、行程提醒到失败后的替代方案，都需要被组织成连续的执行过程，而不是零散页面。",
    icon: CalendarCheck,
    items: [
      {
        title: "逐步授权",
        desc: "定位、预约、票务和提醒都在需要时再单独确认。",
        source: "授权节奏",
        mode: "modal",
        modal: "payment",
      },
      {
        title: "执行清单",
        desc: "把预约、提醒、通知和返程安排整理成清晰步骤。",
        source: "执行清单",
        mode: "page",
      },
      {
        title: "变化后的替代方案",
        desc: "排队太久、天气变化或预约失败时，快速给出替换建议。",
        source: "替代方案",
        mode: "state",
      },
      {
        title: "过程记录",
        desc: "清楚展示已经完成、等待确认和即将发生的节点。",
        source: "进度视图",
        mode: "page",
      },
    ],
  },
  {
    id: "collaboration",
    eyebrow: "分享与协作",
    title: "计划不只是自己看，还要方便一起决定",
    intro: "用户把周末计划分享给家人或朋友后，对方也能快速看懂重点并给出反馈。",
    icon: UsersRound,
    items: [
      {
        title: "分享给家人或朋友",
        desc: "生成简洁版信息，方便对方快速确认。",
        source: "分享入口",
        mode: "modal",
        modal: "vote",
      },
      {
        title: "根据反馈继续修改",
        desc: "把对方意见整理进方案，不需要从头重来。",
        source: "反馈调整",
        mode: "page",
      },
      {
        title: "临时变化重排",
        desc: "遇到下雨、加人或预算变化时，继续在原方案上调整。",
        source: "动态重排",
        mode: "page",
      },
      {
        title: "偏好沉淀",
        desc: "把完成后的选择回写成下次推荐的参考。",
        source: "偏好记录",
        mode: "page",
      },
    ],
  },
];

export const caseCards: CaseCard[] = [
  {
    title: "家庭轻松半日行",
    desc: "围绕徐家汇周边安排轻松步行、短距离移动和稳定晚餐节奏。",
    tags: ["家庭", "轻松", "低强度"],
    metric: "4.5h",
  },
  {
    title: "朋友展览散步局",
    desc: "适合四人周末见面，兼顾聊天空间和城市漫游氛围。",
    tags: ["朋友", "展览", "散步"],
    metric: "3.8h",
  },
  {
    title: "情侣安静晚餐线",
    desc: "强调氛围、节奏和舒适度，避开高峰排队时段。",
    tags: ["情侣", "晚餐", "氛围"],
    metric: "约360",
  },
  {
    title: "雨天室内替代方案",
    desc: "天气变化时自动切换成更稳妥的室内路线与活动安排。",
    tags: ["雨天", "室内", "替代"],
    metric: "92%",
  },
  {
    title: "长辈友好路线",
    desc: "减少长时间步行与频繁换乘，让整体节奏更从容。",
    tags: ["家庭", "长辈", "舒适"],
    metric: "2.2km",
  },
  {
    title: "排队高峰绕开方案",
    desc: "发现热门时段拥挤后，主动调整节点顺序与用餐时间。",
    tags: ["排队", "调整", "路线"],
    metric: "30min",
  },
];

export const designHighlights: SectionBlock[] = [
  {
    id: "visual",
    eyebrow: "视觉基调",
    title: "明亮、温和，又有一点生活感",
    intro: "页面以轻暖色为基础，让信息密度较高的规划过程看起来依然轻松、友好、不压迫。",
    icon: Palette,
    items: [
      { title: "主色与底色", desc: "用明亮的黄色作为重点色，搭配温和浅底增强亲和力。", source: "颜色系统", mode: "page" },
      { title: "图形语言", desc: "用圆形高光、柔和层次和轻微透气感增强页面识别度。", source: "背景氛围", mode: "page" },
      { title: "统一组件样式", desc: "按钮、卡片、标签和状态块保持同一套圆角与层次。", source: "组件规范", mode: "page" },
      { title: "关键弹层体验", desc: "登录、预约、投票和隐私等弹层保持一致的阅读与操作节奏。", source: "弹层体系", mode: "modal" },
    ],
  },
  {
    id: "states",
    eyebrow: "状态体验",
    title: "每一种状态都应该让人看得懂",
    intro: "不只是正常流程，加载、为空、失败、离线和完成状态也都需要保持清晰、完整和可继续操作。",
    icon: LayoutGrid,
    items: [
      { title: "状态页面", desc: "覆盖加载、为空、失败、离线、隐私提醒和完成反馈。", source: "状态集合", mode: "state" },
      { title: "单页聚焦", desc: "每个页面只突出当前任务，减少多余信息干扰。", source: "信息聚焦", mode: "page" },
      { title: "关键模块联动", desc: "地图、推荐、票务和分享等模块在同一体验中自然切换。", source: "模块关系", mode: "page" },
      { title: "移动端导航", desc: "底部导航把首页、规划、地图、消息和我的串联起来。", source: "移动导航", mode: "page" },
    ],
  },
];

export const developerBlocks: SectionBlock[] = [
  {
    id: "console",
    eyebrow: "开发者",
    title: "把运行记录、接口凭证和结果回调看清楚",
    intro: "开发者页面与普通用户流程分开呈现，方便单独查看日志、接口信息和外部回调。",
    icon: Code2,
    items: [
      { title: "接口凭证管理", desc: "集中查看凭证名称、权限范围和最近使用情况。", source: "凭证管理", mode: "modal", modal: "apiKey" },
      { title: "运行记录", desc: "按步骤查看地图、天气、预约和日历等请求状态。", source: "运行日志", mode: "page" },
      { title: "回调核对", desc: "执行结果、失败原因和通知事件都能统一查看。", source: "回调记录", mode: "page" },
      { title: "整体指标", desc: "关注规划成功率、确认率和执行完成情况。", source: "统计指标", mode: "page" },
      { title: "测试数据", desc: "便于切换不同场景，验证流程在多种条件下的表现。", source: "测试数据", mode: "page" },
    ],
  },
];

export const profileBlocks: SectionBlock[] = [
  {
    id: "account",
    eyebrow: "个人中心",
    title: "账户、偏好、通知与隐私都在这里",
    intro: "把登录、注册、偏好设置、通知方式和隐私管理整合在一起，方便用户集中维护自己的资料。",
    icon: UserRound,
    items: [
      { title: "身份选择", desc: "支持游客、登录和注册等不同进入方式。", source: "进入方式", mode: "modal", modal: "identity" },
      { title: "登录与注册", desc: "右上角和个人中心都能快速进入账户流程。", source: "账户入口", mode: "modal", modal: "login" },
      { title: "首次偏好设置", desc: "补充城市、同行人和预算习惯后，推荐会更贴近需求。", source: "偏好设置", mode: "drawer", modal: "register" },
      { title: "资料与家庭信息", desc: "支持查看历史偏好、家庭成员信息和可编辑资料。", source: "资料管理", mode: "page" },
      { title: "通知与安全", desc: "管理提醒权限、登录安全和关联方式。", source: "通知安全", mode: "page" },
      { title: "隐私与导出", desc: "支持数据导出、删除和权限回收。", source: "隐私管理", mode: "modal", modal: "privacy" },
    ],
  },
];

export const routeStops = ["徐家汇", "街区散步", "咖啡小坐", "预约晚餐", "返程回家", "方案存档"];

export const mobileTabs = [
  { label: "首页", icon: Home },
  { label: "规划", icon: WandSparkles },
  { label: "地图", icon: Route },
  { label: "消息", icon: HeartHandshake },
  { label: "我的", icon: UserRound },
];

export const capabilityCards = [
  { icon: Compass, title: "条件判断", desc: "根据天气、距离和同行人自动调整路线节奏。" },
  { icon: Sparkles, title: "多方案生成", desc: "同时给出几套安排，便于快速比较与决策。" },
  { icon: ShieldCheck, title: "确认边界", desc: "定位、预约、票务和支付都保留用户确认。" },
  { icon: Bell, title: "执行提醒", desc: "关键节点会提前提醒，也能在变化时重新安排。" },
  { icon: Database, title: "偏好沉淀", desc: "已完成的选择会成为下次推荐的参考。" },
  { icon: KeyRound, title: "开发可观测", desc: "方便查看运行记录、回调结果和接口状态。" },
];

export const scoreboard = [
  { label: "轻松指数", value: "高", icon: Star },
  { label: "步行距离", value: "2.2km", icon: Route },
  { label: "预算", value: "约420", icon: Flag },
  { label: "匹配度", value: "92%", icon: ShieldCheck },
];
