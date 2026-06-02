import { useEffect, useState, useCallback } from "react";
import { createHandoffCode, type HandoffCodeResult } from "../../lib/api";

interface MobileHandoffQRCodeProps {
  conversationId: string;
  planId?: string;
  onClose?: () => void;
}

/**
 * MobileHandoffQRCode — 桌面端显示二维码，手机扫码继续当前规划
 *
 * 安全设计：
 * - 二维码只包含短期 handoff URL，不含 accessToken / refreshToken
 * - code 10 分钟有效，一次性使用
 */
export function MobileHandoffQRCode({ conversationId, planId, onClose }: MobileHandoffQRCodeProps) {
  const [result, setResult] = useState<HandoffCodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(600); // 10 minutes in seconds

  useEffect(() => {
    createHandoffCode({ conversationId, planId })
      .then((r) => {
        setResult(r);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "生成二维码失败");
        setLoading(false);
      });
  }, [conversationId, planId]);

  // Countdown timer
  useEffect(() => {
    if (!result) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setError("二维码已过期，请重新生成");
          setResult(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [result]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, []);

  if (loading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: 24,
      }}>
        <div style={{
          width: 48,
          height: 48,
          border: "3px solid rgba(26,26,46,0.1)",
          borderTopColor: "#ffcc33",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <p style={{ color: "#6b7280", fontSize: 14 }}>正在生成二维码…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: 24,
      }}>
        <p style={{ color: "#ef4444", fontSize: 14 }}>{error}</p>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px",
              borderRadius: 999,
              border: "1px solid rgba(26,26,46,0.1)",
              background: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            关闭
          </button>
        )}
      </div>
    );
  }

  if (!result) return null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 16,
      padding: 24,
    }}>
      <h3 style={{
        fontSize: 16,
        fontWeight: 700,
        color: "#1a1a2e",
        margin: 0,
      }}>
        手机扫码继续
      </h3>

      <p style={{
        fontSize: 13,
        color: "#6b7280",
        textAlign: "center",
        margin: 0,
        maxWidth: 280,
      }}>
        使用手机扫描下方二维码，可以在手机上继续查看和导航当前规划方案。
      </p>

      <div
        style={{
          width: 200,
          height: 200,
          borderRadius: 16,
          background: "#fff",
          border: "1px solid rgba(26,26,46,0.08)",
          boxShadow: "0 8px 32px rgba(26,26,46,0.06)",
          padding: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        dangerouslySetInnerHTML={{ __html: result.qrSvg }}
      />

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: countdown < 60 ? "#ef4444" : "#6b7280",
      }}>
        <span>剩余时间：{formatTime(countdown)}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span>一次性使用</span>
      </div>

      <p style={{
        fontSize: 11,
        color: "rgba(26,26,46,0.35)",
        textAlign: "center",
        margin: 0,
        maxWidth: 260,
      }}>
        二维码不含任何登录信息，扫码后需要在手机上登录或继续浏览。
      </p>

      {onClose && (
        <button
          onClick={onClose}
          style={{
            padding: "8px 20px",
            borderRadius: 999,
            border: "1px solid rgba(26,26,46,0.1)",
            background: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          关闭
        </button>
      )}
    </div>
  );
}
