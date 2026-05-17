import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Circle, Clock3, Search } from "lucide-react";
import { Button } from "../components/Button";
import { RouteMap } from "../components/RouteMap";
import { productScreens, type ProductScreen, type ProductScreenKind } from "../data/productScreens";
import { requestAgentPlan, type AgentPlanResponse } from "../lib/api";
import type { ModalKey } from "../types";
import styles from "./FeaturesPage.module.scss";

const groupOrder = ["开始", "位置", "资料", "方案", "路线", "预约", "支付", "执行", "协作", "变化", "记忆", "提醒", "确认", "开发者", "结果"];

const kindLabel: Record<ProductScreenKind, string> = {
  chat: "对话输入",
  profile: "资料设置",
  plans: "方案比较",
  map: "地图路线",
  booking: "预约票务",
  auth: "确认边界",
  execute: "执行状态",
  share: "分享协作",
  memory: "偏好记忆",
  developer: "开发支持",
};

const planCards = [
  { id: "A", title: "武康路慢逛 + 晚餐", score: "92", body: "步行压力小，适合家庭与轻松出行。", active: true },
  { id: "B", title: "展览 + 咖啡散步", score: "84", body: "更适合朋友见面，氛围感更强。", active: false },
  { id: "C", title: "雨天室内替代", score: "88", body: "天气变化时依然能稳妥完成安排。", active: false },
];

interface FeaturesPageProps {
  onOpenModal: (key: ModalKey) => void;
}

