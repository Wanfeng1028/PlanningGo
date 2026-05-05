import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { enterAsGuest, login, register } from "../lib/api";
import type { ModalKey, SessionUser } from "../types";
import modalStyles from "./Modal.module.scss";
import styles from "./AuthModal.module.scss";

interface AuthModalProps {
  mode: Extract<ModalKey, "login" | "register" | "guest">;
  onClose: () => void;
  onSuccess: (user: SessionUser) => void;
}

export function AuthModal({ mode, onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "小明",
    phone: "13800000000",
    code: "123456",
    city: "杭州",
    startPoint: "浙大紫金港",
    companions: "family",
    budgetMin: "300",
    budgetMax: "500",
  });

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const complete = async () => {
    setLoading(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await login(form.phone, form.code)
          : mode === "guest"
            ? await enterAsGuest({ city: form.city, startPoint: form.startPoint, companions: form.companions })
            : await register({
                name: form.name,
                phone: form.phone,
                city: form.city,
                startPoint: form.startPoint,
                companions: form.companions,
                budgetMin: Number(form.budgetMin),
                budgetMax: Number(form.budgetMax),
              });
      onSuccess({
        id: result.user.id,
        name: result.user.name,
        mode: result.user.mode ?? (mode === "guest" ? "guest" : "registered"),
        city: result.profile?.city ?? form.city,
      });
      onClose();
    } catch {
      if (mode === "guest") {
        onSuccess({ id: "local_guest", name: "游客", mode: "guest", city: form.city });
        onClose();
        return;
      }
      setError("服务暂时不可用，请稍后重试。演示时可以先用游客访问。");
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login" ? "登录周末有谱" : mode === "guest" ? "游客访问" : "注册并建立画像";
  const eyebrow = mode === "login" ? "登录" : mode === "guest" ? "游客模式" : "注册 / 首次画像";

  return (
    <div className={modalStyles.backdrop} role="presentation" onMouseDown={onClose}>
      <section className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className={modalStyles.head}>
          <span className={modalStyles.eyebrow}>{eyebrow}</span>
          <button className={modalStyles.close} type="button" aria-label="关闭弹窗" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={modalStyles.body}>
          <h2 className={modalStyles.title} id="auth-title">{title}</h2>
          <p className={modalStyles.copy}>
            {mode === "login"
              ? "登录后加载城市、家庭成员、预算偏好和历史记忆。"
              : mode === "guest"
                ? "不注册也可以完整体验规划流程，游客画像会保留 2 小时。"
                : "注册分三步：账号、出发地和画像偏好，完成后直接进入规划工作台。"}
          </p>

          {mode === "register" ? (
            <div className={styles.stepper} aria-label="注册步骤">
              {[0, 1, 2].map((item) => (
                <span className={`${styles.step} ${step >= item ? styles.stepActive : ""}`} key={item} />
              ))}
            </div>
          ) : null}

          <div className={styles.form}>
            {mode === "guest" ? (
              <div className={styles.guestCard}>
                <strong>游客可体验</strong>
                <span>一句话规划、定位手动输入、三方案对比、分享预览和记忆模拟。支付、真实预约和长期记忆需要登录。</span>
              </div>
            ) : null}

            {(mode === "login" || (mode === "register" && step === 0)) ? (
              <div className={styles.grid}>
                {mode === "register" ? (
                  <div className={styles.field}>
                    <label htmlFor="auth-name">昵称</label>
                    <input id="auth-name" value={form.name} onChange={(event) => update("name", event.target.value)} />
                  </div>
                ) : null}
                <div className={styles.field}>
                  <label htmlFor="auth-phone">手机号</label>
                  <input id="auth-phone" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="auth-code">验证码</label>
                  <input id="auth-code" value={form.code} onChange={(event) => update("code", event.target.value)} />
                </div>
              </div>
            ) : null}

            {(mode === "guest" || (mode === "register" && step === 1)) ? (
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor="auth-city">城市</label>
                  <input id="auth-city" value={form.city} onChange={(event) => update("city", event.target.value)} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="auth-start">常用起点</label>
                  <input id="auth-start" value={form.startPoint} onChange={(event) => update("startPoint", event.target.value)} />
                </div>
              </div>
            ) : null}

            {(mode === "guest" || (mode === "register" && step === 2)) ? (
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor="auth-companions">默认同行人</label>
                  <select id="auth-companions" value={form.companions} onChange={(event) => update("companions", event.target.value)}>
                    <option value="family">家庭</option>
                    <option value="friends">朋友</option>
                    <option value="couple">情侣</option>
                    <option value="solo">自己</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="auth-budget">预算范围</label>
                  <input id="auth-budget" value={`${form.budgetMin}-${form.budgetMax}`} readOnly />
                </div>
              </div>
            ) : null}

            {error ? <div className={styles.error}>{error}</div> : null}

            <div className={styles.actions}>
              {mode === "register" && step > 0 ? (
                <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>上一步</Button>
              ) : null}
              {mode === "register" && step < 2 ? (
                <Button onClick={() => setStep((value) => value + 1)}>下一步</Button>
              ) : (
                <Button onClick={complete} disabled={loading}>{loading ? "处理中" : mode === "login" ? "登录并继续" : mode === "guest" ? "以游客身份进入" : "完成注册"}</Button>
              )}
              {mode !== "guest" ? (
                <Button variant="ghost" onClick={async () => {
                  setLoading(true);
                  await enterAsGuest({ city: form.city, startPoint: form.startPoint, companions: form.companions })
                    .then((result) => onSuccess({ id: result.user.id, name: "游客", mode: "guest", city: form.city }))
                    .catch(() => onSuccess({ id: "local_guest", name: "游客", mode: "guest", city: form.city }))
                    .finally(() => {
                      setLoading(false);
                      onClose();
                    });
                }}>
                  游客访问
                </Button>
              ) : null}
            </div>
            <p className={styles.hint}>演示验证码可直接使用 123456。游客模式不会保存长期记忆。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
