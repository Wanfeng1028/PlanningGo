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
    group: "开始",
    title: "一句话输入需求",
    subtitle: "用户只要描述时间、预算、同行人和想去的区域，系统就会自动整理出关键条件。",
    source: "输入体验",
    kind: "chat",
    icon: MessageCircle,
    primary: "生成推荐方案",
    metrics: [
      { label: "识别条件", value: "5项" },
      { label: "补充提问", value: "1次" },
      { label: "预计耗时", value: "3分钟" },
    ],
    details: ["出发地：徐家汇", "同行人：家庭，含 5 岁小朋友", "偏好：不要太累，晚饭要稳妥"],
  },
  {
    id: "location-confirm",
    group: "位置",
    title: "定位授权与出发点确认",
    subtitle: "位置不是单独存在的设置，而是直接影响距离、交通方式和整趟安排节奏的起点。",
    source: "位置判断",
    kind: "map",
    icon: MapPinned,
    primary: "允许定位",
    modal: "location",
    metrics: [
      { label: "出发地", value: "徐家汇" },
      { label: "活动时长", value: "40min+" },
      { label: "步行范围", value: "2.2km" },
    ],
    details: ["拒绝定位时也能手动输入", "目标区域会同步展示周边可选范围", "移动端会以底部弹层呈现"],
  },
  {
    id: "profile-merge",
    group: "资料",
    title: "偏好信息自动带入",
    subtitle: "家庭成员、预算习惯和历史选择会自动补充进本次规划，减少重复输入。",
    source: "资料整合",
    kind: "profile",
    icon: UserRound,
    primary: "编辑偏好",
    modal: "register",
    metrics: [
      { label: "家庭成员", value: "3人" },
      { label: "预算区间", value: "300-500" },
      { label: "常用区域", value: "徐汇" },
    ],
    details: ["支持后续继续补充", "会影响推荐节奏与餐饮偏好", "资料随时可以修改或删除"],
  },
  {
    id: "plan-overview",
    group: "方案",
    title: "多套方案对比",
    subtitle: "不是只给一个答案，而是提供几套可比较的安排，帮助用户更快做决定。",
    source: "方案比较",
    kind: "plans",
    icon: Sparkles,
    metrics: [
      { label: "推荐方案", value: "3套" },
      { label: "主方案匹配", value: "92%" },
      { label: "备选路线", value: "2条" },
    ],
    details: ["同时展示预算、时长和路线节奏", "每套方案都有推荐理由", "选中后可继续推进预约和执行"],
  },
  {
    id: "agent-reasoning",
    group: "方案",
    title: "推荐理由看得懂",
    subtitle: "距离、天气、排队风险和同行偏好会被整理成清楚的推荐依据，而不是直接给结论。",
    source: "推荐解释",
    kind: "plans",
    icon: Bot,
    metrics: [
      { label: "判断维度", value: "12项" },
      { label: "天气影响", value: "已考虑" },
      { label: "排队风险", value: "中低" },
    ],
    details: ["解释为什么推荐这个区域", "展示为什么放弃其他备选", "方便用户快速理解取舍关系"],
  },
  {
    id: "booking-confirm",
    group: "预约",
    title: "预约前再次确认",
    subtitle: "餐厅预约前会把时间、人数和备注信息整理好，真正提交前仍然由用户确认。",
    source: "预约确认",
    kind: "booking",
    icon: TicketCheck,
    primary: "确认预约",
    modal: "reservation",
    metrics: [
      { label: "预约人数", value: "3人" },
      { label: "用餐时段", value: "17:30" },
      { label: "候选餐厅", value: "2家" },
    ],
    details: ["可约结果会先展示出来", "失败后会自动给替代选择", "确认后进入执行清单"],
  },
  {
    id: "payment-check",
    group: "支付",
    title: "费用清楚，支付克制",
    subtitle: "系统会把餐厅、票务和交通等费用整理清楚，但不会跳过用户直接付款。",
    source: "支付确认",
    kind: "auth",
    icon: CreditCard,
    primary: "查看说明",
    modal: "payment",
    metrics: [
      { label: "晚餐预算", value: "约220" },
      { label: "交通费用", value: "约40" },
      { label: "总预算", value: "约420" },
    ],
    details: ["每一笔费用都有来源说明", "支持查看支付状态", "所有确认动作都会留下记录"],
  },
  {
    id: "execution-status",
    group: "执行",
    title: "执行过程持续可见",
    subtitle: "从预约、通知到返程提醒，关键步骤都会以状态形式持续展示，不让用户失去上下文。",
    source: "执行过程",
    kind: "execute",
    icon: CalendarCheck,
    metrics: [
      { label: "已完成", value: "2步" },
      { label: "待确认", value: "1步" },
      { label: "下一步", value: "晚餐预约" },
    ],
    details: ["已完成与待处理节点清晰分开", "失败时会及时补充替代动作", "执行过程可随时回看"],
  },
  {
    id: "share-vote",
    group: "协作",
    title: "发给家人朋友一起定",
    subtitle: "分享出去的不是复杂流程，而是方便快速确认的关键信息与备选方案。",
    source: "分享协作",
    kind: "share",
    icon: UsersRound,
    primary: "发起确认",
    modal: "vote",
    metrics: [
      { label: "分享对象", value: "2人" },
      { label: "备选方案", value: "1套" },
      { label: "等待反馈", value: "进行中" },
    ],
    details: ["家人版本更直观", "朋友版本更适合快速投票", "收到反馈后还能继续调整"],
  },
  {
    id: "what-if",
    group: "变化",
    title: "变化后重新规划",
    subtitle: "遇到下雨、预算变化或临时加人时，可以在当前方案上继续调整，不必重头再来。",
    source: "动态重排",
    kind: "memory",
    icon: CloudRain,
    metrics: [
      { label: "触发因素", value: "3类" },
      { label: "保留原方案", value: "是" },
      { label: "调整版本", value: "1版" },
    ],
    details: ["支持天气、预算和人数变化", "自动保留原先已确认的节点", "新的推荐会说明调整原因"],
  },
  {
    id: "memory-history",
    group: "记忆",
    title: "把选择沉淀成下次偏好",
    subtitle: "完成后的路线、餐厅和预算习惯会被记录下来，让下一次规划更贴近你的真实选择。",
    source: "偏好积累",
    kind: "memory",
    icon: History,
    metrics: [
      { label: "已记录习惯", value: "6项" },
      { label: "常去区域", value: "2处" },
      { label: "保留历史", value: "可管理" },
    ],
    details: ["支持继续完善个人偏好", "历史信息可以单独清理", "不会强制永久保留所有记录"],
  },
  {
    id: "developer-console",
    group: "开发者",
    title: "统一查看接口与运行状态",
    subtitle: "接口凭证、运行日志、回调记录和测试数据都可以在这里统一查看。",
    source: "开发者中心",
    kind: "developer",
    icon: KeyRound,
    primary: "查看接口凭证",
    modal: "apiKey",
    metrics: [
      { label: "回调地址", value: "3个" },
      { label: "日志记录", value: "12条" },
      { label: "最近结果", value: "稳定" },
    ],
    details: ["方便核对每一步执行情况", "支持定位失败原因", "也能查看最近的测试数据切换记录"],
  },
  {
    id: "notification-status",
    group: "提醒",
    title: "提醒要及时，也要不过度",
    subtitle: "出发、预约、改签和返程等关键节点会提醒，但不会把用户淹没在通知里。",
    source: "通知设计",
    kind: "execute",
    icon: Bell,
    metrics: [
      { label: "关键提醒", value: "4类" },
      { label: "通知方式", value: "可调" },
      { label: "静默时段", value: "支持" },
    ],
    details: ["只在关键节点发送提醒", "支持不同提醒强度", "可以按场景灵活关闭"],
  },
  {
    id: "safety-boundary",
    group: "确认",
    title: "系统会帮忙，但不会越界",
    subtitle: "涉及定位、预约、票务、通知和支付等动作时，始终会保留明确的用户确认边界。",
    source: "安全边界",
    kind: "auth",
    icon: ShieldCheck,
    primary: "查看边界",
    modal: "payment",
    metrics: [
      { label: "确认环节", value: "4步" },
      { label: "自动执行", value: "0步" },
      { label: "可回退", value: "支持" },
    ],
    details: ["每一步都知道为什么需要确认", "用户可以随时中断流程", "不会在后台偷偷完成关键动作"],
  },
  {
    id: "route-map",
    group: "路线",
    title: "地图让计划更有空间感",
    subtitle: "把出发点、路线、活动点位和返程节点放在同一个视图里，方便判断整体节奏是否舒适。",
    source: "路线视图",
    kind: "map",
    icon: Route,
    metrics: [
      { label: "路段数量", value: "4段" },
      { label: "预计步行", value: "55min" },
      { label: "返程方式", value: "打车" },
    ],
    details: ["路线与时间一并展示", "支持切换不同方案查看", "方便判断整体强度是否合适"],
  },
  {
    id: "plan-result",
    group: "结果",
    title: "最终方案一眼看完",
    subtitle: "把总时长、预算、节点顺序和备选安排集中展示，确认时不需要来回跳转。",
    source: "结果总览",
    kind: "plans",
    icon: CheckCircle2,
    metrics: [
      { label: "总时长", value: "4.5h" },
      { label: "预算", value: "约420" },
      { label: "备选", value: "1套" },
    ],
    details: ["支持分享、保存和继续编辑", "关键判断信息会保留在页面里", "确认前就能看清整体结构"],
  },
];
