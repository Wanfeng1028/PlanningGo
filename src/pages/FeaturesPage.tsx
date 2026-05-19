import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Button } from "../components/Button";
import {
  requestPlanning,
  selectPlan,
  quoteAction as apiQuoteAction,
  confirmAction as apiConfirmAction,
  cancelAction as apiCancelAction,
  type PlanningOption,
  type PlanningExecutableAction,
} from "../lib/api";
import type { ModalKey, SessionUser } from "../types";
import styles from "./FeaturesPage.module.scss";

/* ---------- 相关类型 ---------- */

type Phase =
  | "idle"
  | "understanding"
  | "planning"
  | "need_clarification"
  | "result"
  | "selected"
  | "executing"
  | "done"
  | "error";

type UserMessage = {
  id: string;
  role: "user";
  content: string;
  ts: number;
};

type AssistantMessage = {
  id: string;
  role: "assistant";
  type: "text" | "plan_cards" | "thinking" | "action_cards" | "action_result";
  content: string;
  ts: number;
  plans?: PlanningPlanCard[];
  actions?: ExecutionActionCard[];
  actionQuotingId?: string | null;
  actionQuotedPreview?: { title: string; price?: string; cancelLabel?: string } | null;
};

type ChatMessage = UserMessage | AssistantMessage;

type PlanningPlanCard = {
  id: string;
  title: string;
  summary: string;
  reason?: string;
  timeline: { time: string; title: string; subtitle?: string }[];
  tags: string[];
  budget: string;
  distance?: string;
  risk?: string;
};

type ExecutionActionCard = {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  confirmLabel?: string;
  cancelLabel?: string;
  priceEstimate?: string;
};

/* ---------- 常量 ---------- */

const EXAMPLE_CHIPS = [
  { label: "👨‍👩‍👧 带娃半日游", prompt: "明天带娃半天，三个小时，要有趣又有教育意义" },
  { label: "👫 情侣约会", prompt: "周六情侣约会，浪漫一点，预算 500 以内" },
  { label: "🎓 毕业打卡", prompt: "大学毕业旅行，打卡经典地标，拍出朋友圈大片" },
  { label: "🎤 演唱会夜", prompt: "晚上有演唱会，白天怎么安排最充实" },
];

const WHAT_IF_OPTIONS = [
  { key: "rain" as const, label: "🌧️ 如果下雨" },
  { key: "late" as const, label: "⏰ 如果迟到 1 小时" },
  { key: "budget" as const, label: "💰 预算减半" },
];

/* ---------- Props ---------- */

interface FeaturesPageProps {
  user?: SessionUser | null;
  onOpenModal?: (key: ModalKey) => void;
  onRequestLocation?: () => void;
}

/* ========== Component ========== */

