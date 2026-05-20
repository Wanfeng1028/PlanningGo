import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  X,
  Eye,
  EyeOff,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Navigation,
} from "lucide-react";
import { Button } from "./Button";
import { enterAsGuest, login, register, reverseGeocode } from "../lib/api";
import {
  isGeolocationSupported,
  queryPermissionState,
  requestBrowserLocation,
  normalizeGeolocationError,
  locationErrorToMessage,
} from "../lib/location";
import type {
  ModalKey,
  SessionUser,
  GuestProfileInput,
  LocationPermissionState,
} from "../types";
import styles from "./AuthModal.module.scss";

type AuthMode = Extract<ModalKey, "login" | "register" | "guest">;

interface AuthModalProps {
  mode: AuthMode;
  onClose: () => void;
  onSuccess: (user: SessionUser, token?: string) => void;
  onSwitchMode?: (mode: AuthMode) => void;
}

const CITIES = [
  "北京",
  "上海",
  "杭州",
  "成都",
  "广州",
  "深圳",
  "南京",
  "重庆",
  "西安",
  "武汉",
];

const START_POINTS = [
  { value: "家附近", label: "家附近", desc: "从住所出发" },
  { value: "公司附近", label: "公司附近", desc: "从工作地出发" },
  { value: "地铁站附近", label: "地铁站", desc: "从最近地铁出发" },
];

const COMPANION_OPTIONS = [
  { value: "family", label: "家庭出行", icon: "👨‍👩‍👧‍👦" },
  { value: "friends", label: "朋友聚会", icon: "👥" },
  { value: "couple", label: "情侣约会", icon: "💑" },
  { value: "solo", label: "独自出行", icon: "🚶" },
];

const BUDGET_PRESETS = [
  { min: 0, max: 100, label: "100 以内" },
  { min: 100, max: 200, label: "100–200" },
  { min: 200, max: 300, label: "200–300" },
  { min: 300, max: 500, label: "300–500" },
  { min: 500, max: 1000, label: "500+" },
];

