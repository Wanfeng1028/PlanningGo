import { useMemo, useState } from "react";
import { BottomTabs } from "./components/BottomTabs";
import { Modal } from "./components/Modal";
import { NavBar } from "./components/NavBar";
import { PageCoverage } from "./components/PageCoverage";
import { designHighlights, featureBlocks } from "./data/content";
import type { ModalKey, NavKey } from "./types";
import { CasesPage } from "./pages/CasesPage";
import { DevelopersPage } from "./pages/DevelopersPage";
import { FlowPage } from "./pages/FlowPage";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import styles from "./App.module.scss";

export function App() {
  const [active, setActive] = useState<NavKey>("home");
  const [modal, setModal] = useState<ModalKey | null>(null);

  const page = useMemo(() => {
    switch (active) {
      case "home":
        return <HomePage onNavigate={setActive} onOpenModal={setModal} />;
      case "features":
        return (
          <>
            <FlowPage
              blocks={featureBlocks}
              eyebrow="功能"
              title="把 43 页、28 页、100 页归并成一条完整任务流"
              intro="功能区不是孤立页面集合，而是从一句话输入、定位、规划、地图、预订、授权、执行、分享、What-if 到记忆沉淀的连续工作台。"
              onOpenModal={setModal}
            />
            <PageCoverage nav="features" />
          </>
        );
      case "cases":
        return <CasesPage />;
      case "design":
        return (
          <>
            <FlowPage
              blocks={designHighlights}
              eyebrow="设计亮点"
              title="设计系统也成为可浏览页面"
              intro="颜色字体、底图、组件、弹窗、状态、导航一致性和数据矩阵全部按最终导航组织。"
              onOpenModal={setModal}
            />
            <PageCoverage nav="design" />
          </>
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
      <NavBar active={active} onNavigate={setActive} onOpenModal={setModal} />
      <main className={`${styles.content} ${styles.page}`}>{page}</main>
      <footer className={styles.footer}>
        <span>周末有谱 · 本地生活规划 Agent</span>
        <span>React + Vite + TypeScript + SCSS Modules · No Tailwind CSS</span>
      </footer>
      <BottomTabs active={active} onNavigate={setActive} />
      <Modal modal={modal} onClose={() => setModal(null)} />
    </div>
  );
}
