import {
  Bell,
  Bot,
  CalendarCheck,
  CheckCircle2,
  CloudRain,
  CreditCard,
  History,
  KeyRound,
  MapPinned,
  MessageCircle,
  Route,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModalKey } from "../types";

export type ProductScreenKind =
  | "chat"
  | "profile"
  | "plans"
  | "map"
  | "booking"
  | "auth"
  | "execute"
  | "share"
  | "memory"
  | "developer";

export interface ProductScreen {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  source: string;
  kind: ProductScreenKind;
  icon: LucideIcon;
  primary?: string;
  modal?: ModalKey;
  metrics: Array<{ label: string; value: string }>;
  details: string[];
}

export const productScreens: ProductScreen[] = [
  {
    id: "message-input",
    group: "需求",
    title: "一句话输入",
    subtitle: "用户先把周末需求说清楚，系统自动识别时间、地点、同行人、预算和天气风险。",
    source: "V2-009 / D43-012",
    kind: "chat",
    icon: MessageCircle,
    primary: "生成三套方案",
    metrics: [
      { label: "已识别约束", value: "5" },
      { label: "追问次数", value: "1" },
      { label: "演示验证码", value: "123456" },
    ],
    details: ["出发地：浙大紫金港", "同行人：家庭，孩子 5 岁", "偏好：晚饭别太油，步行少一点"],
  },
  {
    id: "location-confirm",
    group: "需求",
    title: "定位授权与起点确认",
    subtitle: "定位不是装饰页，而是后续距离、交通和步行负担计算的输入。",
    source: "V2-011-013 / Mobile-003-004",
    kind: "map",
    icon: MapPinned,
    primary: "允许定位",
    modal: "location",
    metrics: [
      { label: "起点", value: "紫金港" },
      { label: "车程上限", value: "40min" },
      { label: "步行上限", value: "2.2km" },
    ],
    details: ["拒绝定位时可手动输入起点", "目标区域锁定西湖、湖滨、附近商圈", "移动端表现为底部 Sheet"],
  },
  {
    id: "profile-merge",
    group: "需求",
    title: "画像记忆合并",
    subtitle: "把家庭成员、预算习惯、历史反馈合并进本次规划，减少重复追问。",
    source: "V2-017 / D43-010",
    kind: "profile",
    icon: UserRound,
    primary: "管理记忆",
    modal: "privacy",
    metrics: [
      { label: "家庭成员", value: "3" },
      { label: "预算区间", value: "300-500" },
      { label: "偏好命中", value: "4" },
    ],
    details: ["孩子容易累，优先休息点", "老婆减脂，晚餐菜单要可控", "周末常从浙大紫金港出发"],
  },
  {
    id: "plan-overview",
    group: "方案",
    title: "三方案结果总览",
    subtitle: "A/B/C 不只是卡片，用户可以切换查看评分、风险和执行成本。",
    source: "V2-020 / V2-027-034",
    kind: "plans",
    icon: Bot,
    primary: "采用方案 A",
    metrics: [
      { label: "A 可信度", value: "92" },
      { label: "B 可信度", value: "84" },
      { label: "C 可信度", value: "88" },
    ],
    details: ["A：亲子西湖低负担", "B：朋友展览 Citywalk", "C：雨天室内兜底"],
  },
  {
    id: "tool-stack",
    group: "方案",
    title: "Agent 工具调用栈",
    subtitle: "地图、天气、餐厅库存、票务和日历调用可追踪，方便答辩说明 Agent 做了什么。",
    source: "V2-021-026 / V2-074",
    kind: "developer",
    icon: KeyRound,
    metrics: [
      { label: "工具调用", value: "7" },
      { label: "失败兜底", value: "2" },
      { label: "审计 ID", value: "AG-047" },
    ],
    details: ["地图 POI 半径读取完成", "天气风险：小雨概率 35%", "餐厅库存：湖滨店 17:40 可约"],
  },
  {
    id: "route-map",
    group: "路线",
    title: "路线地图总览",
    subtitle: "从方案进入真实路线视图，展示交通方式、停留点和步行负担。",
    source: "V2-035-037 / D43-018",
    kind: "map",
    icon: Route,
    metrics: [
      { label: "总时长", value: "4.5h" },
      { label: "预算", value: "￥420" },
      { label: "步行", value: "2.2km" },
    ],
    details: ["14:00 咖啡集合", "15:10 街区漫步", "17:30 预约晚餐", "19:30 打车回家"],
  },
  {
    id: "restaurant-booking",
    group: "预订",
    title: "餐厅详情与预约",
    subtitle: "海底捞湖滨店展示库存、排队、亲子友好和减脂菜单，提交前用户确认。",
    source: "V2-038-042 / D43-025-026",
    kind: "booking",
    icon: TicketCheck,
    primary: "预约餐厅",
    modal: "reservation",
    metrics: [
      { label: "排队", value: "20min" },
      { label: "桌位", value: "可约" },
      { label: "亲子", value: "友好" },
    ],
    details: ["自动备注儿童椅", "菜单推荐少油锅底", "预约失败会自动给出替代餐厅"],
  },
  {
    id: "ticket-addon",
    group: "预订",
    title: "电影 / 活动票务加购",
    subtitle: "票务是可选加餐，不影响主路线；Agent 只能锁座，不能替用户付款。",
    source: "V2-043-046",
    kind: "booking",
    icon: CreditCard,
    primary: "锁座 15 分钟",
    modal: "ticket",
    metrics: [
      { label: "锁座", value: "15min" },
      { label: "可选活动", value: "3" },
      { label: "支付", value: "手动" },
    ],
    details: ["展示座位、票价和取消规则", "可加鲜花/蛋糕配送", "过期自动释放库存"],
  },
  {
    id: "authorization",
    group: "执行",
    title: "细粒度授权",
    subtitle: "定位、预约、票务、日历、分享分开授权，产品边界清楚。",
    source: "V2-047-052 / D43-019",
    kind: "auth",
    icon: ShieldCheck,
    primary: "查看支付边界",
    modal: "payment",
    metrics: [
      { label: "授权项", value: "5" },
      { label: "自动扣款", value: "禁止" },
      { label: "可撤回", value: "是" },
    ],
    details: ["定位仅用于本次规划", "预约提交前必须确认", "日历和通知可以单独关闭"],
  },
  {
    id: "execution",
    group: "执行",
    title: "执行队列与失败兜底",
    subtitle: "预约、锁座、配送、通知和导航推送都有状态，失败时走备用方案。",
    source: "V2-053-059 / V2-073",
    kind: "execute",
    icon: CheckCircle2,
    metrics: [
      { label: "已完成", value: "4/5" },
      { label: "兜底方案", value: "2" },
      { label: "通知", value: "已开" },
    ],
    details: ["海底捞预约中", "票务锁座中", "日历写入完成", "导航推送待发送"],
  },
  {
    id: "collaboration",
    group: "协作",
    title: "分享协作与多人投票",
    subtitle: "把计划发给老婆或朋友，对方只看行程卡和调整项，反馈自动进入改版。",
    source: "V2-060-066 / D43-021-022",
    kind: "share",
    icon: UsersRound,
    primary: "发送邀请",
    modal: "vote",
    metrics: [
      { label: "参与人", value: "3" },
      { label: "反馈", value: "2" },
      { label: "改版", value: "1" },
    ],
    details: ["老婆：想少走一点", "朋友：加一个咖啡点", "Agent 自动缩短白堤段"],
  },
  {
    id: "what-if",
    group: "记忆",
    title: "What-if 重规划",
    subtitle: "晚出发、下雨、预算压缩和交通延误都能切换成新计划。",
    source: "V2-067-072",
    kind: "memory",
    icon: CloudRain,
    metrics: [
      { label: "情景", value: "4" },
      { label: "重规划", value: "实时" },
      { label: "风险", value: "可解释" },
    ],
    details: ["15:00 才出发：压缩户外段", "下午下雨：切室内亲子展", "预算 300：取消可选票务"],
  },
  {
    id: "feedback-memory",
    group: "记忆",
    title: "行程评分与记忆沉淀",
    subtitle: "行程结束后把偏好写回画像，下次规划少问更准。",
    source: "V2-075-077 / D43-023-024",
    kind: "memory",
    icon: History,
    primary: "隐私与导出",
    modal: "privacy",
    metrics: [
      { label: "评分", value: "4.8" },
      { label: "新增记忆", value: "3" },
      { label: "可导出", value: "是" },
    ],
    details: ["低步行负担权重 +15%", "海底捞减脂菜单命中", "出发前默认发给老婆确认"],
  },
  {
    id: "notify-account",
    group: "账号",
    title: "通知、账号与隐私",
    subtitle: "账号安全、通知权限、分享链接撤回、记忆导出删除都在个人中心。",
    source: "V2-097-100 / D43-028-031",
    kind: "profile",
    icon: Bell,
    primary: "导出记忆",
    modal: "privacy",
    metrics: [
      { label: "手机号", value: "138****0000" },
      { label: "通知", value: "3 类" },
      { label: "隐私", value: "可删" },
    ],
    details: ["手机号验证码登录注册", "分享链接可撤回", "画像和历史记忆可导出或删除"],
  },
  {
    id: "developer-console",
    group: "开发者",
    title: "开发者控制台",
    subtitle: "API Key、工具调用日志、Webhook、质量看板和测试数据集可以切换查看。",
    source: "V2-092-096 / D43-030-032",
    kind: "developer",
    icon: KeyRound,
    primary: "生成 API Key",
    modal: "apiKey",
    metrics: [
      { label: "Webhook", value: "3" },
      { label: "成功率", value: "92%" },
      { label: "数据集", value: "杭州" },
    ],
    details: ["工具调用日志可回放", "失败重试和事件推送可查", "质量看板追踪支付交接率"],
  },
  {
    id: "calendar-share",
    group: "执行",
    title: "日历与导航推送",
    subtitle: "确认后的最终行程可以写入日历，并在出发、排队、到达时推送。",
    source: "V2-052 / V2-059 / Mobile-035",
    kind: "execute",
    icon: CalendarCheck,
    metrics: [
      { label: "提醒", value: "4" },
      { label: "日历", value: "已写入" },
      { label: "导航", value: "待发送" },
    ],
    details: ["13:40 出发提醒", "17:10 晚餐排队提醒", "19:30 回家打车提醒"],
  },
];
