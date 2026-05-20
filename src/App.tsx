import { useState, useCallback } from "react";
import { AuthModal } from "./components/AuthModal";
import { BottomTabs } from "./components/BottomTabs";
import { ComingSoonModal } from "./components/ComingSoonModal";
import { Modal } from "./components/Modal";
import { NavBar } from "./components/NavBar";
import { PageTransition } from "./components/PageTransition";
import { setAuthToken, reverseGeocode } from "./lib/api";
import { requestBrowserLocation } from "./lib/location";
import type { ModalKey, NavKey, SessionUser } from "./types";
import { CasesPage } from "./pages/CasesPage";
import DevelopersPage from "./pages/DevelopersPage";
import FeaturesPage from "./pages/FeaturesPage";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import styles from "./App.module.scss";
import pageStyles from "./pages/Pages.module.scss";

type AuthModalKey = Extract<ModalKey, "login" | "register" | "guest">;

function isAuthModal(key: ModalKey | null): key is AuthModalKey {
  return key === "login" || key === "register" || key === "guest";
}

/** 城市优先级：手动选择 > 高德 > 用户画像 > fallback > 默认 */
const DEFAULT_CITY_LABEL = "选择城市";

export function App() {
  const [active, setActive] = useState<NavKey>("home");
  const [modal, setModal] = useState<ModalKey | null>(null);
  const [user, setUser] = useState<SessionUser | null>(() => {
    try {
      const stored = localStorage.getItem("pg_user");
      return stored ? (JSON.parse(stored) as SessionUser) : null;
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
  const locationState = {
    city: user?.city || DEFAULT_CITY_LABEL,
    locationLabel: user?.locationLabel || "",
    latitude: user?.latitude,
    longitude: user?.longitude,
    locationSource: user?.locationSource,
    needsConfirmation: locationConfirmCity !== null,
    pendingCity: locationConfirmCity,
    onConfirmCity: handleManualCity,
    onDismissConfirm: () => setLocationConfirmCity(null),
  };

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
          />
        );

      case "cases":
        return <CasesPage onOpenModal={openModal} onNavigate={setActive} />;

      case "developers":
        return <DevelopersPage onOpenModal={openModal} user={user} />;

      case "profile":
        if (!user) {
          // 未登录时弹出认证弹窗，不渲染 ProfileGatePage
          handleAuthRequiredNavigate("profile");
          return null;
        }
        return (
          <ProfilePage
            user={user}
            onOpenModal={openModal}
            onLogout={() => {
              setUser(null);
              setAuthToken(null);
              localStorage.removeItem("pg_user");
              setAuthRedirectTo(null);
            }}
          />
        );

      default:
        return null;
    }
  })();

  const isFeatureWorkspace = active === "features";

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
        {isFeatureWorkspace ? page : <PageTransition pageKey={active}>{page}</PageTransition>}
      </main>

      {!isFeatureWorkspace && (
        <footer className={styles.footer}>
          <span>周末有谱 · 本地生活规划 Agent</span>
          <span></span>
        </footer>
      )}

      {!isFeatureWorkspace && <BottomTabs active={active} onNavigate={handleAuthRequiredNavigate} user={user} onOpenModal={openModal} />}

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
