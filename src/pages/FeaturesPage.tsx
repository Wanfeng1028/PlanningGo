import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bot,
  CalendarCheck,
  CheckCircle2,
  CloudRain,
  MapPinned,
  MessageCircle,
  Route,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UsersRound,
} from "lucide-react";
import { Button } from "../components/Button";
import { RouteMap } from "../components/RouteMap";
import { requestAgentPlan, type AgentPlanResponse } from "../lib/api";
import type { ModalKey } from "../types";
import styles from "./FeaturesPage.module.scss";

type ModuleKey = "chat" | "plan" | "route" | "execute" | "share" | "memory";

const modules: Array<{ key: ModuleKey; label: string; icon: typeof MessageCircle }> = [
  { key: "chat", label: "需求对话", icon: MessageCircle },
  { key: "plan", label: "Agent 规划", icon: Bot },
  { key: "route", label: "路线预订", icon: Route },
  { key: "execute", label: "授权执行", icon: ShieldCheck },
  { key: "share", label: "分享协作", icon: UsersRound },
  { key: "memory", label: "记忆沉淀", icon: Sparkles },
];

const plans = [
  {
    id: "A",
    title: "亲子西湖低负担",
    desc: "断桥短线 + 湖滨休息 + 海底捞提前锁桌，照顾孩子体力和减脂晚餐。",
    score: "92",
    time: "4.5h",
    budget: "￥420",
    selected: true,
  },
  {
    id: "B",
    title: "朋友展览 Citywalk",
    desc: "展览、咖啡和轻社交，更适合 4 人朋友局，步行距离略高。",
    score: "84",
    time: "3.8h",
    budget: "￥360",
    selected: false,
  },
  {
    id: "C",
    title: "雨天室内兜底",
    desc: "如果下午下雨，压缩西湖户外段，改成室内亲子展和更稳定交通。",
    score: "88",
    time: "4.0h",
    budget: "￥390",
    selected: false,
  },
];

interface FeaturesPageProps {
  onOpenModal: (key: ModalKey) => void;
}

