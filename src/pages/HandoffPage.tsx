import { useEffect, useState, useCallback } from "react";
import { getHandoffCode, claimHandoffCode } from "../lib/api";

interface HandoffPageProps {
  code: string;
}

/**
 * HandoffPage — 手机扫码后打开的页面
 * 展示规划摘要，提供登录入口或只读浏览
 */
export function HandoffPage({ code }: HandoffPageProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "claimed" | "expired" | "error">("loading");
  const [data, setData] = useState<{
    conversationId: string;
    planId: string | null;
    title?: string;
    summary?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 1: Query the handoff code
  useEffect(() => {
    if (!code) {
      setStatus("error");
      setErrorMsg("无效的接续码");
      return;
    }

    getHandoffCode(code)
      .then((result) => {
        if (!result) {
          setStatus("expired");
          setErrorMsg("接续码不存在或已过期");
          return;
        }
        setData({
          conversationId: result.conversationId,
          planId: result.planId,
        });
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("无法连接到服务器");
      });
  }, [code]);

  // Step 2: Claim the code (one-time use)
  const handleClaim = useCallback(async () => {
    if (!code || !data) return;

    // Generate a simple device ID
    const deviceId = `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const claimResult = await claimHandoffCode(code, deviceId);
      if (claimResult.success) {
        setStatus("claimed");
        // Optionally load conversation summary here
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("expired")) {
        setStatus("expired");
        setErrorMsg("接续码已过期");
      } else if (msg.includes("already claimed")) {
        setStatus("claimed");
      } else {
        setStatus("error");
        setErrorMsg("认领失败，请重试");
      }
    }
  }, [code, data]);

  // Auto-claim on mount when ready
  useEffect(() => {
    if (status === "ready" && data) {
      handleClaim();
    }
  }, [status, data, handleClaim]);

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      background: "linear-gradient(180deg, #faf8f4 0%, #f3efe7 100%)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 24,
      }}>
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
          color: "#1a1a2e",
        }}>
          P
        </div>
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#1a1a2e",
        }}>
          周末去哪儿
        </span>
      </div>

      {/* Loading state */}
      {status === "loading" && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}>
          <div style={{
            width: 48,
            height: 48,
            border: "3px solid rgba(26,26,46,0.1)",
            borderTopColor: "#ffcc33",
            borderRadius: "50%",
            animation: "handoffSpin 0.8s linear infinite",
          }} />
          <p style={{ color: "#6b7280", fontSize: 14 }}>正在加载规划…</p>
          <style>{`@keyframes handoffSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Ready / Claimed state */}
      {(status === "ready" || status === "claimed") && data && (
        <div style={{
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
        }}>
          <div style={{
            padding: "24px 20px",
            borderRadius: 20,
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,204,51,0.2)",
            boxShadow: "0 8px 32px rgba(26,26,46,0.06)",
            backdropFilter: "blur(16px)",
          }}>
            <div style={{
              fontSize: 32,
              marginBottom: 12,
            }}>
              {status === "claimed" ? "\u2705" : "\ud83d\udcf1"}
            </div>

            <h2 style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#1a1a2e",
              margin: "0 0 8px",
            }}>
              {status === "claimed" ? "已接续成功" : "规划方案接续"}
            </h2>

            <p style={{
              fontSize: 14,
              color: "#6b7280",
              lineHeight: 1.6,
              margin: "0 0 20px",
            }}>
              {status === "claimed"
                ? "你可以在手机上继续查看这个规划方案。建议登录账号以保存方案并同步历史。"
                : "正在接续桌面端的规划方案…"
              }
            </p>

            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              <a
                href={`/features?continue=${data.conversationId}`}
                style={{
                  display: "block",
                  padding: "12px 24px",
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #ffcc33, #e6b800)",
                  color: "#1a1a2e",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                打开规划助手
              </a>
              <a
                href="/"
                style={{
                  display: "block",
                  padding: "12px 24px",
                  borderRadius: 999,
                  border: "1px solid rgba(26,26,46,0.1)",
                  background: "rgba(255,255,255,0.7)",
                  color: "#6b7280",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                返回首页
              </a>
            </div>
          </div>

          <p style={{
            fontSize: 11,
            color: "rgba(26,26,46,0.35)",
            marginTop: 16,
          }}>
            接续码 {code} · 一次性使用 · 10 分钟有效
          </p>
        </div>
      )}

      {/* Expired state */}
      {status === "expired" && (
        <div style={{
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
          padding: "24px 20px",
          borderRadius: 20,
          background: "rgba(254,242,242,0.85)",
          border: "1px solid rgba(239,68,68,0.15)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\u23f0"}</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", margin: "0 0 8px" }}>
            二维码已过期
          </h2>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 20px" }}>
            {errorMsg || "此接续码已过期，请在桌面端重新生成二维码。"}
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: 999,
              background: "rgba(26,26,46,0.05)",
              color: "#1a1a2e",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            返回首页
          </a>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div style={{
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
          padding: "24px 20px",
          borderRadius: 20,
          background: "rgba(254,242,242,0.85)",
          border: "1px solid rgba(239,68,68,0.15)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\u26a0\ufe0f"}</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", margin: "0 0 8px" }}>
            加载失败
          </h2>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 20px" }}>
            {errorMsg || "无法加载规划方案，请稍后重试。"}
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: 999,
              background: "rgba(26,26,46,0.05)",
              color: "#1a1a2e",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            返回首页
          </a>
        </div>
      )}
    </div>
  );
}

export default HandoffPage;