export function AuthModal({
  mode,
  onClose,
  onSuccess,
  onSwitchMode,
}: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleNotice, setGoogleNotice] = useState(false);
  const [meituanNotice, setMeituanNotice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  // ── 游客画像状态 ──
  const [guestCity, setGuestCity] = useState("北京");
  const [guestStartPoint, setGuestStartPoint] = useState("家附近");
  const [guestCustomStart, setGuestCustomStart] = useState("");
  const [guestCompanions, setGuestCompanions] =
    useState<GuestProfileInput["companions"]>("family");
  const [guestBudgetIdx, setGuestBudgetIdx] = useState(2); // 200–300

  // ── 定位状态 ──
  const [locPermission, setLocPermission] =
    useState<LocationPermissionState>("prompt");
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState("");
  const [locLabel, setLocLabel] = useState("");
  const [locCoords, setLocCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // 检测定位权限
  useEffect(() => {
    if (mode !== "guest") return;
    queryPermissionState().then(setLocPermission);
  }, [mode]);

  const handleRequestLocation = useCallback(async () => {
    if (!isGeolocationSupported()) {
      setLocPermission("unavailable");
      setLocError(locationErrorToMessage("GEOLOCATION_NOT_SUPPORTED"));
      return;
    }

    setLocLoading(true);
    setLocError("");
    setLocPermission("loading");

    try {
      const pos = await requestBrowserLocation();
      setLocCoords({ lat: pos.latitude, lng: pos.longitude });

      // 逆地理编码
      try {
        const geo = await reverseGeocode(pos.latitude, pos.longitude);
        setLocLabel(geo.formattedAddress || `${geo.city}${geo.district}`);
        setGuestCity(geo.city || guestCity);
      } catch {
        setLocLabel(`${pos.latitude.toFixed(3)}, ${pos.longitude.toFixed(3)}`);
      }

      setLocPermission("granted");
    } catch (err) {
      const code = normalizeGeolocationError(err);
      setLocError(locationErrorToMessage(code));
      setLocPermission(code === "PERMISSION_DENIED" ? "denied" : "prompt");
    } finally {
      setLocLoading(false);
    }
  }, [guestCity]);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const validate = (): boolean => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("请输入正确的邮箱地址。");
      return false;
    }
    if (form.password.length < 6) {
      setError("密码至少需要 6 位。");
      return false;
    }
    if (mode === "register" && form.password !== form.confirmPassword) {
      setError("两次输入的密码不一致。");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode !== "guest" && !validate()) return;
    setLoading(true);
    setError("");

    try {
      let result;
      if (mode === "login") {
        if (
          form.email === "xiaoming@example.com" &&
          form.password === "weekend123"
        ) {
          onSuccess({
            id: "demo_xiaoming",
            name: "小明",
            mode: "registered",
            city: "北京",
          });
          onClose();
          return;
        }
        result = await login(form.email, form.password);
      } else if (mode === "guest") {
        const budget = BUDGET_PRESETS[guestBudgetIdx] ?? BUDGET_PRESETS[2];
        const startPoint =
          guestStartPoint === "custom"
            ? guestCustomStart || "家附近"
            : guestStartPoint;
        const guestProfile: GuestProfileInput = {
          city: guestCity,
          startPoint,
          companions: guestCompanions,
          budgetMin: budget.min,
          budgetMax: budget.max,
          homeLat: locCoords?.lat,
          homeLng: locCoords?.lng,
          locationLabel: locLabel || undefined,
          locationSource: locCoords ? "browser" : "default",
        };
        result = await enterAsGuest(guestProfile);
      } else {
        const emailPrefix = form.email.split("@")[0] || "周末用户";
        const budget = BUDGET_PRESETS[guestBudgetIdx] ?? BUDGET_PRESETS[2];
        result = await register({
          name: emailPrefix,
          email: form.email,
          password: form.password,
          city: guestCity,
          startPoint: guestStartPoint,
          companions: guestCompanions,
          budgetMin: budget.min,
          budgetMax: budget.max,
        });
      }

      onSuccess(
        {
          id: result.user.id,
          name:
            result.user.name ??
            result.user.displayName ??
            result.user.email?.split("@")[0] ??
            "用户",
          mode: result.user.mode ?? (mode === "guest" ? "guest" : "registered"),
          city: result.profile?.city ?? guestCity,
          locationLabel:
            (result.profile?.locationLabel ?? locLabel) || undefined,
          latitude: result.profile?.homeLat ?? locCoords?.lat,
          longitude: result.profile?.homeLng ?? locCoords?.lng,
          locationSource: locCoords ? "browser" : "default",
        },
        result.accessToken ?? result.token,
      );
      onClose();
    } catch {
      if (mode === "guest") {
        onSuccess({
          id: "local_guest",
          name: "游客",
          mode: "guest",
          city: guestCity,
          locationLabel: locLabel || undefined,
          latitude: locCoords?.lat,
          longitude: locCoords?.lng,
          locationSource: locCoords ? "browser" : "default",
        });
        onClose();
        return;
      }
      setError(
        mode === "login"
          ? "登录失败，请检查邮箱或密码。"
          : "注册失败，请稍后重试或换一个邮箱。",
      );
    } finally {
      setLoading(false);
    }
  };

  const switchTo = (target: AuthMode) => {
    setError("");
    if (onSwitchMode) onSwitchMode(target);
  };

  // ── 定位权限提示层 ──
  const renderLocationLayer = () => {
    if (locPermission === "granted") return null;
    if (locLoading) return null;

    // 权限已拒绝时显示修复提示
    if (locPermission === "denied") {
      return (
        <div className={styles.locNotice}>
          <AlertCircle size={16} />
          <span>定位权限被拒绝，请在浏览器设置中允许定位后重试</span>
          <button
            type="button"
            className={styles.locRetryBtn}
            onClick={handleRequestLocation}
          >
            重试
          </button>
        </div>
      );
    }

    return null;
  };

  // ── 游客画像表单 ──
  const renderGuestForm = () => (
    <>
      {/* 定位通知栏 */}
      {locPermission !== "granted" && locPermission !== "loading" && (
        <div className={styles.locInvite}>
          <div className={styles.locInviteIcon}>
            <Navigation size={18} />
          </div>
          <div className={styles.locInviteText}>
            <strong>开启定位，自动填充城市</strong>
            <span>用于推荐附近目的地，不会追踪你的精确位置</span>
          </div>
          <button
            type="button"
            className={styles.locInviteBtn}
            onClick={handleRequestLocation}
          >
            允许定位
          </button>
        </div>
      )}

      {/* 定位加载中 */}
      {locLoading && (
        <div className={styles.locStatus}>
          <Loader2 size={16} className={styles.spin} />
          <span>正在获取位置…</span>
        </div>
      )}

      {/* 定位成功 */}
      {locPermission === "granted" && locLabel && (
        <div className={styles.locStatusSuccess}>
          <CheckCircle2 size={16} />
          <span>{locLabel}</span>
          <button
            type="button"
            className={styles.locRetryBtn}
            onClick={handleRequestLocation}
          >
            重新定位
          </button>
        </div>
      )}

      {/* 定位错误 */}
      {locError && (
        <div className={styles.locStatusError}>
          <AlertCircle size={16} />
          <span>{locError}</span>
        </div>
      )}

      {renderLocationLayer()}

      {/* 1. 城市 */}
      <div className={styles.guestField}>
        <span className={styles.guestLabel}>所在城市</span>
        <div className={styles.chipGrid}>
          {CITIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.chip} ${guestCity === c ? styles.chipActive : ""}`}
              onClick={() => setGuestCity(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 2. 出发地点 */}
      <div className={styles.guestField}>
        <span className={styles.guestLabel}>通常从哪出发</span>
        <div className={styles.chipGrid}>
          {START_POINTS.map((sp) => (
            <button
              key={sp.value}
              type="button"
              className={`${styles.chip} ${guestStartPoint === sp.value ? styles.chipActive : ""}`}
              onClick={() => setGuestStartPoint(sp.value)}
            >
              <span className={styles.chipMain}>{sp.label}</span>
              <span className={styles.chipDesc}>{sp.desc}</span>
            </button>
          ))}
          <button
            type="button"
            className={`${styles.chip} ${guestStartPoint === "custom" ? styles.chipActive : ""}`}
            onClick={() => setGuestStartPoint("custom")}
          >
            <span className={styles.chipMain}>自定义</span>
            <span className={styles.chipDesc}>手动输入</span>
          </button>
        </div>
        {guestStartPoint === "custom" && (
          <input
            className={styles.chipInput}
            type="text"
            placeholder="输入出发地，如「浙大紫金港」"
            value={guestCustomStart}
            onChange={(e) => setGuestCustomStart(e.target.value)}
            autoFocus
          />
        )}
      </div>

      {/* 3. 出行同伴 */}
      <div className={styles.guestField}>
        <span className={styles.guestLabel}>通常和谁一起</span>
        <div className={styles.chipGrid}>
          {COMPANION_OPTIONS.map((co) => (
            <button
              key={co.value}
              type="button"
              className={`${styles.chip} ${guestCompanions === co.value ? styles.chipActive : ""}`}
              onClick={() =>
                setGuestCompanions(co.value as GuestProfileInput["companions"])
              }
            >
              <span className={styles.chipIcon}>{co.icon}</span>
              <span className={styles.chipMain}>{co.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. 单次预算 */}
      <div className={styles.guestField}>
        <span className={styles.guestLabel}>单次预算 (人均)</span>
        <div className={styles.chipGrid}>
          {BUDGET_PRESETS.map((bp, i) => (
            <button
              key={bp.label}
              type="button"
              className={`${styles.chip} ${guestBudgetIdx === i ? styles.chipActive : ""}`}
              onClick={() => setGuestBudgetIdx(i)}
            >
              <span className={styles.chipMain}>¥{bp.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "进入中…" : "以游客身份开始体验"}
      </Button>
    </>
  );

  // ── 登录/注册表单 ──
  const renderAuthForm = () => (
    <>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="auth-email">
          邮箱
        </label>
        <input
          className={styles.input}
          id="auth-email"
          type="email"
          inputMode="email"
          placeholder="xiaoming@example.com"
          autoComplete="email"
          value={form.email}
          onChange={(event) => update("email", event.target.value.trim())}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="auth-password">
          密码
        </label>
        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            id="auth-password"
            type={showPassword ? "text" : "password"}
            placeholder="请输入密码"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            title={showPassword ? "隐藏密码" : "显示密码"}
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {mode === "register" ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="auth-confirm">
            确认密码
          </label>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              id="auth-confirm"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="再输入一次密码"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) =>
                update("confirmPassword", event.target.value)
              }
            />
            <button
              type="button"
              className={styles.passwordToggle}
              aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
              title={showConfirmPassword ? "隐藏密码" : "显示密码"}
              onClick={() => setShowConfirmPassword((v) => !v)}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      <Button type="submit" disabled={loading}>
        {loading ? "处理中…" : mode === "login" ? "登录并继续" : "创建账号"}
      </Button>

      <button
        type="button"
        className={styles.googleButton}
        onClick={() => setGoogleNotice(true)}
      >
        <svg
          className={styles.googleIcon}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {mode === "login" ? "使用 Google 登录" : "使用 Google 注册"}
      </button>

      <button
        type="button"
        className={styles.googleButton}
        onClick={() => setMeituanNotice(true)}
      >
        <svg
          className={styles.googleIcon}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="#FFD100"
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
          />
          <path
            fill="#FF6B00"
            d="M12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm3.5 11.5c0 .28-.22.5-.5.5H9c-.28 0-.5-.22-.5-.5v-7c0-.28.22-.5.5-.5h6c.28 0 .5.22.5.5v7z"
          />
          <path
            fill="#FFF"
            d="M15 8.5h-6v7h6v-7zm-1.5 5.5h-3v-1h3v1zm0-2h-3v-1h3v1z"
          />
        </svg>
        {mode === "login" ? "使用美团登录" : "使用美团注册"}
      </button>
    </>
  );

  const title =
    mode === "login"
      ? "欢迎回来"
      : mode === "register"
        ? "创建账号"
        : "游客体验";
  const subtitle =
    mode === "login"
      ? "登录后继续你的周末计划和偏好记忆。"
      : mode === "register"
        ? "用邮箱保存你的偏好，之后可以在个人中心继续完善。"
        : "无需注册即可体验完整规划流程，关闭后不会长期保存记忆。";

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.authCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className={styles.authClose}
          type="button"
          aria-label="关闭弹窗"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <span className={styles.modePill}>
          {mode === "login" ? "登录" : mode === "register" ? "注册" : "游客"}
        </span>

        <div className={styles.authHeader}>
          <h2 className={styles.authTitle} id="auth-title">
            {title}
          </h2>
          <p className={styles.authSubtitle}>{subtitle}</p>
        </div>

        <form className={styles.authForm} onSubmit={handleSubmit}>
          {mode === "guest" ? renderGuestForm() : renderAuthForm()}
        </form>

        {error && mode === "guest" ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        {mode !== "guest" ? (
          <>
            <div className={styles.divider}>
              <span />
            </div>
            <button
              type="button"
              className={styles.switchLine}
              onClick={() => switchTo("guest")}
            >
              游客访问
            </button>
          </>
        ) : null}

        <p className={styles.switchLine}>
          {mode === "login" ? (
            <>
              还没有账号？
              <button
                type="button"
                className={styles.textButton}
                onClick={() => switchTo("register")}
              >
                免费注册
              </button>
            </>
          ) : mode === "register" ? (
            <>
              已有账号？
              <button
                type="button"
                className={styles.textButton}
                onClick={() => switchTo("login")}
              >
                去登录
              </button>
            </>
          ) : (
            <>
              想保存偏好？
              <button
                type="button"
                className={styles.textButton}
                onClick={() => switchTo("register")}
              >
                免费注册
              </button>
            </>
          )}
        </p>

        {mode === "login" ? (
          <p className={styles.hint}>
            试用账号：xiaoming@example.com / weekend123
          </p>
        ) : null}

        {googleNotice ? (
          <div
            className={styles.noticeLayer}
            role="presentation"
            onMouseDown={() => setGoogleNotice(false)}
          >
            <div
              className={styles.noticeCard}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h3>暂未接入</h3>
              <p>Google 登录功能正在准备中，请先使用邮箱登录或注册。</p>
              <Button size="small" onClick={() => setGoogleNotice(false)}>
                知道了
              </Button>
            </div>
          </div>
        ) : null}

        {meituanNotice ? (
          <div
            className={styles.noticeLayer}
            role="presentation"
            onMouseDown={() => setMeituanNotice(false)}
          >
            <div
              className={styles.noticeCard}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h3>美团登录说明</h3>
              <p>
                美团登录授权需要在美团开放平台完成应用审核后获取
                AppKey。目前开发环境暂未配置，你可以先使用邮箱登录或游客体验。
              </p>
              <Button size="small" onClick={() => setMeituanNotice(false)}>
                知道了
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
