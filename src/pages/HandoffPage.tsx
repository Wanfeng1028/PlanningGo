import { useEffect, useMemo, useState, useCallback } from "react";
import {
  claimHandoffCode,
  getHandoffDetail,
  type HandoffDetail,
  type PlanningOption,
  type PlanningTimelineStep,
} from "../lib/api";

interface HandoffPageProps {
  code: string;
}

type HandoffStatus = "loading" | "claimed" | "expired" | "error";

type MobileAction = {
  id: string;
  label: string;
  description?: string;
  url?: string;
  copyText?: string;
};

const pageStyle = {
  minHeight: "100dvh",
  padding: "20px 14px 32px",
  background: "linear-gradient(180deg, #fbfaf7 0%, #f3efe7 100%)",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  color: "#1a1a2e",
} satisfies React.CSSProperties;

const cardStyle = {
  borderRadius: 18,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(26,26,46,0.08)",
  boxShadow: "0 10px 32px rgba(26,26,46,0.07)",
} satisfies React.CSSProperties;

function actionFromRaw(raw: unknown, index: number): MobileAction | null {
  if (!raw || typeof raw !== "object") return null;
  const action = raw as Record<string, unknown>;
  const payload = typeof action.payload === "object" && action.payload !== null
    ? action.payload as Record<string, unknown>
    : {};
  const label = typeof action.label === "string"
    ? action.label
    : typeof action.title === "string"
      ? action.title
      : typeof payload.label === "string"
        ? payload.label
        : "";
  if (!label) return null;

  return {
    id: typeof action.key === "string" ? action.key : typeof action.id === "string" ? action.id : `action-${index}`,
    label,
    description: typeof action.description === "string" ? action.description : undefined,
    url: typeof action.redirectUrl === "string"
      ? action.redirectUrl
      : typeof action.url === "string"
        ? action.url
        : typeof payload.url === "string"
          ? payload.url
          : undefined,
    copyText: typeof action.copyText === "string"
      ? action.copyText
      : typeof payload.copyText === "string"
        ? payload.copyText
        : undefined,
  };
}

function stepActions(step: PlanningTimelineStep): MobileAction[] {
  return (step.serviceActions ?? [])
    .map((action, index) => actionFromRaw(action, index))
    .filter((action): action is MobileAction => Boolean(action));
}

function optionMeta(option?: PlanningOption | null) {
  if (!option) return "";
  const parts = [];
  if (option.totalDurationMinutes) {
    const h = Math.floor(option.totalDurationMinutes / 60);
    const m = option.totalDurationMinutes % 60;
    parts.push(`${h ? `${h}小时` : ""}${m ? `${m}分钟` : ""}`);
  }
  if (option.totalCostMin || option.totalCostMax) {
    parts.push(`¥${option.totalCostMin ?? 0}-${option.totalCostMax ?? option.totalCostMin ?? 0}`);
  }
  if (option.walkingKm) parts.push(`步行 ${option.walkingKm}km`);
  return parts.filter(Boolean).join(" · ");
}

function BrandHeader() {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "linear-gradient(135deg, #ffcc33, #e6b800)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 900,
        }}>
          P
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>周末去哪儿</div>
          <div style={{ fontSize: 11, color: "rgba(26,26,46,0.48)" }}>手机接续</div>
        </div>
      </div>
      <a href="/" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>首页</a>
    </header>
  );
}

function ActionButton({ action, onDone }: { action: MobileAction; onDone: (text: string) => void }) {
  const handleClick = async () => {
    if (action.copyText) {
      try {
        await navigator.clipboard.writeText(action.copyText);
        onDone("已复制，可到对应应用中粘贴确认");
      } catch {
        onDone("复制失败，请长按文字手动复制");
      }
      return;
    }
    if (action.url) {
      window.open(action.url, "_blank", "noopener,noreferrer");
      onDone("已打开第三方页面，请在对方页面确认");
      return;
    }
    onDone("这个动作已准备好，最终确认仍由你完成");
  };

  return (
    <button
      onClick={handleClick}
      style={{
        border: "1px solid rgba(255,204,51,0.42)",
        background: "#fffaf0",
        color: "#1a1a2e",
        borderRadius: 999,
        padding: "9px 12px",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {action.copyText ? "复制 " : action.url ? "打开 " : "查看 "}{action.label}
    </button>
  );
}

function TimelineStep({ step, onToast }: { step: PlanningTimelineStep; onToast: (text: string) => void }) {
  const actions = stepActions(step);
  return (
    <li style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, padding: "14px 0", borderBottom: "1px solid rgba(26,26,46,0.06)" }}>
      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
        <strong style={{ display: "block", color: "#1a1a2e" }}>{step.startTime}</strong>
        <span>{step.endTime}</span>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{step.title}</div>
        {step.poiName && <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{step.poiName}</div>}
        {step.description && <p style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.55, margin: "0 0 8px" }}>{step.description}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {step.transport && step.transport !== "none" && <span style={pillStyle}>交通 {step.transport}</span>}
          {step.estimatedCost && <span style={pillStyle}>{step.estimatedCost}</span>}
          {step.bookingNeeded && <span style={warningPillStyle}>需确认</span>}
        </div>
        {actions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {actions.map((action) => <ActionButton key={action.id} action={action} onDone={onToast} />)}
          </div>
        )}
      </div>
    </li>
  );
}

const pillStyle = {
  borderRadius: 999,
  background: "rgba(26,26,46,0.04)",
  color: "#6b7280",
  fontSize: 11,
  padding: "4px 8px",
} satisfies React.CSSProperties;

