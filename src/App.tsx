import { useState } from "react";
import { AuthModal } from "./components/AuthModal";
import { BottomTabs } from "./components/BottomTabs";
import { Modal } from "./components/Modal";
import { NavBar } from "./components/NavBar";
import { designHighlights } from "./data/content";
import type { ModalKey, NavKey, SessionUser } from "./types";
import { CasesPage } from "./pages/CasesPage";
import { DevelopersPage } from "./pages/DevelopersPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { FlowPage } from "./pages/FlowPage";
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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authRedirectTo, setAuthRedirectTo] = useState<NavKey | null>(null);

  const openModal = (key: ModalKey) => {
    if (isAuthModal(key) && active === "profile") {
      setAuthRedirectTo("profile");
    } else {
      setAuthRedirectTo(null);
    }

    setModal(key);
  };

  const closeModal = () => {
    setModal(null);
    setAuthRedirectTo(null);
  };

  const handleAuthSuccess = (nextUser: SessionUser) => {
    setUser(nextUser);
    setActive(authRedirectTo ?? "features");
    setAuthRedirectTo(null);
  };

  const page = (() => {
    switch (active) {
      case "home":
        return <HomePage onNavigate={setActive} onOpenModal={openModal} />;

      case "features":
        return <FeaturesPage onOpenModal={openModal} />;

      case "cases":
        return <CasesPage />;

      case "design":
        return (
          <FlowPage
            blocks={designHighlights}
            eyebrow="设计亮点"
            title="设计系统也成为可浏览页面"
            intro="颜色字体、底图、组件、弹窗、状态、导航一致性和数据矩阵全部按最终导航组织。"
            onOpenModal={openModal}
          />
        );

      case "developers":
        return <DevelopersPage onOpenModal={openModal} />;

      case "profile":
        return user ? (
          <ProfilePage onOpenModal={openModal} />
        ) : (
          <ProfileGatePage onNavigate={setActive} onOpenModal={openModal} />
        );

      default:
        return null;
    }
  })();

  return (
    <div className={styles.shell}>
      <div className={pageStyles.floatingBubbles} aria-hidden="true">
        {Array.from({ length: 36 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>

      <NavBar
        active={active}
        onNavigate={setActive}
        onOpenModal={openModal}
        user={user}
        onLogout={() => {
          setUser(null);
          setAuthRedirectTo(null);
        }}
      />

      <main className={`${styles.content} ${styles.page}`}>{page}</main>

      <footer className={styles.footer}>
        <span>周末有谱 · 本地生活规划 Agent</span>
        <span></span>
      </footer>

      <BottomTabs active={active} onNavigate={setActive} />

      {isAuthModal(modal) ? (
        <AuthModal mode={modal} onClose={closeModal} onSuccess={handleAuthSuccess} />
      ) : (
        <Modal modal={modal} onClose={closeModal} />
      )}
    </div>
  );
}
