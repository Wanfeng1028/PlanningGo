import { useState } from "react";
import { RevealGroup } from "../components/RevealGroup";
import { Button } from "../components/Button";
import type { ModalKey, NavKey } from "../types";
import styles from "./CasesPage.module.scss";

/* ── props ────────────────────────────────────────────────────────── */

interface CasesPageProps {
  onOpenModal: (key: ModalKey) => void;
  onNavigate: (key: NavKey) => void;
}

/* ── 场景数据 ─────────────────────────────────────────────────────── */

interface CaseTimelineStep {
  time: string;
  label: string;
  status: string;
}

interface CaseBackup {
  condition: string;
  action: string;
}

interface CaseData {
  key: string;
  shortTitle: string;
  title: string;
  pain: string;
  tags: string[];
  metric: string;
  metricLabel: string;
  input: string;
  constraints: string[];
  timeline: CaseTimelineStep[];
  backups: CaseBackup[];
}

const CASES: CaseData[] = [
  {
    key: "family",
    shortTitle: "家庭半日",
    title: "周六家庭轻松半日行",
    pain: "带孩子出门，路线不能太赶",
    tags: ["亲子", "少走路", "可预约"],
    metric: "4.5h",
    metricLabel: "轻松半日",
    input: "周六下午带孩子出去玩，别太累",
    constraints: ["两大一小", "家附近", "人均 200", "少排队"],
    timeline: [
      { time: "14:00", label: "咖啡集合", status: "距离合适" },
      { time: "15:10", label: "展览 · 亲子活动", status: "可预约" },
      { time: "17:30", label: "晚餐", status: "已确认" },
      { time: "19:30", label: "回家", status: "地铁 25min" },
    ],
    backups: [
      { condition: "下雨", action: "切室内乐园" },
      { condition: "排队", action: "换餐厅" },
      { condition: "晚出发", action: "压缩路线" },
    ],
  },
  {
    key: "friends",
    shortTitle: "朋友聚会",
    title: "朋友边走边聊散步局",
    pain: "四个人想见面，不想只在商场干坐",
    tags: ["朋友", "聊天", "散步"],
    metric: "3.8h",
    metricLabel: "聚会时长",
    input: "四个朋友周末见面，想走走聊聊",
    constraints: ["市中心", "人均 150", "步行友好", "能聊天"],
    timeline: [
      { time: "14:30", label: "咖啡馆集合", status: "步行 3min" },
      { time: "15:30", label: "展览 · 街区散步", status: "步行 800m" },
      { time: "17:30", label: "晚餐", status: "4 人桌可订" },
      { time: "19:00", label: "散步收尾", status: "地铁口附近" },
    ],
    backups: [
      { condition: "下雨", action: "逛商场 + 室内展" },
      { condition: "人多", action: "换安静街区" },
    ],
  },
  {
    key: "couple",
    shortTitle: "情侣晚餐",
    title: "情侣安静晚餐散步线",
    pain: "想避开吵闹，找更安静的安排",
    tags: ["情侣", "安静", "晚餐"],
    metric: "¥360",
    metricLabel: "人均预算",
    input: "和对象吃顿安静的晚餐，顺便走走",
    constraints: ["氛围好", "不太远", "可预约", "安静"],
    timeline: [
      { time: "17:00", label: "江边散步", status: "步行 1km" },
      { time: "18:00", label: "安静餐厅", status: "窗边位可订" },
      { time: "19:30", label: "甜品 · 咖啡", status: "步行 5min" },
      { time: "20:30", label: "回家", status: "打车 15min" },
    ],
    backups: [
      { condition: "餐厅满", action: "换同风格备选" },
      { condition: "下雨", action: "室内甜品 + 影院" },
    ],
  },
  {
    key: "rainy",
    shortTitle: "雨天室内",
    title: "下雨也不用重排计划",
    pain: "天气突变，不想从头再来",
    tags: ["雨天", "室内", "备选"],
    metric: "92%",
    metricLabel: "切换成功率",
    input: "原计划有户外，但下雨了",
    constraints: ["全部室内", "交通方便", "不无聊"],
    timeline: [
      { time: "14:00", label: "室内咖啡馆", status: "地铁直达" },
      { time: "15:00", label: "室内展览 · 手作", status: "有空位" },
      { time: "17:00", label: "商场内餐厅", status: "不排队" },
      { time: "18:30", label: "回家", status: "地铁 20min" },
    ],
    backups: [
      { condition: "展览满", action: "换书店 · 影院" },
      { condition: "餐厅排", action: "换楼层餐厅" },
    ],
  },
  {
    key: "late",
    shortTitle: "晚出发",
    title: "临时晚出发也能安排",
    pain: "出门晚了，不想放弃整个计划",
    tags: ["改期", "晚出发", "不慌"],
    metric: "30min",
    metricLabel: "自动压缩",
    input: "原定 14 点出发，现在 17 点才出门",
    constraints: ["只保留核心", "晚餐为主", "少移动"],
    timeline: [
      { time: "17:00", label: "直接出发", status: "跳过咖啡" },
      { time: "17:20", label: "散步 · 拍照", status: "步行 600m" },
      { time: "18:00", label: "晚餐", status: "已确认" },
      { time: "19:30", label: "回家", status: "地铁 20min" },
    ],
    backups: [
      { condition: "更晚", action: "只保留晚餐" },
      { condition: "餐厅满", action: "换不需要预约的" },
    ],
  },
  {
    key: "queue",
    shortTitle: "排队绕开",
    title: "热门店排太久就换方案",
    pain: "热门时段不想硬等",
    tags: ["排队", "调整", "备选"],
    metric: "45min",
    metricLabel: "少等时间",
    input: "想去的餐厅排号太长",
    constraints: ["不硬等", "附近替代", "口味相近"],
    timeline: [
      { time: "11:30", label: "先去展览", status: "不用排队" },
      { time: "13:00", label: "换餐厅午餐", status: "口味相近" },
      { time: "14:30", label: "咖啡 · 休息", status: "步行 4min" },
      { time: "15:30", label: "回家", status: "地铁 18min" },
    ],
    backups: [
      { condition: "换的也排", action: "再换或错峰" },
      { condition: "坚持原店", action: "调整顺序先去别处" },
    ],
  },
];