export default function FeaturesPage({ user, onOpenModal, onRequestLocation }: FeaturesPageProps) {
  void onRequestLocation;

  /* ── 状态 ── */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [city] = useState("上海");
  const [phase, setPhase] = useState<Phase>("idle");
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionQuotingId, setActionQuotingId] = useState<string | null>(null);
  const [actionQuotedPreview, setActionQuotedPreview] = useState<{
    actionId: string;
    title: string;
    price?: string;
    cancelLabel?: string;
  } | null>(null);
  const [cachedActions, setCachedActions] = useState<ExecutionActionCard[]>([]);

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastPlanIdRef = useRef<string | null>(null);

  /* ── 滚动 ── */
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior });
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, actionQuotedPreview, actionQuotingId]);

  /* ── textarea 自适应高度 ── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [inputValue]);

  /* ── 计算派生状态 ── */
  const showWhatIfBar = phase === "selected" || phase === "done";

  /* ── 辅助函数 ── */
  const addMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  };

  const appendAssistantText = (content: string) => {
    addMessage({
      id: uuid(),
      role: "assistant",
      type: "text",
      content,
      ts: Date.now(),
    });
  };

  const removeMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  /* ── 适配器：后端 PlanningOption → 前端 PlanningPlanCard ── */
  const adaptPlan = (opt: PlanningOption): PlanningPlanCard => ({
    id: opt.id,
    title: opt.title,
    summary: opt.summary,
    timeline: opt.timeline.map((step) => ({
      time: step.startTime,
      title: step.title,
      subtitle: step.poiName
        ? `${step.poiName}${step.durationMinutes ? ` · ${step.durationMinutes}min` : ""}`
        : step.durationMinutes
          ? `${step.durationMinutes}min`
          : undefined,
    })),
    tags: opt.highlights.slice(0, 4),
    budget: `¥${opt.totalCostMin}–${opt.totalCostMax}`,
    distance: opt.walkingKm ? `${opt.walkingKm}km` : undefined,
    risk: opt.risks?.[0],
  });

  const adaptActions = (actions: PlanningExecutableAction[]): ExecutionActionCard[] =>
    actions.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      description: a.description,
      status: a.status,
      priceEstimate: a.priceEstimate,
      confirmLabel: actionConfirmLabel(a.type),
      cancelLabel: "取消",
    }));

  const actionConfirmLabel = (type: string) => {
    if (type.includes("reservation")) return "预点餐";
    if (type.includes("ticket")) return "锁优惠";
    if (type.includes("calendar")) return "下载 ICS";
    if (type.includes("share")) return "发送到群里";
    if (type.includes("navigation")) return "打开地图";
    if (type.includes("memory")) return "保存回忆";
    return "确认";
  };

  /* ── 核心流程：提交规划请求 ── */
  const doSubmit = async (prompt: string) => {
    if (!prompt || phase === "understanding" || phase === "planning") return;

    setError(null);
    setInputValue("");
    setActionQuotedPreview(null);
    setActionQuotingId(null);

    addMessage({ id: uuid(), role: "user", content: prompt, ts: Date.now() });
    setPhase("understanding");

    // 流式打字效果
    const understandingId = uuid();
    const fullText = "正在理解你的需求，马上生成方案…";
    let currentText = "";
    for (let i = 0; i < fullText.length; i++) {
      currentText += fullText[i];
      const text = currentText;
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === understandingId);
        if (exists) {
          return prev.map((m) =>
            m.id === understandingId ? { ...m, content: text } : m
          );
        }
        return [
          ...prev,
          {
            id: understandingId,
            role: "assistant" as const,
            type: "text" as const,
            content: text,
            ts: Date.now(),
          },
        ];
      });
      await new Promise((r) => setTimeout(r, 35));
    }

    setPhase("planning");

    try {
      const result = await requestPlanning({ prompt, city });

      removeMessage(understandingId);

      const planCards = result.options.map(adaptPlan);
      const actions = adaptActions(result.executableActions);

      setPlanId(result.planId);
      setCachedActions(actions);
      lastPlanIdRef.current = result.planId;

      appendAssistantText(result.summary || "这是为你生成的方案：");

      addMessage({
        id: uuid(),
        role: "assistant",
        type: "plan_cards",
        content: "",
        plans: planCards,
        ts: Date.now(),
      });

      setPhase("result");
    } catch (err) {
      removeMessage(understandingId);
      const msg = err instanceof Error ? err.message : "请求失败";
      setError(msg);
      setPhase("error");
    }
  };

  const handleComposerSubmit = () => {
    doSubmit(inputValue.trim());
  };

  const handleExampleChip = (prompt: string) => {
    doSubmit(prompt);
  };

  const handleSelectPlan = async (cardId: string, title: string) => {
    if (phase === "executing") return;
    setPhase("executing");
    setActionQuotedPreview(null);
    setActionQuotingId(null);

    appendAssistantText(`已选择「${title}」，正在处理…`);

    try {
      await selectPlan(cardId);

      const selectedActions = cachedActions.filter(
        (a) => (a as any).optionId === cardId || cachedActions.length > 0
      );

      if (selectedActions.length > 0) {
        addMessage({
          id: uuid(),
          role: "assistant",
          type: "action_cards",
          content: "以下是可以立即执行的操作：",
          actions: selectedActions,
          ts: Date.now(),
        });
      }

      setPhase("selected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "选择方案失败";
      appendAssistantText(msg);
      setPhase("error");
    }
  };

  const handleQuoteAction = async (actionId: string) => {
    setActionQuotingId(actionId);
    setActionQuotedPreview(null);

    try {
      const result = await apiQuoteAction(actionId);
      setCachedActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? { ...a, status: result.status, priceEstimate: result.priceEstimate }
            : a
        )
      );
      setActionQuotedPreview({
        actionId,
        title: result.title,
        price: result.priceEstimate,
        cancelLabel: "取消",
      });
    } catch (err) {
      appendAssistantText(err instanceof Error ? err.message : "获取报价失败");
    } finally {
      setActionQuotingId(null);
    }
  };

  const handleConfirmAction = async (actionId: string) => {
    setActionQuotingId(actionId);

    try {
      const result = await apiConfirmAction(actionId);
      setCachedActions((prev) =>
        prev.map((a) =>
          a.id === actionId ? { ...a, status: result.status } : a
        )
      );
      setActionQuotedPreview(null);

      const action = cachedActions.find((a) => a.id === actionId);
      const label = action?.type.includes("reservation")
        ? "预订成功"
        : action?.type.includes("ticket")
          ? "已锁定优惠"
          : action?.type.includes("calendar")
            ? "ICS 已生成"
            : "操作成功";

      appendAssistantText(`✅ ${label} — ${action?.title || ""}`);

      if (action?.type.includes("share")) {
        appendAssistantText("📋 已复制分享链接，快发给朋友吧！");
      }

      if (action?.type.includes("memory") && user?.id) {
        appendAssistantText("记忆已同步到个人主页 🧠");
      }

      const allDone = cachedActions
        .filter((a) => a.id !== actionId)
        .every((a) => a.status === "confirmed" || a.status === "cancelled");
      if (allDone) {
        setPhase("done");
        appendAssistantText("所有操作已完成 🎉");
      } else {
        setPhase("selected");
      }
    } catch (err) {
      appendAssistantText(err instanceof Error ? err.message : "确认失败");
    } finally {
      setActionQuotingId(null);
    }
  };

  const handleCancelAction = async (actionId: string) => {
    setActionQuotingId(actionId);

    try {
      const result = await apiCancelAction(actionId);
      setCachedActions((prev) =>
        prev.map((a) =>
          a.id === actionId ? { ...a, status: result.status } : a
        )
      );
      setActionQuotedPreview(null);

      const allDone = cachedActions
        .filter((a) => a.id !== actionId)
        .every((a) => a.status === "confirmed" || a.status === "cancelled");
      if (allDone) {
        setPhase("done");
        appendAssistantText("所有操作已完成 🎉");
      } else {
        setPhase("selected");
      }
    } catch (err) {
      appendAssistantText(err instanceof Error ? err.message : "取消失败");
    } finally {
      setActionQuotingId(null);
    }
  };

  const handleWhatIf = async (scenario: "rain" | "late" | "budget") => {
    if (!lastPlanIdRef.current) return;
    const prompt =
      scenario === "rain"
        ? "如果下雨怎么办"
        : scenario === "late"
          ? "如果迟到 1 小时怎么办"
          : "预算减半怎么调整";

    doSubmit(`${prompt}，基于当前方案调整`);
  };

  const handleNewRound = () => {
    setMessages([]);
    setPhase("idle");
    setPlanId(null);
    setError(null);
    setCachedActions([]);
    setActionQuotedPreview(null);
    setActionQuotingId(null);
    lastPlanIdRef.current = null;
  };

  /* ── 渲染辅助 ── */

  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === "user") {
      return (
        <div key={msg.id} className={styles.featureMessageRowRight}>
          <div className={styles.featureUserBubble}>
            <p>{msg.content}</p>
          </div>
        </div>
      );
    }

    if (msg.type === "thinking") {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            <div className={styles.featureThinkingDots}>
              <span /><span /><span />
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "text") {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            <p>{msg.content}</p>
          </div>
        </div>
      );
    }

    if (msg.type === "plan_cards" && msg.plans) {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            {msg.content && <p>{msg.content}</p>}
            <div className={styles.featurePlanCardsScroll}>
              {msg.plans.map((card) => (
                <div
                  key={card.id}
                  className={styles.featurePlanCard}
                >
                  <div className={styles.featurePlanCardHeader}>
                    <h4>{card.title}</h4>
                  </div>
                  <p className={styles.featurePlanCardSummary}>{card.summary}</p>
                  {card.reason && (
                    <p className={styles.featurePlanCardReason}>{card.reason}</p>
                  )}
                  {card.timeline.length > 0 && (
                    <div className={styles.featureTimeline}>
                      {card.timeline.map((step, i) => (
                        <div key={i} className={styles.featureTimelineItem}>
                          <span className={styles.featureTimelineTime}>{step.time}</span>
                          <span className={styles.featureTimelineTitle}>{step.title}</span>
                          {step.subtitle && (
                            <span className={styles.featureTimelineSub}>{step.subtitle}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {card.tags.length > 0 && (
                    <div className={styles.featurePlanTags}>
                      {card.tags.map((t, i) => (
                        <span key={i} className={styles.featurePlanTag}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div className={styles.featurePlanMeta}>
                    <span>💰 {card.budget}</span>
                    {card.distance && <span>🚶 {card.distance}</span>}
                  </div>
                  {card.risk && (
                    <p className={styles.featurePlanRisk}>⚠️ {card.risk}</p>
                  )}
                  {phase === "result" && (
                    <Button
                      variant="primary"
                      size="small"
                      className={styles.featurePlanSelectBtn}
                      onClick={() => handleSelectPlan(card.id, card.title)}
                    >
                      选这个方案
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "action_cards" && msg.actions) {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            {msg.content && <p>{msg.content}</p>}
            <div className={styles.featureActionCardsGrid}>
              {msg.actions.map((action) => (
                <div
                  key={action.id}
                  className={`${styles.featureActionCard} ${
                    action.status === "confirmed" ? styles.featureActionCardConfirmed : ""
                  } ${action.status === "cancelled" ? styles.featureActionCardCancelled : ""}`}
                >
                  <div className={styles.featureActionCardHeader}>
                    <span className={styles.featureActionTypeIcon}>
                      {action.type.includes("reservation") && "🍽️"}
                      {action.type.includes("ticket") && "🎫"}
                      {action.type.includes("calendar") && "📅"}
                      {action.type.includes("share") && "📤"}
                      {action.type.includes("navigation") && "🗺️"}
                      {action.type.includes("memory") && "🧠"}
                    </span>
                    <span className={styles.featureActionTitle}>{action.title}</span>
                    {action.status === "confirmed" && (
                      <span className={styles.featureActionConfirmedBadge}>✅ 已确认</span>
                    )}
                    {action.status === "cancelled" && (
                      <span className={styles.featureActionCancelledBadge}>已取消</span>
                    )}
                  </div>
                  <p className={styles.featureActionDesc}>{action.description}</p>

                  {/* 报价预览 */}
                  {actionQuotedPreview?.actionId === action.id && (
                    <div className={styles.featureActionPreview}>
                      <div className={styles.featureActionPreviewContent}>
                        <div className={styles.featureActionPreviewTitle}>
                          {actionQuotedPreview.title}
                        </div>
                        {actionQuotedPreview.price && (
                          <div className={styles.featureActionPreviewPrice}>
                            {actionQuotedPreview.price}
                          </div>
                        )}
                      </div>
                      <div className={styles.featureActionPreviewActions}>
                        <Button
                          variant="primary"
                          size="small"
                          disabled={actionQuotingId === action.id}
                          onClick={() => handleConfirmAction(action.id)}
                        >
                          {action.confirmLabel || "确认"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          disabled={actionQuotingId === action.id}
                          onClick={() => {
                            setActionQuotedPreview(null);
                            handleCancelAction(action.id);
                          }}
                        >
                          {actionQuotedPreview.cancelLabel || "取消"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  {action.status !== "confirmed" && action.status !== "cancelled" && !actionQuotedPreview?.actionId && (
                    <div className={styles.featureActionBtns}>
                      {action.priceEstimate && action.status === "quoted" ? (
                        <>
                          <Button
                            variant="primary"
                            size="small"
                            disabled={actionQuotingId === action.id}
                            onClick={() => handleConfirmAction(action.id)}
                          >
                            {actionQuotingId === action.id ? "处理中…" : (action.confirmLabel || "确认")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="small"
                            disabled={actionQuotingId === action.id}
                            onClick={() => handleCancelAction(action.id)}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="primary"
                          size="small"
                          disabled={actionQuotingId === action.id}
                          onClick={() => handleQuoteAction(action.id)}
                        >
                          {actionQuotingId === action.id ? "查询中…" : (action.confirmLabel || "查看详情")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "action_result") {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            <p>{msg.content}</p>
          </div>
        </div>
      );
    }

    return null;
  };

  /* ── JSX ── */

  if (phase === "idle") {
    return (
      <div className={`${styles.featureShell} ${styles.featureShellIdle}`}>
        {/* 3D 背景装饰 */}
        <div className={styles.featureBg3D} aria-hidden="true">
          <div className={`${styles.bgOrb} ${styles.bgOrb1}`} />
          <div className={`${styles.bgOrb} ${styles.bgOrb2}`} />
          <div className={`${styles.bgOrb} ${styles.bgOrb3}`} />
          <div className={`${styles.bgOrb} ${styles.bgOrb4}`} />
          <div className={`${styles.bgCard} ${styles.bgCard1}`}>
            <span>🍜</span>
            <strong>武康路晚餐</strong>
            <em>17:30 · 人均 ¥180</em>
          </div>
          <div className={`${styles.bgCard} ${styles.bgCard2}`}>
            <span>☀️</span>
            <strong>周六 24℃</strong>
            <em>傍晚可能有雨</em>
          </div>
          <div className={`${styles.bgCard} ${styles.bgCard3}`}>
            <span>🗺️</span>
            <strong>3 套备选方案</strong>
            <em>亲子 / 雨天 / 朋友</em>
          </div>
          <div className={styles.bgGrid} />
        </div>

        <div className={styles.featureComposerHero}>
          <div className={styles.featureHeroTitle}>
            <span className={styles.featureHeroIcon}>✨</span>
            <h1>周末去哪儿</h1>
            <p className={styles.featureHeroSub}>输入一句话，AI 帮你规划完美周末</p>
          </div>
          <div className={styles.featureHeroComposer}>
            <textarea
              ref={textareaRef}
              className={styles.featureTextarea}
              placeholder="明天带娃半天，预算 300，想玩点不一样的…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleComposerSubmit();
                }
              }}
              rows={3}
            />
            <div className={styles.featureHeroComposerActions}>
              <div className={styles.featureHeroComposerLeft}>
                <span className={styles.featureComposerCity}>
                  📍 {city}
                </span>
                {user ? (
                  <span className={styles.featureComposerUser}>
                    👤 {user.name || "已登录"}
                  </span>
                ) : (
                  <button
                    className={styles.featureComposerLoginLink}
                    onClick={() => onOpenModal?.("login")}
                  >
                    登录解锁更多
                  </button>
                )}
              </div>
              <Button
                variant="primary"
                size="small"
                onClick={handleComposerSubmit}
                disabled={!inputValue.trim()}
              >
                开始规划
              </Button>
            </div>
          </div>
          <div className={styles.featureExampleChips}>
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip.label}
                className={styles.featureChip}
                onClick={() => handleExampleChip(chip.prompt)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.featureShell}>
      <div className={styles.featureChatWorkspace}>
        {/* 消息列表 */}
        <div className={styles.featureMessages}>
          <div className={styles.featureMessagesInner}>
            {messages.map(renderMessage)}
            <div ref={endRef} />
          </div>
        </div>

        {/* What-if bar */}
        {showWhatIfBar && (
          <div className={styles.featureWhatIfBar}>
            <span className={styles.featureWhatIfLabel}>💡 如果…</span>
            {WHAT_IF_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={styles.featureWhatIfBtn}
                onClick={() => handleWhatIf(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* 错误状态 */}
        {phase === "error" && error && (
          <div className={styles.featureErrorCard}>
            <div className={styles.featureErrorTitle}>网络异常，请稍后重试</div>
            <div className={styles.featureErrorActions}>
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setError(null);
                  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                  if (lastUserMsg) doSubmit(lastUserMsg.content);
                }}
              >
                重试
              </Button>
              <Button
                variant="ghost"
                size="small"
                onClick={handleNewRound}
              >
                新一轮
              </Button>
            </div>
          </div>
        )}

        {/* 底部 composer */}
        <div className={styles.featureComposerDock}>
          <div className={styles.featureDockCard}>
            <textarea
              ref={textareaRef}
              className={styles.featureTextarea}
              placeholder={
                phase === "result"
                  ? "对方案满意吗？选择一个开始执行…"
                  : phase === "selected" || phase === "done"
                    ? "还想调整什么？输入 what-if…"
                    : "继续描述你的需求…"
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleComposerSubmit();
                }
              }}
              rows={2}
            />
            <div className={styles.featureDockActions}>
              <span className={styles.featureComposerCity}>📍 {city}</span>
              <Button
                variant="primary"
                size="small"
                onClick={handleComposerSubmit}
                disabled={!inputValue.trim() || phase === "understanding" || phase === "planning"}
              >
                发送
              </Button>
              <button
                className={styles.featureNewRoundBtn}
                onClick={handleNewRound}
                title="新一轮规划"
              >
                🔄
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
