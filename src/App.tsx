import { useMemo, useState } from "react";
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
import { ProfilePage } from "./pages/ProfilePage";
import styles from "./App.module.scss";
import pageStyles from "./pages/Pages.module.scss";

export function App() {
  const [active, setActive] = useState<NavKey>("home");
  const [modal, setModal] = useState<ModalKey | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  const page = useMemo(() => {
    switch (active) {
      case "home":
        return <HomePage onNavigate={setActive} onOpenModal={setModal} />;
      case "features":
        return <FeaturesPage onOpenModal={setModal} />;
      case "cases":
        return <CasesPage />;
      case "design":
        return (
          <FlowPage
            blocks={designHighlights}
            eyebrow="设计亮点"
            title="设计系统也成为可浏览页面"
            intro="颜色字体、底图、组件、弹窗、状态、导航一致性和数据矩阵全部按最终导航组织。"
            onOpenModal={setModal}
          />
        );
      case "developers":
        return <DevelopersPage onOpenModal={setModal} />;
      case "profile":
        return <ProfilePage onOpenModal={setModal} />;
      default:
        return null;
    }
  }, [active]);

  return (
    <div className={styles.shell}>
      <div className={pageStyles.floatingBubbles} aria-hidden="true">
        {Array.from({ length: 36 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <NavBar active={active} onNavigate={setActive} onOpenModal={setModal} user={user} onLogout={() => setUser(null)} />
      <main className={`${styles.content} ${styles.page}`}>{page}</main>
      <footer className={styles.footer}>
        <span>周末有谱 · 本地生活规划 Agent</span>
        <span></span>
      </footer>
      <BottomTabs active={active} onNavigate={setActive} />
      {modal === "login" || modal === "register" || modal === "guest" ? (
        <AuthModal
          mode={modal}
          onClose={() => setModal(null)}
          onSuccess={(nextUser) => {
            setUser(nextUser);
            setActive("features");
          }}
        />
      ) : (
        <Modal modal={modal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
