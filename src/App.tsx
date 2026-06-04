import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from "react";
import { AuthModal } from "./components/AuthModal";
import { BottomTabs } from "./components/BottomTabs";
import { ComingSoonModal } from "./components/ComingSoonModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Modal } from "./components/Modal";
import { NavBar } from "./components/NavBar";
import { PageTransition } from "./components/PageTransition";
import { setAuthToken, setRefreshToken, reverseGeocode } from "./lib/api";
import { requestBrowserLocation } from "./lib/location";
import type { ModalKey, NavKey, SessionUser } from "./types";

const CasesPage = lazy(() => import("./pages/CasesPage").then(m => ({ default: m.CasesPage })));
const DevelopersPage = lazy(() => import("./pages/DevelopersPage").then(m => ({ default: m.default })));
const FeaturesPage = lazy(() => import("./pages/FeaturesPage").then(m => ({ default: m.default })));
const HomePage = lazy(() => import("./pages/HomePage").then(m => ({ default: m.HomePage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then(m => ({ default: m.ProfilePage })));
const HandoffPage = lazy(() => import("./pages/HandoffPage").then(m => ({ default: m.HandoffPage })));
import styles from "./App.module.scss";
import pageStyles from "./pages/Pages.module.scss";

/** Extract handoff code from URL path: /handoff/:code */
function getHandoffCodeFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/handoff\/([A-Za-z0-9]+)$/);
  return match ? match[1] : null;
}

type AuthModalKey = Extract<ModalKey, "login" | "register" | "guest">;

function isAuthModal(key: ModalKey | null): key is AuthModalKey {
  return key === "login" || key === "register" || key === "guest";
}

/** 城市优先级：手动选择 > 高德 > 用户画像 > fallback > 默认 */
const DEFAULT_CITY_LABEL = "选择城市";

export function App() {
  // Check for handoff route: /handoff/:code
  const [handoffCode] = useState(() => getHandoffCodeFromUrl());

  const [active, setActive] = useState<NavKey>("home");
  // 移动端地图视图模式
  const [viewMode, setViewMode] = useState<"chat" | "map">("chat");
  const [modal, setModal] = useState<ModalKey | null>(null);
  const [user, setUser] = useState<SessionUser | null>(() => {
    try {
      const stored = localStorage.getItem("pg_user");
      if (!stored) return null;
      const parsed = JSON.parse(stored) as SessionUser;
      // Validate user ID is a proper UUID — stale localStorage data from
      // older code versions may contain non-UUID IDs (e.g. "demo_xiaoming")
      // which break DB queries (conversations.userId is UUID type)
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (parsed?.id && !uuidRe.test(parsed.id)) {
        console.warn(`[App] stale pg_user detected (id="${parsed.id}" is not UUID), clearing`);
        localStorage.removeItem("pg_user");
        localStorage.removeItem("pg_token");
        localStorage.removeItem("pg_refresh_token");
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [authRedirectTo, setAuthRedirectTo] = useState<NavKey | null>(null);
  const [pendingAfterAuth, setPendingAfterAuth] = useState<NavKey | null>(null);
  const [locationConfirmCity, setLocationConfirmCity] = useState<string | null>(null);

  const openModal = (key: ModalKey) => {
    if (isAuthModal(key) && active === "profile") {
      setAuthRedirectTo("profile");
    } else {
      setAuthRedirectTo(null);
    }
    if (isAuthModal(key)) {
      setPendingAfterAuth(null);
    }
    setModal(key);
  };

  const handleAuthRequiredNavigate = (key: NavKey) => {
    if (!user && key !== "home") {
      setPendingAfterAuth(key);
      setAuthRedirectTo(null);
      setModal("login");
    } else {
      if (key === "features") setViewMode("chat");
      setActive(key);
    }
  };

  const closeModal = () => {
    setModal(null);
    setAuthRedirectTo(null);
    setPendingAfterAuth(null);
  };

  const handleAuthSuccess = (nextUser: SessionUser, token?: string) => {
    setUser(nextUser);
    localStorage.setItem("pg_user", JSON.stringify(nextUser));
    if (token) setAuthToken(token);
    const redirect = pendingAfterAuth ?? authRedirectTo ?? "features";
    setActive(redirect);
    setAuthRedirectTo(null);
    setPendingAfterAuth(null);
  };

  /** 用户手动选择城市（最高优先级） */
  const handleManualCity = useCallback((city: string) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated: SessionUser = {
        ...prev,
        city,
        locationSource: "manual",
        locationLabel: city,
      };
      localStorage.setItem("pg_user", JSON.stringify(updated));
      return updated;
    });
    setLocationConfirmCity(null);
  }, []);

  const handleRequestLocation = useCallback(async () => {
    try {
      const pos = await requestBrowserLocation();
      try {
        const geo = await reverseGeocode(pos.latitude, pos.longitude);
        const label = geo.formattedAddress || `${geo.city}${geo.district}`;

        if (geo.needsConfirmation) {
          // fallback 模式：保存坐标但提示用户确认城市
          setUser((prev) => {
            if (!prev) return prev;
            const updated: SessionUser = {
              ...prev,
              latitude: pos.latitude,
              longitude: pos.longitude,
              locationSource: "browser",
              locationLabel: label,
              // 不覆盖 city，保持用户已有城市或"选择城市"
              city: prev.city || DEFAULT_CITY_LABEL,
            };
            localStorage.setItem("pg_user", JSON.stringify(updated));
            return updated;
          });
          setLocationConfirmCity(geo.city);
        } else {
          // 高德精确结果：直接使用
          setUser((prev) => {
            if (!prev) return prev;
            const updated: SessionUser = {
              ...prev,
              city: geo.city || prev.city,
              locationLabel: label,
              latitude: pos.latitude,
              longitude: pos.longitude,
              locationSource: "browser",
            };
            localStorage.setItem("pg_user", JSON.stringify(updated));
            return updated;
          });
          setLocationConfirmCity(null);
        }
      } catch {
        // 逆地理编码失败，仅保存坐标
        setUser((prev) => {
          if (!prev) return prev;
          const updated: SessionUser = {
            ...prev,
            locationLabel: `${pos.latitude.toFixed(3)}, ${pos.longitude.toFixed(3)}`,
            latitude: pos.latitude,
            longitude: pos.longitude,
            locationSource: "browser",
          };
          localStorage.setItem("pg_user", JSON.stringify(updated));
          return updated;
        });
      }
    } catch {
      // 定位失败
      setUser((prev) => {
        if (!prev) return prev;
        const updated: SessionUser = {
          ...prev,
          locationLabel: "定位暂时不可用，请手动选择城市",
        };
        localStorage.setItem("pg_user", JSON.stringify(updated));
        return updated;
      });
    }
  }, []);

  /** 统一的位置状态，传给子组件 */
  const locationState = useMemo(() => ({
    city: user?.city || DEFAULT_CITY_LABEL,
    locationLabel: user?.locationLabel || "",
    latitude: user?.latitude,
    longitude: user?.longitude,
    locationSource: user?.locationSource,
    needsConfirmation: locationConfirmCity !== null,
    pendingCity: locationConfirmCity,
    onConfirmCity: handleManualCity,
    onDismissConfirm: () => setLocationConfirmCity(null),
  }), [user?.city, user?.locationLabel, user?.latitude, user?.longitude, user?.locationSource, locationConfirmCity, handleManualCity]);

  const isFeatureWorkspace = active === "features";

  // 未登录访问 profile 时，延迟到 effect 阶段弹出认证弹窗（避免 render 期间 setState）
  useEffect(() => {
    if (active === "profile" && !user) {
      handleAuthRequiredNavigate("profile");
    }
  }, [active, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = (() => {
    switch (active) {
      case "home":
        return (
          <HomePage
            onNavigate={setActive}
            onOpenModal={openModal}
            user={user}
            onAuthRequiredNavigate={handleAuthRequiredNavigate}
          />
        );

      case "features":
        return (
          <FeaturesPage
            user={user}
            onOpenModal={openModal}
            onRequestLocation={handleRequestLocation}
            onNavigate={setActive}
            location={locationState}
            viewMode={viewMode}
            onSetViewMode={setViewMode}
          />
        );

      case "cases":
        return <CasesPage onOpenModal={openModal} onNavigate={setActive} />;

      case "developers":
        return <DevelopersPage onOpenModal={openModal} user={user} />;

      case "profile":
        if (!user) {
          return null;
        }
        return (
          <ProfilePage
            user={user}
            onOpenModal={openModal}
            onLogout={() => {
              setUser(null);
              setAuthToken(null);
              setRefreshToken(null);
              localStorage.removeItem("pg_user");
              setAuthRedirectTo(null);
            }}
          />
        );

      default:
        return null;
    }
  })();

  // Handoff route: render standalone page without nav/footer
  if (handoffCode) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", padding: "4rem 0", color: "#999", fontSize: "0.85rem" }}>加载中…</div>}>
          <HandoffPage code={handoffCode} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div
      className={`${styles.shell} ${isFeatureWorkspace ? styles.shellFull : ""}`}
    >
      {!isFeatureWorkspace && (
        <div className={pageStyles.floatingBubbles} aria-hidden="true">
          {Array.from({ length: 36 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
      )}

      {!isFeatureWorkspace && (
        <NavBar
          active={active}
          onNavigate={handleAuthRequiredNavigate}
          onOpenModal={openModal}
          user={user}
          onRequestLocation={handleRequestLocation}
          onLogout={() => {
            setUser(null);
            setAuthToken(null);
            localStorage.removeItem("pg_user");
            setAuthRedirectTo(null);
          }}
        />
      )}

      {/* 城市确认横幅：定位 fallback 时提示用户确认 */}
      {locationConfirmCity && !isFeatureWorkspace && (
        <div className={styles.locationBanner}>
          <span>已获取当前位置，但城市解析需要确认。推测城市：<strong>{locationConfirmCity}</strong></span>
          <button type="button" className={styles.bannerConfirmBtn} onClick={() => handleManualCity(locationConfirmCity)}>
            确认 {locationConfirmCity}
          </button>
          <button type="button" className={styles.bannerDismissBtn} onClick={() => setLocationConfirmCity(null)}>
            手动选择
          </button>
        </div>
      )}

      <main
        className={isFeatureWorkspace ? styles.workspaceMain : styles.pageMain}
      >
        <ErrorBoundary>
          <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", padding: "4rem 0", color: "#999", fontSize: "0.85rem" }}>加载中…</div>}>
            {isFeatureWorkspace ? page : <PageTransition pageKey={active}>{page}</PageTransition>}
          </Suspense>
        </ErrorBoundary>
      </main>

      {!isFeatureWorkspace && (
        <footer className={styles.footer}>
          <span>周末去哪儿 · 本地生活规划 Agent</span>
          <span></span>
        </footer>
      )}

      {!isFeatureWorkspace && (
        <BottomTabs
          active={active}
          onNavigate={handleAuthRequiredNavigate}
          user={user}
          onOpenModal={openModal}
          featureViewMode={viewMode}
          onMapTabClick={() => {
            setActive("features");
            setViewMode("map");
          }}
        />
      )}

      {isAuthModal(modal) ? (
        <AuthModal
          mode={modal}
          onClose={closeModal}
          onSuccess={handleAuthSuccess}
          onSwitchMode={setModal}
        />
      ) : modal === "developerComingSoon" ? (
        <ComingSoonModal onClose={closeModal} />
      ) : (
        <Modal
          modal={modal}
          onClose={closeModal}
          onPrimary={
            modal === "location"
              ? () => { handleRequestLocation(); closeModal(); }
              : modal === "privacy" || modal === "apiKey"
              ? () => { setActive("profile"); closeModal(); }
              : undefined
          }
          onSecondary={
            modal === "location"
              ? () => { setActive("profile"); closeModal(); }
              : modal === "privacy"
              ? () => { setActive("profile"); closeModal(); }
              : undefined
          }
        />
      )}
    </div>
  );
}
