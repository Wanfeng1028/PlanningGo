import { pageCatalog } from "../data/pageCatalog";
import type { PageSpec } from "../types";
import styles from "./DesignPage.module.scss";

interface DesignPageProps {
  pageId: string;
}

const renderText: Record<PageSpec["renderAs"], string> = {
  page: "完整页面",
  modal: "弹窗",
  drawer: "抽屉面板",
  sheet: "移动端底部 Sheet",
  state: "状态视图",
};

export function DesignPage({ pageId }: DesignPageProps) {
  const page = pageCatalog.find((item) => item.id === pageId);

  if (!page) {
    return (
      <main className={styles.page}>
        <section className={styles.copy}>
          <span className={styles.eyebrow}>未找到页面</span>
          <h1 className={styles.title}>{pageId}</h1>
          <p className={styles.summary}>页面注册表中没有找到这个设计稿页面。</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>
            {page.source} / {page.platform === "desktop" ? "桌面端" : "移动端"} / {renderText[page.renderAs]}
          </span>
          <h1 className={styles.title}>{page.title}</h1>
          <p className={styles.summary}>{page.summary}</p>
          <div className={styles.meta}>
            <span className={styles.metaItem}>
              <span>导航归属</span>
              <strong>{page.nav}</strong>
            </span>
            <span className={styles.metaItem}>
              <span>设计稿编号</span>
              <strong>{page.number}</strong>
            </span>
            <span className={styles.metaItem}>
              <span>实现形态</span>
              <strong>{renderText[page.renderAs]}</strong>
            </span>
            <span className={styles.metaItem}>
              <span>源文件</span>
              <strong>{page.file}</strong>
            </span>
          </div>
        </div>
        <div className={styles.preview} aria-label={`${page.title} 页面预览`}>
          <div className={styles.browser}>
            <div className={styles.browserTop}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            <div className={styles.mockBody}>
              <span className={styles.mockBlock} />
              <span className={styles.mockBlock} />
            </div>
          </div>
        </div>
      </section>
      <section className={styles.panel}>
        <h3>页面实现说明</h3>
        <ul className={styles.list}>
          <li>
            <strong>视觉</strong>
            继承暖米白底、黄色强调、黑色粗体、白色卡片和柔和投影。
          </li>
          <li>
            <strong>布局</strong>
            桌面端归入六个主导航，移动端归入底部五项导航。
          </li>
          <li>
            <strong>行为</strong>
            根据设计稿主题呈现为页面、弹窗、抽屉、Sheet 或状态视图。
          </li>
        </ul>
      </section>
    </main>
  );
}