export function FeaturesPage({ onOpenModal }: FeaturesPageProps) {
  const [active, setActive] = useState<ModuleKey>("chat");
  const [prompt, setPrompt] = useState("如果下午下雨，就换成室内方案");
  const [agentResult, setAgentResult] = useState<AgentPlanResponse | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);

  const tabMotion = {
    initial: { opacity: 0, y: 18, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -12, scale: 0.985 },
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
  } as const;

  const handleGenerate = async () => {
    setIsPlanning(true);
    try {
      const result = await requestAgentPlan(prompt);
      setAgentResult(result);
    } catch {
      setAgentResult({
        traceId: "local_fallback",
        selectedPlanId: "plan_a",
        summary: "后端服务未启动，已使用前端 Mock 方案继续演示。推荐亲子西湖低负担方案，支付仍由用户本人确认。",
        nextActions: ["确认起点", "选择方案", "授权预约", "分享给家人"],
      });
    } finally {
      setIsPlanning(false);
      setActive("plan");
    }
  };

  return (
    <div className={styles.workspace}>
      <motion.section className={styles.hero} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <motion.div className={styles.panel} whileHover={{ y: -3 }}>
          <span className={styles.kicker}>功能 / 完整产品工作台</span>
          <h1 className={styles.title}>从一句话需求，到可执行周末计划</h1>
          <p className={styles.intro}>
            这里把设计稿里的需求收集、定位、画像合并、三方案、路线地图、餐厅/票务、授权、执行、分享协作、What-if 和记忆沉淀做成一个真实软件工作台。
          </p>
          <div className={styles.quickStats}>
            <span>
              <strong>6</strong>
              <em>核心模块</em>
            </span>
            <span>
              <strong>3</strong>
              <em>方案对比</em>
            </span>
            <span>
              <strong>10+</strong>
              <em>执行状态</em>
            </span>
          </div>
        </motion.div>
        <motion.div className={styles.mapCard} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12 }}>
          <RouteMap />
        </motion.div>
      </motion.section>

      <nav className={styles.moduleTabs} aria-label="功能模块">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`${styles.tab} ${active === item.key ? styles.activeTab : ""}`}
              type="button"
              key={item.key}
              onClick={() => setActive(item.key)}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <AnimatePresence mode="wait">
      {active === "chat" ? (
        <motion.section className={styles.mainGrid} key="chat" {...tabMotion}>
          <div className={styles.chat}>
            <h2 className={styles.sectionTitle}>对话式需求收集</h2>
            <div className={styles.messages}>
              <p className={`${styles.message} ${styles.messageUser}`}>
                今天下午从浙大紫金港出发，带孩子去西湖附近玩一圈，晚饭别太油。
              </p>
              <p className={styles.message}>我会先确认定位、同行人、预算和步行负担，再生成三套方案。</p>
              <p className={styles.message}>检测到家庭画像：孩子 5 岁，老婆减脂，优先少走路和可订餐厅。</p>
            </div>
            <div className={styles.composer}>
              <input aria-label="输入规划需求" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <Button onClick={handleGenerate} disabled={isPlanning}>{isPlanning ? "规划中" : "生成方案"}</Button>
            </div>
          </div>
          <aside className={styles.side}>
            <h3>约束面板</h3>
            <ul className={styles.checkList}>
              <li>
                <strong>定位</strong>浙大紫金港，40 分钟内优先。
              </li>
              <li>
                <strong>同行人</strong>家庭出行，孩子 5 岁。
              </li>
              <li>
                <strong>预算</strong>晚餐 + 交通约 300-500。
              </li>
              <li>
                <strong>偏好</strong>减脂友好、少排队、可分享确认。
              </li>
            </ul>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => onOpenModal("location")}>定位授权</Button>
              <Button variant="ghost" onClick={() => onOpenModal("identity")}>同行人</Button>
            </div>
          </aside>
        </motion.section>
      ) : null}

      {active === "plan" ? (
        <motion.section key="plan" {...tabMotion}>
          <h2 className={styles.sectionTitle}>Agent 工作台与三方案对比</h2>
          {agentResult ? (
            <div className={styles.agentBanner}>
              <strong>Agent 返回</strong>
              <span>{agentResult.summary}</span>
            </div>
          ) : null}
          <div className={styles.sectionGrid}>
            {plans.map((plan, index) => (
              <motion.article
                className={styles.planCard}
                data-selected={plan.selected}
                key={plan.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                whileHover={{ y: -5 }}
              >
                <span className={styles.statusPill}>方案 {plan.id}</span>
                <h3>{plan.title}</h3>
                <p>{plan.desc}</p>
                <div className={styles.metricRow}>
                  <span className={styles.metric}><strong>{plan.score}</strong><span>可信度</span></span>
                  <span className={styles.metric}><strong>{plan.time}</strong><span>总时长</span></span>
                  <span className={styles.metric}><strong>{plan.budget}</strong><span>预算</span></span>
                </div>
                <Button variant={plan.selected ? "primary" : "ghost"} onClick={() => setActive("route")}>
                  {plan.selected ? "采用方案" : "查看详情"}
                </Button>
              </motion.article>
            ))}
          </div>
        </motion.section>
      ) : null}

      {active === "route" ? (
        <motion.section className={styles.split} key="route" {...tabMotion}>
          <div className={styles.mapCard}>
            <RouteMap />
          </div>
          <aside className={styles.side}>
            <h3>路线与预订</h3>
            <ul className={styles.timeline}>
              <li><strong>14:00 出发</strong>浙大紫金港 → 西湖断桥。</li>
              <li><strong>15:00 散步</strong>断桥、白堤短线，步行不超过 2.2km。</li>
              <li><strong>16:40 休息</strong>湖滨银泰休息，孩子补给。</li>
              <li><strong>17:40 晚餐</strong>海底捞湖滨店，减脂菜单提醒。</li>
            </ul>
            <div className={styles.actions}>
              <Button onClick={() => onOpenModal("reservation")}>预约餐厅</Button>
              <Button variant="ghost" onClick={() => onOpenModal("ticket")}>加电影/活动</Button>
            </div>
          </aside>
        </motion.section>
      ) : null}

      {active === "execute" ? (
        <motion.section className={styles.mainGrid} key="execute" {...tabMotion}>
          <div className={styles.panel}>
            <h2 className={styles.sectionTitle}>授权与执行队列</h2>
            <ul className={styles.toolList}>
              <li><strong><MapPinned size={16} /> 定位授权</strong>仅用于本次距离判断，拒绝后可手动起点。</li>
              <li><strong><TicketCheck size={16} /> 预约/锁单</strong>Agent 代填，提交前用户确认。</li>
              <li><strong><CalendarCheck size={16} /> 日历通知</strong>生成 ICS 和到达提醒，可单独关闭。</li>
              <li><strong><CheckCircle2 size={16} /> 支付交接</strong>支付必须用户本人完成。</li>
            </ul>
            <div className={styles.actions}>
              <Button onClick={() => onOpenModal("payment")}>查看支付边界</Button>
              <Button variant="ghost" onClick={() => onOpenModal("reservation")}>执行预约</Button>
            </div>
          </div>
          <aside className={styles.side}>
            <h3>执行状态</h3>
            <ul className={styles.checkList}>
              <li><strong>海底捞预约中</strong>尝试 17:40 桌位。</li>
              <li><strong>票务锁座中</strong>可选，不影响主计划。</li>
              <li><strong>配送安排</strong>鲜花/蛋糕可送到餐厅。</li>
              <li><strong>失败兜底</strong>换餐厅或改时间。</li>
            </ul>
          </aside>
        </motion.section>
      ) : null}

      {active === "share" ? (
        <motion.section className={styles.mainGrid} key="share" {...tabMotion}>
          <div className={styles.panel}>
            <h2 className={styles.sectionTitle}>分享协作与多人投票</h2>
            <p className={styles.intro}>把计划递给老婆或朋友，他们只需要看时间、路线、预算和调整项。反馈会自动进入改版。</p>
            <div className={styles.sectionGrid}>
              <article className={styles.planCard}><h3>老婆反馈</h3><p>想少走一点，晚餐别太晚。</p></article>
              <article className={styles.planCard}><h3>朋友反馈</h3><p>加一个咖啡点，路线别绕。</p></article>
              <article className={styles.planCard}><h3>自动改版</h3><p>缩短白堤段，增加湖滨休息点。</p></article>
            </div>
            <div className={styles.actions}>
              <Button onClick={() => onOpenModal("vote")}>发送投票</Button>
            </div>
          </div>
          <aside className={styles.side}>
            <h3>最终行程卡</h3>
            <ul className={styles.timeline}>
              <li><strong>总时长 4.5h</strong>亲子低负担路线。</li>
              <li><strong>预算 ￥420</strong>不含可选电影。</li>
              <li><strong>步行 2.2km</strong>孩子可接受。</li>
            </ul>
          </aside>
        </motion.section>
      ) : null}

      {active === "memory" ? (
        <motion.section className={styles.mainGrid} key="memory" {...tabMotion}>
          <div className={styles.panel}>
            <h2 className={styles.sectionTitle}>What-if 与记忆沉淀</h2>
            <div className={styles.sectionGrid}>
              <article className={styles.planCard}><CloudRain size={22} /><h3>如果下雨</h3><p>切换室内亲子展，保留海底捞。</p></article>
              <article className={styles.planCard}><Bell size={22} /><h3>如果晚出发</h3><p>压缩断桥段，保留晚餐和休息。</p></article>
              <article className={styles.planCard}><Sparkles size={22} /><h3>行程后学习</h3><p>记录孩子疲劳点和餐厅反馈。</p></article>
            </div>
          </div>
          <aside className={styles.side}>
            <h3>记忆更新</h3>
            <ul className={styles.checkList}>
              <li><strong>家庭偏好</strong>低步行负担权重 +15%。</li>
              <li><strong>餐饮偏好</strong>减脂友好菜单优先。</li>
              <li><strong>协作偏好</strong>出发前发给老婆确认。</li>
            </ul>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => onOpenModal("privacy")}>管理记忆</Button>
            </div>
          </aside>
        </motion.section>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
