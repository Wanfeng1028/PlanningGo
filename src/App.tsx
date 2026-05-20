import { useState, useCallback } from "react";
import { AuthModal } from "./components/AuthModal";
import { BottomTabs } from "./components/BottomTabs";
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
import { ProfileGatePage } from "./pages/ProfileGatePage";
import { ProfilePage } from "./pages/ProfilePage";
import styles from "./App.module.scss";
import pageStyles from "./pages/Pages.module.scss";

type AuthModalKey = Extract<ModalKey, "login" | "register" | "guest">;

function isAuthModal(key: ModalKey | null): key is AuthModalKey {
  return key === "login" || key === "register" || key === "guest";
}

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

  const openModal = (key: ModalKey) => {
    if (isAuthModal(key) && active === "profile") {
      setAuthRedirectTo("profile");
    } else {
      setAuthRedirectTo(null);
    }

    // 手动打开弹窗时清除待定跳转，避免 NavBar 登录误触发首页按钮的 pending
    if (isAuthModal(key)) {
      setPendingAfterAuth(null);
    }

    setModal(key);
  };

  /** 需要登录才能进入的页面：未登录时开弹窗，已登录时直接跳转 */
  const handleAuthRequiredNavigate = (key: NavKey) => {
    if (!user) {
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

  const handleRequestLocation = useCallback(async () => {
    try {
      const pos = await requestBrowserLocation();
      try {
        const geo = await reverseGeocode(pos.latitude, pos.longitude);
        const label = geo.formattedAddress || `${geo.city}${geo.district}`;
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
      // 定位失败，静默处理
    }
  }, []);

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
          />
        );

      case "cases":
        return <CasesPage onOpenModal={openModal} onNavigate={setActive} />;

      case "developers":
        return <DevelopersPage onOpenModal={openModal} user={user} />;

      case "profile":
        return user ? (
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
        ) : (
          <ProfileGatePage onNavigate={setActive} onOpenModal={openModal} />
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
          onNavigate={setActive}
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

      <main
        className={isFeatureWorkspace ? styles.workspaceMain : styles.pageMain}
      >
        <PageTransition pageKey={active}>{page}</PageTransition>
      </main>

      {!isFeatureWorkspace && (
        <footer className={styles.footer}>
          <span>周末有谱 · 本地生活规划 Agent</span>
          <span></span>
        </footer>
      )}

      {!isFeatureWorkspace && <BottomTabs active={active} onNavigate={setActive} />}

      {isAuthModal(modal) ? (
        <AuthModal
          mode={modal}
          onClose={closeModal}
          onSuccess={handleAuthSuccess}
          onSwitchMode={setModal}
        />
      ) : (
        <Modal modal={modal} onClose={closeModal} />
      )}
    </div>
  );
}
