import { useMemo, useState } from "react";
import { pageCoverageStats, pagesByNav } from "../data/pageCatalog";
import type { NavKey, PageSpec } from "../types";
import { Button } from "./Button";
import { SectionHeader } from "./SectionHeader";
import styles from "./PageCoverage.module.scss";

const modeText: Record<PageSpec["renderAs"], string> = {
  page: "页面",
  modal: "弹窗",
  drawer: "抽屉",
  sheet: "移动 Sheet",
  state: "状态视图",
};

interface PageCoverageProps {
  nav: NavKey;
}

export function PageCoverage({ nav }: PageCoverageProps) {
  const pages = useMemo(() => pagesByNav(nav), [nav]);
  const [selected, setSelected] = useState<PageSpec | null>(pages[0] ?? null);

  return (
    <section className={styles.coverage}>
      <SectionHeader
        eyebrow="完整页面覆盖"
        title="设计稿页面逐项落位"
        intro="这里列出当前导航下所有来自 43 页、28 页、最终 100 页和移动端 60 页的页面主题。每一项都能打开，确认它是页面、弹窗、抽屉、Sheet 还是状态视图。"
      />
      <div className={styles.toolbar}>
        <div className={styles.stats}>
          <span className={styles.stat}>总覆盖 {pageCoverageStats.total}</span>
          <span className={styles.stat}>最终桌面 {pageCoverageStats.finalDesktop}</span>
          <span className={styles.stat}>移动端 {pageCoverageStats.mobile}</span>
          <span className={styles.stat}>43 页 {pageCoverageStats.d43}</span>
          <span className={styles.stat}>28 页 {pageCoverageStats.i28}</span>
          <span className={styles.stat}>当前导航 {pages.length}</span>
        </div>
      </div>
      <div className={styles.grid}>
        {pages.map((page) => (
          <button className={styles.page} type="button" key={page.id} onClick={() => setSelected(page)}>
            <span className={styles.meta}>
              <span>{page.source}</span>
              <span>{page.platform === "desktop" ? "桌面" : "移动"} {page.number}</span>
            </span>
            <strong className={styles.title}>{page.title}</strong>
            <span className={styles.mode}>{modeText[page.renderAs]}</span>
          </button>
        ))}
      </div>
      {selected ? (
        <article className={styles.detail}>
          <div className={styles.detailTop}>
            <div>
              <span className={styles.stat}>
                {selected.source} / {selected.platform === "desktop" ? "桌面端" : "移动端"} / {selected.number}
              </span>
              <h3>{selected.title}</h3>
            </div>
            <Button variant="ghost" size="small" onClick={() => setSelected(null)}>
              收起
            </Button>
          </div>
          <p>{selected.summary}</p>
          <div className={styles.mock}>
            <div className={styles.panel}>
              <strong>设计稿来源</strong>
              <span>{selected.file}</span>
            </div>
            <div className={styles.panel}>
              <strong>实现方式</strong>
              <span>
                {modeText[selected.renderAs]}。桌面端遵循顶部六导航，移动端归入底部：首页、规划、地图、消息、我的。
              </span>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