function ScreenPreview({
  screen,
  prompt,
  setPrompt,
  onGenerate,
  isPlanning,
  result,
}: {
  screen: ProductScreen;
  prompt: string;
  setPrompt: (value: string) => void;
  onGenerate: () => void;
  isPlanning: boolean;
  result: AgentPlanResponse | null;
}) {
  if (screen.kind === "map") {
    return <RouteMap />;
  }

  if (screen.kind === "plans") {
    return (
      <div className={styles.planSwitch}>
        {result ? (
          <div className={styles.agentBanner}>
            <strong>推荐摘要</strong>
            <span>{result.summary}</span>
          </div>
        ) : null}
        {planCards.map((plan) => (
          <article className={styles.miniPlan} data-active={plan.active} key={plan.id}>
            <span>方案 {plan.id}</span>
            <strong>{plan.title}</strong>
            <p>{plan.body}</p>
            <em>{plan.score} 匹配度</em>
          </article>
        ))}
      </div>
    );
  }

  if (screen.kind === "chat") {
    return (
      <div className={styles.chatPreview}>
        <p className={styles.userBubble}>周六下午想带爸妈在徐家汇附近走走，预算人均 200，晚饭想稳一点。</p>
        <p>我会先确认出发点、同行人和预算，再给出几套合适的安排。</p>
        <p>目前识别到家庭出行、轻松路线偏好，以及希望减少排队和长距离步行。</p>
        <div className={styles.composer}>
          <input aria-label="输入规划需求" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <Button onClick={onGenerate} disabled={isPlanning}>{isPlanning ? "规划中" : "生成方案"}</Button>
        </div>
      </div>
    );
  }

  if (screen.kind === "developer") {
    return (
      <div className={styles.consolePreview}>
        {["map.poi.fetch", "weather.risk.check", "restaurant.reserve.query", "calendar.write"].map((item, index) => (
          <div className={styles.logRow} key={item}>
            <span>0{index + 1}</span>
            <strong>{item}</strong>
            <em>{index === 2 ? "retry-ready" : "success"}</em>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.statusPreview}>
      {screen.details.map((detail, index) => (
        <div className={styles.statusRow} key={detail}>
          {index < 2 ? <CheckCircle2 size={18} /> : index === 2 ? <Clock3 size={18} /> : <Circle size={18} />}
          <span>{detail}</span>
        </div>
      ))}
    </div>
  );
}

export function FeaturesPage({ onOpenModal }: FeaturesPageProps) {
  const [activeId, setActiveId] = useState(productScreens[0].id);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("周日下午想和朋友在市区随便逛逛，再吃顿晚饭。");
  const [agentResult, setAgentResult] = useState<AgentPlanResponse | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);

  const filteredScreens = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return productScreens;
    return productScreens.filter((screen) => {
      const haystack = `${screen.group} ${screen.title} ${screen.subtitle} ${screen.source} ${screen.details.join(" ")}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [query]);

  const activeScreen = productScreens.find((screen) => screen.id === activeId) ?? productScreens[0];
  const activeIndex = productScreens.findIndex((screen) => screen.id === activeScreen.id);

  const handleGenerate = async () => {
    setIsPlanning(true);
    try {
      const result = await requestAgentPlan(prompt);
      setAgentResult(result);
    } catch {
      setAgentResult({
        traceId: "local_fallback",
        selectedPlanId: "plan_a",
        summary: "当前先展示一版推荐结果，包含路线、餐饮与确认节点，方便继续往下选择。",
        nextActions: ["确认偏好", "选择方案", "确认预约", "发给同行人"],
      });
    } finally {
      setIsPlanning(false);
      setActiveId("plan-overview");
    }
  };

  const goTo = (direction: 1 | -1) => {
    const nextIndex = Math.min(productScreens.length - 1, Math.max(0, activeIndex + direction));
    setActiveId(productScreens[nextIndex].id);
  };

  return (
    <div className={styles.productShell}>
      <aside className={styles.screenRail} aria-label="功能页面导航">
        <div className={styles.railHeader}>
          <span className={styles.kicker}>功能预览 / 页面切换</span>
          <h1>查看完整规划链路</h1>
          <p>从输入需求到生成方案、确认预约、发起协作和管理偏好，这里把关键页面按顺序串了起来。</p>
        </div>
        <label className={styles.searchBox}>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索页面或功能" />
        </label>
        <div className={styles.groupTabs}>
          {groupOrder.map((group) => (
            <button type="button" key={group} onClick={() => setActiveId(productScreens.find((screen) => screen.group === group)?.id ?? activeId)}>
              {group}
            </button>
          ))}
        </div>
        <div className={styles.screenList}>
          {filteredScreens.map((screen, index) => {
            const Icon = screen.icon;
            return (
              <button
                className={`${styles.screenButton} ${activeScreen.id === screen.id ? styles.screenButtonActive : ""}`}
                type="button"
                key={screen.id}
                onClick={() => setActiveId(screen.id)}
              >
                <Icon size={18} />
                <span>
                  <strong>{screen.title}</strong>
                  <em>{screen.source}</em>
                </span>
                <small>{String(index + 1).padStart(2, "0")}</small>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={styles.stage} aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.article
            className={styles.screenStage}
            key={activeScreen.id}
            initial={{ opacity: 0, x: 24, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -18, scale: 0.985 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.stageHeader}>
              <div>
                <span className={styles.kicker}>{activeScreen.group} · {kindLabel[activeScreen.kind]}</span>
                <h2>{activeScreen.title}</h2>
                <p>{activeScreen.subtitle}</p>
              </div>
              <span className={styles.sourcePill}>{activeScreen.source}</span>
            </div>

            <div className={styles.metricGrid}>
              {activeScreen.metrics.map((metric) => (
                <span className={styles.metric} key={metric.label}>
                  <strong>{metric.value}</strong>
                  <em>{metric.label}</em>
                </span>
              ))}
            </div>

            <div className={styles.implementationGrid}>
              <div className={styles.previewPanel}>
                <ScreenPreview
                  screen={activeScreen}
                  prompt={prompt}
                  setPrompt={setPrompt}
                  onGenerate={handleGenerate}
                  isPlanning={isPlanning}
                  result={agentResult}
                />
              </div>
              <aside className={styles.controlPanel}>
                <h3>这一页会看到什么</h3>
                <ul>
                  {activeScreen.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                <div className={styles.actions}>
                  {activeScreen.modal ? (
                    <Button onClick={() => onOpenModal(activeScreen.modal as ModalKey)}>{activeScreen.primary ?? "打开弹窗"}</Button>
                  ) : activeScreen.id === "message-input" ? (
                    <Button onClick={handleGenerate} disabled={isPlanning}>{isPlanning ? "规划中" : "生成方案"}</Button>
                  ) : (
                    <Button onClick={() => goTo(1)} disabled={activeIndex === productScreens.length - 1}>继续下一页</Button>
                  )}
                  <Button variant="ghost" onClick={() => goTo(-1)} disabled={activeIndex === 0}>上一页</Button>
                  <Button variant="ghost" onClick={() => goTo(1)} disabled={activeIndex === productScreens.length - 1}>下一页</Button>
                </div>
              </aside>
            </div>
          </motion.article>
        </AnimatePresence>
      </section>
    </div>
  );
}