/* ── Hero 3D 数据 ───────────────────────────────────────────────── */

const HERO_TIMELINE = [
  { time: "14:00", title: "咖啡集合", meta: "距离合适" },
  { time: "15:10", title: "展览 / 亲子活动", meta: "可预约" },
  { time: "17:30", title: "晚餐", meta: "已确认" },
  { time: "19:30", title: "回家", meta: "地铁 25min" },
];

const HERO_FLOAT_CARDS = [
  { icon: "☀️", title: "周六 24℃", desc: "傍晚可能有雨", className: "casesFloatCard1" },
  { icon: "💰", title: "人均 ¥200", desc: "3 套备选", className: "casesFloatCardBudget" },
  { icon: "👥", title: "两大一小", desc: "少走路", className: "casesFloatCard3" },
  { icon: "🛡", title: "室内备选", desc: "排队可切换", className: "casesFloatCard4" },
];

/* ── component ────────────────────────────────────────────────────── */

export function CasesPage({ onOpenModal, onNavigate }: CasesPageProps) {
  const [activeCase, setActiveCase] = useState("family");
  const active = CASES.find((c) => c.key === activeCase) ?? CASES[0];

  return (
    <div className={styles.page}>
      {/* ═══════ Hero — 全屏 3D 舞台，无文案 ═══════ */}
      <section className={styles.casesHeroStageOnly}>
        <div className={styles.casesHeroAtmosphere} />

        {/* 全屏 3D 舞台 */}
        <div className={styles.casesStageShell}>
          <div className={styles.casesStageInner}>
            {/* 地图底板 */}
            <div className={styles.casesHeroMapPlane}>
              <svg className={styles.casesMapGrid} viewBox="0 0 600 400" fill="none">
                <defs>
                  <pattern id="heroGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--color-border)" strokeWidth="0.5" opacity="0.4" />
                  </pattern>
                </defs>
                <rect width="600" height="400" fill="url(#heroGrid)" />
                <path
                  className={styles.casesRoutePath}
                  d="M80,320 C140,300 160,200 240,180 S340,120 400,100 S500,60 540,50"
                  stroke="var(--color-brand)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle className={styles.casesRouteNode} cx="80" cy="320" r="10" fill="var(--color-brand)" />
                <circle className={styles.casesRouteNode} cx="240" cy="180" r="8" fill="var(--color-success)" />
                <circle className={styles.casesRouteNode} cx="400" cy="100" r="8" fill="#2196f3" />
                <circle className={styles.casesRouteNode} cx="540" cy="50" r="10" fill="var(--color-text-primary)" />
              </svg>
            </div>

            {/* 中央主行程卡 */}
            <div className={styles.casesHeroPlanCard}>
              <div className={styles.planCardHeader}>
                <span className={styles.planCardDate}>周六 14:00 · 北京</span>
                <span className={styles.planCardBadge}>可执行</span>
              </div>
              <h3 className={styles.planCardTitle}>周六家庭轻松半日行</h3>
              <div className={styles.planCardTags}>
                <span className={styles.planTag}>亲子</span>
                <span className={styles.planTag}>少走路</span>
                <span className={styles.planTag}>可预约</span>
              </div>
              <div className={styles.planCardTimeline}>
                {HERO_TIMELINE.map((step, i) => (
                  <div key={i} className={styles.planStep}>
                    <span className={styles.planStepTime}>{step.time}</span>
                    <span className={styles.planStepDot} />
                    <span className={styles.planStepLabel}>{step.title}</span>
                    <span className={styles.planStepMeta}>{step.meta}</span>
                  </div>
                ))}
              </div>
              <div className={styles.planCardDivider} />
              <div className={styles.planCardBadges}>
                <span className={styles.planBadge}>可预约</span>
                <span className={styles.planBadge}>雨天可切换</span>
                <span className={styles.planBadge}>距离合适</span>
              </div>
            </div>

            {/* 漂浮信息卡 */}
            {HERO_FLOAT_CARDS.map((card, i) => (
              <div key={i} className={`${styles.casesFloatCard} ${styles[card.className as keyof typeof styles]}`}>
                <span className={styles.floatCardIcon}>{card.icon}</span>
                <span className={styles.floatCardTitle}>{card.title}</span>
                <span className={styles.floatCardDesc}>{card.desc}</span>
              </div>
            ))}

            {/* SVG 连接线 */}
            <svg className={styles.casesConnectLines} viewBox="0 0 800 600" fill="none">
              <line x1="400" y1="300" x2="120" y2="120" stroke="var(--color-brand)" strokeWidth="1" opacity="0.15" strokeDasharray="6 4" />
              <line x1="400" y1="300" x2="700" y2="140" stroke="var(--color-brand)" strokeWidth="1" opacity="0.15" strokeDasharray="6 4" />
              <line x1="400" y1="350" x2="150" y2="500" stroke="var(--color-brand)" strokeWidth="1" opacity="0.12" strokeDasharray="6 4" />
              <line x1="400" y1="350" x2="680" y2="480" stroke="var(--color-brand)" strokeWidth="1" opacity="0.12" strokeDasharray="6 4" />
            </svg>
          </div>
        </div>

        {/* 滚动引导 */}
        <div className={styles.heroScrollCue} aria-hidden="true">
          <span />
        </div>
      </section>

      {/* ═══════ 场景选择 — 胶片 strip + 详情面板 ═══════ */}
      <section id="case-showcase" className={`${styles.section} ${styles.showcase}`}>
        <div className={styles.showcaseIntro}>
          <h2 className={styles.sectionTitle}>选一个场景，看它怎么安排</h2>
        </div>

        <div className={styles.showcaseContent}>
          <nav className={styles.filmstrip}>
            {CASES.map((c) => (
              <button
                key={c.key}
                className={activeCase === c.key ? styles.frameActive : styles.frame}
                onClick={() => setActiveCase(c.key)}
                type="button"
              >
                <div className={styles.frameHoleTop} aria-hidden="true" />
                <div className={styles.frameContent}>
                  <span className={styles.frameTitle}>{c.shortTitle}</span>
                  <span className={styles.frameMetric}>{c.metric}</span>
                  <span className={styles.frameMetricLabel}>{c.metricLabel}</span>
                </div>
                <div className={styles.frameHoleBottom} aria-hidden="true" />
              </button>
            ))}
          </nav>

          <div className={styles.detailPanel}>
            <div className={styles.detailInner} key={active.key}>
              <h3 className={styles.detailTitle}>{active.title}</h3>
              <p className={styles.detailPain}>{active.pain}</p>

              <div className={styles.detailInput}>
                <span className={styles.detailInputLabel}>输入</span>
                <span className={styles.detailInputText}>「{active.input}」</span>
              </div>

              <div className={styles.detailTags}>
                {active.constraints.map((c, i) => (
                  <span key={i} className={styles.detailTag}>{c}</span>
                ))}
              </div>

              <div className={styles.detailTimeline}>
                {active.timeline.map((step, i) => (
                  <div key={i} className={styles.detailStep}>
                    <span className={styles.detailStepTime}>{step.time}</span>
                    <span className={styles.detailStepDot} />
                    <span className={styles.detailStepLabel}>{step.label}</span>
                    <span className={styles.detailStepStatus}>{step.status}</span>
                  </div>
                ))}
              </div>

              <div className={styles.detailBackups}>
                <span className={styles.detailBackupsLabel}>备选方案</span>
                <div className={styles.detailBackupList}>
                  {active.backups.map((b, i) => (
                    <div key={i} className={styles.detailBackupItem}>
                      <span>{b.condition}</span>
                      <span className={styles.detailBackupArrow}>→</span>
                      <span>{b.action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.detailFooter}>
                <span className={styles.detailMetric}>{active.metric}</span>
                <span className={styles.detailMetricLabel}>{active.metricLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 完整路线看板 ═══════ */}
      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <h2 className={styles.sectionTitle}>一条路线，替你处理所有小麻烦</h2>
        </div>

        <div className={styles.routeBoard}>
          {/* 顶部输入 */}
          <div className={styles.routeInput}>
            <span className={styles.routeInputLabel}>用户输入</span>
            <strong className={styles.routeInputText}>「周六下午带孩子出门，别太累，人均 200 左右。」</strong>
          </div>

          {/* 中间：左侧 SVG 路线地图 + 右侧兜底策略 */}
          <div className={styles.routeMap}>
            <div className={styles.routeMapArea}>
              <svg className={styles.routeMapSvg} viewBox="0 0 500 280" fill="none" aria-hidden="true">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--color-border)" strokeWidth="0.5" opacity="0.5" />
                  </pattern>
                </defs>
                <rect width="500" height="280" fill="url(#grid)" />
                <path
                  className={styles.routeMapPath}
                  d="M60,220 C100,220 120,160 160,140 S240,100 280,100 S360,80 400,60 S440,40 450,40"
                  stroke="var(--color-brand)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx="60" cy="220" r="12" fill="var(--color-brand)" stroke="white" strokeWidth="3" />
                <circle cx="160" cy="140" r="10" fill="var(--color-success)" stroke="white" strokeWidth="3" />
                <circle cx="280" cy="100" r="10" fill="#2196f3" stroke="white" strokeWidth="3" />
                <circle cx="400" cy="60" r="10" fill="var(--color-text-primary)" stroke="white" strokeWidth="3" />
                <circle cx="450" cy="40" r="12" fill="var(--color-surface)" stroke="var(--color-text-primary)" strokeWidth="3" />
                <text x="60" y="248" className={styles.routeMapLabel}>14:00 出发</text>
                <text x="160" y="168" className={styles.routeMapLabel}>15:10 展览</text>
                <text x="280" y="128" className={styles.routeMapLabel}>17:30 晚餐</text>
                <text x="400" y="88" className={styles.routeMapLabel}>19:00 散步</text>
                <text x="445" y="68" className={styles.routeMapLabel}>回家</text>
              </svg>
            </div>

            <div className={styles.routeBackups}>
              <h4 className={styles.routeBackupsTitle}>变化兜底</h4>
              {CASES[0].backups.map((b, i) => (
                <div key={i} className={styles.routeBackupCard}>
                  <span className={styles.routeBackupCondition}>{b.condition}</span>
                  <span className={styles.routeBackupArrow}>→</span>
                  <span className={styles.routeBackupAction}>{b.action}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 底部确认条 */}
          <div className={styles.routeConfirm}>
            <span className={styles.routeConfirmText}>已生成 ·</span>
            <span className={styles.routeConfirmBadge}>可预约</span>
            <span className={styles.routeConfirmBadge}>雨天可切换</span>
            <span className={styles.routeConfirmBadge}>距离合适</span>
          </div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className={`${styles.section} ${styles.cta}`}>
        <RevealGroup>
          <h2 className={styles.ctaTitle}>今天不用再把十几个页面来回切</h2>
          <p className={styles.ctaSubtitle}>一句话输入，多方案生成，临时变化自动调整。</p>
          <div className={styles.ctaActions}>
            <Button onClick={() => onOpenModal("guest")}>游客体验</Button>
            <Button variant="ghost" onClick={() => onNavigate("features")}>回到总览</Button>
          </div>
        </RevealGroup>
      </section>
    </div>
  );
}