const warningPillStyle = {
  ...pillStyle,
  background: "rgba(239,68,68,0.08)",
  color: "#dc2626",
} satisfies React.CSSProperties;

export function HandoffPage({ code }: HandoffPageProps) {
  const [status, setStatus] = useState<HandoffStatus>("loading");
  const [detail, setDetail] = useState<HandoffDetail | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState("");

  const selectedOption = useMemo(() => {
    const plan = detail?.plan;
    return plan?.selectedOption ?? plan?.options?.[0] ?? null;
  }, [detail]);

  const topActions = useMemo(() => {
    const plan = detail?.plan;
    return (plan?.planningActions ?? [])
      .map((action, index) => actionFromRaw(action, index))
      .filter((action): action is MobileAction => action !== null)
      .filter((action) => action.id !== "mobile_handoff");
  }, [detail]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!code) {
        setStatus("error");
        setErrorMsg("无效的接续码");
        return;
      }

      const loaded = await getHandoffDetail(code);
      if (cancelled) return;
      if (!loaded) {
        setStatus("expired");
        setErrorMsg("接续码不存在或已过期，请在电脑上重新生成");
        return;
      }

      setDetail(loaded);
      const deviceId = `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await claimHandoffCode(code, deviceId);
      } catch {
        // 详情已拿到时，认领失败通常是重复扫码；仍允许只读查看当前方案。
      }
      if (!cancelled) setStatus("claimed");
    }

    load();
    return () => { cancelled = true; };
  }, [code]);

  if (status === "loading") {
    return (
      <main style={{ ...pageStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 46,
            height: 46,
            border: "3px solid rgba(26,26,46,0.1)",
            borderTopColor: "#ffcc33",
            borderRadius: "50%",
            animation: "handoffSpin 0.8s linear infinite",
            margin: "0 auto 14px",
          }} />
          <p style={{ color: "#6b7280", fontSize: 14 }}>正在接续规划…</p>
          <style>{`@keyframes handoffSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </main>
    );
  }

  if (status === "expired" || status === "error") {
    return (
      <main style={pageStyle}>
        <BrandHeader />
        <section style={{ ...cardStyle, padding: 22, textAlign: "center", marginTop: 80 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>{status === "expired" ? "⏰" : "⚠️"}</div>
          <h1 style={{ fontSize: 19, margin: "0 0 8px" }}>{status === "expired" ? "接续码不可用" : "加载失败"}</h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 18px" }}>{errorMsg || "无法加载规划方案，请稍后重试。"}</p>
          <a href="/" style={{ display: "inline-block", padding: "11px 22px", borderRadius: 999, background: "#ffcc33", color: "#1a1a2e", fontWeight: 800, textDecoration: "none", fontSize: 14 }}>返回首页</a>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <BrandHeader />

      <section style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>已接续 · {detail?.conversation.city ?? "当前城市"}</div>
        <h1 style={{ fontSize: 21, lineHeight: 1.25, margin: "0 0 8px" }}>
          {selectedOption?.title ?? detail?.conversation.title ?? "你的规划方案"}
        </h1>
        {(selectedOption?.summary || detail?.plan?.summary) && (
          <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.65, margin: "0 0 12px" }}>
            {selectedOption?.summary || detail?.plan?.summary}
          </p>
        )}
        {optionMeta(selectedOption) && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>{optionMeta(selectedOption)}</div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {topActions.map((action) => <ActionButton key={action.id} action={action} onDone={showToast} />)}
          <a
            href={`/features?continue=${detail?.conversation.id ?? ""}`}
            style={{
              border: "1px solid rgba(26,26,46,0.09)",
              background: "#fff",
              color: "#1a1a2e",
              borderRadius: 999,
              padding: "9px 12px",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            打开完整助手
          </a>
        </div>
      </section>

      {selectedOption?.risks?.length ? (
        <section style={{ ...cardStyle, padding: 14, marginBottom: 14, background: "rgba(255,250,240,0.95)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>需要留意</div>
          <ul style={{ paddingLeft: 18, margin: 0, color: "#7c2d12", fontSize: 12, lineHeight: 1.6 }}>
            {selectedOption.risks.slice(0, 3).map((risk) => <li key={risk}>{risk}</li>)}
          </ul>
        </section>
      ) : null}

      <section style={{ ...cardStyle, padding: "2px 16px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 2px" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>今天的行程</h2>
          <span style={{ fontSize: 11, color: "rgba(26,26,46,0.45)" }}>接续码 {code}</span>
        </div>
        {selectedOption?.timeline?.length ? (
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {selectedOption.timeline.map((step) => <TimelineStep key={step.id} step={step} onToast={showToast} />)}
          </ol>
        ) : (
          <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>这个接续码还没有可展示的详细行程。</p>
        )}
      </section>

      <p style={{ fontSize: 11, color: "rgba(26,26,46,0.42)", lineHeight: 1.6, textAlign: "center", margin: "16px 4px 0" }}>
        这里不会替你付款或最终下单；所有第三方页面都需要你自己确认。
      </p>

      {toast && (
        <div style={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: 18,
          borderRadius: 14,
          background: "rgba(26,26,46,0.92)",
          color: "#fff",
          fontSize: 13,
          textAlign: "center",
          padding: "12px 14px",
          boxShadow: "0 12px 28px rgba(26,26,46,0.18)",
        }}>
          {toast}
        </div>
      )}
    </main>
  );
}

export default HandoffPage;
